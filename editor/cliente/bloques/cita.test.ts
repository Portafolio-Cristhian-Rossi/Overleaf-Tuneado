import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { ctxDePrueba, decos } from '../../pruebas/ayudas/decoraciones';
import { leerFixture } from '../../pruebas/ayudas/temporales';
import { decorar } from '../vista';

const ctx = ctxDePrueba();

describe('citas', () => {
  it('se ve como autor y año', () => {
    expect(decos('según \\cite{CitekeyArticle} x', 0, ctx)).toContainEqual(
      { desde: 6, hasta: 27, reemplaza: true, widget: '(Cohen, 1963)', clase: 'cm-cita' });
    expect(decos('según \\citeA<ver>[p.~5]{CitekeyBook} x', 0, ctx)).toContainEqual(
      expect.objectContaining({ widget: 'ver Susskind y Hrabovsky (2014, p. 5)', clase: 'cm-cita' }));
  });

  it('una clave que no está en el .bib se ve en rojo, con la clave', () => {
    expect(decos('\\cite{nada} x', 12, ctx)).toContainEqual(expect.objectContaining({ widget: '(nada)', clase: 'cm-cita cm-cita-rota' }));
    expect(decos('\\cite{CitekeyArticle, nada} x', 28, ctx)).toContainEqual(
      expect.objectContaining({ widget: '(Cohen, 1963; nada)', clase: 'cm-cita cm-cita-rota' }));
  });

  it('con el cursor encima se ve el código', () => {
    expect(decos('según \\cite{CitekeyArticle} x', 10, ctx).some((x) => x.reemplaza)).toBe(false);
  });

  it('sin bibliografía cargada, las citas muestran su clave sin marcarse rotas', () => {
    const sinBib = ctxDePrueba({ bibliografia: new Map() });
    expect(decos('\\cite{CitekeyArticle, Otra} x', 29, sinBib)).toContainEqual(
      expect.objectContaining({ widget: 'CitekeyArticle, Otra', clase: 'cm-cita' }));
  });

  it('la pastilla se queda con el clic del ratón y no con lo demás', () => {
    const t = 'según \\cite{CitekeyArticle} x';
    let pastilla: { ignoreEvent(e: Event): boolean } | undefined;
    decorar(EditorState.create({ doc: t }), ctx).between(0, t.length, (_d, _h, d) => { if (d.spec.widget?.clase === 'cm-cita') pastilla = d.spec.widget; });
    expect(pastilla).toBeDefined();
    for (const tipo of ['mousedown', 'click']) expect(pastilla!.ignoreEvent(new Event(tipo)), tipo).toBe(true);
    for (const tipo of ['keydown', 'dragover', 'drop']) expect(pastilla!.ignoreEvent(new Event(tipo)), tipo).toBe(false);
  });

  it('las cinco citas del capítulo 1 del fixture se resuelven', () => {
    const d = decos(leerFixture('Cap1.tex'), 0, ctxDePrueba({ numeroCapitulo: '1' })).filter((x) => x.clase?.startsWith('cm-cita'));
    expect(d.map((x) => [x.widget, x.clase])).toEqual([
      ['(Cohen, 1963)', 'cm-cita'], ['(Susskind y Hrabovsky, 2014)', 'cm-cita'], ['(Holleis et al., 2010)', 'cm-cita'],
      ['(R Core Team, 2018)', 'cm-cita'], ['(NASA, 2015)', 'cm-cita'],
    ]);
  });

  it('el comando de una cita no lleva además el resaltado de comando suelto', () => {
    expect(decos('x \\cite{CitekeyArticle} y', 5, ctx).some((x) => x.clase === 'cm-comando')).toBe(false);
  });
});
