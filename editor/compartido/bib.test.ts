import { describe, expect, it } from 'vitest';
import { leerFixture } from '../pruebas/ayudas/temporales';
import { analizarBib, anioDe, apellidos, autoresCortos, sinLatex, type EntradaBib } from './bib';

const una = (t: string) => analizarBib(t).entradas[0];

describe('analizarBib', () => {
  it('lee el referencias.bib del fixture', () => {
    const { entradas, problemas } = analizarBib(leerFixture('referencias.bib'));
    expect(entradas.map((e) => [e.tipo, e.clave])).toEqual([
      ['article', 'CitekeyArticle'], ['book', 'CitekeyBook'], ['inproceedings', 'CitekeyInproceedings'],
      ['manual', 'CitekeyManual'], ['misc', 'CitekeyMisc'],
    ]);
    expect(problemas).toEqual([]);
    expect(entradas[0].campos).toMatchObject({ author: 'P. J. Cohen', year: '1963', pages: '1143--1148' });
    expect(entradas[4].campos.howpublished).toBe('\\url{https://www.nasa.gov/nh/pluto-the-other-red-planet}');
  });

  it('los rangos cubren cada entrada, de la arroba a su llave', () => {
    const t = leerFixture('referencias.bib');
    for (const e of analizarBib(t).entradas) {
      expect(t[e.desde]).toBe('@');
      expect(t[e.hasta - 1]).toBe('}');
      expect(t.slice(e.desde, e.hasta)).toContain(e.clave);
    }
  });

  it.each([
    ['llaves anidadas', '@misc{k, title = {Un {BTM} y {\\\'e}xito}}', 'Un {BTM} y {\\\'e}xito'],
    ['comillas con llaves', '@misc{k, title = "Dice {"}hola{"}"}', 'Dice {"}hola{"}'],
    ['número', '@misc{k, title = 2014}', '2014'],
    ['palabra', '@misc{k, title = jun}', 'jun'],
    ['concatenación', '@misc{k, title = "a" # jun # {b}}', 'a jun b'],
    ['paréntesis', '@misc(k, title = {x})', 'x'],
    ['mayúsculas en el nombre', '@MISC{k, Title = {x}}', 'x'],
    ['sin coma final ni espacios', '@misc{k,title={x}}', 'x'],
    ['varias líneas', '@misc{k,\n\ttitle = {x\n  y},\n}', 'x\n  y'],
  ])('valor: %s', (_nombre, t, esperado) => {
    expect(una(t).campos.title).toBe(esperado);
  });

  it('el tipo y los nombres de campo quedan en minúsculas; la clave, tal cual', () => {
    expect(una('@InProceedings{Clave_X, AUTHOR = {a}}')).toMatchObject({ tipo: 'inproceedings', clave: 'Clave_X', campos: { author: 'a' } });
  });

  it('saltea el texto suelto, @string, @preamble y un @comment sin arrobas adentro', () => {
    const t = '% Archivo de referencias\nTexto suelto.\n@comment{jabref-meta: databaseType:bibtex;}\n@string{j = "Revista"}\n@preamble{"\\\\x"}\n@misc{si, title = {x}}';
    expect(analizarBib(t)).toMatchObject({ entradas: [{ clave: 'si' }], problemas: [] });
    expect(analizarBib(t).entradas).toHaveLength(1);
  });

  // bibtex no conoce comentarios: ni el % ni @comment ocultan una entrada. Si alguien cita esa
  // clave, compila; y si se repite, bibtex protesta. El lector ve lo mismo que bibtex.
  it('una entrada "comentada" con % o dentro de @comment sigue siendo una entrada', () => {
    expect(analizarBib('% @misc{a, title = {x}}\n@comment{@misc{b, title = {y}}}').entradas.map((e) => e.clave)).toEqual(['a', 'b']);
  });

  it('una entrada con un campo sin nombre está mal formada, y las demás se leen', () => {
    const r = analizarBib('@misc{k, = {x}}\n@misc{b, title = {y}}');
    expect(r.entradas.map((e) => e.clave)).toEqual(['b']);
    expect(r.problemas).toEqual([{ linea: 1, mensaje: 'La entrada que empieza acá está mal formada.' }]);
  });

  it('una entrada rota no impide leer las demás', () => {
    const t = '@misc{a, title = {x}}\n@misc{rota, title = {sin cerrar\n@misc{b, title = {y}}\n';
    const r = analizarBib(t);
    expect(r.entradas.map((e) => e.clave)).toEqual(['a', 'b']);
    expect(r.problemas).toEqual([{ linea: 2, mensaje: 'La entrada que empieza acá no cierra su llave.' }]);
  });

  it('informa la clave faltante y la repetida', () => {
    expect(analizarBib('@misc{, title = {x}}').problemas).toEqual([{ linea: 1, mensaje: 'Falta la clave de la entrada.' }]);
    expect(analizarBib('@misc{, title = {x}}').entradas).toEqual([]);
    const r = analizarBib('@misc{a, title = {x}}\n\n@misc{a, title = {y}}');
    expect(r.entradas).toHaveLength(1);
    expect(r.entradas[0].campos.title).toBe('x');
    expect(r.problemas).toEqual([{ linea: 3, mensaje: 'La clave "a" ya se usó en la línea 1.' }]);
  });

  it.each(['', '@', '@misc', '@misc{', '@misc{k', '@misc{k,', '@misc{k, a', '@misc{k, a =', '@misc{k, a = {', '}}}', '@misc{k, a = "x}', '@{k}', '@misc{k, = {x}}'])(
    'no falla con %j', (t) => {
      expect(() => analizarBib(t)).not.toThrow();
    });

  it('una entrada sin campos es válida', () => {
    expect(analizarBib('@misc{solo}')).toEqual({ entradas: [{ tipo: 'misc', clave: 'solo', campos: {}, tramos: {}, desde: 0, hasta: 11 }], problemas: [] });
  });

  it('informa dónde está cada campo, de su nombre al final de su valor', () => {
    const t = '@misc{k,\n\ttitle = {Un {BTM}} ,\n\tyear = 2014\n}';
    const { tramos } = una(t);
    expect(t.slice(tramos.title.desde, tramos.title.hasta)).toBe('title = {Un {BTM}}');
    expect(t.slice(tramos.year.desde, tramos.year.hasta)).toBe('year = 2014');
  });

  it('con conRepetidas devuelve todas las entradas y no informa la repetición', () => {
    const r = analizarBib('@misc{a, title = {x}}\n@misc{a, title = {y}}', { conRepetidas: true });
    expect(r.entradas.map((e) => e.campos.title)).toEqual(['x', 'y']);
    expect(r.problemas).toEqual([]);
  });

  it('una clave con espacios se lee entera, hasta la coma', () => {
    expect(una('@misc{mi clave, title = {x}}').clave).toBe('mi clave');
  });
});

