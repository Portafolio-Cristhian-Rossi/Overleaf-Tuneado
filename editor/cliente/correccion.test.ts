import { describe, expect, it, vi } from 'vitest';
import type { Segmento } from '../compartido/prosa';
import type { Aviso } from '../compartido/tipos';
import { crearAprendizaje, crearRevisor, palabraAntesDe, tramoDeProsa } from './correccion';

describe('palabraAntesDe', () => {
  it.each([
    ['El analisis ', 11, { desde: 3, hasta: 11, palabra: 'analisis' }],
    ['análisis.', 8, { desde: 0, hasta: 8, palabra: 'análisis' }],
    ['(tambien)', 8, { desde: 1, hasta: 8, palabra: 'tambien' }],
    ['año ', 3, { desde: 0, hasta: 3, palabra: 'año' }],
  ])('%j en %i', (texto, posicion, esperado) => {
    expect(palabraAntesDe(texto, posicion)).toEqual(esperado);
  });

  it.each([
    ['un comando no es una palabra', '\\textbf ', 7],
    ['dos espacios seguidos', 'hola  ', 5],
    ['al inicio del texto', ' hola', 0],
    ['una palabra de dos letras', 'de ', 2],
    ['letras pegadas a un número', 'BM25x ', 5],
    ['parte de una clave con guion bajo', 'sec_metodo ', 10],
    ['parte de una clave con dos puntos', 'sec:metodo ', 10],
  ])('nada cuando es %s', (_caso, texto, posicion) => {
    expect(palabraAntesDe(texto, posicion)).toBeNull();
  });
});

describe('tramoDeProsa', () => {
  const segmentos: Segmento[] = [
    { tipo: 'texto', fuente: 'El ' }, { tipo: 'marca', fuente: '\\textbf' }, { tipo: 'marca', fuente: '{' },
    { tipo: 'texto', fuente: 'analisis' }, { tipo: 'marca', fuente: '}' }, { tipo: 'texto', fuente: ' de ' },
    { tipo: 'marca', fuente: '$x$', como: 'X' },
  ];
  const parrafo = { desde: 100, hasta: 126, segmentos };

  it('es prosa si el tramo cae entero en un segmento de texto', () => {
    expect(tramoDeProsa(parrafo, 100, 102)).toBe(true);      // "El"
    expect(tramoDeProsa(parrafo, 111, 119)).toBe(true);      // "analisis"
  });

  it('no lo es si toca una marca o sale del párrafo', () => {
    expect(tramoDeProsa(parrafo, 104, 110)).toBe(false);     // dentro de \textbf
    expect(tramoDeProsa(parrafo, 118, 121)).toBe(false);     // cruza la llave de cierre
    expect(tramoDeProsa(parrafo, 124, 126)).toBe(false);     // dentro de $x$
    expect(tramoDeProsa(parrafo, 90, 95)).toBe(false);
  });
});

describe('crearRevisor', () => {
  const aviso = (desde: number, hasta: number): Aviso => ({ desde, hasta, tipo: 'ortografia', regla: 'R', mensaje: 'm', sugerencias: [] });
  const texto = 'Uno malo.\n\nDos\nsigue malo.\n\n\\label{x}\n\nTres.';

  function conApi(responder: (parrafos: Segmento[][]) => Aviso[][] | Promise<Aviso[][]>) {
    const revisar = vi.fn(async (parrafos: Segmento[][]) => responder(parrafos));
    return { revisor: crearRevisor({ revisar }), revisar };
  }
  // Un aviso sobre la palabra "malo" de cada párrafo que la tenga.
  const marcarMalo = (parrafos: Segmento[][]) => parrafos.map((p) => {
    const i = p.map((s) => s.fuente).join('').indexOf('malo');
    return i === -1 ? [] : [aviso(i, i + 4)];
  });

  it('pide solo los párrafos con prosa y devuelve posiciones sobre el documento', async () => {
    const { revisor, revisar } = conApi(marcarMalo);
    const avisos = await revisor.revisarDocumento(texto);
    expect(revisar.mock.calls[0][0]).toHaveLength(3);
    expect(avisos.map((a) => texto.slice(a.desde, a.hasta))).toEqual(['malo', 'malo']);
    expect(avisos.map((a) => a.desde)).toEqual([4, 21]);
  });

  it('en la segunda pasada solo pide los párrafos que cambiaron', async () => {
    const { revisor, revisar } = conApi(marcarMalo);
    await revisor.revisarDocumento(texto);
    const editado = texto.replace('Tres.', 'Tres malo.');
    const avisos = await revisor.revisarDocumento(editado);
    expect(revisar).toHaveBeenCalledTimes(2);
    expect(revisar.mock.calls[1][0]).toHaveLength(1);
    expect(avisos.map((a) => editado.slice(a.desde, a.hasta))).toEqual(['malo', 'malo', 'malo']);
  });

  it('sin cambios no vuelve a pedir nada', async () => {
    const { revisor, revisar } = conApi(marcarMalo);
    await revisor.revisarDocumento(texto);
    await revisor.revisarDocumento(texto);
    expect(revisar).toHaveBeenCalledTimes(1);
  });

  it('olvidar hace que se pida todo de nuevo', async () => {
    const { revisor, revisar } = conApi(marcarMalo);
    await revisor.revisarDocumento(texto);
    revisor.olvidar();
    await revisor.revisarDocumento(texto);
    expect(revisar.mock.calls[1][0]).toHaveLength(3);
  });

  it('si el servidor falla devuelve sin avisos y no recuerda el fallo', async () => {
    let falla = true;
    const { revisor } = conApi((p) => { if (falla) throw new Error('caído'); return marcarMalo(p); });
    expect(await revisor.revisarDocumento(texto)).toEqual([]);
    expect(revisor.fallo()).toBe(true);
    falla = false;
    expect(await revisor.revisarDocumento(texto)).toHaveLength(2);
    expect(revisor.fallo()).toBe(false);
  });

  it('revisarParrafo devuelve los avisos de un párrafo y los deja recordados', async () => {
    const { revisor, revisar } = conApi(marcarMalo);
    const parrafo = { desde: 0, hasta: 9, segmentos: [{ tipo: 'texto' as const, fuente: 'Uno malo.' }] };
    expect(await revisor.revisarParrafo(parrafo)).toEqual([aviso(4, 8)]);
    await revisor.revisarDocumento('Uno malo.');
    expect(revisar).toHaveBeenCalledTimes(1);
  });
});

describe('crearAprendizaje', () => {
  it('a la segunda vez que se deshace la misma palabra, pide exceptuarla', () => {
    const a = crearAprendizaje();
    expect(a.deshecha('analisis')).toBe(false);
    expect(a.deshecha('Analisis')).toBe(true);
  });

  it('cuenta cada palabra por separado y avisa una sola vez', () => {
    const a = crearAprendizaje();
    expect(a.deshecha('metodo')).toBe(false);
    expect(a.deshecha('analisis')).toBe(false);
    expect(a.deshecha('metodo')).toBe(true);
    expect(a.deshecha('metodo')).toBe(false);
  });
});
