import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Proyecto } from '../compartido/tipos';
import { DIR_FIXTURE, dirTemporal } from '../pruebas/ayudas/temporales';
import { archivosDe, describirProyecto, rutaDelGlosario, rutaDelMarcoTeorico } from './proyecto';

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
    expect(p.etiquetas).toContainEqual({ nombre: 'sec:CAP2_IA', ruta: 'Cap2.tex', linea: 15, clase: 'seccion', titulo: 'Inteligencia Artificial', numero: '2.1' });
    expect(p.etiquetas).toContainEqual({ nombre: 'sec:CAP2_Extra', ruta: 'Cap2.tex', linea: 48, clase: 'seccion', titulo: 'Conceptos Complementarios', numero: '2.4' });
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

  it('sigue los \\input de un incluido, como los anexos guardados en su carpeta', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n\\input{a}\n\\input{anexos}\n\\end{document}\n',
      'a.tex': '\\chapter{A}\n$\\{x\\}$\n',
      'anexos.tex': '\\begin{appendix}\n\\input{anexos/x}\n\\input{anexos/y}\n\\end{appendix}\n',
      'anexos/x.tex': '\\chapter{X}\\label{anexo:x}\n',
      'anexos/y.tex': '\\chapter{Y}\n',
    });
    expect(p.capitulos.slice(1)).toEqual([
      { ruta: 'a.tex', titulo: 'A', numero: '1' },
      { ruta: 'anexos.tex', titulo: 'anexos.tex', numero: null },
      { ruta: 'anexos/x.tex', titulo: 'X', numero: 'A' },
      { ruta: 'anexos/y.tex', titulo: 'Y', numero: 'B' },
    ]);
    expect(p.etiquetas).toEqual([
      { nombre: 'anexo:x', ruta: 'anexos/x.tex', linea: 1, clase: 'seccion', titulo: 'X', numero: 'A' },
    ]);
  });

  it('dos archivos que se incluyen entre sí aparecen una sola vez', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n\\input{a}\n\\end{document}\n',
      'a.tex': '\\chapter{A}\n\\input{b}\n',
      'b.tex': '\\chapter{B}\n\\input{a}\n\\input{main}\n',
    });
    expect(p.capitulos.map((c) => [c.ruta, c.numero])).toEqual([['main.tex', null], ['a.tex', '1'], ['b.tex', '2']]);
  });

  it('una llave suelta en un incluido no cierra el grupo del principal', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n{\\backmatter\n\\input{a}\n\\input{b}\n}\n\\input{c}\n\\end{document}\n',
      'a.tex': '\\chapter{A}\nsobra }\n', 'b.tex': '\\chapter{B}\n', 'c.tex': '\\chapter{C}\n',
    });
    expect(p.capitulos.slice(1).map((c) => c.numero)).toEqual([null, null, '1']);
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
      { nombre: 'suelta', ruta: 'a.tex', linea: 1, clase: 'seccion', titulo: '', numero: null },
      { nombre: 'cap:a', ruta: 'a.tex', linea: 2, clase: 'seccion', titulo: 'A', numero: '1' },
      { nombre: 'sec:s', ruta: 'a.tex', linea: 5, clase: 'seccion', titulo: 'S', numero: '1.1' },
    ]);
  });

  it('las etiquetas de un align llevan el número de su fila', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n\\include{a}\n\\end{document}\n',
      'a.tex': '\\chapter{A}\n\\begin{equation}x \\label{eq:0}\\end{equation}\n\\begin{align}\na \\label{eq:1} \\\\\nb \\label{eq:2}\n\\end{align}\n',
    });
    expect(p.etiquetas.map((e) => [e.nombre, e.clase, e.numero])).toEqual([
      ['eq:0', 'ecuacion', '1.1'], ['eq:1', 'ecuacion', '1.2'], ['eq:2', 'ecuacion', '1.3'],
    ]);
  });

  it('una etiqueta en un objeto que el editor no numera lleva su clase y ningún número', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n\\include{a}\n\\end{document}\n',
      'a.tex': [
        '\\chapter{A}', '\\section{S}',
        '\\begin{eqnarray}', 'a \\label{eq:vieja}', '\\end{eqnarray}',
        '\\begin{subfigure}', '\\label{fig:sub}', '\\end{subfigure}', '',
      ].join('\n'),
    });
    expect(p.etiquetas.map((e) => [e.nombre, e.clase, e.titulo, e.numero])).toEqual([
      ['eq:vieja', 'ecuacion', '', null],
      ['fig:sub', 'figura', '', null],
    ]);
  });

  it('una etiqueta de objeto en un capítulo sin número no lleva número', async () => {
    const p = await proyectoCon({
      'main.tex': '\\begin{document}\n\\frontmatter\n\\include{a}\n\\end{document}\n',
      'a.tex': '\\chapter{A}\n\\begin{figure}\\caption{x}\\label{fig:f}\\end{figure}\n',
    });
    expect(p.etiquetas.map((e) => [e.nombre, e.clase, e.numero])).toEqual([['fig:f', 'figura', null]]);
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
    expect(p.etiquetas.map((e) => [e.nombre, e.clase, e.titulo, e.numero])).toEqual([
      ['sec:s', 'seccion', 'S', '1.1'],
      ['fig:f', 'figura', '', '1.1'],
      ['tab:t', 'tabla', '', null],
      ['eq:e', 'ecuacion', '', '1.1'],
      ['sec:despues', 'seccion', 'S', '1.1'],
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

describe('rutaDelGlosario', () => {
  const capitulo = (ruta: string, titulo: string) => ({ ruta, titulo, numero: null });
  it('es el capítulo titulado Glosario, sin importar mayúsculas ni espacios', () => {
    expect(rutaDelGlosario([capitulo('main.tex', 'Portada'), capitulo('Cap0 - Glosario.tex', ' Glosario ')], 'Glosario')).toBe('Cap0 - Glosario.tex');
    expect(rutaDelGlosario([capitulo('G.tex', 'GLOSARIO')], 'Glosario')).toBe('G.tex');
  });
  it('null si no hay, y no confunde un título que solo lo menciona', () => {
    expect(rutaDelGlosario([capitulo('Cap1.tex', 'Introducción'), capitulo('Cap9.tex', 'Glosario de siglas')], 'Glosario')).toBeNull();
  });
  it('usa el título configurado, sin tildes ni mayúsculas', () => {
    expect(rutaDelGlosario([capitulo('Cap1.tex', 'Glosario'), capitulo('T.tex', ' TERMINOS ')], 'Términos')).toBe('T.tex');
  });
  it('con null no hay glosario aunque un capítulo se llame así', () => {
    expect(rutaDelGlosario([capitulo('G.tex', 'Glosario')], null)).toBeNull();
  });
});

describe('archivosDe', () => {
  it('un archivo sin \\input devuelve solo él', () => {
    expect(archivosDe(DIR_FIXTURE, 'Cap6.tex')).toEqual(['Cap6.tex']);
  });

  it('suma lo incluido, recursivo, sin repetir y sin contar los comentarios', () => {
    const dir = dirTemporal();
    const poner = (ruta: string, contenido: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, ruta)), { recursive: true });
      fs.writeFileSync(path.join(dir, ruta), contenido);
    };
    poner('Anexos.tex', '\\chapter{Anexos}\n\\input{Anexos/A}\n% \\input{Anexos/B}\n\\input{Anexos/A.tex}\n\\input{Anexos/C}\n');
    poner('Anexos/A.tex', 'A\n\\input{Anexos/D}\n');
    poner('Anexos/B.tex', 'B\n');
    poner('Anexos/C.tex', 'C\n');
    poner('Anexos/D.tex', 'D\n');
    expect(archivosDe(dir, 'Anexos.tex')).toEqual(['Anexos.tex', 'Anexos/A.tex', 'Anexos/D.tex', 'Anexos/C.tex']);
  });
});

describe('rutaDelMarcoTeorico', () => {
  const capitulo = (ruta: string, titulo: string) => ({ ruta, titulo, numero: null });
  it('reconoce "Revisión de antecedentes" y "Marco Teórico", y null si no hay', () => {
    expect(rutaDelMarcoTeorico([capitulo('Cap1.tex', 'Introducción'), capitulo('Cap2.tex', 'Revisión de antecedentes')], ['antecedentes', 'marco teórico'])).toBe('Cap2.tex');
    expect(rutaDelMarcoTeorico([capitulo('Cap2.tex', 'MARCO TEORICO'), capitulo('Cap3.tex', 'Marco Teórico')], ['antecedentes', 'marco teórico'])).toBe('Cap2.tex');
    expect(rutaDelMarcoTeorico([capitulo('Cap1.tex', 'Introducción'), capitulo('Cap0.tex', 'Glosario')], ['antecedentes', 'marco teórico'])).toBeNull();
  });
  it('usa las palabras configuradas', () => {
    expect(rutaDelMarcoTeorico([capitulo('Cap1.tex', 'Antecedentes'), capitulo('Cap2.tex', 'Estado del Arte')], ['estado del arte'])).toBe('Cap2.tex');
  });
  it('con null no hay marco teórico', () => {
    expect(rutaDelMarcoTeorico([capitulo('Cap2.tex', 'Antecedentes')], null)).toBeNull();
  });
});
