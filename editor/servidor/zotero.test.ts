import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearZoteroFalso, type ZoteroFalso } from '../pruebas/ayudas/zoteroFalso';
import { RutaInvalida } from './archivos';
import { crearZotero, type Zotero } from './zotero';

const zoteroRealResponde = await fetch('http://127.0.0.1:23119/api/users/0/groups', { signal: AbortSignal.timeout(1000) })
  .then((r) => r.ok, () => false);

let falso: ZoteroFalso;
let zotero: Zotero;

beforeEach(async () => {
  falso = await crearZoteroFalso();
  zotero = crearZotero({ base: falso.base });
});
afterEach(async () => { await falso.cerrar(); });

describe('ítems de Zotero', () => {
  it('junta los ítems de la biblioteca personal y de los grupos, sin adjuntos', async () => {
    const r = await zotero.items();
    expect(r.estado).toBe('disponible');
    expect(r.items.map((i) => [i.biblioteca, i.item, i.tipo])).toEqual([
      ['users/0', '2RNMK434', 'webpage'], ['users/0', 'B00KED1T', 'book'],
      ['groups/6491700', 'ZXBADSCP', 'conferencePaper'], ['groups/6491700', '1NST1TUC', 'journalArticle'],
    ]);
  });

  it('de cada ítem saca título, apellidos, año y DOI', async () => {
    const pham = (await zotero.items()).items.find((i) => i.item === 'ZXBADSCP')!;
    expect(pham).toEqual({
      biblioteca: 'groups/6491700', nombreBiblioteca: 'Tesis2026-Cris,Pache,Nacho', item: 'ZXBADSCP', tipo: 'conferencePaper',
      titulo: 'TopicGPT: A Prompt-based Topic Modeling Framework', autores: ['Pham', 'Hoyle', 'Sun', 'Resnik', 'Iyyer'],
      anio: '2024', doi: '10.18653/v1/2024.naacl-long.164',
    });
  });

  it('autor institucional, sin fecha, sin autores, solo editores', async () => {
    const items = (await zotero.items()).items;
    expect(items.find((i) => i.tipo === 'journalArticle')).toMatchObject({ autores: ['Universidad de la República'], anio: null, doi: null });
    expect(items.find((i) => i.tipo === 'webpage')).toMatchObject({ autores: [], anio: null, nombreBiblioteca: 'Mi biblioteca' });
    expect(items.find((i) => i.tipo === 'book')).toMatchObject({ autores: ['Jurafsky', 'Martin'], anio: '2009' });
  });

  it('pagina de a 100 hasta completar el total', async () => {
    const grande = await crearZoteroFalso({ itemsDeGrupo: 230 });
    const r = await crearZotero({ base: grande.base }).items();
    expect(r.items.filter((i) => i.biblioteca === 'groups/6491700')).toHaveLength(230);
    expect(grande.pedidos.filter((p) => p.includes('/groups/6491700/items/top')).map((p) => new URL(p.slice(4), grande.base).searchParams.get('start') ?? '0'))
      .toEqual(['0', '100', '200']);
    await grande.cerrar();
  });

  it('Zotero cerrado: sin ítems y sin excepción', async () => {
    const libre = await crearZoteroFalso();
    await libre.cerrar();                                   // ese puerto ya no escucha
    expect(await crearZotero({ base: libre.base }).items()).toEqual({ estado: 'cerrado', items: [] });
  });

  it('Zotero sin la opción activada', async () => {
    const f = await crearZoteroFalso({ modo: 'sin-permiso' });
    expect(await crearZotero({ base: f.base }).items()).toEqual({ estado: 'sin-permiso', items: [] });
    await f.cerrar();
  });

  it('Zotero que no contesta a tiempo', async () => {
    const f = await crearZoteroFalso({ modo: 'lento' });    // responde recién a los 2 s
    expect(await crearZotero({ base: f.base, esperaMs: 150 }).items()).toEqual({ estado: 'sin-respuesta', items: [] });
    await f.cerrar();
  });

  it('si un grupo falla, igual devuelve lo de las otras bibliotecas', async () => {
    const f = await crearZoteroFalso({ grupoQueFalla: 6491700 });
    const r = await crearZotero({ base: f.base }).items();
    expect(r.estado).toBe('disponible');
    expect(r.items.map((i) => i.biblioteca)).toEqual(['users/0', 'users/0']);
    await f.cerrar();
  });
});

describe('BibTeX de un ítem', () => {
  it('entrega el BibTeX de un ítem, y null si ya no existe', async () => {
    expect(await zotero.bibtex('groups/6491700', 'ZXBADSCP')).toContain('@inproceedings{pham_topicgpt_2024,');
    expect(await zotero.bibtex('groups/6491700', 'N0EX1STE')).toBeNull();
  });

  it('con Zotero cerrado o sin permiso da null, sin excepción', async () => {
    const sinPermiso = await crearZoteroFalso({ modo: 'sin-permiso' });
    expect(await crearZotero({ base: sinPermiso.base }).bibtex('groups/6491700', 'ZXBADSCP')).toBeNull();
    await sinPermiso.cerrar();
    expect(await crearZotero({ base: sinPermiso.base }).bibtex('groups/6491700', 'ZXBADSCP')).toBeNull();
  });

  it.each([
    ['groups/6491700/../../x', 'ZXBADSCP'], ['users/1', 'ZXBADSCP'], ['groups/6491700', '../items'], ['groups/6491700', 'zxbadscp'],
    ['http://otro', 'ZXBADSCP'], ['groups/6491700?x=', 'ZXBADSCP'], ['groups/6491700', 'ZXBADSCP?format=json'], ['', ''],
  ])('rechaza identificadores con otra forma: %j %j', async (biblioteca, item) => {
    await expect(zotero.bibtex(biblioteca, item)).rejects.toThrow(RutaInvalida);
    expect(falso.pedidos).toEqual([]);
  });
});

describe('solo lectura', () => {
  it('solo hace pedidos GET', async () => {
    await zotero.items();
    await zotero.bibtex('groups/6491700', 'ZXBADSCP');
    expect(falso.pedidos.length).toBeGreaterThan(3);
    expect(falso.pedidos.every((p) => p.startsWith('GET '))).toBe(true);
  });

  it.skipIf(!zoteroRealResponde)('con el Zotero real: responde y cada ítem tiene título y biblioteca', async () => {
    const r = await crearZotero().items();
    expect(r.estado).toBe('disponible');
    expect(r.items.every((i) => typeof i.titulo === 'string' && /^(users\/0|groups\/\d+)$/.test(i.biblioteca))).toBe(true);
    expect(r.items.some((i) => i.tipo === 'attachment' || i.tipo === 'note')).toBe(false);
  });
});
