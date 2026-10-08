import { describe, expect, it } from 'vitest';
import { leerFixture } from '../pruebas/ayudas/temporales';
import { analizar, type Rango } from './analizador';
import {
  agregarColumna, agregarFila, alinearColumna, analizarTabla, borrarColumna, borrarFila, editarCelda, MOTIVOS, type TablaLeida,
} from './tabla';
import type { Edicion } from './tipos';

const R = String.raw;

const interiores = (t: string): Rango[] =>
  analizar(t).flatMap((e) => (e.tipo === 'entorno' && e.nombre === 'tabular' ? [e.interior] : []));
const leer = (t: string) => analizarTabla(t, interiores(t)[0]);
const leida = (t: string) => leer(t) as TablaLeida;
const celdas = (t: string) => leida(t).filas.map((f) => f.celdas.map((c) => t.slice(c.contenido.desde, c.contenido.hasta)));
// Un tabular con ese cuerpo y esa especificación de columnas.
const con = (cuerpo: string, spec = 'll') => `${R`\begin{tabular}`}{${spec}}\n${cuerpo}\n${R`\end{tabular}`}`;

const PLANTILLA = R`\begin{tabular}{ll}
    \toprule
    Sitio & Documentos \\
    \midrule
    Foro & 1200 \\
    \bottomrule
  \end{tabular}`;

