import type { Rango } from './analizador';
import type { Edicion } from './tipos';

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
// Comandos que cambian la forma de la tabla y el editor no sabe dibujar ni mantener. Dentro de
// \verb un `&` es texto y no se puede contar como separador.
const FUERA_DE_ALCANCE = new Set(['begin', 'end', 'multirow', 'cline', 'cmidrule', 'verb']);
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

export const MOTIVOS = {
  llaves: 'Hay una llave sin cerrar o de más.',
  pesos: 'Hay un signo $ sin cerrar. Para escribir el signo, usá \\$.',
  rompe: 'Ese texto rompería la tabla. Para cosas así usá Ver código.',
  noEsta: 'La tabla cambió y esta celda ya no se puede editar acá.',
} as const;

export type ResultadoDeCelda = { tipo: 'ok'; edicion: Edicion } | { tipo: 'error'; motivo: string };

// Las operaciones solo valen sobre una tabla simple.
function simpleEn(texto: string, interior: Rango): TablaLeida | null {
  const tabla = analizarTabla(texto, interior);
  return tabla.clase === 'simple' ? tabla : null;
}

// La vista maneja el foco por fila y columna: la selección de estas ediciones no se usa.
const edicionCon = (interior: Rango, cambios: Edicion['cambios']): Edicion =>
  ({ cambios, seleccion: { ancla: interior.desde, cabeza: interior.desde } });

// Lo escrito en una celda como LaTeX: sin los espacios de los bordes y con `&` y `%` escapados.
function prepararCelda(escrito: string): { latex: string } | { motivo: string } {
  const recortado = escrito.trim();
  let latex = '';
  let profundidad = 0;
  let pesos = 0;
  let llavesDeMas = false;
  for (let j = 0; j < recortado.length; j++) {
    const c = recortado[j];
    if (c === '\\') {
      // La barra y lo que escapa van juntos: así se sabe si un `&` ya venía escapado.
      latex += c + (recortado[j + 1] ?? '');
      j++;
      continue;
    }
    if (c === '{') profundidad++;
    else if (c === '}' && --profundidad < 0) llavesDeMas = true;
    else if (c === '$') pesos++;
    latex += c === '&' || c === '%' ? `\\${c}` : c;
  }
  if (llavesDeMas || profundidad !== 0) return { motivo: MOTIVOS.llaves };
  if (pesos % 2 !== 0) return { motivo: MOTIVOS.pesos };
  return { latex };
}

// Cambia solo el contenido de esa celda. No aplica nada que deje la tabla con otra forma.
export function editarCelda(texto: string, interior: Rango, fila: number, columna: number, escrito: string): ResultadoDeCelda {
  const tabla = simpleEn(texto, interior);
  const celda = tabla?.filas[fila]?.celdas[columna];
  if (!tabla || !celda) return { tipo: 'error', motivo: MOTIVOS.noEsta };

  const preparada = prepararCelda(escrito);
  if ('motivo' in preparada) return { tipo: 'error', motivo: preparada.motivo };
  const { latex } = preparada;
  const { desde, hasta } = celda.contenido;
  if (latex === texto.slice(desde, hasta)) return { tipo: 'ok', edicion: edicionCon(interior, []) };

  // Se comprueba sobre el resultado: la tabla sigue igual de grande y esa celda dice eso.
  const resultado = texto.slice(0, desde) + latex + texto.slice(hasta);
  const despues = simpleEn(resultado, { desde: interior.desde, hasta: interior.hasta + latex.length - (hasta - desde) });
  const quedo = despues?.filas[fila]?.celdas[columna]?.contenido;
  const igualDeGrande = despues !== null && despues.columnas.length === tabla.columnas.length && despues.filas.length === tabla.filas.length;
  if (!igualDeGrande || !quedo || resultado.slice(quedo.desde, quedo.hasta) !== latex) return { tipo: 'error', motivo: MOTIVOS.rompe };

  return { tipo: 'ok', edicion: edicionCon(interior, [{ desde, hasta, insertar: latex }]) };
}

