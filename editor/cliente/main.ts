import type { EditorView } from '@codemirror/view';
import 'katex/dist/katex.min.css';
import { analizarBib, type ProblemaBib } from '../compartido/bib';
import { candidatos, type Bibliografia, type Candidato } from '../compartido/citas';
import type { Etiqueta, Proyecto } from '../compartido/tipos';
import { api, urlDeImagen } from './api';
import { aplicarEdicion, darFormato, darNivel, extensionAtajos, type Nivel } from './atajos';
import { agregarPegado, avisoDelBuscador, colocarCita, resolverClaves, type Citador } from './citar';
import { agregarPaquete, cambiarRutaDeImagen, citaEn, puedeCitarse } from './comandos';
import { extensionCorreccion } from './correccion';
import { crearEditor } from './editor';
import { crearSubida, evitarAbrirArchivosSoltados, extensionArrastre } from './imagenes';
import { titulosDelIndice } from './indice';
import { extensionMenu } from './menuBarra';
import { crearBarra } from './pantalla/barra';
import { crearBloqueoConflicto } from './pantalla/bloqueoConflicto';
import { buscarCita } from './pantalla/buscadorCitas';
import { el, preguntar } from './pantalla/dom';
import { crearLateral } from './pantalla/lateral';
import { crearPanelGramatica, extensionPanelGramatica } from './pantalla/panelGramatica';
import { crearPanelPdf } from './pantalla/panelPdf';
import { elegirImagen } from './pantalla/selectorImagen';
import { crearSincronizacion } from './pantalla/sincronizacion';
import { contextoCambiado, extensionVista } from './vista';

const CLAVE_ULTIMO = 'editor-informe:ultimo-archivo';
const INTERVALO_DE_LATIDO_MS = 30 * 1000;

const porId = (id: string) => document.getElementById(id) as HTMLElement;
const esTex = (ruta: string | null) => ruta !== null && /\.tex$/i.test(ruta);

// La preferencia es solo una comodidad: el editor funciona igual si no se puede guardar.
function recordarUltimo(ruta: string): void {
  try { localStorage.setItem(CLAVE_ULTIMO, ruta); } catch { /* almacenamiento no disponible */ }
}
function ultimoRecordado(): string | null {
  try { return localStorage.getItem(CLAVE_ULTIMO); } catch { return null; }
}

let proyecto: Proyecto = { capitulos: [], etiquetas: [], paquetes: [], bibliografia: null };
let etiquetas = new Map<string, Etiqueta>();
let principal = 'main.tex';
let compilarAlGuardar = false;

function tomarProyecto(nuevo: Proyecto): void {
  proyecto = nuevo;
  etiquetas = new Map(nuevo.etiquetas.map((e) => [e.nombre, e]));
}

// Las referencias del informe, para dibujar las citas y para el buscador.
let bibliografia: Bibliografia = new Map();
let problemasDeBibliografia: ProblemaBib[] = [];

// Si el informe no tiene archivo de referencias o no se puede leer, queda vacía.
async function cargarBibliografia(): Promise<void> {
  const ruta = proyecto.bibliografia;
  const leido = ruta === null ? null : await api.leer(ruta).catch(() => null);
  const { entradas, problemas } = analizarBib(leido?.contenido ?? '');
  bibliografia = new Map(entradas.map((e) => [e.clave, e]));
  problemasDeBibliografia = problemas;
}

const barra = crearBarra(porId('barra'));
const zonaEditor = porId('zona-editor');
let cartel: HTMLElement | null = null;

function quitarCartel(): void {
  cartel?.remove();
  cartel = null;
}

function mostrarCartel(titulo: string, ...contenido: (Node | string)[]): void {
  quitarCartel();
  cartel = el('div', { clase: 'cartel' }, el('div', { clase: 'cartel-caja', role: 'alert' }, el('h2', {}, titulo), ...contenido));
  zonaEditor.append(cartel);
}

