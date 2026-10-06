import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchivoLeido, ResultadoEscritura } from '../compartido/tipos';
import { crearSesion, type Eleccion, type EstadoGuardado, type Sesion } from './sesion';

// Un "disco" en memoria con el mismo contrato que el API del servidor.
let disco: Map<string, { contenido: string; version: number; fiel: boolean }>;
let escrituras: { ruta: string; contenido: string; versionBase: string; forzar?: boolean }[];
let lecturas: string[];
let fallaAlEscribir: boolean;
let alEscribir: (() => Promise<void>) | null;

const leido = (ruta: string): ArchivoLeido => {
  const a = disco.get(ruta);
  if (!a) throw Object.assign(new Error('El archivo no existe.'), { estado: 404 });
  return { contenido: a.contenido, finDeLinea: '\r\n', bom: false, version: `v${a.version}`, fiel: a.fiel };
};

const api = {
  async leer(ruta: string): Promise<ArchivoLeido> {
    lecturas.push(ruta);
    return leido(ruta);
  },
  async escribir(ruta: string, datos: { contenido: string; versionBase: string; forzar?: boolean }): Promise<ResultadoEscritura> {
    if (alEscribir) await alEscribir();
    if (fallaAlEscribir) throw new Error('No se pudo conectar con el editor.');
    escrituras.push({ ruta, contenido: datos.contenido, versionBase: datos.versionBase, forzar: datos.forzar });
    const a = disco.get(ruta);
    if (!a) return { tipo: 'desaparecido' };
    if (!datos.forzar && `v${a.version}` !== datos.versionBase) return { tipo: 'cambio-en-disco', actual: leido(ruta) };
    a.contenido = datos.contenido;
    a.version++;
    return { tipo: 'ok', version: `v${a.version}` };
  },
};

// El documento del editor, reducido a lo que la sesión necesita.
let texto: string;
let soloLectura: boolean;
let cargas: { texto: string; archivoNuevo: boolean }[];
const doc = {
  texto: () => texto,
  cargar(nuevo: string, o: { archivoNuevo: boolean }) { texto = nuevo; cargas.push({ texto: nuevo, archivoNuevo: o.archivoNuevo }); },
  soloLectura(si: boolean) { soloLectura = si; },
};

let estados: [EstadoGuardado, string | undefined][];
let eleccion: Eleccion;
let preguntas: number;
let desaparecidos: string[];
let sesion: Sesion;

const ultimoEstado = () => estados.at(-1)?.[0];
const externo = (ruta: string, contenido: string) => { const a = disco.get(ruta)!; a.contenido = contenido; a.version++; };
function escribirEnEditor(nuevo: string): void {
  texto = nuevo;
  sesion.alEditar();
}

beforeEach(() => {
  vi.useFakeTimers();
  disco = new Map([
    ['Cap1.tex', { contenido: 'uno', version: 1, fiel: true }],
    ['Cap2.tex', { contenido: 'dos', version: 1, fiel: true }],
    ['raro.bib', { contenido: 'a�o', version: 1, fiel: false }],
  ]);
  escrituras = []; lecturas = []; fallaAlEscribir = false; alEscribir = null;
  texto = ''; soloLectura = false; cargas = [];
  estados = []; eleccion = 'recargar'; preguntas = 0; desaparecidos = [];
  sesion = crearSesion(doc, api, {
    alAbrir: () => undefined,
    alCambiarEstado: (e, detalle) => { estados.push([e, detalle]); },
    preguntarConflicto: async () => { preguntas++; return eleccion; },
    alDesaparecer: (ruta) => { desaparecidos.push(ruta); },
  });
});
afterEach(() => { vi.useRealTimers(); });

