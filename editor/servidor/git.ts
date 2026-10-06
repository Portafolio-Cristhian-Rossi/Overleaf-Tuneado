import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ErrorRed, EstadoGit, ResultadoEnviar, ResultadoTerminar, ResultadoTraer } from '../compartido/tipos';

export interface Git {
  preparar(): Promise<void>;
  estado(): Promise<EstadoGit>;
  buscar(): Promise<{ tipo: 'ok' } | ErrorRed>;
  traer(): Promise<ResultadoTraer>;
  enviar(): Promise<ResultadoEnviar>;
  terminarCombinacion(): Promise<ResultadoTerminar>;
  cancelarCombinacion(): Promise<void>;
}

// Temporales de LaTeX: se ignoran solo en este clon, así nunca viajan a Overleaf.
const EXCLUSIONES = [
  '*.aux', '*.log', '*.out', '*.toc', '*.lof', '*.lot', '*.bbl', '*.blg',
  '*.fls', '*.fdb_latexmk', '*.synctex.gz', '/main.pdf',
];

const MARCA_DE_CONFLICTO = /^(<{7}|={7}|>{7})( |$)/m;

interface Salida { codigo: number; stdout: string; stderr: string }

function clasificar(stderr: string): ErrorRed {
  let motivo: ErrorRed['motivo'] = 'otro';
  if (/Authentication failed|\b403\b|could not read Username|terminal prompts disabled/i.test(stderr)) motivo = 'autenticacion';
  else if (/Could not resolve host|Failed to connect|Could not connect|timed out|unable to access/i.test(stderr)) motivo = 'sin-conexion';
  return { tipo: 'error', motivo, mensaje: stderr.trim() };
}

function marcaDeTiempo(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function crearGit(dirInforme: string): Git {
  // Sin diálogos de credenciales: si falta el token, la operación falla y se informa.
  const entorno = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' };

  const git = (...args: string[]): Promise<Salida> =>
    new Promise((resolver) => {
      execFile('git', args, { cwd: dirInforme, env: entorno, timeout: 60000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const codigo = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
          resolver({ codigo, stdout, stderr: stderr || (error && codigo !== 0 ? error.message : '') });
        });
    });

  const lineas = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
  const rama = async () => (await git('rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim();
  const enCombinacion = async () => (await git('rev-parse', '-q', '--verify', 'MERGE_HEAD')).codigo === 0;
  const enConflicto = async () => lineas((await git('diff', '--name-only', '--diff-filter=U')).stdout);
  // Por contenido y no con `git status`: Git da por modificado un archivo cuyo tamaño
  // cambió aunque, ya normalizados los fines de línea, sea idéntico al del índice.
  const hayCambios = async () =>
    (await git('diff', '--quiet', 'HEAD')).codigo !== 0 ||
    (await git('ls-files', '--others', '--exclude-standard')).stdout.trim() !== '';

  async function estado(): Promise<EstadoGit> {
    const cuenta = await git('rev-list', '--left-right', '--count', `HEAD...origin/${await rama()}`);
    const [sinEnviar, sinTraer] = cuenta.codigo === 0 ? cuenta.stdout.trim().split(/\s+/).map(Number) : [0, 0];
    return {
      cambiosLocales: await hayCambios(),
      commitsSinEnviar: sinEnviar,
      commitsSinTraer: sinTraer,
      combinacionEnCurso: await enCombinacion(),
      archivosEnConflicto: await enConflicto(),
    };
  }

  async function buscar(): Promise<{ tipo: 'ok' } | ErrorRed> {
    const r = await git('fetch', 'origin');
    return r.codigo === 0 ? { tipo: 'ok' } : clasificar(r.stderr);
  }

  async function traer(): Promise<ResultadoTraer> {
    if (await enCombinacion()) return { tipo: 'conflicto', archivos: await enConflicto() };

    await git('add', '-A');
    if ((await git('diff', '--cached', '--quiet')).codigo !== 0) {
      const commit = await git('commit', '-m', `Edición desde el editor local, ${marcaDeTiempo()}`);
      if (commit.codigo !== 0) return { tipo: 'error', motivo: 'otro', mensaje: (commit.stderr || commit.stdout).trim() };
    }

    const busqueda = await buscar();
    if (busqueda.tipo === 'error') return busqueda;

    const antes = (await git('rev-parse', 'HEAD')).stdout.trim();
    const combinacion = await git('merge', '--no-edit', `origin/${await rama()}`);
    if (combinacion.codigo !== 0) {
      const archivos = await enConflicto();
      if (archivos.length > 0) return { tipo: 'conflicto', archivos };
      return { tipo: 'error', motivo: 'otro', mensaje: (combinacion.stderr || combinacion.stdout).trim() };
    }
    const cambiados = await git('diff', '--name-only', antes, 'HEAD');
    return { tipo: 'ok', archivosCambiados: lineas(cambiados.stdout) };
  }

  async function enviar(): Promise<ResultadoEnviar> {
    for (let intento = 0; ; intento++) {
      const traido = await traer();
      if (traido.tipo !== 'ok') return traido;

      const actual = await rama();
      const pendientes = await git('rev-list', '--count', `origin/${actual}..HEAD`);
      if (pendientes.stdout.trim() === '0') return { tipo: 'ok', enviado: false };

      const envio = await git('push', 'origin', actual);
      if (envio.codigo === 0) return { tipo: 'ok', enviado: true };

      // Alguien publicó entre nuestro traer y nuestro push: se reintenta una vez.
      const noEsAvanceRapido = /non-fast-forward|fetch first|\[rejected\]/i.test(envio.stderr);
      if (noEsAvanceRapido && intento === 0) continue;

      const error = clasificar(envio.stderr);
      return error.motivo === 'otro' ? { tipo: 'rechazado', mensaje: error.mensaje } : error;
    }
  }

  async function terminarCombinacion(): Promise<ResultadoTerminar> {
    if (!(await enCombinacion())) return { tipo: 'ok' };
    const conMarcas: string[] = [];
    for (const archivo of await enConflicto()) {
      const texto = await fs.readFile(path.join(dirInforme, archivo), 'utf8').catch(() => '');
      if (MARCA_DE_CONFLICTO.test(texto.replace(/\r\n/g, '\n'))) conMarcas.push(archivo);
    }
    if (conMarcas.length > 0) return { tipo: 'quedan-marcas', archivos: conMarcas };
    await git('add', '-A');
    await git('commit', '--no-edit');
    return { tipo: 'ok' };
  }

  async function cancelarCombinacion(): Promise<void> {
    if (await enCombinacion()) await git('merge', '--abort');
  }

  async function preparar(): Promise<void> {
    const ubicacion = (await git('rev-parse', '--git-path', 'info/exclude')).stdout.trim();
    const archivo = path.resolve(dirInforme, ubicacion);
    const actual = await fs.readFile(archivo, 'utf8').catch(() => '');
    const presentes = new Set(actual.split(/\r?\n/));
    const faltantes = EXCLUSIONES.filter((p) => !presentes.has(p));
    if (faltantes.length === 0) return;
    await fs.mkdir(path.dirname(archivo), { recursive: true });
    const separador = actual === '' || actual.endsWith('\n') ? '' : '\n';
    await fs.writeFile(archivo, `${actual}${separador}${faltantes.join('\n')}\n`);
  }

  return { preparar, estado, buscar, traer, enviar, terminarCombinacion, cancelarCombinacion };
}
