import { StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { analizar, type Elemento, type Rango } from '../compartido/analizador';
import { numerarObjetos, numerarTitulos } from '../compartido/numeracion';
import { decorarCodigo, esCodigo } from './bloques/codigo';
import { decorarEcuaciones, esMatematica } from './bloques/ecuacion';
import { decorarFiguras, protegerEpigrafe } from './bloques/figura';
import { Pastilla } from './bloques/pastilla';
import type { ContextoVista, Decorador, Dibujo } from './bloques/tipos';

export type { ContextoVista } from './bloques/tipos';

// Cada clase de bloque se dibuja en su archivo; acá queda la prosa: títulos, formato, listas, referencias.
const BLOQUES: Decorador[] = [decorarCodigo, decorarEcuaciones, decorarFiguras];

const CLASE_DE_ESTILO = { negrita: 'cm-negrita', cursiva: 'cm-cursiva', mono: 'cm-mono' } as const;
const COMANDO = /\\[a-zA-Z@]+\*?/g;
// Elementos cuyo comando, cuando queda a la vista, se muestra como cualquier otro código.
const SIN_DIBUJO_PROPIO = new Set<Elemento['tipo']>(['preambulo', 'comentario', 'entorno', 'imagen', 'epigrafe']);

// Solo dibuja: el documento sigue siendo el LaTeX literal. Un elemento que la selección
// toca queda sin reemplazos, para que se vea y se pueda editar su código; sin foco en el
// editor no hay selección que valga y todo se muestra formateado.
export function decorar(estado: EditorState, ctx: ContextoVista, conFoco = true): DecorationSet {
  const texto = estado.doc.toString();
  const elementos = analizar(texto);
  const numeros = numerarTitulos(elementos, ctx.numeroCapitulo);
  const rangos: Range<Decoration>[] = [];

  const activo = (e: Rango) => conFoco && estado.selection.ranges.some((r) => r.from <= e.hasta && r.to >= e.desde);
  const ocultar = (desde: number, hasta: number) => {
    if (hasta > desde) rangos.push(Decoration.replace({ reemplaza: true }).range(desde, hasta));
  };
  const marcar = (desde: number, hasta: number, clase: string) => {
    if (hasta > desde) rangos.push(Decoration.mark({ class: clase }).range(desde, hasta));
  };
  const reemplazar = (e: Rango, textoVisible: string, clase: string) => {
    rangos.push(Decoration.replace({ widget: new Pastilla(textoVisible, clase), reemplaza: true }).range(e.desde, e.hasta));
  };

  // Posiciones que ya tienen dibujo propio: ahí no se aplica el resaltado genérico de comandos.
  const reconocidos = new Set<number>();
  // Tramos donde un `\algo` no se resalta como comando suelto: comentarios, código literal y fórmulas.
  const sinComandos: Rango[] = elementos.filter((e) => esCodigo(e) || esMatematica(e));

  for (const e of elementos) {
    if (!SIN_DIBUJO_PROPIO.has(e.tipo)) reconocidos.add(e.desde);
    switch (e.tipo) {
      case 'titulo': {
        rangos.push(Decoration.line({ class: `cm-titulo-${e.nivel}` }).range(estado.doc.lineAt(e.desde).from));
        if (activo(e)) break;
        ocultar(e.desde, e.contenido.desde);
        const numero = numeros.get(e.desde);
        if (numero) {
          rangos.push(Decoration.widget({ widget: new Pastilla(numero, 'cm-numero-titulo'), side: -1 }).range(e.contenido.desde));
        }
        ocultar(e.contenido.hasta, e.hasta);
        break;
      }
      case 'formato':
        marcar(e.contenido.desde, e.contenido.hasta, CLASE_DE_ESTILO[e.estilo]);
        if (activo(e)) break;
        ocultar(e.desde, e.contenido.desde);
        ocultar(e.contenido.hasta, e.hasta);
        break;
      case 'item':
        if (!activo(e)) reemplazar(e, e.ordinal === null ? '•' : `${e.ordinal}.`, 'cm-vineta');
        break;
      case 'ref': {
        if (activo(e)) break;
        const destino = ctx.etiquetas.get(e.clave);
        if (destino) reemplazar(e, [destino.numero, destino.titulo].filter(Boolean).join(' ') || e.clave, 'cm-ref');
        else reemplazar(e, e.clave, 'cm-ref cm-ref-rota');
        break;
      }
      case 'cita':
        if (!activo(e)) reemplazar(e, e.claves.join(', '), 'cm-cita');
        break;
      case 'comentario':
        sinComandos.push(e);
        marcar(e.desde, e.hasta, 'cm-atenuado');
        break;
      case 'inicioLista':
      case 'finLista':
      case 'etiqueta':
        marcar(e.desde, e.hasta, 'cm-atenuado');
        break;
      default:
        break;
    }
  }

  const dibujo: Dibujo = { estado, texto, elementos, ctx, objetos: numerarObjetos(texto, elementos, ctx.numeroCapitulo), activo };
  for (const bloque of BLOQUES) rangos.push(...bloque(dibujo));

  // Todo comando que el editor no sabe dibujar se muestra como código.
  sinComandos.sort((a, b) => a.desde - b.desde);
  let indice = 0;
  for (const m of texto.matchAll(COMANDO)) {
    const desde = m.index;
    while (indice < sinComandos.length && sinComandos[indice].hasta <= desde) indice++;
    const excluido = indice < sinComandos.length && sinComandos[indice].desde <= desde;
    if (!excluido && !reconocidos.has(desde)) marcar(desde, desde + m[0].length, 'cm-comando');
  }

  return Decoration.set(rangos, true);
}

// Fuerza a recalcular cuando cambia algo que no está en el documento: las etiquetas del proyecto.
export const contextoCambiado = StateEffect.define<null>();

export function extensionVista(obtenerCtx: () => ContextoVista): Extension {
  const focoCambiado = StateEffect.define<boolean>();
  const foco = StateField.define<boolean>({
    create: () => false,
    update: (valor, tr) => tr.effects.reduce((v, e) => (e.is(focoCambiado) ? e.value : v), valor),
  });
  const decoraciones = StateField.define<DecorationSet>({
    create: (estado) => decorar(estado, obtenerCtx(), estado.field(foco)),
    update(valor, tr) {
      const cambio = tr.docChanged || tr.selection !== undefined
        || tr.effects.some((e) => e.is(contextoCambiado) || e.is(focoCambiado));
      return cambio ? decorar(tr.state, obtenerCtx(), tr.state.field(foco)) : valor;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  return [foco, decoraciones, protegerEpigrafe, EditorView.focusChangeEffect.of((_estado, enfocando) => focoCambiado.of(enfocando))];
}
