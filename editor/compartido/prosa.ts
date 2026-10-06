import { analizar } from './analizador';

// Separa la prosa del LaTeX para el corrector. Concatenar `fuente` de todos los segmentos
// reproduce el texto original, así que las posiciones del corrector valen sobre el documento.
// `como`: lo que el corrector debe leer en lugar de una marca (por ejemplo "1" por un \ref),
// para que la oración siga teniendo sentido gramatical.
//
// Regla de oro: ante la duda, es marca. Quien escribe a mano va de izquierda a derecha, y
// mientras tipea \includegraphics{distribucion la llave de cierre todavía no existe: ese
// tramo no puede pasar por prosa, porque la autocorrección lo tocaría.
export interface Segmento { tipo: 'texto' | 'marca'; fuente: string; como?: string }
export interface Parrafo { desde: number; hasta: number; segmentos: Segmento[] }

// Entornos cuyo contenido no es prosa: código, matemática en bloque y tablas.
const LITERALES = new Set([
  'verbatim', 'verbatim*', 'Verbatim', 'BVerbatim', 'LVerbatim', 'alltt', 'lstlisting', 'minted', 'comment',
  'algorithmic', 'filecontents', 'filecontents*',
  'tabular', 'tabular*', 'tabularx', 'longtable', 'array',
  'equation', 'equation*', 'align', 'align*', 'eqnarray', 'eqnarray*', 'displaymath', 'math',
  'gather', 'gather*', 'multline', 'multline*', 'tikzpicture',
]);

// Comandos cuyos argumentos no son prosa (rutas, claves, opciones). No se leen.
const SIN_TEXTO = new Set([
  'label', 'includegraphics', 'includesvg', 'graphicspath', 'input', 'include', 'bibliography', 'bibliographystyle',
  'bibitem', 'usepackage', 'documentclass', 'hypersetup', 'newcommand', 'renewcommand', 'newenvironment',
  'renewenvironment', 'DeclareMathOperator', 'setlength', 'setcounter', 'addtocounter', 'addcontentsline',
  'vspace', 'hspace', 'lstinputlisting', 'lstset', 'color', 'definecolor', 'pagestyle', 'thispagestyle',
  'pagenumbering', 'selectlanguage', 'geometry',
]);

