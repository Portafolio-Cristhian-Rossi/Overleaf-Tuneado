import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { cambioDelCompanero } from '../pruebas/ayudas/companero';
import { crearEntornoPrueba, git as correr, type EntornoPrueba } from '../pruebas/ayudas/entornoPrueba';
import { dirTemporal } from '../pruebas/ayudas/temporales';
import { crearArchivos } from './archivos';
import { crearGit, type Git } from './git';

let e: EntornoPrueba;
let git: Git;

const leer = (dir: string, ruta: string) => fs.readFileSync(path.join(dir, ruta), 'utf8');
const editar = (dir: string, ruta: string, f: (t: string) => string) =>
  fs.writeFileSync(path.join(dir, ruta), f(leer(dir, ruta)));
const leerDelRemoto = (ruta: string) => correr(e.remoto, 'show', `main:${ruta}`);
const archivosDelRemoto = () => correr(e.remoto, 'ls-tree', '-r', '--name-only', 'main').trim().split('\n');
const ultimoMensaje = (dir: string) => correr(dir, 'log', '-1', '--format=%s').trim();
const LIMPIO = { cambiosLocales: false, commitsSinEnviar: 0, commitsSinTraer: 0, combinacionEnCurso: false, archivosEnConflicto: [] };

async function provocarConflicto() {
  editar(e.informe, 'Cap4.tex', (t) => t.replace('Experimentación', 'Experimentos'));
  await cambioDelCompanero(e, 'Cap4.tex', (t) => t.replace('Experimentación', 'Pruebas'));
  return git.enviar();
}

beforeEach(async () => {
  e = await crearEntornoPrueba(dirTemporal());
  git = crearGit(e.informe);
});

