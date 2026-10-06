import type { Proyecto } from '../compartido/tipos';
import { api } from './api';
import { crearEditor } from './editor';
import { titulosDelIndice } from './indice';
import { crearBarra } from './pantalla/barra';
import { el, preguntar } from './pantalla/dom';
import { crearLateral } from './pantalla/lateral';

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
  proyecto = await api.proyecto();
  lateral.mostrarProyecto(proyecto, editor.rutaAbierta());
  actualizarIndice(editor.vista.state.doc.toString(), 0);
}

const editor = crearEditor(porId('editor'), {
  extensiones: [],
  alAbrir(ruta, texto) {
    quitarCartel();
    recordarUltimo(ruta);
    lateral.mostrarProyecto(proyecto, ruta);
    actualizarIndice(texto, 0);
    const capitulo = proyecto.capitulos.find((c) => c.ruta === ruta);
    barra.mostrarTitulo(capitulo ? (capitulo.numero ? `${capitulo.numero}. ${capitulo.titulo}` : capitulo.titulo) : 'Referencias');
  },
  alCambiarEstado(estado) {
    barra.mostrarGuardado(estado);
    if (estado !== 'guardado') return;
    // Los títulos y etiquetas pueden haber cambiado: se refresca la lista de capítulos.
    clearTimeout(relojProyecto);
    relojProyecto = setTimeout(() => { void recargarProyecto().catch(() => undefined); }, 500);
  },
  alCambiarDocumento: (texto) => actualizarIndice(texto),
  preguntarConflicto: () => preguntar('Este archivo cambió por fuera del editor.', [
    { texto: 'Conservar la mía', valor: 'sobrescribir' as const },
    { texto: 'Recargar la versión del disco', valor: 'recargar' as const, principal: true },
  ], 'Tenés cambios sin guardar. Si recargás, se pierden; si conservás la tuya, reemplaza a la del disco.'),
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
  else void editor.recargar().then(recargarProyecto).catch(() => undefined);
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
    proyecto = await api.proyecto();
    lateral.mostrarProyecto(proyecto, null);
    const ruta = rutaInicial();
    if (ruta) await abrir(ruta);
    else barra.avisar('No se encontraron archivos .tex en la carpeta del informe.', 'error');
  } catch (e) {
    barra.avisar((e as Error).message, 'error');
  }
}

void iniciar();