describe('abrir y guardar', () => {
  it('abrir carga el texto del disco y queda guardado', async () => {
    await sesion.abrir('Cap1.tex');
    expect(cargas).toEqual([{ texto: 'uno', archivoNuevo: true }]);
    expect(sesion.rutaAbierta()).toBe('Cap1.tex');
    expect(ultimoEstado()).toBe('guardado');
    expect(sesion.hayCambiosSinGuardar()).toBe(false);
  });

  it('guarda un segundo después de la última edición, no antes', async () => {
    await sesion.abrir('Cap1.tex');
    escribirEnEditor('uno!');
    expect(ultimoEstado()).toBe('sin-guardar');
    await vi.advanceTimersByTimeAsync(600);
    escribirEnEditor('uno!!');
    await vi.advanceTimersByTimeAsync(999);
    expect(escrituras).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(escrituras).toEqual([{ ruta: 'Cap1.tex', contenido: 'uno!!', versionBase: 'v1', forzar: undefined }]);
    expect(ultimoEstado()).toBe('guardado');
  });

  it('cada guardado parte de la versión que dejó el anterior', async () => {
    await sesion.abrir('Cap1.tex');
    escribirEnEditor('a'); await sesion.guardarAhora();
    escribirEnEditor('b'); await sesion.guardarAhora();
    expect(escrituras.map((e) => e.versionBase)).toEqual(['v1', 'v2']);
    expect(disco.get('Cap1.tex')!.contenido).toBe('b');
  });

  it('sin ediciones no escribe nada', async () => {
    await sesion.abrir('Cap1.tex');
    await sesion.guardarAhora();
    await vi.advanceTimersByTimeAsync(5000);
    expect(escrituras).toEqual([]);
  });

  it('mientras un guardado está en vuelo, sigue habiendo cambios sin guardar', async () => {
    await sesion.abrir('Cap1.tex');
    let soltar = () => {};
    alEscribir = () => new Promise<void>((r) => { soltar = r; });
    escribirEnEditor('uno!');
    const guardado = sesion.guardarAhora();
    await vi.advanceTimersByTimeAsync(0);
    expect(sesion.hayCambiosSinGuardar()).toBe(true);
    soltar(); await guardado;
    expect(sesion.hayCambiosSinGuardar()).toBe(false);
  });

  it('al abrir otro archivo guarda primero el que estaba', async () => {
    await sesion.abrir('Cap1.tex');
    escribirEnEditor('uno!');
    await sesion.abrir('Cap2.tex');
    expect(disco.get('Cap1.tex')!.contenido).toBe('uno!');
    expect(texto).toBe('dos');
  });
});

describe('cuando guardar falla', () => {
  it('avisa con el motivo, conserva el texto y reintenta solo hasta lograrlo', async () => {
    await sesion.abrir('Cap1.tex');
    fallaAlEscribir = true;
    escribirEnEditor('uno!');
    await vi.advanceTimersByTimeAsync(1000);
    expect(estados.at(-1)).toEqual(['error', 'No se pudo conectar con el editor.']);
    expect(sesion.hayCambiosSinGuardar()).toBe(true);

    fallaAlEscribir = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(disco.get('Cap1.tex')!.contenido).toBe('uno!');
    expect(ultimoEstado()).toBe('guardado');
  });

  it('no deja cambiar de archivo: el texto sin guardar no se descarta', async () => {
    await sesion.abrir('Cap1.tex');
    fallaAlEscribir = true;
    escribirEnEditor('trabajo de una hora');
    await expect(sesion.abrir('Cap2.tex')).rejects.toThrow(/no se abrió/i);
    expect(sesion.rutaAbierta()).toBe('Cap1.tex');
    expect(texto).toBe('trabajo de una hora');
    expect(sesion.hayCambiosSinGuardar()).toBe(true);
  });
});

describe('el archivo cambió en disco', () => {
  it('sin cambios pendientes, recargar trae lo del disco sin preguntar', async () => {
    await sesion.abrir('Cap1.tex');
    externo('Cap1.tex', 'uno, más lo del compañero');
    await sesion.recargar();
    expect(preguntas).toBe(0);
    expect(cargas.at(-1)).toEqual({ texto: 'uno, más lo del compañero', archivoNuevo: false });
    expect(ultimoEstado()).toBe('guardado');
  });

  it('si el disco no cambió, recargar no toca el documento', async () => {
    await sesion.abrir('Cap1.tex');
    await sesion.recargar();
    expect(cargas).toHaveLength(1);
  });

  it.each([
    ['recargar', 'del disco', 'del disco', false],
    ['sobrescribir', 'mío', 'mío', false],
    ['despues', 'mío', 'del disco', true],
  ] as const)('con cambios pendientes, al guardar pregunta; "%s"', async (elegido, enEditor, enDisco, quedaSucio) => {
    await sesion.abrir('Cap1.tex');
    externo('Cap1.tex', 'del disco');
    eleccion = elegido;
    escribirEnEditor('mío');
    await sesion.guardarAhora();
    expect(preguntas).toBe(1);
    expect(texto).toBe(enEditor);
    expect(disco.get('Cap1.tex')!.contenido).toBe(enDisco);
    expect(sesion.hayCambiosSinGuardar()).toBe(quedaSucio);
  });

  it('"después" no insiste solo: vuelve a preguntar recién con la próxima edición', async () => {
    await sesion.abrir('Cap1.tex');
    externo('Cap1.tex', 'del disco');
    eleccion = 'despues';
    escribirEnEditor('mío');
    await sesion.guardarAhora();
    await vi.advanceTimersByTimeAsync(30000);
    expect(preguntas).toBe(1);
    escribirEnEditor('mío!');
    await vi.advanceTimersByTimeAsync(1000);
    expect(preguntas).toBe(2);
  });

  it('con cambios pendientes, recargar también pregunta y "después" no toca nada', async () => {
    await sesion.abrir('Cap1.tex');
    escribirEnEditor('mío');
    externo('Cap1.tex', 'del disco');
    eleccion = 'despues';
    await sesion.recargar();
    expect(preguntas).toBe(1);
    expect(texto).toBe('mío');
    expect(disco.get('Cap1.tex')!.contenido).toBe('del disco');
  });

  // Una recarga que se cruza con un guardado en vuelo no debe reemplazar el texto sin preguntar.
  it('recargar espera a que termine el guardado en curso', async () => {
    await sesion.abrir('Cap1.tex');
    let soltar = () => {};
    alEscribir = () => new Promise<void>((r) => { soltar = r; });
    escribirEnEditor('mío');
    const guardado = sesion.guardarAhora();
    await vi.advanceTimersByTimeAsync(0);
    lecturas = [];
    const recarga = sesion.recargar();
    await vi.advanceTimersByTimeAsync(0);
    expect(lecturas).toEqual([]);
    alEscribir = null; soltar();
    await Promise.all([guardado, recarga]);
    expect(lecturas).toEqual(['Cap1.tex']);
    expect(texto).toBe('mío');
    expect(preguntas).toBe(0);
  });
});

