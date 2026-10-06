import fs from 'node:fs/promises';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import type { Config, Proyecto } from '../compartido/tipos';
import { ArchivoProtegido, RutaInvalida, type Archivos } from './archivos';
import type { Segmento } from '../compartido/prosa';
import type { Compilador } from './compilar';
import type { Diccionario } from './diccionario';
import type { Git } from './git';
import type { Corrector } from './languagetool';
import type { Vigia } from './vigia';

export interface Dependencias {
  config: Config; archivos: Archivos; proyecto: () => Promise<Proyecto>;
  git: Git; compilador: Compilador; vigia: Vigia;
  corrector: Corrector; diccionario: Diccionario;
  abrirVsCode: () => Promise<void>; dirEstaticos: string;
}

const NOMBRES_LOCALES = new Set(['127.0.0.1', 'localhost', '[::1]']);

// El servidor escucha solo en la máquina, pero cualquier página abierta en el navegador
// puede intentar llamarlo: se exige un Host local y, si hay Origin, que sea el mismo sitio.
const soloEsteEquipo: RequestHandler = (req, res, next) => {
  const host = req.headers.host ?? '';
  const nombre = host.replace(/:\d+$/, '');
  const origen = req.headers.origin;
  const origenAjeno = origen !== undefined && origen.replace(/^https?:\/\//, '') !== host;
  if (!NOMBRES_LOCALES.has(nombre) || origenAjeno) {
    res.status(403).json({ mensaje: 'Pedido rechazado: no proviene del editor.' });
    return;
  }
  next();
};

function esEscrituraValida(c: any): c is { ruta: string; contenido: string; finDeLinea: '\r\n' | '\n'; bom: boolean; versionBase: string; forzar?: boolean } {
  return typeof c?.ruta === 'string' && typeof c.contenido === 'string'
    && (c.finDeLinea === '\n' || c.finDeLinea === '\r\n')
    && typeof c.bom === 'boolean' && typeof c.versionBase === 'string';
}

const MAXIMO_DE_PARRAFOS = 2000;

function sonParrafos(x: unknown): x is Segmento[][] {
  return Array.isArray(x) && x.length <= MAXIMO_DE_PARRAFOS && x.every((parrafo) =>
    Array.isArray(parrafo) && parrafo.every((s) =>
      (s?.tipo === 'texto' || s?.tipo === 'marca') && typeof s.fuente === 'string'
      && (s.como === undefined || typeof s.como === 'string')));
}

export function crearApp(d: Dependencias): express.Express {
  const app = express();

  // Guardar un archivo y operar con Git van de a uno: un guardado que llega en medio de un
  // Traer espera a que Git termine de combinar, y recién entonces compara versiones.
  let cola: Promise<unknown> = Promise.resolve();
  function enSerie<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = cola.then(tarea, tarea);
    cola = resultado.catch(() => undefined);
    return resultado;
  }

  app.disable('x-powered-by');
  app.use('/api', soloEsteEquipo);
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/salud', (_req, res) => { res.json({ app: 'editor-informe' }); });
  app.get('/api/config', async (_req, res) => {
    res.json({
      compilarAlGuardar: d.config.compilarAlGuardar,
      principal: d.config.principal,
      problema: await d.git.verificar(),
    });
  });
  app.get('/api/proyecto', async (_req, res) => { res.json(await d.proyecto()); });

  app.get('/api/archivo', async (req, res) => {
    res.json(await d.archivos.leer(String(req.query.ruta ?? '')));
  });
  app.put('/api/archivo', async (req, res) => {
    if (!esEscrituraValida(req.body)) {
      res.status(400).json({ mensaje: 'Pedido de guardado incompleto.' });
      return;
    }
    const { ruta, contenido, finDeLinea, bom, versionBase, forzar } = req.body;
    const r = await enSerie(() => d.archivos.escribir(ruta, { contenido, finDeLinea, bom, versionBase, forzar: forzar === true }));
    res.status(r.tipo === 'ok' ? 200 : r.tipo === 'cambio-en-disco' ? 409 : 410).json(r);
  });

  app.get('/api/git/estado', async (_req, res) => { res.json(await d.git.estado()); });
  app.post('/api/git/traer', async (_req, res) => { res.json(await enSerie(() => d.git.traer())); });
  app.post('/api/git/enviar', async (_req, res) => { res.json(await enSerie(() => d.git.enviar())); });
  app.post('/api/git/terminar', async (_req, res) => { res.json(await enSerie(() => d.git.terminarCombinacion())); });
  app.post('/api/git/cancelar', async (_req, res) => { await enSerie(() => d.git.cancelarCombinacion()); res.json({}); });
  app.post('/api/git/abrir-vscode', async (_req, res) => { await d.abrirVsCode(); res.json({}); });

  app.post('/api/compilar', async (_req, res) => { res.json(await d.compilador.compilar()); });
  app.get('/api/pdf', async (_req, res) => {
    const pdf = await fs.readFile(d.compilador.rutaPdf()).catch(() => null);
    if (pdf === null) {
      res.status(404).json({ mensaje: 'Todavía no hay PDF.' });
      return;
    }
    res.set('Cache-Control', 'no-store').type('application/pdf').send(pdf);
  });

  app.get('/api/correccion/estado', (_req, res) => { res.json(d.corrector.estado()); });
  app.get('/api/correccion/diccionario', async (_req, res) => { res.json(await d.diccionario.leer()); });
  app.post('/api/correccion/revisar', async (req, res) => {
    const parrafos = req.body?.parrafos;
    if (!sonParrafos(parrafos)) {
      res.status(400).json({ mensaje: 'Pedido de revisión mal formado.' });
      return;
    }
    res.json(await Promise.all(parrafos.map((p) => d.corrector.revisar(p))));
  });
  // Una palabra inválida es un error de quien pide, no del servidor.
  const guardarPalabra = (guardar: (palabra: string) => Promise<void>): RequestHandler => async (req, res) => {
    try {
      await guardar(req.body?.palabra);
    } catch (e) {
      res.status(400).json({ mensaje: (e as Error).message });
      return;
    }
    d.corrector.olvidarCache();
    res.json({});
  };
  app.post('/api/correccion/palabra', guardarPalabra((p) => d.diccionario.agregarPalabra(p)));
  app.post('/api/correccion/excepcion', guardarPalabra((p) => d.diccionario.agregarExcepcion(p)));

  app.post('/api/latido', (_req, res) => { d.vigia.latido(); res.json({}); });

  app.use('/api', (_req, res) => { res.status(404).json({ mensaje: 'Ruta desconocida.' }); });
  app.use(express.static(d.dirEstaticos));

  const alFallar: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof RutaInvalida) res.status(400).json({ mensaje: error.message });
    else if (error instanceof ArchivoProtegido) res.status(423).json({ mensaje: error.message });
    else if (error?.code === 'ENOENT') res.status(404).json({ mensaje: 'El archivo no existe.' });
    else if (error?.type === 'entity.parse.failed') res.status(400).json({ mensaje: 'Pedido mal formado.' });
    else res.status(500).json({ mensaje: String(error?.message ?? 'Error interno del editor.') });
  };
  app.use(alFallar);

  return app;
}
