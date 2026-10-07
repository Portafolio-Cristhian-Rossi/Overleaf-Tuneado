import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIR_FIXTURE, leerFixture } from '../pruebas/ayudas/temporales';
import { analizarBib } from './bib';
import { advertenciasDe, CAMPOS_QUE_NO_VIAJAN, esLaMismaObra, limpiarEntrada, noViaja, planearAgregado } from './referencias';

const BIB = leerFixture('referencias.bib');
const ZOTERO = fs.readFileSync(path.join(DIR_FIXTURE, '../zotero/entrada.bib'), 'utf8').replace(/\r\n/g, '\n');
const PHAM = '@inproceedings{pham_topicgpt_2024,\n\ttitle = {{TopicGPT}: {A} {Prompt}-based {Topic} {Modeling} {Framework}},\n'
  + '\tdoi = {10.18653/v1/2024.naacl-long.164},\n\tauthor = {Pham, Chau Minh and Hoyle, Alexander},\n\tyear = {2024},\n}';
const plan = (actual: string, nuevo: string, alRepetir: 'preguntar' | 'renombrar' = 'preguntar') => planearAgregado(actual, nuevo, alRepetir);
const entrada = (t: string) => analizarBib(t).entradas[0];

describe('limpiarEntrada', () => {
  it('quita los cuatro campos y nada más', () => {
    const [pham, inzua] = analizarBib(ZOTERO).entradas;
    const limpia = limpiarEntrada(ZOTERO, pham);
    expect(limpia).not.toMatch(/\b(file|annote|abstract|keywords)\s*=/);
    expect(limpia).not.toContain('Users');
    expect(Object.keys(entrada(limpia).campos).sort())
      .toEqual(Object.keys(pham.campos).filter((c) => !CAMPOS_QUE_NO_VIAJAN.includes(c)).sort());
    for (const campo of Object.keys(entrada(limpia).campos)) expect(entrada(limpia).campos[campo], campo).toBe(pham.campos[campo]);
    expect(limpiarEntrada(ZOTERO, inzua)).not.toContain('interesante');
    expect(analizarBib(limpiarEntrada(ZOTERO, inzua))).toMatchObject({ problemas: [], entradas: [{ clave: 'inzua_herken_extraccion_2025' }] });
  });

  it('las líneas que quedan no cambian ni un carácter', () => {
    const [pham] = analizarBib(ZOTERO).entradas;
    const original = ZOTERO.slice(pham.desde, pham.hasta).split('\n');
    for (const linea of limpiarEntrada(ZOTERO, pham).split('\n')) expect(original, linea).toContain(linea);
  });

  it('una entrada sin esos campos queda idéntica', () => {
    expect(limpiarEntrada(PHAM, entrada(PHAM))).toBe(PHAM);
  });

  it('campos en una sola línea, el primero y el último', () => {
    const t = '@misc{k, file = {a:b}, title = {x}, keywords = {y}}';
    expect(limpiarEntrada(t, entrada(t))).toBe('@misc{k, title = {x}}');
    const solo = '@misc{k, abstract = {todo}}';
    expect(analizarBib(limpiarEntrada(solo, entrada(solo)))).toMatchObject({ problemas: [], entradas: [{ clave: 'k', campos: {} }] });
  });

  // Zotero escribe un `annote` por cada nota del ítem: hay que quitarlas todas, no solo la última.
  it('quita todas las apariciones de un campo repetido', () => {
    const t = '@article{k_2020,\n\ttitle = {Un paper},\n\tjournal = {Rev},\n\tyear = {2020},\n\tannote = {NOTA PRIVADA UNO},\n'
      + '\tannote = {NOTA PRIVADA DOS},\n\tfile = {PDF:C\\:\\\\Users\\\\Cris\\\\a.pdf:application/pdf},\n\tfile = {otro.pdf},\n}';
    expect(limpiarEntrada(t, entrada(t))).toBe('@article{k_2020,\n\ttitle = {Un paper},\n\tjournal = {Rev},\n\tyear = {2020},\n}');
  });

  it('repetidos en una sola línea y con distintas mayúsculas', () => {
    const t = '@misc{k, File = {RUTA1}, title = {T}, file = {RUTA2}, ABSTRACT = {r1}, abstract={r2}}';
    const limpia = limpiarEntrada(t, entrada(t));
    expect(limpia).not.toMatch(/RUTA|r1|r2/);
    expect(analizarBib(limpia)).toMatchObject({ problemas: [], entradas: [{ clave: 'k', campos: { title: 'T' } }] });
    expect(Object.keys(entrada(limpia).campos)).toEqual(['title']);
  });

  it('tampoco viajan los campos personales o locales que escriben otros programas', () => {
    const t = '@article{k,\n\ttitle = {T},\n\tannotation = {mi opinión},\n\treview = {flojo},\n\tcomment = {leer},\n\tlocal-url = {file://C:/x.pdf},\n'
      + '\tbdsk-file-1 = {YnBsaXN0},\n\tBdsk-File-2 = {YnBsaXN0},\n\towner = {cris},\n\tmendeley-tags = {a,b},\n\tgroups = {tesis},\n\ttimestamp = {2026-01-01},\n'
      + '\tdate-added = {2026},\n\tdate-modified = {2026},\n\treadstatus = {read},\n\tpriority = {prio1},\n\tranking = {rank5},\n\tjournal = {Rev},\n}';
    expect(limpiarEntrada(t, entrada(t))).toBe('@article{k,\n\ttitle = {T},\n\tjournal = {Rev},\n}');
  });

  it('noViaja reconoce los campos sin importar las mayúsculas, y deja pasar los demás', () => {
    for (const campo of ['file', 'FILE', 'Annote', 'abstract', 'keywords', 'bdsk-file-12', 'local-url']) expect(noViaja(campo), campo).toBe(true);
    for (const campo of ['title', 'author', 'note', 'url', 'urldate', 'bdsk-url-1', 'filename', 'profile']) expect(noViaja(campo), campo).toBe(false);
  });

  it('no confunde un campo con el texto de otro', () => {
    const t = '@misc{k,\n\ttitle = {El campo file = {x} en BibTeX},\n\tFILE = {a:b},\n}';
    expect(limpiarEntrada(t, entrada(t))).toBe('@misc{k,\n\ttitle = {El campo file = {x} en BibTeX},\n}');
  });
});

