import type { Elemento, Rango } from './analizador';

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

// Partes de una figura con la forma de la plantilla: una imagen, a lo sumo un epígrafe y nada
// más que el armado. Devuelve null ante cualquier otra cosa: ocultar el armado escondería
// contenido que el usuario no podría ver ni editar.
export function partesDeFigura(texto: string, figura: Entorno, elementos: Elemento[]): PartesDeFigura | null {
  const adentro = elementos.filter((e) => e.desde > figura.desde && e.hasta <= figura.hasta);
  const imagenes = adentro.filter((e): e is Imagen => e.tipo === 'imagen');
  const epigrafes = adentro.filter((e): e is Epigrafe => e.tipo === 'epigrafe');
  if (imagenes.length !== 1 || epigrafes.length > 1) return null;
  const imagen = imagenes[0];
  const epigrafe = epigrafes[0] ?? null;
  if (epigrafe && imagen.desde >= epigrafe.desde && imagen.hasta <= epigrafe.hasta) return null;

  // El interior sin el argumento opcional de posición, sin la imagen y sin el epígrafe.
  const opcional = /^\[[^\]\n]*\]/.exec(texto.slice(figura.interior.desde, figura.interior.hasta))?.[0].length ?? 0;
  const conocidos = [imagen, ...(epigrafe ? [epigrafe] : [])].sort((a, b) => a.desde - b.desde);
  let cursor = figura.interior.desde + opcional;
  for (const conocido of conocidos) {
    if (!SOLO_ARMADO.test(texto.slice(cursor, conocido.desde))) return null;
    cursor = conocido.hasta;
  }
  if (!SOLO_ARMADO.test(texto.slice(cursor, figura.interior.hasta))) return null;

  const visibles = [imagen, ...(epigrafe ? [epigrafe.contenido] : [])].sort((a, b) => a.desde - b.desde);
  const ocultar: Rango[] = [];
  let desde = figura.desde;
  for (const visible of visibles) {
    if (visible.desde > desde) ocultar.push({ desde, hasta: visible.desde });
    desde = visible.hasta;
  }
  if (figura.hasta > desde) ocultar.push({ desde, hasta: figura.hasta });
  return { imagen, epigrafe, ocultar };
}
