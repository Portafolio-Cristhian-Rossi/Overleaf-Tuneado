import type { Elemento, Rango } from './analizador';
import { analizarTabla, type TablaLeida } from './tabla';

type Entorno = Extract<Elemento, { tipo: 'entorno' }>;
type Imagen = Extract<Elemento, { tipo: 'imagen' }>;
type Epigrafe = Extract<Elemento, { tipo: 'epigrafe' }>;

export interface PartesDeFigura {
  imagen: Imagen;
  epigrafe: Epigrafe | null;
  // Todo el rango de la figura menos la imagen y el contenido del epígrafe.
  ocultar: Rango[];
}

// Lo único que puede acompañar a la imagen y al epígrafe para que la figura se dibuje.
const SOLO_ARMADO = /^(?:\s|\\centering(?![a-zA-Z@])|\\label\{[^{}]*\})*$/;

const dentroDe = (afuera: Rango) => (e: Rango) => e.desde > afuera.desde && e.hasta <= afuera.hasta;

// Lo que se oculta de un flotante con la forma de la plantilla: un cuerpo (la imagen o el
// tabular), a lo sumo un epígrafe y nada más que el armado. Devuelve null ante cualquier otra
// cosa: ocultar el armado escondería contenido que el usuario no podría ver ni editar.
function armadoDe(texto: string, flotante: Entorno, cuerpo: Rango, epigrafes: Epigrafe[]): { epigrafe: Epigrafe | null; ocultar: Rango[] } | null {
  if (epigrafes.length > 1) return null;
  const epigrafe = epigrafes[0] ?? null;
  if (epigrafe && cuerpo.desde >= epigrafe.desde && cuerpo.hasta <= epigrafe.hasta) return null;

  // El interior sin el argumento opcional de posición, sin el cuerpo y sin el epígrafe.
  const opcional = /^\[[^\]\n]*\]/.exec(texto.slice(flotante.interior.desde, flotante.interior.hasta))?.[0].length ?? 0;
  const conocidos = [cuerpo, ...(epigrafe ? [epigrafe] : [])].sort((a, b) => a.desde - b.desde);
  let cursor = flotante.interior.desde + opcional;
  for (const conocido of conocidos) {
    if (!SOLO_ARMADO.test(texto.slice(cursor, conocido.desde))) return null;
    cursor = conocido.hasta;
  }
  if (!SOLO_ARMADO.test(texto.slice(cursor, flotante.interior.hasta))) return null;

  const visibles = [cuerpo, ...(epigrafe ? [epigrafe.contenido] : [])].sort((a, b) => a.desde - b.desde);
  const ocultar: Rango[] = [];
  let desde = flotante.desde;
  for (const visible of visibles) {
    if (visible.desde > desde) ocultar.push({ desde, hasta: visible.desde });
    desde = visible.hasta;
  }
  if (flotante.hasta > desde) ocultar.push({ desde, hasta: flotante.hasta });
  return { epigrafe, ocultar };
}

// Partes de una figura con la forma de la plantilla: una imagen, a lo sumo un epígrafe y nada
// más que el armado.
export function partesDeFigura(texto: string, figura: Entorno, elementos: Elemento[]): PartesDeFigura | null {
  const adentro = elementos.filter(dentroDe(figura));
  const imagenes = adentro.filter((e): e is Imagen => e.tipo === 'imagen');
  if (imagenes.length !== 1) return null;
  const armado = armadoDe(texto, figura, imagenes[0], adentro.filter((e): e is Epigrafe => e.tipo === 'epigrafe'));
  return armado && { imagen: imagenes[0], ...armado };
}

export interface PartesDeTabla {
  tabular: Entorno; tabla: TablaLeida;
  epigrafe: Epigrafe | null;
  // Todo el rango del flotante menos el tabular y el contenido del epígrafe.
  ocultar: Rango[];
}

// Partes de un flotante `table` con la forma de la plantilla: un `tabular` que el editor
// reconoce, a lo sumo un epígrafe y nada más que el armado. Lo que está dentro del `tabular`
// es de la tabla, no del flotante.
export function partesDeTabla(texto: string, flotante: Entorno, elementos: Elemento[]): PartesDeTabla | null {
  const adentro = elementos.filter(dentroDe(flotante));
  const todos = adentro.filter((e): e is Entorno => e.tipo === 'entorno' && e.nombre === 'tabular');
  const tabulares = todos.filter((t) => !todos.some((otro) => dentroDe(otro)(t)));
  if (tabulares.length !== 1) return null;
  const tabular = tabulares[0];
  const tabla = analizarTabla(texto, tabular.interior);
  if (tabla.clase === 'no-reconocida') return null;

  const epigrafes = adentro.filter((e): e is Epigrafe => e.tipo === 'epigrafe' && !dentroDe(tabular)(e));
  const armado = armadoDe(texto, flotante, tabular, epigrafes);
  return armado && { tabular, tabla, ...armado };
}
