import katex from 'katex';
import type { EntornoMatematico } from '../../compartido/analizador';

// Lo que LaTeX usa para numerar y referenciar, y KaTeX no entiende.
const SIN_USO = /\\label\s*\{[^{}]*\}|\\(?:nonumber|notag)(?![a-zA-Z@])/g;

// La fuente tal como se le pasa a KaTeX. `align` se dibuja como `aligned`, que no numera:
// el número lo pone el editor.
export function prepararFormula(fuente: string, entorno: EntornoMatematico | null): string {
  const limpia = fuente.replace(SIN_USO, '').trim();
  if (limpia === '') return '';
  return entorno === 'align' || entorno === 'align*' ? `\\begin{aligned}${limpia}\\end{aligned}` : limpia;
}

export type FormulaDibujada = { tipo: 'ok'; html: string } | { tipo: 'error'; mensaje: string };

const MAXIMO_EN_CACHE = 500;
const cache = new Map<string, FormulaDibujada>();

// Nunca lanza: una excepción dentro de un widget rompería toda la vista del editor.
export function dibujarFormula(fuente: string, entorno: EntornoMatematico | null, enBloque: boolean): FormulaDibujada {
  const clave = `${enBloque ? 'b' : 'l'}|${entorno ?? ''}|${fuente}`;
  const guardada = cache.get(clave);
  if (guardada) return guardada;

  let resultado: FormulaDibujada;
  const preparada = prepararFormula(fuente, entorno);
  if (preparada === '') {
    resultado = { tipo: 'error', mensaje: 'La fórmula está vacía.' };
  } else {
    try {
      const html = katex.renderToString(preparada, { displayMode: enBloque, throwOnError: true, trust: false, strict: 'ignore' });
      resultado = { tipo: 'ok', html };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      resultado = { tipo: 'error', mensaje: mensaje.replace(/^KaTeX parse error:\s*/, '') || 'Error desconocido.' };
    }
  }

  if (cache.size >= MAXIMO_EN_CACHE) cache.clear();
  cache.set(clave, resultado);
  return resultado;
}
