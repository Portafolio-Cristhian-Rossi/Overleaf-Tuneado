import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { armarPromptDeVerificacion } from '../compartido/promptVerificacion';
import { armarPromptDeVerificacionInforme } from '../compartido/promptVerificacionInforme';
import type { Config } from '../compartido/tipos';
import {
  TIPOS_DEL_AGENTE, validarHallazgos,
  type Alcance, type Contra, type ErrorDeVerificacion, type EstadoVerificacion, type MotivoDeFalla, type TipoDeHallazgo,
} from '../compartido/verificacion';
import { costoDe, interpretarSalida, type LanzarAgente, type ProcesoAgente } from './agente';
import { RutaInvalida, resolverEnInforme } from './archivos';
import { fotografiarInforme, fotografiarRepositorio, problemaDelRepositorio } from './fotos';
import { archivosDe } from './proyecto';
import type { Verificaciones } from './verificaciones';

// Una corrida de punta a punta, contra el código o contra el propio informe: fotos, prompt,
// agente, límite, validación, guardado y limpieza. Hay una sola a la vez, de cualquiera de los dos tipos.

export interface Verificador {
  estado(): Promise<EstadoVerificacion>;
  iniciar(contra: Contra, alcance: Alcance, ruta: string | null):
    Promise<{ tipo: 'ok' } | { tipo: 'ocupado' } | { tipo: 'invalido'; mensaje: string }>;
  cancelar(): void;
  cerrar(): void;               // cancela y borra la carpeta de la corrida sin esperar: para el exit del proceso
  terminada(): Promise<void>;   // se resuelve cuando no hay corrida en curso (para pruebas y el cierre)
}

export type ConfigVerificador = Pick<Config, 'informe'> & {
  repositorio: string | null;
  ramaRepositorio: string;
  limiteVerificacion: { capitulo: number; todo: number };   // minutos
};

export const MENSAJES: Record<Exclude<MotivoDeFalla, 'rama' | 'otro'>, string> = {
  'sin-cli': 'No se encontró Claude Code. Instalalo con `npm install -g @anthropic-ai/claude-code`, o poné en config.json, en "agente", la ruta de claude.exe. Después volvé a probar.',
  'sin-sesion': 'Claude Code no tiene una sesión iniciada. Abrí una terminal, corré `claude` una vez para entrar y volvé a probar.',
  limite: 'La verificación se cortó a los {n} minutos. Si necesita más tiempo, subí limiteVerificacion en config.json.',
  ilegible: 'La respuesta del agente no se pudo leer. La corrida quedó guardada como fallida en verificaciones/.',
};

const PREFIJO = 'editor-verificacion-';

type ErrorDeCorrida = Omit<ErrorDeVerificacion, 'contra'>;

