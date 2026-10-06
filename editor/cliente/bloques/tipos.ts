import type { EditorState, Range } from '@codemirror/state';
import type { Decoration, EditorView } from '@codemirror/view';
import type { Elemento, Rango } from '../../compartido/analizador';
import type { ObjetoNumerado } from '../../compartido/numeracion';
import type { Etiqueta } from '../../compartido/tipos';

export interface ContextoVista {
  numeroCapitulo: string | null;
  etiquetas: Map<string, Etiqueta>;
  // Dirección desde la que el navegador carga una imagen del informe.
  urlDeImagen(ruta: string): string;
  // Clic en una imagen dibujada: `posicion` cae dentro de su \includegraphics.
  alElegirImagen(vista: EditorView, posicion: number): void;
}

// Lo que cada bloque necesita para dibujarse: el documento ya analizado y numerado.
export interface Dibujo {
  estado: EditorState; texto: string; elementos: Elemento[]; ctx: ContextoVista;
  objetos: ObjetoNumerado[];
  // La selección toca el rango y el editor tiene foco: ahí se muestra el código.
  activo(r: Rango): boolean;
}

// Cada clase de bloque devuelve sus decoraciones; ninguna modifica el documento.
export type Decorador = (d: Dibujo) => Range<Decoration>[];