describe('esLaMismaObra', () => {
  const a = entrada(PHAM);
  it.each([
    ['mismo DOI con prefijo y mayúsculas', '@misc{x, doi = {HTTPS://DOI.ORG/10.18653/V1/2024.naacl-long.164}}', true],
    ['mismo título y año', '@misc{x, title = "TopicGPT: a prompt-based topic modeling framework", year = 2024}', true],
    ['mismo título, otro año', '@misc{x, title = "TopicGPT: a prompt-based topic modeling framework", year = 2023}', false],
    ['otro DOI aunque coincida el título', '@misc{x, title = {TopicGPT: A Prompt-based Topic Modeling Framework}, year = 2024, doi = {10.1/otro}}', false],
    ['sin título ni DOI', '@misc{x, year = 2024}', false],
    ['mismo título con otra puntuación y una tilde de más', '@misc{x, title = {TopicGPT — A prompt based Topic Modeling Fram{\\\'e}work}, year = 2024}', true],
    ['otro título', '@misc{x, title = {TopicGPT revisited}, year = 2024}', false],
  ])('%s', (_nombre, otra, esperado) => {
    expect(esLaMismaObra(a, entrada(otra))).toBe(esperado);
    expect(esLaMismaObra(entrada(otra), a)).toBe(esperado);
  });

  // "Introduction", "Editorial", "Prefacio": mismo título y año no alcanza si los autores son otros.
  it('mismo título y año pero otro primer autor: son dos obras', () => {
    const smith = entrada('@incollection{smith_introduction_2020, title = {Introduction}, author = {Smith, Ana}, year = {2020}}');
    const jones = entrada('@incollection{jones_introduction_2020, title = {Introduction}, author = {Jones, Luis and Smith, Ana}, year = {2020}}');
    expect(esLaMismaObra(smith, jones)).toBe(false);
    expect(esLaMismaObra(smith, entrada('@misc{x, title = {Introduction}, author = {Ana Smith and Otro, Más}, year = {2020}}'))).toBe(true);
    expect(esLaMismaObra(smith, entrada('@misc{x, title = {introduction}, author = {SMITH, A.}, year = {2020}}'))).toBe(true);
  });

  it('si una de las dos no tiene autores, alcanza con el título y el año', () => {
    expect(esLaMismaObra(entrada('@misc{a, title = {Introduction}, year = {2020}}'), entrada('@misc{b, title = {Introduction}, author = {Smith, Ana}, year = {2020}}'))).toBe(true);
  });

  it('dos entradas sin título no son la misma obra por no tenerlo', () => {
    expect(esLaMismaObra(entrada('@misc{a, year = 2020}'), entrada('@misc{b, year = 2020}'))).toBe(false);
  });

  it('las tildes y las llaves no cuentan al comparar títulos', () => {
    expect(esLaMismaObra(entrada('@misc{a, title = {Extracci{\\\'o}n de {Tópicos}}, year = 2020}'), entrada('@misc{b, title = {extraccion de topicos}, year = {2020}}'))).toBe(true);
  });
});

