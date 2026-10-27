import fs from 'node:fs';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GUIA_INICIAL } from '../compartido/prompt';
import type { Config, EstadoGit, ItemZotero } from '../compartido/tipos';
import { copiarFixture, dirTemporal } from '../pruebas/ayudas/temporales';
import { crearApp, type Dependencias } from './app';
import { crearArchivos, RutaInvalida } from './archivos';
import { crearGuia } from './guia';
import { crearImagenes } from './imagenes';
import { describirProyecto } from './proyecto';
import { crearReferencias } from './referencias';
import { HallazgoDesconocido } from './verificaciones';
import type { Contra, Corrida, Ignorado } from '../compartido/verificacion';

let dir: string;
let servidor: Server;
let base: string;
let d: Dependencias;

const BIBTEX_DE_ZOTERO = fs.readFileSync(path.resolve(import.meta.dirname, '../pruebas/fixtures/zotero/entrada.bib'), 'utf8');
const ITEM_DE_ZOTERO: ItemZotero = {
  biblioteca: 'groups/6491700', nombreBiblioteca: 'Tesis2026-Cris,Pache,Nacho', item: 'ZXBADSCP', tipo: 'conferencePaper',
  titulo: 'TopicGPT: A Prompt-based Topic Modeling Framework', autores: ['Pham', 'Hoyle'], anio: '2024', doi: '10.18653/v1/2024.naacl-long.164',
};

const CORRIDA: Corrida = {
  fecha: '2026-10-18T12:00:00.000Z', contra: 'codigo', alcance: 'todo', archivos: ['Cap4.tex'], rama: 'main', commit: 'abc1234',
  duracionMs: 1000, costoUsd: null, estado: 'ok', crudo: null, descartados: 0, hallazgos: [], resueltos: [], comparacion: null,
};
const CORRIDA_INFORME: Corrida = { ...CORRIDA, contra: 'informe', rama: null, commit: null };
const IGNORADO: Ignorado = { id: 'h1', tipo: 'sin-respaldo', archivoInforme: 'Cap4.tex', cita: null, archivoRepo: null, explicacion: 'x', fecha: '2026-10-18T12:00:00.000Z' };

const ESTADO: EstadoGit ={ cambiosLocales: true, commitsSinEnviar: 1, commitsSinTraer: 2, combinacionEnCurso: false, archivosEnConflicto: [] };

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
  const config: Config = { informe, build: path.join(dir, 'build'), principal: 'main.tex', puerto: 0, compilarAlGuardar: true, corrector: true, puertoCorrector: 4319, verificaciones: path.join(dir, 'verificaciones'), repositorio: null, ramaRepositorio: 'main', limiteVerificacion: { capitulo: 15, todo: 45 }, agente: null };

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
    corrector: {
      iniciar: vi.fn(async () => {}),
      estado: vi.fn(() => ({ estado: 'listo' as const })),
      revisar: vi.fn(async () => []),
      revisarVarios: vi.fn(async (parrafos: { fuente: string }[][]) => parrafos.map((segmentos) => (segmentos[0].fuente === 'falla' ? null : [
        { desde: 0, hasta: segmentos[0].fuente.length, tipo: 'ortografia' as const, regla: 'R', mensaje: 'm', sugerencias: [] },
      ]))),
      olvidarCache: vi.fn(),
      detener: vi.fn(),
    },
    diccionario: {
      leer: vi.fn(async () => ({ palabras: ['BERTopic'], excepciones: ['analisis'] })),
      agregarPalabra: vi.fn(async (p: string) => { if (/\s/.test(p)) throw new Error('La palabra no es válida: tiene que ser una sola palabra.'); }),
      agregarExcepcion: vi.fn(async () => {}),
    },
    guia: crearGuia(path.join(dir, 'guia-estilo.md')),
    imagenes: crearImagenes(informe),
    referencias: crearReferencias(informe, async () => 'referencias.bib'),
    zotero: {
      items: vi.fn(async () => ({ estado: 'disponible' as const, items: [ITEM_DE_ZOTERO] })),
      bibtex: vi.fn(async (biblioteca: string, item: string) => {
        if (!/^(users\/0|groups\/\d+)$/.test(biblioteca) || !/^[A-Z0-9]{8}$/.test(item)) throw new RutaInvalida('Identificador de Zotero no válido.');
        return item === 'ZXBADSCP' ? BIBTEX_DE_ZOTERO : null;
      }),
    },
    verificador: {
      estado: vi.fn(async () => ({ estado: 'libre' as const, motivos: { codigo: null, informe: null }, errores: { codigo: null, informe: null } })),
      iniciar: vi.fn(async () => ({ tipo: 'ok' as const })),
      cancelar: vi.fn(),
      cerrar: vi.fn(),
      terminada: vi.fn(async () => {}),
    },
    verificaciones: {
      guardar: vi.fn(async () => CORRIDA),
      ultima: vi.fn(async (contra: Contra) => (contra === 'codigo' ? CORRIDA : CORRIDA_INFORME)),
      marcarResuelto: vi.fn(async (id: string) => { if (id === 'zzz') throw new HallazgoDesconocido(); }),
      ignorados: vi.fn(async () => [IGNORADO]),
      ignorar: vi.fn(async (id: string) => { if (id === 'zzz') throw new HallazgoDesconocido(); }),
      recuperar: vi.fn(async (id: string) => { if (id === 'zzz') throw new HallazgoDesconocido(); }),
    },
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

