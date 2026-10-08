import { isolateHistory } from '@codemirror/commands';
import type { EditorState, TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { analizar, type Elemento, type Rango } from '../../compartido/analizador';
import { analizarTabla, editarCelda, MOTIVOS, type ResultadoDeCelda, type TablaLeida } from '../../compartido/tabla';
import type { Edicion } from '../../compartido/tipos';
import { el } from '../pantalla/dom';

type Entorno = Extract<Elemento, { tipo: 'entorno' }>;

export interface Celda { fila: number; columna: number }
export type Operacion = (texto: string, interior: Rango) => Edicion | null;

const esEntorno = (nombre: Entorno['nombre']) => (e: Elemento): e is Entorno => e.tipo === 'entorno' && e.nombre === nombre;

// El tabular que empieza exactamente en `desde`, si es simple. Cada acción sobre una tabla
// dibujada lo vuelve a buscar: el documento pudo cambiar desde que se dibujó.
export function tablaEn(texto: string, desde: number): { interior: Rango; tabla: TablaLeida } | null {
  const tabular = analizar(texto).filter(esEntorno('tabular')).find((e) => e.desde === desde);
  if (!tabular) return null;
  const tabla = analizarTabla(texto, tabular.interior);
  return tabla.clase === 'simple' ? { interior: tabular.interior, tabla } : null;
}

// Los cambios de `operacion` como una transacción que se deshace de un solo paso. null si el
// editor está en solo lectura, si en `desde` ya no hay un tabular simple, o si no cambia nada.
export function transaccionDeTabla(estado: EditorState, desde: number, operacion: Operacion): TransactionSpec | null {
  if (estado.readOnly) return null;
  const texto = estado.doc.toString();
  const lugar = tablaEn(texto, desde);
  const edicion = lugar && operacion(texto, lugar.interior);
  if (!edicion || edicion.cambios.length === 0) return null;
  return {
    changes: edicion.cambios.map((c) => ({ from: c.desde, to: c.hasta, insert: c.insertar })),
    // Sin esto, dos celdas editadas seguidas se deshacen juntas.
    annotations: isolateHistory.of('full'),
    userEvent: 'input',
  };
}

// Celda a la que se pasa; null si se sale de la tabla.
export function celdaVecina(filas: number, columnas: number, celda: Celda, hacia: 'siguiente' | 'anterior' | 'abajo'): Celda | null {
  if (hacia === 'abajo') return celda.fila + 1 < filas ? { fila: celda.fila + 1, columna: celda.columna } : null;
  const orden = celda.fila * columnas + celda.columna + (hacia === 'siguiente' ? 1 : -1);
  if (orden < 0 || orden >= filas * columnas) return null;
  return { fila: Math.floor(orden / columnas), columna: orden % columnas };
}

// Dónde dejar el cursor al salir: justo después del tabular o, si lo rodea un flotante table,
// del flotante. Ahí el cursor no hace aparecer el código de la tabla. null si termina el archivo.
export function salidaDeTabla(texto: string, desde: number): number | null {
  const elementos = analizar(texto);
  const tabular = elementos.filter(esEntorno('tabular')).find((e) => e.desde === desde);
  if (!tabular) return null;
  const flotante = elementos.filter(esEntorno('table')).find((e) => e.desde < tabular.desde && tabular.hasta <= e.hasta);
  const hasta = (flotante ?? tabular).hasta;
  return hasta < texto.length ? hasta + 1 : null;
}

// La única celda con su campo abierto.
interface Abierta {
  vista: EditorView; desde: number; celda: Celda;
  td: HTMLTableCellElement; campo: HTMLInputElement;
  // Lo que mostraba la celda: vuelve a su lugar si no hay nada que aplicar.
  piezas: Node[];
  motivo: HTMLElement | null;
}
let abierta: Abierta | null = null;

function nodoDeCelda(vista: EditorView, desde: number, celda: Celda): HTMLTableCellElement | null {
  for (const nodo of vista.contentDOM.querySelectorAll<HTMLElement>('.cm-tabla')) {
    if (vista.posAtDOM(nodo) === desde) return nodo.querySelector(`td[data-fila="${celda.fila}"][data-columna="${celda.columna}"]`);
  }
  return null;
}

function cerrar(a: Abierta): void {
  abierta = null;
  a.campo.remove();
  a.motivo?.remove();
  a.td.classList.remove('cm-celda-error');
  a.td.prepend(...a.piezas);
}

function mostrarError(a: Abierta, motivo: string): void {
  a.td.classList.add('cm-celda-error');
  a.campo.setAttribute('aria-invalid', 'true');
  a.motivo ??= el('span', { clase: 'cm-celda-motivo', role: 'alert' });
  a.motivo.textContent = motivo;
  a.campo.after(a.motivo);
}

// Aplica la celda abierta, si hay una. false si lo escrito no se pudo aplicar: la celda sigue
// abierta, en rojo y con el motivo.
export function confirmarCeldaAbierta(): boolean {
  const a = abierta;
  if (!a) return true;
  // La tabla se redibujó o el editor dejó de admitir cambios: no hay dónde aplicar.
  if (!a.td.isConnected || a.vista.state.readOnly) {
    cerrar(a);
    return true;
  }
  const texto = a.vista.state.doc.toString();
  const lugar = tablaEn(texto, a.desde);
  const resultado: ResultadoDeCelda = lugar
    ? editarCelda(texto, lugar.interior, a.celda.fila, a.celda.columna, a.campo.value)
    : { tipo: 'error', motivo: MOTIVOS.noEsta };
  if (resultado.tipo === 'error') {
    mostrarError(a, resultado.motivo);
    return false;
  }
  // Se cierra antes de despachar: al redibujarse la tabla, el campo viejo no debe confirmar de nuevo.
  cerrar(a);
  const transaccion = transaccionDeTabla(a.vista.state, a.desde, () => resultado.edicion);
  if (transaccion) a.vista.dispatch(transaccion);
  return true;
}

// Deja la tabla: el cursor del editor queda después de ella, donde no hace aparecer su código.
function salir(vista: EditorView, desde: number): void {
  const posicion = salidaDeTabla(vista.state.doc.toString(), desde);
  if (posicion === null) {
    (document.activeElement as HTMLElement | null)?.blur();
    return;
  }
  vista.dispatch({ selection: { anchor: posicion } });
  vista.focus();
}

function alTeclear(evento: KeyboardEvent): void {
  const a = abierta;
  if (!a || evento.isComposing) return;
  if (evento.key === 'Escape') {
    evento.preventDefault();
    cerrar(a);
    salir(a.vista, a.desde);
    return;
  }
  const hacia = evento.key === 'Tab' ? (evento.shiftKey ? 'anterior' : 'siguiente') : evento.key === 'Enter' ? 'abajo' : null;
  if (!hacia) return;
  evento.preventDefault();
  if (!confirmarCeldaAbierta()) return;
  const tabla = tablaEn(a.vista.state.doc.toString(), a.desde)?.tabla;
  const vecina = tabla ? celdaVecina(tabla.filas.length, tabla.columnas.length, a.celda, hacia) : null;
  if (vecina) abrirCelda(a.vista, a.desde, vecina, true);
  else salir(a.vista, a.desde);
}

// Abre el campo de una celda de la tabla dibujada en `desde`, con el LaTeX que hoy tiene en el
// documento. No hace nada si no se puede editar.
export function abrirCelda(vista: EditorView, desde: number, celda: Celda, seleccionarTodo: boolean): void {
  if (abierta && abierta.vista === vista && abierta.desde === desde
    && abierta.celda.fila === celda.fila && abierta.celda.columna === celda.columna && abierta.td.isConnected) {
    abierta.campo.focus();
    return;
  }
  if (!confirmarCeldaAbierta() || vista.state.readOnly) return;

  const texto = vista.state.doc.toString();
  const contenido = tablaEn(texto, desde)?.tabla.filas[celda.fila]?.celdas[celda.columna]?.contenido;
  const td = nodoDeCelda(vista, desde, celda);
  if (!contenido || !td) return;

  const campo = el('input', { type: 'text', clase: 'cm-celda-campo', 'aria-label': 'Celda' });
  campo.value = texto.slice(contenido.desde, contenido.hasta);
  // El campo toma el ancho que tenía el texto de la celda, para que la tabla no salte al abrirlo.
  const estilo = getComputedStyle(td);
  campo.style.width = `${Math.max(0, td.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight))}px`;

  // El botón del menú se queda en la celda; lo demás deja su lugar al campo.
  const piezas = [...td.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains('cm-celda-menu')));
  for (const pieza of piezas) pieza.remove();
  td.prepend(campo);
  const esta: Abierta = { vista, desde, celda, td, campo, piezas, motivo: null };
  abierta = esta;

  campo.addEventListener('keydown', alTeclear);
  campo.addEventListener('blur', () => {
    if (abierta === esta) confirmarCeldaAbierta();
  });
  campo.focus();
  if (seleccionarTodo) campo.select();
  else campo.setSelectionRange(campo.value.length, campo.value.length);
}
