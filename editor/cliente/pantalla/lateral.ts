import type { Proyecto } from '../../compartido/tipos';
import type { TituloDeIndice } from '../indice';
import { el } from './dom';

export function crearLateral(padre: HTMLElement, o: { alElegirArchivo(ruta: string): void; alElegirTitulo(posicion: number): void }) {
  const capitulos = el('nav', { clase: 'lista', 'aria-label': 'Capítulos del informe' });
  const indice = el('nav', { clase: 'lista indice', 'aria-label': 'Secciones del capítulo' });
  padre.append(
    el('h2', { clase: 'rotulo' }, 'Informe'), capitulos,
    el('h2', { clase: 'rotulo' }, 'En este capítulo'), indice,
  );

  const entrada = (texto: string, ruta: string, activa: boolean) =>
    el('button', { type: 'button', clase: activa ? 'entrada activa' : 'entrada', title: texto, 'aria-current': activa ? 'page' : undefined,
      alClick: () => o.alElegirArchivo(ruta) }, texto);

  return {
    mostrarProyecto(p: Proyecto, rutaActiva: string | null) {
      capitulos.replaceChildren(
        ...p.capitulos.map((c) => entrada(c.numero ? `${c.numero}. ${c.titulo}` : c.titulo, c.ruta, c.ruta === rutaActiva)),
        ...(p.bibliografia ? [entrada('Referencias', p.bibliografia, p.bibliografia === rutaActiva)] : []),
      );
    },
    mostrarIndice(titulos: TituloDeIndice[]) {
      indice.replaceChildren(...(titulos.length === 0
        ? [el('p', { clase: 'vacio' }, 'Este archivo todavía no tiene secciones.')]
        : titulos.map((t) => el('button', {
          type: 'button', clase: `entrada nivel-${t.nivel}`, title: t.texto, alClick: () => o.alElegirTitulo(t.posicion),
        }, t.numero ? `${t.numero} ${t.texto}` : t.texto))));
    },
  };
}
