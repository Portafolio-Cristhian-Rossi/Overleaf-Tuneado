import { describe, expect, it, vi } from 'vitest';
import type { Candidato } from '../compartido/citas';
import type { ResultadoAgregar, ResultadoDeReferencia } from '../compartido/tipos';
import { agregarPegado, avisoDelBuscador, resolverClaves, type Citador } from './citar';

const delInforme = (clave: string): Candidato =>
  ({ origen: 'informe', clave, zotero: null, autores: 'A', anio: '2020', titulo: 'T', detalle: 'en el informe', busqueda: '' });
const deZotero = (item: string): Candidato =>
  ({ origen: 'zotero', clave: null, zotero: { biblioteca: 'groups/6491700', item }, autores: 'A', anio: '2020', titulo: 'T', detalle: 'Grupo', busqueda: '' });
const ok = (...referencias: ResultadoDeReferencia[]): ResultadoAgregar => ({ tipo: 'ok', referencias });
const agregada = (clave: string, advertencias: string[] = []): ResultadoDeReferencia => ({ tipo: 'agregada', clave, advertencias });
const yaEstaba = (clave: string): ResultadoDeReferencia => ({ tipo: 'ya-estaba', clave, advertencias: [] });
const repetida = (clave: string): ResultadoDeReferencia => ({ tipo: 'clave-repetida', clave, sugerida: `${clave}-2` });

// Las respuestas del servidor se consumen en orden; `eleccion` es el comienzo del texto del botón que se aprieta.
function preparar(respuestas: (ResultadoAgregar | Error)[], o: { eleccion?: string; seGuarda?: boolean } = {}) {
  const responder = async (): Promise<ResultadoAgregar> => {
    const r = respuestas.shift();
    if (r === undefined) throw new Error('pedido inesperado');
    if (r instanceof Error) throw r;
    return r;
  };
  const citador = {
    agregar: vi.fn((_bibtex: string, _alRepetir?: 'preguntar' | 'renombrar') => responder()),
    citarDeZotero: vi.fn((_biblioteca: string, _item: string, _alRepetir?: 'preguntar' | 'renombrar') => responder()),
    preguntar: vi.fn(async (_mensaje: string, opciones: { texto: string; valor: unknown }[]) =>
      opciones.find((opcion) => opcion.texto.startsWith(o.eleccion ?? '¿?'))!.valor),
    avisar: vi.fn(),
    antesDeAgregar: vi.fn(async () => o.seGuarda ?? true),
    despuesDeAgregar: vi.fn(async () => {}),
  };
  return { ...citador, citador: citador as unknown as Citador };
}

