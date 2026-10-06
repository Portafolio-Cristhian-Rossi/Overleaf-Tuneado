import { api } from '../api';
import type { ControlEditor } from '../editor';
import { el } from './dom';

// Cubre el editor mientras Git tiene una combinación sin terminar: seguir escribiendo
// sobre un archivo con marcas de conflicto solo empeoraría las cosas.
export function crearBloqueoConflicto(padre: HTMLElement, o: { editor: ControlEditor; alResolver(): Promise<void> }) {
  const lista = el('ul');
  const error = el('p', { clase: 'error', role: 'alert', hidden: true });
  const botones = el('div', { clase: 'cartel-botones' },
    el('button', { type: 'button', clase: 'principal', alClick: () => intentar(() => api.abrirVsCode()) }, 'Resolver en VS Code'),
    el('button', { type: 'button', alClick: () => intentar(terminar) }, 'Ya lo resolví'),
    el('button', { type: 'button', alClick: () => intentar(cancelar) }, 'Cancelar la combinación'));
  const cartel = el('div', { clase: 'cartel', hidden: true },
    el('div', { clase: 'cartel-caja', role: 'alertdialog', 'aria-label': 'Conflicto al traer cambios' },
      el('h2', {}, 'Vos y otra persona cambiaron el mismo párrafo'),
      el('p', {}, 'Git no pudo combinar estos archivos por su cuenta:'),
      lista,
      el('p', {}, 'Podés elegir qué versión queda en VS Code, o cancelar y volver a como estabas antes de traer. Tu trabajo no se pierde en ningún caso.'),
      error,
      botones));
  padre.append(cartel);

  function mostrarError(texto: string): void {
    error.textContent = texto;
    error.hidden = false;
  }

  async function intentar(accion: () => Promise<void>): Promise<void> {
    error.hidden = true;
    for (const b of botones.querySelectorAll('button')) b.disabled = true;
    try {
      await accion();
    } catch (e) {
      mostrarError((e as Error).message);
    } finally {
      for (const b of botones.querySelectorAll('button')) b.disabled = false;
    }
  }

  async function cerrar(): Promise<void> {
    ocultar();
    await o.alResolver();
  }

  async function terminar(): Promise<void> {
    const r = await api.terminar();
    if (r.tipo === 'quedan-marcas') mostrarError(`Todavía quedan marcas de conflicto en: ${r.archivos.join(', ')}`);
    else await cerrar();
  }

  async function cancelar(): Promise<void> {
    await api.cancelar();
    await cerrar();
  }

  function ocultar(): void {
    cartel.hidden = true;
    o.editor.bloquear(false);
  }

  return {
    mostrar(archivos: string[]) {
      lista.replaceChildren(...archivos.map((a) => el('li', {}, a)));
      if (!cartel.hidden) return;
      error.hidden = true;
      cartel.hidden = false;
      o.editor.bloquear(true);
    },
    ocultar,
  };
}