describe('analizarTabla', () => {
  it('la tabla de la plantilla es simple', () => {
    const t = leida(PLANTILLA);
    expect(t.clase).toBe('simple');
    expect(t.columnas.map((c) => [c.alineacion, PLANTILLA.slice(c.spec.desde, c.spec.hasta)])).toEqual([['l', 'l'], ['l', 'l']]);
    expect(celdas(PLANTILLA)).toEqual([['Sitio', 'Documentos'], ['Foro', '1200']]);
    expect(t.filas.map((f) => f.lineaArriba)).toEqual([true, true]);
    expect(t.lineaFinal).toBe(true);
    expect(t.filas.map((f) => PLANTILLA.slice(f.cierre!.desde, f.cierre!.hasta))).toEqual([R`\\`, R`\\`]);
    expect(t.filas[0].separadores.map((p) => PLANTILLA[p])).toEqual(['&']);
    expect(t.filas[0].celdas).toMatchObject([{ ancho: 1, alineacion: null }, { ancho: 1, alineacion: null }]);
  });

  it.each([
    ['|l|c|r|', ['l', 'c', 'r'], ['l', 'c', 'r']],
    ['l p{3cm} r', ['l', 'p', 'r'], ['l', 'p{3cm}', 'r']],
  ])('columnas {%s}', (spec, alineaciones, tramos) => {
    const f = con(R`a & b & c \\`, spec);
    expect(leida(f).columnas.map((c) => c.alineacion)).toEqual(alineaciones);
    expect(leida(f).columnas.map((c) => f.slice(c.spec.desde, c.spec.hasta))).toEqual(tramos);
  });

  it('acepta el argumento de posición', () => {
    expect(celdas(R`\begin{tabular}[t]{lc} a & b \\ \end{tabular}`)).toEqual([['a', 'b']]);
  });

  it('ni \\& ni un & entre llaves separan celdas, y \\% no es un comentario', () => {
    expect(celdas(con(R`R\&D & \mbox{a & b} \\`))).toEqual([[R`R\&D`, R`\mbox{a & b}`]]);
    expect(celdas(con(R`50\% & x \\`))).toEqual([[R`50\%`, 'x']]);
  });

  it('la última fila puede no cerrar', () => {
    const f = con(`${R`a & b \\`}\nc & d`);
    expect(celdas(f)).toEqual([['a', 'b'], ['c', 'd']]);
    expect(leida(f).filas[1].cierre).toBeNull();
    expect(leida(f).lineaFinal).toBe(false);
  });

  it('dos filas en una línea, y líneas repetidas', () => {
    const f = R`\begin{tabular}{ll} \hline\hline a & b \\ c & d \\ \hline \end{tabular}`;
    expect(celdas(f)).toEqual([['a', 'b'], ['c', 'd']]);
    expect(leida(f)).toMatchObject({ clase: 'simple', lineaFinal: true, filas: [{ lineaArriba: true }, { lineaArriba: false }] });
  });

  it('una celda vacía tiene contenido vacío, ubicado para llenarla sin perder el espaciado', () => {
    const f = con(R`     &  \\`);
    const y = f.indexOf('&');
    expect(leida(f).filas[0].celdas.map((c) => c.contenido)).toEqual([{ desde: y - 1, hasta: y - 1 }, { desde: y + 2, hasta: y + 2 }]);
    const pegada = con(R`a&&c \\`, 'lll');
    const z = pegada.indexOf('&&') + 1;
    expect(leida(pegada).filas[0].celdas[1].contenido).toEqual({ desde: z, hasta: z });
  });

  it.each([
    ['columnas con @{}', con(R`a & b \\`, '@{}ll@{}')],
    ['columna X', con(R`a & b \\`, 'lX')],
    ['columna con >{}', con(R`a & b \\`, R`>{\bfseries}ll`)],
    ['repetición de columnas', con(R`a & b \\`, '*{2}{c}')],
    ['sin especificación', `${R`\begin{tabular}`}\n${R`a & b \\`}\n${R`\end{tabular}`}`],
    ['sin columnas', con(R`a \\`, '|')],
    ['fila con celdas de menos', con(`${R`a & b \\`}\n${R`c \\`}`)],
    ['fila con celdas de más', con(R`a & b & c \\`)],
    ['\\multirow', con(R`\multirow{2}{*}{a} & b \\`)],
    ['\\cline', con(R`a & b \\ \cline{1-2}`)],
    ['\\cmidrule', con(`${R`a & b \\ \cmidrule{1-2}`}\n${R`c & d \\`}`)],
    ['\\\\ con espacio extra', con(R`a & b \\[2pt]`)],
    ['\\\\*', con(R`a & b \\*`)],
    ['comentario', con(R`a & b \\ % nota`)],
    // Dentro de \verb un & es texto: contarlo como separador dibujaría dos celdas donde hay una.
    ['\\verb', con(R`\verb|a&b| \\`)],
    ['otro entorno adentro', con(R`\begin{itemize}\item a\end{itemize} & b \\`)],
    ['un tabular adentro', R`\begin{tabular}{l}\begin{tabular}{l}x\end{tabular} \\ \end{tabular}`],
    ['llave de más', con(R`a } & b \\`)],
    ['llave sin cerrar', con(R`{a & b \\`)],
    ['sin filas', con(R`\hline`)],
    ['\\multicolumn que no es toda la celda', con(R`x \multicolumn{2}{c}{y} \\`)],
    ['\\multicolumn que no suma las columnas', con(R`\multicolumn{3}{c}{y} \\`)],
    ['\\multicolumn sin número', con(R`\multicolumn{dos}{c}{y} \\`)],
  ])('no reconocida: %s', (_nombre, fuente) => {
    expect(leer(fuente)).toEqual({ clase: 'no-reconocida' });
  });

  it('con \\multicolumn es de solo lectura y cada celda dice cuánto ocupa', () => {
    const f = con(`${R`\multicolumn{2}{|c|}{Total} \\`}\n${R`a & b \\`}`);
    expect(leida(f).clase).toBe('solo-lectura');
    expect(leida(f).filas[0].celdas).toMatchObject([{ ancho: 2, alineacion: 'c' }]);
    expect(celdas(f)).toEqual([['Total'], ['a', 'b']]);
  });

  it('las dos tablas del fixture', () => {
    const t = leerFixture('Bloques.tex');
    expect(interiores(t).map((i) => analizarTabla(t, i).clase)).toEqual(['simple', 'solo-lectura']);
  });

  it.each(['', '{', '{l', '{l}', '{l}\\\\', '{l} a & ', '[t', '{p{3cm}', '{l}}', '{l} \\multicolumn{', '{l} \\'])(
    'no falla con el interior %j', (interior) => {
      expect(() => analizarTabla(interior, { desde: 0, hasta: interior.length })).not.toThrow();
    });
});

