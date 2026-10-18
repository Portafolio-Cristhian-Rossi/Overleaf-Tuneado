import fs from 'node:fs/promises';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import type { Config, Proyecto } from '../compartido/tipos';
import { ArchivoProtegido, RutaInvalida, type Archivos } from './archivos';
import type { Segmento } from '../compartido/prosa';
import type { Compilador } from './compilar';
import type { Diccionario } from './diccionario';
import type { Git } from './git';
import { GuiaInvalida, type Guia } from './guia';
import type { Imagenes } from './imagenes';
import type { Corrector } from './languagetool';
import type { Referencias } from './referencias';
import { HallazgoDesconocido, type Verificaciones } from './verificaciones';
import type { Verificador } from './verificador';
import type { Vigia } from './vigia';
import type { Zotero } from './zotero';

export interface Dependencias {
  config: Config; archivos: Archivos; proyecto: () => Promise<Proyecto>;
  git: Git; compilador: Compilador; vigia: Vigia;
  corrector: Corrector; diccionario: Diccionario; guia: Guia; imagenes: Imagenes; referencias: Referencias; zotero: Zotero;
  verificador: Verificador; verificaciones: Verificaciones;
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

const PEDIDO_MAL_FORMADO = { mensaje: 'Pedido mal formado.' };
const MAXIMO_DE_PARRAFOS = 2000;
const LIMITE_DE_IMAGEN = '20mb';
const MAXIMO_DE_BIBTEX = 200000;

const alRepetirDe = (cuerpo: any): 'preguntar' | 'renombrar' => (cuerpo?.alRepetir === 'renombrar' ? 'renombrar' : 'preguntar');

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

