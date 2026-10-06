import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { DIR_FIXTURE, copiarFixture, dirTemporal } from '../pruebas/ayudas/temporales';
import { RutaInvalida, codificar, crearArchivos, decodificar, versionDe, type Archivos } from './archivos';

// Solo lectura: el informe real, si está, nunca se escribe desde las pruebas.
const DIR_INFORME_REAL = path.resolve(import.meta.dirname, '../../informe');

function archivosDeTexto(...dirs: string[]): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(ruta);
      else if (/\.(tex|bib|cls)$/.test(e.name)) salida.push(ruta);
    }
  };
  for (const dir of dirs) if (fs.existsSync(dir)) recorrer(dir);
  return salida;
}

function idaYVuelta(bytes: Buffer): Buffer {
  const d = decodificar(bytes);
  return codificar(d.contenido, d.finDeLinea, d.bom);
}

describe('fidelidad', () => {
  it.each(archivosDeTexto(DIR_FIXTURE, DIR_INFORME_REAL))('%s vuelve idéntico', (ruta) => {
    const bytes = fs.readFileSync(ruta);
    expect(idaYVuelta(bytes).equals(bytes)).toBe(true);
  });

  it.each([
    ['CRLF', 'a\r\nb\r\n'],
    ['LF', 'a\nb\n'],
    ['sin salto final', 'a\r\nb'],
    ['espacios al final', 'a  \r\n\tb \r\n'],
    ['vacío', ''],
    ['tildes', 'análisis ñ\n'],
    ['líneas en blanco', '\r\n\r\na\r\n\r\n'],
  ])('%s vuelve idéntico', (_nombre, texto) => {
    const bytes = Buffer.from(texto, 'utf8');
    expect(idaYVuelta(bytes).equals(bytes)).toBe(true);
  });

  it('conserva el BOM', () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a\n')]);
    const d = decodificar(bytes);
    expect(d.bom).toBe(true);
    expect(d.contenido).toBe('a\n');
    expect(codificar(d.contenido, d.finDeLinea, d.bom).equals(bytes)).toBe(true);
  });

  it('entrega el contenido solo con \\n', () => {
    expect(decodificar(Buffer.from('a\r\nb\r\n'))).toMatchObject({ contenido: 'a\nb\n', finDeLinea: '\r\n', bom: false });
  });

  it('con fines mezclados elige el más frecuente', () => {
    expect(decodificar(Buffer.from('a\r\nb\r\nc\n')).finDeLinea).toBe('\r\n');
    expect(decodificar(Buffer.from('a\nb\nc\r\n')).finDeLinea).toBe('\n');
  });

  it('sin saltos de línea usa \\n', () => {
    expect(decodificar(Buffer.from('hola')).finDeLinea).toBe('\n');
  });

  it('la versión cambia cuando cambian los bytes', () => {
    expect(versionDe(Buffer.from('a'))).toMatch(/^[0-9a-f]{40}$/);
    expect(versionDe(Buffer.from('a'))).not.toBe(versionDe(Buffer.from('b')));
  });
});

describe('crearArchivos', () => {
  let dir: string;
  let a: Archivos;
  const ruta = () => path.join(dir, 'Cap1.tex');

  beforeEach(() => {
    dir = dirTemporal();
    copiarFixture(dir);
    fs.mkdirSync(path.join(dir, '.git'));
    fs.writeFileSync(path.join(dir, '.git', 'config'), 'x');
    a = crearArchivos(dir);
  });

  it('lee el contenido normalizado y la versión del disco', async () => {
    const leido = await a.leer('Cap1.tex');
    expect(leido.contenido.startsWith('\\chapter{Introducción}\n')).toBe(true);
    expect(leido.contenido).not.toContain('\r');
    expect(leido.version).toBe(versionDe(fs.readFileSync(ruta())));
  });

  it('escribe cuando versionBase coincide y devuelve la versión nueva', async () => {
    const leido = await a.leer('Cap1.tex');
    const r = await a.escribir('Cap1.tex', { ...leido, contenido: leido.contenido + 'Nuevo.\n', versionBase: leido.version });
    const enDisco = fs.readFileSync(ruta());
    expect(r).toEqual({ tipo: 'ok', version: versionDe(enDisco) });
    expect(enDisco.toString('utf8').endsWith('Nuevo.' + leido.finDeLinea)).toBe(true);
  });

  it('escribir sin editar deja los mismos bytes', async () => {
    const antes = fs.readFileSync(ruta());
    const leido = await a.leer('Cap1.tex');
    await a.escribir('Cap1.tex', { ...leido, versionBase: leido.version });
    expect(fs.readFileSync(ruta()).equals(antes)).toBe(true);
  });

  it('devuelve cambio-en-disco, sin escribir, si el archivo cambió', async () => {
    const leido = await a.leer('Cap1.tex');
    fs.writeFileSync(ruta(), 'otro contenido\n');
    const r = await a.escribir('Cap1.tex', { ...leido, contenido: 'mío\n', versionBase: leido.version });
    expect(r.tipo).toBe('cambio-en-disco');
    if (r.tipo === 'cambio-en-disco') expect(r.actual.contenido).toBe('otro contenido\n');
    expect(fs.readFileSync(ruta(), 'utf8')).toBe('otro contenido\n');
  });

  it('con forzar sobrescribe aunque haya cambiado', async () => {
    const leido = await a.leer('Cap1.tex');
    fs.writeFileSync(ruta(), 'otro contenido\n');
    const r = await a.escribir('Cap1.tex', { ...leido, contenido: 'mío\n', finDeLinea: '\n', versionBase: leido.version, forzar: true });
    expect(r.tipo).toBe('ok');
    expect(fs.readFileSync(ruta(), 'utf8')).toBe('mío\n');
  });

  it('devuelve desaparecido y no recrea el archivo si fue borrado', async () => {
    const leido = await a.leer('Cap1.tex');
    fs.rmSync(ruta());
    const r = await a.escribir('Cap1.tex', { ...leido, versionBase: leido.version, forzar: true });
    expect(r.tipo).toBe('desaparecido');
    expect(fs.existsSync(ruta())).toBe(false);
  });

  it.each(['../fuera.tex', 'a/../../fuera.tex', '.git/config', 'C:/Windows/x.tex', '/etc/x.tex', ''])('rechaza leer %j', async (r) => {
    await expect(a.leer(r)).rejects.toBeInstanceOf(RutaInvalida);
  });

  it('rechaza escribir fuera del informe', async () => {
    const datos = { contenido: 'x', finDeLinea: '\n' as const, bom: false, versionBase: '' };
    await expect(a.escribir('../fuera.tex', datos)).rejects.toBeInstanceOf(RutaInvalida);
  });

  it('rechaza escribir prgrado.cls y una imagen', async () => {
    const datos = { contenido: 'x', finDeLinea: '\n' as const, bom: false, versionBase: '' };
    await expect(a.escribir('prgrado.cls', datos)).rejects.toBeInstanceOf(RutaInvalida);
    await expect(a.escribir('figs/logo.png', datos)).rejects.toBeInstanceOf(RutaInvalida);
  });

  it('permite leer y escribir el .bib', async () => {
    const leido = await a.leer('referencias.bib');
    const r = await a.escribir('referencias.bib', { ...leido, versionBase: leido.version });
    expect(r.tipo).toBe('ok');
  });

  it('lee un archivo en una subcarpeta', async () => {
    fs.mkdirSync(path.join(dir, 'caps'));
    fs.writeFileSync(path.join(dir, 'caps', 'x.tex'), 'hola\n');
    expect((await a.leer('caps/x.tex')).contenido).toBe('hola\n');
  });
});
