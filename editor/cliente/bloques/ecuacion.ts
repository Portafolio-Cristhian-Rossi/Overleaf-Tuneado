import type { Range } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';
import type { Elemento, EntornoMatematico } from '../../compartido/analizador';
import { dibujarFormula } from './formula';
import type { Decorador } from './tipos';

type Matematica = Extract<Elemento, { tipo: 'matematica' }>;
type Forma = 'en-linea' | 'bloque' | 'previa';

const CLASE: Record<Forma, string> = {
  'en-linea': 'cm-formula', bloque: 'cm-formula cm-formula-bloque', previa: 'cm-formula-previa',
};
const ACLARACION = 'Puede compilar igual: el editor no conoce todos los comandos de LaTeX.';

// La fórmula dibujada. `texto` es la fuente tal como está en el documento.
class Formula extends WidgetType {
  readonly clase: string;

  constructor(
    readonly texto: string, readonly entorno: EntornoMatematico | null, readonly forma: Forma,
    readonly modoBloque: boolean, readonly numero: string | undefined, readonly comoBloque: boolean,
  ) {
    super();
    this.clase = CLASE[forma];
  }

  eq(otra: Formula): boolean {
    return otra.texto === this.texto && otra.entorno === this.entorno && otra.forma === this.forma
      && otra.modoBloque === this.modoBloque && otra.numero === this.numero && otra.comoBloque === this.comoBloque;
  }

  toDOM(): HTMLElement {
    const nodo = document.createElement(this.comoBloque ? 'div' : 'span');
    nodo.className = this.clase;
    const dibujada = dibujarFormula(this.texto, this.entorno, this.modoBloque);

    if (dibujada.tipo === 'ok') {
      const cuerpo = document.createElement('span');
      cuerpo.className = 'cm-formula-cuerpo';
      cuerpo.innerHTML = dibujada.html;
      nodo.append(cuerpo);
      if (this.numero) {
        const numero = document.createElement('span');
        numero.className = 'cm-formula-numero';
        numero.textContent = this.numero;
        nodo.append(numero);
      }
    } else if (this.forma === 'en-linea') {
      // Dentro de un párrafo no entra la explicación: va al pasar el cursor y en la vista previa.
      const aviso = document.createElement('span');
      aviso.className = 'cm-formula-error';
      aviso.textContent = 'fórmula con error';
      aviso.title = `No se pudo dibujar la fórmula: ${dibujada.mensaje}\n${ACLARACION}`;
      nodo.append(aviso);
    } else {
      const aviso = document.createElement(this.comoBloque ? 'div' : 'span');
      aviso.className = 'cm-formula-error';
      const motivo = document.createElement('div');
      motivo.textContent = `No se pudo dibujar la fórmula: ${dibujada.mensaje}`;
      const aclaracion = document.createElement('div');
      aclaracion.textContent = ACLARACION;
      aviso.append(motivo, aclaracion);
      nodo.append(aviso);
    }
    return nodo;
  }

  ignoreEvent(): boolean { return false; }
}

export const esMatematica = (e: Elemento): e is Matematica => e.tipo === 'matematica';

// Sin el cursor encima, la fórmula reemplaza a su código. Con el cursor dentro se ve el
// código y, debajo, la vista previa.
export const decorarEcuaciones: Decorador = ({ estado, texto, elementos, objetos, activo }) => {
  const rangos: Range<Decoration>[] = [];
  const doc = estado.doc;

  for (const e of elementos.filter(esMatematica)) {
    const fuente = texto.slice(e.contenido.desde, e.contenido.hasta);
    const tramos = objetos.find((o) => o.desde === e.desde)?.tramos ?? [];
    const numero = tramos.length === 0 ? undefined
      : tramos.length === 1 ? `(${tramos[0].numero})`
        : `(${tramos[0].numero})–(${tramos[tramos.length - 1].numero})`;

    // Una fórmula en bloque que ocupa líneas enteras se dibuja como bloque del editor.
    const primera = doc.lineAt(e.desde);
    const ultima = doc.lineAt(e.hasta);
    const enLineasPropias = !e.enLinea
      && texto.slice(primera.from, e.desde).trim() === '' && texto.slice(e.hasta, ultima.to).trim() === '';
    const rango = enLineasPropias ? { desde: primera.from, hasta: ultima.to } : e;

    if (!activo(rango)) {
      const widget = new Formula(fuente, e.entorno, e.enLinea ? 'en-linea' : 'bloque', !e.enLinea, numero, enLineasPropias);
      rangos.push(Decoration.replace({ widget, block: enLineasPropias, reemplaza: true }).range(rango.desde, rango.hasta));
      continue;
    }

    if (enLineasPropias) {
      for (let n = primera.number; n <= ultima.number; n++) {
        rangos.push(Decoration.line({ class: 'cm-fuente-formula' }).range(doc.line(n).from));
      }
    } else if (e.hasta > e.desde) {
      rangos.push(Decoration.mark({ class: 'cm-fuente-formula' }).range(e.desde, e.hasta));
    }
    const previa = new Formula(fuente, e.entorno, 'previa', !e.enLinea, numero, true);
    rangos.push(Decoration.widget({ widget: previa, block: true, side: 1 }).range(ultima.to));
  }
  return rangos;
};
