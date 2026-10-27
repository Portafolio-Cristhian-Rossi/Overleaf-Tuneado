// Tipos y reglas de las dos verificaciones: el informe contra el código de la aplicación y el
// informe contra sí mismo. Sin módulos de Node: lo usa también el cliente.

export type Contra = 'codigo' | 'informe';
export type TipoDeCodigo = 'contradiccion' | 'no-lo-cuenta' | 'sin-respaldo';
export type TipoDeInforme = 'se-contradice' | 'definicion-distinta' | 'corta-el-hilo' | 'sin-definir';
// «sugerencia» no la devuelve el agente: son observaciones de redacción que se cargan con
// npm run sugerencias y se muestran con las de Informe.
export type TipoDeHallazgo = TipoDeCodigo | TipoDeInforme | 'sugerencia';
export type Alcance = 'capitulo' | 'todo';

export interface CitaDelInforme { archivo: string; linea: number | null; cita: string }

export interface Hallazgo {
  id: string;
  tipo: TipoDeHallazgo;
  informe: { archivo: string; linea: number | null; cita: string | null };   // cita null solo en no-lo-cuenta
  repo: { archivo: string; linea: number | null } | null;                    // null en sin-respaldo, sugerencia y los de Informe
  referencia?: CitaDelInforme;         // el otro lugar del informe; solo en los de Informe que lo llevan
  explicacion: string;
}

export interface Corrida {
  fecha: string;                       // ISO 8601
  contra: Contra;
  alcance: Alcance;
  archivos: string[];
  rama: string | null;                 // null en las corridas contra el informe
  commit: string | null;
  duracionMs: number;
  costoUsd: number | null;            // lo que informó el agente; las corridas viejas no lo traen
  estado: 'ok' | 'fallida';
  crudo: string | null;                // la salida del agente, solo si falló
  descartados: number;
  hallazgos: Hallazgo[];
  resueltos: string[];
  comparacion: { nuevos: number; yaNoAparecen: number } | null;
  autor?: string;                      // solo en las corridas de sugerencias: quién las dejó
}

export interface Ignorado {
  id: string;
  tipo: TipoDeHallazgo;
  archivoInforme: string;
  cita: string | null;
  archivoRepo: string | null;
  archivoReferencia?: string | null;   // los ignorados de antes de esta etapa no lo tienen
  explicacion: string;
  fecha: string;
}

export type MotivoDeFalla = 'sin-cli' | 'sin-sesion' | 'rama' | 'limite' | 'ilegible' | 'otro';

export interface ErrorDeVerificacion { contra: Contra; motivo: MotivoDeFalla; mensaje: string }

// motivos: por qué no se puede lanzar cada verificación, o null si se puede. errores: el de la
// última corrida fallida de cada tipo. Los dos son por tipo: correr una no cambia lo que muestra la otra.
export type EstadoVerificacion = {
  motivos: Record<Contra, string | null>;
  errores: Record<Contra, ErrorDeVerificacion | null>;
} & (
  | { estado: 'libre' }
  | { estado: 'en-curso'; contra: Contra; alcance: Alcance; desde: number }   // desde: Date.now() al iniciar
);

export const TIPOS_DEL_AGENTE: Record<Contra, readonly TipoDeHallazgo[]> = {
  codigo: ['contradiccion', 'no-lo-cuenta', 'sin-respaldo'],
  informe: ['se-contradice', 'definicion-distinta', 'corta-el-hilo', 'sin-definir'],
};

// Qué tipos muestra cada pestaña, en el orden en que aparecen.
export const TIPOS_DE_PESTANA: Record<Contra, readonly TipoDeHallazgo[]> = {
  codigo: ['contradiccion', 'sin-respaldo', 'no-lo-cuenta'],
  informe: ['se-contradice', 'definicion-distinta', 'corta-el-hilo', 'sin-definir', 'sugerencia'],
};

