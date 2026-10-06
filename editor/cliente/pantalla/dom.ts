type Hijo = Node | string | null | undefined | false;

// Crea un elemento. Los atributos que empiezan con "al" son manejadores de eventos (alClick → click).
export function el<K extends keyof HTMLElementTagNameMap>(
  etiqueta: K,
  atributos: Record<string, unknown> = {},
  ...hijos: Hijo[]
): HTMLElementTagNameMap[K] {
  const nodo = document.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (nombre.startsWith('al') && typeof valor === 'function') {
      nodo.addEventListener(nombre.slice(2).toLowerCase(), valor as EventListener);
    } else if (nombre === 'clase') {
      nodo.className = String(valor);
    } else {
      nodo.setAttribute(nombre, valor === true ? '' : String(valor));
    }
  }
  nodo.append(...hijos.filter((h): h is Node | string => h !== null && h !== undefined && h !== false));
  return nodo;
}

export interface Opcion<T> { texto: string; valor: T; principal?: boolean }

// Diálogo modal con botones; devuelve el valor del botón elegido.
// Escape elige la última opción, que por convención es la que no cambia nada.
export function preguntar<T>(mensaje: string, opciones: Opcion<T>[], detalle?: string): Promise<T> {
  return new Promise((resolver) => {
    const dialogo = el('dialog', { clase: 'dialogo' });
    const cerrar = (valor: T) => { dialogo.close(); dialogo.remove(); resolver(valor); };
    dialogo.append(el('p', { clase: 'dialogo-mensaje' }, mensaje));
    if (detalle) dialogo.append(el('p', { clase: 'dialogo-detalle' }, detalle));
    dialogo.append(el('div', { clase: 'dialogo-botones' }, ...opciones.map((o) =>
      el('button', { type: 'button', clase: o.principal ? 'principal' : '', alClick: () => cerrar(o.valor) }, o.texto))));
    dialogo.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(opciones[opciones.length - 1].valor); });
    document.body.append(dialogo);
    dialogo.showModal();
  });
}