describe('estado, traer y buscar', () => {
  it('estado limpio tras clonar', async () => {
    expect(await git.estado()).toEqual(LIMPIO);
  });

  it('estado detecta cambios locales', async () => {
    editar(e.informe, 'Cap1.tex', (t) => t + '\nMío.\n');
    expect(await git.estado()).toEqual({ ...LIMPIO, cambiosLocales: true });
  });

  it('traer sin novedades', async () => {
    expect(await git.traer()).toEqual({ tipo: 'ok', archivosCambiados: [] });
  });

  it('traer un cambio del compañero en otro archivo conserva lo local', async () => {
    editar(e.informe, 'Cap1.tex', (t) => t + '\nMío.\n');
    await cambioDelCompanero(e, 'Cap4.tex', (t) => t + '\nDe otro.\n');
    expect(await git.traer()).toEqual({ tipo: 'ok', archivosCambiados: ['Cap4.tex'] });
    expect(leer(e.informe, 'Cap1.tex')).toContain('Mío.');
    expect(leer(e.informe, 'Cap4.tex')).toContain('De otro.');
  });

  it('traer combina cambios en párrafos distintos del mismo archivo', async () => {
    editar(e.informe, 'Cap1.tex', (t) => t.replace('\\chapter{Introducción}', '\\chapter{Presentación}'));
    await cambioDelCompanero(e, 'Cap1.tex', (t) => t + '\nAl final, de otro.\n');
    expect(await git.traer()).toEqual({ tipo: 'ok', archivosCambiados: ['Cap1.tex'] });
    expect(leer(e.informe, 'Cap1.tex')).toContain('\\chapter{Presentación}');
    expect(leer(e.informe, 'Cap1.tex')).toContain('Al final, de otro.');
  });

  it('buscar actualiza commitsSinTraer sin tocar archivos', async () => {
    const antes = leer(e.informe, 'Cap4.tex');
    await cambioDelCompanero(e, 'Cap4.tex', (t) => t + '\nDe otro.\n');
    expect((await git.estado()).commitsSinTraer).toBe(0);
    expect(await git.buscar()).toEqual({ tipo: 'ok' });
    expect((await git.estado()).commitsSinTraer).toBe(1);
    expect(leer(e.informe, 'Cap4.tex')).toBe(antes);
  });

  it('el commit lleva el mensaje acordado', async () => {
    editar(e.informe, 'Cap1.tex', (t) => t + '\nMío.\n');
    await git.traer();
    expect(ultimoMensaje(e.informe)).toMatch(/^Edición desde el editor local, \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect((await git.estado()).commitsSinEnviar).toBe(1);
  });
});

describe('enviar', () => {
  it('publica el cambio', async () => {
    editar(e.informe, 'Cap1.tex', (t) => t + '\nMío.\n');
    expect(await git.enviar()).toEqual({ tipo: 'ok', enviado: true });
    expect(leerDelRemoto('Cap1.tex')).toContain('Mío.');
    expect(await git.estado()).toEqual(LIMPIO);
  });

  it('sin cambios no envía nada', async () => {
    expect(await git.enviar()).toEqual({ tipo: 'ok', enviado: false });
  });

  it('con el remoto adelantado trae primero y después envía', async () => {
    editar(e.informe, 'Cap1.tex', (t) => t + '\nMío.\n');
    await cambioDelCompanero(e, 'Cap4.tex', (t) => t + '\nDe otro.\n');
    expect(await git.enviar()).toEqual({ tipo: 'ok', enviado: true });
    expect(leerDelRemoto('Cap1.tex')).toContain('Mío.');
    expect(leerDelRemoto('Cap4.tex')).toContain('De otro.');
  });

  it('solo cambia en el remoto las líneas editadas', async () => {
    editar(e.informe, 'Cap5.tex', (t) => t.replace('se evalúan', 'se analizan'));
    await git.enviar();
    const estadistica = correr(e.remoto, 'show', '--numstat', '--format=', 'main').trim();
    expect(estadistica).toBe('1\t1\tCap5.tex');
  });

  it('informa sin conexión y conserva el trabajo local', async () => {
    editar(e.informe, 'Cap1.tex', (t) => t + '\nMío.\n');
    correr(e.informe, 'remote', 'set-url', 'origin', 'https://127.0.0.1:1/no-existe.git');
    expect(await git.enviar()).toMatchObject({ tipo: 'error', motivo: 'sin-conexion' });
    expect(await git.traer()).toMatchObject({ tipo: 'error', motivo: 'sin-conexion' });
    expect(leer(e.informe, 'Cap1.tex')).toContain('Mío.');
  });
});

describe('conflictos', () => {
  it('en el mismo párrafo: no envía y deja la combinación en curso', async () => {
    expect(await provocarConflicto()).toEqual({ tipo: 'conflicto', archivos: ['Cap4.tex'] });
    expect(await git.estado()).toMatchObject({ combinacionEnCurso: true, archivosEnConflicto: ['Cap4.tex'] });
    expect(leerDelRemoto('Cap4.tex')).toContain('Pruebas');
    expect(leerDelRemoto('Cap4.tex')).not.toContain('Experimentos');
  });

  it('con una combinación en curso, traer y enviar vuelven a informar el conflicto', async () => {
    await provocarConflicto();
    expect(await git.traer()).toEqual({ tipo: 'conflicto', archivos: ['Cap4.tex'] });
    expect(await git.enviar()).toEqual({ tipo: 'conflicto', archivos: ['Cap4.tex'] });
  });

  it('cancelarCombinacion devuelve mi versión intacta', async () => {
    await provocarConflicto();
    await git.cancelarCombinacion();
    expect(leer(e.informe, 'Cap4.tex')).toContain('Experimentos');
    expect(leer(e.informe, 'Cap4.tex')).not.toContain('<<<<<<<');
    expect((await git.estado()).combinacionEnCurso).toBe(false);
  });

  it('terminarCombinacion avisa si quedan marcas', async () => {
    await provocarConflicto();
    expect(await git.terminarCombinacion()).toEqual({ tipo: 'quedan-marcas', archivos: ['Cap4.tex'] });
    expect((await git.estado()).combinacionEnCurso).toBe(true);
  });

  it('terminarCombinacion cierra la combinación cuando el archivo quedó resuelto', async () => {
    await provocarConflicto();
    fs.writeFileSync(path.join(e.informe, 'Cap4.tex'), '\\chapter{Resuelto}\r\n');
    expect(await git.terminarCombinacion()).toEqual({ tipo: 'ok' });
    expect(await git.enviar()).toEqual({ tipo: 'ok', enviado: true });
    expect(leerDelRemoto('Cap4.tex')).toBe('\\chapter{Resuelto}\n');
  });

  it('terminarCombinacion sin combinación en curso no hace nada', async () => {
    expect(await git.terminarCombinacion()).toEqual({ tipo: 'ok' });
    expect(await git.estado()).toEqual(LIMPIO);
  });
});

describe('lo que no debe llegar al remoto', () => {
  it('preparar excluye los temporales y enviar no los sube', async () => {
    await git.preparar();
    await git.preparar();
    for (const f of ['main.aux', 'main.log', 'main.pdf', 'Cap1.aux', 'main.synctex.gz', 'main.bbl', 'main.toc']) {
      fs.writeFileSync(path.join(e.informe, f), 'x');
    }
    fs.writeFileSync(path.join(e.informe, 'figs-nueva.pdf'), 'x');
    editar(e.informe, 'Cap1.tex', (t) => t + '\nMío.\n');
    expect(await git.enviar()).toEqual({ tipo: 'ok', enviado: true });

    const remoto = archivosDelRemoto();
    expect(remoto).toEqual(expect.arrayContaining(['Cap1.tex', 'figs-nueva.pdf']));
    expect(remoto.filter((f) => /\.(aux|log|gz|bbl|toc)$/.test(f) || f === 'main.pdf')).toEqual([]);

    const exclusiones = leer(e.informe, '.git/info/exclude').split(/\r?\n/);
    expect(exclusiones.filter((l) => l === '*.aux')).toHaveLength(1);
    expect(exclusiones).toContain('/main.pdf');
  });

  it('solo con temporales presentes el estado sigue limpio', async () => {
    await git.preparar();
    fs.writeFileSync(path.join(e.informe, 'main.aux'), 'x');
    expect(await git.estado()).toEqual(LIMPIO);
  });

  it('guardar sin editar un archivo con BOM o fines mezclados no genera cambios', async () => {
    fs.writeFileSync(path.join(e.informe, 'mezclado.tex'), 'a\r\nb\r\nc\n');
    fs.writeFileSync(path.join(e.informe, 'conbom.tex'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a\r\n')]));
    correr(e.informe, 'add', '-A');
    correr(e.informe, 'commit', '--quiet', '-m', 'casos raros');

    const a = crearArchivos(e.informe);
    for (const ruta of ['Cap1.tex', 'mezclado.tex', 'conbom.tex']) {
      const l = await a.leer(ruta);
      await a.escribir(ruta, { ...l, versionBase: l.version });
    }
    expect((await git.estado()).cambiosLocales).toBe(false);
  });

  // Git da por modificado un archivo cuyo tamaño cambió aunque, ya normalizado, sea idéntico.
  it('traer y enviar no fallan ni crean commits por un archivo reescrito sin cambios reales', async () => {
    fs.writeFileSync(path.join(e.informe, 'mezclado.tex'), 'a\r\nb\r\nc\n');
    correr(e.informe, 'add', '-A');
    correr(e.informe, 'commit', '--quiet', '-m', 'caso raro');
    correr(e.informe, 'push', '--quiet');
    const commitsAntes = correr(e.informe, 'rev-list', '--count', 'HEAD').trim();

    fs.writeFileSync(path.join(e.informe, 'mezclado.tex'), 'a\r\nb\r\nc\r\n');
    expect(await git.traer()).toEqual({ tipo: 'ok', archivosCambiados: [] });
    expect(await git.enviar()).toEqual({ tipo: 'ok', enviado: false });
    expect(correr(e.informe, 'rev-list', '--count', 'HEAD').trim()).toBe(commitsAntes);
  });
});
