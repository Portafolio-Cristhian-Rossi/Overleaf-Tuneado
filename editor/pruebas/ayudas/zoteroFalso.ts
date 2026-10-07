import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '../fixtures/zotero');

export interface ZoteroFalso { base: string; pedidos: string[]; cerrar(): Promise<void> }

// Un servidor HTTP local que responde como la API local de Zotero (ver la sonda en la
// especificación de la etapa 4, sección 6.5). `base` termina en /api.
export async function crearZoteroFalso(o: {
  modo?: 'disponible' | 'sin-permiso' | 'lento';
  itemsDeGrupo?: number;        // genera esa cantidad de artículos en el grupo 6491700, en lugar de los del fixture
  grupoQueFalla?: number;       // responde 500 al pedir los ítems de ese grupo
  puerto?: number;              // por defecto, uno libre cualquiera
} = {}): Promise<ZoteroFalso> {
  const fixture = JSON.parse(fs.readFileSync(path.join(DIR, 'items.json'), 'utf8'));
  const bibtex = fs.readFileSync(path.join(DIR, 'entrada.bib'), 'utf8');
  const items: Record<string, any[]> = { ...fixture.items };
  if (o.itemsDeGrupo !== undefined) {
    items['groups/6491700'] = Array.from({ length: o.itemsDeGrupo }, (_, n) => ({
      key: `GEN${String(n).padStart(5, '0')}`,
      meta: { parsedDate: '2020' },
      data: { key: `GEN${String(n).padStart(5, '0')}`, itemType: 'journalArticle', title: `Artículo ${n}`, date: '2020', creators: [] },
    }));
  }
  const pedidos: string[] = [];

  const servidor = http.createServer((pedido, respuesta) => {
    pedidos.push(`${pedido.method} ${pedido.url}`);
    const responder = () => {
      const url = new URL(pedido.url ?? '/', 'http://x');
      const json = (cuerpo: unknown, cabeceras: Record<string, string> = {}) => {
        respuesta.writeHead(200, { 'Content-Type': 'application/json', ...cabeceras });
        respuesta.end(JSON.stringify(cuerpo));
      };
      if (o.modo === 'sin-permiso') {
        respuesta.writeHead(403, { 'Content-Type': 'text/plain' });
        respuesta.end('Local API is not enabled');
        return;
      }
      if (url.pathname === '/api/users/0/groups') { json(fixture.grupos); return; }

      const lista = /^\/api\/(users\/0|groups\/\d+)\/items\/top$/.exec(url.pathname);
      if (lista) {
        if (lista[1] === `groups/${o.grupoQueFalla}`) { respuesta.writeHead(500); respuesta.end('error'); return; }
        const todos = items[lista[1]] ?? [];
        const desde = Number(url.searchParams.get('start') ?? '0');
        const limite = Number(url.searchParams.get('limit') ?? '25');
        json(todos.slice(desde, desde + limite), { 'Total-Results': String(todos.length) });
        return;
      }

      const uno = /^\/api\/(users\/0|groups\/\d+)\/items\/([A-Z0-9]{8})$/.exec(url.pathname);
      if (uno && url.searchParams.get('format') === 'bibtex' && (items[uno[1]] ?? []).some((i) => i.key === uno[2])) {
        respuesta.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        respuesta.end(bibtex);
        return;
      }
      respuesta.writeHead(404, { 'Content-Type': 'text/plain' });
      respuesta.end('Not found');
    };
    if (o.modo === 'lento') setTimeout(responder, 2000);
    else responder();
  });

  await new Promise<void>((resolver) => { servidor.listen(o.puerto ?? 0, '127.0.0.1', resolver); });
  return {
    base: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`,
    pedidos,
    cerrar: () => new Promise((resolver) => {
      servidor.closeAllConnections();
      servidor.close(() => resolver());
    }),
  };
}
