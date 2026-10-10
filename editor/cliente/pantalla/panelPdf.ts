import type { ProblemaLatex } from '../../compartido/tipos';
import type { PantallaDeCompilacion } from '../compilacion';
import { avisoDeCompilacion, estadoDeCompilacion, ubicacionDe } from '../mensajes';
import { el } from './dom';

// El botón Compilar, el visor y la lista de problemas. Se usa en el panel del editor y en la
// ventana aparte del PDF; quién compila lo decide `compilacion`.
export function crearPanelPdf(padre: HTMLElement, o: {
  alCompilar(): void;
  alElegirProblema(ruta: string, linea: number): void;
}): PantallaDeCompilacion {
  const boton = el('button', { type: 'button', alClick: () => o.alCompilar() }, 'Compilar');
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

  // Si ya hay un PDF de una sesión anterior, se muestra de entrada.
  fetch('/api/pdf', { method: 'HEAD' }).then((r) => { if (r.ok && visor.hidden) mostrarPdf(); }, () => undefined);

  return {
    ocupada(si) {
      boton.disabled = si;
      boton.textContent = si ? 'Compilando…' : 'Compilar';
      if (si) estado.textContent = '';
    },
    mostrar(r) {
      const aviso = avisoDeCompilacion(r);
      if (aviso) {
        if (visor.hidden) mostrarMensaje(aviso);
        else estado.textContent = aviso;
        return;
      }
      if (r.tipo !== 'ok' && r.tipo !== 'con-errores') return;
      if (r.pdfActualizado) mostrarPdf();
      mostrarProblemas(r.problemas);
      estado.textContent = estadoDeCompilacion(r);
      if (r.tipo === 'con-errores' && visor.hidden) mostrarMensaje('El informe tiene errores y todavía no se pudo generar un PDF. Están listados abajo.');
    },
    fallar(texto) { estado.textContent = texto; },
  };
}
