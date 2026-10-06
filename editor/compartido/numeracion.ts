import type { Elemento } from './analizador';

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