describe('corrección', () => {
  const posta = (ruta: string, cuerpo: unknown) => pedir('POST', ruta, cuerpo);

  it('estado del corrector', async () => {
    expect(await get('/api/correccion/estado')).toEqual({ estado: 'listo' });
  });

  it('revisar devuelve los avisos de cada párrafo, en orden', async () => {
    const parrafos = [[{ tipo: 'texto', fuente: 'Hola' }], [{ tipo: 'marca', fuente: '~', como: ' ' }, { tipo: 'texto', fuente: 'x' }]];
    const r = await posta('/api/correccion/revisar', { parrafos });
    expect(r.status).toBe(200);
    expect(r.cuerpo.map((avisos: { hasta: number }[]) => avisos[0].hasta)).toEqual([4, 1]);
    expect(d.corrector.revisarVarios).toHaveBeenCalledTimes(1);
  });

  it('un párrafo que no se pudo revisar viaja como null, no como "sin avisos"', async () => {
    const r = await posta('/api/correccion/revisar', { parrafos: [[{ tipo: 'texto', fuente: 'falla' }], [{ tipo: 'texto', fuente: 'bien' }]] });
    expect(r.cuerpo[0]).toBeNull();
    expect(r.cuerpo[1]).toHaveLength(1);
  });

  it.each([
    [{}],
    [{ parrafos: 'no es lista' }],
    [{ parrafos: [[{ tipo: 'otro', fuente: 'x' }]] }],
    [{ parrafos: [[{ tipo: 'texto' }]] }],
    [{ parrafos: [[{ tipo: 'marca', fuente: 'x', como: 3 }]] }],
  ])('revisar rechaza un pedido mal formado: %j', async (cuerpo) => {
    expect((await posta('/api/correccion/revisar', cuerpo)).status).toBe(400);
    expect(d.corrector.revisarVarios).not.toHaveBeenCalled();
  });

  it('diccionario devuelve palabras y excepciones', async () => {
    expect(await get('/api/correccion/diccionario')).toEqual({ palabras: ['BERTopic'], excepciones: ['analisis'] });
  });

  it('agregar una palabra la guarda y hace olvidar lo ya revisado', async () => {
    expect((await posta('/api/correccion/palabra', { palabra: 'embeddings' })).status).toBe(200);
    expect(d.diccionario.agregarPalabra).toHaveBeenCalledWith('embeddings');
    expect(d.corrector.olvidarCache).toHaveBeenCalledTimes(1);
  });

  it('agregar una excepción la guarda', async () => {
    expect((await posta('/api/correccion/excepcion', { palabra: 'analisis' })).status).toBe(200);
    expect(d.diccionario.agregarExcepcion).toHaveBeenCalledWith('analisis');
  });

  it('una palabra inválida da 400 con su motivo', async () => {
    const r = await posta('/api/correccion/palabra', { palabra: 'dos palabras' });
    expect(r.status).toBe(400);
    expect(r.cuerpo.mensaje).toMatch(/una sola palabra/);
    expect(d.corrector.olvidarCache).not.toHaveBeenCalled();
  });
});

