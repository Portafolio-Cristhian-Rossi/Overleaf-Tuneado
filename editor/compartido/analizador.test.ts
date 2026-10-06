import { describe, expect, it } from 'vitest';
import { leerFixture } from '../pruebas/ayudas/temporales';
import { analizar, type Elemento } from './analizador';

const tramo = (t: string, e: { desde: number; hasta: number }) => t.slice(e.desde, e.hasta);
const deTipo = <T extends Elemento['tipo']>(es: Elemento[], tipo: T) =>
  es.filter((e): e is Extract<Elemento, { tipo: T }> => e.tipo === tipo);

describe('analizar', () => {
  it('título simple', () => {
    expect(analizar('\\section{Hola}')).toEqual([
      { tipo: 'titulo', nivel: 1, conAsterisco: false, desde: 0, hasta: 14, contenido: { desde: 9, hasta: 13 } },
    ]);
  });

  it.each([
    ['\\chapter{A}', 0], ['\\section{A}', 1], ['\\subsection{A}', 2], ['\\subsubsection{A}', 3],
  ])('nivel de %s', (t, nivel) => {
    expect(analizar(t)[0]).toMatchObject({ tipo: 'titulo', nivel, conAsterisco: false });
  });

  it('capítulo con asterisco', () => {
    const t = '\\chapter*{Resumen}';
    const [e] = deTipo(analizar(t), 'titulo');
    expect(e).toMatchObject({ nivel: 0, conAsterisco: true, desde: 0, hasta: t.length });
    expect(tramo(t, e.contenido)).toBe('Resumen');
  });

  it('formato anidado en un título', () => {
    expect(analizar('\\section{Uso de \\textbf{BTM}}').map((e) => e.tipo)).toEqual(['titulo', 'formato']);
  });

  it.each([
    ['\\textbf{x}', 'negrita'], ['\\textit{x}', 'cursiva'], ['\\emph{x}', 'cursiva'], ['\\texttt{x}', 'mono'],
  ])('estilo de %s', (t, estilo) => {
    expect(analizar(t)[0]).toMatchObject({ tipo: 'formato', estilo });
  });

  it('llaves anidadas en el contenido', () => {
    const t = '\\textbf{a {b} c}';
    const [e] = deTipo(analizar(t), 'formato');
    expect(tramo(t, e.contenido)).toBe('a {b} c');
    expect(e.hasta).toBe(t.length);
  });

  it('llaves escapadas no cuentan para el emparejado', () => {
    const t = '\\textbf{a \\} b} c';
    const [e] = deTipo(analizar(t), 'formato');
    expect(tramo(t, e.contenido)).toBe('a \\} b');
  });

  it('un comando más largo no se confunde con uno conocido', () => {
    expect(analizar('\\textbfx{a} \\sectionmark{b} \\itemize')).toEqual([]);
  });

  it('porcentaje escapado no abre comentario', () => {
    const t = '50\\% de \\textit{x} % nota';
    expect(analizar(t).map((e) => [e.tipo, tramo(t, e)])).toEqual([
      ['formato', '\\textit{x}'], ['comentario', '% nota'],
    ]);
  });

  it('nada se reporta dentro de un comentario', () => {
    expect(analizar('% \\section{no}')).toEqual([{ tipo: 'comentario', desde: 0, hasta: 14 }]);
  });

  it('el comentario termina en el fin de línea', () => {
    const t = 'a % b\n\\textbf{c}';
    expect(analizar(t).map((e) => [e.tipo, tramo(t, e)])).toEqual([
      ['comentario', '% b'], ['formato', '\\textbf{c}'],
    ]);
  });

  it('un comentario dentro de un argumento no rompe el emparejado', () => {
    const t = '\\textbf{a % }\nb}';
    const [e] = deTipo(analizar(t), 'formato');
    expect(e.hasta).toBe(t.length);
  });

  it('citas de apacite', () => {
    expect(analizar('\\cite<ver>[p.~3]{a, b}')[0]).toMatchObject({ tipo: 'cita', comando: 'cite', claves: ['a', 'b'], desde: 0, hasta: 22 });
    expect(analizar('\\citeA{x}')[0]).toMatchObject({ tipo: 'cita', comando: 'citeA', claves: ['x'] });
  });

  it.each(['cite', 'citeA', 'citeNP', 'citeauthor', 'citeyear', 'citeyearNP', 'fullcite', 'shortciteA', 'nocite'])('reconoce \\%s', (c) => {
    expect(analizar(`\\${c}{k}`)[0]).toMatchObject({ tipo: 'cita', comando: c, claves: ['k'] });
  });

  it('referencia y etiqueta', () => {
    expect(analizar('~\\ref{sec:CAP2_IA}')[0]).toEqual({ tipo: 'ref', clave: 'sec:CAP2_IA', desde: 1, hasta: 18 });
    expect(analizar('\\label{sec:x}')[0]).toEqual({ tipo: 'etiqueta', nombre: 'sec:x', desde: 0, hasta: 13 });
  });

  it('listas con ordinales', () => {
    const t = '\\begin{enumerate}\n\\item a\n\\item b\n\\end{enumerate}';
    const es = analizar(t);
    expect(es.map((e) => [e.tipo, (e as { ordinal?: number | null }).ordinal])).toEqual([
      ['inicioLista', undefined], ['item', 1], ['item', 2], ['finLista', undefined],
    ]);
    expect(tramo(t, es[0])).toBe('\\begin{enumerate}');
    expect(tramo(t, es[1])).toBe('\\item');
    expect(tramo(t, es[3])).toBe('\\end{enumerate}');
    expect(es[0]).toMatchObject({ clase: 'enumerate' });
  });

  it('itemize no numera y enumerate anidado reinicia', () => {
    const t = [
      '\\begin{enumerate}', '\\item a', '\\begin{itemize}', '\\item x', '\\end{itemize}',
      '\\begin{enumerate}', '\\item y', '\\end{enumerate}', '\\item b', '\\end{enumerate}',
    ].join('\n');
    expect(deTipo(analizar(t), 'item').map((e) => e.ordinal)).toEqual([1, null, 1, 2]);
  });

  it('un \\item fuera de una lista no se reporta', () => {
    expect(analizar('\\item suelto')).toEqual([]);
  });

  it('preámbulo', () => {
    const t = '\\documentclass{x}\n\\title{T}\n\\begin{document}\nHola';
    expect(analizar(t).find((e) => e.tipo === 'preambulo')).toEqual({ tipo: 'preambulo', desde: 0, hasta: t.indexOf('\\begin{document}') });
  });

  it('sin \\begin{document} no hay preámbulo', () => {
    expect(analizar('\\section{A}').some((e) => e.tipo === 'preambulo')).toBe(false);
  });

  it('un \\begin{document} comentado no define preámbulo', () => {
    expect(analizar('% \\begin{document}\nHola').some((e) => e.tipo === 'preambulo')).toBe(false);
  });

  it('no analiza dentro de lstlisting, verbatim ni \\verb', () => {
    expect(analizar('\\begin{lstlisting}\n% x \\textbf{y}\n\\end{lstlisting}')).toEqual([]);
    expect(analizar('\\begin{verbatim}\n\\section{y} % z\n\\end{verbatim}')).toEqual([]);
    expect(analizar('\\verb|\\textbf{y}|')).toEqual([]);
  });

  it('sigue analizando después de un bloque literal', () => {
    const t = '\\begin{lstlisting}\nx\n\\end{lstlisting}\n\\textbf{a}';
    expect(analizar(t).map((e) => tramo(t, e))).toEqual(['\\textbf{a}']);
  });

  it('los elementos salen ordenados por inicio', () => {
    const es = analizar(leerFixture('main.tex'));
    expect(es.map((e) => e.desde)).toEqual([...es.map((e) => e.desde)].sort((a, b) => a - b));
  });

  it.each(['\\textbf{sin cerrar', '}', '\\section', '\\begin{itemize}\n\\item', '\\cite{', '\\', '\\begin{', '\\verb', '\\cite<a', '%'])('no falla con %j', (t) => {
    expect(() => analizar(t)).not.toThrow();
  });

  it('lo que no cierra no se reporta', () => {
    expect(analizar('\\textbf{sin cerrar')).toEqual([]);
    expect(analizar('\\cite{')).toEqual([]);
  });

  it('reconoce todo Cap2.tex del fixture', () => {
    const e = analizar(leerFixture('Cap2.tex'));
    expect(deTipo(e, 'titulo')).toHaveLength(20);
    expect(deTipo(e, 'etiqueta')).toHaveLength(4);
    expect(deTipo(e, 'ref')).toHaveLength(4);
  });

  it('reconoce las citas y el capítulo de Cap1.tex', () => {
    const t = leerFixture('Cap1.tex');
    const e = analizar(t);
    expect(deTipo(e, 'cita').map((c) => c.claves[0])).toEqual([
      'CitekeyArticle', 'CitekeyBook', 'CitekeyInproceedings', 'CitekeyManual', 'CitekeyMisc',
    ]);
    expect(tramo(t, deTipo(e, 'titulo')[0].contenido)).toBe('Introducción');
  });
});
