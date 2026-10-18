// Tipos y reglas del verificador informe ↔ repositorio. Sin módulos de Node: lo usa también el cliente.

export type TipoDeHallazgo = 'contradiccion' | 'no-lo-cuenta' | 'sin-respaldo';
export type Alcance = 'capitulo' | 'todo';

export interface Hallazgo {
  id: string;
  tipo: TipoDeHallazgo;
  informe: { archivo: string; linea: number | null; cita: string | null };   // cita null solo en no-lo-cuenta
  repo: { archivo: string; linea: number | null } | null;                    // null solo en sin-respaldo
  explicacion: string;
}

export interface Corrida {
  fecha: string;                       // ISO 8601
  alcance: Alcance;
  archivos: string[];
  rama: string;
  commit: string;
  duracionMs: number;
  estado: 'ok' | 'fallida';
  crudo: string | null;                // la salida del agente, solo si falló
  descartados: number;
  hallazgos: Hallazgo[];
  resueltos: string[];
  comparacion: { nuevos: number; yaNoAparecen: number } | null;
}

export interface Ignorado {
  id: string;
  tipo: TipoDeHallazgo;
  archivoInforme: string;
  cita: string | null;
  archivoRepo: string | null;
  explicacion: string;
  fecha: string;
}

export type MotivoDeFalla = 'sin-cli' | 'sin-sesion' | 'rama' | 'limite' | 'ilegible' | 'otro';

export type EstadoVerificacion =
  | { estado: 'deshabilitada'; motivo: string }
  | { estado: 'libre'; error: { motivo: MotivoDeFalla; mensaje: string } | null }
  | { estado: 'en-curso'; alcance: Alcance; desde: number };   // desde: Date.now() al iniciar

const TIPOS: readonly string[] = ['contradiccion', 'no-lo-cuenta', 'sin-respaldo'];

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
export function idDeHallazgo(h: Omit<Hallazgo, 'id' | 'explicacion'>): string {
  const clave = [h.tipo, h.informe.archivo, normalizarEspacios(h.informe.cita ?? ''), h.repo?.archivo ?? ''].join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < clave.length; i++) {
    hash ^= clave.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const esEnteroPositivo = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1;

function validarUno(
  crudo: unknown,
  contexto: { informe: ReadonlyMap<string, string>; lineasDelRepo(archivo: string): number | null },
): Hallazgo | null {
  if (!esObjeto(crudo)) return null;
  const { tipo, informe, repo, explicacion } = crudo;
  if (typeof tipo !== 'string' || !TIPOS.includes(tipo)) return null;
  if (typeof explicacion !== 'string' || explicacion.trim() === '') return null;
  if (!esObjeto(informe) || typeof informe.archivo !== 'string') return null;

  const archivoInforme = normalizarRuta(informe.archivo, 'informe');
  const texto = archivoInforme === null ? undefined : contexto.informe.get(archivoInforme);
  if (archivoInforme === null || texto === undefined) return null;

  let cita: string | null = null;
  if (typeof informe.cita === 'string' && normalizarEspacios(informe.cita) !== '') {
    cita = normalizarEspacios(informe.cita);
    if (!normalizarEspacios(texto).includes(cita)) return null;
  } else if (informe.cita !== null && informe.cita !== undefined && informe.cita !== '') {
    return null;
  }
  if (cita === null && tipo !== 'no-lo-cuenta') return null;

  let ladoRepo: Hallazgo['repo'] = null;
  if (tipo !== 'sin-respaldo') {
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

  const base = {
    tipo: tipo as TipoDeHallazgo,
    informe: { archivo: archivoInforme, linea: esEnteroPositivo(informe.linea) ? informe.linea : null, cita },
    repo: ladoRepo,
  };
  return { id: idDeHallazgo(base), ...base, explicacion: explicacion.trim() };
}

// Se queda con lo que se puede comprobar contra el informe y el repositorio; el resto se cuenta como descartado.
export function validarHallazgos(crudos: unknown, contexto: {
  informe: ReadonlyMap<string, string>;          // ruta relativa → texto con \n
  lineasDelRepo(archivo: string): number | null; // null si no existe
}): { hallazgos: Hallazgo[]; descartados: number } {
  if (!Array.isArray(crudos)) return { hallazgos: [], descartados: 0 };
  const vistos = new Set<string>();
  const hallazgos: Hallazgo[] = [];
  let descartados = 0;
  for (const crudo of crudos) {
    const h = validarUno(crudo, contexto);
    if (!h) { descartados++; continue; }
    if (vistos.has(h.id)) continue;
    vistos.add(h.id);
    hallazgos.push(h);
  }
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
