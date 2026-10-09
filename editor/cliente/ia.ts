import { armarPrompt, type AccionDeIa } from '../compartido/prompt';
import type { TituloDeIndice } from './indice';

const nombreDe = (titulo: TituloDeIndice) => [titulo.numero, titulo.texto].filter(Boolean).join(' ');

// Títulos que contienen una posición, del capítulo hacia adentro: "2 Antecedentes", "2.1 …".
export function ubicacionDe(titulos: TituloDeIndice[], posicion: number): string[] {
  const abiertos: TituloDeIndice[] = [];
  for (const titulo of titulos) {
    if (titulo.posicion > posicion) break;
    // Un título cierra los de su nivel y los de más adentro.
    while (abiertos.length > 0 && abiertos[abiertos.length - 1].nivel >= titulo.nivel) abiertos.pop();
    abiertos.push(titulo);
  }
  return abiertos.map(nombreDe);
}

export interface PedidoDeIa {
  accion: AccionDeIa;
  texto: string;                                  // el archivo abierto
  seleccion: { desde: number; hasta: number };
  titulos: TituloDeIndice[];
  guia: string;
}
export type PromptPreparada = { tipo: 'ok'; prompt: string; palabras: number } | { tipo: 'no'; mensaje: string };

const SIN_SELECCION = 'Seleccioná primero el texto sobre el que querés trabajar.';
const ACCIONES: { accion: AccionDeIa; texto: string; sobreLaSeleccion: boolean }[] = [
  { accion: 'desarrollar', texto: 'Desarrollar notas', sobreLaSeleccion: true },
  { accion: 'estilo', texto: 'Revisar estilo', sobreLaSeleccion: true },
  { accion: 'consistencia', texto: 'Revisar consistencia', sobreLaSeleccion: false },
];

// Decide sobre qué texto actúa cada acción y arma su prompt. No toca el documento.
export function prepararPrompt(p: PedidoDeIa): PromptPreparada {
  let texto: string;
  let ubicacion: string[];
  if (ACCIONES.find((a) => a.accion === p.accion)?.sobreLaSeleccion) {
    const desde = Math.min(p.seleccion.desde, p.seleccion.hasta);
    texto = p.texto.slice(desde, Math.max(p.seleccion.desde, p.seleccion.hasta));
    if (texto.trim() === '') return { tipo: 'no', mensaje: SIN_SELECCION };
    // Una selección que arranca en los blancos de antes de un título ya es de ese título.
    ubicacion = ubicacionDe(p.titulos, desde + texto.search(/\S/));
  } else {
    texto = p.texto;
    if (texto.trim() === '') return { tipo: 'no', mensaje: 'Este archivo está vacío: no hay nada que revisar.' };
    ubicacion = p.titulos.filter((t) => t.nivel === 0).slice(0, 1).map(nombreDe);
  }
  const prompt = armarPrompt({ accion: p.accion, ubicacion, guia: p.guia, texto });
  return { tipo: 'ok', prompt, palabras: prompt.trim().split(/\s+/).length };
}

export interface OpcionDeIa { accion: AccionDeIa; texto: string; habilitada: boolean; ayuda?: string }

// Las acciones del botón IA. Las que actúan sobre la selección se explican cuando no hay ninguna.
export function opcionesDeIa(haySeleccion: boolean): OpcionDeIa[] {
  return ACCIONES.map(({ accion, texto, sobreLaSeleccion }) => (
    sobreLaSeleccion && !haySeleccion ? { accion, texto, habilitada: false, ayuda: SIN_SELECCION } : { accion, texto, habilitada: true }
  ));
}

export function avisoDeCopia(accion: AccionDeIa, palabras: number): string {
  const copiada = `Prompt copiada (${palabras} ${palabras === 1 ? 'palabra' : 'palabras'}). Pegala en el modelo`;
  return accion === 'consistencia' ? `${copiada}.` : `${copiada}; su respuesta, pegala acá sobre la selección.`;
}
