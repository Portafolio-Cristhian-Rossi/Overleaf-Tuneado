import type { Range } from '@codemirror/state';
import { Decoration, WidgetType, type EditorView } from '@codemirror/view';
import { analizar, type Elemento, type Rango } from '../../compartido/analizador';
import { partesDeTabla } from '../../compartido/flotante';
import { analizarTabla, type Alineacion, type TablaLeida } from '../../compartido/tabla';
import { el } from '../pantalla/dom';
import { dibujarFormula } from './formula';
import { Pastilla } from './pastilla';
import type { Decorador } from './tipos';

type Entorno = Extract<Elemento, { tipo: 'entorno' }>;
type Cita = Extract<Elemento, { tipo: 'cita' }>;

export type PiezaDeCelda =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'formato'; estilo: 'negrita' | 'cursiva' | 'mono'; piezas: PiezaDeCelda[] }
  | { tipo: 'formula'; fuente: string }
  | { tipo: 'cita'; texto: string };

// Lo que se ve de una celda: formato, fórmulas en línea y citas dibujados; lo demás, tal cual.
export function piezasDeCelda(texto: string, contenido: Rango, elementos: Elemento[], textoDeCita: (cita: Cita) => string): PiezaDeCelda[] {
  const piezas: PiezaDeCelda[] = [];
  let cursor = contenido.desde;
  const suelto = (hasta: number) => {
    if (hasta > cursor) piezas.push({ tipo: 'texto', texto: texto.slice(cursor, hasta) });
  };

  for (const e of elementos) {
    // Fuera de la celda, o dentro de una pieza que ya se tomó.
    if (e.desde < cursor || e.hasta > contenido.hasta) continue;
    let pieza: PiezaDeCelda;
    if (e.tipo === 'formato') pieza = { tipo: 'formato', estilo: e.estilo, piezas: piezasDeCelda(texto, e.contenido, elementos, textoDeCita) };
    else if (e.tipo === 'matematica' && e.enLinea) pieza = { tipo: 'formula', fuente: texto.slice(e.contenido.desde, e.contenido.hasta) };
    else if (e.tipo === 'cita') pieza = { tipo: 'cita', texto: textoDeCita(e) };
    else continue;
    suelto(e.desde);
    piezas.push(pieza);
    cursor = e.hasta;
  }
  suelto(contenido.hasta);
  return piezas;
}

const CLASE_DE_ESTILO = { negrita: 'cm-negrita', cursiva: 'cm-cursiva', mono: 'cm-mono' } as const;
const ALINEACION: Record<Alineacion, string> = { l: 'left', p: 'left', c: 'center', r: 'right' };
const AVISO_SOLO_LECTURA = 'Esta tabla tiene celdas combinadas: se edita desde el código. Clic para verlo.';

// El texto de una celda nunca se interpreta como HTML: lo único que se inserta así es lo que dibuja KaTeX.
function nodosDe(piezas: PiezaDeCelda[]): Node[] {
  return piezas.map((pieza) => {
    if (pieza.tipo === 'texto') return document.createTextNode(pieza.texto);
    if (pieza.tipo === 'cita') return el('span', { clase: 'cm-cita' }, pieza.texto);
    if (pieza.tipo === 'formato') return el('span', { clase: CLASE_DE_ESTILO[pieza.estilo] }, ...nodosDe(pieza.piezas));
    const dibujada = dibujarFormula(pieza.fuente, null, false);
    if (dibujada.tipo === 'error') return el('span', { clase: 'cm-formula-error', title: dibujada.mensaje }, 'fórmula con error');
    const formula = el('span', { clase: 'cm-formula' });
    formula.innerHTML = dibujada.html;
    return formula;
  });
}

const esTabular = (e: Elemento): e is Entorno => e.tipo === 'entorno' && e.nombre === 'tabular';
const esFlotante = (e: Elemento): e is Entorno => e.tipo === 'entorno' && e.nombre === 'table';
// Mientras el editor no lea la bibliografía, una cita se ve con sus claves, como en el texto.
const clavesDe = (cita: Cita) => cita.claves.join(', ');

// La tabla dibujada. `texto` es la fuente del tabular, de \begin a \end: el dibujo sale solo de ahí.
class TablaDibujada extends WidgetType {
  constructor(readonly texto: string, readonly clase: string) { super(); }

  eq(otra: TablaDibujada): boolean { return otra.texto === this.texto && otra.clase === this.clase; }

