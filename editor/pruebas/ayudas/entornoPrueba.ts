import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DIR_EDITOR = path.resolve(import.meta.dirname, '../..');
const DIR_FIXTURE = path.join(DIR_EDITOR, 'pruebas/fixtures/informe');

export interface EntornoPrueba { raiz: string; remoto: string; informe: string; companero: string }

export function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
}

function identificar(dir: string, nombre: string): void {
  git(dir, 'config', 'user.name', nombre);
  git(dir, 'config', 'user.email', `${nombre.toLowerCase()}@prueba.invalid`);
  git(dir, 'config', 'core.autocrlf', 'true');   // como en la máquina de Cristhian
}

// Un "Overleaf" local: un remoto desnudo con el informe de ejemplo y dos clones.
export async function crearEntornoPrueba(raiz: string = path.join(DIR_EDITOR, '.entorno-prueba')): Promise<EntornoPrueba> {
  const e: EntornoPrueba = {
    raiz,
    remoto: path.join(raiz, 'remoto.git'),
    informe: path.join(raiz, 'informe'),
    companero: path.join(raiz, 'companero'),
  };
  fs.mkdirSync(raiz, { recursive: true });
  git(raiz, 'init', '--quiet', '--bare', '-b', 'main', 'remoto.git');

  const semilla = path.join(raiz, 'semilla');
  fs.cpSync(DIR_FIXTURE, semilla, { recursive: true });
  git(semilla, 'init', '--quiet', '-b', 'main');
  identificar(semilla, 'Semilla');
  git(semilla, 'add', '-A');
  git(semilla, 'commit', '--quiet', '-m', 'Update on Overleaf.');
  git(semilla, 'push', '--quiet', e.remoto, 'main');
  fs.rmSync(semilla, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

  git(raiz, 'clone', '--quiet', e.remoto, 'informe');
  identificar(e.informe, 'Editor');
  git(raiz, 'clone', '--quiet', e.remoto, 'companero');
  identificar(e.companero, 'Companero');
  return e;
}

// npm run entorno-prueba: recrea editor/.entorno-prueba y escribe config.prueba.json.
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const raiz = path.join(DIR_EDITOR, '.entorno-prueba');
  fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  const e = await crearEntornoPrueba(raiz);
  fs.writeFileSync(path.join(DIR_EDITOR, 'config.prueba.json'), JSON.stringify({
    informe: '.entorno-prueba/informe',
    build: '.entorno-prueba/build',
    principal: 'main.tex',
    puerto: 4317,
    compilarAlGuardar: false,
  }, null, 2) + '\n');
  console.log(`Entorno de prueba listo en ${e.raiz}`);
  console.log('Para usarlo: definí EDITOR_CONFIG=config.prueba.json antes de npm run servir');
}
