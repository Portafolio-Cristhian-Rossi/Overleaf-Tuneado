import fs from 'node:fs';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config, EstadoGit } from '../compartido/tipos';
import { copiarFixture, dirTemporal } from '../pruebas/ayudas/temporales';
import { crearApp, type Dependencias } from './app';
import { crearArchivos } from './archivos';
import { describirProyecto } from './proyecto';

let dir: string;
let servidor: Server;
let base: string;
let d: Dependencias;

const ESTADO: EstadoGit = { cambiosLocales: true, commitsSinEnviar: 1, commitsSinTraer: 2, combinacionEnCurso: false, archivosEnConflicto: [] };

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json: any = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: r.status, cuerpo: json, texto, cabeceras: r.headers };
}
const get = async (ruta: string) => (await pedir('GET', ruta)).cuerpo;
const put = (ruta: string, cuerpo: unknown) => pedir('PUT', ruta, cuerpo);
const post = (ruta: string) => pedir('POST', ruta);
const leerDisco = (ruta: string) => fs.readFileSync(path.join(dir, 'informe', ruta), 'utf8');

beforeEach(async () => {
  dir = dirTemporal();
  const informe = path.join(dir, 'informe');
  copiarFixture(informe);
  fs.mkdirSync(path.join(dir, 'estaticos'));
  fs.writeFileSync(path.join(dir, 'estaticos', 'index.html'), '<title>Editor</title>');
  const config: Config = { informe, build: path.join(dir, 'build'), principal: 'main.tex', puerto: 0, compilarAlGuardar: true };

  d = {
    config,
    archivos: crearArchivos(informe),
    proyecto: () => describirProyecto(informe, 'main.tex'),
    git: {
      verificar: vi.fn(async () => null),
      preparar: vi.fn(async () => {}),
      estado: vi.fn(async () => ESTADO),
      buscar: vi.fn(async () => ({ tipo: 'ok' as const })),
      traer: vi.fn(async () => ({ tipo: 'ok' as const, archivosCambiados: ['Cap4.tex'] })),
      enviar: vi.fn(async () => ({ tipo: 'conflicto' as const, archivos: ['Cap4.tex'] })),
      terminarCombinacion: vi.fn(async () => ({ tipo: 'quedan-marcas' as const, archivos: ['Cap4.tex'] })),
      cancelarCombinacion: vi.fn(async () => {}),
    },
    compilador: {
      compilar: vi.fn(async () => ({ tipo: 'ok' as const, problemas: [], pdfActualizado: true })),
      rutaPdf: () => path.join(dir, 'build', 'main.pdf'),
    },
    vigia: { latido: vi.fn(), revisar: vi.fn() },
    abrirVsCode: vi.fn(async () => {}),
    dirEstaticos: path.join(dir, 'estaticos'),
  };
  servidor = crearApp(d).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterEach(async () => {
  servidor.closeAllConnections();
  await new Promise((r) => servidor.close(r));
});

describe('estado general', () => {
  it('salud', async () => {
    expect(await get('/api/salud')).toEqual({ app: 'editor-informe' });
  });

  it('config expone solo lo que el cliente necesita', async () => {
    expect(await get('/api/config')).toEqual({ compilarAlGuardar: true, principal: 'main.tex', problema: null });
  });

  it('config informa el problema que impide sincronizar', async () => {
    d.git.verificar = vi.fn(async () => 'La carpeta no es un clon del proyecto de Overleaf.');
    expect((await get('/api/config')).problema).toBe('La carpeta no es un clon del proyecto de Overleaf.');
  });

  it('proyecto', async () => {
    const p = await get('/api/proyecto');
    expect(p.capitulos).toHaveLength(7);
    expect(p.bibliografia).toBe('referencias.bib');
  });

  it('sirve los estáticos', async () => {
    expect((await pedir('GET', '/')).texto).toContain('<title>Editor</title>');
  });

  it('latido avisa a la vigía', async () => {
    expect((await post('/api/latido')).status).toBe(200);
    expect(d.vigia.latido).toHaveBeenCalledTimes(1);
  });

  it('un error inesperado da 500 con mensaje y sin traza', async () => {
    d.git.estado = vi.fn(async () => { throw new Error('se rompió algo'); });
    const r = await pedir('GET', '/api/git/estado');
    expect(r.status).toBe(500);
    expect(r.cuerpo).toEqual({ mensaje: 'se rompió algo' });
    expect(r.texto).not.toMatch(/\.ts|at /);
  });
});

// Cualquier página web abierta en el navegador puede intentar llamar a 127.0.0.1.
describe('pedidos desde otros sitios', () => {
  const desde = (cabeceras: Record<string, string>) =>
    new Promise<number>((resolver, rechazar) => {
      const { port } = servidor.address() as AddressInfo;
      const pedido = http.request({ host: '127.0.0.1', port, path: '/api/git/enviar', method: 'POST', headers: cabeceras },
        (r) => { r.resume(); resolver(r.statusCode ?? 0); });
      pedido.on('error', rechazar);
      pedido.end();
    });

  it('rechaza un pedido con Origin de otro sitio', async () => {
    expect(await desde({ Origin: 'https://sitio-ajeno.example' })).toBe(403);
    expect(d.git.enviar).not.toHaveBeenCalled();
  });

  it('rechaza un pedido cuyo Host no es local (DNS rebinding)', async () => {
    expect(await desde({ Host: 'sitio-ajeno.example' })).toBe(403);
    expect(d.git.enviar).not.toHaveBeenCalled();
  });

  it('acepta el Origin del propio editor y el del servidor de desarrollo', async () => {
    const { port } = servidor.address() as AddressInfo;
    expect(await desde({ Origin: `http://127.0.0.1:${port}` })).toBe(200);
    expect(await desde({ Host: 'localhost:5173', Origin: 'http://localhost:5173' })).toBe(200);
  });
});

describe('archivos', () => {
  it('lee y escribe un archivo', async () => {
    const a = await get('/api/archivo?ruta=Cap1.tex');
    expect(a.contenido).toContain('\\chapter{Introducción}');
    const r = await put('/api/archivo', { ruta: 'Cap1.tex', ...a, contenido: a.contenido + 'Nuevo.\n', versionBase: a.version });
    expect(r.status).toBe(200);
    expect(r.cuerpo.tipo).toBe('ok');
    expect(leerDisco('Cap1.tex')).toContain('Nuevo.');
  });

  it('dos escrituras con la misma versionBase: la segunda da 409 y no pisa', async () => {
    const a = await get('/api/archivo?ruta=Cap1.tex');
    const datos = { ruta: 'Cap1.tex', ...a, finDeLinea: '\n', versionBase: a.version };
    expect((await put('/api/archivo', { ...datos, contenido: 'primera\n' })).status).toBe(200);
    const r = await put('/api/archivo', { ...datos, contenido: 'segunda\n' });
    expect(r.status).toBe(409);
    expect(r.cuerpo).toMatchObject({ tipo: 'cambio-en-disco', actual: { contenido: 'primera\n' } });
    expect(leerDisco('Cap1.tex')).toBe('primera\n');
  });

  it('archivo borrado da 410', async () => {
    const a = await get('/api/archivo?ruta=Cap1.tex');
    fs.rmSync(path.join(dir, 'informe', 'Cap1.tex'));
    const r = await put('/api/archivo', { ruta: 'Cap1.tex', ...a, versionBase: a.version });
    expect(r.status).toBe(410);
    expect(r.cuerpo).toEqual({ tipo: 'desaparecido' });
  });

  it('ruta fuera del informe da 400 al leer y al escribir', async () => {
    expect((await pedir('GET', '/api/archivo?ruta=' + encodeURIComponent('../afuera.tex'))).status).toBe(400);
    const r = await put('/api/archivo', { ruta: '../afuera.tex', contenido: 'x', finDeLinea: '\n', bom: false, versionBase: '' });
    expect(r.status).toBe(400);
    expect(fs.existsSync(path.join(dir, 'afuera.tex'))).toBe(false);
  });

  it('archivo inexistente da 404', async () => {
    expect((await pedir('GET', '/api/archivo?ruta=nada.tex')).status).toBe(404);
  });

  it.each([
    [{ contenido: 'x', finDeLinea: '\n', bom: false, versionBase: '' }],
    [{ ruta: 'Cap1.tex', finDeLinea: '\n', bom: false, versionBase: '' }],
    [{ ruta: 'Cap1.tex', contenido: 'x', finDeLinea: '\r', bom: false, versionBase: '' }],
    [{ ruta: 'Cap1.tex', contenido: 'x', finDeLinea: '\n', bom: 'no', versionBase: '' }],
  ])('un cuerpo incompleto o inválido da 400 y no escribe: %j', async (cuerpo) => {
    const antes = leerDisco('Cap1.tex');
    expect((await put('/api/archivo', cuerpo)).status).toBe(400);
    expect(leerDisco('Cap1.tex')).toBe(antes);
  });
});

// Un guardado que llega en medio de un Traer no debe escribir mientras Git combina archivos.
describe('guardados y Git de a uno', () => {
  it('un guardado pedido durante un traer espera a que el traer termine', async () => {
    const orden: string[] = [];
    d.git.traer = vi.fn(async () => {
      orden.push('traer empieza');
      await new Promise((r) => setTimeout(r, 150));
      orden.push('traer termina');
      return { tipo: 'ok' as const, archivosCambiados: [] };
    });
    const a = await get('/api/archivo?ruta=Cap1.tex');
    const traida = post('/api/git/traer');
    await new Promise((r) => setTimeout(r, 30));
    const guardado = put('/api/archivo', { ruta: 'Cap1.tex', ...a, contenido: a.contenido + 'x', versionBase: a.version })
      .then((r) => { orden.push('guardado termina'); return r; });
    await Promise.all([traida, guardado]);
    expect(orden).toEqual(['traer empieza', 'traer termina', 'guardado termina']);
  });

  it('un archivo protegido responde 423 con su motivo y no se escribe', async () => {
    const bytes = Buffer.from([0x61, 0xf1, 0x6f, 0x0a]);
    fs.writeFileSync(path.join(dir, 'informe', 'raro.bib'), bytes);
    const a = await get('/api/archivo?ruta=raro.bib');
    expect(a.fiel).toBe(false);
    const r = await put('/api/archivo', { ruta: 'raro.bib', contenido: 'x', finDeLinea: a.finDeLinea, bom: false, versionBase: a.version, forzar: true });
    expect(r.status).toBe(423);
    expect(r.cuerpo.mensaje).toMatch(/no se puede guardar/);
    expect(fs.readFileSync(path.join(dir, 'informe', 'raro.bib')).equals(bytes)).toBe(true);
  });
});

describe('git y compilación', () => {
  it('estado', async () => {
    expect(await get('/api/git/estado')).toEqual(ESTADO);
  });

  it('traer, enviar, terminar y cancelar delegan en git y devuelven su resultado', async () => {
    expect((await post('/api/git/traer')).cuerpo).toEqual({ tipo: 'ok', archivosCambiados: ['Cap4.tex'] });
    expect((await post('/api/git/enviar')).cuerpo).toEqual({ tipo: 'conflicto', archivos: ['Cap4.tex'] });
    expect((await post('/api/git/terminar')).cuerpo).toEqual({ tipo: 'quedan-marcas', archivos: ['Cap4.tex'] });
    expect((await post('/api/git/cancelar')).status).toBe(200);
    expect(d.git.cancelarCombinacion).toHaveBeenCalledTimes(1);
  });

  it('abrir-vscode', async () => {
    expect((await post('/api/git/abrir-vscode')).status).toBe(200);
    expect(d.abrirVsCode).toHaveBeenCalledTimes(1);
  });

  it('compilar delega en el compilador', async () => {
    expect((await post('/api/compilar')).cuerpo).toEqual({ tipo: 'ok', problemas: [], pdfActualizado: true });
  });

  it('pdf da 404 si no existe y lo sirve sin caché si existe', async () => {
    expect((await pedir('GET', '/api/pdf')).status).toBe(404);
    fs.mkdirSync(path.join(dir, 'build'));
    fs.writeFileSync(path.join(dir, 'build', 'main.pdf'), '%PDF-1.5 prueba');
    const r = await pedir('GET', '/api/pdf');
    expect(r.status).toBe(200);
    expect(r.texto).toBe('%PDF-1.5 prueba');
    expect(r.cabeceras.get('content-type')).toContain('application/pdf');
    expect(r.cabeceras.get('cache-control')).toBe('no-store');
  });
});
