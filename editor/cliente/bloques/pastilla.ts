import { WidgetType } from '@codemirror/view';

// Texto corto que se dibuja en lugar de un comando o junto a él: número de título, viñeta,
// referencia, cita, prefijo de un epígrafe.
export class Pastilla extends WidgetType {
  constructor(readonly texto: string, readonly clase: string) { super(); }
  eq(otra: Pastilla): boolean { return otra.texto === this.texto && otra.clase === this.clase; }
  toDOM(): HTMLElement {
    const nodo = document.createElement('span');
    nodo.className = this.clase;
    nodo.textContent = this.texto;
    return nodo;
  }
  ignoreEvent(): boolean { return false; }
}
