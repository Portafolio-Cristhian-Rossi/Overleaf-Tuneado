import { isolateHistory } from '@codemirror/commands';
import type { EditorState, TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { analizar, type Elemento, type Rango } from '../../compartido/analizador';
import { analizarTabla, editarCelda, MOTIVOS, type TablaLeida } from '../../compartido/tabla';
import type { Edicion } from '../../compartido/tipos';
import { alternarFormato } from '../comandos';
import { el } from '../pantalla/dom';

type Entorno = Extract<Elemento, { tipo: 'entorno' }>;

export interface Celda { fila: number; columna: number }
export type Operacion = (texto: string, interior: Rango) => Edicion | null;

const esEntorno = (nombre: Entorno['nombre']) => (e: Elemento): e is Entorno => e.tipo === 'entorno' && e.nombre === nombre;

// El tabular que empieza exactamente en `desde`, si es simple, con su código (`fuente`). Cada
// acción sobre una tabla dibujada lo vuelve a buscar: el documento pudo cambiar desde que se dibujó.
export function tablaEn(texto: string, desde: number): { interior: Rango; tabla: TablaLeida; fuente: string } | null {
  const tabular = analizar(texto).filter(esEntorno('tabular')).find((e) => e.desde === desde);
  if (!tabular) return null;
  const tabla = analizarTabla(texto, tabular.interior);
  return tabla.clase === 'simple' ? { interior: tabular.interior, tabla, fuente: texto.slice(tabular.desde, tabular.hasta) } : null;
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

// Lo que se muestra en el campo de una celda. El campo es de una sola línea y el navegador le
// quita los saltos: cada salto, con su sangría, pasa a ser un espacio, para que no se peguen palabras.
export function valorDeCampo(contenido: string): string {
  return contenido.replace(/[ \t]*\n\s*/g, ' ');
}

export type Resolucion = { tipo: 'nada' } | { tipo: 'error'; motivo: string } | { tipo: 'aplicar'; edicion: Edicion };

// Qué hacer al confirmar una celda. `inicial` es lo que mostraba el campo al abrirse y `fuente`,
// el código de la tabla en ese momento. Si no se escribió nada, no se toca nada: abrir una celda
// y salir nunca cambia el documento. Si la tabla ya no es aquella, no se aplica.
export function resolverCelda(texto: string, desde: number, fuente: string, celda: Celda, inicial: string, valor: string): Resolucion {
  if (valor === inicial) return { tipo: 'nada' };
  const lugar = tablaEn(texto, desde);
  if (!lugar || lugar.fuente !== fuente) return { tipo: 'error', motivo: MOTIVOS.noEsta };
  const resultado = editarCelda(texto, lugar.interior, celda.fila, celda.columna, valor);
  if (resultado.tipo === 'error') return resultado;
  return resultado.edicion.cambios.length === 0 ? { tipo: 'nada' } : { tipo: 'aplicar', edicion: resultado.edicion };
}

// Negrita o cursiva sobre lo seleccionado en el campo de una celda: lo mismo que en el texto.
export function formatoEnCampo(valor: string, desde: number, hasta: number, comando: 'textbf' | 'textit'): { valor: string; desde: number; hasta: number } {
  const edicion = alternarFormato(valor, { desde, hasta }, comando);
  let nuevo = valor;
  for (const c of [...edicion.cambios].sort((a, b) => b.desde - a.desde)) nuevo = nuevo.slice(0, c.desde) + c.insertar + nuevo.slice(c.hasta);
  return { valor: nuevo, desde: edicion.seleccion.ancla, hasta: edicion.seleccion.cabeza };
}

// La única celda con su campo abierto.
interface Abierta {
  vista: EditorView; desde: number; celda: Celda;
  td: HTMLTableCellElement; campo: HTMLInputElement;
  // Lo que mostraba el campo al abrirse y el código de la tabla en ese momento.
  inicial: string; fuente: string;
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

// Dónde empieza hoy la tabla de la celda abierta: el documento pudo cambiar antes de ella. Si
// su dibujo ya no está en pantalla, vale la posición que tenía al abrirse.
function desdeVigente(a: Abierta): number {
  const tabla = a.td.isConnected ? a.td.closest<HTMLElement>('.cm-tabla') : null;
  return tabla ? a.vista.posAtDOM(tabla) : a.desde;
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
  if (a.vista.state.readOnly) {
    cerrar(a);
    return true;
  }
  const enPantalla = a.td.isConnected;
  const desde = desdeVigente(a);
  const resolucion = resolverCelda(a.vista.state.doc.toString(), desde, a.fuente, a.celda, a.inicial, a.campo.value);
  // Un error solo se puede mostrar si la celda sigue en pantalla; si no, lo escrito se descarta.
  if (resolucion.tipo === 'error' && enPantalla) {
    mostrarError(a, resolucion.motivo);
    return false;
  }
  // Se cierra antes de despachar: al redibujarse la tabla, el campo viejo no debe confirmar de nuevo.
  cerrar(a);
  if (resolucion.tipo === 'aplicar') {
    const transaccion = transaccionDeTabla(a.vista.state, desde, () => resolucion.edicion);
    if (transaccion) a.vista.dispatch(transaccion);
  }
  return true;
}

// El dibujo de una tabla dejó la pantalla (quedó lejos al desplazarse, o se ve su código) con
// una celda abierta: lo escrito se aplica igual, cuando termine la actualización en curso.
export function soltarCeldaDe(nodo: HTMLElement): void {
  const a = abierta;
  if (a && nodo.contains(a.td)) setTimeout(() => { if (abierta === a) confirmarCeldaAbierta(); }, 0);
}

// Negrita o cursiva en la celda abierta, si el foco está en su campo. false si no hay tal celda.
export function formatoEnCeldaAbierta(comando: 'textbf' | 'textit'): boolean {
  const campo = abierta?.campo;
  if (!campo || document.activeElement !== campo) return false;
  const r = formatoEnCampo(campo.value, campo.selectionStart ?? campo.value.length, campo.selectionEnd ?? campo.value.length, comando);
  campo.value = r.valor;
  campo.setSelectionRange(r.desde, r.hasta);
  return true;
}

// Deja la tabla: el foco vuelve al editor, con el cursor después de ella.
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
  if ((evento.ctrlKey || evento.metaKey) && !evento.altKey && (evento.key === 'b' || evento.key === 'i')) {
    evento.preventDefault();
    formatoEnCeldaAbierta(evento.key === 'b' ? 'textbf' : 'textit');
    return;
  }
  if (evento.key === 'Escape') {
    evento.preventDefault();
    const desde = desdeVigente(a);
    cerrar(a);
    salir(a.vista, desde);
    return;
  }
  const hacia = evento.key === 'Tab' ? (evento.shiftKey ? 'anterior' : 'siguiente') : evento.key === 'Enter' ? 'abajo' : null;
  if (!hacia) return;
  evento.preventDefault();
  // Lo que se aplica cae dentro de la tabla: su comienzo no cambia al confirmar.
  const desde = desdeVigente(a);
  if (!confirmarCeldaAbierta()) return;
  const tabla = tablaEn(a.vista.state.doc.toString(), desde)?.tabla;
  const vecina = tabla ? celdaVecina(tabla.filas.length, tabla.columnas.length, a.celda, hacia) : null;
  if (vecina) abrirCelda(a.vista, desde, vecina, true);
  else salir(a.vista, desde);
}

// Abre el campo de una celda de la tabla dibujada en `desde`, con el LaTeX que hoy tiene en el
// documento. No hace nada si no se puede editar.
export function abrirCelda(vista: EditorView, desde: number, celda: Celda, seleccionarTodo: boolean): void {
  if (abierta && abierta.vista === vista && abierta.td.isConnected && desdeVigente(abierta) === desde
    && abierta.celda.fila === celda.fila && abierta.celda.columna === celda.columna) {
    abierta.campo.focus();
    return;
  }
  if (!confirmarCeldaAbierta() || vista.state.readOnly) return;

  const texto = vista.state.doc.toString();
  const lugar = tablaEn(texto, desde);
  const contenido = lugar?.tabla.filas[celda.fila]?.celdas[celda.columna]?.contenido;
  if (!lugar || !contenido) return;

  // El cursor del editor pasa a estar después de la tabla: mientras se escribe en la celda, lo
  // que haga la barra (insertar, dar formato) cae ahí y no donde había quedado antes.
  const salida = salidaDeTabla(texto, desde);
  if (salida !== null && vista.state.selection.main.head !== salida) vista.dispatch({ selection: { anchor: salida } });
  const td = nodoDeCelda(vista, desde, celda);
  if (!td) return;

  const campo = el('input', { type: 'text', clase: 'cm-celda-campo', 'aria-label': 'Celda' });
  const inicial = valorDeCampo(texto.slice(contenido.desde, contenido.hasta));
  campo.value = inicial;
  // El campo toma el ancho que tenía el texto de la celda, para que la tabla no salte al abrirlo.
  const estilo = getComputedStyle(td);
  campo.style.width = `${Math.max(0, td.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight))}px`;

  // El botón del menú se queda en la celda; lo demás deja su lugar al campo.
  const piezas = [...td.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains('cm-celda-menu')));
  for (const pieza of piezas) pieza.remove();
  td.prepend(campo);
  const esta: Abierta = { vista, desde, celda, td, campo, inicial, fuente: lugar.fuente, piezas, motivo: null };
  abierta = esta;

  campo.addEventListener('keydown', alTeclear);
  campo.addEventListener('blur', () => {
    if (abierta === esta) confirmarCeldaAbierta();
  });
  campo.focus();
  if (seleccionarTodo) campo.select();
  else campo.setSelectionRange(campo.value.length, campo.value.length);
}
