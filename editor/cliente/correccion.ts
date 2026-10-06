import { linter, type Action, type Diagnostic } from '@codemirror/lint';
import { isolateHistory } from '@codemirror/commands';
import { Prec, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from '@codemirror/view';
import { decidir } from '../compartido/autocorreccion';
import { parrafosAnotados, type Parrafo, type Segmento } from '../compartido/prosa';
import type { Aviso, EstadoCorrector } from '../compartido/tipos';

// Corrección en el editor: subrayados con sugerencias, y autocorrección de lo inequívoco.
// La revisión la hace el servidor (LanguageTool); acá se decide qué pedir y qué mostrar.

export interface ApiCorreccion {
  estado(): Promise<EstadoCorrector>;
  revisar(parrafos: Segmento[][]): Promise<Aviso[][]>;
  diccionario(): Promise<{ palabras: string[]; excepciones: string[] }>;
  agregarPalabra(palabra: string): Promise<void>;
  agregarExcepcion(palabra: string): Promise<void>;
}

const ES_LETRA = /\p{L}/u;
const LARGO_MINIMO = 3;
// Lo que precede a la palabra y delata que es parte de un comando, una clave o una ruta.
const PREFIJO_NO_PROSA = /[\\\d_:@/.]/;
const SEPARADOR = /^[\s.,;:!?)\]»"”]$/u;
const REGLA_NO_EXISTE = 'MORFOLOGIK_RULE_ES';

// La palabra que termina justo en `posicion`, si es una palabra de prosa.
export function palabraAntesDe(texto: string, posicion: number): { desde: number; hasta: number; palabra: string } | null {
  let desde = posicion;
  while (desde > 0 && ES_LETRA.test(texto[desde - 1])) desde--;
  if (posicion - desde < LARGO_MINIMO) return null;
  if (desde > 0 && PREFIJO_NO_PROSA.test(texto[desde - 1])) return null;
  return { desde, hasta: posicion, palabra: texto.slice(desde, posicion) };
}

// ¿El tramo [desde, hasta) del documento cae entero dentro de un segmento de prosa del párrafo?
export function tramoDeProsa(parrafo: Parrafo, desde: number, hasta: number): boolean {
  let inicio = parrafo.desde;
  for (const s of parrafo.segmentos) {
    const fin = inicio + s.fuente.length;
    if (desde >= inicio && hasta <= fin) return s.tipo === 'texto';
    inicio = fin;
  }
  return false;
}

// Revisa por párrafo y recuerda el resultado: al editar, solo se vuelve a pedir lo que cambió.
export function crearRevisor(api: Pick<ApiCorreccion, 'revisar'>) {
  const recordados = new Map<string, Aviso[]>();
  const clave = (p: Parrafo) => JSON.stringify(p.segmentos);
  let fallo = false;

  async function completar(parrafos: Parrafo[]): Promise<boolean> {
    const faltantes = parrafos.filter((p) => !recordados.has(clave(p)));
    if (faltantes.length === 0) return true;
    try {
      const respuestas = await api.revisar(faltantes.map((p) => p.segmentos));
      faltantes.forEach((p, i) => recordados.set(clave(p), respuestas[i] ?? []));
      return true;
    } catch {
      return false;   // el fallo no se recuerda: se reintenta con la próxima edición
    }
  }

  return {
    async revisarDocumento(texto: string): Promise<Aviso[]> {
      const parrafos = parrafosAnotados(texto);
      fallo = !(await completar(parrafos));
      if (fallo) return [];
      return parrafos.flatMap((p) => (recordados.get(clave(p)) ?? []).map((a) => ({ ...a, desde: p.desde + a.desde, hasta: p.desde + a.hasta })));
    },
    async revisarParrafo(parrafo: Parrafo): Promise<Aviso[]> {
      return (await completar([parrafo])) ? recordados.get(clave(parrafo)) ?? [] : [];
    },
    olvidar: () => recordados.clear(),
    // ¿La última revisión del documento no se pudo hacer? Sirve para reintentar sin esperar una edición.
    fallo: () => fallo,
  };
}

