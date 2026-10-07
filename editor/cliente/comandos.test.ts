import { describe, expect, it } from 'vitest';
import { leerFixture } from '../pruebas/ayudas/temporales';
import { analizar } from '../compartido/analizador';
import { partesDeFigura } from '../compartido/flotante';
import {
  agregarPaquete, alternarFormato, cambiarCita, cambiarNivelTitulo, cambiarRutaDeImagen, citaEn, insertarCita, insertarFigura,
  nivelEnPosicion, puedeCitarse, type Edicion,
} from './comandos';

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

describe('cambiarRutaDeImagen', () => {
  const t = 'a \\includegraphics[width=5cm]{ figs/vieja.png } b';

  it('toca solo la ruta', () => {
    const e = cambiarRutaDeImagen(t, 5, 'figs/nueva.png')!;
    expect(e.cambios).toEqual([{ desde: t.indexOf(' figs'), hasta: t.indexOf('}'), insertar: 'figs/nueva.png' }]);
    expect(aplicar(t, e).texto).toBe('a \\includegraphics[width=5cm]{figs/nueva.png} b');
  });

  it('vale cualquier posición dentro de la imagen, y sus bordes', () => {
    for (const posicion of [2, t.indexOf('vieja'), t.indexOf('}') + 1]) {
      expect(cambiarRutaDeImagen(t, posicion, 'x.png'), `posición ${posicion}`).not.toBeNull();
    }
  });

  it('fuera de una imagen no hay nada que cambiar', () => {
    expect(cambiarRutaDeImagen(t, 0, 'x.png')).toBeNull();
    expect(cambiarRutaDeImagen(t, t.length, 'x.png')).toBeNull();
    expect(cambiarRutaDeImagen('sin imágenes', 3, 'x.png')).toBeNull();
  });

  it('con dos imágenes pegadas cambia la que empieza en esa posición, no la anterior', () => {
    const pegadas = '\\includegraphics{a.png}\\includegraphics{b.png}';
    expect(cambiarRutaDeImagen(pegadas, 23, 'figs/n.png')!.cambios).toEqual([{ desde: 40, hasta: 45, insertar: 'figs/n.png' }]);
    expect(cambiarRutaDeImagen(pegadas, 0, 'figs/n.png')!.cambios).toEqual([{ desde: 17, hasta: 22, insertar: 'figs/n.png' }]);
    expect(cambiarRutaDeImagen(pegadas, pegadas.length, 'figs/n.png')!.cambios).toEqual([{ desde: 40, hasta: 45, insertar: 'figs/n.png' }]);
  });

  it('con la misma ruta no produce cambios', () => {
    expect(cambiarRutaDeImagen('\\includegraphics{figs/a.png}', 3, 'figs/a.png')!.cambios).toEqual([]);
  });
});