// Aplica los cambios de una edición, como el `aplicar` de comandos.test.ts.
function aplicar(texto: string, e: Edicion): string {
  let resultado = texto;
  for (const c of [...e.cambios].sort((a, b) => b.desde - a.desde)) resultado = resultado.slice(0, c.desde) + c.insertar + resultado.slice(c.hasta);
  return resultado;
}

const T = `x\n  ${PLANTILLA}\ny`;
// `replace` con función: un `$` en el reemplazo no se interpreta.
const cambiar = (de: string, a: string, t = T) => t.replace(de, () => a);
const editar = (t: string, fila: number, columna: number, escrito: string) => editarCelda(t, interiores(t)[0], fila, columna, escrito);
const editado = (t: string, fila: number, columna: number, escrito: string) => {
  const r = editar(t, fila, columna, escrito);
  if (r.tipo !== 'ok') throw new Error(r.motivo);
  return aplicar(t, r.edicion);
};

describe('editarCelda', () => {
  it('cambia solo el contenido de esa celda', () => {
    expect(editado(T, 0, 0, 'Página')).toBe(cambiar('Sitio', 'Página'));
    expect(editado(T, 1, 1, '1300')).toBe(cambiar('1200', '1300'));
    expect(editar(T, 0, 0, 'Página')).toMatchObject({ edicion: { cambios: [{ insertar: 'Página' }] } });
  });

  it('con el mismo texto no hay cambios', () => {
    expect(editar(T, 0, 1, ' Documentos ')).toMatchObject({ tipo: 'ok', edicion: { cambios: [] } });
  });

  it.each([
    ['R&D', R`R\&D`], [R`R\&D`, R`R\&D`], ['50%', R`50\%`], [R`50\%`, R`50\%`], ['  hola  ', 'hola'],
    [R`\textbf{a & b}`, R`\textbf{a \& b}`], [R`$k$ y \$5`, R`$k$ y \$5`], ['<b>x</b>', '<b>x</b>'],
  ])('escribir %j guarda %j', (escrito, guardado) => {
    expect(editado(T, 0, 0, escrito)).toBe(cambiar('Sitio', guardado));
  });

  it('vaciar una celda y volver a llenarla conserva el espaciado', () => {
    const vacia = editado(T, 1, 1, '');
    expect(vacia).toBe(cambiar(R`Foro & 1200 \\`, R`Foro &  \\`));
    expect(editado(vacia, 1, 1, '7')).toBe(cambiar(R`Foro & 1200 \\`, R`Foro & 7 \\`));
  });

  it.each([
    ['a } b', MOTIVOS.llaves], ['{a', MOTIVOS.llaves], ['}{', MOTIVOS.llaves], ['cuesta $5', MOTIVOS.pesos],
    [R`a \\ b`, MOTIVOS.rompe], [R`a \\& b`, MOTIVOS.rompe], [R`\begin{itemize}`, MOTIVOS.rompe],
    [R`\multicolumn{2}{c}{x}`, MOTIVOS.rompe], [R`\hline`, MOTIVOS.rompe], [R`\cline{1-2}`, MOTIVOS.rompe],
  ])('no aplica %j', (escrito, motivo) => {
    expect(editar(T, 0, 0, escrito)).toEqual({ tipo: 'error', motivo });
  });

  it('sobre una celda que no existe o una tabla que no es simple, no aplica', () => {
    expect(editar(T, 5, 0, 'x')).toEqual({ tipo: 'error', motivo: MOTIVOS.noEsta });
    expect(editar(T, 0, 2, 'x')).toEqual({ tipo: 'error', motivo: MOTIVOS.noEsta });
    const combinada = con(`${R`\multicolumn{2}{c}{Total} \\`}\n${R`a & b \\`}`);
    expect(editar(combinada, 1, 0, 'x')).toEqual({ tipo: 'error', motivo: MOTIVOS.noEsta });
  });
});

