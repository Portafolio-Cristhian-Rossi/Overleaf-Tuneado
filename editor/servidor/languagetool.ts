import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Segmento } from '../compartido/prosa';
import type { Aviso, EstadoCorrector } from '../compartido/tipos';

// LanguageTool corre como un servidor HTTP local, lanzado y terminado por el editor.
// Si no está o no arranca, el corrector queda "no disponible" y el resto del editor sigue igual.

export interface ProcesoLanzado {
  alSalir(f: (motivo: 'no-encontrado' | 'termino') => void): void;
  detener(): void;
}
export type Lanzar = (comando: string, args: string[], opciones: { cwd: string }) => ProcesoLanzado;

export interface Corrector {
  iniciar(): Promise<void>;
  estado(): EstadoCorrector;
  // Avisos de un párrafo, con posiciones relativas a su texto original. Nunca falla: ante
  // cualquier problema devuelve una lista vacía.
  revisar(segmentos: Segmento[]): Promise<Aviso[]>;
  olvidarCache(): void;
  detener(): void;
}

export interface OpcionesCorrector {
  dir: string;                              // carpeta que contiene LanguageTool-x.y/
  puerto: number;
  diccionario: () => Promise<string[]>;
  lanzar?: Lanzar;
  intervaloMs?: number;
  esperaDeArranqueMs?: number;
  tiempoLimiteMs?: number;
}

const REGLA_NO_EXISTE = 'MORFOLOGIK_RULE_ES';
// WHITESPACE_RULE marca los espacios dobles, que en LaTeX no significan nada.
const REGLAS_DESACTIVADAS = 'WHITESPACE_RULE';
const MAXIMO_DE_SUGERENCIAS = 5;
const MAXIMO_EN_CACHE = 3000;
const INTENTOS_DE_ARRANQUE = 3;
const HAY_LETRA = /\p{L}/u;