describe('resolverClaves', () => {
  it('con candidatos del informe devuelve sus claves sin tocar nada', async () => {
    const p = preparar([]);
    expect(await resolverClaves([delInforme('a'), delInforme('b')], p.citador)).toEqual(['a', 'b']);
    expect(p.antesDeAgregar).not.toHaveBeenCalled();
    expect(p.citarDeZotero).not.toHaveBeenCalled();
    expect(p.despuesDeAgregar).not.toHaveBeenCalled();
  });

  it('uno de Zotero: guarda, lo agrega y recarga', async () => {
    const p = preparar([ok(agregada('pham_topicgpt_2024'))]);
    expect(await resolverClaves([deZotero('ZXBADSCP')], p.citador)).toEqual(['pham_topicgpt_2024']);
    expect(p.antesDeAgregar).toHaveBeenCalledTimes(1);
    expect(p.citarDeZotero).toHaveBeenCalledWith('groups/6491700', 'ZXBADSCP', undefined);
    expect(p.despuesDeAgregar).toHaveBeenCalledTimes(1);
    expect(p.avisar).not.toHaveBeenCalled();
  });

  it('si ya estaba con otra clave, usa la que está y no recarga', async () => {
    const p = preparar([ok(yaEstaba('Pham2024'))]);
    expect(await resolverClaves([deZotero('ZXBADSCP')], p.citador)).toEqual(['Pham2024']);
    expect(p.despuesDeAgregar).not.toHaveBeenCalled();
  });

  it('mezcla de informe y Zotero: en el orden elegido y sin repetir', async () => {
    const p = preparar([ok(yaEstaba('b')), ok(agregada('z'))]);
    expect(await resolverClaves([delInforme('a'), deZotero('ITEM0001'), delInforme('b'), deZotero('ITEM0002')], p.citador)).toEqual(['a', 'b', 'z']);
    expect(p.antesDeAgregar).toHaveBeenCalledTimes(1);
    expect(p.despuesDeAgregar).toHaveBeenCalledTimes(1);
  });

  it('clave repetida: pregunta, y "Agregar como…" repite el pedido renombrando', async () => {
    const p = preparar([ok(repetida('pham')), ok(agregada('pham-2'))], { eleccion: 'Agregar como' });
    expect(await resolverClaves([deZotero('ZXBADSCP')], p.citador)).toEqual(['pham-2']);
    const [mensaje, opciones] = p.preguntar.mock.calls[0] as unknown as [string, { texto: string; neutra?: boolean }[]];
    expect(mensaje).toBe('En el informe ya hay otra referencia con la clave pham.');
    expect(opciones.map((opcion) => [opcion.texto, opcion.neutra === true])).toEqual([['Agregar como pham-2', false], ['Cancelar', true]]);
    expect(p.citarDeZotero.mock.calls.map((llamada) => llamada[2])).toEqual([undefined, 'renombrar']);
    expect(p.despuesDeAgregar).toHaveBeenCalledTimes(1);
  });

  it('clave repetida y Cancelar: no cita nada y no recarga', async () => {
    const p = preparar([ok(repetida('pham'))], { eleccion: 'Cancelar' });
    expect(await resolverClaves([deZotero('ZXBADSCP')], p.citador)).toBeNull();
    expect(p.citarDeZotero).toHaveBeenCalledTimes(1);
    expect(p.despuesDeAgregar).not.toHaveBeenCalled();
  });

  it('si se cancela después de haber agregado otra, igual recarga', async () => {
    const p = preparar([ok(agregada('z')), ok(repetida('pham'))], { eleccion: 'Cancelar' });
    expect(await resolverClaves([deZotero('ITEM0001'), deZotero('ITEM0002')], p.citador)).toBeNull();
    expect(p.despuesDeAgregar).toHaveBeenCalledTimes(1);
  });

  it('una respuesta inválida se avisa con su motivo', async () => {
    const p = preparar([{ tipo: 'invalido', mensaje: 'Zotero ya no tiene ese ítem.' }]);
    expect(await resolverClaves([deZotero('ZXBADSCP')], p.citador)).toBeNull();
    expect(p.avisar).toHaveBeenCalledWith('Zotero ya no tiene ese ítem.', 'error');
  });

  it('sin conexión con el editor, avisa y no cita', async () => {
    const p = preparar([new Error('sin conexión')]);
    expect(await resolverClaves([deZotero('ZXBADSCP')], p.citador)).toBeNull();
    expect(p.avisar).toHaveBeenCalledWith('No se pudo agregar la referencia. Probá de nuevo.', 'error');
  });

  it('si no se pudo guardar lo pendiente, no agrega nada', async () => {
    const p = preparar([], { seGuarda: false });
    expect(await resolverClaves([delInforme('a'), deZotero('ZXBADSCP')], p.citador)).toBeNull();
    expect(p.avisar).toHaveBeenCalledWith('No se pudo guardar referencias.bib. Probá de nuevo.', 'error');
    expect(p.citarDeZotero).not.toHaveBeenCalled();
  });

  it('las advertencias de todas las referencias se avisan juntas y no se van solas', async () => {
    const p = preparar([ok(agregada('a', ['A "a" le falta la revista.'])), ok(agregada('b', ['"b" trae una nota.']))]);
    expect(await resolverClaves([deZotero('ITEM0001'), deZotero('ITEM0002')], p.citador)).toEqual(['a', 'b']);
    expect(p.avisar).toHaveBeenCalledTimes(1);
    expect(p.avisar).toHaveBeenCalledWith('A "a" le falta la revista.\n"b" trae una nota.', 'error');
  });

  it('sin nada elegido no hace nada', async () => {
    const p = preparar([]);
    expect(await resolverClaves([], p.citador)).toEqual([]);
    expect(p.antesDeAgregar).not.toHaveBeenCalled();
  });
});

