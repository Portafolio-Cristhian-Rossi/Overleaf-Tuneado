import { EditorState } from '@codemirror/state';
import { decorar, type ContextoVista } from '../../cliente/vista';
import type { Etiqueta } from '../../compartido/tipos';

export interface Deco { desde: number; hasta: number; clase?: string; reemplaza: boolean; widget?: string; numero?: string }

// Decoraciones resultantes, sin tocar el DOM. De cada widget se leen `texto`, `clase` y `numero`.
export function decos(texto: string, cursor: number, ctx: ContextoVista, conFoco = true): Deco[] {
  const estado = EditorState.create({ doc: texto, selection: { anchor: cursor } });
  const salida: Deco[] = [];
  decorar(estado, ctx, conFoco).between(0, texto.length, (desde, hasta, d) => {
    const widget = d.spec.widget as { texto: string; clase: string; numero?: string } | undefined;
    salida.push({
      desde, hasta,
      clase: widget ? widget.clase : d.spec.class,
      reemplaza: d.spec.reemplaza === true,
      widget: widget?.texto,
      numero: widget?.numero,
    });
  });
  return salida;
}

export const ETIQUETA_DE_PRUEBA: Etiqueta = {
  nombre: 'sec:CAP2_IA', ruta: 'Cap2.tex', linea: 15, clase: 'seccion', titulo: 'Inteligencia Artificial', numero: '2.1',
};

// Contexto del capítulo 2 con una etiqueta de sección; cada prueba cambia lo que necesita.
export function ctxDePrueba(cambios: Partial<ContextoVista> = {}): ContextoVista {
  return {
    numeroCapitulo: '2', etiquetas: new Map([[ETIQUETA_DE_PRUEBA.nombre, ETIQUETA_DE_PRUEBA]]),
    urlDeImagen: (ruta) => ruta, alElegirImagen: () => {},
    ...cambios,
  };
}