describe('advertenciasDe', () => {
  it('artículo sin revista', () => {
    expect(advertenciasDe(entrada('@article{k, title = {x}}'))).toEqual([
      'A "k" le falta la revista (journal). Al compilar, la bibliografía puede dar error. Si es una tesis o un informe, corregí el tipo en Zotero.',
    ]);
    expect(advertenciasDe(entrada('@article{k, title = {x}, journal = {Revista}}'))).toEqual([]);
    expect(advertenciasDe(entrada('@article{k, title = {x}, journaltitle = {Revista}}'))).toEqual([]);
    expect(advertenciasDe(entrada('@book{k, title = {x}}'))).toEqual([]);
  });

  it('nota que se imprime, recortada si es larga', () => {
    expect(advertenciasDe(entrada('@misc{k, note = {Accedido el 3 de mayo}}'))).toEqual(['"k" trae una nota que se va a imprimir en la bibliografía: "Accedido el 3 de mayo".']);
    const larga = advertenciasDe(entrada(`@misc{k, note = {${'x'.repeat(200)}}}`))[0];
    expect(larga).toBe(`"k" trae una nota que se va a imprimir en la bibliografía: "${'x'.repeat(80)}…".`);
    expect(advertenciasDe(entrada('@misc{k, note = {}}'))).toEqual([]);
  });
});