// Controles de formato: actúan sobre la selección o la línea del cursor.
const NIVELES: [string, Nivel][] = [['Texto', null], ['Capítulo', 0], ['Sección', 1], ['Subsección', 2], ['Subsubsección', 3]];
const selectorNivel = el('select', {
  'aria-label': 'Nivel de título',
  alChange: () => darNivel(editor.vista, NIVELES[selectorNivel.selectedIndex][1]),
}, ...NIVELES.map(([texto]) => el('option', {}, texto)));
barra.zonaFormato.append(
  selectorNivel,
  el('button', { type: 'button', title: 'Negrita (Ctrl+B)', 'aria-label': 'Negrita', alClick: () => darFormato(editor.vista, 'textbf') }, el('b', {}, 'N')),
  el('button', { type: 'button', title: 'Cursiva (Ctrl+I)', 'aria-label': 'Cursiva', alClick: () => darFormato(editor.vista, 'textit') }, el('i', {}, 'C')),
);

function habilitarFormato(si: boolean): void {
  for (const control of barra.zonaFormato.querySelectorAll<HTMLSelectElement | HTMLButtonElement>('select, button')) control.disabled = !si;
}

const lateral = crearLateral(porId('lateral'), {
  alElegirArchivo: (ruta) => { void abrir(ruta); },
  alElegirTitulo: (posicion) => editor.irA(posicion),
});

const numeroDelCapitulo = (ruta: string | null) => proyecto.capitulos.find((c) => c.ruta === ruta)?.numero ?? null;

let relojIndice: ReturnType<typeof setTimeout> | undefined;
function actualizarIndice(texto: string, espera = 300): void {
  clearTimeout(relojIndice);
  relojIndice = setTimeout(() => {
    const ruta = editor.rutaAbierta();
    lateral.mostrarIndice(esTex(ruta) ? titulosDelIndice(texto, numeroDelCapitulo(ruta)) : []);
  }, espera);
}

let relojProyecto: ReturnType<typeof setTimeout> | undefined;
async function recargarProyecto(): Promise<void> {
  tomarProyecto(await api.proyecto());
  await cargarBibliografia();
  lateral.mostrarProyecto(proyecto, editor.rutaAbierta());
  actualizarIndice(editor.vista.state.doc.toString(), 0);
  editor.vista.dispatch({ effects: contextoCambiado.of(null) });
}

// Las plantillas pueden necesitar un paquete que el informe todavía no carga.
async function asegurarPaquete(paquete: string, configuracion?: string): Promise<boolean> {
  const acepta = await preguntar(`Esta plantilla necesita el paquete ${paquete}. ¿Agregarlo a ${principal}?`, [
    { texto: 'Agregar', valor: true, principal: true },
    { texto: 'Cancelar', valor: false },
  ]);
  if (!acepta) return false;

  if (editor.rutaAbierta() === principal) {
    const actual = editor.vista.state.doc.toString();
    const nuevo = agregarPaquete(actual, paquete, configuracion);
    if (nuevo !== actual) {
      // agregarPaquete solo inserta: lo agregado es lo que sigue al prefijo común.
      let i = 0;
      while (i < actual.length && actual[i] === nuevo[i]) i++;
      editor.vista.dispatch({ changes: { from: i, insert: nuevo.slice(i, i + nuevo.length - actual.length) } });
      await editor.guardarAhora();
    }
  } else {
    const archivo = await api.leer(principal);
    const nuevo = agregarPaquete(archivo.contenido, paquete, configuracion);
    if (nuevo !== archivo.contenido) {
      const r = await api.escribir(principal, { contenido: nuevo, finDeLinea: archivo.finDeLinea, bom: archivo.bom, versionBase: archivo.version });
      if (r.tipo !== 'ok') {
        barra.avisar(`No se pudo agregar el paquete a ${principal}. Probá de nuevo.`, 'error');
        return false;
      }
    }
  }
  await recargarProyecto();
  return true;
}

// Imágenes: las que ya están en figs/ o una nueva desde la computadora, que se copia ahí.
const subirImagen = crearSubida({ subir: api.imagenes.subir, preguntar, avisar: (mensaje) => barra.avisar(mensaje, 'error') });
const abrirSelectorDeImagen = () => elegirImagen({ listar: api.imagenes.listar, url: urlDeImagen, subir: subirImagen });

evitarAbrirArchivosSoltados(window);

