import { analizar } from '../compartido/analizador';
import { numerarTitulos } from '../compartido/numeracion';

export interface TituloDeIndice { texto: string; numero: string | null; nivel: number; posicion: number }

// Texto de un título tal como se lee: sin los comandos de formato que contenga.
function textoPlano(latex: string): string {
  return latex.replace(/\\[a-zA-Z@]+\*?/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

export function titulosDelIndice(texto: string, numeroCapitulo: string | null): TituloDeIndice[] {
  const elementos = analizar(texto);
  const numeros = numerarTitulos(elementos, numeroCapitulo);
  return elementos.flatMap((e) => e.tipo !== 'titulo' ? [] : [{
    texto: textoPlano(texto.slice(e.contenido.desde, e.contenido.hasta)),
    numero: numeros.get(e.desde) ?? null,
    nivel: e.nivel,
    posicion: e.desde,
  }]);
}