describe('insertarFigura', () => {
  const plantilla = (ruta: string, etiqueta: string) => '\\begin{figure}[htbp]\n  \\centering\n'
    + `  \\includegraphics[width=0.8\\textwidth]{${ruta}}\n`
    + `  \\caption{Descripción de la figura}\n  \\label{fig:${etiqueta}}\n\\end{figure}\n`;

  it('en una línea vacía', () => {
    const e = insertarFigura('a\n\nb', 2, 'figs/Mi-Grafico.png');
    expect(e.cambios).toEqual([{ desde: 2, hasta: 2, insertar: plantilla('figs/Mi-Grafico.png', 'mi-grafico') }]);
    const r = aplicar('a\n\nb', e);
    expect(r.texto).toBe(`a\n${plantilla('figs/Mi-Grafico.png', 'mi-grafico')}\nb`);
    expect(r.seleccionado).toBe('Descripción de la figura');
  });

  it('en medio de un párrafo va después de esa línea, sin partirla', () => {
    const r = aplicar('uno dos\ntres', insertarFigura('uno dos\ntres', 3, 'figs/a.png'));
    expect(r.texto).toBe(`uno dos\n${plantilla('figs/a.png', 'a')}tres`);
    expect(r.seleccionado).toBe('Descripción de la figura');
  });

  it('al final de un archivo que no termina en salto de línea', () => {
    const r = aplicar('uno', insertarFigura('uno', 3, 'figs/a.png'));
    expect(r.texto).toBe(`uno\n${plantilla('figs/a.png', 'a')}`);
    expect(r.seleccionado).toBe('Descripción de la figura');
  });

  it('en un archivo vacío', () => {
    expect(aplicar('', insertarFigura('', 0, 'figs/a.png')).texto).toBe(plantilla('figs/a.png', 'a'));
  });

  it('una línea con solo espacios cuenta como vacía y se reemplaza', () => {
    expect(aplicar('a\n   \nb', insertarFigura('a\n   \nb', 4, 'figs/a.png')).texto).toBe(`a\n${plantilla('figs/a.png', 'a')}\nb`);
  });

  it.each([
    ['figs/Mi-Grafico.png', 'mi-grafico'], ['figs/cc/by-nc.png', 'by-nc'], ['figs/resultado.v2.pdf', 'resultado-v2'],
    ['figs/a__b.png', 'a-b'], ['figs/___.png', 'figura'],
  ])('la etiqueta de %s es fig:%s', (ruta, etiqueta) => {
    expect(insertarFigura('', 0, ruta).cambios[0].insertar).toContain(`\\label{fig:${etiqueta}}`);
  });

  // Una figura dentro de otro bloque es LaTeX roto: va después del bloque más externo.
  it.each([
    ['al comienzo de una ecuación', 'a\n\\begin{equation}\n  x\n\\end{equation}\nb', 2, 'a\n\\begin{equation}\n  x\n\\end{equation}\n'],
    ['en medio de una ecuación', 'a\n\\begin{equation}\n  x\n\\end{equation}\nb', 21, 'a\n\\begin{equation}\n  x\n\\end{equation}\n'],
    ['en una línea vacía dentro de un bloque de código', '\\begin{lstlisting}\nx\n\ny\n\\end{lstlisting}\nb', 21, '\\begin{lstlisting}\nx\n\ny\n\\end{lstlisting}\n'],
    ['dentro de \\[ … \\]', 'a\n\\[\n  x\n\\]\nb', 6, 'a\n\\[\n  x\n\\]\n'],
    ['en un tabular dentro de un table', '\\begin{table}\n\\begin{tabular}{l}\nx\n\\end{tabular}\n\\end{table}\nb', 32, '\\begin{table}\n\\begin{tabular}{l}\nx\n\\end{tabular}\n\\end{table}\n'],
    ['en el preámbulo', '\\documentclass{book}\n\\title{T}\n\\begin{document}\nHola\n', 25, '\\documentclass{book}\n\\title{T}\n\\begin{document}\n'],
  ])('%s, la figura va después del bloque', (_nombre, t, posicion, antes) => {
    const r = aplicar(t, insertarFigura(t, posicion, 'figs/a.png'));
    expect(r.texto).toBe(antes + plantilla('figs/a.png', 'a') + t.slice(antes.length));
    expect(r.seleccionado).toBe('Descripción de la figura');
  });

  it('en el epígrafe de otra figura, va después de esa figura y no la parte', () => {
    const otra = plantilla('figs/b.png', 'b');
    const t = `x\n${otra}y`;
    const r = aplicar(t, insertarFigura(t, t.indexOf('Descripción') + 3, 'figs/a.png'));
    expect(r.texto).toBe(`x\n${otra}${plantilla('figs/a.png', 'a')}y`);
  });

  it('un bloque al final del archivo sin salto de línea', () => {
    const t = '\\begin{equation}x\\end{equation}';
    expect(aplicar(t, insertarFigura(t, 5, 'figs/a.png')).texto).toBe(`${t}\n${plantilla('figs/a.png', 'a')}`);
  });

  it('una fórmula dentro de un párrafo no cambia nada: va después de esa línea', () => {
    const t = 'sea $k$ aquí\nfin';
    expect(aplicar(t, insertarFigura(t, 5, 'figs/a.png')).texto).toBe(`sea $k$ aquí\n${plantilla('figs/a.png', 'a')}fin`);
  });

  it('lo insertado es una figura dibujable', () => {
    const texto = aplicar('', insertarFigura('', 0, 'figs/a.png')).texto;
    const elementos = analizar(texto);
    const figura = elementos.find((x) => x.tipo === 'entorno');
    expect(figura?.tipo === 'entorno' && partesDeFigura(texto, figura, elementos)).not.toBeNull();
  });
});

describe('insertarCita', () => {
  it('en el cursor y sobre una selección', () => {
    expect(aplicar('según  x', insertarCita('según  x', { desde: 6, hasta: 6 }, 'parentetica', ['a', 'b'])).texto).toBe('según \\cite{a, b} x');
    expect(aplicar('según XX x', insertarCita('según XX x', { desde: 6, hasta: 8 }, 'textual', ['a'])).texto).toBe('según \\citeA{a} x');
  });

  it('el cursor queda después de la cita', () => {
    expect(insertarCita('ab', { desde: 1, hasta: 1 }, 'parentetica', ['k']).seleccion).toEqual({ ancla: 9, cabeza: 9 });
    expect(insertarCita('aXXb', { desde: 1, hasta: 3 }, 'textual', ['k']).seleccion).toEqual({ ancla: 10, cabeza: 10 });
  });

  it('sin claves no cambia nada', () => {
    expect(insertarCita('ab', { desde: 1, hasta: 1 }, 'parentetica', [])).toEqual({ cambios: [], seleccion: { ancla: 1, cabeza: 1 } });
  });
});

