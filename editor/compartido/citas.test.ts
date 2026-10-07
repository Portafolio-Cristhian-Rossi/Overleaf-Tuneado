import { describe, expect, it } from 'vitest';
import { leerFixture } from '../pruebas/ayudas/temporales';
import { analizarBib } from './bib';
import { textoDeCita, type Bibliografia } from './citas';

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
