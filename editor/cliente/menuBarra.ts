import { autocompletion, snippet, startCompletion, type Completion, type CompletionSource } from '@codemirror/autocomplete';
import type { EditorState, Extension, Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Etiqueta } from '../compartido/tipos';
import { aplicarEdicion } from './atajos';
import { insertarFigura, lugarDeBloque } from './comandos';
import { PLANTILLAS, type Plantilla } from './plantillas';

export interface ContextoMenu {
  paquetes(): string[];
  etiquetas(): Etiqueta[];
  // Agrega el paquete al archivo principal si el usuario acepta; false si lo rechaza.
  asegurarPaquete(paquete: string, configuracion?: string): Promise<boolean>;
  // Abre el selector de imágenes; null si se cancela.
  elegirImagen(): Promise<string | null>;
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// El menú se abre con "/" como primer carácter no blanco de la línea.
export function detectarBarra(lineaHastaCursor: string): { desde: number; consulta: string } | null {
  const m = lineaHastaCursor.match(/^(\s*)\/(\p{L}*)$/u);
  return m ? { desde: m[1].length, consulta: m[2] } : null;
}

export function filtrarPlantillas(consulta: string): Plantilla[] {
  const buscado = normalizar(consulta);
  return PLANTILLAS.filter((p) => normalizar(p.nombre).split(/\s+/).some((palabra) => palabra.startsWith(buscado)));
}

const NOMBRE_DE_CLASE = { figura: 'Figura', tabla: 'Tabla', ecuacion: 'Ecuación' } as const;

// Cómo se le presenta una etiqueta a quien escribe: "2.1 Título" o "Figura 2.1".
export function describirEtiqueta(e: Etiqueta): string {
  if (e.clase === 'seccion') return [e.numero, e.titulo].filter(Boolean).join(' ');
  return e.numero ? `${NOMBRE_DE_CLASE[e.clase]} ${e.numero}` : '';
}

export function filtrarEtiquetas(etiquetas: Etiqueta[], consulta: string): Etiqueta[] {
  const buscado = normalizar(consulta);
  return etiquetas.filter((e) => normalizar(`${e.nombre} ${describirEtiqueta(e)}`).includes(buscado));
}

type PlantillaDeTexto = Plantilla & { texto: string };
// Lo que `snippet` necesita de un editor: alcanza para probarlo sin pantalla.
interface Destino { state: EditorState; dispatch(tr: Transaction): void }

// Pone el texto de una plantilla cuando no se la llamó con "/": una cita o una referencia, donde
// está el cursor; un bloque, en líneas propias y fuera del bloque que tenga el cursor adentro.
export function colocarPlantilla(destino: Destino, plantilla: PlantillaDeTexto): void {
  const { from, to, head } = destino.state.selection.main;
  if (plantilla.enLinea) {
    snippet(plantilla.texto)(destino, null, from, to);
    return;
  }
  const lugar = lugarDeBloque(destino.state.doc.toString(), head);
  // Delante de otra línea se inserta desde el final de la anterior: `snippet` le copia a cada
  // línea la sangría de aquella donde empieza, y la de la línea siguiente no es del bloque.
  if (lugar.despues) snippet(`\n${plantilla.texto.replace(/\n$/, '')}`)(destino, null, lugar.desde - 1, lugar.desde - 1);
  else snippet(lugar.antes + plantilla.texto)(destino, null, lugar.desde, lugar.hasta);
}

// Inserta una plantilla: pide su paquete si el informe no lo carga y, si es una figura, abre el
// selector de imágenes. `colocar` pone el texto de las demás.
async function insertarPlantilla(ctx: ContextoMenu, vista: EditorView, plantilla: Plantilla, colocar: (p: PlantillaDeTexto) => void): Promise<void> {
  if (plantilla.paquete && !ctx.paquetes().includes(plantilla.paquete)) {
    if (!(await ctx.asegurarPaquete(plantilla.paquete, plantilla.configuracion))) return;
  }
  if ('accion' in plantilla) {
    const ruta = await ctx.elegirImagen();
    if (ruta !== null && !vista.state.readOnly) {
      aplicarEdicion(vista, insertarFigura(vista.state.doc.toString(), vista.state.selection.main.head, ruta));
    }
    vista.focus();
    return;
  }
  if (vista.state.readOnly) return;
  colocar(plantilla);
  vista.focus();
  if (plantilla.id === 'referencia') startCompletion(vista);
}

// El botón Insertar de la barra: las mismas plantillas que el menú "/".
export async function insertarDesdeBoton(ctx: ContextoMenu, vista: EditorView, plantilla: Plantilla): Promise<void> {
  if (vista.state.readOnly) return;
  await insertarPlantilla(ctx, vista, plantilla, (p) => colocarPlantilla(vista, p));
}

export function extensionMenu(ctx: ContextoMenu): Extension {
  async function insertar(vista: EditorView, plantilla: Plantilla, desde: number, hasta: number): Promise<void> {
    vista.dispatch({ changes: { from: desde, to: hasta, insert: '' } });
    await insertarPlantilla(ctx, vista, plantilla, (p) => {
      // Agregar el paquete pudo mover el texto: se inserta donde quedó el cursor.
      const cursor = vista.state.selection.main.head;
      snippet(p.texto)(vista, null, cursor, cursor);
    });
  }

  const plantillas: CompletionSource = (c) => {
    const linea = c.state.doc.lineAt(c.pos);
    const barra = detectarBarra(c.state.sliceDoc(linea.from, c.pos));
    if (!barra) return null;
    return {
      from: linea.from + barra.desde,
      filter: false,
      options: filtrarPlantillas(barra.consulta).map((p): Completion => ({
        label: p.nombre,
        apply: (vista, _opcion, desde, hasta) => { void insertar(vista, p, desde, hasta); },
      })),
    };
  };

  // Dentro de \ref{…} se ofrecen las etiquetas del informe por su número y título.
  const etiquetas: CompletionSource = (c) => {
    const previo = c.matchBefore(/\\ref\{[^}\n]*/);
    if (!previo) return null;
    const desde = previo.from + '\\ref{'.length;
    return {
      from: desde,
      filter: false,
      options: filtrarEtiquetas(ctx.etiquetas(), c.state.sliceDoc(desde, c.pos)).map((e): Completion => ({
        label: describirEtiqueta(e) || e.nombre,
        detail: e.nombre,
        apply: e.nombre,
      })),
    };
  };

  return autocompletion({ override: [plantillas, etiquetas], activateOnTyping: true, icons: false, defaultKeymap: true });
}