// Código en línea: nombres de funciones y archivos, no palabras.
const CODIGO = new Set(['texttt', 'lstinline', 'mintinline', 'path', 'code', 'url', 'nolinkurl']);
// El primer argumento no es prosa (una dirección, un color); el segundo sí.
const PRIMER_ARGUMENTO_NO_ES_PROSA = new Set(['href', 'textcolor', 'colorbox', 'hyperref']);
// Tras el cierre de un título o epígrafe empieza otra oración.
const TITULOS = new Set(['chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'caption']);

const ES_LETRA = /[a-zA-Z@]/;
const ESCAPES: Record<string, string> = {
  '%': '%', '&': '&', '_': '_', '#': '#', '$': '$', '{': '{', '}': '}',
  ',': ' ', ';': ' ', ':': ' ', ' ': ' ', '\\': '\n',
};

// Qué lee el corrector en lugar de una cita, según cómo se imprime.
function lecturaDeCita(nombre: string): string | undefined {
  if (nombre === 'nocite') return undefined;
  if (/author/i.test(nombre)) return 'Autor';
  if (/year/i.test(nombre)) return '2020';
  if (nombre.endsWith('A') || /^(citet|textcite|citeasnoun)/.test(nombre)) return 'Autor (2020)';
  return '(Autor, 2020)';
}

export function segmentar(texto: string): Segmento[] {
  const n = texto.length;
  const salida: Segmento[] = [];
  const llaves: boolean[] = [];        // por cada llave abierta: ¿es el argumento de un título?
  let i = 0;
  let inicioTexto = 0;

  const volcarTexto = (hasta: number) => {
    if (hasta > inicioTexto) salida.push({ tipo: 'texto', fuente: texto.slice(inicioTexto, hasta) });
  };
  // Emite [i, hasta) como marca y sigue después.
  const marca = (hasta: number, como?: string) => {
    volcarTexto(i);
    const fin = Math.max(hasta, i + 1);
    salida.push(como ? { tipo: 'marca', fuente: texto.slice(i, fin), como } : { tipo: 'marca', fuente: texto.slice(i, fin) });
    i = inicioTexto = fin;
  };

  const finDeLinea = (desde: number) => { const j = texto.indexOf('\n', desde); return j === -1 ? n : j; };

  // Nada de LaTeX cruza una línea en blanco: ni un argumento ni una fórmula. Los cierres se
  // buscan solo hasta el fin del párrafo; `i` siempre avanza, así que alcanza con un índice.
  const cortes = [...texto.matchAll(/\n[ \t]*\n/g)].map((m) => m.index);
  let corte = 0;
  const finDeParrafo = (desde: number) => {
    while (corte < cortes.length && cortes[corte] < desde) corte++;
    return corte < cortes.length ? cortes[corte] : n;
  };

  // Posición siguiente a `aguja` buscada en [desde, limite), o -1.
  const tras = (aguja: string, desde: number, limite: number) => {
    const j = texto.indexOf(aguja, desde);
    return j === -1 || j + aguja.length > limite ? -1 : j + aguja.length;
  };
  // Posición siguiente al `$` (o `$$`) que cierra, salteando los escapados, o -1.
  const cierreDeFormula = (cierre: string, desde: number, limite: number) => {
    for (let j = desde; j + cierre.length <= limite; j++) {
      if (texto[j] === '\\') j++;
      else if (texto.startsWith(cierre, j)) return j + cierre.length;
    }
    return -1;
  };

  // Posición siguiente al grupo que empieza en `pos` ({…}, […] o <…>), o -1 si no cierra
  // dentro del párrafo.
  const finDeGrupo = (pos: number): number => {
    const limite = finDeParrafo(pos);
    const abre = texto[pos];
    if (abre === '[' || abre === '<') return tras(abre === '[' ? ']' : '>', pos + 1, limite);
    let profundidad = 0;
    for (let j = pos; j < limite; j++) {
      const c = texto[j];
      if (c === '\\') j++;
      else if (c === '{') profundidad++;
      else if (c === '}' && --profundidad === 0) return j + 1;
    }
    return -1;
  };
  // Saltea los grupos pegados a `pos`. Devuelve -1 si alguno quedó abierto.
  const saltearGrupos = (pos: number, aperturas: string, maximo = Infinity): number => {
    for (let k = 0; k < maximo && pos < n && aperturas.includes(texto[pos]); k++) {
      const fin = finDeGrupo(pos);
      if (fin === -1) return -1;
      pos = fin;
    }
    return pos;
  };
  // Un comando que no es prosa, con sus argumentos. Si un argumento quedó sin cerrar, todo
  // lo que sigue en esa línea es parte de él.
  const marcaConArgumentos = (pos: number, aperturas: string, como?: string, maximo?: number) => {
    const fin = saltearGrupos(pos, aperturas, maximo);
    if (fin === -1) marca(finDeLinea(i));
    else marca(fin, como);
  };
  // Matemática: si no cierra dentro del párrafo, lo es hasta el fin del párrafo.
  const marcaHastaCierre = (fin: number, como?: string) => {
    if (fin === -1) marca(finDeParrafo(i));
    else marca(fin, como);
  };

  // El preámbulo (paquetes, título, autores) no es prosa del informe.
  const preambulo = analizar(texto).find((e) => e.tipo === 'preambulo');
  if (preambulo && preambulo.hasta > 0) marca(preambulo.hasta);

  while (i < n) {
    const c = texto[i];

    if (c === '%') { marca(finDeLinea(i)); continue; }
    if (c === '~') { marca(i + 1, ' '); continue; }
    if (c === '{') { llaves.push(false); marca(i + 1); continue; }
    if (c === '}') { marca(i + 1, llaves.pop() ? '\n\n' : undefined); continue; }
    if (c === '`') { marca(texto[i + 1] === '`' ? i + 2 : i + 1, texto[i + 1] === '`' ? '"' : "'"); continue; }
    if (c === "'" && texto[i + 1] === "'") { marca(i + 2, '"'); continue; }
    if (c === '$') {
      const cierre = texto[i + 1] === '$' ? '$$' : '$';
      marcaHastaCierre(cierreDeFormula(cierre, i + cierre.length, finDeParrafo(i)), cierre === '$' ? 'X' : undefined);
      continue;
    }
    if (c !== '\\') { i++; continue; }

    // Barra invertida: escape de un carácter, matemática, o un comando con nombre.
    const siguiente = texto[i + 1];
    if (siguiente === undefined) { marca(i + 1); continue; }
    if (!ES_LETRA.test(siguiente)) {
      if (siguiente === '(' || siguiente === '[') {
        marcaHastaCierre(tras(siguiente === '(' ? '\\)' : '\\]', i + 2, finDeParrafo(i)), siguiente === '(' ? 'X' : undefined);
      } else if (siguiente === '\\') {
        const fin = saltearGrupos(i + 2, '[', 1);       // salto de línea, quizá con [1cm]
        marca(fin === -1 ? i + 2 : fin, '\n');
      } else {
        marca(i + 2, ESCAPES[siguiente]);
      }
      continue;
    }

    let j = i + 1;
    while (j < n && ES_LETRA.test(texto[j])) j++;
    const nombre = texto.slice(i + 1, j);
    if (texto[j] === '*') j++;

    if (nombre === 'begin' || nombre === 'end') {
      const finNombre = texto[j] === '{' ? finDeGrupo(j) : j;
      if (finNombre === -1) { marca(finDeLinea(i)); continue; }
      const entorno = texto[j] === '{' ? texto.slice(j + 1, finNombre - 1) : '';
      if (nombre === 'begin' && LITERALES.has(entorno)) {
        const cierre = texto.indexOf(`\\end{${entorno}}`, finNombre);
        marca(cierre === -1 ? n : cierre + `\\end{${entorno}}`.length);
      } else if (nombre === 'begin') {
        marcaConArgumentos(finNombre, '[{');
      } else {
        marca(finNombre);
      }
    } else if (nombre === 'verb' || (nombre === 'lstinline' && texto[j] !== '{' && texto[j] !== '[')) {
      // \verb|…|: el delimitador es el carácter que sigue, y no pasa de la línea.
      const fin = j < n && texto[j] !== '\n' ? tras(texto[j], j + 1, finDeLinea(j)) : -1;
      marca(fin === -1 ? finDeLinea(i) : fin, 'X');
    } else if (CODIGO.has(nombre)) {
      marcaConArgumentos(j, '[{', nombre === 'url' || nombre === 'nolinkurl' ? 'enlace' : 'X');
    } else if (/cite/i.test(nombre)) {
      marcaConArgumentos(j, '<[{', lecturaDeCita(nombre));
    } else if (/ref$/i.test(nombre)) {
      marcaConArgumentos(j, '[{', '1');
    } else if (nombre === 'item') {
      marcaConArgumentos(j, '[', undefined, 1);
    } else if (SIN_TEXTO.has(nombre)) {
      marcaConArgumentos(j, '[{');
    } else if (PRIMER_ARGUMENTO_NO_ES_PROSA.has(nombre)) {
      marcaConArgumentos(saltearGrupos(j, '[') === -1 ? j : saltearGrupos(j, '['), '{', undefined, 1);
    } else {
      // Formato, títulos y comandos desconocidos: el comando es marca y su argumento, prosa.
      const finOpcionales = saltearGrupos(j, '[');
      marca(finOpcionales === -1 ? j : finOpcionales);
      if (TITULOS.has(nombre) && texto[i] === '{') { llaves.push(true); marca(i + 1); }
    }
  }
  volcarTexto(n);
  return salida;
}

const HAY_LETRA = /\p{L}/u;

// Los párrafos del documento que tienen prosa, cada uno con sus segmentos. Se separan por
// líneas en blanco; las que están dentro de un bloque de código no cuentan.
export function parrafosAnotados(texto: string): Parrafo[] {
  const parrafos: Parrafo[] = [];
  let actual: Segmento[] = [];
  let desde = 0;
  let posicion = 0;

  const cerrar = () => {
    // Se recortan los blancos de las puntas, que no forman parte del párrafo.
    while (actual.length > 0 && actual[0].tipo === 'texto') {
      const recortado = actual[0].fuente.trimStart();
      desde += actual[0].fuente.length - recortado.length;
      if (recortado !== '') { actual[0] = { tipo: 'texto', fuente: recortado }; break; }
      actual.shift();
    }
    while (actual.length > 0 && actual[actual.length - 1].tipo === 'texto') {
      const recortado = actual[actual.length - 1].fuente.trimEnd();
      if (recortado !== '') { actual[actual.length - 1] = { tipo: 'texto', fuente: recortado }; break; }
      actual.pop();
    }
    if (actual.some((s) => s.tipo === 'texto' && HAY_LETRA.test(s.fuente))) {
      parrafos.push({ desde, hasta: desde + actual.reduce((suma, s) => suma + s.fuente.length, 0), segmentos: actual });
    }
    actual = [];
  };

  for (const segmento of segmentar(texto)) {
    if (segmento.tipo === 'marca') {
      if (actual.length === 0) desde = posicion;
      actual.push(segmento);
      posicion += segmento.fuente.length;
      continue;
    }
    // Un tramo de prosa puede contener varias líneas en blanco: cada una cierra un párrafo.
    let resto = segmento.fuente;
    for (;;) {
      const corte = resto.match(/\n[ \t]*\n\s*/);
      const tramo = corte ? resto.slice(0, corte.index) : resto;
      if (tramo !== '') {
        if (actual.length === 0) desde = posicion;
        actual.push({ tipo: 'texto', fuente: tramo });
        posicion += tramo.length;
      }
      if (!corte) break;
      cerrar();
      posicion += corte[0].length;
      resto = resto.slice(corte.index! + corte[0].length);
    }
  }
  cerrar();
  return parrafos;
}
