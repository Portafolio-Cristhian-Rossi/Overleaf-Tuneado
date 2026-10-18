import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

export interface CitaSubrayada { desde: number; hasta: number; id: string }

export const fijarCitas = StateEffect.define<CitaSubrayada[]>();

// Campo propio y no diagnósticos de lint: la gramática ya usa esa única fuente.
const campo = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (const ef of tr.effects) {
      if (!ef.is(fijarCitas)) continue;
      const largo = tr.state.doc.length;
      const marcas = ef.value
        .filter((c) => c.desde >= 0 && c.hasta <= largo && c.desde < c.hasta)
        .map((c) => Decoration.mark({ class: 'cm-verificacion', attributes: { 'data-hallazgo': c.id } }).range(c.desde, c.hasta));
      decos = Decoration.set(marcas, true);
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function citasSubrayadas(estado: EditorState): CitaSubrayada[] {
  const decos = estado.field(campo, false);
  if (!decos) return [];
  const salida: CitaSubrayada[] = [];
  decos.between(0, estado.doc.length, (desde, hasta, d) => {
    // Mapear puede dejar un rango vacío cuando se borró todo el texto citado.
    if (desde < hasta) salida.push({ desde, hasta, id: d.spec.attributes['data-hallazgo'] });
  });
  return salida;
}

export function extensionSubrayadoVerificacion(o: { alElegir(id: string): void }): Extension {
  return [
    campo,
    EditorView.domEventHandlers({
      // click y no mousedown: un arrastre que empieza en la frase para seleccionar no cuenta.
      click(e) {
        const marca = (e.target as HTMLElement | null)?.closest?.('.cm-verificacion');
        const id = marca?.getAttribute('data-hallazgo');
        if (id) o.alElegir(id);
        return false;
      },
    }),
  ];
}