const REJILLA = R`\begin{tabular}{|l|c|}
\hline
a & b \\ \hline
c & d \\ \hline
\end{tabular}`;
const JUNTAS = R`\begin{tabular}{ll} a & b \\ c & d \\ \end{tabular}`;
const ABIERTA = con(`${R`a & b \\`}\nc & d`);
const MEDIA = con(`${R`a & b \\ \midrule`}\n${R`c & d \\`}`);
const VACIA = R`     &  \\`;   // la fila nueva bajo una fila con sangría de cuatro espacios
type Operacion = (texto: string, interior: Rango) => Edicion | null;
const op = (t: string, f: Operacion) => aplicar(t, f(t, interiores(t)[0])!);
const nulo = (t: string, f: Operacion) => f(t, interiores(t)[0]);

describe('agregarFila', () => {
  it('copia la sangría y el espaciado de la vecina, en una línea nueva', () => {
    const foro = `${R`    Foro & 1200 \\`}\n`;
    const sitio = `${R`    Sitio & Documentos \\`}\n`;
    expect(op(T, (t, i) => agregarFila(t, i, 1, 'abajo'))).toBe(cambiar(foro, `${foro}${VACIA}\n`));
    expect(op(T, (t, i) => agregarFila(t, i, 0, 'arriba'))).toBe(cambiar(sitio, `${VACIA}\n${sitio}`));
    expect(op(T, (t, i) => agregarFila(t, i, 0, 'abajo'))).toBe(cambiar(sitio, `${sitio}${VACIA}\n`));
  });

  it('en una rejilla la fila nueva lleva su \\hline; una línea de booktabs no se repite', () => {
    const a = `${R`a & b \\ \hline`}\n`;
    expect(op(REJILLA, (t, i) => agregarFila(t, i, 0, 'abajo'))).toBe(cambiar(a, `${a}${R` &  \\ \hline`}\n`, REJILLA));
    const m = `${R`a & b \\ \midrule`}\n`;
    expect(op(MEDIA, (t, i) => agregarFila(t, i, 0, 'abajo'))).toBe(cambiar(m, `${m}${R` &  \\`}\n`, MEDIA));
  });

  it('con varias filas en una línea, inserta en esa línea', () => {
    const esperado = R`\begin{tabular}{ll} a & b \\  &  \\ c & d \\ \end{tabular}`;
    expect(op(JUNTAS, (t, i) => agregarFila(t, i, 0, 'abajo'))).toBe(esperado);
    expect(op(JUNTAS, (t, i) => agregarFila(t, i, 1, 'arriba'))).toBe(esperado);
    // La primera celda vacía queda antes del primer carácter de la fila: no hay nada que vaciar ahí.
    const conVacia = R`\begin{tabular}{ll}  & b \\ c & d \\ \end{tabular}`;
    expect(op(conVacia, (t, i) => agregarFila(t, i, 0, 'abajo'))).toBe(R`\begin{tabular}{ll}  & b \\ &  \\ c & d \\ \end{tabular}`);
  });

  it('junto a una última fila sin cerrar, la nueva cierra', () => {
    expect(op(ABIERTA, (t, i) => agregarFila(t, i, 1, 'abajo'))).toBe(con(`${R`a & b \\`}\n${R`c & d \\`}\n${R` &  \\`}`));
    expect(op(ABIERTA, (t, i) => agregarFila(t, i, 1, 'arriba'))).toBe(con(`${R`a & b \\`}\n${R` &  \\`}\nc & d`));
  });

  it('la fila nueva queda vacía y se puede llenar', () => {
    const nueva = op(T, (t, i) => agregarFila(t, i, 1, 'abajo'));
    expect(celdas(nueva)).toEqual([['Sitio', 'Documentos'], ['Foro', '1200'], ['', '']]);
    expect(editado(editado(nueva, 2, 0, 'Blog'), 2, 1, '300')).toBe(cambiar(VACIA, R`    Blog & 300 \\`, nueva));
  });
});