describe('cambiarCita', () => {
  const t = 'x \\cite<ver>[p.~3]{ a , b } y';

  it('toca solo el comando y las claves', () => {
    expect(aplicar(t, cambiarCita(t, 4, 'textual', ['c'])!).texto).toBe('x \\citeA<ver>[p.~3]{c} y');
    expect(aplicar(t, cambiarCita(t, 4, 'parentetica', ['a', 'b', 'c'])!).texto).toBe('x \\cite<ver>[p.~3]{a, b, c} y');
    expect(cambiarCita(t, 4, 'textual', ['a', 'b'])!.cambios).toEqual([{ desde: 3, hasta: 7, insertar: 'citeA' }]);
  });

  it('con la misma forma y las mismas claves no cambia nada, ni el espaciado', () => {
    expect(cambiarCita(t, 4, 'parentetica', ['a', 'b'])!.cambios).toEqual([]);
  });

  it('fuera de una cita no hay nada que cambiar', () => {
    expect(cambiarCita(t, 0, 'textual', ['c'])).toBeNull();
    expect(cambiarCita('sin citas', 3, 'textual', ['c'])).toBeNull();
  });

  it('conserva los prefijos y los comandos que no conoce', () => {
    expect(aplicar('\\fullcite{a}', cambiarCita('\\fullcite{a}', 3, 'textual', ['a'])!).texto).toBe('\\fullciteA{a}');
    expect(aplicar('\\shortciteA{a}', cambiarCita('\\shortciteA{a}', 3, 'parentetica', ['a'])!).texto).toBe('\\shortcite{a}');
    expect(aplicar('\\citeNP{a}', cambiarCita('\\citeNP{a}', 3, 'parentetica', ['b'])!).texto).toBe('\\citeNP{b}');
    expect(aplicar('\\citeNP{a}', cambiarCita('\\citeNP{a}', 3, 'textual', ['b'])!).texto).toBe('\\citeA{b}');
    expect(aplicar('\\citeyear{a}', cambiarCita('\\citeyear{a}', 3, 'parentetica', ['a', 'b'])!).texto).toBe('\\citeyear{a, b}');
  });

  it('con dos citas pegadas cambia la que empieza en esa posición', () => {
    const pegadas = '\\cite{a}\\cite{b}';
    expect(aplicar(pegadas, cambiarCita(pegadas, 8, 'parentetica', ['z'])!).texto).toBe('\\cite{a}\\cite{z}');
    expect(aplicar(pegadas, cambiarCita(pegadas, 0, 'parentetica', ['z'])!).texto).toBe('\\cite{z}\\cite{b}');
  });
});

describe('citaEn', () => {
  it('da la forma y las claves de la cita que contiene la posición', () => {
    expect(citaEn('x \\citeA{a, b} y', 5)).toEqual({ forma: 'textual', claves: ['a', 'b'] });
    expect(citaEn('x \\fullciteA{a} y', 5)).toEqual({ forma: 'textual', claves: ['a'] });
    expect(citaEn('x \\citeyear{a} y', 2)).toEqual({ forma: 'parentetica', claves: ['a'] });
    expect(citaEn('x \\cite{a} y', 0)).toBeNull();
    expect(citaEn('x \\cite{a} y', 11)).toBeNull();
  });
});

describe('puedeCitarse', () => {
  it.each([
    ['en un párrafo', 'hola mundo', 4, true],
    ['en un título', '\\section{Hola}', 10, true],
    ['en un epígrafe', '\\begin{figure}\\includegraphics{a}\\caption{Hola}\\end{figure}', 44, true],
    ['en una celda de una tabla', '\\begin{tabular}{l}\nx\n\\end{tabular}', 19, true],
    ['en una fórmula en línea', 'sea $a+b$ x', 6, false],
    ['en una ecuación', '\\begin{equation}\na\n\\end{equation}', 18, false],
    ['en un bloque de código', '\\begin{lstlisting}\nx\n\\end{lstlisting}', 19, false],
    ['en el preámbulo', '\\documentclass{book}\n\\begin{document}\nx', 5, false],
    ['en un comentario', 'hola % nota\nmás', 8, false],
    ['justo antes de una fórmula', 'sea $a$ x', 4, true],
    ['justo después de una fórmula', 'sea $a$ x', 7, true],
    ['después del preámbulo', '\\documentclass{book}\n\\begin{document}\nx', 38, true],
  ])('%s', (_nombre, t, posicion, esperado) => {
    expect(puedeCitarse(t, posicion)).toBe(esperado);
  });
});
