import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Proyecto } from '../compartido/tipos';
import { DIR_FIXTURE, dirTemporal } from '../pruebas/ayudas/temporales';
import { describirProyecto } from './proyecto';

function proyectoCon(archivos: Record<string, string>): Promise<Proyecto> {
  const dir = dirTemporal();
  for (const [ruta, contenido] of Object.entries(archivos)) {
    fs.mkdirSync(path.dirname(path.join(dir, ruta)), { recursive: true });
    fs.writeFileSync(path.join(dir, ruta), contenido);
  }
  return describirProyecto(dir, 'main.tex');
}

describe('describirProyecto sobre el fixture', () => {
  let p: Proyecto;
  beforeAll(async () => { p = await describirProyecto(DIR_FIXTURE, 'main.tex'); });

  it('lista los capítulos en orden con título y número', () => {
    expect(p.capitulos).toEqual([
      { ruta: 'main.tex', titulo: 'Portada y resumen', numero: null },
      { ruta: 'Cap1.tex', titulo: 'Introducción', numero: '1' },
      { ruta: 'Cap2.tex', titulo: 'Revision de antecedentes', numero: '2' },
      { ruta: 'Cap3.tex', titulo: 'Parte Central', numero: '3' },
      { ruta: 'Cap4.tex', titulo: 'Experimentación', numero: '4' },
      { ruta: 'Cap5.tex', titulo: 'Conclusiones y Trabajo Futuro', numero: '5' },
      { ruta: 'Cap6.tex', titulo: 'Anexo 1', numero: 'A' },
    ]);
  });

  it('indexa las etiquetas', () => {
    expect(p.etiquetas).toHaveLength(4);
    expect(p.etiquetas).toContainEqual({ nombre: 'sec:CAP2_IA', ruta: 'Cap2.tex', linea: 15, titulo: 'Inteligencia Artificial', numero: '2.1' });
    expect(p.etiquetas).toContainEqual({ nombre: 'sec:CAP2_Extra', ruta: 'Cap2.tex', linea: 48, titulo: 'Conceptos Complementarios', numero: '2.4' });
  });

  it('junta los paquetes del principal y de la clase', () => {
    expect(p.paquetes).toEqual(expect.arrayContaining(['inputenc', 'babel', 'hyperref', 'graphicx', 'apacite', 'ifthen']));
  });

  it('encuentra la bibliografía', () => {
    expect(p.bibliografia).toBe('referencias.bib');
  });
});