describe('planearAgregado', () => {
  it('agrega al final, separada por una línea en blanco', () => {
    const r = plan(BIB, PHAM);
    expect(r.resultado).toEqual({ tipo: 'ok', referencias: [{ tipo: 'agregada', clave: 'pham_topicgpt_2024', advertencias: [] }] });
    expect(r.agregar).toBe(`\n${PHAM}\n`);
    expect(analizarBib(BIB + r.agregar)).toMatchObject({ problemas: [] });
    expect(analizarBib(BIB + r.agregar).entradas.at(-1)!.clave).toBe('pham_topicgpt_2024');
  });

  it.each([
    ['sin salto final', '@misc{x}', '\n\n'], ['con un salto', '@misc{x}\n', '\n'], ['con línea en blanco', '@misc{x}\n\n', ''],
    ['con varias líneas en blanco', '@misc{x}\n\n\n', ''], ['con espacios al final', '@misc{x}\n  ', '\n'], ['vacío', '', ''], ['solo blancos', ' \n', ''],
  ])('archivo %s', (_nombre, actual, comienzo) => {
    expect(plan(actual, PHAM).agregar).toBe(`${comienzo}${PHAM}\n`);
  });

  it('la misma obra con otra clave no se duplica: se usa la que está, y se dice', () => {
    const cargada = PHAM.replace('pham_topicgpt_2024', 'Pham2024').replace('10.18653', 'https://doi.org/10.18653');
    expect(plan(cargada, PHAM)).toEqual({
      agregar: '',
      resultado: { tipo: 'ok', referencias: [{ tipo: 'ya-estaba', clave: 'Pham2024', advertencias: ['"pham_topicgpt_2024" ya estaba cargada como "Pham2024" (Pham y Hoyle, 2024): se cita esa.'] }] },
    });
    expect(plan(`${PHAM}\n`, PHAM).resultado).toEqual({ tipo: 'ok', referencias: [{ tipo: 'ya-estaba', clave: 'pham_topicgpt_2024', advertencias: [] }] });
    const sinDoi = '@misc{otra, title = "TopicGPT: a prompt-based topic modeling framework", year = 2024}';
    expect(plan(sinDoi, PHAM).resultado).toMatchObject({ referencias: [{ tipo: 'ya-estaba', clave: 'otra' }] });
  });

  it('la misma entrada, sin título ni DOI por los que reconocerla, tampoco se duplica', () => {
    const rara = '@misc{k, howpublished = {Comunicación personal}}';
    expect(plan(`${rara}\n`, rara)).toEqual({ agregar: '', resultado: { tipo: 'ok', referencias: [{ tipo: 'ya-estaba', clave: 'k', advertencias: [] }] } });
  });

  it('otro trabajo con la misma clave: pregunta, y al renombrar usa la primera clave libre', () => {
    const ocupada = '@book{pham_topicgpt_2024, title = {Otro libro}, year = {1999}}\n@book{pham_topicgpt_2024-2, title = {Otro más}, year = {2001}}\n';
    expect(plan(ocupada, PHAM)).toEqual({
      agregar: '', resultado: { tipo: 'ok', referencias: [{ tipo: 'clave-repetida', clave: 'pham_topicgpt_2024', sugerida: 'pham_topicgpt_2024-3' }] },
    });
    const r = plan(ocupada, PHAM, 'renombrar');
    expect(r.resultado).toMatchObject({ referencias: [{ tipo: 'agregada', clave: 'pham_topicgpt_2024-3' }] });
    expect(r.agregar).toBe(`\n${PHAM.replace('pham_topicgpt_2024,', 'pham_topicgpt_2024-3,')}\n`);
  });

  it('renombra la clave aunque coincida con el tipo de la entrada o sea una sola letra', () => {
    expect(plan('@article{article, title={Viejo}, year={1999}}\n', '@article{article, title={Nuevo}, year={2001}}', 'renombrar').agregar)
      .toBe('\n@article{article-2, title={Nuevo}, year={2001}}\n');
    expect(plan('@book{a, title={Viejo}, year={1999}}\n', '@article{a, title={Nuevo}, year={2001}}', 'renombrar').agregar)
      .toBe('\n@article{a-2, title={Nuevo}, year={2001}}\n');
    expect(plan('@misc{c, title={Viejo}, year={1999}}\n', '@misc ( c , title={Nuevo}, year={2001})', 'renombrar').agregar)
      .toBe('\n@misc ( c-2 , title={Nuevo}, year={2001})\n');
  });

  it('un campo personal repetido no llega al .bib', () => {
    const conDosNotas = '@article{k_2020,\n\ttitle = {Un paper},\n\tjournal = {Rev},\n\tyear = {2020},\n\tannote = {NOTA PRIVADA UNO},\n'
      + '\tannote = {NOTA PRIVADA DOS},\n\tfile = {PDF:C\\:\\\\Users\\\\Cris\\\\a.pdf:application/pdf},\n}';
    const r = plan(BIB, conDosNotas);
    expect(r.resultado).toMatchObject({ tipo: 'ok', referencias: [{ tipo: 'agregada', clave: 'k_2020' }] });
    expect(r.agregar).toBe('\n@article{k_2020,\n\ttitle = {Un paper},\n\tjournal = {Rev},\n\tyear = {2020},\n}\n');
  });

  it('acepta las claves que acepta bibtex, como las de DBLP', () => {
    for (const clave of ['DBLP:conf/naacl/PhamHSRI24', "o'neil2016", 'a+b', 'smith_2020-a', 'x.y:z']) {
      expect(plan('', `@misc{${clave}, title = {x}}`).resultado, clave).toMatchObject({ tipo: 'ok', referencias: [{ tipo: 'agregada', clave }] });
    }
  });

  it('una clave que difiere solo en mayúsculas también está ocupada, como para bibtex', () => {
    expect(plan('@book{PHAM_TopicGPT_2024, title = {Otro libro}, year = {1999}}\n', PHAM).resultado)
      .toMatchObject({ referencias: [{ tipo: 'clave-repetida', sugerida: 'pham_topicgpt_2024-2' }] });
  });

  it('varias entradas pegadas, una repetida dentro del mismo pegado', () => {
    const r = plan(BIB, `${PHAM}\n\n${PHAM}`);
    expect(r.resultado).toMatchObject({ referencias: [{ tipo: 'agregada' }, { tipo: 'ya-estaba', clave: 'pham_topicgpt_2024' }] });
    expect(r.agregar).toBe(`\n${PHAM}\n`);
  });

  it('dos entradas nuevas quedan separadas por una línea en blanco', () => {
    const otra = '@book{libro_2020, title = {Un libro}, year = {2020}}';
    expect(plan('', `${PHAM}\n${otra}\n\n\n`).agregar).toBe(`${PHAM}\n\n${otra}\n`);
  });

  it('las entradas de Zotero se agregan limpias y con sus advertencias', () => {
    const r = plan(BIB, ZOTERO);
    expect(r.agregar).not.toMatch(/Users|interesante|abstract|keywords/);
    expect(r.resultado).toMatchObject({
      tipo: 'ok', referencias: [
        { tipo: 'agregada', clave: 'pham_topicgpt_2024', advertencias: [] },
        {
          tipo: 'agregada', clave: 'inzua_herken_extraccion_2025', advertencias: [
            'A "inzua_herken_extraccion_2025" le falta la revista (journal). Al compilar, la bibliografía puede dar error. Si es una tesis o un informe, corregí el tipo en Zotero.',
            '"inzua_herken_extraccion_2025" trae una nota que se va a imprimir en la bibliografía: "Accepted: 2025-11-07T16:36:28Z".',
          ],
        },
      ],
    });
    expect(analizarBib(BIB + r.agregar)).toMatchObject({ problemas: [] });
    expect(analizarBib(BIB + r.agregar).entradas).toHaveLength(7);
  });

  it('pegado con fines de línea de Windows se normaliza', () => {
    expect(plan('', PHAM.replace(/\n/g, '\r\n')).agregar).toBe(`${PHAM}\n`);
  });

  it('un .bib con una entrada rota de otra persona no impide agregar', () => {
    const r = plan('@misc{rota, title = {sin cerrar\n\n@misc{b, title = {y}}\n', PHAM);
    expect(r.resultado).toMatchObject({ tipo: 'ok', referencias: [{ tipo: 'agregada' }] });
  });

  it.each([
    ['', 'No encontré ninguna referencia en el texto pegado. Tiene que empezar con @article{…, @book{… o similar.'],
    ['un texto cualquiera', 'No encontré ninguna referencia en el texto pegado. Tiene que empezar con @article{…, @book{… o similar.'],
    ['@string{j = "Revista"}', 'No encontré ninguna referencia en el texto pegado. Tiene que empezar con @article{…, @book{… o similar.'],
    ['@misc{k, title = {sin cerrar', 'La referencia no está bien formada (línea 1): La entrada que empieza acá no cierra su llave.'],
    ['@misc{a, title = {x}}\n\n@misc{, title = {y}}', 'La referencia no está bien formada (línea 3): Falta la clave de la entrada.'],
    ['@misc{mi clave, title = {x}}', 'La clave "mi clave" tiene caracteres que LaTeX no acepta en una cita.'],
    ['@misc{a%b, title = {x}}', 'La clave "a%b" tiene caracteres que LaTeX no acepta en una cita.'],
    ['@misc{año2020, title = {x}}', 'La clave "año2020" tiene caracteres que LaTeX no acepta en una cita.'],
    ['@misc{a#b, title = {x}}', 'La clave "a#b" tiene caracteres que LaTeX no acepta en una cita.'],
    ['@misc{a~b, title = {x}}', 'La clave "a~b" tiene caracteres que LaTeX no acepta en una cita.'],
    ['@misc{a\\b, title = {x}}', 'La clave "a\\b" tiene caracteres que LaTeX no acepta en una cita.'],
  ])('rechaza %j', (nuevo, mensaje) => {
    expect(plan(BIB, nuevo)).toEqual({ agregar: '', resultado: { tipo: 'invalido', mensaje } });
  });
});
