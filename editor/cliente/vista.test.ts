import fs from 'node:fs';
import path from 'node:path';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import type { Etiqueta } from '../compartido/tipos';
import { ctxDePrueba, decos, ETIQUETA_DE_PRUEBA as etiqueta } from '../pruebas/ayudas/decoraciones';
import { DIR_FIXTURE, leerFixture } from '../pruebas/ayudas/temporales';
import { decorar, type ContextoVista } from './vista';

const ctx = ctxDePrueba();

describe('decorar', () => {
  it('título: oculta el comando, numera y estiliza', () => {
    const d = decos('Texto\n\\section{Hola}\n', 0, ctx);
    expect(d).toContainEqual({ desde: 6, hasta: 15, reemplaza: true });
    expect(d).toContainEqual({ desde: 19, hasta: 20, reemplaza: true });
    expect(d).toContainEqual(expect.objectContaining({ desde: 15, widget: '2.1', clase: 'cm-numero-titulo' }));
    expect(d).toContainEqual(expect.objectContaining({ desde: 6, hasta: 6, clase: 'cm-titulo-1' }));
  });

  it('con el cursor dentro del título no oculta nada', () => {
    const d = decos('Texto\n\\section{Hola}\n', 17, ctx);
    expect(d.some((x) => x.reemplaza || x.widget)).toBe(false);
    expect(d).toContainEqual(expect.objectContaining({ clase: 'cm-titulo-1' }));
  });

  it('el cursor en el borde del elemento también lo revela', () => {
    expect(decos('Texto\n\\section{Hola}\n', 6, ctx).some((x) => x.reemplaza)).toBe(false);
    expect(decos('Texto\n\\section{Hola}\n', 20, ctx).some((x) => x.reemplaza)).toBe(false);
    expect(decos('Texto\n\\section{Hola}\n', 5, ctx).some((x) => x.reemplaza)).toBe(true);
  });

  // Al abrir un archivo el cursor queda en 0: sin foco, eso no debe revelar el primer título.
  it('sin foco en el editor nada se revela aunque el cursor esté adentro', () => {
    const estado = EditorState.create({ doc: '\\chapter{Hola}\n', selection: { anchor: 0 } });
    const reemplazos = (conFoco: boolean) => {
      let n = 0;
      decorar(estado, ctx, conFoco).between(0, 15, (_d, _h, d) => { if (d.spec.reemplaza) n++; });
      return n;
    };
    expect(reemplazos(false)).toBe(2);
    expect(reemplazos(true)).toBe(0);
  });

  it.each([[0, 'cm-titulo-0'], [1, 'cm-titulo-1'], [2, 'cm-titulo-2'], [3, 'cm-titulo-3']])('nivel %i usa %s', (nivel, clase) => {
    const comando = ['chapter', 'section', 'subsection', 'subsubsection'][nivel];
    expect(decos(`x\n\\${comando}{T}`, 0, ctx)).toContainEqual(expect.objectContaining({ clase }));
  });

  it('un título sin número no lleva widget', () => {
    expect(decos('x\n\\section*{Hola}', 0, ctx).some((x) => x.widget !== undefined)).toBe(false);
    expect(decos('x\n\\section{Hola}', 0, { ...ctx, numeroCapitulo: null }).some((x) => x.widget !== undefined)).toBe(false);
  });

  it('negrita', () => {
    const d = decos('a \\textbf{b} c', 0, ctx);
    expect(d).toContainEqual({ desde: 2, hasta: 10, reemplaza: true });
    expect(d).toContainEqual({ desde: 10, hasta: 11, clase: 'cm-negrita', reemplaza: false });
    expect(d).toContainEqual({ desde: 11, hasta: 12, reemplaza: true });
  });

  it.each([['textit', 'cm-cursiva'], ['emph', 'cm-cursiva'], ['texttt', 'cm-mono']])('\\%s usa %s', (comando, clase) => {
    expect(decos(`a \\${comando}{b} c`, 0, ctx)).toContainEqual(expect.objectContaining({ clase, reemplaza: false }));
  });

  it('con el cursor dentro, la negrita conserva el estilo y muestra el comando', () => {
    const d = decos('a \\textbf{b} c', 10, ctx);
    expect(d.some((x) => x.reemplaza)).toBe(false);
    expect(d).toContainEqual(expect.objectContaining({ desde: 10, hasta: 11, clase: 'cm-negrita' }));
  });

  it('un formato vacío no produce una marca vacía', () => {
    expect(() => decos('a \\textbf{} c', 0, ctx)).not.toThrow();
  });

  it('referencia conocida muestra número y título', () => {
    expect(decos('ver ~\\ref{sec:CAP2_IA} x', 0, ctx)).toContainEqual(
      { desde: 5, hasta: 22, reemplaza: true, widget: '2.1 Inteligencia Artificial', clase: 'cm-ref' });
  });

  it('referencia desconocida se marca rota', () => {
    expect(decos('\\ref{nada} x', 12, ctx)).toContainEqual(
      expect.objectContaining({ widget: 'nada', clase: 'cm-ref cm-ref-rota', reemplaza: true }));
  });

  it('referencia a una etiqueta sin número muestra solo el título', () => {
    const sinNumero: ContextoVista = { numeroCapitulo: null, etiquetas: new Map([['a', { ...etiqueta, nombre: 'a', numero: null }]]) };
    expect(decos('x \\ref{a} y', 0, sinNumero)).toContainEqual(expect.objectContaining({ widget: 'Inteligencia Artificial' }));
  });

  it('referencia a una figura, tabla o ecuación muestra solo su número', () => {
    const figura: Etiqueta = { nombre: 'fig:a', ruta: 'Cap2.tex', linea: 3, clase: 'figura', titulo: '', numero: '2.1' };
    const conFigura: ContextoVista = { ...ctx, etiquetas: new Map([['fig:a', figura]]) };
    expect(decos('ver \\ref{fig:a} x', 0, conFigura)).toContainEqual(
      { desde: 4, hasta: 15, reemplaza: true, widget: '2.1', clase: 'cm-ref' });
  });

  it('referencia a un objeto sin número muestra la clave, sin marcarla rota', () => {
    const tabla: Etiqueta = { nombre: 'tab:a', ruta: 'Cap2.tex', linea: 3, clase: 'tabla', titulo: '', numero: null };
    const conTabla: ContextoVista = { ...ctx, etiquetas: new Map([['tab:a', tabla]]) };
    expect(decos('ver \\ref{tab:a} x', 0, conTabla)).toContainEqual(
      expect.objectContaining({ widget: 'tab:a', clase: 'cm-ref' }));
  });

  it('cita muestra las claves', () => {
    expect(decos('según \\cite{Perez2020, Lopez2019} x', 0, ctx)).toContainEqual(
      expect.objectContaining({ widget: 'Perez2020, Lopez2019', clase: 'cm-cita', reemplaza: true }));
  });

  it('ítems de enumerate muestran 1. y 2.; los de itemize •', () => {
    const numerada = decos('x\n\\begin{enumerate}\n\\item a\n\\item b\n\\end{enumerate}', 0, ctx);
    expect(numerada.filter((x) => x.clase === 'cm-vineta').map((x) => x.widget)).toEqual(['1.', '2.']);
    const simple = decos('x\n\\begin{itemize}\n\\item a\n\\end{itemize}', 0, ctx);
    expect(simple.filter((x) => x.clase === 'cm-vineta').map((x) => x.widget)).toEqual(['•']);
    expect(simple.filter((x) => x.clase === 'cm-atenuado')).toHaveLength(2);
  });

  it('comentario y etiqueta atenuados, sin ocultarse', () => {
    const d = decos('x \\label{sec:a} % nota', 0, ctx);
    expect(d).toContainEqual({ desde: 2, hasta: 15, clase: 'cm-atenuado', reemplaza: false });
    expect(d).toContainEqual({ desde: 16, hasta: 22, clase: 'cm-atenuado', reemplaza: false });
  });

  it('un comando no reconocido se marca cm-comando y no se oculta', () => {
    const d = decos('\\hfill \\break', 0, ctx);
    expect(d.filter((x) => x.clase === 'cm-comando')).toEqual([
      { desde: 0, hasta: 6, clase: 'cm-comando', reemplaza: false },
      { desde: 7, hasta: 13, clase: 'cm-comando', reemplaza: false },
    ]);
    expect(d.some((x) => x.reemplaza)).toBe(false);
  });

  it('los comandos reconocidos no llevan además cm-comando', () => {
    const d = decos('x \\textbf{a} \\ref{sec:CAP2_IA} \\cite{k} \\label{l} % \\otro', 0, ctx);
    expect(d.some((x) => x.clase === 'cm-comando')).toBe(false);
  });

  it('decorar nunca cambia el documento', () => {
    for (const nombre of fs.readdirSync(DIR_FIXTURE).filter((n) => n.endsWith('.tex'))) {
      const texto = leerFixture(nombre);
      const estado = EditorState.create({ doc: texto });
      decorar(estado, ctx);
      expect(estado.doc.toString()).toBe(texto);
    }
  });

  it('decora todos los fixtures sin lanzar excepción, con el cursor en cada inicio de línea', () => {
    for (const nombre of fs.readdirSync(DIR_FIXTURE).filter((n) => n.endsWith('.tex'))) {
      const texto = leerFixture(path.basename(nombre));
      let posicion = 0;
      for (const linea of texto.split('\n')) {
        expect(() => decos(texto, posicion, ctx), `${nombre} @${posicion}`).not.toThrow();
        posicion += linea.length + 1;
      }
    }
  });
});
