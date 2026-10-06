import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { interpretarBlg, interpretarLog } from './logLatex';

const log = (nombre: string) =>
  fs.readFileSync(path.resolve(import.meta.dirname, '../pruebas/fixtures/logs', nombre), 'utf8');

describe('interpretarLog', () => {
  it('comando desconocido', () => {
    expect(interpretarLog(log('comando.log'))).toEqual([{
      gravedad: 'error', ruta: 'Cap2.tex', linea: 12,
      mensaje: 'Comando desconocido: \\textbff', original: 'Undefined control sequence.',
    }]);
  });

  it.each([
    ['llave.log', 'Falta cerrar una llave }', 'Cap2.tex', 14],
    ['imagen.log', 'No se encontró el archivo figs/grafico.png', 'Cap3.tex', 5],
    ['entorno.log', 'Entorno desconocido: tabla', 'Cap3.tex', 9],
    ['matematica.log', 'Hay un símbolo matemático fuera de una ecuación', 'Cap3.tex', 11],
  ])('%s → %s', (archivo, mensaje, ruta, linea) => {
    const problemas = interpretarLog(log(archivo));
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatchObject({ gravedad: 'error', mensaje, ruta, linea });
  });

  it.each([
    ['./a.tex:3: Missing } inserted.', 'Falta cerrar una llave }'],
    ['./a.tex:3: File ended while scanning use of \\textbf.', 'Falta cerrar una llave }'],
    ['./a.tex:3: Extra }, or forgotten $.', 'Sobra una llave } o falta un $'],
  ])('%s', (linea, mensaje) => {
    expect(interpretarLog(linea + '\n')[0]).toMatchObject({ ruta: 'a.tex', linea: 3, mensaje });
  });

  it('carácter pegado desde Word', () => {
    const [p] = interpretarLog(log('unicode.log'));
    expect(p).toMatchObject({ gravedad: 'error', ruta: 'Cap1.tex', linea: 5 });
    expect(p.mensaje).toBe('Carácter no soportado: «“». Suele aparecer al copiar y pegar desde Word o un PDF; reemplazalo por el equivalente común');
  });

  it('referencia y cita inexistentes, sin duplicar', () => {
    expect(interpretarLog(log('referencias.log'))).toEqual([
      { gravedad: 'advertencia', ruta: null, linea: 11, mensaje: 'La referencia sec:nada no existe', original: expect.stringContaining('Reference') },
      { gravedad: 'advertencia', ruta: null, linea: 8, mensaje: 'La cita Perez2020 no está en la bibliografía', original: expect.stringContaining('Citation') },
    ]);
  });

  it('une una advertencia cortada en la columna 79', () => {
    expect(interpretarLog(log('envuelto.log'))).toEqual([
      expect.objectContaining({ mensaje: 'La referencia sec:una_etiqueta_bastante_larga no existe', linea: 123 }),
    ]);
  });

  it('un error no reconocido conserva el mensaje original', () => {
    expect(interpretarLog(log('desconocido.log'))).toEqual([{
      gravedad: 'error', ruta: 'Cap2.tex', linea: 30,
      mensaje: 'LaTeX Error: Something nobody has translated yet.',
      original: 'LaTeX Error: Something nobody has translated yet.',
    }]);
  });

  it('log sin problemas devuelve lista vacía', () => {
    expect(interpretarLog(log('limpio.log'))).toEqual([]);
    expect(interpretarLog('')).toEqual([]);
  });

  it('normaliza rutas de Windows y con subcarpeta', () => {
    expect(interpretarLog('.\\caps\\a.tex:7: Missing $ inserted.\n')[0]).toMatchObject({ ruta: 'caps/a.tex', linea: 7 });
    expect(interpretarLog('main.tex:2: Missing $ inserted.\n')[0]).toMatchObject({ ruta: 'main.tex', linea: 2 });
  });
});

describe('interpretarBlg', () => {
  it('entrada faltante', () => {
    expect(interpretarBlg(log('falta-entrada.blg'))).toEqual([{
      gravedad: 'advertencia', ruta: null, linea: null,
      mensaje: 'La cita Perez2020 no está en la bibliografía',
      original: 'Warning--I didn\'t find a database entry for "Perez2020"',
    }]);
  });

  it('base de datos que no abre', () => {
    expect(interpretarBlg(log('sin-base.blg'))[0]).toMatchObject({
      gravedad: 'error', mensaje: 'No se encontró el archivo referencias.bib',
    });
  });

  it('blg sin problemas', () => {
    expect(interpretarBlg('This is BibTeX\nDatabase file #1: referencias.bib\n')).toEqual([]);
  });
});
