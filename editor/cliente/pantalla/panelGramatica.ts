import { forEachDiagnostic, setDiagnosticsEffect } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { EstadoCorrector } from '../../compartido/tipos';
import { el } from './dom';

const ETIQUETA = { error: 'Ortografía', warning: 'Gramática', info: 'Estilo', hint: 'Estilo' } as const;

// Lista de los avisos del capítulo abierto. Los avisos los calcula la extensión de corrección;
// acá solo se muestran.
export function crearPanelGramatica(padre: HTMLElement, o: {
  vista(): EditorView;
  esCapitulo(): boolean;
  alElegir(posicion: number): void;
  alContar(cantidad: number): void;
}) {
  const mensaje = el('p', { clase: 'gramatica-mensaje' });
  const lista = el('ul', { clase: 'gramatica-lista', 'aria-label': 'Avisos de ortografía y gramática' });
  padre.append(mensaje, lista);

  let estado: EstadoCorrector = { estado: 'iniciando' };

  function actualizar(): void {
    const vista = o.vista();
    const items: HTMLElement[] = [];
    if (estado.estado === 'listo' && o.esCapitulo()) {
      forEachDiagnostic(vista.state, (d, desde, hasta) => {
        items.push(el('li', {}, el('button', { type: 'button', clase: 'gramatica-aviso', alClick: () => o.alElegir(desde) },
          el('span', { clase: `gramatica-tipo ${d.severity}` }, ETIQUETA[d.severity]),
          el('span', { clase: 'gramatica-palabra' }, vista.state.sliceDoc(desde, hasta)),
          el('span', { clase: 'gramatica-detalle' }, d.message))));
      });
    }
    lista.replaceChildren(...items);
    o.alContar(items.length);

    if (estado.estado === 'no-disponible') mensaje.textContent = estado.motivo;
    else if (estado.estado === 'iniciando') mensaje.textContent = 'El corrector está arrancando. Tarda unos segundos.';
    else if (estado.estado === 'apagado') mensaje.textContent = 'El corrector está apagado en config.json.';
    else if (!o.esCapitulo()) mensaje.textContent = 'La corrección se aplica a los capítulos del informe.';
    else mensaje.textContent = items.length === 0 ? 'Sin avisos en este capítulo.' : '';
    mensaje.hidden = mensaje.textContent === '';
  }

  return {
    mostrarEstado(nuevo: EstadoCorrector) { estado = nuevo; actualizar(); },
    actualizar,
  };
}

// Avisa al panel cada vez que la revisión entrega avisos nuevos.
export function extensionPanelGramatica(actualizar: () => void): Extension {
  return EditorView.updateListener.of((cambio) => {
    if (cambio.transactions.some((tr) => tr.effects.some((e) => e.is(setDiagnosticsEffect)))) actualizar();
  });
}
