import type { EditorView } from '@codemirror/view';
import {
  agregarColumna, agregarFila, alinearColumna, borrarColumna, borrarFila, type TablaLeida,
} from '../../compartido/tabla';
import { el, preguntar } from '../pantalla/dom';
import { abrirCelda, confirmarCeldaAbierta, tablaEn, transaccionDeTabla, type Celda, type Operacion } from './edicionTabla';

export type AccionDeTabla =
  | 'fila-arriba' | 'fila-abajo' | 'columna-izquierda' | 'columna-derecha'
  | 'borrar-fila' | 'borrar-columna' | 'alinear-l' | 'alinear-c' | 'alinear-r';
export interface OpcionDeCelda { accion: AccionDeTabla; texto: string; habilitada: boolean; ayuda?: string }

const ALINEAR = { 'alinear-l': 'l', 'alinear-c': 'c', 'alinear-r': 'r' } as const;
const TEXTOS: [AccionDeTabla, string][] = [
  ['fila-arriba', 'Insertar fila arriba'], ['fila-abajo', 'Insertar fila abajo'],
  ['columna-izquierda', 'Insertar columna a la izquierda'], ['columna-derecha', 'Insertar columna a la derecha'],
  ['borrar-fila', 'Borrar fila'], ['borrar-columna', 'Borrar columna'],
  ['alinear-l', 'Alinear a la izquierda'], ['alinear-c', 'Centrar'], ['alinear-r', 'Alinear a la derecha'],
];
const esAlinear = (accion: AccionDeTabla): accion is keyof typeof ALINEAR => accion in ALINEAR;

// Las nueve opciones, siempre en el mismo orden; las que no corresponden van deshabilitadas.
export function opcionesDeCelda(tabla: TablaLeida, celda: Celda): OpcionDeCelda[] {
  const alineacion = tabla.columnas[celda.columna]?.alineacion;
  return TEXTOS.map(([accion, texto]) => {
    let ayuda: string | undefined;
    let habilitada = true;
    if (accion === 'borrar-fila' && tabla.filas.length === 1) ayuda = 'Es la única fila.';
    else if (accion === 'borrar-columna' && tabla.columnas.length === 1) ayuda = 'Es la única columna.';
    else if (esAlinear(accion) && alineacion === 'p') ayuda = 'Esta columna tiene ancho fijo: cambiala desde Ver código.';
    else if (esAlinear(accion) && ALINEAR[accion] === alineacion) habilitada = false;
    return ayuda ? { accion, texto, habilitada: false, ayuda } : { accion, texto, habilitada };
  });
}

export function operacionDe(accion: AccionDeTabla, celda: Celda): Operacion {
  switch (accion) {
    case 'fila-arriba': return (t, i) => agregarFila(t, i, celda.fila, 'arriba');
    case 'fila-abajo': return (t, i) => agregarFila(t, i, celda.fila, 'abajo');
    case 'columna-izquierda': return (t, i) => agregarColumna(t, i, celda.columna, 'izquierda');
    case 'columna-derecha': return (t, i) => agregarColumna(t, i, celda.columna, 'derecha');
    case 'borrar-fila': return (t, i) => borrarFila(t, i, celda.fila);
    case 'borrar-columna': return (t, i) => borrarColumna(t, i, celda.columna);
    default: return (t, i) => alinearColumna(t, i, celda.columna, ALINEAR[accion]);
  }
}

// La pregunta antes de borrar una fila o columna que tiene contenido; null si no hace falta.
export function preguntaAntesDe(texto: string, tabla: TablaLeida, accion: AccionDeTabla, celda: Celda): string | null {
  const conContenido = (c: { contenido: { desde: number; hasta: number } } | undefined) =>
    c !== undefined && texto.slice(c.contenido.desde, c.contenido.hasta).trim() !== '';
  if (accion === 'borrar-fila') return tabla.filas[celda.fila]?.celdas.some(conContenido) ? '¿Borrar esta fila? Tiene contenido.' : null;
  if (accion === 'borrar-columna') return tabla.filas.some((f) => conContenido(f.celdas[celda.columna])) ? '¿Borrar esta columna? Tiene contenido.' : null;
  return null;
}

