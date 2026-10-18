import type { Corrida, EstadoVerificacion, Hallazgo, Ignorado } from '../../compartido/verificacion';
import { agrupar, encabezado, hallazgosVisibles, mensajesDelPanel, NOMBRE_DE_TIPO, rutaParaCopiar } from '../verificacion';
import { el } from './dom';

// La última corrida del verificador, agrupada por tipo y por archivo del informe.
export function crearPanelVerificacion(padre: HTMLElement, o: {
  alElegir(h: Hallazgo): void;
  alResolver(id: string): void;
  alIgnorar(id: string): void;
  alRecuperar(id: string): void;
  alContar(cantidad: number): void;
}) {
  const cuerpo = el('div', { clase: 'verificacion-cuerpo' });
  padre.append(cuerpo);
  let verIgnorados = false;

  function botonCopiar(ruta: string): HTMLButtonElement {
    const boton = el('button', {
      type: 'button', clase: 'verificacion-chico', title: ruta,
      alClick: async () => {
        try {
          await navigator.clipboard.writeText(ruta);
          boton.textContent = 'Ruta copiada';
        } catch {
          boton.textContent = 'No se pudo copiar';
        }
        setTimeout(() => { boton.textContent = 'Copiar ruta'; }, 2000);
      },
    }, 'Copiar ruta');
    return boton;
  }

  function item(h: Hallazgo, ubicado: boolean): HTMLElement {
    return el('li', { clase: 'verificacion-hallazgo', 'data-hallazgo': h.id },
      el('button', { type: 'button', clase: 'verificacion-aviso', alClick: () => o.alElegir(h) },
        h.informe.cita === null
          ? el('span', { clase: 'verificacion-seccion' }, `Sección: ${h.informe.archivo}`)
          : el('span', { clase: 'verificacion-cita' }, `«${h.informe.cita}»`),
        !ubicado && el('span', { clase: 'verificacion-cambio' }, 'la frase cambió'),
        el('span', { clase: 'verificacion-explicacion' }, h.explicacion)),
      el('div', { clase: 'verificacion-pie' },
        h.repo && el('span', { clase: 'verificacion-repo' }, rutaParaCopiar(h.repo)),
        h.repo && botonCopiar(rutaParaCopiar(h.repo)),
        el('span', { clase: 'verificacion-espacio' }),
        el('button', { type: 'button', clase: 'verificacion-chico', alClick: () => o.alResolver(h.id) }, 'Marcar resuelto'),
        el('button', { type: 'button', clase: 'verificacion-chico', alClick: () => o.alIgnorar(h.id) }, 'Ignorar')));
  }

  function ignorado(i: Ignorado): HTMLElement {
    return el('li', { clase: 'verificacion-hallazgo' },
      el('div', { clase: 'verificacion-aviso' },
        el('span', { clase: 'verificacion-seccion' }, `${NOMBRE_DE_TIPO[i.tipo]} · ${i.archivoInforme}`),
        i.cita !== null && el('span', { clase: 'verificacion-cita' }, `«${i.cita}»`),
        el('span', { clase: 'verificacion-explicacion' }, i.explicacion)),
      el('div', { clase: 'verificacion-pie' },
        el('span', { clase: 'verificacion-espacio' }),
        el('button', { type: 'button', clase: 'verificacion-chico', alClick: () => o.alRecuperar(i.id) }, 'Recuperar')));
  }

  function mostrar(datos: { estado: EstadoVerificacion; corrida: Corrida | null; ignorados: Ignorado[] }, ubicado: (h: Hallazgo) => boolean): void {
    const { estado, corrida, ignorados } = datos;
    const partes: HTMLElement[] = [];
    // El error de la última corrida va arriba: el encabezado puede ser de una corrida anterior.
    for (const m of mensajesDelPanel(estado, corrida)) partes.push(el('p', { clase: 'verificacion-mensaje' }, m));
    if (corrida) partes.push(el('div', { clase: 'verificacion-encabezado' }, ...encabezado(corrida).map((l) => el('p', {}, l))));

    const visibles = corrida && corrida.estado === 'ok' ? hallazgosVisibles(corrida, ignorados) : [];
    if (corrida?.estado === 'ok' && visibles.length === 0) partes.push(el('p', { clase: 'verificacion-mensaje' }, 'Sin diferencias en esta corrida.'));
    for (const grupo of agrupar(visibles)) {
      partes.push(el('section', { clase: 'verificacion-grupo' },
        el('h3', { clase: `verificacion-tipo ${grupo.tipo}` }, NOMBRE_DE_TIPO[grupo.tipo]),
        ...grupo.archivos.flatMap(({ archivo, hallazgos }) => [
          el('h4', { clase: 'verificacion-archivo' }, archivo),
          el('ul', { clase: 'verificacion-lista' }, ...hallazgos.map((h) => item(h, ubicado(h)))),
        ])));
    }

    if (ignorados.length > 0) {
      partes.push(el('button', {
        type: 'button', clase: 'verificacion-ver-ignorados', 'aria-expanded': String(verIgnorados),
        alClick: () => { verIgnorados = !verIgnorados; mostrar(datos, ubicado); },
      }, `Ver ignorados (${ignorados.length})`));
      if (verIgnorados) partes.push(el('ul', { clase: 'verificacion-lista' }, ...ignorados.map(ignorado)));
    }

    // Volver a dibujar no tiene que mover la lista: se marca un hallazgo tras otro.
    const desplazamiento = cuerpo.scrollTop;
    cuerpo.replaceChildren(...partes);
    cuerpo.scrollTop = desplazamiento;
    o.alContar(visibles.length);
  }

  return {
    mostrar,
    resaltar(id: string) {
      for (const previo of cuerpo.querySelectorAll('.verificacion-resaltado')) previo.classList.remove('verificacion-resaltado');
      const elegido = [...cuerpo.querySelectorAll<HTMLElement>('[data-hallazgo]')].find((x) => x.dataset.hallazgo === id);
      if (!elegido) return;
      elegido.classList.add('verificacion-resaltado');
      elegido.scrollIntoView({ block: 'nearest' });
    },
  };
}
