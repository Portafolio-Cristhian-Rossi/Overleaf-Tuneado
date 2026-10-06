import fs from 'node:fs/promises';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import type { Config, Proyecto } from '../compartido/tipos';
import { RutaInvalida, type Archivos } from './archivos';
import type { Compilador } from './compilar';
import type { Git } from './git';
import type { Vigia } from './vigia';

export interface Dependencias {
  config: Config; archivos: Archivos; proyecto: () => Promise<Proyecto>;
  git: Git; compilador: Compilador; vigia: Vigia;
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

export function crearApp(d: Dependencias): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', soloEsteEquipo);
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/salud', (_req, res) => { res.json({ app: 'editor-informe' }); });
  app.get('/api/config', (_req, res) => {
    res.json({ compilarAlGuardar: d.config.compilarAlGuardar, principal: d.config.principal });
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
    const r = await d.archivos.escribir(ruta, { contenido, finDeLinea, bom, versionBase, forzar: forzar === true });
    res.status(r.tipo === 'ok' ? 200 : r.tipo === 'cambio-en-disco' ? 409 : 410).json(r);
  });

  app.get('/api/git/estado', async (_req, res) => { res.json(await d.git.estado()); });
  app.post('/api/git/traer', async (_req, res) => { res.json(await d.git.traer()); });
  app.post('/api/git/enviar', async (_req, res) => { res.json(await d.git.enviar()); });
  app.post('/api/git/terminar', async (_req, res) => { res.json(await d.git.terminarCombinacion()); });
  app.post('/api/git/cancelar', async (_req, res) => { await d.git.cancelarCombinacion(); res.json({}); });
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

  app.post('/api/latido', (_req, res) => { d.vigia.latido(); res.json({}); });

  app.use('/api', (_req, res) => { res.status(404).json({ mensaje: 'Ruta desconocida.' }); });
  app.use(express.static(d.dirEstaticos));

  const alFallar: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof RutaInvalida) res.status(400).json({ mensaje: error.message });
    else if (error?.code === 'ENOENT') res.status(404).json({ mensaje: 'El archivo no existe.' });
    else if (error?.type === 'entity.parse.failed') res.status(400).json({ mensaje: 'Pedido mal formado.' });
    else res.status(500).json({ mensaje: String(error?.message ?? 'Error interno del editor.') });
  };
  app.use(alFallar);

  return app;
}
