import { spawn } from 'node:child_process';
import path from 'node:path';
import { crearApp } from './app';
import { crearArchivos } from './archivos';
import { crearCompilador } from './compilar';
import { cargarConfig } from './config';
import { crearGit } from './git';
import { describirProyecto } from './proyecto';
import { crearVigia } from './vigia';

const DIR_EDITOR = path.resolve(import.meta.dirname, '..');
const LIMITE_SIN_PESTANAS_MS = 10 * 60 * 1000;
const INTERVALO_DE_BUSQUEDA_MS = 5 * 60 * 1000;

const config = cargarConfig(DIR_EDITOR);
const git = crearGit(config.informe);
const vigia = crearVigia({ limiteMs: LIMITE_SIN_PESTANAS_MS, ahora: Date.now, alVencer: () => process.exit(0) });

const app = crearApp({
  config,
  archivos: crearArchivos(config.informe),
  proyecto: () => describirProyecto(config.informe, config.principal),
  git,
  compilador: crearCompilador(config),
  vigia,
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
  setInterval(() => vigia.revisar(), 30 * 1000);

  const buscar = () => { git.buscar().catch(() => undefined); };
  git.preparar().catch(() => undefined).then(buscar);
  setInterval(buscar, INTERVALO_DE_BUSQUEDA_MS);
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
