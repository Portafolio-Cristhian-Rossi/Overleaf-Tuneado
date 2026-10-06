import { autocompletion, snippet, startCompletion, type Completion, type CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Etiqueta } from '../compartido/tipos';
import { aplicarEdicion } from './atajos';
import { insertarFigura } from './comandos';
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

export function extensionMenu(ctx: ContextoMenu): Extension {
  async function insertar(vista: EditorView, plantilla: Plantilla, desde: number, hasta: number): Promise<void> {
    vista.dispatch({ changes: { from: desde, to: hasta, insert: '' } });
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
    // Agregar el paquete pudo mover el texto: se inserta donde quedó el cursor.
    const cursor = vista.state.selection.main.head;
    snippet(plantilla.texto)(vista, null, cursor, cursor);
    vista.focus();
    if (plantilla.id === 'referencia') startCompletion(vista);
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
