import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearRepoDePrueba, type RepoDePrueba } from '../pruebas/ayudas/repoDePrueba';
import { dirTemporal } from '../pruebas/ayudas/temporales';
import { fotografiarInforme, fotografiarRepositorio, problemaDelRepositorio } from './fotos';

function listar(dir: string, excluidos: string[]): string[] {
  const salida: string[] = [];
  const recorrer = (actual: string): void => {
    for (const e of fs.readdirSync(actual, { withFileTypes: true })) {
      const abs = path.join(actual, e.name);
      const rel = path.relative(dir, abs).split(path.sep).join('/');
      if (excluidos.includes(rel)) continue;
      const stat = fs.statSync(abs);
      salida.push(`${rel} ${e.isDirectory() ? 'dir' : `${stat.size} ${stat.mtimeMs}`}`);
      if (e.isDirectory()) recorrer(abs);
    }
  };
  recorrer(dir);
  return salida.sort();
}

const estadoDe = (repo: string): string => execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' });

describe('fotografiarRepositorio', () => {
  let dir: string;
  let datos: RepoDePrueba;
  let destino: string;
  beforeEach(() => {
    dir = dirTemporal();
    datos = crearRepoDePrueba(dir);
    destino = path.join(dir, 'foto');
  });

  it('trae main tal como está commiteado, sin .env ni cambios locales', async () => {
    const r = await fotografiarRepositorio(datos.repo, 'main', destino);
    expect(r).toEqual({ tipo: 'ok', commit: datos.commitDeMain });
    expect(fs.readFileSync(path.join(destino, 'backend/app.py'), 'utf8')).toBe(datos.contenidoEnMain);
    expect(fs.existsSync(path.join(destino, '.env'))).toBe(false);
    expect(fs.existsSync(path.join(destino, 'backend/otra.py'))).toBe(false);
    expect(fs.existsSync(`${destino}.zip`)).toBe(false);
  });

  it('no escribe nada en el repositorio', async () => {
    const excluidos = ['.git/index', '.git/logs'];
    const antes = { estado: estadoDe(datos.repo), git: listar(path.join(datos.repo, '.git'), ['index', 'logs']), arbol: listar(datos.repo, excluidos.concat('.git')) };
    await fotografiarRepositorio(datos.repo, 'main', destino);
    expect(estadoDe(datos.repo)).toBe(antes.estado);
    expect(listar(path.join(datos.repo, '.git'), ['index', 'logs'])).toEqual(antes.git);
    expect(listar(datos.repo, excluidos.concat('.git'))).toEqual(antes.arbol);
    expect(fs.existsSync(path.join(datos.repo, '.git', 'worktrees'))).toBe(false);
  });

  it('rama inexistente', async () => {
    expect(await fotografiarRepositorio(datos.repo, 'nada', destino)).toMatchObject({ tipo: 'error', motivo: 'rama' });
  });

  it('otro error cuando la carpeta no es un repositorio', async () => {
    const vacia = path.join(dir, 'vacia');
    fs.mkdirSync(vacia);
    expect(await fotografiarRepositorio(vacia, 'main', destino)).toMatchObject({ tipo: 'error' });
  });
});

describe('fotografiarInforme', () => {
  it('copia las rutas pedidas, con subcarpetas, y devuelve los textos con \\n', async () => {
    const dir = dirTemporal();
    const informe = path.join(dir, 'informe');
    fs.mkdirSync(path.join(informe, 'Anexos'), { recursive: true });
    fs.writeFileSync(path.join(informe, 'main.tex'), 'uno\r\ndos\r\n');
    fs.writeFileSync(path.join(informe, 'Anexos', 'A.tex'), '﻿anexo\n');
    fs.writeFileSync(path.join(informe, 'otro.tex'), 'no pedido\n');
    const destino = path.join(dir, 'foto');
    const mapa = await fotografiarInforme(informe, ['main.tex', 'Anexos/A.tex'], destino);
    expect([...mapa]).toEqual([['main.tex', 'uno\ndos\n'], ['Anexos/A.tex', 'anexo\n']]);
    expect(fs.readFileSync(path.join(destino, 'main.tex'), 'utf8')).toBe('uno\r\ndos\r\n');
    expect(fs.existsSync(path.join(destino, 'Anexos', 'A.tex'))).toBe(true);
    expect(fs.existsSync(path.join(destino, 'otro.tex'))).toBe(false);
  });
});

describe('problemaDelRepositorio', () => {
  it('describe cada problema', async () => {
    const dir = dirTemporal();
    const { repo } = crearRepoDePrueba(dir);
    const dirSinGit = path.join(dir, 'sin-git');
    fs.mkdirSync(dirSinGit);
    expect(await problemaDelRepositorio(null, 'main')).toBe('Falta "repositorio" en config.json: la ruta de la aplicación a comparar.');
    expect(await problemaDelRepositorio(path.join(dir, 'no'), 'main')).toBe(`No existe la carpeta ${path.join(dir, 'no')}.`);
    expect(await problemaDelRepositorio(dirSinGit, 'main')).toBe(`${dirSinGit} no es un repositorio de Git.`);
    expect(await problemaDelRepositorio(repo, 'nada')).toBe(`No se encontró la rama nada en ${repo}.`);
    expect(await problemaDelRepositorio(repo, 'main')).toBeNull();
  });
});
