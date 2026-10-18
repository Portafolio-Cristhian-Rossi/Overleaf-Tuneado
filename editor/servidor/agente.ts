import { spawn, spawnSync } from 'node:child_process';

// Único lugar que lanza al agente de Claude Code (`claude -p`) en modo de solo lectura.

export interface SalidaDelAgente {
  codigo: number | null;
  stdout: string;
  stderr: string;
  noEncontrado: boolean;
}
export interface ProcesoAgente {
  // Siempre se resuelve, también después de detener().
  terminado: Promise<SalidaDelAgente>;
  detener(): void;
}
export type LanzarAgente = (o: { cwd: string; prompt: string }) => ProcesoAgente;

// --tools deja disponibles solo esas herramientas (--allowedTools solo evita preguntar por ellas);
// --disallowedTools las niega aunque la configuración del usuario las habilite; --permission-mode
// default ignora un modo más permisivo de esa configuración, y --strict-mcp-config sin --mcp-config
// no carga ningún servidor MCP.
export const ARGUMENTOS_DEL_AGENTE = [
  '-p', '--output-format', 'json',
  '--tools', 'Read,Grep,Glob',
  '--disallowedTools', 'Bash,PowerShell,Edit,Write,NotebookEdit,WebFetch,WebSearch',
  '--permission-mode', 'default',
  '--strict-mcp-config',
];

export function crearLanzadorAgente(comando: string[] = ['claude']): LanzarAgente {
  return ({ cwd, prompt }) => {
    const completo = [...comando, ...ARGUMENTOS_DEL_AGENTE];
    // `claude` instalado con npm es un .cmd: en Windows solo cmd sabe lanzarlo.
    const [exe, ...args] = process.platform === 'win32' ? ['cmd', '/c', ...completo] : completo;
    const proceso = spawn(exe, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

    let stdout = '';
    let stderr = '';
    let noEncontrado = false;
    proceso.stdout.setEncoding('utf8');
    proceso.stderr.setEncoding('utf8');
    proceso.stdout.on('data', (t: string) => { stdout += t; });
    proceso.stderr.on('data', (t: string) => { stderr += t; });
    // Si el proceso murió antes de leer la prompt, escribirla da EPIPE: no es un error del editor.
    proceso.stdin.on('error', () => {});

    const terminado = new Promise<SalidaDelAgente>((resolver) => {
      let listo = false;
      const fin = (codigo: number | null) => {
        if (listo) return;
        listo = true;
        resolver({ codigo, stdout, stderr, noEncontrado });
      };
      proceso.on('error', (e: NodeJS.ErrnoException) => {
        noEncontrado = e.code === 'ENOENT';
        fin(null);
      });
      // 'close' y no 'exit': garantiza que ya se leyó toda la salida.
      proceso.on('close', (codigo) => fin(codigo));
    });

    proceso.stdin.end(prompt);

    return {
      terminado,
      detener() {
        if (proceso.exitCode !== null || proceso.signalCode !== null) return;
        // En Windows cmd arranca al agente como hijo: hay que cortar todo el árbol.
        if (process.platform === 'win32' && proceso.pid !== undefined) {
          spawnSync('taskkill', ['/PID', String(proceso.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } else {
          proceso.kill();
        }
      },
    };
  };
}

export type SalidaInterpretada =
  | { tipo: 'ok'; crudos: unknown }
  | { tipo: 'sin-cli' }
  | { tipo: 'sin-sesion'; mensaje: string }
  | { tipo: 'ilegible'; crudo: string }
  | { tipo: 'otro'; mensaje: string };

const SIN_SESION = /login|log in|api key|not authenticated/i;
const CMD_NO_ENCUENTRA = /no se reconoce|is not recognized/i;

function envolturaDe(stdout: string): { is_error?: unknown; result?: unknown; subtype?: unknown } | null {
  try {
    const v: unknown = JSON.parse(stdout);
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function interpretarSalida(s: SalidaDelAgente): SalidaInterpretada {
  if (s.noEncontrado || s.codigo === 9009 || CMD_NO_ENCUENTRA.test(s.stderr)) return { tipo: 'sin-cli' };

  const envoltura = envolturaDe(s.stdout);
  if (!envoltura) {
    if (s.codigo === 0) return { tipo: 'ilegible', crudo: s.stdout };
    const mensaje = s.stderr.trim() || s.stdout.trim() || `El agente terminó con código ${s.codigo}.`;
    return { tipo: 'otro', mensaje };
  }

  const texto = typeof envoltura.result === 'string' ? envoltura.result : '';
  if (envoltura.is_error === true) {
    if (SIN_SESION.test(texto)) return { tipo: 'sin-sesion', mensaje: texto };
    if (texto.trim() !== '') return { tipo: 'otro', mensaje: texto };
    const subtype = typeof envoltura.subtype === 'string' && envoltura.subtype !== '' ? ` (${envoltura.subtype})` : '';
    return { tipo: 'otro', mensaje: `El agente informó un error${subtype}.` };
  }

  // La prosa de alrededor puede tener corchetes (por ejemplo \cite[p. 3]): se prueba desde cada [.
  const sinCercos = texto.replace(/```[a-zA-Z]*/g, '');
  const hasta = sinCercos.lastIndexOf(']');
  for (let desde = sinCercos.indexOf('['); desde !== -1 && desde < hasta; desde = sinCercos.indexOf('[', desde + 1)) {
    try {
      return { tipo: 'ok', crudos: JSON.parse(sinCercos.slice(desde, hasta + 1)) };
    } catch {
      // No era el comienzo del arreglo.
    }
  }
  return { tipo: 'ilegible', crudo: s.stdout };
}
