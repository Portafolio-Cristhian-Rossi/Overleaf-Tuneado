import { describe, expect, it } from 'vitest';
import { leerFixture } from '../pruebas/ayudas/temporales';
import { analizarBib } from './bib';
import { candidatos, filtrarCandidatos, textoDeCita, type Bibliografia } from './citas';
import type { ItemZotero } from './tipos';

const entradas = analizarBib(leerFixture('referencias.bib')).entradas;
const bib: Bibliografia = new Map(entradas.map((e) => [e.clave, e]));

describe('textoDeCita', () => {
  const t = (comando: string, claves: string[], previo: string | null = null, posterior: string | null = null) =>
    textoDeCita(comando, claves, previo, posterior, bib).texto;

  it.each([
    ['cite', '(Cohen, 1963)'], ['citeA', 'Cohen (1963)'], ['citeNP', 'Cohen, 1963'],
    ['citeauthor', 'Cohen'], ['citeyear', '(1963)'], ['citeyearNP', '1963'],
    ['fullcite', '(Cohen, 1963)'], ['shortcite', '(Cohen, 1963)'], ['shortciteA', 'Cohen (1963)'], ['fullciteNP', 'Cohen, 1963'],
    ['nocite', 'CitekeyArticle'],
  ])('\\%s', (comando, esperado) => {
    expect(t(comando, ['CitekeyArticle'])).toBe(esperado);
  });

  it('varias claves', () => {
    expect(t('cite', ['CitekeyArticle', 'CitekeyBook'])).toBe('(Cohen, 1963; Susskind y Hrabovsky, 2014)');
    expect(t('citeA', ['CitekeyArticle', 'CitekeyInproceedings'])).toBe('Cohen (1963); Holleis et al. (2010)');
    expect(t('citeNP', ['CitekeyArticle', 'CitekeyBook'])).toBe('Cohen, 1963; Susskind y Hrabovsky, 2014');
    expect(t('citeauthor', ['CitekeyArticle', 'CitekeyBook'])).toBe('Cohen; Susskind y Hrabovsky');
    expect(t('citeyear', ['CitekeyArticle', 'CitekeyBook'])).toBe('(1963; 2014)');
    expect(t('nocite', ['CitekeyArticle', 'CitekeyBook'])).toBe('CitekeyArticle, CitekeyBook');
  });

  it('argumentos opcionales', () => {
    expect(t('cite', ['CitekeyArticle'], 'ver', 'p.~5')).toBe('(ver Cohen, 1963, p. 5)');
    expect(t('citeA', ['CitekeyArticle'], 'ver', 'p.~5')).toBe('ver Cohen (1963, p. 5)');
    expect(t('cite', ['CitekeyArticle'], null, 'cap. 2')).toBe('(Cohen, 1963, cap. 2)');
    expect(t('citeNP', ['CitekeyArticle'], 'ver', 'p.~5')).toBe('ver Cohen, 1963, p. 5');
    expect(t('citeA', ['CitekeyArticle', 'CitekeyBook'], null, 'p.~5')).toBe('Cohen (1963); Susskind y Hrabovsky (2014, p. 5)');
    expect(t('cite', ['CitekeyArticle'], '', '')).toBe('(Cohen, 1963)');
  });

  it('autor institucional y entrada sin año', () => {
    expect(t('cite', ['CitekeyManual'])).toBe('(R Core Team, 2018)');
    const sinAnio: Bibliografia = new Map([['x', { tipo: 'misc', clave: 'x', campos: { author: 'Pérez, Ana' }, tramos: {}, desde: 0, hasta: 0 }]]);
    expect(textoDeCita('cite', ['x'], null, null, sinAnio).texto).toBe('(Pérez, s.f.)');
  });

  it('una clave que no está se muestra tal cual y se informa', () => {
    expect(textoDeCita('cite', ['CitekeyArticle', 'nada'], null, null, bib)).toEqual({ texto: '(Cohen, 1963; nada)', faltan: ['nada'] });
    expect(textoDeCita('citeA', ['nada'], null, null, bib)).toEqual({ texto: 'nada', faltan: ['nada'] });
    expect(textoDeCita('nocite', ['nada'], null, null, bib)).toEqual({ texto: 'nada', faltan: ['nada'] });
    expect(textoDeCita('cite', [], null, null, bib)).toEqual({ texto: '()', faltan: [] });
  });

  // bibtex da error ante una clave que difiere solo en mayúsculas: acá también falta.
  it('una clave con otras mayúsculas no es la misma', () => {
    expect(textoDeCita('cite', ['citekeyarticle'], null, null, bib)).toEqual({ texto: '(citekeyarticle)', faltan: ['citekeyarticle'] });
  });
});