// Cuenta las veces que el usuario deshizo la autocorrección de cada palabra.
// A la segunda, devuelve true: esa palabra no se vuelve a tocar.
export function crearAprendizaje(umbral = 2) {
  const veces = new Map<string, number>();
  return {
    deshecha(palabra: string): boolean {
      const clave = palabra.toLowerCase();
      const n = (veces.get(clave) ?? 0) + 1;
      veces.set(clave, n);
      return n === umbral;
    },
  };
}

const SEVERIDAD = { ortografia: 'error', gramatica: 'warning', estilo: 'info' } as const;
const MAXIMO_DE_BOTONES = 3;
const DURACION_DE_MARCA_MS = 2000;
const ESPERA_DE_REVISION_MS = 750;
const ESPERA_DE_ESTADO_MS = 2000;

const marcar = StateEffect.define<{ desde: number; hasta: number } | null>();
// Pide revisar de nuevo aunque el texto no haya cambiado: el corrector terminó de arrancar,
// o cambió el diccionario. (forceLinting no sirve: solo adelanta una revisión ya pendiente.)
const refrescar = StateEffect.define<null>();
const pedirRevision = (vista: EditorView) => vista.dispatch({ effects: refrescar.of(null) });
const marcaDeAutocorreccion = Decoration.mark({ class: 'cm-autocorregida' });

export interface OpcionesCorreccion {
  api: ApiCorreccion;
  // Se llama cuando cambia el estado del corrector (para el panel).
  alCambiarEstado?(estado: EstadoCorrector): void;
}

