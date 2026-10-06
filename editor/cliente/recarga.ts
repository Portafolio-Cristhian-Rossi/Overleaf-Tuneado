import type { EditorState } from '@codemirror/state';

// Estado del editor tras reemplazar todo el texto por el que está en disco.
//
// Es siempre un estado nuevo, nunca una edición sobre el anterior: así lo recargado no entra
// al historial de deshacer. Si entrara, un Ctrl+Z de más borraría lo que trajo un compañero,
// el guardado automático lo escribiría, y el siguiente Enviar lo eliminaría de Overleaf.
export function estadoRecargado(
  anterior: EditorState,
  texto: string,
  fabricar: (texto: string, cursor: number) => EditorState,
): EditorState {
  return fabricar(texto, Math.min(anterior.selection.main.head, texto.length));
}
