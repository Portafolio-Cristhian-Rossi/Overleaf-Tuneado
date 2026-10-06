import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { codeFolding, foldEffect } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { analizar } from '../compartido/analizador';
import type { ArchivoLeido } from '../compartido/tipos';
import { api } from './api';
import { estadoRecargado } from './recarga';
import { crearSesion, type Eleccion, type EstadoGuardado } from './sesion';

export type { Eleccion, EstadoGuardado } from './sesion';

export interface ControlEditor {
  vista: EditorView;
  abrir(ruta: string): Promise<void>;
  guardarAhora(urgente?: boolean): Promise<void>;
  recargar(): Promise<void>;
  // Antes de operar con Git: guarda y deja el editor en solo lectura. false si no pudo guardar.
  congelar(): Promise<boolean>;
  descongelar(): void;
  irA(posicion: number): void;
  irALinea(linea: number): void;
  rutaAbierta(): string | null;
  hayCambiosSinGuardar(): boolean;
}

export interface OpcionesEditor {
  // Se aplican solo a los archivos .tex; el .bib se edita como texto plano.
  extensiones: Extension[];
  alAbrir(ruta: string, archivo: ArchivoLeido): void;
  alCambiarEstado(e: EstadoGuardado, detalle?: string): void;
  alCambiarDocumento(texto: string): void;
  preguntarConflicto(): Promise<Eleccion>;
  alDesaparecer(ruta: string): void;
}

const esTex = (ruta: string) => /\.tex$/i.test(ruta);

// La vista de CodeMirror y su cableado. Cuándo se guarda y cuándo no lo decide la sesión.
export function crearEditor(padre: HTMLElement, o: OpcionesEditor): ControlEditor {
  let soloLectura = false;
  const compartimentoSoloLectura = new Compartment();

  function fabricarEstado(texto: string, ruta: string | null, cursor = 0): EditorState {
    return EditorState.create({
      doc: texto,
      selection: { anchor: cursor },
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        search({ top: true }),
        highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        EditorView.contentAttributes.of({ spellcheck: 'true', lang: 'es', autocorrect: 'off', autocapitalize: 'off' }),
        compartimentoSoloLectura.of(EditorState.readOnly.of(soloLectura)),
        // Todo cambio del documento llega por acá y es del usuario: lo que viene del disco
        // entra como un estado nuevo (ver `cargar`), no como una transacción.
        EditorView.updateListener.of((cambio) => {
          if (!cambio.docChanged) return;
          o.alCambiarDocumento(cambio.state.doc.toString());
          sesion.alEditar();
        }),
        ruta !== null && esTex(ruta) ? [codeFolding({ placeholderText: 'Configuración del documento' }), o.extensiones] : [],
      ],
    });
  }

  const vista = new EditorView({ parent: padre, state: fabricarEstado('', null) });

  // El preámbulo (paquetes, título, autores) queda plegado: se abre con un clic.
  function plegarPreambulo(): void {
    const texto = vista.state.doc.toString();
    const preambulo = analizar(texto).find((e) => e.tipo === 'preambulo');
    if (!preambulo) return;
    const desde = vista.state.doc.line(1).to;
    const hasta = texto[preambulo.hasta - 1] === '\n' ? preambulo.hasta - 1 : preambulo.hasta;
    if (hasta > desde) vista.dispatch({ effects: foldEffect.of({ from: desde, to: hasta }) });
  }

  const sesion = crearSesion({
    texto: () => vista.state.doc.toString(),
    cargar(texto, { archivoNuevo, ruta }) {
      const desplazamiento = vista.scrollDOM.scrollTop;
      vista.setState(archivoNuevo
        ? fabricarEstado(texto, ruta)
        : estadoRecargado(vista.state, texto, (t, cursor) => fabricarEstado(t, ruta, cursor)));
      if (esTex(ruta)) plegarPreambulo();
      vista.scrollDOM.scrollTop = archivoNuevo ? 0 : desplazamiento;
      o.alCambiarDocumento(texto);
    },
    soloLectura(si) {
      soloLectura = si;
      vista.dispatch({ effects: compartimentoSoloLectura.reconfigure(EditorState.readOnly.of(si)) });
      padre.classList.toggle('solo-lectura', si);
    },
  }, api, {
    alAbrir: o.alAbrir,
    alCambiarEstado: o.alCambiarEstado,
    preguntarConflicto: o.preguntarConflicto,
    alDesaparecer: o.alDesaparecer,
  });

  function irA(posicion: number): void {
    const destino = Math.max(0, Math.min(posicion, vista.state.doc.length));
    vista.dispatch({ selection: { anchor: destino }, effects: EditorView.scrollIntoView(destino, { y: 'start', yMargin: 24 }) });
    vista.focus();
  }

  return {
    vista,
    abrir: sesion.abrir,
    guardarAhora: sesion.guardarAhora,
    recargar: sesion.recargar,
    congelar: sesion.congelar,
    descongelar: sesion.descongelar,
    irA,
    irALinea(linea) {
      const n = Math.max(1, Math.min(linea, vista.state.doc.lines));
      irA(vista.state.doc.line(n).from);
    },
    rutaAbierta: sesion.rutaAbierta,
    hayCambiosSinGuardar: sesion.hayCambiosSinGuardar,
  };
}