describe('congelar durante Traer y Enviar', () => {
  it('guarda lo pendiente, deja el documento en solo lectura y avisa que quedó todo guardado', async () => {
    await sesion.abrir('Cap1.tex');
    escribirEnEditor('uno!');
    expect(await sesion.congelar()).toBe(true);
    expect(soloLectura).toBe(true);
    expect(disco.get('Cap1.tex')!.contenido).toBe('uno!');
    await vi.advanceTimersByTimeAsync(5000);
    expect(escrituras).toHaveLength(1);
    sesion.descongelar();
    expect(soloLectura).toBe(false);
  });

  it('si no se puede guardar, lo informa: no hay que sincronizar con cambios en el aire', async () => {
    await sesion.abrir('Cap1.tex');
    fallaAlEscribir = true;
    escribirEnEditor('uno!');
    expect(await sesion.congelar()).toBe(false);
  });

  // Con una combinación en conflicto el archivo en disco tiene marcas de Git: escribir encima las borraría.
  it('congelada no escribe, ni por el temporizador ni a pedido', async () => {
    await sesion.abrir('Cap1.tex');
    fallaAlEscribir = true;
    escribirEnEditor('uno!');
    await sesion.congelar();
    fallaAlEscribir = false;
    await vi.advanceTimersByTimeAsync(60000);
    await sesion.guardarAhora();
    expect(escrituras).toEqual([]);
    expect(disco.get('Cap1.tex')!.contenido).toBe('uno');

    sesion.descongelar();
    await vi.advanceTimersByTimeAsync(1000);
    expect(disco.get('Cap1.tex')!.contenido).toBe('uno!');
  });
});

describe('archivos que no se pueden guardar', () => {
  it('si el archivo fue borrado, deja de guardar, queda en solo lectura y avisa', async () => {
    await sesion.abrir('Cap1.tex');
    disco.delete('Cap1.tex');
    escribirEnEditor('sigo escribiendo');
    await sesion.guardarAhora();
    expect(desaparecidos).toEqual(['Cap1.tex']);
    expect(soloLectura).toBe(true);
    expect(texto).toBe('sigo escribiendo');
    escribirEnEditor('más');
    await vi.advanceTimersByTimeAsync(10000);
    expect(escrituras).toHaveLength(1);
    await sesion.abrir('Cap2.tex');
    expect(soloLectura).toBe(false);
  });

  it('recargar un archivo que ya no existe también lo avisa', async () => {
    await sesion.abrir('Cap1.tex');
    disco.delete('Cap1.tex');
    await sesion.recargar();
    expect(desaparecidos).toEqual(['Cap1.tex']);
  });

  it('un archivo que no se puede reproducir con fidelidad se abre en solo lectura y nunca se escribe', async () => {
    await sesion.abrir('raro.bib');
    expect(soloLectura).toBe(true);
    escribirEnEditor('cualquier cosa');
    await vi.advanceTimersByTimeAsync(10000);
    await sesion.guardarAhora();
    expect(escrituras).toEqual([]);
    await sesion.abrir('Cap1.tex');
    expect(soloLectura).toBe(false);
  });
});
