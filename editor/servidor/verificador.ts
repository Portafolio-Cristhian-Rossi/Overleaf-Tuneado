import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { armarPromptDeVerificacion } from '../compartido/promptVerificacion';
import type { Config } from '../compartido/tipos';
import { validarHallazgos, type Alcance, type EstadoVerificacion, type MotivoDeFalla } from '../compartido/verificacion';
import { interpretarSalida, type LanzarAgente, type ProcesoAgente } from './agente';
import { RutaInvalida, resolverEnInforme } from './archivos';
import { fotografiarInforme, fotografiarRepositorio, problemaDelRepositorio } from './fotos';
import { archivosDe } from './proyecto';
import type { Verificaciones } from './verificaciones';

// Una corrida del verificador de punta a punta: fotos, prompt, agente, límite, validación,
// guardado y limpieza. Hay una sola a la vez.

export interface Verificador {
  estado(): Promise<EstadoVerificacion>;
  iniciar(alcance: Alcance, ruta: string | null): Promise<{ tipo: 'ok' } | { tipo: 'ocupado' } | { tipo: 'invalido'; mensaje: string }>;
  cancelar(): void;
  terminada(): Promise<void>;   // se resuelve cuando no hay corrida en curso (para pruebas y el cierre)
}

export type ConfigVerificador = Pick<Config, 'informe'> & {
  repositorio: string | null;
  ramaRepositorio: string;
  limiteVerificacion: { capitulo: number; todo: number };   // minutos
};

export const MENSAJES: Record<Exclude<MotivoDeFalla, 'rama' | 'otro'>, string> = {
  'sin-cli': 'No se encontró Claude Code. Instalalo con `npm install -g @anthropic-ai/claude-code` y volvé a probar.',
  'sin-sesion': 'Claude Code no tiene una sesión iniciada. Abrí una terminal, corré `claude` una vez para entrar y volvé a probar.',
  limite: 'La verificación se cortó a los {n} minutos. Si necesita más tiempo, subí limiteVerificacion en config.json.',
  ilegible: 'La respuesta del agente no se pudo leer. La corrida quedó guardada como fallida en verificaciones/.',
};

const PREFIJO = 'editor-verificacion-';

type ErrorDeCorrida = { motivo: MotivoDeFalla; mensaje: string };

interface EnCurso {
  alcance: Alcance;
  desde: number;
  cancelada: boolean;
  proceso: ProcesoAgente | null;
  fin: Promise<void>;
}

const falla = (detalle: string): ErrorDeCorrida => ({ motivo: 'otro', mensaje: `La verificación falló: ${detalle}` });

// Líneas de un archivo de la foto del repo; null si no existe, no es un archivo o sale de la carpeta.
function lineasEn(raiz: string, archivo: string): number | null {
  try {
    const absoluta = fs.realpathSync(path.resolve(raiz, archivo));
    const relativa = path.relative(fs.realpathSync(raiz), absoluta);
    if (relativa === '' || relativa.split(path.sep)[0] === '..' || path.isAbsolute(relativa)) return null;
    if (!fs.statSync(absoluta).isFile()) return null;
    const texto = fs.readFileSync(absoluta, 'utf8');
    if (texto === '') return 0;
    return texto.split('\n').length - (texto.endsWith('\n') ? 1 : 0);
  } catch {
    return null;
  }
}