describe('describirProyecto en otros proyectos', () => {
  it('resuelve \\input con extensión y espacios, e \\include en subcarpeta', async () => {
    const p = await proyectoCon({
      'main.tex': '\\documentclass{book}\n\\begin{document}\n\\input{caps/Cap 1.tex}\n\\include{caps/intro}\n\\end{document}\n',
      'caps/Cap 1.tex': '\\chapter{Uno}\n',
      'caps/intro.tex': '\\chapter{Dos}\n',
    });
    expect(p.capitulos.slice(1)).toEqual([
      { ruta: 'caps/Cap 1.tex', titulo: 'Uno', numero: '1' },
      { ruta: 'caps/intro.tex', titulo: 'Dos', numero: '2' },
    ]);
  });

  it('omite un incluido cuyo archivo no existe', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n\\include{falta}\n\\include{esta}\n\\end{document}\n',
      'esta.tex': '\\chapter{Está}\n',
    });
    expect(p.capitulos.map((c) => c.ruta)).toEqual(['main.tex', 'esta.tex']);
  });

  it('ignora \\include dentro de comentarios', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n% \\include{a}\n\\include{b}\n\\end{document}\n',
      'a.tex': '\\chapter{A}\n', 'b.tex': '\\chapter{B}\n',
    });
    expect(p.capitulos.map((c) => c.ruta)).toEqual(['main.tex', 'b.tex']);
  });

  it('no sale del informe por un \\include con ..', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n\\include{../afuera}\n\\include{b}\n\\end{document}\n',
      'b.tex': '\\chapter{B}\n',
    });
    expect(p.capitulos.map((c) => c.ruta)).toEqual(['main.tex', 'b.tex']);
  });

  it('frontmatter y capítulos con asterisco no llevan número', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n\\frontmatter\n\\include{pre}\n\\mainmatter\n\\include{a}\n\\include{sin}\n\\include{b}\n\\backmatter\n\\include{post}\n\\end{document}\n',
      'pre.tex': '\\chapter{Prefacio}\n', 'a.tex': '\\chapter{A}\n', 'sin.tex': '\\chapter*{Sin número}\n',
      'b.tex': '\\chapter{B}\n', 'post.tex': '\\chapter{Epílogo}\n',
    });
    expect(p.capitulos.slice(1).map((c) => [c.titulo, c.numero])).toEqual([
      ['Prefacio', null], ['A', '1'], ['Sin número', null], ['B', '2'], ['Epílogo', null],
    ]);
  });

  it('\\appendix en el principal pasa a letras', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n\\include{a}\n\\appendix\n\\include{x}\n\\include{y}\n\\end{document}\n',
      'a.tex': '\\chapter{A}\n', 'x.tex': '\\chapter{X}\n', 'y.tex': '\\chapter{Y}\n',
    });
    expect(p.capitulos.slice(1).map((c) => c.numero)).toEqual(['1', 'A', 'B']);
  });

  it('un archivo sin \\chapter usa su nombre como título y no lleva número', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n\\input{notas}\n\\end{document}\n',
      'notas.tex': 'Texto suelto.\n',
    });
    expect(p.capitulos[1]).toEqual({ ruta: 'notas.tex', titulo: 'notas.tex', numero: null });
  });

  it('una etiqueta antes de cualquier título queda sin título ni número', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n\\include{a}\n\\end{document}\n',
      'a.tex': '\\label{suelta}\n\\chapter{A}\\label{cap:a}\n\\section{S}\n\nTexto.\\label{sec:s}\n',
    });
    expect(p.etiquetas).toEqual([
      { nombre: 'suelta', ruta: 'a.tex', linea: 1, titulo: '', numero: null },
      { nombre: 'cap:a', ruta: 'a.tex', linea: 2, titulo: 'A', numero: '1' },
      { nombre: 'sec:s', ruta: 'a.tex', linea: 5, titulo: 'S', numero: '1.1' },
    ]);
  });

  // La etiqueta de una figura, tabla o ecuación nombra a ese objeto, no a la sección que lo contiene.
  it('una etiqueta dentro de una figura, tabla o ecuación no toma el título de la sección', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n\\include{a}\n\\end{document}\n',
      'a.tex': [
        '\\chapter{A}', '\\section{S}\\label{sec:s}',
        '\\begin{figure}[htbp]', '\\caption{Una figura}', '\\label{fig:f}', '\\end{figure}',
        '\\begin{table*}', '\\label{tab:t}', '\\end{table*}',
        '\\begin{equation}', 'a = b \\label{eq:e}', '\\end{equation}',
        'Texto.\\label{sec:despues}', '',
      ].join('\n'),
    });
    expect(p.etiquetas.map((e) => [e.nombre, e.titulo, e.numero])).toEqual([
      ['sec:s', 'S', '1.1'],
      ['fig:f', '', null],
      ['tab:t', '', null],
      ['eq:e', '', null],
      ['sec:despues', 'S', '1.1'],
    ]);
  });

  it('separa los paquetes listados con comas e ignora los comentados', async () => {
    const p = await proyectoCon({
      'main.tex': '\\documentclass{book}\n\\usepackage[fleqn]{amsmath, amssymb}\n% \\usepackage{tikz}\n\\begin{document}\n\\end{document}\n',
    });
    expect(p.paquetes).toEqual(['amsmath', 'amssymb']);
    expect(p.bibliografia).toBeNull();
  });

  it('sin incluidos reconocibles lista todos los .tex por nombre', async () => {
    const p = await proyectoCon({ 'main.tex': 'Hola\n', 'b.tex': 'x\n', 'a.tex': '\\chapter{A}\n' });
    expect(p.capitulos).toEqual([
      { ruta: 'a.tex', titulo: 'a.tex', numero: null },
      { ruta: 'b.tex', titulo: 'b.tex', numero: null },
      { ruta: 'main.tex', titulo: 'main.tex', numero: null },
    ]);
  });
});
