import { describe, expect, it } from 'vitest';
import { leerFixture } from '../pruebas/ayudas/temporales';
import { analizar } from './analizador';
import { numerarObjetos, numerarTitulos, objetoEn } from './numeracion';

// Devuelve [texto del título, número] en orden de aparición.
function numerar(texto: string, numeroCapitulo: string | null): [string, string | null][] {
  const elementos = analizar(texto);
  const numeros = numerarTitulos(elementos, numeroCapitulo);
  return elementos.flatMap((e) =>
    e.tipo === 'titulo' ? [[texto.slice(e.contenido.desde, e.contenido.hasta), numeros.get(e.desde) ?? null] as [string, string | null]] : []);
}

describe('numerarTitulos', () => {
  it('numera Cap2 del fixture', () => {
    const n = new Map(numerar(leerFixture('Cap2.tex'), '2'));
    expect(n.get('Revision de antecedentes')).toBe('2');
    expect(n.get('Inteligencia Artificial')).toBe('2.1');
    expect(n.get('Aprendizaje Automático')).toBe('2.2');
    expect(n.get('Aprendizaje Supervisado')).toBe('2.2.1');
    expect(n.get('Entrenamiento, validación y verificación')).toBe('2.2.3');
    expect(n.get('Preprocesamiento')).toBe('2.3.1');
    expect(n.get('Conceptos Complementarios')).toBe('2.4');
    expect(n.get('Web API')).toBe('2.4.3');
    expect(n.get('Word embeddings')).toBeNull();
  });

  it('con capítulo null todo es null', () => {
    expect(numerar('\\chapter{A}\n\\section{B}\n\\subsection{C}', null).map(([, n]) => n)).toEqual([null, null, null]);
  });

  it('los títulos con asterisco no numeran ni avanzan el contador', () => {
    expect(numerar('\\chapter{A}\n\\section{B}\n\\section*{X}\n\\section{C}\n\\subsection*{Y}\n\\subsection{D}', '3')).toEqual([
      ['A', '3'], ['B', '3.1'], ['X', null], ['C', '3.2'], ['Y', null], ['D', '3.2.1'],
    ]);
  });

  it('una sección nueva reinicia las subsecciones', () => {
    expect(numerar('\\section{A}\n\\subsection{a}\n\\subsection{b}\n\\section{B}\n\\subsection{c}', '1').map(([, n]) => n))
      .toEqual(['1.1', '1.1.1', '1.1.2', '1.2', '1.2.1']);
  });

  it('anexo usa letras', () => {
    expect(numerar(leerFixture('Cap6.tex'), 'A')).toEqual([['Anexo 1', 'A'], ['Sección del Anexo', 'A.1']]);
  });

  it('las claves del mapa son el inicio de cada título', () => {
    const elementos = analizar('x\n\\section{A}');
    expect([...numerarTitulos(elementos, '1').keys()]).toEqual([2]);
  });
});

