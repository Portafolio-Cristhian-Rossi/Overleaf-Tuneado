import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultadoCompilacion } from '../compartido/tipos';
import { crearCompilacion, type Canal, type Compilacion, type MensajeDePdf } from './compilacion';

const BIEN: ResultadoCompilacion = { tipo: 'ok', problemas: [], pdfActualizado: true };
const ESPERA = 500;

// Ventanas unidas como por un BroadcastChannel: lo que una envía llega a las demás, nunca a ella.
function red() {
  const oyentes: ((m: MensajeDePdf) => void)[][] = [];
  const enviados: MensajeDePdf[] = [];
  function canal(): Canal {
    const mios: ((m: MensajeDePdf) => void)[] = [];
    oyentes.push(mios);
    return {
      enviar(m) {
        enviados.push(m);
        for (const otros of oyentes) if (otros !== mios) for (const f of otros) f(m);
      },
      alRecibir(f) { mios.push(f); },
    };
  }
  return { canal, enviados, tipos: () => enviados.map((m) => m.tipo) };
}

// Una ventana: lo que mostró, y una compilación que termina cuando la prueba lo decide.
function ventana(canal: Canal, o: { editor: boolean }) {
  const pasos: string[] = [];
  const mostrados: ResultadoCompilacion[] = [];
  const fallos: string[] = [];
  let ocupada = false;
  let terminar: ((r: ResultadoCompilacion) => void) | null = null;
  let romper: ((e: Error) => void) | null = null;
  const compilacion: Compilacion = crearCompilacion({
    canal,
    pantalla: {
      ocupada(si) { ocupada = si; },
      mostrar(r) { mostrados.push(r); },
      fallar(mensaje) { fallos.push(mensaje); },
    },
    compilar: () => new Promise<ResultadoCompilacion>((resolver, rechazar) => {
      pasos.push('compilar');
      terminar = resolver;
      romper = rechazar;
    }),
    guardar: o.editor ? async () => { pasos.push('guardar'); } : undefined,
    esperaMs: ESPERA,
  });
  return {
    compilacion, pasos, mostrados, fallos,
    ocupada: () => ocupada,
    async terminar(r: ResultadoCompilacion = BIEN) { terminar!(r); await vi.advanceTimersByTimeAsync(0); },
    async romper(mensaje: string) { romper!(new Error(mensaje)); await vi.advanceTimersByTimeAsync(0); },
  };
}

const asentar = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('la ventana del editor', () => {
  it('guarda, compila, muestra el resultado y se lo pasa a las otras ventanas', async () => {
    const r = red();
    const editor = ventana(r.canal(), { editor: true });
    const pdf = ventana(r.canal(), { editor: false });

    void editor.compilacion.compilar();
    await asentar();
    expect(editor.pasos).toEqual(['guardar', 'compilar']);
    expect(editor.ocupada()).toBe(true);
    expect(pdf.ocupada()).toBe(true);

    await editor.terminar();
    expect(editor.mostrados).toEqual([BIEN]);
    expect(pdf.mostrados).toEqual([BIEN]);
    expect(editor.ocupada()).toBe(false);
    expect(pdf.ocupada()).toBe(false);
    expect(pdf.pasos).toEqual([]);
    expect(r.tipos()).toEqual(['compilando', 'resultado']);
  });

  it('no guarda cuando la compilación viene de un guardado', async () => {
    const editor = ventana(red().canal(), { editor: true });
    void editor.compilacion.compilar({ guardar: false });
    await asentar();
    expect(editor.pasos).toEqual(['compilar']);
  });

  it('no arranca otra compilación mientras hay una en curso', async () => {
    const editor = ventana(red().canal(), { editor: true });
    void editor.compilacion.compilar();
    await asentar();
    void editor.compilacion.compilar();
    await asentar();
    expect(editor.pasos).toEqual(['guardar', 'compilar']);
  });

  it('si la compilación falla lo dice en las dos ventanas y queda lista para otra', async () => {
    const r = red();
    const editor = ventana(r.canal(), { editor: true });
    const pdf = ventana(r.canal(), { editor: false });

    void editor.compilacion.compilar();
    await asentar();
    await editor.romper('No se pudo conectar con el editor.');
    expect(editor.fallos).toEqual(['No se pudo conectar con el editor.']);
    expect(pdf.fallos).toEqual(['No se pudo conectar con el editor.']);
    expect(editor.ocupada()).toBe(false);
    expect(pdf.ocupada()).toBe(false);

    void editor.compilacion.compilar();
    await asentar();
    expect(editor.pasos).toEqual(['guardar', 'compilar', 'guardar', 'compilar']);
  });

  it('si se cierra a mitad de una compilación, libera a las otras ventanas', async () => {
    const r = red();
    const editor = ventana(r.canal(), { editor: true });
    const pdf = ventana(r.canal(), { editor: false });

    editor.compilacion.soltar();
    expect(r.enviados).toEqual([]);

    void editor.compilacion.compilar();
    await asentar();
    editor.compilacion.soltar();
    expect(pdf.ocupada()).toBe(false);
    expect(pdf.fallos).toHaveLength(1);
  });
});

