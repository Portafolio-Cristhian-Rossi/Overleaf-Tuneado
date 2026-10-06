import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { copiarFixture, dirTemporal } from '../pruebas/ayudas/temporales';
import { crearCompilador, type Compilador, type Ejecutar } from './compilar';

interface Llamada { comando: string; args: string[]; cwd: string; timeoutMs: number }

const LOG_LIMPIO = 'Output written on main.pdf (1 page).\n';
const LOG_REPETIR = 'LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.\n';
const LOG_ERROR = './Cap2.tex:12: Undefined control sequence.\nl.12 Texto con \\textbff\n';

let informe: string;
let build: string;
let llamadas: Llamada[];
let c: Compilador;
// Lo que el pdflatex y el bibtex falsos harán en las próximas corridas.
let falso: { conBibliografia: boolean; logs: string[]; vence: boolean; noEncontrado: boolean; escribePdf: boolean };
let reloj: number;

// Simula a pdflatex y bibtex: escribe .aux, .log y .pdf donde indique -output-directory.
const ejecutar: Ejecutar = async (comando, args, opciones) => {
  llamadas.push({ comando, args, cwd: opciones.cwd, timeoutMs: opciones.timeoutMs });
  await new Promise((r) => setTimeout(r, 5));
  if (falso.noEncontrado) return { codigo: null, vencido: false, noEncontrado: true };
  if (falso.vence) {
    falso.vence = false;
    return { codigo: null, vencido: true, noEncontrado: false };
  }
  if (comando === 'pdflatex') {
    const salida = args.find((a) => a.startsWith('-output-directory='))?.split('=')[1] ?? opciones.cwd;
    fs.writeFileSync(path.join(salida, 'main.aux'), falso.conBibliografia ? '\\relax\n\\bibdata{referencias}\n' : '\\relax\n');
    fs.writeFileSync(path.join(salida, 'main.log'), falso.logs.shift() ?? LOG_LIMPIO);
    if (falso.escribePdf) {
      const pdf = path.join(salida, 'main.pdf');
      fs.writeFileSync(pdf, '%PDF');
      reloj += 10;
      fs.utimesSync(pdf, reloj, reloj);
    }
  } else {
    fs.writeFileSync(path.join(opciones.cwd, 'main.blg'), 'This is BibTeX\n');
  }
  return { codigo: 0, vencido: false, noEncontrado: false };
};

const listar = (dir: string) => fs.readdirSync(dir, { recursive: true }).map(String).sort();
const corridas = (comando: string) => llamadas.filter((l) => l.comando === comando).length;

beforeEach(() => {
  const raiz = dirTemporal();
  informe = path.join(raiz, 'informe');
  build = path.join(raiz, 'build');
  copiarFixture(informe);
  llamadas = [];
  falso = { conBibliografia: true, logs: [], vence: false, noEncontrado: false, escribePdf: true };
  reloj = 1_700_000_000;
  c = crearCompilador({ informe, build, principal: 'main.tex' }, ejecutar);
});