// Lo que puede seguir a una fila en su línea sin ser otra fila.
const SOLO_LINEAS = /^(?:[ \t]*\\(?:hline|toprule|midrule|bottomrule)(?![a-zA-Z@]))*[ \t]*$/;
// En una rejilla el \hline es de cada fila; las líneas de booktabs son de la tabla.
const LINEA_DE_BOOKTABS = /[ \t]*\\(?:toprule|midrule|bottomrule)(?![a-zA-Z@])/g;

const esEspacio = (c: string | undefined) => c === ' ' || c === '\t';
const esTira = (c: string | undefined) => c === '|' || c === ' ';

interface LugarDeFila {
  // Su primer carácter que no es espacio, y el final de su `\\` o de su último contenido.
  inicio: number; fin: number;
  // Las líneas que ocupa, sin el salto final.
  lineaDesde: number; lineaHasta: number;
  // Lo que sigue a la fila en su última línea.
  cola: string;
  // En sus líneas no hay otra fila ni nada ajeno al tabular.
  sola: boolean;
}

function lugarDe(texto: string, interior: Rango, fila: FilaDeTabla): LugarDeFila {
  let inicio = fila.desde;
  while (inicio < interior.hasta && ES_BLANCO.test(texto[inicio])) inicio++;
  let fin = fila.cierre?.hasta ?? interior.hasta;
  if (!fila.cierre) while (fin > inicio && ES_BLANCO.test(texto[fin - 1])) fin--;

  const lineaDesde = texto.lastIndexOf('\n', inicio - 1) + 1;
  const salto = texto.indexOf('\n', fin);
  const lineaHasta = salto === -1 ? texto.length : salto;
  const cola = texto.slice(fin, Math.min(lineaHasta, interior.hasta));
  const sola = texto.slice(lineaDesde, inicio).trim() === '' && lineaHasta < interior.hasta && SOLO_LINEAS.test(cola);
  return { inicio, fin, lineaDesde, lineaHasta, cola, sola };
}

// El tramo de una fila con el contenido de cada celda vaciado: quedan la sangría y los separadores.
function vaciada(texto: string, fila: FilaDeTabla, desde: number, hasta: number): string {
  let resultado = texto.slice(desde, hasta);
  for (const { contenido } of [...fila.celdas].reverse()) {
    // Una celda vacía no tiene qué quitar, y su punto puede caer fuera del tramo.
    if (contenido.hasta === contenido.desde) continue;
    resultado = resultado.slice(0, contenido.desde - desde) + resultado.slice(contenido.hasta - desde);
  }
  return resultado;
}

// La fila nueva copia la sangría y el espaciado de la vecina.
export function agregarFila(texto: string, interior: Rango, fila: number, lado: 'arriba' | 'abajo'): Edicion | null {
  const vecina = simpleEn(texto, interior)?.filas[fila];
  if (!vecina) return null;
  const lugar = lugarDe(texto, interior, vecina);
  // Junto a una última fila sin cerrar, la nueva cierra igual; y si va debajo, la vecina también.
  const cierre = vecina.cierre ? '' : ' \\\\';

  if (!lugar.sola) {
    const copia = vaciada(texto, vecina, lugar.inicio, lugar.fin) + cierre;
    return edicionCon(interior, [lado === 'abajo'
      ? { desde: lugar.fin, hasta: lugar.fin, insertar: `${cierre} ${copia}` }
      : { desde: lugar.inicio, hasta: lugar.inicio, insertar: `${copia} ` }]);
  }

  const nueva = vaciada(texto, vecina, lugar.lineaDesde, lugar.fin) + cierre + lugar.cola.replace(LINEA_DE_BOOKTABS, '');
  if (lado === 'arriba') return edicionCon(interior, [{ desde: lugar.lineaDesde, hasta: lugar.lineaDesde, insertar: `${nueva}\n` }]);
  // Dos cambios en el mismo punto no tienen orden definido: si coinciden, van en uno.
  if (cierre === '' || lugar.fin === lugar.lineaHasta) {
    return edicionCon(interior, [{ desde: lugar.lineaHasta, hasta: lugar.lineaHasta, insertar: `${cierre}\n${nueva}` }]);
  }
  return edicionCon(interior, [
    { desde: lugar.fin, hasta: lugar.fin, insertar: cierre },
    { desde: lugar.lineaHasta, hasta: lugar.lineaHasta, insertar: `\n${nueva}` },
  ]);
}

