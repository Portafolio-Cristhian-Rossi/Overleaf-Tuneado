import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { dirTemporal } from '../pruebas/ayudas/temporales';
import { crearDiccionario, type Diccionario } from './diccionario';

let archivo: string;
let d: Diccionario;

beforeEach(() => {
  archivo = path.join(dirTemporal(), 'correccion.json');
  d = crearDiccionario(archivo);
});

describe('crearDiccionario', () => {
  it('agregar una palabra crea la carpeta si no existe', async () => {
    const enProyecto = crearDiccionario(path.join(dirTemporal(), 'proyecto', 'correccion.json'));
    await enProyecto.agregarPalabra('LDA');
    expect((await enProyecto.leer()).palabras).toEqual(['LDA']);
  });

  it('sin archivo está vacío y no lo crea por leer', async () => {
    expect(await d.leer()).toEqual({ palabras: [], excepciones: [] });
    expect(fs.existsSync(archivo)).toBe(false);
  });

  it('agrega palabras tal como se escribieron y excepciones en minúsculas, sin repetir', async () => {
    await d.agregarPalabra('BERTopic');
    await d.agregarPalabra('embeddings');
    await d.agregarPalabra('BERTopic');
    await d.agregarExcepcion('Analisis');
    await d.agregarExcepcion('analisis');
    expect(await d.leer()).toEqual({ palabras: ['BERTopic', 'embeddings'], excepciones: ['analisis'] });
    expect(JSON.parse(fs.readFileSync(archivo, 'utf8'))).toEqual({ palabras: ['BERTopic', 'embeddings'], excepciones: ['analisis'] });
  });

  it('otra instancia sobre el mismo archivo ve lo guardado', async () => {
    await d.agregarPalabra('LDA');
    expect((await crearDiccionario(archivo).leer()).palabras).toEqual(['LDA']);
  });

  it.each(['', '   ', 'dos palabras', 'con\nsalto', 'x'.repeat(81)])('rechaza %j', async (palabra) => {
    await expect(d.agregarPalabra(palabra)).rejects.toThrow();
    await expect(d.agregarExcepcion(palabra)).rejects.toThrow();
    expect(fs.existsSync(archivo)).toBe(false);
  });

  it('recorta los espacios de las puntas', async () => {
    await d.agregarPalabra('  Biterm ');
    expect((await d.leer()).palabras).toEqual(['Biterm']);
  });

  it('agregados simultáneos no se pisan', async () => {
    await Promise.all(['a1', 'b2', 'c3', 'd4', 'e5'].map((p) => d.agregarPalabra(p)));
    expect((await d.leer()).palabras).toEqual(['a1', 'b2', 'c3', 'd4', 'e5']);
  });

  // El diccionario es trabajo del usuario: un archivo ilegible no se reemplaza por uno vacío.
  it('si el archivo está dañado, se lee vacío pero no se sobrescribe', async () => {
    fs.writeFileSync(archivo, '{ palabras: [roto');
    expect(await d.leer()).toEqual({ palabras: [], excepciones: [] });
    await expect(d.agregarPalabra('nueva')).rejects.toThrow(/dañado/);
    expect(fs.readFileSync(archivo, 'utf8')).toBe('{ palabras: [roto');
  });

  it('ignora entradas que no son texto', async () => {
    fs.writeFileSync(archivo, JSON.stringify({ palabras: ['bien', 3, null], excepciones: 'no es lista' }));
    expect(await d.leer()).toEqual({ palabras: ['bien'], excepciones: [] });
  });
});