describe('avisoDelBuscador', () => {
  it('con Zotero disponible y el .bib sano no hay aviso', () => {
    expect(avisoDelBuscador('disponible', [], 'referencias.bib')).toBeNull();
  });

  it.each([
    ['cerrado', 'Zotero está cerrado: se muestran solo las referencias del informe.'],
    ['sin-permiso', 'Zotero no permite la conexión. Activá "Permitir que otras aplicaciones de este equipo se comuniquen con Zotero" en Ajustes → Avanzado.'],
    ['sin-respuesta', 'Zotero no respondió a tiempo: se muestran solo las referencias del informe.'],
  ] as const)('Zotero %s', (estado, texto) => {
    expect(avisoDelBuscador(estado, [], 'referencias.bib')).toBe(texto);
  });

  it('suma una línea por cada entrada mal formada del .bib', () => {
    const problemas = [{ linea: 12, mensaje: 'La entrada que empieza acá no cierra su llave.' }, { linea: 40, mensaje: 'Falta la clave de la entrada.' }];
    expect(avisoDelBuscador('disponible', problemas, 'refs.bib')).toBe(
      'refs.bib, línea 12: La entrada que empieza acá no cierra su llave.\nrefs.bib, línea 40: Falta la clave de la entrada.');
    expect(avisoDelBuscador('cerrado', problemas.slice(0, 1), 'refs.bib')).toBe(
      'Zotero está cerrado: se muestran solo las referencias del informe.\nrefs.bib, línea 12: La entrada que empieza acá no cierra su llave.');
  });

  it('sin archivo de referencias lo dice', () => {
    expect(avisoDelBuscador('disponible', [], null)).toBe('El informe no tiene un archivo de referencias: no hay dónde agregar las que elijas.');
  });
});

describe('agregarPegado', () => {
  it('devuelve las claves que quedaron disponibles: las agregadas y las que ya estaban', async () => {
    const p = preparar([ok(agregada('a'), yaEstaba('b'))]);
    expect(await agregarPegado('@misc{a}', p.citador)).toEqual(['a', 'b']);
    expect(p.agregar).toHaveBeenCalledWith('@misc{a}', undefined);
    expect(p.antesDeAgregar).toHaveBeenCalledTimes(1);
    expect(p.despuesDeAgregar).toHaveBeenCalledTimes(1);
  });

  it('con una clave repetida pregunta y repite el pedido renombrando', async () => {
    const p = preparar([ok(agregada('a'), repetida('c')), ok(yaEstaba('a'), agregada('c-2'))], { eleccion: 'Agregar como' });
    expect(await agregarPegado('…', p.citador)).toEqual(['a', 'c-2']);
    expect(p.agregar.mock.calls.map((llamada) => llamada[1])).toEqual([undefined, 'renombrar']);
    expect(p.despuesDeAgregar).toHaveBeenCalledTimes(1);
  });

  it('con dos claves repetidas pregunta por cada una antes de repetir', async () => {
    const p = preparar([ok(repetida('c'), repetida('d')), ok(agregada('c-2'), agregada('d-2'))], { eleccion: 'Agregar como' });
    expect(await agregarPegado('…', p.citador)).toEqual(['c-2', 'd-2']);
    expect(p.preguntar).toHaveBeenCalledTimes(2);
    expect(p.agregar).toHaveBeenCalledTimes(2);
  });

  it('un texto inválido se avisa con su motivo y no recarga', async () => {
    const p = preparar([{ tipo: 'invalido', mensaje: 'No encontré ninguna referencia.' }]);
    expect(await agregarPegado('hola', p.citador)).toBeNull();
    expect(p.avisar).toHaveBeenCalledWith('No encontré ninguna referencia.', 'error');
    expect(p.despuesDeAgregar).not.toHaveBeenCalled();
  });

  it('si no se pudo guardar lo pendiente, no pide nada', async () => {
    const p = preparar([], { seGuarda: false });
    expect(await agregarPegado('@misc{a}', p.citador)).toBeNull();
    expect(p.agregar).not.toHaveBeenCalled();
  });

  it('las advertencias de lo agregado se avisan', async () => {
    const p = preparar([ok(agregada('a', ['A "a" le falta la revista.']))]);
    await agregarPegado('@article{a}', p.citador);
    expect(p.avisar).toHaveBeenCalledWith('A "a" le falta la revista.', 'error');
  });
});
