import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface RepoDePrueba {
  repo: string;
  // Hash completo del commit de main.
  commitDeMain: string;
  // Contenido de backend/app.py en main (en el árbol de trabajo queda modificado).
  contenidoEnMain: string;
}

// Repo con la rama main (backend/app.py y .gitignore con .env), un .env sin versionar, la rama
// otra con un commit más y checkout de otra, y backend/app.py modificado sin commitear.
// La identidad va en la configuración local del repo: nunca se toca la global.
export function crearRepoDePrueba(dir: string): RepoDePrueba {
  const repo = path.join(dir, 'repositorio');
  fs.mkdirSync(path.join(repo, 'backend'), { recursive: true });
  const git = (...args: string[]): string => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Prueba');
  git('config', 'user.email', 'prueba@example.com');
  git('config', 'core.autocrlf', 'false');
  git('config', 'commit.gpgsign', 'false');

  const contenidoEnMain = 'def main():\n    return "main"\n';
  fs.writeFileSync(path.join(repo, 'backend', 'app.py'), contenidoEnMain);
  fs.writeFileSync(path.join(repo, '.gitignore'), '.env\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'main');
  const commitDeMain = git('rev-parse', 'HEAD');

  fs.writeFileSync(path.join(repo, '.env'), 'SECRETO=1\n');
  git('checkout', '-q', '-b', 'otra');
  fs.writeFileSync(path.join(repo, 'backend', 'otra.py'), 'x = 1\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'otra');
  fs.writeFileSync(path.join(repo, 'backend', 'app.py'), 'def main():\n    return "sin commitear"\n');

  return { repo, commitDeMain, contenidoEnMain };
}