  app.get('/api/imagen', async (req, res) => {
    const ruta = String(req.query.ruta ?? '');
    const imagen = await d.imagenes.resolver(ruta);
    if (imagen === null) {
      res.status(404).json({ mensaje: `No se encuentra ${ruta}` });
      return;
    }
    res.set('Cache-Control', 'no-store').type(imagen.tipo).send(await fs.readFile(imagen.absoluta));
  });
  app.get('/api/imagenes', async (_req, res) => { res.json(await d.imagenes.listar()); });
  // El cuerpo es el archivo tal cual. Va en la misma cola que Git: una imagen no aparece en medio de un Traer.
  app.post('/api/imagenes', express.raw({ type: () => true, limit: LIMITE_DE_IMAGEN }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ mensaje: 'Pedido de subida mal formado.' });
      return;
    }
    const cuerpo = req.body;
    const r = await enSerie(() => d.imagenes.guardar(String(req.query.nombre ?? ''), cuerpo));
    if (r.tipo === 'ok') res.status(201).json({ ruta: r.ruta });
    else if (r.tipo === 'existe') res.status(409).json({ ruta: r.ruta, sugerido: r.sugerido });
    else res.status(400).json({ mensaje: r.mensaje });
  });

  // Agrega al final de referencias.bib. Va en la cola de Git y de los guardados: el archivo no
  // cambia en medio de un Traer. Un texto que no es una referencia se responde, no es un error.
  app.post('/api/referencias', async (req, res) => {
    const bibtex = req.body?.bibtex;
    if (typeof bibtex !== 'string' || bibtex.length > MAXIMO_DE_BIBTEX) {
      res.status(400).json({ mensaje: 'Pedido mal formado.' });
      return;
    }
    res.json(await enSerie(() => d.referencias.agregar(bibtex, alRepetirDe(req.body))));
  });

  // Zotero se lee, nunca se escribe. Citar un ítem es pedirle su BibTeX y agregarlo al .bib.
  app.get('/api/zotero/items', async (_req, res) => { res.json(await d.zotero.items()); });
  app.post('/api/zotero/citar', async (req, res) => {
    const { biblioteca, item } = req.body ?? {};
    if (typeof biblioteca !== 'string' || typeof item !== 'string') {
      res.status(400).json({ mensaje: 'Pedido mal formado.' });
      return;
    }
    const bibtex = await d.zotero.bibtex(biblioteca, item);
    if (bibtex === null) {
      res.json({ tipo: 'invalido', mensaje: 'Zotero ya no tiene ese ítem, o no respondió. Actualizá la búsqueda y probá de nuevo.' });
      return;
    }
    res.json(await enSerie(() => d.referencias.agregar(bibtex, alRepetirDe(req.body))));
  });

  app.get('/api/correccion/estado', (_req, res) => { res.json(d.corrector.estado()); });
  app.get('/api/correccion/diccionario', async (_req, res) => { res.json(await d.diccionario.leer()); });
  app.post('/api/correccion/revisar', async (req, res) => {
    const parrafos = req.body?.parrafos;
    if (!sonParrafos(parrafos)) {
      res.status(400).json({ mensaje: 'Pedido de revisión mal formado.' });
      return;
    }
    res.json(await d.corrector.revisarVarios(parrafos));
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

  // La guía de estilo que acompaña a cada prompt. El editor no llama a ninguna IA.
  app.get('/api/ia/guia', async (_req, res) => { res.json({ texto: await d.guia.leer() }); });
  app.put('/api/ia/guia', async (req, res) => { await d.guia.guardar(req.body?.texto); res.json({}); });

  // El verificador compara el informe con el repositorio de la aplicación; no escribe en ninguno.
  // Iniciar responde enseguida: la corrida sigue sola y el cliente la consulta con GET.
  app.get('/api/verificacion', async (_req, res) => {
    res.json({ estado: await d.verificador.estado(), corrida: await d.verificaciones.ultima(), ignorados: await d.verificaciones.ignorados() });
  });
  app.post('/api/verificacion', async (req, res) => {
    const { alcance, ruta } = req.body ?? {};
    if ((alcance !== 'capitulo' && alcance !== 'todo') || (ruta !== undefined && typeof ruta !== 'string')) {
      res.status(400).json(PEDIDO_MAL_FORMADO);
      return;
    }
    const r = await d.verificador.iniciar(alcance, ruta ?? null);
    if (r.tipo === 'ok') res.status(202).json({});
    else if (r.tipo === 'ocupado') res.status(409).json({ mensaje: 'Ya hay una verificación en curso.' });
    else res.status(400).json({ mensaje: r.mensaje });
  });
  app.post('/api/verificacion/cancelar', (_req, res) => { d.verificador.cancelar(); res.json({}); });
  const sobreHallazgo = (actuar: (id: string) => Promise<void>): RequestHandler => async (req, res) => {
    const id = req.body?.id;
    if (typeof id !== 'string') {
      res.status(400).json(PEDIDO_MAL_FORMADO);
      return;
    }
    await actuar(id);
    res.json({});
  };
  app.post('/api/verificacion/resuelto', sobreHallazgo((id) => d.verificaciones.marcarResuelto(id)));
  app.post('/api/verificacion/ignorar', sobreHallazgo((id) => d.verificaciones.ignorar(id)));
  app.post('/api/verificacion/recuperar', sobreHallazgo((id) => d.verificaciones.recuperar(id)));

  app.post('/api/latido', (_req, res) => { d.vigia.latido(); res.json({}); });

  app.use('/api', (_req, res) => { res.status(404).json({ mensaje: 'Ruta desconocida.' }); });
  app.use(express.static(d.dirEstaticos));

  const alFallar: ErrorRequestHandler = (error, req, res, _next) => {
    if (error instanceof RutaInvalida || error instanceof GuiaInvalida) res.status(400).json({ mensaje: error.message });
    else if (error?.type === 'entity.too.large') {
      res.status(413).json({ mensaje: req.path === '/api/imagenes' ? 'La imagen supera los 20 MB.' : 'El pedido es demasiado grande.' });
    }
    else if (error instanceof HallazgoDesconocido) res.status(404).json({ mensaje: 'Ese hallazgo ya no está en la última corrida.' });
    else if (error instanceof ArchivoProtegido) res.status(423).json({ mensaje: error.message });
    else if (error?.code === 'ENOENT') res.status(404).json({ mensaje: 'El archivo no existe.' });
    else if (error?.type === 'entity.parse.failed') res.status(400).json({ mensaje: 'Pedido mal formado.' });
    else res.status(500).json({ mensaje: String(error?.message ?? 'Error interno del editor.') });
  };
  app.use(alFallar);

  return app;
}
