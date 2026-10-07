import { describe, expect, it, vi } from 'vitest';
import { crearSubida, esImagenAdmitida, evitarAbrirArchivosSoltados, type Subida } from './imagenes';

type Respuesta = Awaited<ReturnType<Subida['subir']>>;
const archivo = (nombre = 'a.png') => new File([new Uint8Array([1, 2, 3])], nombre);

function preparar(respuestas: (Respuesta | Error)[], eleccion?: string) {
  const subir = vi.fn(async (_nombre: string, _archivo: Blob): Promise<Respuesta> => {
    const r = respuestas.shift();
    if (r === undefined) throw new Error('subida inesperada');
    if (r instanceof Error) throw r;
    return r;
  });
  // Elige la opción cuyo texto empieza con `eleccion`.
  const preguntar = vi.fn(async (_mensaje: string, opciones: { texto: string; valor: unknown }[]) =>
    opciones.find((o) => o.texto.startsWith(eleccion ?? '¿?'))!.valor);
  const avisar = vi.fn();
  return { subir, preguntar, avisar, subida: crearSubida({ subir, preguntar: preguntar as unknown as Subida['preguntar'], avisar }) };
}

describe('crearSubida', () => {
  it('sube y devuelve la ruta, sin preguntar', async () => {
    const p = preparar([{ estado: 201, ruta: 'figs/a.png' }]);
    expect(await p.subida(archivo())).toBe('figs/a.png');
    expect(p.subir).toHaveBeenCalledWith('a.png', expect.any(File));
    expect(p.preguntar).not.toHaveBeenCalled();
    expect(p.avisar).not.toHaveBeenCalled();
  });

  it('nombre repetido: pregunta con las tres opciones, y Cancelar es la neutra', async () => {
    const p = preparar([{ estado: 409, ruta: 'figs/a.png', sugerido: 'a-2.png' }], 'Cancelar');
    expect(await p.subida(archivo())).toBeNull();
    expect(p.preguntar).toHaveBeenCalledTimes(1);
    const [mensaje, opciones] = p.preguntar.mock.calls[0] as unknown as [string, { texto: string; neutra?: boolean }[]];
    expect(mensaje).toBe('Ya hay una imagen llamada a.png en figs/.');
    expect(opciones.map((o) => o.texto)).toEqual(['Usar la que ya está', 'Guardar como a-2.png', 'Cancelar']);
    expect(opciones.map((o) => o.neutra === true)).toEqual([false, false, true]);
    expect(p.subir).toHaveBeenCalledTimes(1);
  });

  it('nombre repetido: usar la que ya está no vuelve a subir', async () => {
    const p = preparar([{ estado: 409, ruta: 'figs/a.png', sugerido: 'a-2.png' }], 'Usar');
    expect(await p.subida(archivo())).toBe('figs/a.png');
    expect(p.subir).toHaveBeenCalledTimes(1);
  });

  it('nombre repetido: guardar con el nombre sugerido vuelve a subir con ese nombre', async () => {
    const p = preparar([{ estado: 409, ruta: 'figs/a.png', sugerido: 'a-2.png' }, { estado: 201, ruta: 'figs/a-2.png' }], 'Guardar');
    expect(await p.subida(archivo())).toBe('figs/a-2.png');
    expect(p.subir.mock.calls.map((c) => c[0])).toEqual(['a.png', 'a-2.png']);
  });

  it('el nombre del mensaje es el que ya existe en el disco, no el que se arrastró', async () => {
    const p = preparar([{ estado: 409, ruta: 'figs/Mi-Grafico.png', sugerido: 'Mi-Grafico-2.png' }], 'Cancelar');
    await p.subida(archivo('Mi Gráfico.PNG'));
    expect(p.preguntar.mock.calls[0][0]).toBe('Ya hay una imagen llamada Mi-Grafico.png en figs/.');
  });

  it('si el nombre sugerido también se ocupó entretanto, avisa y no insiste', async () => {
    const p = preparar([
      { estado: 409, ruta: 'figs/a.png', sugerido: 'a-2.png' }, { estado: 409, ruta: 'figs/a-2.png', sugerido: 'a-3.png' },
    ], 'Guardar');
    expect(await p.subida(archivo())).toBeNull();
    expect(p.subir).toHaveBeenCalledTimes(2);
    expect(p.avisar).toHaveBeenCalledWith('No se pudo subir la imagen. Probá de nuevo.');
  });

  it.each([400, 413])('un rechazo del servidor (%i) se avisa con su motivo', async (estado) => {
    const p = preparar([{ estado, mensaje: 'El motivo.' }]);
    expect(await p.subida(archivo())).toBeNull();
    expect(p.avisar).toHaveBeenCalledWith('El motivo.');
  });

  it('una respuesta inesperada o sin conexión se avisa con un texto general', async () => {
    for (const respuesta of [{ estado: 500 }, { estado: 201 }, new Error('sin conexión')]) {
      const p = preparar([respuesta]);
      expect(await p.subida(archivo())).toBeNull();
      expect(p.avisar).toHaveBeenCalledWith('No se pudo subir la imagen. Probá de nuevo.');
    }
  });
});

// Un archivo soltado fuera del texto (el lateral, el PDF, los márgenes) haría que el navegador
// lo abriera en la pestaña, y el editor desaparecería.
describe('evitarAbrirArchivosSoltados', () => {
  function evento(tipo: string, tipos: string[]) {
    const e = new Event(tipo, { cancelable: true });
    Object.assign(e, { dataTransfer: { types: tipos, dropEffect: 'copy' } });
    return e as Event & { dataTransfer: { types: string[]; dropEffect: string } };
  }

  it.each(['dragover', 'drop'])('cancela %s cuando lo arrastrado son archivos', (tipo) => {
    const destino = new EventTarget();
    evitarAbrirArchivosSoltados(destino);
    const e = evento(tipo, ['Files']);
    destino.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('fuera del editor, el cursor indica que ahí no se puede soltar', () => {
    const destino = new EventTarget();
    evitarAbrirArchivosSoltados(destino);
    const e = evento('dragover', ['Files']);
    destino.dispatchEvent(e);
    expect(e.dataTransfer.dropEffect).toBe('none');
  });

  it('si el editor ya aceptó el arrastre, no le cambia el cursor', () => {
    const destino = new EventTarget();
    evitarAbrirArchivosSoltados(destino);
    const e = evento('dragover', ['Files']);
    e.preventDefault();
    destino.dispatchEvent(e);
    expect(e.dataTransfer.dropEffect).toBe('copy');
  });

  it('no toca el arrastre de texto', () => {
    const destino = new EventTarget();
    evitarAbrirArchivosSoltados(destino);
    for (const tipo of ['dragover', 'drop']) {
      const e = evento(tipo, ['text/plain']);
      destino.dispatchEvent(e);
      expect(e.defaultPrevented, tipo).toBe(false);
    }
  });
});

describe('esImagenAdmitida', () => {
  it.each([
    ['a.png', true], ['a.PNG', true], ['foto.jpg', true], ['foto.jpeg', true], ['grafico.pdf', true],
    ['nota.txt', false], ['foto.heic', false], ['foto.webp', false], ['sin-extension', false], ['', false],
  ])('%j → %s', (nombre, esperado) => {
    expect(esImagenAdmitida(nombre)).toBe(esperado);
  });
});