describe('numerarObjetos', () => {
  const objetos = (t: string, cap: string | null) => numerarObjetos(t, analizar(t), cap);
  const numeros = (t: string, cap: string | null = '2') => objetos(t, cap).map((o) => [o.clase, o.tramos.map((x) => x.numero)]);

  it('cada clase cuenta por separado', () => {
    const fig = '\\begin{figure}\\caption{x}\\end{figure}';
    const tab = '\\begin{table}\\caption{x}\\end{table}';
    const ec = '\\begin{equation}a\\end{equation}';
    expect(numeros([fig, ec, tab, fig, ec].join('\n'))).toEqual([
      ['figura', ['2.1']], ['ecuacion', ['2.1']], ['tabla', ['2.1']], ['figura', ['2.2']], ['ecuacion', ['2.2']],
    ]);
  });

  it('sin epígrafe no lleva número', () => {
    expect(numeros('\\begin{figure}\\includegraphics{a}\\end{figure}')).toEqual([['figura', []]]);
  });

  it('las variantes sin número no cuentan', () => {
    expect(numeros('\\[a\\] $$b$$ \\begin{equation*}c\\end{equation*} \\begin{align*}d\\end{align*} \\begin{equation}e\\end{equation}'))
      .toEqual([['ecuacion', []], ['ecuacion', []], ['ecuacion', []], ['ecuacion', []], ['ecuacion', ['2.1']]]);
  });

  it('la matemática en línea, tabular y el código no son objetos', () => {
    expect(numeros('$a$ \\(b\\) \\begin{tabular}{l}x\\end{tabular}\n\\begin{lstlisting}\nx\n\\end{lstlisting}')).toEqual([]);
  });

  it('align numera cada fila, menos las marcadas', () => {
    expect(numeros('\\begin{align}a &= b \\\\ c &= d \\nonumber \\\\ e &= f\\end{align}')).toEqual([['ecuacion', ['2.1', '2.2']]]);
    expect(numeros('\\begin{align}a \\notag \\\\ b\\end{align}')).toEqual([['ecuacion', ['2.1']]]);
  });

  it('un \\\\ dentro de llaves no separa filas de align', () => {
    expect(numeros('\\begin{align}a &= \\text{uno \\\\ dos} \\\\ b\\end{align}')).toEqual([['ecuacion', ['2.1', '2.2']]]);
  });

  it('los \\\\ de un entorno anidado no son filas del align', () => {
    expect(numeros('\\begin{align}f &= \\begin{cases}1 \\\\ 0\\end{cases}\\end{align}')).toEqual([['ecuacion', ['2.1']]]);
    expect(numeros('\\begin{align}a &= \\begin{pmatrix}1 \\\\ 2\\end{pmatrix} \\\\ b &= c\\end{align}\n\\begin{equation}d\\end{equation}'))
      .toEqual([['ecuacion', ['2.1', '2.2']], ['ecuacion', ['2.3']]]);
  });

  it('una equation con \\nonumber o \\notag no lleva número ni avanza el contador', () => {
    expect(numeros('\\begin{equation}a \\nonumber\\end{equation}\n\\begin{equation}b \\notag\\end{equation}\n\\begin{equation}c\\end{equation}'))
      .toEqual([['ecuacion', []], ['ecuacion', []], ['ecuacion', ['2.1']]]);
  });

  it('el epígrafe de la tabla no numera a la figura que la rodea', () => {
    const t = '\\begin{figure}\\includegraphics{a}\\begin{table}\\caption{x}\\end{table}\\end{figure}';
    expect(numeros(t)).toEqual([['figura', []], ['tabla', ['2.1']]]);
  });

  it('capítulo sin número: nadie lleva número', () => {
    expect(numeros('\\begin{equation}a\\end{equation}', null)).toEqual([['ecuacion', []]]);
  });

  it('los tramos de figura, tabla y equation cubren todo el objeto', () => {
    const t = 'x \\begin{equation}a\\end{equation} y';
    expect(objetos(t, '1')).toEqual([{ clase: 'ecuacion', desde: 2, hasta: t.length - 2, tramos: [{ desde: 2, hasta: t.length - 2, numero: '1.1' }] }]);
  });

  it('objetoEn da la clase y el número del tramo', () => {
    const t = 'x \\begin{align}a \\label{eq:1} \\\\ b \\label{eq:2}\\end{align} y';
    const o = objetos(t, 'A');
    expect(objetoEn(o, t.indexOf('eq:1'))).toEqual({ clase: 'ecuacion', numero: 'A.1' });
    expect(objetoEn(o, t.indexOf('eq:2'))).toEqual({ clase: 'ecuacion', numero: 'A.2' });
    expect(objetoEn(o, 0)).toBeNull();
    expect(objetoEn(o, t.length - 1)).toBeNull();
  });

  it('objetoEn elige el objeto más interno y da null si no tiene número', () => {
    const t = '\\begin{figure}\\caption{x}\\begin{equation*}a \\label{e}\\end{equation*}\\end{figure}';
    expect(objetoEn(objetos(t, '3'), t.indexOf('\\label'))).toEqual({ clase: 'ecuacion', numero: null });
    expect(objetoEn(objetos(t, '3'), t.indexOf('\\caption'))).toEqual({ clase: 'figura', numero: '3.1' });
  });

  it('el fixture de bloques', () => {
    expect(numeros(leerFixture('Bloques.tex'), '7')).toEqual([
      ['ecuacion', ['7.1']], ['ecuacion', ['7.2']], ['ecuacion', []],
      ['figura', ['7.1']], ['figura', []], ['tabla', ['7.1']], ['tabla', ['7.2']],
    ]);
  });
});
