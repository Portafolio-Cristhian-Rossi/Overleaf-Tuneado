import type { ProblemaLatex } from '../../compartido/tipos';
import { api } from '../api';
import { avisoDeCompilacion, ubicacionDe } from '../mensajes';
import { el } from './dom';

export function crearPanelPdf(padre: HTMLElement, o: { alElegirProblema(ruta: string, linea: number): void }): { compilar(): Promise<void> } {
  const boton = el('button', { type: 'button', alClick: () => { void compilar(); } }, 'Compilar');
  const estado = el('span', { clase: 'pdf-estado', role: 'status' });
  const visor = el('iframe', { clase: 'pdf-visor', title: 'PDF del informe', hidden: true });
  const mensaje = el('p', { clase: 'pdf-mensaje' }, 'Compilá para ver el PDF del informe.');
  const problemas = el('ul', { clase: 'pdf-problemas', hidden: true, 'aria-label': 'Problemas de compilación' });
  padre.append(el('div', { clase: 'pdf-barra' }, boton, estado), visor, mensaje, problemas);

  // El visor se recarga solo cuando hay un PDF nuevo: ante errores queda el último correcto.
  function mostrarPdf(): void {
    visor.src = `/api/pdf?t=${Date.now()}`;
    visor.hidden = false;
    mensaje.hidden = true;
  }

  function mostrarMensaje(texto: string): void {
    mensaje.textContent = texto;
    mensaje.hidden = false;
  }

  function mostrarProblemas(lista: ProblemaLatex[]): void {
    problemas.hidden = lista.length === 0;
    problemas.replaceChildren(...lista.map((p) => {
      const navegable = p.ruta !== null && p.linea !== null;
      const contenido = [
        el('span', { clase: `pdf-gravedad ${p.gravedad}` }, p.gravedad === 'error' ? 'Error' : 'Aviso'),
        el('span', { clase: 'pdf-texto' }, p.mensaje),
        el('span', { clase: 'pdf-ubicacion' }, ubicacionDe(p)),
      ];
      return el('li', {}, navegable
        ? el('button', { type: 'button', clase: 'pdf-problema', title: p.original, alClick: () => o.alElegirProblema(p.ruta!, p.linea!) }, ...contenido)
        : el('div', { clase: 'pdf-problema', title: p.original }, ...contenido));
    }));
  }

  async function compilar(): Promise<void> {
    if (boton.disabled) return;
    boton.disabled = true;
    boton.textContent = 'Compilando…';
    estado.textContent = '';
    try {
      const r = await api.compilar();
      const aviso = avisoDeCompilacion(r);
      if (aviso) {
        if (visor.hidden) mostrarMensaje(aviso);
        else estado.textContent = aviso;
        return;
      }
      if (r.tipo !== 'ok' && r.tipo !== 'con-errores') return;
      if (r.pdfActualizado) mostrarPdf();
      mostrarProblemas(r.problemas);
      const errores = r.problemas.filter((p) => p.gravedad === 'error').length;
      estado.textContent = errores === 0 ? 'PDF actualizado'
        : `${errores === 1 ? 'Hay 1 error' : `Hay ${errores} errores`}; se muestra el último PDF correcto`;
      if (errores > 0 && visor.hidden) mostrarMensaje('El informe tiene errores y todavía no se pudo generar un PDF. Están listados abajo.');
    } catch (e) {
      estado.textContent = (e as Error).message;
    } finally {
      boton.disabled = false;
      boton.textContent = 'Compilar';
    }
  }

  // Si ya hay un PDF de una sesión anterior, se muestra de entrada.
  fetch('/api/pdf', { method: 'HEAD' }).then((r) => { if (r.ok) mostrarPdf(); }, () => undefined);

  return { compilar };
}
