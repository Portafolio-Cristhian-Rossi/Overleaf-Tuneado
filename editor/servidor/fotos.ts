import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { decodificar } from './archivos';

// Copia de las rutas pedidas del informe (con sus subcarpetas) y su texto normalizado a \n.
export async function fotografiarInforme(dirInforme: string, rutas: string[], destino: string): Promise<Map<string, string>> {
  const textos = new Map<string, string>();
  for (const ruta of rutas) {
    const bytes = await fs.promises.readFile(path.join(dirInforme, ruta));
    const copia = path.join(destino, ruta);
    await fs.promises.mkdir(path.dirname(copia), { recursive: true });
    await fs.promises.writeFile(copia, bytes);
    textos.set(ruta, decodificar(bytes).contenido);
  }
  return textos;
}

export type ResultadoFotoRepo = { tipo: 'ok'; commit: string } | { tipo: 'error'; motivo: 'rama' | 'otro'; mensaje: string };

interface Salida { codigo: number; stdout: string; stderr: string }

function correr(comando: string, args: string[]): Promise<Salida> {
  return new Promise((resolver) => {
    execFile(comando, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      const codigo = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
      resolver({ codigo, stdout: String(stdout), stderr: error && typeof error.code !== 'number' ? error.message : String(stderr) });
    });
  });
}

// En Windows el tar de Git Bash no lee zip: se usa bsdtar del sistema por su ruta.
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

// Hash del commit al que apunta la rama, o null si no existe.
async function commitDeRama(repo: string, rama: string): Promise<string | null> {
  const r = await correr('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${rama}^{commit}`]);
  return r.codigo === 0 ? r.stdout.trim() : null;
}

// Lo commiteado en la rama, sin .env ni cambios locales. `git archive` solo lee: no escribe en el repo.
export async function fotografiarRepositorio(repo: string, rama: string, destino: string): Promise<ResultadoFotoRepo> {
  const commit = await commitDeRama(repo, rama);
  if (commit === null) return { tipo: 'error', motivo: 'rama', mensaje: `No se encontró la rama ${rama} en ${repo}.` };
  const zip = `${destino}.zip`;
  try {
    await fs.promises.mkdir(destino, { recursive: true });
    const archivo = await correr('git', ['-C', repo, 'archive', '--format=zip', '-o', zip, commit]);
    if (archivo.codigo !== 0) return { tipo: 'error', motivo: 'otro', mensaje: archivo.stderr.trim() || 'git archive falló.' };
    const extraccion = await correr(TAR, ['-xf', zip, '-C', destino]);
    if (extraccion.codigo !== 0) return { tipo: 'error', motivo: 'otro', mensaje: extraccion.stderr.trim() || 'tar falló.' };
    return { tipo: 'ok', commit };
  } finally {
    await fs.promises.rm(zip, { force: true });
  }
}

// Qué impide verificar contra el repositorio, o null si está todo en orden.
export async function problemaDelRepositorio(repo: string | null, rama: string): Promise<string | null> {
  if (repo === null) return 'Falta "repositorio" en config.json: la ruta de la aplicación a comparar.';
  if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) return `No existe la carpeta ${repo}.`;
  if (!fs.existsSync(path.join(repo, '.git'))) return `${repo} no es un repositorio de Git.`;
  if ((await commitDeRama(repo, rama)) === null) return `No se encontró la rama ${rama} en ${repo}.`;
  return null;
}