describe('la ventana del PDF', () => {
  it('le pide la compilación al editor, que guarda antes', async () => {
    const r = red();
    const editor = ventana(r.canal(), { editor: true });
    const pdf = ventana(r.canal(), { editor: false });

    void pdf.compilacion.compilar();
    await asentar();
    expect(pdf.pasos).toEqual([]);
    expect(editor.pasos).toEqual(['guardar', 'compilar']);
    expect(pdf.ocupada()).toBe(true);

    await vi.advanceTimersByTimeAsync(ESPERA * 2);
    expect(pdf.pasos).toEqual([]);

    await editor.terminar();
    expect(pdf.mostrados).toEqual([BIEN]);
    expect(pdf.ocupada()).toBe(false);
    expect(r.tipos()).toEqual(['pedir', 'compilando', 'resultado']);
  });

  it('si el editor ya estaba compilando, espera ese resultado', async () => {
    const r = red();
    const editor = ventana(r.canal(), { editor: true });
    void editor.compilacion.compilar();
    await asentar();

    // La ventana del PDF se abre después: no vio el aviso de que se estaba compilando.
    const pdf = ventana(r.canal(), { editor: false });
    void pdf.compilacion.compilar();
    await vi.advanceTimersByTimeAsync(ESPERA * 2);
    expect(pdf.pasos).toEqual([]);
    expect(editor.pasos).toEqual(['guardar', 'compilar']);

    await editor.terminar();
    expect(pdf.mostrados).toEqual([BIEN]);
    expect(pdf.ocupada()).toBe(false);
  });

  it('si no hay ningún editor abierto, compila ella lo que está guardado', async () => {
    const r = red();
    const pdf = ventana(r.canal(), { editor: false });
    const otra = ventana(r.canal(), { editor: false });

    void pdf.compilacion.compilar();
    await asentar();
    expect(pdf.pasos).toEqual([]);

    await vi.advanceTimersByTimeAsync(ESPERA);
    expect(pdf.pasos).toEqual(['compilar']);
    expect(otra.pasos).toEqual([]);

    await pdf.terminar();
    expect(pdf.mostrados).toEqual([BIEN]);
    expect(otra.mostrados).toEqual([BIEN]);
    expect(pdf.ocupada()).toBe(false);
  });
});

describe('una ventana recién abierta', () => {
  it('recibe lo último que se compiló', async () => {
    const r = red();
    const editor = ventana(r.canal(), { editor: true });
    void editor.compilacion.compilar();
    await asentar();
    const conErrores: ResultadoCompilacion = {
      tipo: 'con-errores', pdfActualizado: false,
      problemas: [{ gravedad: 'error', ruta: 'Cap2.tex', linea: 12, mensaje: 'Falta una llave', original: '! Missing }' }],
    };
    await editor.terminar(conErrores);

    const canal = r.canal();
    const pdf = ventana(canal, { editor: false });
    canal.enviar({ tipo: 'hola' });
    expect(pdf.mostrados).toEqual([conErrores]);
    expect(pdf.ocupada()).toBe(false);
  });

  it('si todavía no se compiló nada, no recibe nada', () => {
    const r = red();
    ventana(r.canal(), { editor: true });
    const canal = r.canal();
    const pdf = ventana(canal, { editor: false });
    canal.enviar({ tipo: 'hola' });
    expect(pdf.mostrados).toEqual([]);
    expect(r.tipos()).toEqual(['hola']);
  });

  it('se entera de que hay una compilación en curso', async () => {
    const r = red();
    const editor = ventana(r.canal(), { editor: true });
    void editor.compilacion.compilar();
    await asentar();

    const canal = r.canal();
    const pdf = ventana(canal, { editor: false });
    canal.enviar({ tipo: 'hola' });
    expect(pdf.ocupada()).toBe(true);

    await editor.terminar();
    expect(pdf.ocupada()).toBe(false);
  });
});