// Clic en una imagen dibujada: se elige otra y cambia solo la ruta de ese \includegraphics.
async function cambiarImagen(vista: EditorView, posicion: number): Promise<void> {
  if (vista.state.readOnly) return;
  const ruta = await abrirSelectorDeImagen();
  if (ruta === null || vista.state.readOnly) return;
  const edicion = cambiarRutaDeImagen(vista.state.doc.toString(), posicion, ruta);
  if (!edicion || edicion.cambios.length === 0) return;
  vista.dispatch({ changes: edicion.cambios.map((c) => ({ from: c.desde, to: c.hasta, insert: c.insertar })), userEvent: 'input' });
}

// Citas: lo que hace falta para pasar de lo elegido en el buscador a claves de referencias.bib.
const citador: Citador = {
  agregar: api.referencias.agregar,
  citarDeZotero: api.zotero.citar,
  preguntar,
  avisar: (mensaje, tipo) => barra.avisar(mensaje, tipo),
  // El servidor va a escribir en el .bib: antes no puede quedar nada sin guardar.
  antesDeAgregar: async () => {
    await editor.guardarAhora();
    return !editor.hayCambiosSinGuardar();
  },
  despuesDeAgregar: async () => {
    if (editor.rutaAbierta() === proyecto.bibliografia) await editor.recargar();
    await recargarProyecto();
  },
};

// Las referencias del informe más las de Zotero, y lo que haya que avisar.
async function candidatosConZotero(): Promise<{ lista: Candidato[]; aviso: string | null }> {
  const zotero = await api.zotero.items().catch(() => ({ estado: 'cerrado' as const, items: [] }));
  return {
    lista: candidatos([...bibliografia.values()], zotero.items),
    aviso: avisoDelBuscador(zotero.estado, problemasDeBibliografia, proyecto.bibliografia),
  };
}

// Abre el buscador para citar en el cursor o, si `enCita` es una posición dentro de una cita
// (clic sobre ella), para cambiarla. El cursor dentro de una cita también la cambia.
let citando = false;
async function citar(vista: EditorView, enCita?: number): Promise<void> {
  // Una sola a la vez: un segundo Ctrl+K mientras se agrega la referencia no abre otro buscador.
  if (citando || vista.state.readOnly) return;
  citando = true;
  try {
    await citarAhora(vista, enCita);
  } finally {
    citando = false;
  }
}

async function citarAhora(vista: EditorView, enCita?: number): Promise<void> {
  const archivo = editor.rutaAbierta();
  const texto = vista.state.doc.toString();
  const posicion = enCita ?? vista.state.selection.main.head;
  const existente = citaEn(texto, posicion);
  if (!existente && !puedeCitarse(texto, posicion)) {
    barra.avisar('Acá no se puede citar: el cursor está dentro de una fórmula, de un bloque de código o del encabezado del documento.', 'info');
    return;
  }

  const elegido = await buscarCita({
    inicial: candidatos([...bibliografia.values()], []),
    completos: candidatosConZotero,
    formaInicial: existente?.forma ?? 'parentetica',
    marcadas: existente?.claves ?? [],
    agregarPegado: (bibtex, avisar) => agregarPegado(bibtex, { ...citador, avisar }),
  });
  if (!elegido) {
    vista.focus();
    return;
  }
  const claves = await resolverClaves(elegido.elegidos, citador);
  if (claves === null || claves.length === 0) return;

  // Mientras se agregaba la referencia pudo cambiar todo: el archivo abierto, el texto, el
  // permiso para editar. La cita se pone sobre lo que hay ahora, o no se pone y se avisa.
  const noSePuso = (motivo: string) => barra.avisar(`${motivo} La referencia ya está en el buscador.`, 'error');
  if (editor.rutaAbierta() !== archivo) {
    noSePuso('La cita no se insertó: cambiaste de archivo mientras se agregaba la referencia.');
    return;
  }
  if (vista.state.readOnly) {
    noSePuso('La cita no se insertó: el editor no admite cambios en este momento.');
    return;
  }
  const { from, to } = vista.state.selection.main;
  const colocacion = colocarCita({
    texto: vista.state.doc.toString(), seleccion: { desde: from, hasta: to },
    enCita: existente ? { posicion, claves: existente.claves } : null, forma: elegido.forma, claves,
  });
  if (colocacion.tipo === 'no') {
    noSePuso(colocacion.mensaje);
    return;
  }
  // Al cambiar una cita no se mueve el cursor: si cayera en ella, se vería su código.
  if (existente) {
    const cambios = colocacion.edicion.cambios.map((c) => ({ from: c.desde, to: c.hasta, insert: c.insertar }));
    if (cambios.length > 0) vista.dispatch({ changes: cambios, userEvent: 'input' });
    vista.focus();
  } else {
    aplicarEdicion(vista, colocacion.edicion);
  }
}

