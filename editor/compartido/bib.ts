// Lector de BibTeX. Lee lo mismo que leería `bibtex`: todo lo que está fuera de una entrada
// es comentario, y una arroba siempre empieza una entrada.

export interface EntradaBib {
  tipo: string;                      // en minúsculas: 'article', 'inproceedings'…
  clave: string;
  campos: Record<string, string>;    // nombre en minúsculas → valor sin sus delimitadores
  desde: number; hasta: number;      // de la arroba a la llave de cierre
}
export interface ProblemaBib { linea: number; mensaje: string }   // línea desde 1

const SIN_CIERRE = 'La entrada que empieza acá no cierra su llave.';
const MAL_FORMADA = 'La entrada que empieza acá está mal formada.';
const ES_BLANCO = /\s/;
const CIERRE: Record<string, string> = { '{': '}', '(': ')' };

export function analizarBib(texto: string): { entradas: EntradaBib[]; problemas: ProblemaBib[] } {
  const n = texto.length;
  const entradas: EntradaBib[] = [];
  const problemas: ProblemaBib[] = [];
  const lineaDeClave = new Map<string, number>();
  const lineaDe = (posicion: number) => texto.slice(0, posicion).split('\n').length;

  const saltarBlancos = (i: number) => {
    while (i < n && ES_BLANCO.test(texto[i])) i++;
    return i;
  };
  // Índice siguiente a la llave que cierra la abierta en `abre`, o -1.
  const finDeLlaves = (abre: number): number => {
    let profundidad = 0;
    for (let j = abre; j < n; j++) {
      if (texto[j] === '\\') j++;
      else if (texto[j] === '{') profundidad++;
      else if (texto[j] === '}' && --profundidad === 0) return j + 1;
    }
    return -1;
  };
  // Índice siguiente al cierre del grupo que abre en `abre` (llave o paréntesis), o -1.
  const finDeGrupo = (abre: number): number => {
    if (texto[abre] === '{') return finDeLlaves(abre);
    for (let j = abre + 1; j < n; j++) {
      if (texto[j] === '{') {
        const fin = finDeLlaves(j);
        if (fin === -1) return -1;
        j = fin - 1;
      } else if (texto[j] === ')') {
        return j + 1;
      }
    }
    return -1;
  };

  // Lee un valor (trozos unidos con #) desde `i`. Devuelve el texto y dónde sigue, o null.
  const leerValor = (i: number): { valor: string; sigue: number } | null => {
    const trozos: string[] = [];
    for (;;) {
      i = saltarBlancos(i);
      if (texto[i] === '{') {
        const fin = finDeLlaves(i);
        if (fin === -1) return null;
        trozos.push(texto.slice(i + 1, fin - 1));
        i = fin;
      } else if (texto[i] === '"') {
        let j = i + 1;
        let profundidad = 0;
        for (; j < n; j++) {
          if (texto[j] === '\\') j++;
          else if (texto[j] === '{') profundidad++;
          else if (texto[j] === '}') profundidad--;
          else if (texto[j] === '"' && profundidad <= 0) break;
        }
        if (j >= n) return null;
        trozos.push(texto.slice(i + 1, j));
        i = j + 1;
      } else {
        const palabra = /^[A-Za-z0-9][\w.:+-]*/.exec(texto.slice(i, i + 200))?.[0];
        if (!palabra) return null;
        trozos.push(palabra);
        i += palabra.length;
      }
      i = saltarBlancos(i);
      if (texto[i] !== '#') return { valor: trozos.join(' '), sigue: i };
      i++;
    }
  };

  let i = 0;
  while (i < n) {
    const arroba = texto.indexOf('@', i);
    if (arroba === -1) break;
    const tipo = /^[A-Za-z]+/.exec(texto.slice(arroba + 1, arroba + 60))?.[0].toLowerCase() ?? '';
    let j = saltarBlancos(arroba + 1 + tipo.length);
    // Para bibtex, @comment no encierra nada: lo que sigue se lee normalmente.
    if (tipo === '' || tipo === 'comment' || !(texto[j] in CIERRE)) { i = arroba + 1 + tipo.length; continue; }

    const abre = j;
    const cierre = CIERRE[texto[abre]];
    const finEntero = finDeGrupo(abre);
    if (tipo === 'string' || tipo === 'preamble') { i = finEntero === -1 ? arroba + 1 : finEntero; continue; }

    // Tras una entrada que no se pudo leer: su fin si las llaves cierran, o la próxima línea con arroba.
    const fallar = () => {
      problemas.push({ linea: lineaDe(arroba), mensaje: finEntero === -1 ? SIN_CIERRE : MAL_FORMADA });
      if (finEntero !== -1) return finEntero;
      const proxima = /\n[ \t]*@/.exec(texto.slice(arroba + 1));
      return proxima ? arroba + 1 + proxima.index + 1 : n;
    };

    j = saltarBlancos(abre + 1);
    const inicioClave = j;
    while (j < n && texto[j] !== ',' && texto[j] !== cierre && !ES_BLANCO.test(texto[j])) j++;
    const clave = texto.slice(inicioClave, j);
    if (clave === '') {
      if (finEntero === -1) { i = fallar(); continue; }
      problemas.push({ linea: lineaDe(arroba), mensaje: 'Falta la clave de la entrada.' });
      i = finEntero;
      continue;
    }

    const campos: Record<string, string> = {};
    let hasta = -1;
    for (;;) {
      j = saltarBlancos(j);
      if (texto[j] === ',') { j++; continue; }
      if (texto[j] === cierre) { hasta = j + 1; break; }
      const nombre = /^[^=\s,{}()"#]+/.exec(texto.slice(j, j + 200))?.[0];
      if (!nombre) break;
      j = saltarBlancos(j + nombre.length);
      if (texto[j] !== '=') break;
      const leido = leerValor(j + 1);
      if (!leido) break;
      campos[nombre.toLowerCase()] = leido.valor;
      j = leido.sigue;
    }
    if (hasta === -1) { i = fallar(); continue; }

    const yaVista = lineaDeClave.get(clave.toLowerCase());
    if (yaVista !== undefined) {
      problemas.push({ linea: lineaDe(arroba), mensaje: `La clave "${clave}" ya se usó en la línea ${yaVista}.` });
    } else {
      lineaDeClave.set(clave.toLowerCase(), lineaDe(arroba));
      entradas.push({ tipo, clave, campos, desde: arroba, hasta });
    }
    i = hasta;
  }
  return { entradas, problemas };
}

const COMBINANTE: Record<string, string> = {
  "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃',
  c: '̧', v: '̌', u: '̆', H: '̋', k: '̨',
};
const SIMBOLO: Record<string, string> = {
  ss: 'ß', o: 'ø', O: 'Ø', l: 'ł', L: 'Ł', ae: 'æ', AE: 'Æ', aa: 'å', AA: 'Å', i: 'i', j: 'j',
  textbar: '|', textendash: '–', textemdash: '—', textquotesingle: "'", textasciitilde: '~',
};

// El valor de un campo como se lee: sin comandos ni llaves. 'An{\'a}lisis de {BTM}' → 'Análisis de BTM'
export function sinLatex(valor: string): string {
  return valor
    .replace(/\\([ij])(?![A-Za-z])/g, '$1')
    .replace(/\\(['`^"~])\s*\{?\s*([A-Za-z])\s*\}?/g, (_m, acento: string, letra: string) => (letra + COMBINANTE[acento]).normalize('NFC'))
    .replace(/\\([cvuHk])(?:\s+|\s*\{\s*)([A-Za-z])\s*\}?/g, (_m, acento: string, letra: string) => (letra + COMBINANTE[acento]).normalize('NFC'))
    .replace(/\\([A-Za-z]+)(?![A-Za-z])\s*/g, (todo, nombre: string) => (nombre in SIMBOLO ? SIMBOLO[nombre] : todo))
    .replace(/\\([&%_#$])/g, '$1')
    .replace(/\\\\/g, ' ')
    .replace(/---/g, '—').replace(/--/g, '–').replace(/~/g, ' ')
    .replace(/\\[A-Za-z]+\*?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parte un texto por un separador que esté fuera de llaves.
function partirFuera(texto: string, separador: RegExp): string[] {
  const partes: string[] = [];
  let profundidad = 0;
  let inicio = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') profundidad++;
    else if (c === '}') profundidad--;
    else if (profundidad === 0) {
      const m = separador.exec(texto.slice(i));
      if (m && m.index === 0) {
        partes.push(texto.slice(inicio, i));
        i += m[0].length - 1;
        inicio = i + 1;
      }
    }
  }
  partes.push(texto.slice(inicio));
  return partes;
}

function apellidoDe(nombre: string): string {
  if (nombre.startsWith('{') && cierraAlFinal(nombre)) return sinLatex(nombre);
  const [antesDeLaComa, ...resto] = partirFuera(nombre, /^,/);
  if (resto.length > 0) return sinLatex(antesDeLaComa);
  const palabras = partirFuera(nombre, /^\s+/).filter(Boolean);
  let desde = palabras.length - 1;
  while (desde > 0 && /^[a-zà-ÿ]/.test(palabras[desde - 1])) desde--;
  return sinLatex(palabras.slice(desde).join(' '));
}

function cierraAlFinal(texto: string): boolean {
  let profundidad = 0;
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === '\\') i++;
    else if (texto[i] === '{') profundidad++;
    else if (texto[i] === '}' && --profundidad === 0) return i === texto.length - 1;
  }
  return false;
}

function autoresDe(entrada: EntradaBib): { lista: string[]; hayMas: boolean } {
  const fuente = (entrada.campos.author ?? '').trim() || (entrada.campos.editor ?? '').trim();
  const nombres = fuente === '' ? [] : partirFuera(fuente, /^\s+and\s+/i).map((nombre) => nombre.trim()).filter(Boolean);
  const hayMas = nombres.some((nombre) => nombre.toLowerCase() === 'others');
  return { lista: nombres.filter((nombre) => nombre.toLowerCase() !== 'others').map(apellidoDe).filter(Boolean), hayMas };
}

// Apellidos, como los lee quien cita: [] si no hay autor ni editor.
export function apellidos(entrada: EntradaBib): string[] {
  return autoresDe(entrada).lista;
}

const PALABRAS_DE_TITULO = 4;

// 'Cohen' | 'Susskind y Hrabovsky' | 'Holleis et al.' | el comienzo del título si no hay autores
export function autoresCortos(entrada: EntradaBib): string {
  const { lista, hayMas } = autoresDe(entrada);
  if (lista.length === 0) {
    const palabras = sinLatex(entrada.campos.title ?? '').split(' ').filter(Boolean);
    if (palabras.length === 0) return entrada.clave;
    return palabras.slice(0, PALABRAS_DE_TITULO).join(' ') + (palabras.length > PALABRAS_DE_TITULO ? '…' : '');
  }
  if (lista.length === 2 && !hayMas) return `${lista[0]} y ${lista[1]}`;
  return lista.length === 1 && !hayMas ? lista[0] : `${lista[0]} et al.`;
}

// El primer número de cuatro cifras de `year` (o de `date`); 's.f.' si no hay.
export function anioDe(entrada: EntradaBib): string {
  return /\d{4}/.exec(entrada.campos.year ?? '')?.[0] ?? /\d{4}/.exec(entrada.campos.date ?? '')?.[0] ?? 's.f.';
}