export const contraDeTipo = (t: TipoDeHallazgo): Contra => (TIPOS_DE_PESTANA.informe.includes(t) ? 'informe' : 'codigo');

// Las corridas guardadas antes de esta etapa no tienen contra: las de sugerencias (con autor) son de Informe.
export function contraDe(c: { contra?: Contra; autor?: string }): Contra {
  return c.contra ?? (c.autor !== undefined ? 'informe' : 'codigo');
}

const sinRepo = (tipo: string) => tipo !== 'contradiccion' && tipo !== 'no-lo-cuenta';
const esDeInforme = (tipo: string) => (TIPOS_DEL_AGENTE.informe as readonly string[]).includes(tipo);

export function normalizarEspacios(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

// Deja la ruta relativa a la raíz de su carpeta, con barras normales. Null si no se puede confiar en ella.
export function normalizarRuta(ruta: string, prefijo: 'informe' | 'repositorio'): string | null {
  let r = ruta.replace(/\\/g, '/').trim();
  if (r.startsWith('/') || /^[a-zA-Z]:/.test(r)) return null;
  r = r.replace(/^(?:\.\/)+/, '');
  if (r.startsWith(`${prefijo}/`)) r = r.slice(prefijo.length + 1);
  if (r === '' || r.split('/').includes('..')) return null;
  return r;
}

// FNV-1a de 32 bits. Estable ante cambios de línea y de espacios en la cita.
// El otro archivo es el del repositorio en Código y el de la referencia en Informe.
export function idDeHallazgo(h: Omit<Hallazgo, 'id' | 'explicacion'>): string {
  const otro = h.repo?.archivo ?? h.referencia?.archivo ?? '';
  const clave = [h.tipo, h.informe.archivo, normalizarEspacios(h.informe.cita ?? ''), otro].join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < clave.length; i++) {
    hash ^= clave.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const esEnteroPositivo = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1;

interface Contexto {
  informe: ReadonlyMap<string, string>;          // ruta relativa → texto con \n
  lineasDelRepo(archivo: string): number | null; // null si no existe
  revisados?: readonly string[];                 // si está, la cita principal tiene que estar en uno de estos
}

// Una cita textual del informe: el archivo tiene que estar en la foto y la frase, en el archivo.
function citaDelInforme(crudo: unknown, informe: ReadonlyMap<string, string>): CitaDelInforme | null {
  if (!esObjeto(crudo) || typeof crudo.archivo !== 'string' || typeof crudo.cita !== 'string') return null;
  const archivo = normalizarRuta(crudo.archivo, 'informe');
  const texto = archivo === null ? undefined : informe.get(archivo);
  const cita = normalizarEspacios(crudo.cita);
  if (archivo === null || texto === undefined || cita === '' || !normalizarEspacios(texto).includes(cita)) return null;
  return { archivo, linea: esEnteroPositivo(crudo.linea) ? crudo.linea : null, cita };
}

function validarUno(crudo: unknown, contexto: Contexto, tipos: readonly string[]): Hallazgo | null {
  if (!esObjeto(crudo)) return null;
  const { tipo, informe, repo, referencia, explicacion } = crudo;
  if (typeof tipo !== 'string' || !tipos.includes(tipo)) return null;
  if (typeof explicacion !== 'string' || explicacion.trim() === '') return null;
  if (!esObjeto(informe) || typeof informe.archivo !== 'string') return null;

  const archivoInforme = normalizarRuta(informe.archivo, 'informe');
  const texto = archivoInforme === null ? undefined : contexto.informe.get(archivoInforme);
  if (archivoInforme === null || texto === undefined) return null;
  if (contexto.revisados && !contexto.revisados.includes(archivoInforme)) return null;

  let cita: string | null = null;
  if (typeof informe.cita === 'string' && normalizarEspacios(informe.cita) !== '') {
    cita = normalizarEspacios(informe.cita);
    if (!normalizarEspacios(texto).includes(cita)) return null;
  } else if (informe.cita !== null && informe.cita !== undefined && informe.cita !== '') {
    return null;
  }
  if (cita === null && tipo !== 'no-lo-cuenta') return null;

  let ladoRepo: Hallazgo['repo'] = null;
  if (!sinRepo(tipo)) {
    if (!esObjeto(repo) || typeof repo.archivo !== 'string') return null;
    const archivoRepo = normalizarRuta(repo.archivo, 'repositorio');
    const lineas = archivoRepo === null ? null : contexto.lineasDelRepo(archivoRepo);
    if (archivoRepo === null || lineas === null) return null;
    let linea: number | null = null;
    if (repo.linea !== null && repo.linea !== undefined) {
      if (!esEnteroPositivo(repo.linea) || repo.linea > lineas) return null;
      linea = repo.linea;
    }
    ladoRepo = { archivo: archivoRepo, linea };
  }

  // En Informe, la referencia es obligatoria en se-contradice y definicion-distinta, opcional en
  // corta-el-hilo y no va en sin-definir. No puede ser la misma frase que la cita principal.
  let ladoReferencia: CitaDelInforme | null = null;
  if (esDeInforme(tipo)) {
    const vacia = referencia === undefined || referencia === null;
    if (tipo === 'sin-definir' && !vacia) return null;
    if ((tipo === 'se-contradice' || tipo === 'definicion-distinta') && vacia) return null;
    if (!vacia) {
      ladoReferencia = citaDelInforme(referencia, contexto.informe);
      if (ladoReferencia === null) return null;
      if (ladoReferencia.archivo === archivoInforme && ladoReferencia.cita === cita) return null;
    }
  }

  const base = {
    tipo: tipo as TipoDeHallazgo,
    informe: { archivo: archivoInforme, linea: esEnteroPositivo(informe.linea) ? informe.linea : null, cita },
    repo: ladoRepo,
    ...(ladoReferencia ? { referencia: ladoReferencia } : {}),
  };
  return { id: idDeHallazgo(base), ...base, explicacion: explicacion.trim() };
}

// Se queda con lo que se puede comprobar contra el informe y el repositorio; el resto se cuenta como descartado.
// Por defecto acepta solo los tipos que puede devolver el agente contra el código.
export function validarHallazgos(crudos: unknown, contexto: Contexto,
  tipos: readonly TipoDeHallazgo[] = TIPOS_DEL_AGENTE.codigo): { hallazgos: Hallazgo[]; descartados: number } {
  if (!Array.isArray(crudos)) return { hallazgos: [], descartados: 0 };
  // Los repetidos se fusionan en el primero: varios no-lo-cuenta del mismo par de archivos comparten id.
  const porId = new Map<string, { hallazgo: Hallazgo; explicaciones: string[] }>();
  let descartados = 0;
  for (const crudo of crudos) {
    const h = validarUno(crudo, contexto, tipos);
    if (!h) { descartados++; continue; }
    const previo = porId.get(h.id);
    if (!previo) porId.set(h.id, { hallazgo: h, explicaciones: [h.explicacion] });
    else if (!previo.explicaciones.includes(h.explicacion)) previo.explicaciones.push(h.explicacion);
  }
  const hallazgos = [...porId.values()].map(({ hallazgo, explicaciones }) => ({ ...hallazgo, explicacion: explicaciones.join(' ') }));
  return { hallazgos, descartados };
}

export function compararCorridas(anterior: readonly Hallazgo[], actual: readonly Hallazgo[]): { nuevos: number; yaNoAparecen: number } {
  const antes = new Set(anterior.map((h) => h.id));
  const ahora = new Set(actual.map((h) => h.id));
  return {
    nuevos: [...ahora].filter((id) => !antes.has(id)).length,
    yaNoAparecen: [...antes].filter((id) => !ahora.has(id)).length,
  };
}
