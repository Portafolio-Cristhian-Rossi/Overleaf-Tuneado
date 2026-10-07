import type { Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { alternarFormato, cambiarNivelTitulo, nivelEnPosicion, type Edicion } from './comandos';

export type Nivel = 0 | 1 | 2 | 3 | null;

export function aplicarEdicion(vista: EditorView, e: Edicion): void {
  vista.dispatch({
    changes: e.cambios.map((c) => ({ from: c.desde, to: c.hasta, insert: c.insertar })),
    selection: { anchor: e.seleccion.ancla, head: e.seleccion.cabeza },
    scrollIntoView: true,
    userEvent: 'input',
  });
  vista.focus();
}

export function darFormato(vista: EditorView, comando: 'textbf' | 'textit'): boolean {
  if (vista.state.readOnly) return false;
  const { from, to } = vista.state.selection.main;
  aplicarEdicion(vista, alternarFormato(vista.state.doc.toString(), { desde: from, hasta: to }, comando));
  return true;
}

export function darNivel(vista: EditorView, nivel: Nivel): void {
  if (vista.state.readOnly) return;
  aplicarEdicion(vista, cambiarNivelTitulo(vista.state.doc.toString(), vista.state.selection.main.head, nivel));
}

// Ctrl+B, Ctrl+I y Ctrl+K (citar), y aviso del nivel de título de la línea donde está el cursor.
export function extensionAtajos(alCambiarNivel: (nivel: Nivel) => void, alCitar: (vista: EditorView) => void): Extension {
  return [
    keymap.of([
      { key: 'Mod-b', run: (vista) => darFormato(vista, 'textbf') },
      { key: 'Mod-i', run: (vista) => darFormato(vista, 'textit') },
      // Sin preventDefault el navegador se lleva el foco a su barra de búsqueda.
      { key: 'Mod-k', preventDefault: true, run: (vista) => { alCitar(vista); return true; } },
    ]),
    EditorView.updateListener.of((cambio) => {
      if (cambio.docChanged || cambio.selectionSet) {
        alCambiarNivel(nivelEnPosicion(cambio.state.doc.toString(), cambio.state.selection.main.head));
      }
    }),
  ];
}
