import { spawn } from 'node:child_process';
import path from 'node:path';
import { crearApp } from './app';
import { crearArchivos } from './archivos';
import { crearCompilador } from './compilar';
import { cargarConfig } from './config';
import { crearDiccionario } from './diccionario';
import { crearGit } from './git';
import { crearImagenes } from './imagenes';
import { crearCorrector } from './languagetool';
import { describirProyecto } from './proyecto';
import { crearReferencias } from './referencias';
import { crearVigia } from './vigia';

const DIR_EDITOR = path.resolve(import.meta.dirname, '..');
const LIMITE_SIN_PESTANAS_MS = 10 * 60 * 1000;
const INTERVALO_DE_BUSQUEDA_MS = 5 * 60 * 1000;

const config = cargarConfig(DIR_EDITOR);
const git = crearGit(config.informe);
const INTERVALO_DE_REVISION_MS = 30 * 1000;
const vigia = crearVigia({
  limiteMs: LIMITE_SIN_PESTANAS_MS,
  saltoDeSuspensionMs: 4 * INTERVALO_DE_REVISION_MS,
  ahora: Date.now,
  alVencer: () => process.exit(0),
});

// El corrector (LanguageTool) y el diccionario personal viven en editor/, nunca en el informe.
const diccionario = crearDiccionario(path.join(DIR_EDITOR, 'correccion.json'));
const corrector = crearCorrector({
  dir: path.join(DIR_EDITOR, 'languagetool'),
  puerto: config.puertoCorrector,
  diccionario: async () => (await diccionario.leer()).palabras,
});
// Al salir, por la vía que sea, no debe quedar Java corriendo.
process.on('exit', () => corrector.detener());
for (const senal of ['SIGINT', 'SIGTERM'] as const) process.on(senal, () => process.exit(0));

const app = crearApp({
  config,
  archivos: crearArchivos(config.informe),
  proyecto: () => describirProyecto(config.informe, config.principal),
  git,
  compilador: crearCompilador(config),
  vigia,
  corrector,
  diccionario,
  imagenes: crearImagenes(config.informe),
  referencias: crearReferencias(config.informe, async () => (await describirProyecto(config.informe, config.principal)).bibliografia),
  abrirVsCode: () => new Promise<void>((resolver, rechazar) => {
    // `code` es un .cmd en Windows: hay que lanzarlo a través de cmd.
    const proceso = spawn('cmd', ['/c', 'code', config.informe], { stdio: 'ignore', windowsHide: true, detached: true });
    proceso.on('error', rechazar);
    proceso.on('spawn', () => { proceso.unref(); resolver(); });
  }),
  dirEstaticos: path.join(DIR_EDITOR, 'dist'),
});

const servidor = app.listen(config.puerto, '127.0.0.1');

servidor.on('listening', () => {
  console.log(`Editor del informe en http://127.0.0.1:${config.puerto}`);
  console.log(`Informe: ${config.informe}`);
  setInterval(() => vigia.revisar(), INTERVALO_DE_REVISION_MS);

  const buscar = () => { git.buscar().catch(() => undefined); };
  git.verificar().then((problema) => { if (problema) console.error(problema); });
  git.preparar().catch(() => undefined).then(buscar);
  setInterval(buscar, INTERVALO_DE_BUSQUEDA_MS);

  if (config.corrector) void corrector.iniciar();
});

servidor.on('error', async (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EADDRINUSE') throw error;
  // Si quien ocupa el puerto es otra instancia del editor, no hace falta una segunda.
  const esElEditor = await fetch(`http://127.0.0.1:${config.puerto}/api/salud`, { signal: AbortSignal.timeout(2000) })
    .then((r) => r.json())
    .then((cuerpo) => cuerpo?.app === 'editor-informe', () => false);
  if (esElEditor) process.exit(0);
  console.error(`El puerto ${config.puerto} está ocupado por otro programa. Cambialo en config.json.`);
  process.exit(1);
});
