import type { Elemento, Rango } from './analizador';

// Numeración de la clase book: capítulo, sección y subsección; la subsubsección no lleva número.
// La clave del mapa es el `desde` de cada título.
export function numerarTitulos(elementos: Elemento[], numeroCapitulo: string | null): Map<number, string | null> {
  const numeros = new Map<number, string | null>();
  let seccion = 0;
  let subseccion = 0;

  for (const e of elementos) {
    if (e.tipo !== 'titulo') continue;
    if (numeroCapitulo === null || e.conAsterisco || e.nivel === 3) {
      numeros.set(e.desde, null);
    } else if (e.nivel === 0) {
      seccion = 0;
      subseccion = 0;
      numeros.set(e.desde, numeroCapitulo);
    } else if (e.nivel === 1) {
      subseccion = 0;
      numeros.set(e.desde, `${numeroCapitulo}.${++seccion}`);
    } else {
      numeros.set(e.desde, `${numeroCapitulo}.${seccion}.${++subseccion}`);
    }
  }
  return numeros;
}

export type ClaseDeObjeto = 'figura' | 'tabla' | 'ecuacion';

// Figura, tabla o ecuación en bloque. Cada tramo es una parte con número propio: todo el
// objeto, o una fila de `align`. Sin tramos, el objeto no lleva número.
export interface ObjetoNumerado {
  clase: ClaseDeObjeto; desde: number; hasta: number;
  tramos: { desde: number; hasta: number; numero: string }[];
}

type Matematica = Extract<Elemento, { tipo: 'matematica' }>;

const SIN_NUMERO = /\\(?:nonumber|notag)(?![a-zA-Z@])/;

// Filas de un `align`: se separan con `\\` fuera de llaves y de entornos anidados (cases, pmatrix).
function filasDe(texto: string, contenido: Rango): Rango[] {
  const filas: Rango[] = [];
  let inicio = contenido.desde;
  let profundidad = 0;
  let anidados = 0;
  for (let j = contenido.desde; j < contenido.hasta; j++) {
    const c = texto[j];
    if (c === '%') {
      const fin = texto.indexOf('\n', j);
      j = fin === -1 || fin > contenido.hasta ? contenido.hasta : fin;
    } else if (c === '{') {
      profundidad++;
    } else if (c === '}') {
      profundidad--;
    } else if (c === '\\') {
      if (texto.startsWith('\\begin{', j)) anidados++;
      else if (texto.startsWith('\\end{', j)) anidados--;
      else if (texto[j + 1] === '\\' && profundidad === 0 && anidados === 0) {
        filas.push({ desde: inicio, hasta: j + 2 });
        inicio = j + 2;
      }
      j++;
    }
  }
  filas.push({ desde: inicio, hasta: contenido.hasta });
  return filas;
}

// Numeración de la clase book: `capítulo.n`, cada clase por separado dentro del archivo.
export function numerarObjetos(texto: string, elementos: Elemento[], numeroCapitulo: string | null): ObjetoNumerado[] {
  const contadores: Record<ClaseDeObjeto, number> = { figura: 0, tabla: 0, ecuacion: 0 };
  const siguiente = (clase: ClaseDeObjeto) => `${numeroCapitulo}.${++contadores[clase]}`;

  // Una figura o tabla lleva número si tiene epígrafe; el epígrafe es del flotante más interno.
  const flotantes = elementos.filter((e) => e.tipo === 'entorno' && (e.nombre === 'figure' || e.nombre === 'table'));
  const conEpigrafe = new Set<number>();
  for (const e of elementos) {
    if (e.tipo !== 'epigrafe') continue;
    const dueno = flotantes.filter((f) => f.desde <= e.desde && e.hasta <= f.hasta).at(-1);
    if (dueno) conEpigrafe.add(dueno.desde);
  }

  const tramosDeMatematica = (e: Matematica): ObjetoNumerado['tramos'] => {
    if (e.entorno === 'equation') {
      const sinNumero = SIN_NUMERO.test(texto.slice(e.contenido.desde, e.contenido.hasta));
      return sinNumero ? [] : [{ desde: e.desde, hasta: e.hasta, numero: siguiente('ecuacion') }];
    }
    if (e.entorno !== 'align') return [];
    return filasDe(texto, e.contenido)
      .filter((fila) => !SIN_NUMERO.test(texto.slice(fila.desde, fila.hasta)))
      .map((fila) => ({ ...fila, numero: siguiente('ecuacion') }));
  };

  const objetos: ObjetoNumerado[] = [];
  for (const e of elementos) {
    if (e.tipo === 'entorno' && (e.nombre === 'figure' || e.nombre === 'table')) {
      const clase = e.nombre === 'figure' ? 'figura' : 'tabla';
      const numerado = numeroCapitulo !== null && conEpigrafe.has(e.desde);
      objetos.push({ clase, desde: e.desde, hasta: e.hasta, tramos: numerado ? [{ desde: e.desde, hasta: e.hasta, numero: siguiente(clase) }] : [] });
    } else if (e.tipo === 'matematica' && !e.enLinea) {
      objetos.push({ clase: 'ecuacion', desde: e.desde, hasta: e.hasta, tramos: numeroCapitulo === null ? [] : tramosDeMatematica(e) });
    }
  }
  return objetos;
}

// Objeto más interno que contiene la posición, con el número del tramo que la contiene.
export function objetoEn(objetos: ObjetoNumerado[], posicion: number): { clase: ClaseDeObjeto; numero: string | null } | null {
  const contiene = (r: Rango) => r.desde <= posicion && posicion < r.hasta;
  const objeto = objetos.filter(contiene).reduce<ObjetoNumerado | null>((a, b) => (a === null || b.desde >= a.desde ? b : a), null);
  if (!objeto) return null;
  return { clase: objeto.clase, numero: objeto.tramos.find(contiene)?.numero ?? null };
}
