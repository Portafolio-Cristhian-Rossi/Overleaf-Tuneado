import { el } from './dom';

export interface OpcionDeMenu {
  texto: string;
  // Una opción deshabilitada se muestra igual, con `ayuda` como explicación.
  habilitada?: boolean; ayuda?: string;
  alElegir(): void;
}

let cerrarAbierto: (() => void) | null = null;

export function cerrarMenuFlotante(): void {
  cerrarAbierto?.();
}

// Muestra un menú junto a `lugar` (el rectángulo de quien lo abre). Hay uno solo a la vez. Se
// cierra con Escape, con un clic afuera, al elegir, y cuando la ventana pierde el foco o se desplaza.
export function abrirMenuFlotante(lugar: DOMRect, opciones: OpcionDeMenu[]): void {
  cerrarMenuFlotante();
  const menu = el('div', { clase: 'menu-flotante', role: 'menu' });
  const alClicAfuera = (evento: Event) => {
    if (!menu.contains(evento.target as Node)) cerrar();
  };
  function cerrar(): void {
    cerrarAbierto = null;
    menu.remove();
    document.removeEventListener('mousedown', alClicAfuera, true);
    window.removeEventListener('blur', cerrar);
    window.removeEventListener('scroll', cerrar, true);
  }

  for (const opcion of opciones) {
    menu.append(el('button', {
      type: 'button', role: 'menuitem', disabled: opcion.habilitada === false, title: opcion.ayuda,
      alClick: () => {
        cerrar();
        opcion.alElegir();
      },
    }, opcion.texto));
  }
  menu.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      cerrar();
      return;
    }
    if (evento.key !== 'ArrowDown' && evento.key !== 'ArrowUp') return;
    evento.preventDefault();
    const habilitadas = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const actual = habilitadas.indexOf(document.activeElement as HTMLButtonElement);
    habilitadas[(actual + (evento.key === 'ArrowDown' ? 1 : habilitadas.length - 1)) % habilitadas.length]?.focus();
  });

  document.body.append(menu);
  // Debajo de quien lo abre; si no entra en la ventana, arriba o corrido hacia la izquierda.
  const alto = menu.offsetHeight;
  const ancho = menu.offsetWidth;
  const arriba = lugar.bottom + 2 + alto > window.innerHeight ? Math.max(4, lugar.top - alto - 2) : lugar.bottom + 2;
  menu.style.top = `${arriba}px`;
  menu.style.left = `${Math.max(4, Math.min(lugar.left, window.innerWidth - ancho - 4))}px`;

  cerrarAbierto = cerrar;
  document.addEventListener('mousedown', alClicAfuera, true);
  window.addEventListener('blur', cerrar);
  window.addEventListener('scroll', cerrar, true);
  menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
}
