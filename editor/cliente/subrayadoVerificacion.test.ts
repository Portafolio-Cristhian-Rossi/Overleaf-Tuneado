import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { citasSubrayadas, extensionSubrayadoVerificacion, fijarCitas } from './subrayadoVerificacion';

function estadoCon(doc: string) {
  return EditorState.create({ doc, extensions: [extensionSubrayadoVerificacion({ alElegir: () => {} })] });
}

describe('subrayado de las citas', () => {
  it('fija dos rangos y los devuelve en orden del documento', () => {
    const e = estadoCon('uno dos tres cuatro');
    const e2 = e.update({ effects: fijarCitas.of([{ desde: 8, hasta: 12, id: 'b' }, { desde: 0, hasta: 3, id: 'a' }]) }).state;
    expect(citasSubrayadas(e2)).toEqual([{ desde: 0, hasta: 3, id: 'a' }, { desde: 8, hasta: 12, id: 'b' }]);
  });

  it('un cambio antes del rango lo corre', () => {
    const e = estadoCon('uno dos tres').update({ effects: fijarCitas.of([{ desde: 4, hasta: 7, id: 'a' }]) }).state;
    const e2 = e.update({ changes: { from: 0, insert: 'XX' } }).state;
    expect(citasSubrayadas(e2)).toEqual([{ desde: 6, hasta: 9, id: 'a' }]);
  });

  it('borrar todo el texto citado quita el rango', () => {
    const e = estadoCon('uno dos tres').update({ effects: fijarCitas.of([{ desde: 4, hasta: 7, id: 'a' }]) }).state;
    const e2 = e.update({ changes: { from: 3, to: 8 } }).state;
    expect(citasSubrayadas(e2)).toEqual([]);
  });

  it('fijar [] limpia', () => {
    const e = estadoCon('uno dos').update({ effects: fijarCitas.of([{ desde: 0, hasta: 3, id: 'a' }]) }).state;
    expect(citasSubrayadas(e.update({ effects: fijarCitas.of([]) }).state)).toEqual([]);
  });

  it('ignora rangos vacíos o fuera del documento', () => {
    const e = estadoCon('uno').update({
      effects: fijarCitas.of([{ desde: 1, hasta: 1, id: 'v' }, { desde: 2, hasta: 9, id: 'f' }, { desde: -1, hasta: 2, id: 'n' }, { desde: 0, hasta: 3, id: 'ok' }]),
    }).state;
    expect(citasSubrayadas(e)).toEqual([{ desde: 0, hasta: 3, id: 'ok' }]);
  });

  it('sin la extensión instalada devuelve []', () => {
    expect(citasSubrayadas(EditorState.create({ doc: 'x' }))).toEqual([]);
  });
});
