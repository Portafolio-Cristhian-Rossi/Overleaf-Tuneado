import { describe, expect, it } from 'vitest';
import { leerFixture } from '../pruebas/ayudas/temporales';
import { analizar, type Rango } from './analizador';
import { analizarTabla, type TablaLeida } from './tabla';

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
