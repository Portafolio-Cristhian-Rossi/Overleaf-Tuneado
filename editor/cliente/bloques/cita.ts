import type { Range } from '@codemirror/state';
import { Decoration, WidgetType, type EditorView } from '@codemirror/view';
import { textoDeCita } from '../../compartido/citas';
import type { ContextoVista, Decorador } from './tipos';

// La cita como se lee: "(Cohen, 1963)". Un clic abre el buscador para cambiarla; con el
// teclado se entra a su código como a cualquier otro elemento.
class Cita extends WidgetType {
  constructor(readonly texto: string, readonly clase: string, readonly alElegir: ContextoVista['alElegirCita']) { super(); }

  eq(otra: Cita): boolean { return otra.texto === this.texto && otra.clase === this.clase; }

  toDOM(vista: EditorView): HTMLElement {
    const nodo = document.createElement('span');
    nodo.className = this.clase;
    nodo.textContent = this.texto;
    nodo.title = 'Clic para cambiar la cita';
    nodo.addEventListener('click', () => this.alElegir(vista, vista.posAtDOM(nodo)));
    return nodo;
  }

  ignoreEvent(evento: Event): boolean { return /^(?:mouse|pointer|click|dblclick|contextmenu)/.test(evento.type); }
}

export const decorarCitas: Decorador = ({ texto, elementos, ctx, activo }) => {
  const rangos: Range<Decoration>[] = [];
  // Mientras el .bib no se leyó no se sabe qué falta: se muestran las claves, sin marcar nada.
  const sinBibliografia = ctx.bibliografia.size === 0;

  for (const e of elementos) {
    if (e.tipo !== 'cita' || activo(e)) continue;
    let widget: Cita;
    if (sinBibliografia) {
      widget = new Cita(e.claves.join(', '), 'cm-cita', ctx.alElegirCita);
    } else {
      const previo = e.previo ? texto.slice(e.previo.desde, e.previo.hasta) : null;
      const posterior = e.posterior ? texto.slice(e.posterior.desde, e.posterior.hasta) : null;
      const cita = textoDeCita(e.comando, e.claves, previo, posterior, ctx.bibliografia);
      widget = new Cita(cita.texto, cita.faltan.length > 0 ? 'cm-cita cm-cita-rota' : 'cm-cita', ctx.alElegirCita);
    }
    rangos.push(Decoration.replace({ widget, reemplaza: true }).range(e.desde, e.hasta));
  }
  return rangos;
};
