import { describe, expect, it } from 'vitest';
import type { TablaLeida } from '../../compartido/tabla';
import { tablaEn, type Celda } from './edicionTabla';
import { celdaTras, opcionesDeCelda, operacionDe, preguntaAntesDe, type AccionDeTabla } from './menuTabla';

const R = String.raw;
const T = R`\begin{tabular}{lc}
  Sitio & Documentos \\
  Foro &  \\
\end{tabular}`;
const { interior, tabla } = tablaEn(T, 0)!;
const habilitadas = (t: TablaLeida, celda: Celda) => opcionesDeCelda(t, celda).filter((o) => o.habilitada).map((o) => o.accion);
const aplicar = (accion: AccionDeTabla, celda: Celda) => {
  const e = operacionDe(accion, celda)(T, interior)!;
  return [...e.cambios].sort((a, b) => b.desde - a.desde).reduce((t, c) => t.slice(0, c.desde) + c.insertar + t.slice(c.hasta), T);
};

describe('menú de celda', () => {
  it('las nueve opciones, en orden y con su texto', () => {
    expect(opcionesDeCelda(tabla, { fila: 0, columna: 0 }).map((o) => o.texto)).toEqual([
      'Insertar fila arriba', 'Insertar fila abajo', 'Insertar columna a la izquierda', 'Insertar columna a la derecha',
      'Borrar fila', 'Borrar columna', 'Alinear a la izquierda', 'Centrar', 'Alinear a la derecha',
    ]);
  });

  it('no ofrece la alineación que la columna ya tiene', () => {
    expect(habilitadas(tabla, { fila: 0, columna: 0 })).not.toContain('alinear-l');
    expect(habilitadas(tabla, { fila: 0, columna: 1 })).toEqual(expect.arrayContaining(['alinear-l', 'alinear-r']));
    expect(habilitadas(tabla, { fila: 0, columna: 1 })).not.toContain('alinear-c');
  });

  it('no deja borrar la única fila ni la única columna, ni alinear una columna de ancho fijo', () => {
    const unica = tablaEn(R`\begin{tabular}{p{3cm}} a \\\end{tabular}`, 0)!.tabla;
    const opciones = opcionesDeCelda(unica, { fila: 0, columna: 0 });
    expect(opciones.filter((o) => !o.habilitada).map((o) => [o.accion, o.ayuda])).toEqual([
      ['borrar-fila', 'Es la única fila.'], ['borrar-columna', 'Es la única columna.'],
      ['alinear-l', 'Esta columna tiene ancho fijo: cambiala desde Ver código.'],
      ['alinear-c', 'Esta columna tiene ancho fijo: cambiala desde Ver código.'],
      ['alinear-r', 'Esta columna tiene ancho fijo: cambiala desde Ver código.'],
    ]);
  });

  it('cada acción es su operación', () => {
    expect(aplicar('fila-abajo', { fila: 0, columna: 0 })).toBe(T.replace(`${R`Documentos \\`}\n`, () => `${R`Documentos \\`}\n${R`   &  \\`}\n`));
    expect(aplicar('fila-arriba', { fila: 1, columna: 0 })).toBe(T.replace(R`  Foro`, () => `${R`   &  \\`}\n  Foro`));
    expect(aplicar('borrar-fila', { fila: 1, columna: 0 })).toBe(T.replace(`${R`  Foro &  \\`}\n`, ''));
    expect(aplicar('columna-derecha', { fila: 0, columna: 1 })).toContain('{lcc}');
    expect(aplicar('columna-izquierda', { fila: 0, columna: 0 })).toContain('{llc}');
    expect(aplicar('borrar-columna', { fila: 0, columna: 1 })).toContain('{l}');
    expect(aplicar('alinear-r', { fila: 1, columna: 1 })).toContain('{lr}');
    expect(aplicar('alinear-c', { fila: 1, columna: 0 })).toContain('{cc}');
  });

  it('pregunta antes de borrar solo si hay contenido', () => {
    expect(preguntaAntesDe(T, tabla, 'borrar-fila', { fila: 0, columna: 0 })).toBe('¿Borrar esta fila? Tiene contenido.');
    expect(preguntaAntesDe(T, tabla, 'borrar-columna', { fila: 1, columna: 1 })).toBe('¿Borrar esta columna? Tiene contenido.');
    const vacia = R`\begin{tabular}{ll} a &  \\  &  \\ \end{tabular}`;
    const leida = tablaEn(vacia, 0)!.tabla;
    expect(preguntaAntesDe(vacia, leida, 'borrar-fila', { fila: 1, columna: 0 })).toBeNull();
    expect(preguntaAntesDe(vacia, leida, 'borrar-columna', { fila: 0, columna: 1 })).toBeNull();
    expect(preguntaAntesDe(T, tabla, 'fila-abajo', { fila: 0, columna: 0 })).toBeNull();
  });

  it.each([
    ['fila-arriba', { fila: 1, columna: 1 }], ['fila-abajo', { fila: 2, columna: 1 }], ['columna-izquierda', { fila: 1, columna: 1 }],
    ['columna-derecha', { fila: 1, columna: 2 }], ['borrar-fila', null], ['borrar-columna', null], ['alinear-c', null],
  ] as const)('después de %s queda abierta %j', (accion, esperada) => {
    expect(celdaTras(accion, { fila: 1, columna: 1 })).toEqual(esperada);
  });
});
