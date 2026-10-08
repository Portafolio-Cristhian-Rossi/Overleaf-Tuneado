import type { Rango } from './analizador';

export type Alineacion = 'l' | 'c' | 'r' | 'p';
// `spec` es su tramo en la especificación de columnas: la letra, o `p{…}` entero.
export interface ColumnaDeTabla { alineacion: Alineacion; spec: Rango }
export interface CeldaDeTabla {
  // Sin los espacios de los bordes; en \multicolumn, su tercer argumento.
  contenido: Rango;
  // Columnas que ocupa: 1 salvo en \multicolumn.
  ancho: number;
  // Solo en \multicolumn: la primera letra de su especificación.
  alineacion: Alineacion | null;
}
export interface FilaDeTabla {
  // Donde empieza su primera celda: tras el `\\` anterior y sus líneas.
  desde: number;
  // Posición de cada `&`.
  separadores: number[];
  // Su `\\`; null en una última fila sin cerrar.
  cierre: Rango | null;
  celdas: CeldaDeTabla[];
  // Hay \hline, \toprule, \midrule o \bottomrule antes de la fila.
  lineaArriba: boolean;
}
export interface TablaLeida {
  clase: 'simple' | 'solo-lectura';
  columnas: ColumnaDeTabla[]; filas: FilaDeTabla[];
  // Hay una línea después de la última fila.
  lineaFinal: boolean;
}
export type Tabla = TablaLeida | { clase: 'no-reconocida' };

const ES_LETRA = /[a-zA-Z@]/;
const ES_BLANCO = /\s/;
const LINEAS = new Set(['hline', 'toprule', 'midrule', 'bottomrule']);
// Comandos que cambian la forma de la tabla y el editor no sabe dibujar ni mantener.
const FUERA_DE_ALCANCE = new Set(['begin', 'end', 'multirow', 'cline', 'cmidrule']);
const MULTICOLUMNA = '\\multicolumn';

// Índice de la llave que cierra la abierta en `abre`, sin pasar de `fin`; -1 si no cierra.
function cierreDe(texto: string, abre: number, fin: number): number {
  let profundidad = 0;
  for (let j = abre; j < fin; j++) {
    const c = texto[j];
    if (c === '\\') j++;
    else if (c === '{') profundidad++;
    else if (c === '}' && --profundidad === 0) return j;
  }
  return -1;
}

function saltearBlancos(texto: string, desde: number, fin: number): number {
  let j = desde;
  while (j < fin && ES_BLANCO.test(texto[j])) j++;
  return j;
}

// Final del nombre del comando que empieza en `barra`.
function finDeNombre(texto: string, barra: number, fin: number): number {
  let j = barra + 1;
  while (j < fin && ES_LETRA.test(texto[j])) j++;
  return j;
}

// El argumento de posición opcional y la especificación de columnas.
function leerColumnas(texto: string, desde: number, fin: number): { columnas: ColumnaDeTabla[]; hasta: number } | null {
  let i = saltearBlancos(texto, desde, fin);
  if (texto[i] === '[') {
    const cierra = texto.indexOf(']', i);
    if (cierra === -1 || cierra >= fin) return null;
    i = saltearBlancos(texto, cierra + 1, fin);
  }
  if (i >= fin || texto[i] !== '{') return null;
  const cierre = cierreDe(texto, i, fin);
  if (cierre === -1) return null;

  const columnas: ColumnaDeTabla[] = [];
  for (let j = i + 1; j < cierre; j++) {
    const c = texto[j];
    if (c === '|' || c === ' ') continue;
    if (c === 'l' || c === 'c' || c === 'r') {
      columnas.push({ alineacion: c, spec: { desde: j, hasta: j + 1 } });
    } else if (c === 'p' && texto[j + 1] === '{') {
      const ancho = cierreDe(texto, j + 1, cierre);
      if (ancho === -1) return null;
      columnas.push({ alineacion: 'p', spec: { desde: j, hasta: ancho + 1 } });
      j = ancho;
    } else {
      return null;
    }
  }
  return columnas.length === 0 ? null : { columnas, hasta: cierre + 1 };
}

// El tramo sin los blancos de los bordes. De una celda vacía, el punto donde escribir: un
// carácter antes de `tope` si ahí terminan dos o más espacios seguidos, para que quede uno a
// cada lado de lo que se escriba.
function recortar(texto: string, desde: number, hasta: number, tope: number): Rango {
  let a = desde;
  while (a < hasta && ES_BLANCO.test(texto[a])) a++;
  if (a === hasta) {
    let espacios = 0;
    while (tope - 1 - espacios >= desde && (texto[tope - 1 - espacios] === ' ' || texto[tope - 1 - espacios] === '\t')) espacios++;
    const punto = espacios >= 2 ? tope - 1 : tope;
    return { desde: punto, hasta: punto };
  }
  let b = hasta;
  while (b > a && ES_BLANCO.test(texto[b - 1])) b--;
  return { desde: a, hasta: b };
}

