import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { analizar } from '../../compartido/analizador';
import { ctxDePrueba, decos } from '../../pruebas/ayudas/decoraciones';
import { leerFixture } from '../../pruebas/ayudas/temporales';
import { decorar } from '../vista';
import { piezasDeCelda } from './tabla';

const R = String.raw;
const ctx = ctxDePrueba();

const TABULAR = R`\begin{tabular}{ll}
    \textbf{Sitio} & $k$ \\
    Foro & \cite{a,b} \\
  \end{tabular}`;
const T = `antes\n${R`\begin{table}[htbp]`}\n  ${R`\centering`}\n  ${R`\caption{Corpus}`}\n  ${R`\label{tab:c}`}\n  ${TABULAR}\n${R`\end{table}`}\ndespués`;
const DESDE = T.indexOf(R`\begin{tabular}`);
const HASTA = DESDE + TABULAR.length;
const EPIGRAFE = T.indexOf('Corpus');
const tablas = (t: string, cursor = 0) => decos(t, cursor, ctx).filter((x) => x.clase?.startsWith('cm-tabla'));
const algoDeTabla = (t: string, cursor: number) => decos(t, cursor, ctx)
  .some((x) => x.clase?.startsWith('cm-tabla') || x.clase === 'cm-linea-tabla' || x.clase === 'cm-prefijo-epigrafe');