const editor = crearEditor(porId('editor'), {
  extensiones: [
    extensionVista(() => ({
      numeroCapitulo: numeroDelCapitulo(editor.rutaAbierta()), etiquetas,
      urlDeImagen,
      alElegirImagen: (vista, posicion) => { void cambiarImagen(vista, posicion); },
      bibliografia,
      alElegirCita: (vista, posicion) => { void citar(vista, posicion); },
    })),
    extensionMenu({
      paquetes: () => proyecto.paquetes, etiquetas: () => proyecto.etiquetas, asegurarPaquete,
      elegirImagen: abrirSelectorDeImagen,
      citar: (vista) => { void citar(vista); },
    }),
    extensionArrastre({ subir: subirImagen, avisar: (mensaje) => barra.avisar(mensaje, 'error') }),
    extensionAtajos(
      (nivel) => { selectorNivel.selectedIndex = NIVELES.findIndex(([, n]) => n === nivel); },
      (vista) => { void citar(vista); },
    ),
    extensionCorreccion({ api: api.correccion, alCambiarEstado: (estado) => panelGramatica.mostrarEstado(estado) }),
    extensionPanelGramatica(() => panelGramatica.actualizar()),
  ],
  alAbrir(ruta, archivo) {
    quitarCartel();
    recordarUltimo(ruta);
    habilitarFormato(esTex(ruta));
    panelGramatica.actualizar();
    selectorNivel.selectedIndex = 0;
    lateral.mostrarProyecto(proyecto, ruta);
    actualizarIndice(archivo.contenido, 0);
    if (!archivo.fiel) {
      barra.avisar('Este archivo no está en UTF-8 o mezcla fines de línea. Se abre en solo lectura para no dañarlo: corregilo en VS Code y volvé a abrirlo.', 'error');
    }
    const capitulo = proyecto.capitulos.find((c) => c.ruta === ruta);
    barra.mostrarTitulo(capitulo ? (capitulo.numero ? `${capitulo.numero}. ${capitulo.titulo}` : capitulo.titulo) : 'Referencias');
  },
  alCambiarEstado(estado, detalle) {
    barra.mostrarGuardado(estado);
    if (estado === 'error' && detalle) {
      barra.avisar(`${detalle}\nTus cambios siguen en pantalla y el guardado se reintenta solo.`, 'error');
    }
    if (estado !== 'guardado') return;
    // Los títulos y etiquetas pueden haber cambiado: se refresca la lista de capítulos.
    clearTimeout(relojProyecto);
    relojProyecto = setTimeout(() => {
      void recargarProyecto().catch(() => undefined);
      void sincronizacion.revisar();
      if (compilarAlGuardar) void panelPdf.compilar();
    }, 500);
  },
  alCambiarDocumento: (texto) => actualizarIndice(texto),
  preguntarConflicto: () => preguntar('Este archivo cambió por fuera del editor.', [
    { texto: 'Conservar la mía', valor: 'sobrescribir' as const },
    { texto: 'Recargar la versión del disco', valor: 'recargar' as const },
    { texto: 'Decidir después', valor: 'despues' as const, neutra: true },
  ], 'Tenés cambios sin guardar. Si recargás, se pierden; si conservás la tuya, reemplaza a la del disco. Si lo dejás para después, no se guarda ni se pierde nada.'),
  alDesaparecer() {
    mostrarCartel(
      'Este archivo ya no existe en el informe',
      el('p', {}, 'Puede haber sido borrado o renombrado por otra persona.'),
      el('p', {}, 'Tu texto sigue acá, pero ya no se guarda. Copialo si lo necesitás y abrí otro capítulo.'),
      el('div', { clase: 'cartel-botones' },
        el('button', {
          type: 'button', clase: 'principal',
          alClick: async (e: Event) => {
            await navigator.clipboard.writeText(editor.vista.state.doc.toString());
            (e.target as HTMLButtonElement).textContent = 'Texto copiado';
          },
        }, 'Copiar mi texto')),
    );
  },
});