interface EnCurso {
  contra: Contra;
  alcance: Alcance;
  desde: number;
  cancelada: boolean;
  proceso: ProcesoAgente | null;
  carpeta: string | null;
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

// Lo que cambia entre las dos verificaciones; lanzar, validar y guardar es igual para las dos.
interface Preparada {
  prompt: string;
  textos: Map<string, string>;
  revisados: string[] | undefined;              // solo contra el informe: dónde puede estar la cita principal
  lineasDelRepo(archivo: string): number | null;
  tipos: readonly TipoDeHallazgo[];
  rama: string | null;
  commit: string | null;
}

export function crearVerificador(o: {
  config: ConfigVerificador; verificaciones: Verificaciones; lanzar: LanzarAgente;
  rutasDelInforme: () => Promise<string[]>;     // capítulos del proyecto en el orden de main.tex, sin el .bib
  rutaDelGlosario?: () => Promise<string | null>;
  rutaDelMarcoTeorico?: () => Promise<string | null>;
  dirTemporales?: string;                       // por defecto os.tmpdir()
  ahora?: () => number;
}): Verificador {
  const { config, verificaciones, lanzar } = o;
  const dirTemporales = o.dirTemporales ?? os.tmpdir();
  const ahora = o.ahora ?? Date.now;
  let enCurso: EnCurso | null = null;
  let error: ErrorDeVerificacion | null = null;

  // Contra el informe, el agente ve todo el informe: cada capítulo y lo que incluye, sin repetir.
  async function todoElInforme(): Promise<string[]> {
    return [...new Set((await o.rutasDelInforme()).flatMap((r) => archivosDe(config.informe, r)))];
  }

  async function rutasPara(contra: Contra, alcance: Alcance, ruta: string | null): Promise<string[] | string> {
    if (alcance === 'todo' && contra === 'informe') {
      const rutas = await todoElInforme();
      return rutas.length > 0 ? rutas : 'El informe no tiene capítulos para verificar.';
    }
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

  // Ignorados que el agente de ese tipo podría volver a reportar: los de sus tipos y de esos archivos.
  async function ignoradosPara(contra: Contra, archivos: string[]) {
    return (await verificaciones.ignorados())
      .filter((i) => TIPOS_DEL_AGENTE[contra].includes(i.tipo) && archivos.includes(i.archivoInforme));
  }

  async function prepararCodigo(cwd: string, rutas: string[]): Promise<Preparada | ErrorDeCorrida> {
    const dirRepo = path.join(cwd, 'repositorio');
    const foto = await fotografiarRepositorio(config.repositorio!, config.ramaRepositorio, dirRepo);
    if (foto.tipo === 'error') return foto.motivo === 'rama' ? { motivo: 'rama', mensaje: foto.mensaje } : falla(foto.mensaje);

    // El glosario entra a la foto aunque no se lo revise: el agente lo puede citar.
    const glosario = (await o.rutaDelGlosario?.()) ?? null;
    const enFoto = glosario && !rutas.includes(glosario) ? [...rutas, glosario] : rutas;
    const textos = await fotografiarInforme(config.informe, enFoto, path.join(cwd, 'informe'));
    const prompt = armarPromptDeVerificacion({
      archivos: rutas.map((r) => ({ ruta: r, texto: textos.get(r) ?? '' })),
      rama: config.ramaRepositorio, commit: foto.commit, ignorados: await ignoradosPara('codigo', enFoto),
      glosario: glosario ? { ruta: glosario, texto: textos.get(glosario) ?? '' } : null,
    });
    return {
      prompt, textos, revisados: undefined, lineasDelRepo: (archivo) => lineasEn(dirRepo, archivo),
      tipos: TIPOS_DEL_AGENTE.codigo, rama: config.ramaRepositorio, commit: foto.commit,
    };
  }

  // Sin repositorio: la foto es todo el informe, y la cita principal tiene que estar en los revisados.
  async function prepararInforme(cwd: string, rutas: string[]): Promise<Preparada> {
    const todos = await todoElInforme();
    const enFoto = [...todos, ...rutas.filter((r) => !todos.includes(r))];
    const textos = await fotografiarInforme(config.informe, enFoto, path.join(cwd, 'informe'));
    const prompt = armarPromptDeVerificacionInforme({
      capitulos: enFoto.map((r) => ({ ruta: r, texto: textos.get(r) ?? '' })),
      revisados: rutas,
      glosario: (await o.rutaDelGlosario?.()) ?? null,
      marcoTeorico: (await o.rutaDelMarcoTeorico?.()) ?? null,
      ignorados: await ignoradosPara('informe', rutas),
    });
    return { prompt, textos, revisados: rutas, lineasDelRepo: () => null, tipos: TIPOS_DEL_AGENTE.informe, rama: null, commit: null };
  }

  async function correr(c: EnCurso, rutas: string[]): Promise<void> {
    const fallar = (e: ErrorDeCorrida) => { if (!c.cancelada) error = { contra: c.contra, ...e }; };
    let cwd: string | null = null;
    try {
      await borrarCarpetasViejas(dirTemporales, ahora() - (config.limiteVerificacion.todo + 10) * 60_000);
      // Con la ruta corta de Windows (CRISTH~1), Claude Code pide permiso para leer y, sin nadie
      // que lo apruebe, el agente no lee nada: se le pasa la ruta larga.
      cwd = fs.realpathSync.native(await fs.promises.mkdtemp(path.join(dirTemporales, PREFIJO)));
      c.carpeta = cwd;
      const preparada = c.contra === 'codigo' ? await prepararCodigo(cwd, rutas) : await prepararInforme(cwd, rutas);
      if (!('prompt' in preparada)) return fallar(preparada);
      const { prompt, textos } = preparada;
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
        ? validarHallazgos(r.crudos, { informe: textos, lineasDelRepo: preparada.lineasDelRepo, revisados: preparada.revisados }, preparada.tipos)
        : { hallazgos: [], descartados: 0 };
      await verificaciones.guardar({
        fecha: new Date(c.desde).toISOString(),
        contra: c.contra,
        alcance: c.alcance,
        archivos: rutas,
        rama: preparada.rama,
        commit: preparada.commit,
        duracionMs: ahora() - c.desde,
        costoUsd: costoDe(salida.stdout),
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

  function cancelar(): void {
    if (!enCurso) return;
    enCurso.cancelada = true;
    enCurso.proceso?.detener();
  }

  return {
    async estado() {
      if (enCurso) return { estado: 'en-curso', contra: enCurso.contra, alcance: enCurso.alcance, desde: enCurso.desde };
      // Contra el informe no hace falta nada más que el informe.
      const codigo = await problemaDelRepositorio(config.repositorio, config.ramaRepositorio);
      return { estado: 'libre', motivos: { codigo, informe: null }, error };
    },

    async iniciar(contra, alcance, ruta) {
      if (enCurso) return { tipo: 'ocupado' };
      // Un texto es el motivo por el que no se puede verificar.
      let rutas: string[] | string;
      try {
        const problema = contra === 'codigo' ? await problemaDelRepositorio(config.repositorio, config.ramaRepositorio) : null;
        rutas = problema ?? await rutasPara(contra, alcance, ruta);
      } catch (e) {
        rutas = falla(e instanceof Error ? e.message : String(e)).mensaje;
      }
      if (typeof rutas === 'string') return { tipo: 'invalido', mensaje: rutas };
      // Se vuelve a mirar: mientras se esperaba pudo haber arrancado otra.
      if (enCurso) return { tipo: 'ocupado' };

      error = null;
      const c: EnCurso = { contra, alcance, desde: ahora(), cancelada: false, proceso: null, carpeta: null, fin: Promise.resolve() };
      enCurso = c;
      c.fin = correr(c, rutas);
      return { tipo: 'ok' };
    },

    cancelar,

    // En el exit del proceso no llega a correr el finally asíncrono de la corrida.
    cerrar() {
      const carpeta = enCurso?.carpeta ?? null;
      cancelar();
      if (carpeta !== null) {
        try { fs.rmSync(carpeta, { recursive: true, force: true, maxRetries: 5 }); } catch { /* queda para la próxima corrida */ }
      }
    },

    terminada() {
      return enCurso?.fin ?? Promise.resolve();
    },
  };
}