describe('sinLatex', () => {
  it.each([
    ["An{\\'a}lisis de {BTM}", 'Análisis de BTM'], ['Mu\\~noz y G\\"unther', 'Muñoz y Günther'], ["\\'{E}xito", 'Éxito'],
    ['R\\&D --- a~b', 'R&D — a b'], ['p. 3--5', 'p. 3–5'], ['{\\ss} {\\o} {\\L}', 'ß ø Ł'], ['Extracción', 'Extracción'],
    ['Zotero {\\textbar} Your', 'Zotero | Your'], ['{TopicGPT}: {A} {Prompt}-based', 'TopicGPT: A Prompt-based'],
    ['\\url{https://x.org/a_b}', 'https://x.org/a_b'], ['50\\% de \\emph{algo}', '50% de algo'], ['  dos   espacios\n y salto ', 'dos espacios y salto'],
    ['{\\`a} {\\^o} \\c{c} {\\v s}', 'à ô ç š'],
  ])('sinLatex(%j) → %j', (entrada, salida) => {
    expect(sinLatex(entrada)).toBe(salida);
  });
});

describe('autores y año', () => {
  const con = (author: string, otros: Record<string, string> = {}): EntradaBib =>
    ({ tipo: 'article', clave: 'k', campos: { ...(author ? { author } : {}), ...otros }, tramos: {}, desde: 0, hasta: 0 });

  it.each([
    ['P. J. Cohen', ['Cohen'], 'Cohen'],
    ['Leonard Susskind and George Hrabovsky', ['Susskind', 'Hrabovsky'], 'Susskind y Hrabovsky'],
    ['Holleis, Paul and Wagner, Matthias and Koolwaaij, Johan', ['Holleis', 'Wagner', 'Koolwaaij'], 'Holleis et al.'],
    ['Ludwig van Beethoven', ['van Beethoven'], 'van Beethoven'],
    ['{Universidad de la Rep{\\\'u}blica}', ['Universidad de la República'], 'Universidad de la República'],
    ['{R Core Team}', ['R Core Team'], 'R Core Team'],
    ['Inzua Herken, Nicolás and others', ['Inzua Herken'], 'Inzua Herken et al.'],
    ['Ros{\\\'a}, Aiala', ['Rosá'], 'Rosá'],
    ['Pham, Chau Minh\n  and Hoyle, Alexander', ['Pham', 'Hoyle'], 'Pham y Hoyle'],
    ['Anderson, {Mary and John}', ['Anderson'], 'Anderson'],
  ])('autores de %j', (author, lista, corto) => {
    expect(apellidos(con(author))).toEqual(lista);
    expect(autoresCortos(con(author))).toBe(corto);
  });

  it('sin autor usa el editor; sin ninguno, el comienzo del título; sin nada, la clave', () => {
    expect(autoresCortos(con('', { editor: 'Duh, Kevin and Gomez, Helena' }))).toBe('Duh y Gomez');
    expect(autoresCortos(con('', { title: 'Zotero {\\textbar} Your personal research assistant' }))).toBe('Zotero | Your personal…');
    expect(autoresCortos(con('', { title: 'Título corto' }))).toBe('Título corto');
    expect(autoresCortos(con(''))).toBe('k');
    expect(apellidos(con(''))).toEqual([]);
  });

  it.each([
    [{ year: '2014' }, '2014'], [{ year: '{2014}' }, '2014'], [{ date: '2019-01-10' }, '2019'],
    [{ year: 'en prensa' }, 's.f.'], [{}, 's.f.'], [{ year: '2014', date: '1999' }, '2014'],
  ])('año de %j', (campos, anio) => {
    expect(anioDe({ ...con('x'), campos })).toBe(anio);
  });
});
