import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { codeFolding, foldEffect } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Annotation, Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { analizar } from '../compartido/analizador';
import type { ArchivoLeido, FinDeLinea } from '../compartido/tipos';
import { ErrorDeApi, api } from './api';

export type EstadoGuardado = 'guardado' | 'guardando' | 'sin-guardar' | 'error';

export interface ControlEditor {
  vista: EditorView;
  abrir(ruta: string): Promise<void>;
  guardarAhora(urgente?: boolean): Promise<void>;
  recargar(): Promise<void>;
  irA(posicion: number): void;
  irALinea(linea: number): void;
  rutaAbierta(): string | null;
  hayCambiosSinGuardar(): boolean;
  bloquear(si: boolean): void;
}

export interface OpcionesEditor {
  // Se aplican solo a los archivos .tex; el .bib se edita como texto plano.
  extensiones: Extension[];
  alAbrir(ruta: string, texto: string): void;
  alCambiarEstado(e: EstadoGuardado): void;
  alCambiarDocumento(texto: string): void;
  preguntarConflicto(): Promise<'recargar' | 'sobrescribir'>;
  alDesaparecer(ruta: string): void;
}

const ESPERA_DE_GUARDADO_MS = 1000;
// Marca los cambios que vienen del disco, para no tomarlos por ediciones del usuario.
const cargaExterna = Annotation.define<boolean>();

