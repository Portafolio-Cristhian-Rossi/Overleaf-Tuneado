import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIR_FIXTURE, leerFixture } from '../pruebas/ayudas/temporales';
import { parrafosAnotados, segmentar, type Segmento } from './prosa';

const fuente = (s: Segmento[]) => s.map((x) => x.fuente).join('');
// Lo que leería el corrector: la prosa tal cual y cada marca reemplazada por su equivalente.
const visto = (texto: string) => segmentar(texto).map((x) => (x.tipo === 'texto' ? x.fuente : x.como ?? '')).join('');

describe('segmentar', () => {
  it.each(fs.readdirSync(DIR_FIXTURE).filter((n) => /\.(tex|bib)$/.test(n)))('reproduce %s al concatenar sus segmentos', (nombre) => {
    const texto = leerFixture(nombre);
    expect(fuente(segmentar(texto))).toBe(texto);
  });

  it.each([
    '', 'Solo texto.', '$sin cerrar', '\\begin{lstlisting}\nsin fin', '\\cite{', '\\', '\\begin{', '{{}', '\\verb', '%', '\\textbf{a', '\\[ x',
  ])('reproduce y no falla con %j', (texto) => {
    expect(fuente(segmentar(texto))).toBe(texto);
  });

  it.each([
    ['Hola \\textbf{mundo} cruel', 'Hola mundo cruel'],
    ['ver~\\ref{sec:a} y \\cite{x}', 'ver 1 y (Autor, 2020)'],
    ['según \\citeA<ver>[p.~3]{x, y} dice', 'según Autor (2020) dice'],
    ['un 50\\% de $x^2$ casos', 'un 50% de X casos'],
    ['la fórmula \\(a+b\\) vale', 'la fórmula X vale'],
    ['texto % nota \\textbf{x}\nmás', 'texto \nmás'],
    ['\\includegraphics[width=0.8\\textwidth]{figs/a.png}', ''],
    ['\\keywords{Procesamiento, Redes}', 'Procesamiento, Redes'],
    ['``hola\'\' dijo', '"hola" dijo'],
    ['A\\label{sec:x} B', 'A B'],
    ['R\\&D y a\\_b', 'R&D y a_b'],
    ['visitar \\url{https://x.org/a_b} hoy', 'visitar enlace hoy'],
    ['un \\emph{término} y \\texttt{codigo}', 'un término y codigo'],
  ])('%j se lee como %j', (texto, esperado) => {
    expect(visto(texto)).toBe(esperado);
  });

  it('el cierre de un título separa párrafos para el corrector', () => {
    expect(visto('\\section{Medidas}\nTexto que sigue.')).toBe('Medidas\n\n\nTexto que sigue.');
  });

  it('el código y la matemática en bloque son una sola marca, con líneas en blanco y todo', () => {
    for (const bloque of [
      '\\begin{lstlisting}[language=Python]\nprint("análisis")\n\n# comentario\n\\end{lstlisting}',
      '\\begin{verbatim}\n\\textbf{x} % y\n\\end{verbatim}',
      '\\begin{equation}\n  a = b \\label{eq:x}\n\\end{equation}',
      '\\[\n a + b \n\\]',
      '$$ a + b $$',
    ]) {
      expect(segmentar(`Antes ${bloque} después`).filter((s) => s.tipo === 'marca').map((s) => s.fuente)).toEqual([bloque]);
    }
  });

  it('de una tabla flotante solo queda el epígrafe', () => {
    const t = '\\begin{table}[htbp]\n\\centering\n\\caption{Los datos}\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}\n\\end{table}';
    expect(visto(t).replace(/\s+/g, ' ').trim()).toBe('Los datos');
  });

  it('los ítems de una lista conservan su texto', () => {
    expect(visto('\\begin{itemize}\n\\item uno\n\\item[b] dos\n\\end{itemize}').replace(/\s+/g, ' ').trim()).toBe('uno dos');
  });

  it('el preámbulo de main.tex no se lee; el cuerpo sí', () => {
    const leido = visto(leerFixture('main.tex'));
    expect(leido).not.toMatch(/documentclass|colorlinks|prgrado|Juan Manuel Pacheco/);
    expect(leido).toContain('Agradecimientos');
    expect(leido).toContain('Procesamiento del Lenguaje Natural, Aprendizaje Automático');
    expect(leido).not.toMatch(/[\\{}%]|frontmatter|apacite/);
  });

  it('en los capítulos no queda ningún resto de LaTeX', () => {
    for (const n of ['Cap1.tex', 'Cap2.tex', 'Cap3.tex', 'Cap6.tex']) {
      expect(visto(leerFixture(n)), n).not.toMatch(/[\\{}]|sec:CAP2|Citekey/);
    }
  });
});

describe('parrafosAnotados', () => {
  it('cada párrafo reproduce su tramo del documento', () => {
    const texto = leerFixture('Cap2.tex');
    const ps = parrafosAnotados(texto);
    expect(ps.length).toBeGreaterThan(20);
    for (const p of ps) expect(fuente(p.segmentos)).toBe(texto.slice(p.desde, p.hasta));
  });

  it('separa por líneas en blanco y descarta los tramos sin prosa', () => {
    const texto = 'Uno.\n\nDos\nsigue.\n\n\\label{x}\n\n% nota\n\n  \n\nTres.';
    expect(parrafosAnotados(texto).map((p) => texto.slice(p.desde, p.hasta))).toEqual(['Uno.', 'Dos\nsigue.', 'Tres.']);
  });

  it('una línea en blanco dentro de un bloque de código no parte el párrafo', () => {
    const texto = 'Antes\n\\begin{lstlisting}\na\n\nb\n\\end{lstlisting}\ndespués.\n\nOtro.';
    expect(parrafosAnotados(texto)).toHaveLength(2);
  });

  it('cada título queda en su propio párrafo', () => {
    const texto = leerFixture('Cap2.tex');
    const ps = parrafosAnotados(texto).map((p) => texto.slice(p.desde, p.hasta));
    expect(ps).toContain('\\subsection{Aprendizaje Supervisado}');
    expect(ps).toContain('\\section{Inteligencia Artificial}\\label{sec:CAP2_IA}');
  });
});