export function borrarFila(texto: string, interior: Rango, fila: number): Edicion | null {
  const tabla = simpleEn(texto, interior);
  const elegida = tabla?.filas[fila];
  if (!tabla || !elegida || tabla.filas.length === 1) return null;
  const lugar = lugarDe(texto, interior, elegida);

  if (lugar.sola && lugar.cola.replace(LINEA_DE_BOOKTABS, '') === lugar.cola) {
    return edicionCon(interior, [{ desde: lugar.lineaDesde, hasta: lugar.lineaHasta + 1, insertar: '' }]);
  }
  let hasta = lugar.fin;
  while (hasta < interior.hasta && esEspacio(texto[hasta])) hasta++;
  return edicionCon(interior, [{ desde: lugar.inicio, hasta, insertar: '' }]);
}

// La columna nueva copia el tramo de la vecina y la tira de barras que la separa de ese lado.
export function agregarColumna(texto: string, interior: Rango, columna: number, lado: 'izquierda' | 'derecha'): Edicion | null {
  const tabla = simpleEn(texto, interior);
  const vecina = tabla?.columnas[columna];
  if (!tabla || !vecina) return null;
  const tramo = texto.slice(vecina.spec.desde, vecina.spec.hasta);
  const cambios: Edicion['cambios'] = [];

  if (lado === 'derecha') {
    let j = vecina.spec.hasta;
    while (esTira(texto[j])) j++;
    cambios.push({ desde: j, hasta: j, insertar: tramo + texto.slice(vecina.spec.hasta, j) });
  } else {
    let j = vecina.spec.desde;
    while (esTira(texto[j - 1])) j--;
    cambios.push({ desde: j, hasta: j, insertar: texto.slice(j, vecina.spec.desde) + tramo });
  }
  for (const fila of tabla.filas) {
    const { contenido } = fila.celdas[columna];
    const punto = lado === 'derecha' ? contenido.hasta : contenido.desde;
    cambios.push({ desde: punto, hasta: punto, insertar: ' & ' });
  }
  return edicionCon(interior, cambios);
}

export function borrarColumna(texto: string, interior: Rango, columna: number): Edicion | null {
  const tabla = simpleEn(texto, interior);
  const elegida = tabla?.columnas[columna];
  if (!tabla || !elegida || tabla.columnas.length === 1) return null;
  const cambios: Edicion['cambios'] = [];

  // Con su letra se va la tira de barras que la sigue; en la última columna, la que la precede.
  if (columna < tabla.columnas.length - 1) {
    let j = elegida.spec.hasta;
    while (esTira(texto[j])) j++;
    cambios.push({ desde: elegida.spec.desde, hasta: j, insertar: '' });
  } else {
    let j = elegida.spec.desde;
    while (esTira(texto[j - 1])) j--;
    cambios.push({ desde: j, hasta: elegida.spec.hasta, insertar: '' });
  }

  for (const fila of tabla.filas) {
    const tope = fila.cierre?.desde ?? interior.hasta;
    const trasEspacios = (j: number) => {
      while (j < tope && esEspacio(texto[j])) j++;
      return j;
    };
    const { contenido } = fila.celdas[columna];
    if (columna === 0) cambios.push({ desde: contenido.desde, hasta: trasEspacios(fila.separadores[0] + 1), insertar: '' });
    else if (columna < fila.separadores.length) cambios.push({ desde: fila.separadores[columna - 1], hasta: fila.separadores[columna], insertar: '' });
    else cambios.push({ desde: fila.separadores[columna - 1], hasta: trasEspacios(contenido.hasta), insertar: '' });
  }
  return edicionCon(interior, cambios);
}

// null en una columna de ancho fijo (`p{…}`): cambiarle la letra le quitaría el ancho.
export function alinearColumna(texto: string, interior: Rango, columna: number, alineacion: 'l' | 'c' | 'r'): Edicion | null {
  const elegida = simpleEn(texto, interior)?.columnas[columna];
  if (!elegida || elegida.alineacion === 'p') return null;
  if (elegida.alineacion === alineacion) return edicionCon(interior, []);
  return edicionCon(interior, [{ desde: elegida.spec.desde, hasta: elegida.spec.hasta, insertar: alineacion }]);
}
