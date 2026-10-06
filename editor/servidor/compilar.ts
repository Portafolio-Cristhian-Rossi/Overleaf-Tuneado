import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Config, ResultadoCompilacion } from '../compartido/tipos';
import { interpretarBlg, interpretarLog } from './logLatex';

export type Ejecutar = (comando: string, args: string[], opciones: { cwd: string; timeoutMs: number })
  => Promise<{ codigo: number | null; vencido: boolean; noEncontrado: boolean }>;

export interface Compilador { compilar(): Promise<ResultadoCompilacion>; rutaPdf(): string }

// La primera compilación puede tardar varios minutos: MiKTeX descarga los paquetes que falten.
const TIEMPO_LIMITE_MS = 600000;
const MAXIMO_DE_CORRIDAS = 4;

const ejecutarProceso: Ejecutar = (comando, args, opciones) =>
  new Promise((resolver) => {
    const proceso = spawn(comando, args, { cwd: opciones.cwd, stdio: 'ignore', windowsHide: true });
    let vencido = false;
    const reloj = setTimeout(() => { vencido = true; proceso.kill(); }, opciones.timeoutMs);
    proceso.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(reloj);
      resolver({ codigo: null, vencido: false, noEncontrado: e.code === 'ENOENT' });
    });
    proceso.on('close', (codigo) => {
      clearTimeout(reloj);
      resolver({ codigo, vencido, noEncontrado: false });
    });
  });

const leer = (ruta: string) => fs.readFile(ruta, 'utf8').catch(() => '');
const modificado = (ruta: string) => fs.stat(ruta).then((s) => s.mtimeMs, () => null);

export function crearCompilador(
  cfg: Pick<Config, 'informe' | 'build' | 'principal'>,
  ejecutar: Ejecutar = ejecutarProceso,
): Compilador {
  const base = path.basename(cfg.principal, path.extname(cfg.principal));
  const enBuild = (extension: string) => path.join(cfg.build, `${base}.${extension}`);
  const rutaPdf = () => enBuild('pdf');

  async function unaCompilacion(): Promise<ResultadoCompilacion> {
    await fs.mkdir(cfg.build, { recursive: true });
    const pdfAntes = await modificado(rutaPdf());

    const pdflatex = () => ejecutar('pdflatex',
      ['-interaction=nonstopmode', '-file-line-error', '-max-print-line=10000', `-output-directory=${cfg.build}`, cfg.principal],
      { cwd: cfg.informe, timeoutMs: TIEMPO_LIMITE_MS });

    let r = await pdflatex();
    if (r.noEncontrado) return { tipo: 'sin-latex' };
    if (r.vencido) return { tipo: 'vencido' };
    let corridas = 1;

    let corrioBibtex = false;
    if ((await leer(enBuild('aux'))).includes('\\bibdata')) {
      r = await ejecutar('bibtex', [`--include-directory=${cfg.informe}`, base], { cwd: cfg.build, timeoutMs: TIEMPO_LIMITE_MS });
      if (r.noEncontrado) return { tipo: 'sin-latex' };
      if (r.vencido) return { tipo: 'vencido' };
      corrioBibtex = true;
    }

    // Tras bibtex hace falta al menos una pasada más; después, las que el log pida.
    let hacePasada = corrioBibtex;
    while (corridas < MAXIMO_DE_CORRIDAS && (hacePasada || (await leer(enBuild('log'))).includes('Rerun to get'))) {
      hacePasada = false;
      r = await pdflatex();
      if (r.vencido) return { tipo: 'vencido' };
      corridas++;
    }

    // Una cita faltante la informan LaTeX (con su línea) y BibTeX (sin ella): se muestra una sola vez.
    const delLog = interpretarLog(await leer(enBuild('log')));
    const yaInformados = new Set(delLog.map((p) => p.mensaje));
    const delBlg = corrioBibtex ? interpretarBlg(await leer(enBuild('blg'))).filter((p) => !yaInformados.has(p.mensaje)) : [];
    const problemas = [...delLog, ...delBlg];
    const pdfDespues = await modificado(rutaPdf());
    return {
      tipo: problemas.some((p) => p.gravedad === 'error') ? 'con-errores' : 'ok',
      problemas,
      pdfActualizado: pdfDespues !== null && pdfDespues !== pdfAntes,
    };
  }

  // Una compilación a la vez; los pedidos que llegan mientras tanto comparten la siguiente.
  let enCurso: Promise<ResultadoCompilacion> | null = null;
  let siguiente: Promise<ResultadoCompilacion> | null = null;

  function compilar(): Promise<ResultadoCompilacion> {
    if (!enCurso) {
      enCurso = unaCompilacion().finally(() => { enCurso = null; });
      return enCurso;
    }
    siguiente ??= enCurso.then(() => undefined, () => undefined).then(() => {
      siguiente = null;
      return compilar();
    });
    return siguiente;
  }

  return { compilar, rutaPdf };
}
