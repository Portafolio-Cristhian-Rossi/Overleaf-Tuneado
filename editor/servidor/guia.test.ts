import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { GUIA_INICIAL } from '../compartido/prompt';
import { dirTemporal } from '../pruebas/ayudas/temporales';
import { crearGuia, type Guia } from './guia';

let archivo: string;
let g: Guia;

beforeEach(() => {
  archivo = path.join(dirTemporal(), 'guia-estilo.md');
  g = crearGuia(archivo);
});

describe('crearGuia', () => {
  it('sin archivo devuelve la guía inicial y no lo crea por leer', async () => {
    expect(await g.leer()).toBe(GUIA_INICIAL);
    expect(fs.existsSync(archivo)).toBe(false);
  });

  it('guarda y vuelve a leer lo guardado', async () => {
    await g.guardar('Tercera persona.\n\nPretérito.\n');
    expect(await g.leer()).toBe('Tercera persona.\n\nPretérito.\n');
    expect(fs.readFileSync(archivo, 'utf8')).toBe('Tercera persona.\n\nPretérito.\n');
  });

  it('lee con \\n un archivo que alguien guardó con CRLF o con BOM', async () => {
    fs.writeFileSync(archivo, '﻿Uno.\r\nDos.\r\n');
    expect(await g.leer()).toBe('Uno.\nDos.\n');
  });

  it('una guía vacía o en blanco vuelve a ser la inicial', async () => {
    await g.guardar('Algo.');
    await g.guardar('  \n\n');
    expect(await g.leer()).toBe(GUIA_INICIAL);
  });

  it('no deja el archivo temporal', async () => {
    await g.guardar('Algo.');
    expect(fs.readdirSync(path.dirname(archivo))).toEqual(['guia-estilo.md']);
  });

  it.each([
    ['no es texto', 42],
    ['falta', undefined],
    ['es demasiado larga', 'x'.repeat(20001)],
  ])('rechaza una guía que %s y no toca la que había', async (_caso, valor) => {
    await g.guardar('La buena.');
    await expect(g.guardar(valor)).rejects.toThrow(/guía/);
    expect(await g.leer()).toBe('La buena.');
  });

  it('dos guardados seguidos no se pisan: queda el último', async () => {
    await Promise.all([g.guardar('Primera.'), g.guardar('Segunda.')]);
    expect(await g.leer()).toBe('Segunda.');
  });
});
