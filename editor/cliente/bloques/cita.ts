import type { Range } from '@codemirror/state';
import { Decoration, WidgetType, type EditorView } from '@codemirror/view';
import type { Elemento } from '../../compartido/analizador';
import { textoDeCita, type Bibliografia } from '../../compartido/citas';
import type { ContextoVista, Decorador } from './tipos';

type ElementoCita = Extract<Elemento, { tipo: 'cita' }>;

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

// Cómo se ve una cita, en el texto o dentro de una tabla: autor y año. `rota`: cita algo que no
// está en el .bib. Mientras el .bib no se leyó no se sabe qué falta: se ven las claves, sin marcar nada.
export function citaVisible(texto: string, cita: ElementoCita, bibliografia: Bibliografia): { texto: string; rota: boolean } {
  if (bibliografia.size === 0) return { texto: cita.claves.join(', '), rota: false };
  const previo = cita.previo ? texto.slice(cita.previo.desde, cita.previo.hasta) : null;
  const posterior = cita.posterior ? texto.slice(cita.posterior.desde, cita.posterior.hasta) : null;
  const leida = textoDeCita(cita.comando, cita.claves, previo, posterior, bibliografia);
  return { texto: leida.texto, rota: leida.faltan.length > 0 };
}

export const decorarCitas: Decorador = ({ texto, elementos, ctx, activo }) => {
  const rangos: Range<Decoration>[] = [];
  for (const e of elementos) {
    if (e.tipo !== 'cita' || activo(e)) continue;
    const cita = citaVisible(texto, e, ctx.bibliografia);
    const widget = new Cita(cita.texto, cita.rota ? 'cm-cita cm-cita-rota' : 'cm-cita', ctx.alElegirCita);
    rangos.push(Decoration.replace({ widget, reemplaza: true }).range(e.desde, e.hasta));
  }
  return rangos;
};