// Después de traer, cancelar o resolver, el disco puede haber cambiado por completo.
async function actualizarTodo(): Promise<void> {
  await editor.recargar();
  await recargarProyecto();
}

const bloqueo = crearBloqueoConflicto(zonaEditor, {
  editor,
  alResolver: async () => {
    await actualizarTodo();
    await sincronizacion.revisar();
  },
});

const sincronizacion = crearSincronizacion(barra, {
  editor,
  alActualizar: actualizarTodo,
  alConflicto: (archivos) => bloqueo.mostrar(archivos),
});

// Panel derecho con dos pestañas: el PDF y los avisos de gramática.
const zonaPdf = el('div', { clase: 'pestana' });
const zonaGramatica = el('div', { clase: 'pestana', hidden: true });
const pestanas: [HTMLButtonElement, HTMLElement][] = [
  [el('button', { type: 'button', role: 'tab', alClick: () => elegirPestana(0) }, 'PDF'), zonaPdf],
  [el('button', { type: 'button', role: 'tab', alClick: () => elegirPestana(1) }, 'Gramática'), zonaGramatica],
];
function elegirPestana(indice: number): void {
  pestanas.forEach(([boton, zona], i) => {
    zona.hidden = i !== indice;
    boton.setAttribute('aria-selected', String(i === indice));
  });
}
porId('panel').append(el('div', { clase: 'pestanas', role: 'tablist' }, ...pestanas.map(([boton]) => boton)), zonaPdf, zonaGramatica);
elegirPestana(0);

const panelGramatica = crearPanelGramatica(zonaGramatica, {
  vista: () => editor.vista,
  esCapitulo: () => esTex(editor.rutaAbierta()),
  alElegir: (posicion) => editor.irA(posicion),
  alContar: (cantidad) => { pestanas[1][0].textContent = cantidad > 0 ? `Gramática (${cantidad})` : 'Gramática'; },
});

const panelPdf = crearPanelPdf(zonaPdf, {
  alElegirProblema: async (ruta, linea) => {
    if (editor.rutaAbierta() !== ruta) await abrir(ruta);
    if (editor.rutaAbierta() === ruta) editor.irALinea(linea);
  },
});

async function abrir(ruta: string): Promise<void> {
  try {
    await editor.abrir(ruta);
  } catch (e) {
    barra.avisar((e as Error).message, 'error');
  }
}

function rutaInicial(): string | null {
  const disponibles = [...proyecto.capitulos.map((c) => c.ruta), ...(proyecto.bibliografia ? [proyecto.bibliografia] : [])];
  const ultimo = ultimoRecordado();
  if (ultimo && disponibles.includes(ultimo)) return ultimo;
  return proyecto.capitulos.find((c) => c.numero !== null)?.ruta ?? disponibles[0] ?? null;
}

// Al volver a la pestaña se comprueba si el disco cambió; al dejarla, se guarda de inmediato.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void editor.guardarAhora(true);
  else void actualizarTodo().then(() => sincronizacion.revisar()).catch(() => undefined);
});
window.addEventListener('pagehide', () => { void editor.guardarAhora(true); });
window.addEventListener('beforeunload', (e) => {
  if (editor.hayCambiosSinGuardar()) e.preventDefault();
});

// Mientras haya una pestaña abierta, el servidor sigue vivo.
const latir = () => { api.latido().catch(() => undefined); };
latir();
setInterval(latir, INTERVALO_DE_LATIDO_MS);

async function iniciar(): Promise<void> {
  try {
    const config = await api.config();
    ({ principal, compilarAlGuardar } = config);
    if (config.problema) barra.avisar(config.problema, 'error');
    tomarProyecto(await api.proyecto());
    await cargarBibliografia();
    lateral.mostrarProyecto(proyecto, null);
    const ruta = rutaInicial();
    if (ruta) await abrir(ruta);
    else barra.avisar('No se encontraron archivos .tex en la carpeta del informe.', 'error');
    await sincronizacion.revisar();
  } catch (e) {
    barra.avisar((e as Error).message, 'error');
  }
}

void iniciar();