describe('tablas', () => {
  it('sin el cursor: el tabular es un widget, el armado se oculta y el epígrafe lleva su número', () => {
    const d = decos(T, 0, ctx);
    expect(d).toContainEqual({ desde: DESDE, hasta: HASTA, reemplaza: true, widget: TABULAR, clase: 'cm-tabla' });
    expect(d.filter((x) => x.reemplaza && !x.widget).map((x) => T.slice(x.desde, x.hasta))).toEqual([
      `${R`\begin{table}[htbp]`}\n  ${R`\centering`}\n  ${R`\caption{`}`, `}\n  ${R`\label{tab:c}`}\n  `, `\n${R`\end{table}`}`,
    ]);
    expect(d).toContainEqual(expect.objectContaining({ desde: EPIGRAFE, hasta: EPIGRAFE, widget: 'Tabla 2.1: ', clase: 'cm-prefijo-epigrafe' }));
    expect(d).toContainEqual(expect.objectContaining({ desde: EPIGRAFE, hasta: EPIGRAFE + 6, clase: 'cm-epigrafe' }));
    expect(d).toContainEqual(expect.objectContaining({ clase: 'cm-linea-tabla' }));
  });

  it('debajo del widget no queda ninguna otra decoración', () => {
    expect(decos(T, 0, ctx).filter((x) => x.desde >= DESDE && x.hasta <= HASTA)).toHaveLength(1);
  });

  it('con el cursor en el epígrafe la tabla sigue dibujada', () => {
    for (const pos of [EPIGRAFE, EPIGRAFE + 3, EPIGRAFE + 6]) expect(tablas(T, pos), `cursor en ${pos}`).toHaveLength(1);
  });

  it('con el cursor en el armado o en el tabular se ve todo el código', () => {
    for (const pos of [T.indexOf(R`\begin{table}`), T.indexOf(R`\centering`), T.indexOf(R`\label`), DESDE, DESDE + 30, HASTA, T.indexOf('\ndespués')]) {
      expect(algoDeTabla(T, pos), `cursor en ${pos}`).toBe(false);
    }
  });

  it('sin foco se dibuja aunque el cursor esté en el tabular', () => {
    expect(decos(T, DESDE + 30, ctx, false).filter((x) => x.clase === 'cm-tabla')).toHaveLength(1);
  });

  it('una tabla sin número', () => {
    expect(decos(T, 0, ctxDePrueba({ numeroCapitulo: null }))).toContainEqual(expect.objectContaining({ widget: 'Tabla: ' }));
  });

  it('un tabular suelto se dibuja solo; con el cursor encima, no', () => {
    const suelto = `a\n${TABULAR}\nb`;
    expect(tablas(suelto)).toEqual([{ desde: 2, hasta: 2 + TABULAR.length, reemplaza: true, widget: TABULAR, clase: 'cm-tabla' }]);
    expect(decos(suelto, 0, ctx).some((x) => x.reemplaza && !x.widget)).toBe(false);
    expect(tablas(suelto, 5)).toEqual([]);
  });

  it('en un flotante que no tiene la forma de la plantilla, el tabular se dibuja y el armado queda a la vista', () => {
    const t = `${R`\begin{table}`}\nNota\n${TABULAR}\n${R`\end{table}`}\nfin`;
    expect(tablas(t, t.length).map((x) => x.clase)).toEqual(['cm-tabla']);
    expect(decos(t, t.length, ctx).some((x) => x.reemplaza && !x.widget)).toBe(false);
  });

  it('una tabla con \\multicolumn es de solo lectura; una que no se reconoce queda como código', () => {
    const combinada = R`\begin{tabular}{ll}\multicolumn{2}{c}{Total} \\ a & b \\\end{tabular}`;
    expect(tablas(`x\n${combinada}`).map((x) => x.clase)).toEqual(['cm-tabla cm-tabla-solo-lectura']);
    const rara = `x\n${R`\begin{table}\caption{C}\begin{tabular}{@{}l}a \\\end{tabular}\end{table}`}`;
    expect(algoDeTabla(rara, 0)).toBe(false);
  });

  it('un tabular dentro de otro no se dibuja', () => {
    expect(tablas(`x\n${R`\begin{tabular}{l}\begin{tabular}{l}a \\\end{tabular} \\\end{tabular}`}`)).toEqual([]);
  });

  it('las tablas del fixture', () => {
    const d = decos(leerFixture('Bloques.tex'), 0, ctxDePrueba({ numeroCapitulo: '7' }));
    expect(d.filter((x) => x.reemplaza && x.clase?.startsWith('cm-tabla')).map((x) => x.clase)).toEqual(['cm-tabla', 'cm-tabla cm-tabla-solo-lectura']);
    expect(d.filter((x) => x.widget?.startsWith('Tabla')).map((x) => x.widget)).toEqual(['Tabla 7.1: ', 'Tabla 7.2: ']);
  });

  it('la tabla dibujada deja pasar el arrastre de archivos y se queda con sus clics y sus teclas', () => {
    const estado = EditorState.create({ doc: T, selection: { anchor: 0 } });
    let tabla: { ignoreEvent(e: Event): boolean } | undefined;
    decorar(estado, ctx).between(0, T.length, (_d, _h, d) => { if (d.spec.widget?.clase === 'cm-tabla') tabla = d.spec.widget; });
    expect(tabla).toBeDefined();
    for (const tipo of ['dragenter', 'dragover', 'dragleave', 'drop']) expect(tabla!.ignoreEvent(new Event(tipo)), tipo).toBe(false);
    for (const tipo of ['mousedown', 'click', 'keydown', 'input']) expect(tabla!.ignoreEvent(new Event(tipo)), tipo).toBe(true);
  });
});

describe('citas dentro de una tabla', () => {
  const conCita = `x\n${R`\begin{tabular}{ll}`}\n${R`Cohen & \cite{CitekeyArticle} \\`}\n${R`Otro & \citeA[p.~3]{CitekeyBook} \\`}\n${R`\end{tabular}`}`;
  const tablaDe = (contexto: ReturnType<typeof ctxDePrueba>) => {
    let tabla: { citas: string[]; eq(otra: unknown): boolean } | undefined;
    decorar(EditorState.create({ doc: conCita, selection: { anchor: 0 } }), contexto).between(0, conCita.length, (_d, _h, d) => {
      if (d.spec.widget?.clase === 'cm-tabla') tabla = d.spec.widget;
    });
    return tabla!;
  };

  it('se ven como en el texto: autor y año', () => {
    expect(tablaDe(ctx).citas).toEqual(['(Cohen, 1963)', 'Susskind y Hrabovsky (2014, p. 3)']);
  });

  it('mientras no se leyó la bibliografía se ven sus claves, y la tabla se redibuja cuando llega', () => {
    const sinLeer = tablaDe(ctxDePrueba({ bibliografia: new Map() }));
    expect(sinLeer.citas).toEqual(['CitekeyArticle', 'CitekeyBook']);
    expect(sinLeer.eq(tablaDe(ctx))).toBe(false);
    expect(tablaDe(ctx).eq(tablaDe(ctx))).toBe(true);
  });
});

describe('piezasDeCelda', () => {
  const piezas = (celda: string) => piezasDeCelda(celda, { desde: 0, hasta: celda.length }, analizar(celda), (c) => c.claves.join(', '));

  it('dibuja formato, fórmulas en línea y citas; lo demás queda tal cual', () => {
    expect(piezas(R`\textbf{Sitio} y $k$ \cite{a,b} \ref{x} 50\%`)).toEqual([
      { tipo: 'formato', estilo: 'negrita', piezas: [{ tipo: 'texto', texto: 'Sitio' }] },
      { tipo: 'texto', texto: ' y ' }, { tipo: 'formula', fuente: 'k' }, { tipo: 'texto', texto: ' ' },
      { tipo: 'cita', texto: 'a, b' }, { tipo: 'texto', texto: R` \ref{x} 50\%` },
    ]);
  });

  it('anida dentro del formato', () => {
    expect(piezas(R`\textit{a \(x\)}`)).toEqual([
      { tipo: 'formato', estilo: 'cursiva', piezas: [{ tipo: 'texto', texto: 'a ' }, { tipo: 'formula', fuente: 'x' }] },
    ]);
  });

  it('una celda dentro de un documento más largo usa solo su tramo', () => {
    const t = R`\textbf{no} & a \texttt{b} & $z$`;
    const desde = t.indexOf('a ');
    expect(piezasDeCelda(t, { desde, hasta: desde + 'a \\texttt{b}'.length }, analizar(t), () => '')).toEqual([
      { tipo: 'texto', texto: 'a ' }, { tipo: 'formato', estilo: 'mono', piezas: [{ tipo: 'texto', texto: 'b' }] },
    ]);
  });

  it('lo que parece HTML es texto', () => {
    expect(piezas('<img src=x onerror=alert(1)> <b>x</b>')).toEqual([{ tipo: 'texto', texto: '<img src=x onerror=alert(1)> <b>x</b>' }]);
  });

  it('una celda vacía no tiene piezas', () => {
    expect(piezas('')).toEqual([]);
  });
});
