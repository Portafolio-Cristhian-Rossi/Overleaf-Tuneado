import { describe, expect, it } from 'vitest';
import { leerFixture } from '../pruebas/ayudas/temporales';
import { agregarPaquete, alternarFormato, cambiarNivelTitulo, nivelEnPosicion, type Edicion } from './comandos';

// Aplica una edición y devuelve el texto resultante y el tramo que queda seleccionado.
function aplicar(texto: string, e: Edicion) {
  let resultado = texto;
  for (const c of [...e.cambios].sort((a, b) => b.desde - a.desde)) {
    resultado = resultado.slice(0, c.desde) + c.insertar + resultado.slice(c.hasta);
  }
  const [a, b] = [Math.min(e.seleccion.ancla, e.seleccion.cabeza), Math.max(e.seleccion.ancla, e.seleccion.cabeza)];
  return { texto: resultado, seleccionado: resultado.slice(a, b) };
}

describe('alternarFormato', () => {
  it('envuelve la selección', () => {
    expect(aplicar('hola mundo', alternarFormato('hola mundo', { desde: 5, hasta: 10 }, 'textbf')))
      .toEqual({ texto: 'hola \\textbf{mundo}', seleccionado: 'mundo' });
  });

  it('desenvuelve si ya está en negrita', () => {
    const t = 'hola \\textbf{mundo}';
    expect(aplicar(t, alternarFormato(t, { desde: 13, hasta: 18 }, 'textbf'))).toEqual({ texto: 'hola mundo', seleccionado: 'mundo' });
    expect(aplicar(t, alternarFormato(t, { desde: 15, hasta: 15 }, 'textbf')).texto).toBe('hola mundo');
  });

  it('al desenvolver con el cursor adentro, el cursor queda en la misma letra', () => {
    const t = 'hola \\textbf{mundo}';
    expect(alternarFormato(t, { desde: 15, hasta: 15 }, 'textbf').seleccion).toEqual({ ancla: 7, cabeza: 7 });
  });

  it('desenvuelve también si la selección abarca todo el comando', () => {
    const t = 'hola \\textbf{mundo} fin';
    expect(aplicar(t, alternarFormato(t, { desde: 5, hasta: 19 }, 'textbf'))).toEqual({ texto: 'hola mundo fin', seleccionado: 'mundo' });
  });

  it('negrita dentro de cursiva envuelve, no desenvuelve', () => {
    const t = '\\textit{hola mundo}';
    expect(aplicar(t, alternarFormato(t, { desde: 13, hasta: 18 }, 'textbf')).texto).toBe('\\textit{hola \\textbf{mundo}}');
  });

  it('cursiva usa \\textit', () => {
    expect(aplicar('a b', alternarFormato('a b', { desde: 2, hasta: 3 }, 'textit')).texto).toBe('a \\textit{b}');
  });

  it('selección vacía inserta el comando con el cursor adentro', () => {
    const e = alternarFormato('ab', { desde: 1, hasta: 1 }, 'textit');
    expect(aplicar('ab', e).texto).toBe('a\\textit{}b');
    expect(e.seleccion).toEqual({ ancla: 9, cabeza: 9 });
  });
});

describe('cambiarNivelTitulo', () => {
  it.each([
    ['Objetivos', 1, '\\section{Objetivos}'],
    ['Objetivos', 0, '\\chapter{Objetivos}'],
    ['\\section{Objetivos}', 2, '\\subsection{Objetivos}'],
    ['\\section{Objetivos}', 3, '\\subsubsection{Objetivos}'],
    ['\\section{Objetivos}', null, 'Objetivos'],
    ['\\section{IA}\\label{sec:x}', 2, '\\subsection{IA}\\label{sec:x}'],
    ['\\chapter*{Resumen}', 1, '\\section*{Resumen}'],
    ['', 1, '\\section{}'],
    ['Texto común', null, 'Texto común'],
  ] as const)('nivel de título: %j con %j → %j', (linea, nivel, esperado) => {
    const texto = `antes\n${linea}\ndespués`;
    expect(aplicar(texto, cambiarNivelTitulo(texto, 6, nivel)).texto).toBe(`antes\n${esperado}\ndespués`);
  });

  it('funciona con el cursor en cualquier lugar de la línea', () => {
    const texto = 'antes\n\\section{Objetivos}\ndespués';
    expect(aplicar(texto, cambiarNivelTitulo(texto, 20, 2)).texto).toBe('antes\n\\subsection{Objetivos}\ndespués');
  });

  it('en una línea vacía deja el cursor entre las llaves', () => {
    const e = cambiarNivelTitulo('a\n\nb', 2, 1);
    expect(aplicar('a\n\nb', e).texto).toBe('a\n\\section{}\nb');
    expect(e.seleccion).toEqual({ ancla: 11, cabeza: 11 });
  });

  it('al convertir texto en título deja el cursor al final del texto', () => {
    const e = cambiarNivelTitulo('Objetivos', 0, 1);
    expect(e.seleccion).toEqual({ ancla: 18, cabeza: 18 });
  });
});

