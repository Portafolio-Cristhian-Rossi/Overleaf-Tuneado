import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { copiarFixture, DIR_FIXTURE, dirTemporal } from '../pruebas/ayudas/temporales';
import { RutaInvalida } from './archivos';
import { crearImagenes, nombreDeImagen, type Imagenes } from './imagenes';

const PNG = fs.readFileSync(path.join(DIR_FIXTURE, 'figs', 'ejemplo.png'));
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PDF = Buffer.from('%PDF-1.4\n');

let informe: string;
let imagenes: Imagenes;
const enFigs = (nombre: string) => path.join(informe, 'figs', nombre);

beforeEach(() => {
  informe = path.join(dirTemporal(), 'informe');
  copiarFixture(informe);
  imagenes = crearImagenes(informe);
});

describe('nombreDeImagen', () => {
  it.each([
    ['Gráfico final (2).PNG', 'Grafico-final-2.png'], ['a b.jpeg', 'a-b.jpeg'], ['../../x.png', 'x.png'],
    ['C:\\fotos\\Foto.JPG', 'Foto.jpg'], ['año_2024.v2.pdf', 'ano_2024.v2.pdf'], ['--raro--.png', 'raro.png'],
    ['.png', null], ['nota.txt', null], ['foto.heic', null], ['sin-extension', null], ['¿?.png', null], ['', null],
  ])('nombreDeImagen(%j) → %j', (entrada, salida) => {
    expect(nombreDeImagen(entrada)).toBe(salida);
  });
});

describe('resolver', () => {
  it('resuelve con y sin extensión', async () => {
    expect(await imagenes.resolver('figs/ejemplo.png')).toEqual({ absoluta: enFigs('ejemplo.png'), tipo: 'image/png' });
    expect(await imagenes.resolver('figs/ejemplo')).toEqual({ absoluta: enFigs('ejemplo.png'), tipo: 'image/png' });
    expect(await imagenes.resolver('figs/no-existe.png')).toBeNull();
    expect(await imagenes.resolver('figs/no-existe')).toBeNull();
  });

  it('sin extensión prefiere el PDF, como pdflatex', async () => {
    fs.writeFileSync(enFigs('ejemplo.pdf'), PDF);
    expect(await imagenes.resolver('figs/ejemplo')).toMatchObject({ tipo: 'application/pdf' });
  });

  it('un nombre con puntos y sin extensión conocida se resuelve agregándola', async () => {
    fs.writeFileSync(enFigs('resultado.v2.jpg'), JPG);
    expect(await imagenes.resolver('figs/resultado.v2')).toMatchObject({ tipo: 'image/jpeg' });
  });

  it('una carpeta no es una imagen', async () => {
    fs.mkdirSync(enFigs('carpeta.png'));
    expect(await imagenes.resolver('figs/carpeta.png')).toBeNull();
  });

  it.each(['../fuera.png', 'figs/../../fuera.png', '.git/x.png', 'C:/Windows/x.png', '/etc/x.png', ''])(
    'rechaza la ruta %j', async (ruta) => {
      await expect(imagenes.resolver(ruta)).rejects.toThrow(RutaInvalida);
    });

  it.each(['main.tex', 'prgrado.cls', 'referencias.bib'])('no sirve %s, que existe pero no es una imagen', async (ruta) => {
    expect(await imagenes.resolver(ruta)).toBeNull();
  });
});

describe('listar', () => {
  it('lista las imágenes de figs/ con sus subcarpetas, ordenadas', async () => {
    fs.mkdirSync(enFigs('cc'));
    fs.writeFileSync(enFigs('cc/by.png'), PNG);
    fs.writeFileSync(enFigs('nota.txt'), 'no es imagen');
    fs.writeFileSync(enFigs('b.pdf'), PDF);
    expect(await imagenes.listar()).toEqual([
      { ruta: 'figs/b.pdf', bytes: PDF.length },
      { ruta: 'figs/cc/by.png', bytes: PNG.length },
      { ruta: 'figs/ejemplo.png', bytes: PNG.length },
    ]);
  });

  it('sin carpeta figs/ la lista está vacía', async () => {
    fs.rmSync(path.join(informe, 'figs'), { recursive: true });
    expect(await imagenes.listar()).toEqual([]);
  });
});

describe('guardar', () => {
  it('guarda con el nombre normalizado', async () => {
    expect(await imagenes.guardar('Mi Gráfico.PNG', PNG)).toEqual({ tipo: 'ok', ruta: 'figs/Mi-Grafico.png' });
    expect(fs.readFileSync(enFigs('Mi-Grafico.png')).equals(PNG)).toBe(true);
  });

  it('acepta JPG y PDF', async () => {
    expect(await imagenes.guardar('foto.jpeg', JPG)).toEqual({ tipo: 'ok', ruta: 'figs/foto.jpeg' });
    expect(await imagenes.guardar('grafico.pdf', PDF)).toEqual({ tipo: 'ok', ruta: 'figs/grafico.pdf' });
  });

  it('nunca sobrescribe, tampoco si cambian las mayúsculas', async () => {
    const antes = fs.readFileSync(enFigs('ejemplo.png'));
    expect(await imagenes.guardar('EJEMPLO.png', Buffer.concat([PNG, PNG]))).toEqual({ tipo: 'existe', ruta: 'figs/ejemplo.png', sugerido: 'EJEMPLO-2.png' });
    expect(fs.readFileSync(enFigs('ejemplo.png')).equals(antes)).toBe(true);
    expect(fs.readdirSync(path.join(informe, 'figs'))).toEqual(['ejemplo.png']);
  });

  it('el nombre sugerido saltea los que ya existen', async () => {
    fs.writeFileSync(enFigs('ejemplo-2.png'), PNG);
    expect(await imagenes.guardar('ejemplo.png', PNG)).toMatchObject({ tipo: 'existe', sugerido: 'ejemplo-3.png' });
  });

  it.each([['vacío', Buffer.alloc(0)], ['de texto', Buffer.from('hola')], ['WebP', Buffer.from('RIFF0000WEBPVP8 ')], ['JPG', JPG]])(
    'rechaza un archivo %s con extensión .png', async (_nombre, bytes) => {
      expect(await imagenes.guardar('foto.png', bytes)).toEqual({ tipo: 'invalido', mensaje: 'El archivo no es una imagen PNG, JPG o PDF válida.' });
      expect(fs.existsSync(enFigs('foto.png'))).toBe(false);
    });

  it('rechaza una extensión no admitida', async () => {
    expect(await imagenes.guardar('foto.gif', PNG)).toEqual({ tipo: 'invalido', mensaje: 'Solo se aceptan imágenes PNG, JPG o PDF.' });
    expect(await imagenes.guardar('', PNG)).toEqual({ tipo: 'invalido', mensaje: 'Solo se aceptan imágenes PNG, JPG o PDF.' });
  });

  it('crea figs/ si no existe', async () => {
    fs.rmSync(path.join(informe, 'figs'), { recursive: true });
    expect(await imagenes.guardar('a.png', PNG)).toEqual({ tipo: 'ok', ruta: 'figs/a.png' });
  });

  it('no escribe fuera de figs/ aunque el nombre traiga una ruta', async () => {
    expect(await imagenes.guardar('../../fuera.png', PNG)).toEqual({ tipo: 'ok', ruta: 'figs/fuera.png' });
    expect(fs.existsSync(path.join(informe, '..', 'fuera.png'))).toBe(false);
  });
});
