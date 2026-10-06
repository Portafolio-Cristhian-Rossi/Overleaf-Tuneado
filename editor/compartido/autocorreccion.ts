// Decide si una palabra recién escrita se corrige sola. La regla general es no tocar: solo
// se corrige cuando la palabra no existe y hay una única corrección evidente. Todo lo demás
// queda subrayado para que decida quien escribe.

// `sugerencias` tiene que ser la lista completa del corrector: decidir que hay "una única
// candidata" mirando solo las primeras sería decidir a ciegas.
export interface AvisoDePalabra { regla: string; sugerencias: string[] }

// Regla del corrector para "esta palabra no está en el diccionario".
const REGLA_NO_EXISTE = 'MORFOLOGIK_RULE_ES';

// Palabras que nunca existen sin tilde. El corrector las informa con reglas propias, no con la
// de "no existe", así que se listan acá. No van las que también son válidas sin tilde (mas, mi, esta).
const SIEMPRE_CON_TILDE: Record<string, string> = {
  tambien: 'también', ademas: 'además', segun: 'según', despues: 'después', aqui: 'aquí',
  asi: 'así', alli: 'allí', ahi: 'ahí', jamas: 'jamás', quizas: 'quizás', traves: 'través',
  detras: 'detrás', atras: 'atrás',
};

// Un término en inglés de cuatro o cinco letras suele estar a un intercambio de letras de una
// palabra española (seed/sede, form/from). En palabras más largas eso casi no pasa.
const LARGO_MINIMO_PARA_INVERTIDAS = 6;

const sinTildes = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

// ¿`b` es `a` con dos letras vecinas intercambiadas?
function esTransposicion(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  const i = [...a].findIndex((letra, k) => letra !== b[k]);
  return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
}

const unica = (candidatas: string[]): string | null => (candidatas.length === 1 ? candidatas[0] : null);

export function decidir(palabra: string, aviso: AvisoDePalabra | null, excepciones: ReadonlySet<string>): string | null {
  if (!aviso || excepciones.has(palabra.toLowerCase())) return null;
  if (/[^\p{L}]/u.test(palabra)) return null;                    // word2vec, co-autor: no son palabras sueltas
  const sugerencias = aviso.sugerencias.filter((s) => !/\s/.test(s) && s !== palabra);

  // Mayúsculas después de la primera letra: una sigla o un nombre (BERT, BERTopic, iPhone, GPUs).
  // La única forma que se corrige es el dedo que quedó en Shift: "ESta" → "Esta".
  if (/\p{Lu}/u.test(palabra.slice(1))) {
    if (aviso.regla !== REGLA_NO_EXISTE || !/^\p{Lu}{2}\p{Ll}{2,}$/u.test(palabra)) return null;
    const normal = palabra[0] + palabra.slice(1).toLowerCase();
    return sugerencias.includes(normal) ? normal : null;
  }

  const conTilde = SIEMPRE_CON_TILDE[palabra.toLowerCase()];
  if (conTilde) {
    return sugerencias.find((s) => s.toLowerCase() === conTilde && sinTildes(s) === palabra) ?? null;
  }
  if (aviso.regla !== REGLA_NO_EXISTE) return null;

  // 1. Tilde (o eñe) faltante: mismas letras, con las mismas mayúsculas.
  const porTilde = sugerencias.filter((s) => sinTildes(s) === sinTildes(palabra));
  if (porTilde.length > 0) return unica(porTilde);

  // 2. Dos letras vecinas invertidas, solo si es lo primero que propone el corrector.
  //    Primero tal cual; si no, admitiendo además una tilde.
  if (palabra.length >= LARGO_MINIMO_PARA_INVERTIDAS) {
    const exactas = sugerencias.filter((s) => esTransposicion(palabra, s));
    const candidatas = exactas.length > 0 ? exactas : sugerencias.filter((s) => esTransposicion(sinTildes(palabra), sinTildes(s)));
    if (candidatas.length === 1 && candidatas[0] === sugerencias[0]) return candidatas[0];
  }
  return null;
}
