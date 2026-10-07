import { EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, WidgetType, type EditorView } from '@codemirror/view';
import { analizar, type Elemento } from '../../compartido/analizador';
import { partesDeFigura } from '../../compartido/flotante';
import { Pastilla } from './pastilla';
import type { ContextoVista, Decorador } from './tipos';

type Entorno = Extract<Elemento, { tipo: 'entorno' }>;
type ElementoImagen = Extract<Elemento, { tipo: 'imagen' }>;

// La imagen de un \includegraphics. `texto` es la ruta tal como está escrita.
class Imagen extends WidgetType {
  readonly clase = 'cm-imagen';

  constructor(readonly texto: string, readonly url: string, readonly alElegir: ContextoVista['alElegirImagen']) { super(); }

  eq(otra: Imagen): boolean { return otra.texto === this.texto && otra.url === this.url; }

  toDOM(vista: EditorView): HTMLElement {
    const nodo = document.createElement('span');
    nodo.className = this.clase;
    const elegir = () => this.alElegir(vista, vista.posAtDOM(nodo));

    const imagen = document.createElement('img');
    imagen.src = this.url;
    imagen.alt = this.texto;
    imagen.title = 'Clic para cambiar la imagen';
    // Arrastrarla sin querer no debe confundirse con soltar un archivo nuevo.
    imagen.draggable = false;
    imagen.addEventListener('click', elegir);
    imagen.addEventListener('error', () => { void this.mostrarRecuadro(imagen, elegir); }, { once: true });

    const verCodigo = document.createElement('button');
    verCodigo.type = 'button';
    verCodigo.className = 'cm-ver-codigo';
    verCodigo.textContent = 'Ver código';
    verCodigo.addEventListener('click', () => {
      vista.dispatch({ selection: { anchor: vista.posAtDOM(nodo) } });
      vista.focus();
    });

    nodo.append(imagen, verCodigo);
    return nodo;
  }

  // El navegador no dibuja PDF en un <img>: se distingue de una imagen que falta.
  private async mostrarRecuadro(imagen: HTMLImageElement, elegir: () => void): Promise<void> {
    const esPdf = await fetch(this.url, { method: 'HEAD' })
      .then((r) => r.ok && (r.headers.get('content-type') ?? '').includes('pdf'), () => false);
    const recuadro = document.createElement('span');
    recuadro.className = esPdf ? 'cm-imagen-recuadro' : 'cm-imagen-recuadro cm-imagen-falta';
    recuadro.textContent = esPdf
      ? `${this.texto.split('/').pop()} (PDF: se ve al compilar)`
      : `No se encuentra ${this.texto}`;
    recuadro.title = 'Clic para cambiar la imagen';
    recuadro.addEventListener('click', elegir);
    imagen.replaceWith(recuadro);
  }

  // Los clics son de la imagen (elegir otra, ver el código): no mueven el cursor. El arrastre de
  // archivos sí llega al editor: si no, soltar uno sobre la imagen lo abriría en la pestaña.
  ignoreEvent(evento: Event): boolean { return !/^drag|^drop$/.test(evento.type); }
}

const esFigura = (e: Elemento): e is Entorno => e.tipo === 'entorno' && e.nombre === 'figure';
const esImagen = (e: Elemento): e is ElementoImagen => e.tipo === 'imagen';

// Con el cursor en el epígrafe de una figura dibujada, lo que lo rodea (`\caption{`, `}`) está
// oculto. Un Retroceso al comienzo o un Suprimir al final borrarían esa llave a ciegas y la
// figura se desarmaría: esos borrados no se aplican. Para tocar el armado está "Ver código".
export const protegerEpigrafe: Extension = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent('delete')) return tr;
  const seleccion = tr.startState.selection;
  if (seleccion.ranges.length !== 1 || !seleccion.main.empty) return tr;
  const cursor = seleccion.main.head;

  const texto = tr.startState.doc.toString();
  const elementos = analizar(texto);
  for (const figura of elementos.filter(esFigura)) {
    if (cursor < figura.desde || cursor > figura.hasta) continue;
    const contenido = partesDeFigura(texto, figura, elementos)?.epigrafe?.contenido;
    if (!contenido || cursor < contenido.desde || cursor > contenido.hasta) continue;
    let saleDelEpigrafe = false;
    tr.changes.iterChangedRanges((desde, hasta) => {
      if (desde < contenido.desde || hasta > contenido.hasta) saleDelEpigrafe = true;
    });
    return saleDelEpigrafe ? [] : tr;
  }
  return tr;
});

// Una figura con la forma de la plantilla se ve como imagen y epígrafe; el armado se oculta.
// El epígrafe sigue siendo texto del documento: tener el cursor ahí no hace aparecer el código.
export const decorarFiguras: Decorador = ({ estado, texto, elementos, ctx, objetos, activo }) => {
  const rangos: Range<Decoration>[] = [];
  const figuras = elementos.filter(esFigura);
  const dibujar = (imagen: ElementoImagen) => {
    const widget = new Imagen(imagen.ruta, ctx.urlDeImagen(imagen.ruta), ctx.alElegirImagen);
    rangos.push(Decoration.replace({ widget, reemplaza: true }).range(imagen.desde, imagen.hasta));
  };

  for (const figura of figuras) {
    const partes = partesDeFigura(texto, figura, elementos);
    if (!partes) continue;
    const contenido = partes.epigrafe?.contenido ?? null;
    const soloEnEpigrafe = contenido !== null
      && estado.selection.ranges.every((r) => r.from >= contenido.desde && r.to <= contenido.hasta);
    if (activo(figura) && !soloEnEpigrafe) continue;

    for (const tramo of partes.ocultar) rangos.push(Decoration.replace({ reemplaza: true }).range(tramo.desde, tramo.hasta));
    dibujar(partes.imagen);
    rangos.push(Decoration.line({ class: 'cm-linea-figura' }).range(estado.doc.lineAt(figura.desde).from));
    if (contenido) {
      const numero = objetos.find((o) => o.desde === figura.desde)?.tramos[0]?.numero;
      const prefijo = new Pastilla(numero ? `Figura ${numero}: ` : 'Figura: ', 'cm-prefijo-epigrafe');
      rangos.push(Decoration.widget({ widget: prefijo, side: -1 }).range(contenido.desde));
      if (contenido.hasta > contenido.desde) rangos.push(Decoration.mark({ class: 'cm-epigrafe' }).range(contenido.desde, contenido.hasta));
    }
  }

  // Una imagen suelta, fuera de toda figura, se dibuja sola.
  for (const imagen of elementos.filter(esImagen)) {
    const enFigura = figuras.some((f) => f.desde <= imagen.desde && imagen.hasta <= f.hasta);
    if (!enFigura && !activo(imagen)) dibujar(imagen);
  }
  return rangos;
};
