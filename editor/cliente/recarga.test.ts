import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { estadoRecargado } from './recarga';

const fabricar = (texto: string, cursor: number) =>
  EditorState.create({ doc: texto, selection: { anchor: cursor }, extensions: [history()] });

function deshacer(estado: EditorState): { hizoAlgo: boolean; texto: string } {
  let resultado = estado;
  const hizoAlgo = undo({ state: estado, dispatch: (tr) => { resultado = tr.state; } });
  return { hizoAlgo, texto: resultado.doc.toString() };
}

describe('estadoRecargado', () => {
  // Si se pudiera, un Ctrl+Z de más borraría lo que trajo un compañero y el guardado
  // automático lo escribiría en disco, listo para el próximo Enviar.
  it('lo traído del disco no se puede deshacer', () => {
    const editado = fabricar('mi texto', 0).update({ changes: { from: 8, insert: ' editado' } }).state;
    expect(deshacer(editado)).toEqual({ hizoAlgo: true, texto: 'mi texto' });

    const recargado = estadoRecargado(editado, 'texto con el párrafo del compañero', fabricar);
    expect(recargado.doc.toString()).toBe('texto con el párrafo del compañero');
    expect(deshacer(recargado)).toEqual({ hizoAlgo: false, texto: 'texto con el párrafo del compañero' });
  });

  it('tampoco se puede deshacer cuando no había ediciones previas', () => {
    const recargado = estadoRecargado(fabricar('viejo', 0), 'nuevo', fabricar);
    expect(deshacer(recargado)).toEqual({ hizoAlgo: false, texto: 'nuevo' });
  });

  it('conserva la posición del cursor, acotada al largo del texto nuevo', () => {
    expect(estadoRecargado(fabricar('0123456789', 7), 'abcdefghijklmnop', fabricar).selection.main.head).toBe(7);
    expect(estadoRecargado(fabricar('0123456789', 7), 'abc', fabricar).selection.main.head).toBe(3);
  });
});