const lanzarProceso: Lanzar = (comando, args, opciones) => {
  const proceso = spawn(comando, args, { cwd: opciones.cwd, stdio: 'ignore', windowsHide: true });
  let avisar: ((motivo: 'no-encontrado' | 'termino') => void) | null = null;
  let salida: 'no-encontrado' | 'termino' | null = null;
  const salir = (motivo: 'no-encontrado' | 'termino') => { if (salida === null) { salida = motivo; avisar?.(motivo); } };
  proceso.on('error', (e: NodeJS.ErrnoException) => salir(e.code === 'ENOENT' ? 'no-encontrado' : 'termino'));
  proceso.on('exit', () => salir('termino'));
  return {
    alSalir(f) { avisar = f; if (salida !== null) f(salida); },
    detener() {
      // En Windows `java` suele ser un lanzador que arranca la máquina virtual como proceso
      // hijo: matar solo al lanzador la dejaría viva, ocupando memoria y el puerto.
      if (process.platform === 'win32' && proceso.pid !== undefined) {
        spawnSync('taskkill', ['/PID', String(proceso.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } else {
        proceso.kill();
      }
    },
  };
};

function tipoDe(issueType: unknown): Aviso['tipo'] {
  if (issueType === 'misspelling') return 'ortografia';
  if (issueType === 'style' || issueType === 'typographical' || issueType === 'register') return 'estilo';
  return 'gramatica';
}

export function crearCorrector(o: OpcionesCorrector): Corrector {
  const base = `http://127.0.0.1:${o.puerto}/v2`;
  const lanzar = o.lanzar ?? lanzarProceso;
  const intervalo = o.intervaloMs ?? 500;
  const esperaDeArranque = o.esperaDeArranqueMs ?? 60000;
  const tiempoLimite = o.tiempoLimiteMs ?? 10000;

  let estado: EstadoCorrector = { estado: 'apagado' };
  let proceso: ProcesoLanzado | null = null;
  let detenido = false;
  const cache = new Map<string, Aviso[]>();

  const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function responde(): Promise<boolean> {
    try {
      const r = await fetch(`${base}/languages`, { signal: AbortSignal.timeout(2000) });
      return r.ok && Array.isArray(await r.json());
    } catch {
      return false;
    }
  }

  function carpetaInstalada(): string | null {
    if (!fs.existsSync(o.dir)) return null;
    const nombre = fs.readdirSync(o.dir).sort().reverse()
      .find((n) => n.startsWith('LanguageTool-') && fs.existsSync(path.join(o.dir, n, 'languagetool-server.jar')));
    return nombre ? path.join(o.dir, nombre) : null;
  }

  // Un intento de arranque: 'listo', o el motivo por el que no se pudo.
  async function intentar(carpeta: string): Promise<'listo' | 'no-encontrado' | 'termino' | 'sin-respuesta'> {
    // Java abre un socket en su carpeta temporal; con algunas carpetas TEMP de Windows falla
    // ("Unable to establish loopback connection"), así que se le da una propia.
    const temporal = path.join(o.dir, 'tmp');
    fs.mkdirSync(temporal, { recursive: true });
    let salida: 'no-encontrado' | 'termino' | null = null;
    proceso = lanzar('java', [
      '-Xmx1g', `-Djdk.net.unixdomain.tmpdir=${temporal}`, '-cp', 'languagetool-server.jar',
      'org.languagetool.server.HTTPServer', '--port', String(o.puerto),
    ], { cwd: carpeta });
    proceso.alSalir((motivo) => { salida = motivo; });

    const limite = Date.now() + esperaDeArranque;
    while (Date.now() < limite && !detenido) {
      if (salida !== null) return salida;
      if (await responde()) return 'listo';
      await dormir(intervalo);
    }
    proceso.detener();
    return 'sin-respuesta';
  }

  async function iniciar(): Promise<void> {
    detenido = false;
    estado = { estado: 'iniciando' };
    // Puede haber quedado uno andando de una sesión anterior que se cerró de golpe.
    if (await responde()) { estado = { estado: 'listo' }; return; }

    const carpeta = carpetaInstalada();
    if (!carpeta) {
      estado = { estado: 'no-disponible', motivo: 'LanguageTool no está instalado. Ejecutá npm run instalar-corrector dentro de la carpeta editor.' };
      return;
    }
    for (let intento = 0; intento < INTENTOS_DE_ARRANQUE && !detenido; intento++) {
      const resultado = await intentar(carpeta);
      if (resultado === 'listo') {
        estado = { estado: 'listo' };
        // La primera consulta tarda varios segundos: se hace ahora y no cuando el usuario escribe.
        void consultar([{ tipo: 'texto', fuente: 'Una oración para empezar.' }]).catch(() => undefined);
        return;
      }
      if (resultado === 'no-encontrado') {
        estado = { estado: 'no-disponible', motivo: 'No se encontró Java, que hace falta para el corrector. Los pasos están en INSTALACION.md.' };
        return;
      }
      if (resultado === 'sin-respuesta') break;
    }
    if (!detenido) estado = { estado: 'no-disponible', motivo: 'El corrector no pudo iniciar. Cerrá el editor y volvé a abrirlo; si sigue igual, mirá INSTALACION.md.' };
  }

  async function consultar(segmentos: Segmento[]): Promise<any[]> {
    const anotacion = segmentos.map((s) => {
      // Un salto de línea simple no separa oraciones en LaTeX; reemplazarlo conserva las posiciones.
      if (s.tipo === 'texto') return { text: s.fuente.replace(/\n/g, ' ') };
      return s.como === undefined ? { markup: s.fuente } : { markup: s.fuente, interpretAs: s.como };
    });
    const r = await fetch(`${base}/check`, {
      method: 'POST',
      body: new URLSearchParams({ language: 'es', disabledRules: REGLAS_DESACTIVADAS, data: JSON.stringify({ annotation: anotacion }) }),
      signal: AbortSignal.timeout(tiempoLimite),
    });
    if (!r.ok) throw new Error(`LanguageTool respondió ${r.status}`);
    const cuerpo = await r.json();
    return Array.isArray(cuerpo?.matches) ? cuerpo.matches : [];
  }

  async function revisar(segmentos: Segmento[]): Promise<Aviso[]> {
    if (estado.estado !== 'listo') return [];
    if (!segmentos.some((s) => s.tipo === 'texto' && HAY_LETRA.test(s.fuente))) return [];

    const clave = JSON.stringify(segmentos);
    const guardado = cache.get(clave);
    if (guardado) return guardado;

    try {
      const [coincidencias, palabras] = await Promise.all([consultar(segmentos), o.diccionario()]);
      const propias = new Set(palabras.map((p) => p.toLowerCase()));
      const original = segmentos.map((s) => s.fuente).join('');
      const avisos: Aviso[] = coincidencias
        .filter((m) => Number.isInteger(m?.offset) && Number.isInteger(m?.length) && m.length > 0)
        .map((m) => ({
          desde: m.offset as number,
          hasta: (m.offset + m.length) as number,
          tipo: tipoDe(m.rule?.issueType),
          regla: String(m.rule?.id ?? ''),
          mensaje: String(m.message ?? ''),
          sugerencias: (Array.isArray(m.replacements) ? m.replacements : [])
            .map((x: any) => String(x?.value ?? '')).filter(Boolean).slice(0, MAXIMO_DE_SUGERENCIAS),
        }))
        .filter((a) => !(a.regla === REGLA_NO_EXISTE && propias.has(original.slice(a.desde, a.hasta).toLowerCase())));

      if (cache.size >= MAXIMO_EN_CACHE) cache.delete(cache.keys().next().value!);
      cache.set(clave, avisos);
      return avisos;
    } catch {
      return [];
    }
  }

  return {
    iniciar,
    estado: () => estado,
    revisar,
    olvidarCache: () => cache.clear(),
    detener() {
      detenido = true;
      proceso?.detener();
      proceso = null;
      estado = { estado: 'apagado' };
    },
  };
}
