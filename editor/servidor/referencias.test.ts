import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { analizarBib } from '../compartido/bib';
import { copiarFixture, dirTemporal } from '../pruebas/ayudas/temporales';
import { crearReferencias, type Referencias } from './referencias';

const PHAM = '@inproceedings{pham_topicgpt_2024,\n\ttitle = {{TopicGPT}: {A} {Prompt}-based {Topic} {Modeling} {Framework}},\n'
  + '\tdoi = {10.18653/v1/2024.naacl-long.164},\n\tauthor = {Pham, Chau Minh and Hoyle, Alexander},\n\tyear = {2024},\n}';

let informe: string;
let bib: string;
let referencias: Referencias;
const leer = () => fs.readFileSync(bib, 'utf8');
const claves = () => analizarBib(leer().replace(/\r\n/g, '\n')).entradas.map((e) => e.clave);

beforeEach(() => {
  informe = path.join(dirTemporal(), 'informe');
  copiarFixture(informe);
  bib = path.join(informe, 'referencias.bib');
  referencias = crearReferencias(informe, async () => 'referencias.bib');
});

describe('agregar referencias', () => {
  it('agrega al final y no cambia ningún byte anterior', async () => {
    const antes = fs.readFileSync(bib);
    expect(await referencias.agregar(PHAM, 'preguntar')).toEqual({ tipo: 'ok', referencias: [{ tipo: 'agregada', clave: 'pham_topicgpt_2024', advertencias: [] }] });
    const despues = fs.readFileSync(bib);
    expect(despues.length).toBeGreaterThan(antes.length);
    expect(despues.subarray(0, antes.length).equals(antes)).toBe(true);
    expect(claves().at(-1)).toBe('pham_topicgpt_2024');
    expect(claves()).toHaveLength(6);
  });

  it.each([['CRLF', '\r\n'], ['LF', '\n']])('respeta un archivo en %s', async (_nombre, fin) => {
    fs.writeFileSync(bib, `@misc{a, title = {x}}${fin}`);
    await referencias.agregar(PHAM, 'preguntar');
    expect(leer()).toBe(`@misc{a, title = {x}}${fin}${fin}${PHAM.replace(/\n/g, fin)}${fin}`);
  });

  it('un archivo sin salto final queda bien formado', async () => {
    fs.writeFileSync(bib, '@misc{a, title = {x}}');
    await referencias.agregar(PHAM, 'preguntar');
    expect(leer()).toBe(`@misc{a, title = {x}}\n\n${PHAM}\n`);
  });

  it('un archivo vacío', async () => {
    fs.writeFileSync(bib, '');
    await referencias.agregar(PHAM, 'preguntar');
    expect(leer()).toBe(`${PHAM}\n`);
  });

  it('conserva el BOM si lo había y no agrega otro', async () => {
    const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('@misc{a, title = {x}}\n')]);
    fs.writeFileSync(bib, original);
    await referencias.agregar(PHAM, 'preguntar');
    const despues = fs.readFileSync(bib);
    expect(despues.subarray(0, original.length).equals(original)).toBe(true);
    expect(despues.subarray(original.length).includes(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
  });

  it('las tildes se escriben en UTF-8', async () => {
    await referencias.agregar('@misc{rosa_2020, author = {Rosá, Aiala}, title = {Extracción}, year = {2020}}', 'preguntar');
    expect(leer()).toContain('author = {Rosá, Aiala}, title = {Extracción}');
  });

  it('si no hay nada que agregar, no toca el archivo', async () => {
    await referencias.agregar(PHAM, 'preguntar');
    const antes = fs.readFileSync(bib);
    const marca = fs.statSync(bib).mtimeMs;
    await new Promise((r) => setTimeout(r, 30));
    expect(await referencias.agregar(PHAM, 'preguntar')).toMatchObject({ referencias: [{ tipo: 'ya-estaba', clave: 'pham_topicgpt_2024' }] });
    expect(await referencias.agregar('nada', 'preguntar')).toMatchObject({ tipo: 'invalido' });
    expect(fs.readFileSync(bib).equals(antes)).toBe(true);
    expect(fs.statSync(bib).mtimeMs).toBe(marca);
  });

  it('con clave repetida pregunta sin escribir, y al renombrar agrega con la clave nueva', async () => {
    const otro = '@book{CitekeyBook, title = {Otro libro distinto}, year = {1999}}';
    const antes = fs.readFileSync(bib);
    expect(await referencias.agregar(otro, 'preguntar')).toEqual({ tipo: 'ok', referencias: [{ tipo: 'clave-repetida', clave: 'CitekeyBook', sugerida: 'CitekeyBook-2' }] });
    expect(fs.readFileSync(bib).equals(antes)).toBe(true);
    expect(await referencias.agregar(otro, 'renombrar')).toMatchObject({ referencias: [{ tipo: 'agregada', clave: 'CitekeyBook-2' }] });
    expect(claves().at(-1)).toBe('CitekeyBook-2');
  });

  it('se niega ante un archivo en Latin-1 o con fines de línea mezclados', async () => {
    for (const bytes of [Buffer.from('@misc{a, title = {an\xe1lisis}}\n', 'latin1'), Buffer.from('@misc{a,\r\n title = {x}}\n')]) {
      fs.writeFileSync(bib, bytes);
      expect(await referencias.agregar(PHAM, 'preguntar')).toEqual({
        tipo: 'invalido', mensaje: 'referencias.bib no está en UTF-8 o mezcla fines de línea: no se puede modificar desde el editor sin dañarlo.',
      });
      expect(fs.readFileSync(bib).equals(bytes)).toBe(true);
    }
  });

  it('sin archivo de referencias lo explica', async () => {
    const sin = crearReferencias(informe, async () => null);
    expect(await sin.agregar(PHAM, 'preguntar')).toEqual({
      tipo: 'invalido', mensaje: 'El informe no tiene un archivo de referencias. Agregá \\bibliography{referencias} a main.tex.',
    });
  });

  it('si el archivo declarado ya no existe, lo explica y no lo crea', async () => {
    fs.rmSync(bib);
    expect(await referencias.agregar(PHAM, 'preguntar')).toEqual({
      tipo: 'invalido', mensaje: 'No se encuentra referencias.bib en el informe.',
    });
    expect(fs.existsSync(bib)).toBe(false);
  });

  it('no escribe fuera del informe aunque la ruta declarada lo intente', async () => {
    const fuera = crearReferencias(informe, async () => '../fuera.bib');
    await expect(fuera.agregar(PHAM, 'preguntar')).rejects.toThrow();
    expect(fs.existsSync(path.join(informe, '..', 'fuera.bib'))).toBe(false);
  });

  it('si el archivo cambia entre decidir y escribir, no pisa el cambio: decide de nuevo', async () => {
    let veces = 0;
    const r = crearReferencias(informe, async () => 'referencias.bib', {
      antesDeEscribir: async () => { if (veces++ === 0) fs.appendFileSync(bib, '\r\n@misc{ajena, title = {De otro}}\r\n'); },
    });
    expect(await r.agregar(PHAM, 'preguntar')).toMatchObject({ tipo: 'ok', referencias: [{ tipo: 'agregada' }] });
    expect(claves().slice(-2)).toEqual(['ajena', 'pham_topicgpt_2024']);
  });

  it('si en el medio alguien agregó esa misma referencia, no la duplica', async () => {
    let veces = 0;
    const r = crearReferencias(informe, async () => 'referencias.bib', {
      antesDeEscribir: async () => { if (veces++ === 0) fs.appendFileSync(bib, `\r\n${PHAM.replace(/\n/g, '\r\n')}\r\n`); },
    });
    expect(await r.agregar(PHAM, 'preguntar')).toMatchObject({ referencias: [{ tipo: 'ya-estaba', clave: 'pham_topicgpt_2024' }] });
    expect(claves().filter((c) => c === 'pham_topicgpt_2024')).toHaveLength(1);
  });

  it('si cambia dos veces seguidas, no escribe y lo dice', async () => {
    const r = crearReferencias(informe, async () => 'referencias.bib', {
      antesDeEscribir: async () => { fs.appendFileSync(bib, '\r\n% otra línea\r\n'); },
    });
    expect(await r.agregar(PHAM, 'preguntar')).toEqual({ tipo: 'invalido', mensaje: 'referencias.bib cambió mientras se agregaba la referencia. Probá de nuevo.' });
    expect(leer()).not.toContain('pham_topicgpt_2024');
  });

  it('una entrada rota que ya estaba en el archivo no impide agregar', async () => {
    fs.writeFileSync(bib, '@misc{rota, title = {sin cerrar\n\n@misc{b, title = {y}}\n');
    expect(await referencias.agregar(PHAM, 'preguntar')).toMatchObject({ tipo: 'ok', referencias: [{ tipo: 'agregada' }] });
    expect(leer().startsWith('@misc{rota, title = {sin cerrar\n\n@misc{b, title = {y}}\n')).toBe(true);
  });
});