// Otro editor abierto (el de prueba, por ejemplo) comparte la carpeta temporal y puede tener una
// corrida en marcha: solo se borran las carpetas más viejas que la corrida más larga posible.
async function borrarCarpetasViejas(dir: string, anterioresA: number): Promise<void> {
  const nombres = await fs.promises.readdir(dir).catch(() => [] as string[]);
  for (const nombre of nombres.filter((n) => n.startsWith(PREFIJO))) {
    const carpeta = path.join(dir, nombre);
    const datos = await fs.promises.stat(carpeta).catch(() => null);
    if (datos === null || datos.mtimeMs >= anterioresA) continue;
    await fs.promises.rm(carpeta, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
}

// setTimeout corre enseguida si la espera no entra en 32 bits.
const ESPERA_MAXIMA = 2_147_483_647;

export function crearVerificador(o: {
  config: ConfigVerificador; verificaciones: Verificaciones; lanzar: LanzarAgente;
  rutasDelInforme: () => Promise<string[]>;     // para 'todo': capítulos del proyecto, sin el .bib
  dirTemporales?: string;                       // por defecto os.tmpdir()
  ahora?: () => number;
}): Verificador {
  const { config, verificaciones, lanzar } = o;
  const dirTemporales = o.dirTemporales ?? os.tmpdir();
  const ahora = o.ahora ?? Date.now;
  let enCurso: EnCurso | null = null;
  let error: ErrorDeCorrida | null = null;

  async function rutasPara(alcance: Alcance, ruta: string | null): Promise<string[] | string> {
    if (alcance === 'todo') {
      const rutas = await o.rutasDelInforme();
      return rutas.length > 0 ? rutas : 'El informe no tiene capítulos para verificar.';
    }
    if (ruta === null || ruta === '') return 'Abrí un capítulo para verificarlo.';
    try {
      const absoluta = resolverEnInforme(config.informe, ruta);
      if (!fs.existsSync(absoluta) || !fs.statSync(absoluta).isFile()) return `No existe ${ruta} en el informe.`;
    } catch (e) {
      if (e instanceof RutaInvalida) return `No existe ${ruta} en el informe.`;
      throw e;
    }
    return archivosDe(config.informe, ruta);
  }

  async function correr(c: EnCurso, rutas: string[]): Promise<void> {
    const fallar = (e: ErrorDeCorrida) => { if (!c.cancelada) error = e; };
    let cwd: string | null = null;
    try {
      await borrarCarpetasViejas(dirTemporales, ahora() - (config.limiteVerificacion.todo + 10) * 60_000);
      cwd = await fs.promises.mkdtemp(path.join(dirTemporales, PREFIJO));
      const dirRepo = path.join(cwd, 'repositorio');
      const foto = await fotografiarRepositorio(config.repositorio!, config.ramaRepositorio, dirRepo);
      if (foto.tipo === 'error') return fallar(foto.motivo === 'rama' ? { motivo: 'rama', mensaje: foto.mensaje } : falla(foto.mensaje));
      if (c.cancelada) return;

      const textos = await fotografiarInforme(config.informe, rutas, path.join(cwd, 'informe'));
      const ignorados = (await verificaciones.ignorados()).filter((i) => rutas.includes(i.archivoInforme));
      const prompt = armarPromptDeVerificacion({
        archivos: rutas.map((r) => ({ ruta: r, texto: textos.get(r) ?? '' })),
        rama: config.ramaRepositorio, commit: foto.commit, ignorados,
      });
      if (c.cancelada) return;

      const proceso = lanzar({ cwd, prompt });
      c.proceso = proceso;
      const minutos = config.limiteVerificacion[c.alcance];
      let vencida = false;
      const reloj = setTimeout(() => { vencida = true; proceso.detener(); }, Math.min(minutos * 60_000, ESPERA_MAXIMA));
      const salida = await proceso.terminado.finally(() => clearTimeout(reloj));
      if (c.cancelada) return;
      if (vencida) return fallar({ motivo: 'limite', mensaje: MENSAJES.limite.replace('{n}', String(minutos)) });

      const r = interpretarSalida(salida);
      if (r.tipo === 'sin-cli' || r.tipo === 'sin-sesion') return fallar({ motivo: r.tipo, mensaje: MENSAJES[r.tipo] });
      if (r.tipo === 'otro') return fallar(falla(r.mensaje));

      const validados = r.tipo === 'ok'
        ? validarHallazgos(r.crudos, { informe: textos, lineasDelRepo: (archivo) => lineasEn(dirRepo, archivo) })
        : { hallazgos: [], descartados: 0 };
      await verificaciones.guardar({
        fecha: new Date(c.desde).toISOString(),
        alcance: c.alcance,
        archivos: rutas,
        rama: config.ramaRepositorio,
        commit: foto.commit,
        duracionMs: ahora() - c.desde,
        estado: r.tipo === 'ok' ? 'ok' : 'fallida',
        crudo: r.tipo === 'ilegible' ? r.crudo : null,
        ...validados,
      });
      if (r.tipo === 'ilegible') fallar({ motivo: 'ilegible', mensaje: MENSAJES.ilegible });
    } catch (e) {
      fallar(falla(e instanceof Error ? e.message : String(e)));
    } finally {
      if (cwd !== null) await fs.promises.rm(cwd, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
      enCurso = null;
    }
  }

  return {
    async estado() {
      if (enCurso) return { estado: 'en-curso', alcance: enCurso.alcance, desde: enCurso.desde };
      const problema = await problemaDelRepositorio(config.repositorio, config.ramaRepositorio);
      if (problema !== null) return { estado: 'deshabilitada', motivo: problema };
      return { estado: 'libre', error };
    },

    async iniciar(alcance, ruta) {
      if (enCurso) return { tipo: 'ocupado' };
      // Un texto es el motivo por el que no se puede verificar.
      let rutas: string[] | string;
      try {
        const problema = await problemaDelRepositorio(config.repositorio, config.ramaRepositorio);
        rutas = problema ?? await rutasPara(alcance, ruta);
      } catch (e) {
        rutas = falla(e instanceof Error ? e.message : String(e)).mensaje;
      }
      if (typeof rutas === 'string') return { tipo: 'invalido', mensaje: rutas };
      // Se vuelve a mirar: mientras se esperaba pudo haber arrancado otra.
      if (enCurso) return { tipo: 'ocupado' };

      error = null;
      const c: EnCurso = { alcance, desde: ahora(), cancelada: false, proceso: null, fin: Promise.resolve() };
      enCurso = c;
      c.fin = correr(c, rutas);
      return { tipo: 'ok' };
    },

    cancelar() {
      if (!enCurso) return;
      enCurso.cancelada = true;
      enCurso.proceso?.detener();
    },

    terminada() {
      return enCurso?.fin ?? Promise.resolve();
    },
  };
}