// La celda que queda abierta después de la acción: la nueva, lista para escribir. null si ninguna.
export function celdaTras(accion: AccionDeTabla, celda: Celda): Celda | null {
  switch (accion) {
    case 'fila-arriba': case 'columna-izquierda': return celda;
    case 'fila-abajo': return { fila: celda.fila + 1, columna: celda.columna };
    case 'columna-derecha': return { fila: celda.fila, columna: celda.columna + 1 };
    default: return null;
  }
}

async function elegir(vista: EditorView, desde: number, celda: Celda, accion: AccionDeTabla): Promise<void> {
  const texto = vista.state.doc.toString();
  const lugar = tablaEn(texto, desde);
  if (!lugar) return;
  const pregunta = preguntaAntesDe(texto, lugar.tabla, accion, celda);
  if (pregunta) {
    const borrar = await preguntar(pregunta, [
      { texto: 'Borrar', valor: true, principal: true },
      { texto: 'Cancelar', valor: false, neutra: true },
    ]);
    if (!borrar) return;
  }
  // Tras la pregunta el documento pudo cambiar: la transacción se arma sobre el estado vigente.
  const transaccion = transaccionDeTabla(vista.state, desde, operacionDe(accion, celda));
  if (!transaccion) return;
  vista.dispatch(transaccion);
  const abrir = celdaTras(accion, celda);
  if (abrir) abrirCelda(vista, desde, abrir, true);
}

let cerrarMenu: (() => void) | null = null;

// Muestra el menú de esa celda junto a `ancla`. Lo que estuviera a medio escribir se aplica antes.
export function abrirMenuDeCelda(vista: EditorView, desde: number, celda: Celda, ancla: HTMLElement): void {
  cerrarMenu?.();
  // Confirmar la celda abierta redibuja la tabla: el lugar del ancla se toma antes.
  const lugarDelAncla = ancla.getBoundingClientRect();
  if (!confirmarCeldaAbierta() || vista.state.readOnly) return;
  const tabla = tablaEn(vista.state.doc.toString(), desde)?.tabla;
  if (!tabla?.filas[celda.fila]?.celdas[celda.columna]) return;

  const menu = el('div', { clase: 'menu-celda', role: 'menu' });
  const alClicAfuera = (evento: Event) => {
    if (!menu.contains(evento.target as Node)) cerrar();
  };
  function cerrar(): void {
    cerrarMenu = null;
    menu.remove();
    document.removeEventListener('mousedown', alClicAfuera, true);
    window.removeEventListener('blur', cerrar);
    window.removeEventListener('scroll', cerrar, true);
  }

  for (const opcion of opcionesDeCelda(tabla, celda)) {
    menu.append(el('button', {
      type: 'button', role: 'menuitem', disabled: !opcion.habilitada, title: opcion.ayuda,
      alClick: () => {
        cerrar();
        void elegir(vista, desde, celda, opcion.accion);
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
    const opciones = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const actual = opciones.indexOf(document.activeElement as HTMLButtonElement);
    opciones[(actual + (evento.key === 'ArrowDown' ? 1 : opciones.length - 1)) % opciones.length]?.focus();
  });

  document.body.append(menu);
  // Debajo del ancla; si no entra en la ventana, arriba o corrido hacia la izquierda.
  const alto = menu.offsetHeight;
  const ancho = menu.offsetWidth;
  const arriba = lugarDelAncla.bottom + 2 + alto > window.innerHeight ? Math.max(4, lugarDelAncla.top - alto - 2) : lugarDelAncla.bottom + 2;
  menu.style.top = `${arriba}px`;
  menu.style.left = `${Math.max(4, Math.min(lugarDelAncla.left, window.innerWidth - ancho - 4))}px`;

  cerrarMenu = cerrar;
  document.addEventListener('mousedown', alClicAfuera, true);
  window.addEventListener('blur', cerrar);
  window.addEventListener('scroll', cerrar, true);
  menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
}
