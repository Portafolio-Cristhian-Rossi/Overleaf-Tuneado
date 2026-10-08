import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { editarCelda } from '../../compartido/tabla';
import { celdaVecina, salidaDeTabla, tablaEn, transaccionDeTabla, type Operacion } from './edicionTabla';

const R = String.raw;
const TABULAR = R`\begin{tabular}{ll}
  Sitio & Documentos \\
  Foro & 1200 \\
\end{tabular}`;
const FLOTANTE = `${R`\begin{table}`}\n${R`\caption{C}`}\n${TABULAR}\n${R`\end{table}`}`;
const T = `antes\n${FLOTANTE}\ndespués`;
const DESDE = T.indexOf(R`\begin{tabular}`);
const estadoCon = (doc: string, soloLectura = false) =>
  EditorState.create({ doc, extensions: [history(), EditorState.readOnly.of(soloLectura)] });
const celda = (fila: number, columna: number, escrito: string): Operacion => (texto, interior) => {
  const r = editarCelda(texto, interior, fila, columna, escrito);
  return r.tipo === 'ok' ? r.edicion : null;
};

describe('transaccionDeTabla', () => {
  it('aplica la operación sobre el tabular que empieza ahí', () => {
    const estado = estadoCon(T);
    const nuevo = estado.update(transaccionDeTabla(estado, DESDE, celda(0, 0, 'Página'))!).state;
    expect(nuevo.doc.toString()).toBe(T.replace('Sitio', 'Página'));
  });

  it.each([
    ['el editor está en solo lectura', estadoCon(T, true), DESDE, celda(0, 0, 'x')],
    ['ahí no empieza un tabular', estadoCon(T), DESDE + 1, celda(0, 0, 'x')],
    ['el tabular dejó de ser simple', estadoCon(T.replace('{ll}', '{@{}ll}')), DESDE, celda(0, 0, 'x')],
    ['la celda ya no existe', estadoCon(T), DESDE, celda(7, 0, 'x')],
    ['la operación no cambia nada', estadoCon(T), DESDE, celda(0, 0, 'Sitio')],
  ])('null si %s', (_nombre, estado, desde, operacion) => {
    expect(transaccionDeTabla(estado, desde, operacion)).toBeNull();
  });

  it('dos celdas editadas seguidas se deshacen de a una', () => {
    const inicial = estadoCon(T);
    const uno = inicial.update(transaccionDeTabla(inicial, DESDE, celda(0, 0, 'Página'))!).state;
    const dos = uno.update(transaccionDeTabla(uno, DESDE, celda(0, 1, 'Visitas'))!).state;
    let deshecho = dos;
    undo({ state: dos, dispatch: (tr) => { deshecho = tr.state; } });
    expect(deshecho.doc.toString()).toBe(uno.doc.toString());
  });

  it('no mueve la selección del editor', () => {
    const estado = EditorState.create({ doc: T, selection: { anchor: 2 } });
    expect(estado.update(transaccionDeTabla(estado, DESDE, celda(0, 0, 'Página'))!).state.selection.main.head).toBe(2);
  });
});

describe('tablaEn', () => {
  it('solo un tabular simple que empieza justo ahí', () => {
    expect(tablaEn(T, DESDE)?.tabla.filas).toHaveLength(2);
    expect(tablaEn(T, DESDE - 1)).toBeNull();
    expect(tablaEn(T, 0)).toBeNull();
    const combinada = R`\begin{tabular}{ll}\multicolumn{2}{c}{Total} \\\end{tabular}`;
    expect(tablaEn(combinada, 0)).toBeNull();
  });
});

describe('celdaVecina', () => {
  it.each([
    [{ fila: 0, columna: 0 }, 'siguiente', { fila: 0, columna: 1 }], [{ fila: 0, columna: 1 }, 'siguiente', { fila: 1, columna: 0 }],
    [{ fila: 1, columna: 1 }, 'siguiente', null], [{ fila: 1, columna: 0 }, 'anterior', { fila: 0, columna: 1 }],
    [{ fila: 0, columna: 0 }, 'anterior', null], [{ fila: 0, columna: 1 }, 'abajo', { fila: 1, columna: 1 }],
    [{ fila: 1, columna: 1 }, 'abajo', null],
  ] as const)('de %j hacia %s', (desde, hacia, esperada) => {
    expect(celdaVecina(2, 2, desde, hacia)).toEqual(esperada);
  });
});

describe('salidaDeTabla', () => {
  it('después del flotante, o del tabular si está suelto', () => {
    expect(salidaDeTabla(T, DESDE)).toBe(T.indexOf('después'));
    const suelto = `a\n${TABULAR}\nb`;
    expect(salidaDeTabla(suelto, 2)).toBe(suelto.length - 1);
  });

  it('null si ahí termina el archivo', () => {
    expect(salidaDeTabla(`a\n${TABULAR}`, 2)).toBeNull();
  });
});