describe('borrarFila', () => {
  it('quita su línea', () => {
    expect(op(T, (t, i) => borrarFila(t, i, 1))).toBe(cambiar(`${R`    Foro & 1200 \\`}\n`, ''));
    expect(op(REJILLA, (t, i) => borrarFila(t, i, 0))).toBe(cambiar(`${R`a & b \\ \hline`}\n`, '', REJILLA));
    expect(op(ABIERTA, (t, i) => borrarFila(t, i, 1))).toBe(con(R`a & b \\`));
  });

  it('una línea de booktabs en la misma línea se queda', () => {
    expect(op(MEDIA, (t, i) => borrarFila(t, i, 0))).toBe(con(`${R`\midrule`}\n${R`c & d \\`}`));
  });

  it('con varias filas en una línea, quita solo la suya', () => {
    expect(op(JUNTAS, (t, i) => borrarFila(t, i, 0))).toBe(R`\begin{tabular}{ll} c & d \\ \end{tabular}`);
  });

  it('la única fila no se borra', () => {
    expect(nulo(con(R`a & b \\`), (t, i) => borrarFila(t, i, 0))).toBeNull();
  });
});

describe('agregarColumna', () => {
  const tres = (sitio: string, foro: string) =>
    cambiar(R`Foro & 1200 \\`, foro, cambiar(R`Sitio & Documentos \\`, sitio, cambiar('{ll}', '{lll}')));

  it('suma una letra a la especificación y una celda a cada fila', () => {
    expect(op(T, (t, i) => agregarColumna(t, i, 0, 'derecha'))).toBe(tres(R`Sitio &  & Documentos \\`, R`Foro &  & 1200 \\`));
    expect(op(T, (t, i) => agregarColumna(t, i, 1, 'izquierda'))).toBe(tres(R`Sitio &  & Documentos \\`, R`Foro &  & 1200 \\`));
    expect(op(T, (t, i) => agregarColumna(t, i, 0, 'izquierda'))).toBe(tres(R` & Sitio & Documentos \\`, R` & Foro & 1200 \\`));
    expect(op(T, (t, i) => agregarColumna(t, i, 1, 'derecha'))).toBe(tres(R`Sitio & Documentos &  \\`, R`Foro & 1200 &  \\`));
  });

  it.each([
    ['|l|c|', 0, 'derecha', '|l|l|c|'], ['|l|c|', 0, 'izquierda', '|l|l|c|'], ['|l|c|', 1, 'derecha', '|l|c|c|'],
    ['l c', 0, 'derecha', 'l l c'], ['l c', 1, 'izquierda', 'l c c'], ['l p{3cm}', 1, 'derecha', 'l p{3cm}p{3cm}'],
  ] as const)('{%s}, columna %i a la %s → {%s}', (spec, columna, lado, esperada) => {
    const nueva = op(con(R`a & b \\`, spec), (t, i) => agregarColumna(t, i, columna, lado));
    expect(nueva.slice(nueva.indexOf('{', 7) + 1, nueva.indexOf('\n') - 1)).toBe(esperada);
    expect(leida(nueva).columnas).toHaveLength(3);
  });

  it('la celda nueva se llena sin perder el espaciado', () => {
    const nueva = op(T, (t, i) => agregarColumna(t, i, 0, 'derecha'));
    expect(editado(nueva, 0, 1, 'x')).toBe(cambiar(R`Sitio &  & Documentos`, R`Sitio & x & Documentos`, nueva));
  });
});