describe('guía de estilo', () => {
  const archivoDeGuia = () => path.join(dir, 'guia-estilo.md');

  it('sin guardar ninguna devuelve la inicial', async () => {
    expect(await get('/api/ia/guia')).toEqual({ texto: GUIA_INICIAL });
  });

  it('guarda la guía y la devuelve después', async () => {
    expect((await put('/api/ia/guia', { texto: 'Tercera persona.' })).status).toBe(200);
    expect(await get('/api/ia/guia')).toEqual({ texto: 'Tercera persona.' });
    expect(fs.readFileSync(archivoDeGuia(), 'utf8')).toBe('Tercera persona.');
  });

  it.each([
    [{}],
    [{ texto: 42 }],
    [{ texto: 'x'.repeat(20001) }],
  ])('una guía inválida da 400 con su motivo y no se guarda', async (cuerpo) => {
    const r = await put('/api/ia/guia', cuerpo);
    expect(r.status).toBe(400);
    expect(r.cuerpo.mensaje).toMatch(/guía/);
    expect(fs.existsSync(archivoDeGuia())).toBe(false);
  });

  it('no escribe nada en el informe', async () => {
    const antes = fs.readdirSync(path.join(dir, 'informe')).sort();
    await put('/api/ia/guia', { texto: 'Algo.' });
    expect(fs.readdirSync(path.join(dir, 'informe')).sort()).toEqual(antes);
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

describe('imágenes', () => {
  const enFigs = (nombre: string) => path.join(dir, 'informe', 'figs', nombre);
  const png = () => fs.readFileSync(enFigs('ejemplo.png'));
  async function subir(nombre: string, bytes: Buffer, cabeceras: Record<string, string> = {}) {
    const r = await fetch(`${base}/api/imagenes?nombre=${encodeURIComponent(nombre)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...cabeceras }, body: new Uint8Array(bytes),
    });
    return { status: r.status, cuerpo: await r.json().catch(() => null) };
  }

  it('sirve una imagen del informe con su tipo y sin caché', async () => {
    const r = await fetch(`${base}/api/imagen?ruta=figs/ejemplo.png`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await r.arrayBuffer()).equals(png())).toBe(true);
  });

  it('responde a HEAD con el tipo, para distinguir un PDF de una imagen que falta', async () => {
    fs.writeFileSync(enFigs('grafico.pdf'), '%PDF-1.4\n');
    const r = await fetch(`${base}/api/imagen?ruta=figs/grafico`, { method: 'HEAD' });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
  });

  it('una imagen que no existe da 404 con la ruta', async () => {
    const r = await pedir('GET', '/api/imagen?ruta=figs/nada.png');
    expect(r.status).toBe(404);
    expect(r.cuerpo).toEqual({ mensaje: 'No se encuentra figs/nada.png' });
  });

  it.each(['../x.png', '.git/x.png', ''])('la ruta %j da 400', async (ruta) => {
    expect((await pedir('GET', `/api/imagen?ruta=${encodeURIComponent(ruta)}`)).status).toBe(400);
  });

  it('no sirve archivos que no son imágenes', async () => {
    expect((await pedir('GET', '/api/imagen?ruta=main.tex')).status).toBe(404);
  });

  it('lista las imágenes', async () => {
    expect(await get('/api/imagenes')).toEqual([{ ruta: 'figs/ejemplo.png', bytes: png().length }]);
  });

  it('sube una imagen nueva', async () => {
    const r = await subir('Nueva Imagen.png', png());
    expect(r).toEqual({ status: 201, cuerpo: { ruta: 'figs/Nueva-Imagen.png' } });
    expect(fs.readFileSync(enFigs('Nueva-Imagen.png')).equals(png())).toBe(true);
  });

  it('un nombre repetido da 409 con la sugerencia y no escribe', async () => {
    const r = await subir('ejemplo.png', Buffer.concat([png(), png()]));
    expect(r).toEqual({ status: 409, cuerpo: { ruta: 'figs/ejemplo.png', sugerido: 'ejemplo-2.png' } });
    expect(fs.readdirSync(path.join(dir, 'informe', 'figs'))).toEqual(['ejemplo.png']);
    expect(fs.statSync(enFigs('ejemplo.png')).size).toBe(70);
  });

  it('un archivo inválido da 400 con el motivo', async () => {
    expect(await subir('foto.png', Buffer.from('no soy una imagen'))).toEqual({
      status: 400, cuerpo: { mensaje: 'El archivo no es una imagen PNG, JPG o PDF válida.' },
    });
    expect(await subir('foto.gif', png())).toEqual({ status: 400, cuerpo: { mensaje: 'Solo se aceptan imágenes PNG, JPG o PDF.' } });
    expect((await subir('', png())).status).toBe(400);
  });

  it('más de 20 MB da 413 y no se guarda nada', async () => {
    const grande = Buffer.concat([png(), Buffer.alloc(20 * 1024 * 1024 + 1)]);
    expect(await subir('grande.png', grande)).toEqual({ status: 413, cuerpo: { mensaje: 'La imagen supera los 20 MB.' } });
    expect(fs.existsSync(enFigs('grande.png'))).toBe(false);
  });

  it('acepta una imagen de casi 20 MB', async () => {
    const casi = Buffer.concat([png(), Buffer.alloc(19 * 1024 * 1024)]);
    expect((await subir('casi.png', casi)).status).toBe(201);
  });

  it('rechaza una subida que viene de otro sitio', async () => {
    const r = await subir('ajena.png', png(), { Origin: 'https://sitio-ajeno.example' });
    expect(r.status).toBe(403);
    expect(fs.existsSync(enFigs('ajena.png'))).toBe(false);
  });

  it('una subida espera a que termine la operación de Git en curso', async () => {
    let soltar = () => {};
    d.git.traer = vi.fn(() => new Promise<{ tipo: 'ok'; archivosCambiados: string[] }>((r) => { soltar = () => r({ tipo: 'ok', archivosCambiados: [] }); }));
    const trayendo = post('/api/git/traer');
    await vi.waitFor(() => expect(d.git.traer).toHaveBeenCalled());
    const subiendo = subir('durante.png', png());
    await new Promise((r) => setTimeout(r, 150));
    expect(fs.existsSync(enFigs('durante.png'))).toBe(false);
    soltar();
    await trayendo;
    expect((await subiendo).status).toBe(201);
  });
});

describe('referencias', () => {
  const PHAM = '@inproceedings{pham_topicgpt_2024,\n\ttitle = {{TopicGPT}: {A} {Prompt}-based {Topic} {Modeling} {Framework}},\n'
    + '\tdoi = {10.18653/v1/2024.naacl-long.164},\n\tauthor = {Pham, Chau Minh and Hoyle, Alexander},\n\tyear = {2024},\n}';
  const agregar = (cuerpo: unknown) => pedir('POST', '/api/referencias', cuerpo);

  it('agrega una referencia al final del .bib', async () => {
    const antes = leerDisco('referencias.bib');
    const r = await agregar({ bibtex: PHAM });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual({ tipo: 'ok', referencias: [{ tipo: 'agregada', clave: 'pham_topicgpt_2024', advertencias: [] }] });
    expect(leerDisco('referencias.bib').startsWith(antes)).toBe(true);
    expect(leerDisco('referencias.bib')).toContain('@inproceedings{pham_topicgpt_2024,');
  });

  it('un texto que no es una referencia es una respuesta, no un error', async () => {
    const antes = leerDisco('referencias.bib');
    const r = await agregar({ bibtex: 'hola' });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ tipo: 'invalido' });
    expect(leerDisco('referencias.bib')).toBe(antes);
  });

  it.each([[{}], [{ bibtex: 42 }], [{ bibtex: 'x'.repeat(200001) }], [null]])('un pedido mal formado da 400 (%#)', async (cuerpo) => {
    const r = await agregar(cuerpo);
    expect(r.status).toBe(400);
    expect(r.cuerpo).toEqual({ mensaje: 'Pedido mal formado.' });
  });

  it('alRepetir llega a la unidad, y un valor desconocido se trata como preguntar', async () => {
    const otro = '@book{CitekeyBook, title = {Otro libro distinto}, year = {1999}}';
    expect((await agregar({ bibtex: otro, alRepetir: 'cualquiera' })).cuerpo).toMatchObject({ referencias: [{ tipo: 'clave-repetida' }] });
    expect((await agregar({ bibtex: otro })).cuerpo).toMatchObject({ referencias: [{ tipo: 'clave-repetida' }] });
    expect((await agregar({ bibtex: otro, alRepetir: 'renombrar' })).cuerpo).toMatchObject({ referencias: [{ tipo: 'agregada', clave: 'CitekeyBook-2' }] });
  });

  it('espera a que termine la operación de Git en curso', async () => {
    let soltar = () => {};
    d.git.traer = vi.fn(() => new Promise<{ tipo: 'ok'; archivosCambiados: string[] }>((r) => { soltar = () => r({ tipo: 'ok', archivosCambiados: [] }); }));
    const antes = leerDisco('referencias.bib');
    const trayendo = post('/api/git/traer');
    await vi.waitFor(() => expect(d.git.traer).toHaveBeenCalled());
    const agregando = agregar({ bibtex: PHAM });
    await new Promise((r) => setTimeout(r, 150));
    expect(leerDisco('referencias.bib')).toBe(antes);
    soltar();
    await trayendo;
    expect((await agregando).cuerpo).toMatchObject({ tipo: 'ok' });
    expect(leerDisco('referencias.bib')).toContain('pham_topicgpt_2024');
  });

  it('rechaza un pedido que viene de otro sitio', async () => {
    const antes = leerDisco('referencias.bib');
    const r = await fetch(`${base}/api/referencias`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://sitio-ajeno.example' }, body: JSON.stringify({ bibtex: PHAM }),
    });
    expect(r.status).toBe(403);
    expect(leerDisco('referencias.bib')).toBe(antes);
  });
});

describe('zotero', () => {
  const citar = (cuerpo: unknown) => pedir('POST', '/api/zotero/citar', cuerpo);

  it('items devuelve el estado y los ítems', async () => {
    expect(await get('/api/zotero/items')).toEqual({ estado: 'disponible', items: [ITEM_DE_ZOTERO] });
    d.zotero.items = vi.fn(async () => ({ estado: 'cerrado' as const, items: [] }));
    expect(await get('/api/zotero/items')).toEqual({ estado: 'cerrado', items: [] });
  });

  it('citar agrega la entrada al .bib sin la ruta del PDF, las notas, el resumen ni las palabras clave', async () => {
    const antes = leerDisco('referencias.bib');
    const r = await citar({ biblioteca: 'groups/6491700', item: 'ZXBADSCP' });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ tipo: 'ok', referencias: [{ tipo: 'agregada', clave: 'pham_topicgpt_2024' }, { tipo: 'agregada', clave: 'inzua_herken_extraccion_2025' }] });
    const despues = leerDisco('referencias.bib');
    expect(despues.startsWith(antes)).toBe(true);
    const agregado = despues.slice(antes.length);
    expect(agregado).toContain('@inproceedings{pham_topicgpt_2024,');
    expect(agregado).not.toMatch(/\b(file|annote|abstract|keywords)\s*=/);
    expect(agregado).not.toMatch(/Users|interesante/);
    expect(d.zotero.bibtex).toHaveBeenCalledWith('groups/6491700', 'ZXBADSCP');
  });

  // Zotero escribe un `annote` por cada nota del ítem y puede listar varios archivos.
  it('un ítem con dos notas y dos adjuntos: ninguna nota ni ruta llega al .bib', async () => {
    d.zotero.bibtex = vi.fn(async () => '\n@article{k_2020,\n\ttitle = {Un paper},\n\tjournal = {Rev},\n\tyear = {2020},\n'
      + '\tannote = {NOTA PRIVADA UNO},\n\tannote = {NOTA PRIVADA DOS},\n'
      + '\tfile = {PDF:C\\:\\\\Users\\\\Cris\\\\a.pdf:application/pdf},\n\tfile = {Snapshot:C\\:\\\\Users\\\\Cris\\\\b.html:text/html},\n}\n');
    const antes = fs.readFileSync(path.join(dir, 'informe', 'referencias.bib'));
    expect((await citar({ biblioteca: 'groups/6491700', item: 'ZXBADSCP' })).cuerpo).toMatchObject({ tipo: 'ok', referencias: [{ tipo: 'agregada', clave: 'k_2020' }] });
    const despues = fs.readFileSync(path.join(dir, 'informe', 'referencias.bib'));
    expect(despues.subarray(0, antes.length).equals(antes)).toBe(true);
    const agregado = despues.subarray(antes.length).toString('utf8');
    expect(agregado).not.toMatch(/NOTA|Users|annote|file/);
    expect(agregado.replace(/\r\n/g, '\n')).toBe('\n@article{k_2020,\n\ttitle = {Un paper},\n\tjournal = {Rev},\n\tyear = {2020},\n}\n');
  });

  it('citar dos veces no duplica', async () => {
    await citar({ biblioteca: 'groups/6491700', item: 'ZXBADSCP' });
    const despues = leerDisco('referencias.bib');
    expect((await citar({ biblioteca: 'groups/6491700', item: 'ZXBADSCP' })).cuerpo).toMatchObject({ referencias: [{ tipo: 'ya-estaba' }, { tipo: 'ya-estaba' }] });
    expect(leerDisco('referencias.bib')).toBe(despues);
  });

  it('un ítem que ya no existe se explica y no cambia el .bib', async () => {
    const antes = leerDisco('referencias.bib');
    const r = await citar({ biblioteca: 'groups/6491700', item: 'N0EX1STE' });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual({ tipo: 'invalido', mensaje: 'Zotero ya no tiene ese ítem, o no respondió. Actualizá la búsqueda y probá de nuevo.' });
    expect(leerDisco('referencias.bib')).toBe(antes);
  });

  it.each([
    [{ biblioteca: 'groups/6491700/../x', item: 'ZXBADSCP' }], [{ biblioteca: 'groups/6491700', item: '../../x' }],
    [{ biblioteca: 'groups/6491700' }], [{ item: 'ZXBADSCP' }], [{ biblioteca: 7, item: 'ZXBADSCP' }], [{}],
  ])('identificadores con otra forma dan 400 (%#)', async (cuerpo) => {
    const antes = leerDisco('referencias.bib');
    expect((await citar(cuerpo)).status).toBe(400);
    expect(leerDisco('referencias.bib')).toBe(antes);
  });

  it('rechaza un pedido que viene de otro sitio', async () => {
    const r = await fetch(`${base}/api/zotero/citar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://sitio-ajeno.example' },
      body: JSON.stringify({ biblioteca: 'groups/6491700', item: 'ZXBADSCP' }),
    });
    expect(r.status).toBe(403);
    expect(d.zotero.bibtex).not.toHaveBeenCalled();
    expect((await fetch(`${base}/api/zotero/items`, { headers: { Origin: 'https://sitio-ajeno.example' } })).status).toBe(403);
  });
});

describe('verificación', () => {
  const MAL_FORMADO = { mensaje: 'Pedido mal formado.' };

  it('GET devuelve el estado, la última corrida de cada tipo y los ignorados', async () => {
    expect(await get('/api/verificacion')).toEqual({
      estado: { estado: 'libre', motivos: { codigo: null, informe: null }, errores: { codigo: null, informe: null } },
      corridas: { codigo: CORRIDA, informe: CORRIDA_INFORME },
      ignorados: [IGNORADO],
    });
  });

  it('POST inicia una corrida y responde 202', async () => {
    const r = await pedir('POST', '/api/verificacion', { contra: 'codigo', alcance: 'capitulo', ruta: 'Cap4.tex' });
    expect(r.status).toBe(202);
    expect(r.cuerpo).toEqual({});
    expect(d.verificador.iniciar).toHaveBeenCalledWith('codigo', 'capitulo', 'Cap4.tex');
  });

  it('POST pasa contra al verificador', async () => {
    expect((await pedir('POST', '/api/verificacion', { contra: 'informe', alcance: 'capitulo', ruta: 'Cap4.tex' })).status).toBe(202);
    expect(d.verificador.iniciar).toHaveBeenCalledWith('informe', 'capitulo', 'Cap4.tex');
  });

  it('POST de todo no necesita ruta', async () => {
    expect((await pedir('POST', '/api/verificacion', { contra: 'informe', alcance: 'todo' })).status).toBe(202);
    expect(d.verificador.iniciar).toHaveBeenCalledWith('informe', 'todo', null);
  });

  it.each([
    [{ contra: 'codigo', alcance: 'otro' }], [{}], [{ contra: 'codigo', alcance: 'capitulo', ruta: 5 }],
    [{ alcance: 'todo' }], [{ contra: 'repositorio', alcance: 'todo' }],
  ])('POST con %j da 400', async (cuerpo) => {
    const r = await pedir('POST', '/api/verificacion', cuerpo);
    expect(r.status).toBe(400);
    expect(r.cuerpo).toEqual(MAL_FORMADO);
    expect(d.verificador.iniciar).not.toHaveBeenCalled();
  });

  it('POST inválido da 400 con el mensaje del verificador', async () => {
    d.verificador.iniciar = vi.fn(async () => ({ tipo: 'invalido' as const, mensaje: 'Falta la ruta.' }));
    const r = await pedir('POST', '/api/verificacion', { contra: 'codigo', alcance: 'capitulo' });
    expect(r.status).toBe(400);
    expect(r.cuerpo).toEqual({ mensaje: 'Falta la ruta.' });
  });

  it('POST con una corrida en curso da 409', async () => {
    d.verificador.iniciar = vi.fn(async () => ({ tipo: 'ocupado' as const }));
    const r = await pedir('POST', '/api/verificacion', { contra: 'codigo', alcance: 'todo' });
    expect(r.status).toBe(409);
    expect(r.cuerpo).toEqual({ mensaje: 'Ya hay una verificación en curso.' });
  });

  it('cancelar', async () => {
    expect((await post('/api/verificacion/cancelar')).cuerpo).toEqual({});
    expect(d.verificador.cancelar).toHaveBeenCalledOnce();
  });

  it.each([
    ['resuelto', 'marcarResuelto'], ['ignorar', 'ignorar'], ['recuperar', 'recuperar'],
  ] as const)('%s actúa sobre el id', async (ruta, metodo) => {
    const r = await pedir('POST', `/api/verificacion/${ruta}`, { id: 'h1' });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual({});
    expect(d.verificaciones[metodo]).toHaveBeenCalledWith('h1');
  });

  it.each(['resuelto', 'ignorar', 'recuperar'])('%s con un id desconocido da 404', async (ruta) => {
    const r = await pedir('POST', `/api/verificacion/${ruta}`, { id: 'zzz' });
    expect(r.status).toBe(404);
    expect(r.cuerpo).toEqual({ mensaje: 'Ese hallazgo ya no está en la última corrida.' });
  });

  it.each(['resuelto', 'ignorar', 'recuperar'])('%s sin id da 400', async (ruta) => {
    for (const cuerpo of [{}, { id: 5 }]) {
      const r = await pedir('POST', `/api/verificacion/${ruta}`, cuerpo);
      expect(r.status).toBe(400);
      expect(r.cuerpo).toEqual(MAL_FORMADO);
    }
  });
});