describe('candidatos del buscador', () => {
  const item = (cambios: Partial<ItemZotero>): ItemZotero => ({
    biblioteca: 'groups/6491700', nombreBiblioteca: 'Tesis2026-Cris,Pache,Nacho', item: 'ZXBADSCP', tipo: 'conferencePaper',
    titulo: 'TopicGPT: A Prompt-based Topic Modeling Framework', autores: ['Pham', 'Hoyle', 'Sun', 'Resnik', 'Iyyer'],
    anio: '2024', doi: '10.18653/v1/2024.naacl-long.164', ...cambios,
  });
  const items: ItemZotero[] = [
    item({ biblioteca: 'users/0', nombreBiblioteca: 'Mi biblioteca', item: '2RNMK434', tipo: 'webpage', titulo: 'Zotero | Your personal research assistant', autores: [], anio: null, doi: null }),
    item({}),
    item({ item: '1NST1TUC', tipo: 'journalArticle', titulo: 'Informe anual de actividades', autores: ['Universidad de la República'], anio: null, doi: null }),
    item({ item: 'D0SAUT0R', tipo: 'journalArticle', titulo: 'A Biterm Topic Model for Short Texts', autores: ['Yan', 'Guo'], anio: '2013', doi: null }),
  ];

  it('primero los del informe, en el orden del .bib; después los de Zotero, por autor y año', () => {
    const lista = candidatos(entradas, items);
    expect(lista.slice(0, 5).map((c) => [c.origen, c.clave, c.zotero])).toEqual([
      ['informe', 'CitekeyArticle', null], ['informe', 'CitekeyBook', null], ['informe', 'CitekeyInproceedings', null],
      ['informe', 'CitekeyManual', null], ['informe', 'CitekeyMisc', null],
    ]);
    expect(lista.slice(5).map((c) => [c.origen, c.clave, c.autores, c.anio])).toEqual([
      ['zotero', null, 'Pham et al.', '2024'], ['zotero', null, 'Universidad de la República', 's.f.'],
      ['zotero', null, 'Yan y Guo', '2013'], ['zotero', null, 'Zotero | Your personal…', 's.f.'],
    ]);
  });

  it('cada candidato trae lo que se muestra y de dónde sale', () => {
    const lista = candidatos(entradas, items);
    expect(lista[0]).toEqual({
      origen: 'informe', clave: 'CitekeyArticle', zotero: null, autores: 'Cohen', anio: '1963',
      titulo: 'The independence of the continuum hypothesis', detalle: 'en el informe', busqueda: expect.any(String),
    });
    expect(lista.find((c) => c.zotero?.item === 'ZXBADSCP')).toEqual({
      origen: 'zotero', clave: null, zotero: { biblioteca: 'groups/6491700', item: 'ZXBADSCP' }, autores: 'Pham et al.', anio: '2024',
      titulo: 'TopicGPT: A Prompt-based Topic Modeling Framework', detalle: 'Tesis2026-Cris,Pache,Nacho', busqueda: expect.any(String),
    });
    expect(lista.find((c) => c.zotero?.item === '2RNMK434')!.detalle).toBe('Mi biblioteca');
  });

  it('un ítem de Zotero que ya está en el .bib no aparece dos veces', () => {
    const porTitulo = analizarBib('@inproceedings{Pham2024, title = {{TopicGPT}: a prompt-based topic modeling framework}, year = 2024}').entradas;
    expect(candidatos(porTitulo, items).some((c) => c.zotero?.item === 'ZXBADSCP')).toBe(false);
    const porDoi = analizarBib('@misc{x, doi = {https://doi.org/10.18653/v1/2024.NAACL-long.164}}').entradas;
    expect(candidatos(porDoi, items).some((c) => c.zotero?.item === 'ZXBADSCP')).toBe(false);
    const otroAnio = analizarBib('@misc{x, title = {TopicGPT: A Prompt-based Topic Modeling Framework}, year = 2023}').entradas;
    expect(candidatos(otroAnio, items).some((c) => c.zotero?.item === 'ZXBADSCP')).toBe(true);
  });

  it('el mismo paper en dos bibliotecas de Zotero aparece una sola vez', () => {
    const repetido = [...items, item({ biblioteca: 'users/0', nombreBiblioteca: 'Mi biblioteca', item: 'C0P1AAAA' })];
    expect(candidatos([], repetido).filter((c) => c.titulo.startsWith('TopicGPT'))).toHaveLength(1);
  });

  it('filtra por autor, título, año o clave, sin tildes ni mayúsculas, y con todas las palabras', () => {
    const lista = candidatos(entradas, items);
    expect(filtrarCandidatos(lista, 'cohen').map((c) => c.clave)).toEqual(['CitekeyArticle']);
    expect(filtrarCandidatos(lista, 'TOPICGPT pham').map((c) => c.zotero?.item)).toEqual(['ZXBADSCP']);
    expect(filtrarCandidatos(lista, 'republica').map((c) => c.zotero?.item)).toEqual(['1NST1TUC']);
    expect(filtrarCandidatos(lista, 'cohen 2014')).toEqual([]);
    expect(filtrarCandidatos(lista, 'citekeybook').map((c) => c.clave)).toEqual(['CitekeyBook']);
    expect(filtrarCandidatos(lista, '2013').map((c) => c.autores)).toEqual(['Yan y Guo']);
    expect(filtrarCandidatos(lista, '  ')).toEqual(lista);
  });

  it('busca en todos los autores, no solo en el que se muestra', () => {
    expect(filtrarCandidatos(candidatos(entradas, items), 'resnik').map((c) => c.zotero?.item)).toEqual(['ZXBADSCP']);
    expect(filtrarCandidatos(candidatos(entradas, items), 'koolwaaij').map((c) => c.clave)).toEqual(['CitekeyInproceedings']);
  });
});