describe('borrarColumna', () => {
  const una = (sitio: string, foro: string) =>
    cambiar(R`Foro & 1200 \\`, foro, cambiar(R`Sitio & Documentos \\`, sitio, cambiar('{ll}', '{l}')));

  it('quita su letra y su celda de cada fila', () => {
    expect(op(T, (t, i) => borrarColumna(t, i, 0))).toBe(una(R`Documentos \\`, R`1200 \\`));
    expect(op(T, (t, i) => borrarColumna(t, i, 1))).toBe(una(R`Sitio \\`, R`Foro \\`));
  });

  it.each([
    ['|l|c|', 0, '|c|', 'b'], ['|l|c|', 1, '|l|', 'a'],
  ] as const)('{%s} sin la columna %i → {%s}', (spec, columna, esperada, queda) => {
    expect(op(con(R`a & b \\`, spec), (t, i) => borrarColumna(t, i, columna))).toBe(con(`${queda} ${R`\\`}`, esperada));
  });

  it.each([
    [0, 'c r', R`b & c \\`], [1, 'l r', R`a & c \\`], [2, 'l c', R`a & b \\`],
  ] as const)('de tres columnas, sin la %i', (columna, spec, fila) => {
    expect(op(con(R`a & b & c \\`, 'l c r'), (t, i) => borrarColumna(t, i, columna))).toBe(con(fila, spec));
  });

  it('la única columna no se borra', () => {
    expect(nulo(con(R`a \\`, 'l'), (t, i) => borrarColumna(t, i, 0))).toBeNull();
  });
});

describe('alinearColumna', () => {
  it('cambia una letra', () => {
    expect(op(T, (t, i) => alinearColumna(t, i, 1, 'r'))).toBe(cambiar('{ll}', '{lr}'));
    expect(nulo(T, (t, i) => alinearColumna(t, i, 0, 'l'))).toMatchObject({ cambios: [] });
    expect(nulo(con(R`a & b \\`, 'l p{3cm}'), (t, i) => alinearColumna(t, i, 1, 'c'))).toBeNull();
  });
});

describe('las operaciones, en conjunto', () => {
  it('ninguna toca nada fuera del tabular, y la tabla sigue siendo simple', () => {
    const afuera = (t: string) => {
      const i = interiores(t)[0];
      return [t.slice(0, i.desde), t.slice(i.hasta)];
    };
    const operaciones: Operacion[] = [
      (t, i) => agregarFila(t, i, 0, 'arriba'), (t, i) => agregarFila(t, i, 1, 'abajo'), (t, i) => borrarFila(t, i, 0),
      (t, i) => agregarColumna(t, i, 0, 'izquierda'), (t, i) => agregarColumna(t, i, 1, 'derecha'),
      (t, i) => borrarColumna(t, i, 0), (t, i) => borrarColumna(t, i, 1), (t, i) => alinearColumna(t, i, 0, 'c'),
    ];
    for (const base of [T, `x\n${REJILLA}\ny`, `x ${JUNTAS} y`, `x\n${ABIERTA}\ny`, `x\n${MEDIA}\ny`]) {
      for (const operacion of operaciones) {
        const nuevo = op(base, operacion);
        expect(afuera(nuevo)).toEqual(afuera(base));
        expect(leer(nuevo).clase).toBe('simple');
      }
    }
  });

  it('sobre una tabla que no es simple o un índice que no existe, null', () => {
    const combinada = con(`${R`\multicolumn{2}{c}{Total} \\`}\n${R`a & b \\`}`);
    expect(nulo(combinada, (t, i) => agregarFila(t, i, 0, 'abajo'))).toBeNull();
    expect(nulo(T, (t, i) => agregarFila(t, i, 9, 'abajo'))).toBeNull();
    expect(nulo(T, (t, i) => borrarColumna(t, i, 9))).toBeNull();
  });
});