describe('crearCompilador', () => {
  it('corre pdflatex, bibtex y pdflatex cuando hay bibliografía', async () => {
    const r = await c.compilar();
    expect(r).toEqual({ tipo: 'ok', problemas: [], pdfActualizado: true });
    expect(llamadas.map((l) => l.comando)).toEqual(['pdflatex', 'bibtex', 'pdflatex']);
    expect(llamadas[0].args).toEqual(['-interaction=nonstopmode', '-file-line-error', '-max-print-line=10000', `-output-directory=${build}`, 'main.tex']);
    expect(llamadas[0].cwd).toBe(informe);
    expect(llamadas[1]).toMatchObject({ args: [`--include-directory=${informe}`, 'main'], cwd: build });
    expect(llamadas.every((l) => l.timeoutMs === 600000)).toBe(true);
  });

  it('crea la carpeta de salida si no existe', async () => {
    expect(fs.existsSync(build)).toBe(false);
    await c.compilar();
    expect(fs.existsSync(path.join(build, 'main.pdf'))).toBe(true);
    expect(c.rutaPdf()).toBe(path.join(build, 'main.pdf'));
  });

  it('sin \\bibdata no corre bibtex', async () => {
    falso.conBibliografia = false;
    await c.compilar();
    expect(llamadas.map((l) => l.comando)).toEqual(['pdflatex']);
  });

  it('repite mientras el log pida Rerun', async () => {
    falso.conBibliografia = false;
    falso.logs = [LOG_REPETIR, LOG_LIMPIO];
    await c.compilar();
    expect(corridas('pdflatex')).toBe(2);
  });

  it('nunca pasa de cuatro corridas de pdflatex', async () => {
    falso.logs = Array(10).fill(LOG_REPETIR);
    await c.compilar();
    expect(corridas('pdflatex')).toBe(4);
    expect(corridas('bibtex')).toBe(1);
  });

  it('no escribe nada dentro de informe', async () => {
    const antes = listar(informe);
    await c.compilar();
    expect(listar(informe)).toEqual(antes);
  });

  it('sin pdflatex devuelve sin-latex', async () => {
    falso.noEncontrado = true;
    expect(await c.compilar()).toEqual({ tipo: 'sin-latex' });
  });

  it('una corrida que no termina devuelve vencido y la siguiente compilación funciona', async () => {
    falso.vence = true;
    expect(await c.compilar()).toEqual({ tipo: 'vencido' });
    expect((await c.compilar()).tipo).toBe('ok');
  });

  it('con errores devuelve con-errores y los problemas del log', async () => {
    falso.conBibliografia = false;
    falso.logs = [LOG_ERROR];
    const r = await c.compilar();
    expect(r).toMatchObject({ tipo: 'con-errores', problemas: [{ ruta: 'Cap2.tex', linea: 12, mensaje: 'Comando desconocido: \\textbff' }] });
  });

  it('pdfActualizado es false si el PDF no cambió', async () => {
    falso.conBibliografia = false;
    await c.compilar();
    falso.escribePdf = false;
    falso.logs = [LOG_ERROR];
    expect(await c.compilar()).toMatchObject({ tipo: 'con-errores', pdfActualizado: false });
  });

  it('suma los problemas del .blg', async () => {
    const original = ejecutar;
    const conBlg: Ejecutar = async (comando, args, opciones) => {
      const r = await original(comando, args, opciones);
      if (comando === 'bibtex') fs.writeFileSync(path.join(opciones.cwd, 'main.blg'), 'Warning--I didn\'t find a database entry for "Perez2020"\n');
      return r;
    };
    const r = await crearCompilador({ informe, build, principal: 'main.tex' }, conBlg).compilar();
    expect(r).toMatchObject({ tipo: 'ok', problemas: [{ gravedad: 'advertencia', mensaje: 'La cita Perez2020 no está en la bibliografía' }] });
  });

  it('no repite una cita faltante que el log ya informó con su línea', async () => {
    const aviso = "LaTeX Warning: Citation `Perez2020' undefined on input line 39.\n";
    falso.logs = [aviso, aviso];
    const blg = ['Perez2020', 'Otra2021'].map((clave) => `Warning--I didn't find a database entry for "${clave}"`).join('\n');
    const conBlg: Ejecutar = async (comando, args, opciones) => {
      const r = await ejecutar(comando, args, opciones);
      if (comando === 'bibtex') fs.writeFileSync(path.join(opciones.cwd, 'main.blg'), `${blg}\n`);
      return r;
    };
    const r = await crearCompilador({ informe, build, principal: 'main.tex' }, conBlg).compilar();
    expect(r.tipo === 'ok' && r.problemas.map((p) => [p.mensaje, p.linea])).toEqual([
      ['La cita Perez2020 no está en la bibliografía', 39],
      ['La cita Otra2021 no está en la bibliografía', null],
    ]);
  });

  it('tres pedidos simultáneos producen dos compilaciones', async () => {
    falso.conBibliografia = false;
    const resultados = await Promise.all([c.compilar(), c.compilar(), c.compilar()]);
    expect(corridas('pdflatex')).toBe(2);
    expect(resultados.map((r) => r.tipo)).toEqual(['ok', 'ok', 'ok']);
  });

  it('después de pedidos simultáneos vuelve a compilar con normalidad', async () => {
    falso.conBibliografia = false;
    await Promise.all([c.compilar(), c.compilar()]);
    await c.compilar();
    expect(corridas('pdflatex')).toBe(3);
  });
});
