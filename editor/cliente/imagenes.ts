import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { RespuestaDeSubida } from './api';
import { aplicarEdicion } from './atajos';
import { insertarFigura } from './comandos';
import type { preguntar } from './pantalla/dom';

export interface Subida {
  subir(nombre: string, archivo: Blob): Promise<RespuestaDeSubida>;
  preguntar: typeof preguntar;
  avisar(mensaje: string): void;
}

const NO_SE_PUDO = 'No se pudo subir la imagen. Probá de nuevo.';

export const esImagenAdmitida = (nombre: string) => /\.(?:png|jpe?g|pdf)$/i.test(nombre);

// Sube el archivo a figs/ resolviendo el nombre repetido con una pregunta.
// Devuelve la ruta a usar en \includegraphics, o null si no hay ninguna.
export function crearSubida(s: Subida): (archivo: File) => Promise<string | null> {
  return async (archivo) => {
    try {
      let r = await s.subir(archivo.name, archivo);
      if (r.estado === 409 && r.ruta && r.sugerido) {
        const eleccion = await s.preguntar(`Ya hay una imagen llamada ${r.ruta.split('/').pop()} en figs/.`, [
          { texto: 'Usar la que ya está', valor: 'usar' as const },
          { texto: `Guardar como ${r.sugerido}`, valor: 'otra' as const },
          { texto: 'Cancelar', valor: 'cancelar' as const, neutra: true },
        ]);
        if (eleccion === 'cancelar') return null;
        if (eleccion === 'usar') return r.ruta;
        r = await s.subir(r.sugerido, archivo);
      }
      if (r.estado === 201 && r.ruta) return r.ruta;
      s.avisar((r.estado === 400 || r.estado === 413) && r.mensaje ? r.mensaje : NO_SE_PUDO);
      return null;
    } catch {
      s.avisar(NO_SE_PUDO);
      return null;
    }
  };
}

// Un archivo soltado fuera del texto (el lateral, el panel del PDF, los márgenes) haría que el
// navegador lo abriera en la pestaña y el editor desapareciera: ahí el arrastre no hace nada.
export function evitarAbrirArchivosSoltados(destino: EventTarget): void {
  const alArrastrar = (evento: Event) => {
    const datos = (evento as DragEvent).dataTransfer;
    if (!datos || !Array.from(datos.types).includes('Files')) return;
    // Si el editor ya lo aceptó, el cursor queda como él lo dejó.
    if (evento.type === 'dragover' && !evento.defaultPrevented) datos.dropEffect = 'none';
    evento.preventDefault();
  };
  destino.addEventListener('dragover', alArrastrar);
  destino.addEventListener('drop', alArrastrar);
}

// Soltar una imagen sobre el editor la sube e inserta la figura completa en ese lugar.
export function extensionArrastre(o: { subir(archivo: File): Promise<string | null>; avisar(mensaje: string): void }): Extension {
  const traeArchivos = (evento: DragEvent) => evento.dataTransfer?.types.includes('Files') === true;

  async function soltar(vista: EditorView, archivo: File, posicion: number): Promise<void> {
    const ruta = await o.subir(archivo);
    if (ruta === null) return;
    if (vista.state.readOnly) {
      o.avisar(`La imagen quedó guardada como ${ruta}, pero el editor no admite cambios en este momento. Insertá la figura después.`);
      return;
    }
    const texto = vista.state.doc.toString();
    aplicarEdicion(vista, insertarFigura(texto, Math.min(posicion, texto.length), ruta));
  }

  return EditorView.domEventHandlers({
    dragover(evento) {
      if (!traeArchivos(evento)) return false;
      evento.preventDefault();
      return true;
    },
    drop(evento, vista) {
      const archivo = evento.dataTransfer?.files[0];
      if (!traeArchivos(evento) || !archivo) return false;
      evento.preventDefault();
      if (vista.state.readOnly) return true;
      if (!esImagenAdmitida(archivo.name)) {
        o.avisar('Solo se pueden arrastrar imágenes PNG, JPG o PDF.');
        return true;
      }
      const posicion = vista.posAtCoords({ x: evento.clientX, y: evento.clientY }) ?? vista.state.selection.main.head;
      void soltar(vista, archivo, posicion);
      return true;
    },
  });
}
