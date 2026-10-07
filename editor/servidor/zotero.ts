import type { EstadoZotero, ItemZotero } from '../compartido/tipos';
import { RutaInvalida } from './archivos';

// La API local de Zotero. Solo se lee: todos los pedidos son GET, y a esta máquina.
export interface Zotero {
  // Nunca lanza. Con un estado distinto de 'disponible', `items` es [].
  items(): Promise<{ estado: EstadoZotero; items: ItemZotero[] }>;
  // El BibTeX de un ítem, o null si ya no existe o Zotero no responde.
  // Lanza RutaInvalida si los identificadores no tienen la forma esperada.
  bibtex(biblioteca: string, item: string): Promise<string | null>;
}

const ES_BIBLIOTECA = /^(?:users\/0|groups\/\d+)$/;
const ES_ITEM = /^[A-Z0-9]{8}$/;
const POR_PAGINA = 100;
const NO_SE_CITAN = new Set(['attachment', 'note', 'annotation']);

class SinPermiso extends Error {}

export function crearZotero(o: { base?: string; esperaMs?: number } = {}): Zotero {
  const base = o.base ?? 'http://127.0.0.1:23119/api';
  const esperaMs = o.esperaMs ?? 3000;

  async function pedir(ruta: string): Promise<Response> {
    const respuesta = await fetch(`${base}/${ruta}`, { method: 'GET', signal: AbortSignal.timeout(esperaMs) });
    if (respuesta.status === 403) throw new SinPermiso();
    return respuesta;
  }

  function estadoDe(error: unknown): EstadoZotero {
    if (error instanceof SinPermiso) return 'sin-permiso';
    const nombre = (error as Error)?.name;
    return nombre === 'TimeoutError' || nombre === 'AbortError' ? 'sin-respuesta' : 'cerrado';
  }

  // Apellidos de los autores (o el nombre, si es institucional); los editores si no hay autores.
  function autoresDe(creadores: any[]): string[] {
    const deTipo = (tipo: string) => creadores.filter((c) => c?.creatorType === tipo)
      .map((c) => String(c.lastName ?? c.name ?? '').trim()).filter(Boolean);
    const autores = deTipo('author');
    return autores.length > 0 ? autores : deTipo('editor');
  }

  function convertir(crudo: any, biblioteca: string, nombreBiblioteca: string): ItemZotero | null {
    const datos = crudo?.data;
    if (typeof datos?.key !== 'string' || NO_SE_CITAN.has(datos.itemType)) return null;
    const fecha = `${crudo?.meta?.parsedDate ?? ''} ${datos.date ?? ''}`;
    return {
      biblioteca, nombreBiblioteca, item: datos.key, tipo: String(datos.itemType ?? ''),
      titulo: String(datos.title ?? ''),
      autores: autoresDe(Array.isArray(datos.creators) ? datos.creators : []),
      anio: /\d{4}/.exec(fecha)?.[0] ?? null,
      doi: String(datos.DOI ?? '').trim() || null,
    };
  }

  async function itemsDe(biblioteca: string, nombre: string): Promise<ItemZotero[]> {
    const items: ItemZotero[] = [];
    for (let desde = 0, total = 1; desde < total; desde += POR_PAGINA) {
      const respuesta = await pedir(`${biblioteca}/items/top?format=json&limit=${POR_PAGINA}&start=${desde}`);
      if (!respuesta.ok) throw new Error(`Zotero respondió ${respuesta.status}`);
      total = Number(respuesta.headers.get('Total-Results') ?? '0');
      const pagina = await respuesta.json();
      if (!Array.isArray(pagina) || pagina.length === 0) break;
      items.push(...pagina.flatMap((crudo) => convertir(crudo, biblioteca, nombre) ?? []));
    }
    return items;
  }

  return {
    async items() {
      let grupos: any[];
      try {
        const respuesta = await pedir('users/0/groups');
        if (!respuesta.ok) throw new Error(`Zotero respondió ${respuesta.status}`);
        const cuerpo = await respuesta.json();
        grupos = Array.isArray(cuerpo) ? cuerpo : [];
      } catch (error) {
        return { estado: estadoDe(error), items: [] };
      }
      const bibliotecas: [string, string][] = [
        ['users/0', 'Mi biblioteca'],
        ...grupos.filter((g) => Number.isInteger(g?.id)).map((g): [string, string] => [`groups/${g.id}`, String(g.data?.name ?? `Grupo ${g.id}`)]),
      ];
      // Una biblioteca que falla no impide usar las demás.
      const porBiblioteca = await Promise.all(bibliotecas.map(([ruta, nombre]) => itemsDe(ruta, nombre).catch(() => [])));
      return { estado: 'disponible', items: porBiblioteca.flat() };
    },

    async bibtex(biblioteca, item) {
      if (!ES_BIBLIOTECA.test(biblioteca) || !ES_ITEM.test(item)) throw new RutaInvalida('Identificador de Zotero no válido.');
      try {
        const respuesta = await pedir(`${biblioteca}/items/${item}?format=bibtex`);
        if (!respuesta.ok) return null;
        const texto = await respuesta.text();
        return texto.trim() === '' ? null : texto;
      } catch {
        return null;
      }
    },
  };
}