  toDOM(vista: EditorView): HTMLElement {
    const nodo = el('span', { clase: this.clase });
    const elementos = analizar(this.texto);
    const tabular = elementos.find(esTabular);
    const tabla = tabular ? analizarTabla(this.texto, tabular.interior) : null;
    if (!tabla || tabla.clase === 'no-reconocida') {
      nodo.textContent = this.texto;
      return nodo;
    }
    const verCodigo = () => {
      vista.dispatch({ selection: { anchor: vista.posAtDOM(nodo) } });
      vista.focus();
    };

    const cuerpo = el('table', { clase: tabla.lineaFinal ? 'cm-tabla-final' : undefined });
    tabla.filas.forEach((fila, f) => {
      const tr = el('tr', { clase: fila.lineaArriba ? 'cm-tabla-linea' : undefined });
      let columna = 0;
      fila.celdas.forEach((celda, c) => {
        const td = el('td', { 'data-fila': f, 'data-columna': c, colspan: celda.ancho });
        td.style.textAlign = ALINEACION[celda.alineacion ?? tabla.columnas[columna].alineacion];
        const piezas = piezasDeCelda(this.texto, celda.contenido, elementos, clavesDe);
        // Una celda vacía igual tiene que tener alto, para poder hacerle clic.
        td.append(...(piezas.length > 0 ? nodosDe(piezas) : [' ']));
        tr.append(td);
        columna += celda.ancho;
      });
      cuerpo.append(tr);
    });

    if (tabla.clase === 'solo-lectura') {
      cuerpo.title = AVISO_SOLO_LECTURA;
      cuerpo.addEventListener('click', verCodigo);
    }
    nodo.append(cuerpo, el('button', { type: 'button', clase: 'cm-ver-codigo', alClick: verCodigo }, 'Ver código'));
    return nodo;
  }

  // Los clics y las teclas son de la tabla (sus celdas, su menú): no mueven el cursor del editor.
  // El arrastre de archivos sí llega: si no, soltar uno sobre la tabla lo abriría en la pestaña.
  ignoreEvent(evento: Event): boolean { return !/^drag|^drop$/.test(evento.type); }
}

// Un tabular que el editor reconoce se ve como tabla. Si su flotante tiene la forma de la
// plantilla, el armado se oculta y el epígrafe se edita en el lugar, como en una figura.
export const decorarTablas: Decorador = ({ estado, texto, elementos, objetos, activo }) => {
  const rangos: Range<Decoration>[] = [];
  const dibujar = (tabular: Entorno, tabla: TablaLeida) => {
    const widget = new TablaDibujada(texto.slice(tabular.desde, tabular.hasta), tabla.clase === 'simple' ? 'cm-tabla' : 'cm-tabla cm-tabla-solo-lectura');
    // `cubre`: nada de lo que hay dentro del tabular se decora por separado.
    rangos.push(Decoration.replace({ widget, reemplaza: true, cubre: true }).range(tabular.desde, tabular.hasta));
  };

  const deUnFlotante = new Set<number>();
  for (const flotante of elementos.filter(esFlotante)) {
    const partes = partesDeTabla(texto, flotante, elementos);
    if (!partes) continue;
    deUnFlotante.add(partes.tabular.desde);
    const contenido = partes.epigrafe?.contenido ?? null;
    const soloEnEpigrafe = contenido !== null
      && estado.selection.ranges.every((r) => r.from >= contenido.desde && r.to <= contenido.hasta);
    if (activo(flotante) && !soloEnEpigrafe) continue;

    for (const tramo of partes.ocultar) rangos.push(Decoration.replace({ reemplaza: true }).range(tramo.desde, tramo.hasta));
    dibujar(partes.tabular, partes.tabla);
    rangos.push(Decoration.line({ class: 'cm-linea-tabla' }).range(estado.doc.lineAt(flotante.desde).from));
    if (contenido) {
      const numero = objetos.find((o) => o.desde === flotante.desde)?.tramos[0]?.numero;
      const prefijo = new Pastilla(numero ? `Tabla ${numero}: ` : 'Tabla: ', 'cm-prefijo-epigrafe');
      rangos.push(Decoration.widget({ widget: prefijo, side: -1 }).range(contenido.desde));
      if (contenido.hasta > contenido.desde) rangos.push(Decoration.mark({ class: 'cm-epigrafe' }).range(contenido.desde, contenido.hasta));
    }
  }

  // Un tabular suelto, o en un flotante armado de otra forma, se dibuja solo.
  const tabulares = elementos.filter(esTabular);
  for (const tabular of tabulares) {
    if (deUnFlotante.has(tabular.desde) || activo(tabular)) continue;
    if (tabulares.some((otro) => otro.desde < tabular.desde && tabular.hasta <= otro.hasta)) continue;
    const tabla = analizarTabla(texto, tabular.interior);
    if (tabla.clase !== 'no-reconocida') dibujar(tabular, tabla);
  }
  return rangos;
};