describe('nivelEnPosicion', () => {
  it('devuelve el nivel del título de la línea, o null', () => {
    const texto = 'intro\n\\subsection{A}\\label{x}\nfin';
    expect(nivelEnPosicion(texto, 0)).toBeNull();
    expect(nivelEnPosicion(texto, 6)).toBe(2);
    expect(nivelEnPosicion(texto, 25)).toBe(2);
    expect(nivelEnPosicion(texto, 31)).toBeNull();
  });
});

describe('agregarPaquete', () => {
  it('agrega el paquete tras \\documentclass en el main.tex del fixture, y nada más cambia', () => {
    const o = leerFixture('main.tex');
    const linea = '\\documentclass[oneside]{prgrado}\n';
    expect(agregarPaquete(o, 'amsmath')).toBe(o.replace(linea, linea + '\\usepackage{amsmath}\n'));
  });

  it('lo agrega después del último \\usepackage existente', () => {
    const t = '\\documentclass{book}\n\\usepackage{a}\n\\usepackage[x]{b}\n\\title{T}\n\\begin{document}\nHola\n';
    expect(agregarPaquete(t, 'amsmath'))
      .toBe('\\documentclass{book}\n\\usepackage{a}\n\\usepackage[x]{b}\n\\usepackage{amsmath}\n\\title{T}\n\\begin{document}\nHola\n');
  });

  it('con configuración la inserta a continuación', () => {
    const t = '\\documentclass{book}\n\\begin{document}\n';
    expect(agregarPaquete(t, 'listings', '\\lstset{frame=single}'))
      .toBe('\\documentclass{book}\n\\usepackage{listings}\n\\lstset{frame=single}\n\\begin{document}\n');
  });

  it.each(['\\usepackage{amsmath}', '\\usepackage[fleqn]{amsmath}', '\\usepackage{amssymb, amsmath}'])('no duplica si ya está: %s', (l) => {
    const t = `\\documentclass{book}\n${l}\n\\begin{document}\n`;
    expect(agregarPaquete(t, 'amsmath')).toBe(t);
  });

  it('un \\usepackage comentado no cuenta como presente ni como lugar de inserción', () => {
    const t = '\\documentclass{book}\n\\title{T}\n% \\usepackage{amsmath}\n\\begin{document}\n';
    expect(agregarPaquete(t, 'amsmath')).toBe('\\documentclass{book}\n\\usepackage{amsmath}\n\\title{T}\n% \\usepackage{amsmath}\n\\begin{document}\n');
  });

  it('no se confunde con un \\usepackage posterior a \\begin{document}', () => {
    const t = '\\documentclass{book}\n\\begin{document}\nSe usa \\usepackage{amsmath} así.\n';
    expect(agregarPaquete(t, 'amsmath')).toBe('\\documentclass{book}\n\\usepackage{amsmath}\n\\begin{document}\nSe usa \\usepackage{amsmath} así.\n');
  });

  it('un nombre de paquete que es prefijo de otro no cuenta como presente', () => {
    const t = '\\documentclass{book}\n\\usepackage{amsmathx}\n\\begin{document}\n';
    expect(agregarPaquete(t, 'amsmath')).toContain('\\usepackage{amsmath}\n');
  });
});