export function crearEditor(padre: HTMLElement, o: OpcionesEditor): ControlEditor {
  let ruta: string | null = null;
  let finDeLinea: FinDeLinea = '\n';
  let bom = false;
  let version = '';
  let sucio = false;
  let detenido = false;          // el archivo ya no existe: no se guarda más
  let bloqueado = false;
  let reloj: ReturnType<typeof setTimeout> | undefined;
  let cola: Promise<void> = Promise.resolve();

  const soloLectura = new Compartment();
  const esSoloLectura = () => EditorState.readOnly.of(bloqueado || detenido);

  function estadoInicial(texto: string, esTex: boolean): EditorState {
    return EditorState.create({
      doc: texto,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        search({ top: true }),
        highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        EditorView.contentAttributes.of({ spellcheck: 'true', lang: 'es', autocorrect: 'off', autocapitalize: 'off' }),
        soloLectura.of(esSoloLectura()),
        EditorView.updateListener.of((cambio) => {
          if (!cambio.docChanged) return;
          o.alCambiarDocumento(cambio.state.doc.toString());
          if (cambio.transactions.some((t) => t.annotation(cargaExterna))) return;
          sucio = true;
          o.alCambiarEstado('sin-guardar');
          clearTimeout(reloj);
          reloj = setTimeout(() => { void guardarAhora(); }, ESPERA_DE_GUARDADO_MS);
        }),
        esTex ? [codeFolding({ placeholderText: 'Configuración del documento' }), o.extensiones] : [],
      ],
    });
  }

  const vista = new EditorView({ parent: padre, state: estadoInicial('', false) });

  // El preámbulo (paquetes, título, autores) queda plegado: se abre con un clic.
  function plegarPreambulo(): void {
    const texto = vista.state.doc.toString();
    const preambulo = analizar(texto).find((e) => e.tipo === 'preambulo');
    if (!preambulo) return;
    const desde = vista.state.doc.line(1).to;
    const hasta = texto[preambulo.hasta - 1] === '\n' ? preambulo.hasta - 1 : preambulo.hasta;
    if (hasta > desde) vista.dispatch({ effects: foldEffect.of({ from: desde, to: hasta }) });
  }

  function tomarDatos(archivo: ArchivoLeido): void {
    finDeLinea = archivo.finDeLinea;
    bom = archivo.bom;
    version = archivo.version;
  }

  // Reemplaza el texto por el del disco conservando, en lo posible, la posición del cursor.
  function reemplazarTexto(archivo: ArchivoLeido): void {
    tomarDatos(archivo);
    const cursor = Math.min(vista.state.selection.main.head, archivo.contenido.length);
    vista.dispatch({
      changes: { from: 0, to: vista.state.doc.length, insert: archivo.contenido },
      selection: { anchor: cursor },
      annotations: cargaExterna.of(true),
    });
    sucio = false;
    o.alCambiarEstado('guardado');
  }

  function desaparecio(): void {
    detenido = true;
    sucio = false;
    clearTimeout(reloj);
    vista.dispatch({ effects: soloLectura.reconfigure(esSoloLectura()) });
    o.alCambiarEstado('error');
    if (ruta) o.alDesaparecer(ruta);
  }

  async function guardar(urgente: boolean): Promise<void> {
    if (!ruta || !sucio || detenido) return;
    const rutaGuardada = ruta;
    sucio = false;
    o.alCambiarEstado('guardando');
    const datos = () => ({ contenido: vista.state.doc.toString(), finDeLinea, bom, versionBase: version });
    try {
      let r = await api.escribir(rutaGuardada, datos(), urgente);
      if (r.tipo === 'cambio-en-disco') {
        if ((await o.preguntarConflicto()) === 'recargar') {
          reemplazarTexto(r.actual);
          return;
        }
        r = await api.escribir(rutaGuardada, { ...datos(), forzar: true });
      }
      if (r.tipo === 'desaparecido') return desaparecio();
      if (r.tipo === 'ok') version = r.version;
      o.alCambiarEstado(sucio ? 'sin-guardar' : 'guardado');
    } catch {
      sucio = true;
      o.alCambiarEstado('error');
    }
  }

  // Los guardados van de a uno: el siguiente siempre parte de la versión que dejó el anterior.
  function guardarAhora(urgente = false): Promise<void> {
    clearTimeout(reloj);
    cola = cola.then(() => guardar(urgente));
    return cola;
  }

  async function abrir(nueva: string): Promise<void> {
    await guardarAhora();
    const archivo = await api.leer(nueva);
    ruta = nueva;
    detenido = false;
    sucio = false;
    tomarDatos(archivo);
    const esTex = /\.tex$/i.test(nueva);
    vista.setState(estadoInicial(archivo.contenido, esTex));
    if (esTex) plegarPreambulo();
    vista.scrollDOM.scrollTop = 0;
    o.alAbrir(nueva, archivo.contenido);
    o.alCambiarEstado('guardado');
  }

  // Trae lo que haya en disco: en silencio si no hay ediciones pendientes, preguntando si las hay.
  async function recargar(): Promise<void> {
    if (!ruta || detenido) return;
    await cola;
    let archivo: ArchivoLeido;
    try {
      archivo = await api.leer(ruta);
    } catch (e) {
      if (e instanceof ErrorDeApi && e.estado === 404) desaparecio();
      return;
    }
    if (archivo.version === version) return;
    if (!sucio || (await o.preguntarConflicto()) === 'recargar') {
      clearTimeout(reloj);
      reemplazarTexto(archivo);
    } else {
      version = archivo.version;   // se conserva lo del editor: el próximo guardado pisa el disco
      void guardarAhora();
    }
  }

  function irA(posicion: number): void {
    const destino = Math.max(0, Math.min(posicion, vista.state.doc.length));
    vista.dispatch({ selection: { anchor: destino }, effects: EditorView.scrollIntoView(destino, { y: 'start', yMargin: 24 }) });
    vista.focus();
  }

  return {
    vista,
    abrir,
    guardarAhora,
    recargar,
    irA,
    irALinea(linea) {
      const n = Math.max(1, Math.min(linea, vista.state.doc.lines));
      irA(vista.state.doc.line(n).from);
    },
    rutaAbierta: () => ruta,
    hayCambiosSinGuardar: () => sucio,
    bloquear(si) {
      bloqueado = si;
      vista.dispatch({ effects: soloLectura.reconfigure(esSoloLectura()) });
      padre.classList.toggle('bloqueado', si);
    },
  };
}
