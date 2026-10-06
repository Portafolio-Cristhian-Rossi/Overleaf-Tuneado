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
    expect(p.mensaje).toBe('Carácter no soportado: «“» (U+201C). Suele aparecer al copiar y pegar desde Word o un PDF; reemplazalo por el equivalente común');
  });

  // Un carácter invisible entre comillas no le dice nada a nadie: se nombra por su código.
  it.each([
    ['200B', 'espacio de ancho cero'],
    ['202F', 'espacio estrecho sin separación'],
    ['FEFF', 'marca de orden de bytes'],
    ['2063', 'carácter invisible'],
  ])('carácter invisible U+%s', (codigo, nombre) => {
    const caracter = String.fromCodePoint(parseInt(codigo, 16));
    const [p] = interpretarLog(`./Cap1.tex:5: LaTeX Error: Unicode character ${caracter} (U+${codigo})\n`);
    expect(p.mensaje).toBe(`Carácter invisible no soportado (U+${codigo}, ${nombre}). Suele aparecer al copiar y pegar desde la web o un PDF; borrá ese tramo y volvé a escribirlo`);
  });

  it('referencia y cita inexistentes, sin duplicar', () => {
    expect(interpretarLog(log('referencias.log'))).toEqual([
      { gravedad: 'advertencia', ruta: null, linea: 11, mensaje: 'La referencia sec:nada no existe', original: expect.stringContaining('Reference') },
      { gravedad: 'advertencia', ruta: null, linea: 8, mensaje: 'La cita Perez2020 no está en la bibliografía', original: expect.stringContaining('Citation') },
    ]);
  });

  // El compilador pide a TeX líneas largas (-max-print-line), así que el log no llega cortado:
  // cada línea se interpreta sola, tenga el largo que tenga.
  it('una línea de 79 columnas no se pega a la siguiente', () => {
    const relleno = `(${'x'.repeat(77)})`;
    expect(relleno).toHaveLength(79);
    expect(interpretarLog(`${relleno}\n./Cap2.tex:12: Missing $ inserted.\n`)).toEqual([
      expect.objectContaining({ ruta: 'Cap2.tex', linea: 12, mensaje: 'Hay un símbolo matemático fuera de una ecuación' }),
    ]);
  });

  it('una advertencia larga en una sola línea se lee entera', () => {
    expect(interpretarLog("LaTeX Warning: Reference `sec:una_etiqueta_bastante_larga_de_verdad' on page 12 undefined on input line 123.\n")).toEqual([
      expect.objectContaining({ mensaje: 'La referencia sec:una_etiqueta_bastante_larga_de_verdad no existe', linea: 123 }),
    ]);
  });

  it('la cita sin página, como la informa apacite', () => {
    expect(interpretarLog("LaTeX Warning: Citation `NadieNunca' undefined on input line 39.\n")).toEqual([
      expect.objectContaining({ gravedad: 'advertencia', mensaje: 'La cita NadieNunca no está en la bibliografía', linea: 39 }),
    ]);
  });

  it('archivo de imagen faltante, como lo informa pdftex.def', () => {
    expect(interpretarLog("./Cap3.tex:41: Package pdftex.def Error: File `figs/no-existe.png' not found: using draft setting.\n")[0])
      .toMatchObject({ ruta: 'Cap3.tex', linea: 41, mensaje: 'No se encontró el archivo figs/no-existe.png' });
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