export function extensionCorreccion(o: OpcionesCorreccion): Extension {
  const revisor = crearRevisor(o.api);
  const aprendizaje = crearAprendizaje();
  let excepciones = new Set<string>();
  let listo = false;
  const vistas = new Set<EditorView>();
  // Autocorrecciones recientes, para reconocer cuándo un Ctrl+Z deshizo una.
  let recientes: { original: string; desde: number }[] = [];

  async function seguirEstado(): Promise<void> {
    let estado: EstadoCorrector;
    try {
      estado = await o.api.estado();
    } catch {
      estado = { estado: 'no-disponible', motivo: 'No se pudo consultar el corrector.' };
    }
    o.alCambiarEstado?.(estado);
    if (estado.estado === 'iniciando') { setTimeout(() => { void seguirEstado(); }, ESPERA_DE_ESTADO_MS); return; }
    if (estado.estado !== 'listo') return;
    excepciones = new Set((await o.api.diccionario().catch(() => ({ excepciones: [] as string[] }))).excepciones);
    listo = true;
    for (const vista of vistas) pedirRevision(vista);
  }
  void seguirEstado();

  const fuente = linter(async (vista): Promise<Diagnostic[]> => {
    if (!listo) return [];
    const texto = vista.state.doc.toString();
    const avisos = await revisor.revisarDocumento(texto);
    if (revisor.fallo()) setTimeout(() => pedirRevision(vista), 5000);
    return avisos.map((a): Diagnostic => {
      const palabra = texto.slice(a.desde, a.hasta);
      const acciones: Action[] = a.sugerencias.slice(0, MAXIMO_DE_BOTONES).map((sugerencia) => ({
        name: sugerencia,
        apply(v, desde, hasta) {
          if (!v.state.readOnly) v.dispatch({ changes: { from: desde, to: hasta, insert: sugerencia }, userEvent: 'input.correccion' });
        },
      }));
      if (a.regla === REGLA_NO_EXISTE) {
        acciones.push({
          name: 'Agregar al diccionario',
          apply(v) {
            void o.api.agregarPalabra(palabra).then(() => { revisor.olvidar(); pedirRevision(v); }, () => undefined);
          },
        });
      }
      return { from: a.desde, to: a.hasta, severity: SEVERIDAD[a.tipo], message: a.mensaje, markClass: `cm-aviso-${a.tipo}`, actions: acciones };
    });
  }, {
    delay: ESPERA_DE_REVISION_MS,
    needsRefresh: (cambio) => cambio.transactions.some((tr) => tr.effects.some((e) => e.is(refrescar))),
  });

  // Lo recién autocorregido queda resaltado un momento, para que se note qué cambió.
  const marcas = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(valor, tr) {
      let nuevo = valor.map(tr.changes);
      for (const e of tr.effects) {
        if (e.is(marcar)) nuevo = e.value ? Decoration.set([marcaDeAutocorreccion.range(e.value.desde, e.value.hasta)]) : Decoration.none;
      }
      return nuevo;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  async function autocorregir(vista: EditorView, posicion: number): Promise<void> {
    const texto = vista.state.doc.toString();
    const palabra = palabraAntesDe(texto, posicion);
    if (!palabra) return;
    const parrafo = parrafosAnotados(texto).find((p) => p.desde <= palabra.desde && palabra.hasta <= p.hasta);
    if (!parrafo || !tramoDeProsa(parrafo, palabra.desde, palabra.hasta)) return;

    const avisos = await revisor.revisarParrafo(parrafo);
    const aviso = avisos.find((a) => parrafo.desde + a.desde === palabra.desde && parrafo.desde + a.hasta === palabra.hasta) ?? null;
    const reemplazo = decidir(palabra.palabra, aviso, excepciones);
    // Mientras llegaba la respuesta el texto pudo cambiar: solo se corrige si la palabra sigue ahí.
    if (!reemplazo || vista.state.readOnly || vista.state.sliceDoc(palabra.desde, palabra.hasta) !== palabra.palabra) return;

    vista.dispatch({
      changes: { from: palabra.desde, to: palabra.hasta, insert: reemplazo },
      effects: marcar.of({ desde: palabra.desde, hasta: palabra.desde + reemplazo.length }),
      userEvent: 'input.autocorreccion',
      // Un paso propio en el historial: Ctrl+Z deshace la corrección y nada más.
      annotations: isolateHistory.of('full'),
    });
    recientes = [...recientes.slice(-9), { original: palabra.palabra, desde: palabra.desde }];
    setTimeout(() => { vista.dispatch({ effects: marcar.of(null) }); }, DURACION_DE_MARCA_MS);
  }

  const registro = ViewPlugin.define((vista) => {
    vistas.add(vista);
    return { destroy() { vistas.delete(vista); } };
  });

  const escucha = EditorView.updateListener.of((cambio) => {
    if (!listo || !cambio.docChanged) return;
    for (const tr of cambio.transactions) {
      if (tr.isUserEvent('undo')) {
        // Si tras deshacer vuelve a estar la palabra original, se deshizo una autocorrección.
        const deshechas = recientes.filter((r) => tr.state.sliceDoc(r.desde, r.desde + r.original.length) === r.original);
        recientes = recientes.filter((r) => !deshechas.includes(r));
        for (const r of deshechas) {
          if (aprendizaje.deshecha(r.original)) {
            excepciones.add(r.original.toLowerCase());
            void o.api.agregarExcepcion(r.original).catch(() => undefined);
          }
        }
      } else if (tr.isUserEvent('input.type')) {
        tr.changes.iterChanges((_desdeA, _hastaA, desdeB, _hastaB, insertado) => {
          if (insertado.length === 1 && SEPARADOR.test(insertado.toString())) void autocorregir(cambio.view, desdeB);
        });
      }
    }
  });

  // Con el corrector propio andando, el del navegador sobra (subrayaría todo dos veces).
  const sinCorrectorDelNavegador = Prec.highest(EditorView.contentAttributes.of(() => (listo ? { spellcheck: 'false' } : null)));
  return [registro, fuente, marcas, escucha, sinCorrectorDelNavegador];
}