// `\multicolumn{n}{spec}{contenido}` que ocupa todo el tramo; null si no tiene esa forma.
function leerMulticolumna(texto: string, tramo: Rango): CeldaDeTabla | null {
  const argumentos: Rango[] = [];
  let j = tramo.desde + MULTICOLUMNA.length;
  for (let n = 0; n < 3; n++) {
    j = saltearBlancos(texto, j, tramo.hasta);
    if (texto[j] !== '{') return null;
    const cierre = cierreDe(texto, j, tramo.hasta);
    if (cierre === -1) return null;
    argumentos.push({ desde: j + 1, hasta: cierre });
    j = cierre + 1;
  }
  if (j !== tramo.hasta) return null;

  const [cantidad, spec, contenido] = argumentos;
  const ancho = texto.slice(cantidad.desde, cantidad.hasta).trim();
  const alineacion = /[lcrp]/.exec(texto.slice(spec.desde, spec.hasta))?.[0] as Alineacion | undefined;
  if (!/^[1-9]\d*$/.test(ancho) || !alineacion) return null;
  return { contenido: recortar(texto, contenido.desde, contenido.hasta, contenido.hasta), ancho: Number(ancho), alineacion };
}

// Lee un `tabular`. `interior` va desde justo después de `\begin{tabular}` hasta su `\end`.
// Ante cualquier cosa que no entiende responde 'no-reconocida': ahí la tabla se ve como código.
export function analizarTabla(texto: string, interior: Rango): Tabla {
  const noReconocida: Tabla = { clase: 'no-reconocida' };
  const fin = Math.min(interior.hasta, texto.length);
  const encabezado = leerColumnas(texto, Math.max(0, interior.desde), fin);
  if (!encabezado) return noReconocida;
  const { columnas } = encabezado;

  const filas: FilaDeTabla[] = [];
  let lineaFinal = false;
  let combinadas = false;
  let i = encabezado.hasta;

  for (;;) {
    // Las líneas cuentan solo antes de cualquier contenido de la fila.
    let lineaArriba = false;
    let desde = i;
    for (;;) {
      const k = saltearBlancos(texto, desde, fin);
      if (texto[k] !== '\\') break;
      const hasta = finDeNombre(texto, k, fin);
      if (!LINEAS.has(texto.slice(k + 1, hasta))) break;
      lineaArriba = true;
      desde = hasta;
    }

    const separadores: number[] = [];
    let cierre: Rango | null = null;
    let profundidad = 0;
    let p = desde;
    for (; p < fin && cierre === null; p++) {
      const c = texto[p];
      if (c === '%') return noReconocida;
      if (c === '{') profundidad++;
      else if (c === '}') { if (--profundidad < 0) return noReconocida; }
      else if (c === '&' && profundidad === 0) separadores.push(p);
      else if (c === '\\') {
        if (p + 1 < fin && ES_LETRA.test(texto[p + 1])) {
          const hasta = finDeNombre(texto, p, fin);
          if (FUERA_DE_ALCANCE.has(texto.slice(p + 1, hasta))) return noReconocida;
          p = hasta - 1;
        } else if (texto[p + 1] === '\\' && p + 1 < fin && profundidad === 0) {
          if (texto[p + 2] === '[' || texto[p + 2] === '*') return noReconocida;
          cierre = { desde: p, hasta: p + 2 };
        } else {
          p++;   // escape: \&, \%, \{, o un `\\` dentro de llaves
        }
      }
    }
    if (profundidad !== 0) return noReconocida;

    // Tras el último `\\` puede no quedar nada, o quedar una fila sin cerrar.
    if (cierre === null && separadores.length === 0 && texto.slice(desde, fin).trim() === '') {
      lineaFinal = lineaArriba;
      break;
    }

    const limite = cierre?.desde ?? fin;
    const celdas: CeldaDeTabla[] = [];
    for (let n = 0; n <= separadores.length; n++) {
      const a = n === 0 ? desde : separadores[n - 1] + 1;
      const b = n < separadores.length ? separadores[n] : limite;
      // La última celda de una fila sin cerrar llega hasta el `\end`: su lugar es su primera línea.
      const salto = cierre === null && n === separadores.length ? texto.indexOf('\n', a) : -1;
      const tramo = recortar(texto, a, b, salto !== -1 && salto < b ? salto : b);
      if (texto.startsWith(MULTICOLUMNA, tramo.desde) && !ES_LETRA.test(texto[tramo.desde + MULTICOLUMNA.length] ?? '')) {
        const celda = leerMulticolumna(texto, tramo);
        if (!celda) return noReconocida;
        combinadas = true;
        celdas.push(celda);
      } else {
        if (texto.slice(tramo.desde, tramo.hasta).includes(MULTICOLUMNA)) return noReconocida;
        celdas.push({ contenido: tramo, ancho: 1, alineacion: null });
      }
    }
    if (celdas.reduce((suma, celda) => suma + celda.ancho, 0) !== columnas.length) return noReconocida;
    filas.push({ desde, separadores, cierre, celdas, lineaArriba });

    if (cierre === null) break;
    i = cierre.hasta;
  }

  if (filas.length === 0) return noReconocida;
  return { clase: combinadas ? 'solo-lectura' : 'simple', columnas, filas, lineaFinal };
}
