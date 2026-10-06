export interface Rango { desde: number; hasta: number }

export type Elemento =
  | ({ tipo: 'titulo'; nivel: 0 | 1 | 2 | 3; conAsterisco: boolean; contenido: Rango } & Rango)
  | ({ tipo: 'formato'; estilo: 'negrita' | 'cursiva' | 'mono'; contenido: Rango } & Rango)
  | ({ tipo: 'inicioLista' | 'finLista'; clase: 'itemize' | 'enumerate' } & Rango)
  | ({ tipo: 'item'; ordinal: number | null } & Rango)
  | ({ tipo: 'ref'; clave: string } & Rango)
  | ({ tipo: 'cita'; comando: string; claves: string[] } & Rango)
  | ({ tipo: 'etiqueta'; nombre: string } & Rango)
  | ({ tipo: 'comentario' } & Rango)
  | ({ tipo: 'preambulo' } & Rango);

const NIVELES: Record<string, 0 | 1 | 2 | 3> = { chapter: 0, section: 1, subsection: 2, subsubsection: 3 };
const ESTILOS: Record<string, 'negrita' | 'cursiva' | 'mono'> = {
  textbf: 'negrita', textit: 'cursiva', emph: 'cursiva', texttt: 'mono',
};
const ENTORNOS_LITERALES = new Set(['verbatim', 'verbatim*', 'lstlisting', 'minted']);
const ES_CITA = /^(?:(?:full|short)?cite(?:A|NP|author|year|yearNP)?|nocite)$/;
const ES_LETRA = /[a-zA-Z@]/;

// Recorre el texto una sola vez. Lo que no reconoce, o no cierra, no se reporta.
export function analizar(texto: string): Elemento[] {
  const n = texto.length;
  const salida: Elemento[] = [];
  const listas: { clase: 'itemize' | 'enumerate'; contador: number }[] = [];
  let preambuloVisto = false;
  let i = 0;

  const finDeLinea = (desde: number) => {
    const j = texto.indexOf('\n', desde);
    return j === -1 ? n : j;
  };

  // Índice de la llave que cierra la abierta en `abre`, o -1.
  const cierreDe = (abre: number): number => {
    let profundidad = 0;
    for (let j = abre; j < n; j++) {
      const c = texto[j];
      if (c === '\\') j++;
      else if (c === '%') j = finDeLinea(j);
      else if (c === '{') profundidad++;
      else if (c === '}' && --profundidad === 0) return j;
    }
    return -1;
  };

  // Argumento entre llaves que empieza exactamente en `pos`.
  const argumento = (pos: number): { contenido: Rango; hasta: number } | null => {
    if (texto[pos] !== '{') return null;
    const cierre = cierreDe(pos);
    return cierre === -1 ? null : { contenido: { desde: pos + 1, hasta: cierre }, hasta: cierre + 1 };
  };

  // Saltea grupos opcionales <...> y [...] consecutivos; -1 si alguno no cierra.
  const saltearOpcionales = (pos: number, aperturas: string): number => {
    const cierres: Record<string, string> = { '<': '>', '[': ']' };
    while (pos < n && aperturas.includes(texto[pos])) {
      const fin = texto.indexOf(cierres[texto[pos]], pos + 1);
      if (fin === -1) return -1;
      pos = fin + 1;
    }
    return pos;
  };

  while (i < n) {
    const c = texto[i];

    if (c === '%') {
      const hasta = finDeLinea(i);
      salida.push({ tipo: 'comentario', desde: i, hasta });
      i = hasta;
      continue;
    }
    if (c !== '\\') { i++; continue; }

    const desde = i;
    let j = i + 1;
    if (j >= n || !ES_LETRA.test(texto[j])) { i += 2; continue; }   // escape: \%, \{, \\
    while (j < n && ES_LETRA.test(texto[j])) j++;
    const nombre = texto.slice(i + 1, j);
    i = j;   // por defecto se sigue justo después del nombre

    if (nombre in NIVELES) {
      const conAsterisco = texto[j] === '*';
      const pos = saltearOpcionales(conAsterisco ? j + 1 : j, '[');
      const arg = pos === -1 ? null : argumento(pos);
      if (arg) {
        salida.push({ tipo: 'titulo', nivel: NIVELES[nombre], conAsterisco, desde, hasta: arg.hasta, contenido: arg.contenido });
        i = arg.contenido.desde;
      }
    } else if (nombre in ESTILOS) {
      const arg = argumento(j);
      if (arg) {
        salida.push({ tipo: 'formato', estilo: ESTILOS[nombre], desde, hasta: arg.hasta, contenido: arg.contenido });
        i = arg.contenido.desde;
      }
    } else if (nombre === 'begin' || nombre === 'end') {
      const arg = argumento(j);
      if (!arg) continue;
      const entorno = texto.slice(arg.contenido.desde, arg.contenido.hasta);
      i = arg.hasta;
      if (nombre === 'begin' && ENTORNOS_LITERALES.has(entorno)) {
        const cierre = texto.indexOf(`\\end{${entorno}}`, i);
        i = cierre === -1 ? n : cierre + `\\end{${entorno}}`.length;
      } else if (entorno === 'itemize' || entorno === 'enumerate') {
        if (nombre === 'begin') {
          listas.push({ clase: entorno, contador: 0 });
          salida.push({ tipo: 'inicioLista', clase: entorno, desde, hasta: arg.hasta });
        } else {
          if (listas.at(-1)?.clase === entorno) listas.pop();
          salida.push({ tipo: 'finLista', clase: entorno, desde, hasta: arg.hasta });
        }
      } else if (nombre === 'begin' && entorno === 'document' && !preambuloVisto) {
        preambuloVisto = true;
        salida.push({ tipo: 'preambulo', desde: 0, hasta: desde });
      }
    } else if (nombre === 'item') {
      const lista = listas.at(-1);
      if (lista) {
        salida.push({ tipo: 'item', ordinal: lista.clase === 'enumerate' ? ++lista.contador : null, desde, hasta: j });
      }
    } else if (nombre === 'ref' || nombre === 'label') {
      const arg = argumento(j);
      if (arg) {
        const valor = texto.slice(arg.contenido.desde, arg.contenido.hasta);
        salida.push(nombre === 'ref'
          ? { tipo: 'ref', clave: valor, desde, hasta: arg.hasta }
          : { tipo: 'etiqueta', nombre: valor, desde, hasta: arg.hasta });
        i = arg.hasta;
      }
    } else if (ES_CITA.test(nombre)) {
      const pos = saltearOpcionales(j, '<[');
      const arg = pos === -1 ? null : argumento(pos);
      if (arg) {
        const claves = texto.slice(arg.contenido.desde, arg.contenido.hasta).split(',').map((k) => k.trim()).filter(Boolean);
        salida.push({ tipo: 'cita', comando: nombre, claves, desde, hasta: arg.hasta });
        i = arg.hasta;
      }
    } else if (nombre === 'verb') {
      const inicio = texto[j] === '*' ? j + 1 : j;   // el carácter en `inicio` es el delimitador
      if (inicio < n) {
        const fin = texto.indexOf(texto[inicio], inicio + 1);
        i = fin === -1 ? finDeLinea(inicio) : fin + 1;
      }
    }
  }

  // El preámbulo se descubre tarde pero empieza en 0: se reordena por inicio.
  return salida
    .map((e, orden) => ({ e, orden }))
    .sort((a, b) => a.e.desde - b.e.desde || (a.e.tipo === 'preambulo' ? -1 : b.e.tipo === 'preambulo' ? 1 : a.orden - b.orden))
    .map(({ e }) => e);
}
