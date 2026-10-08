import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { ctxDePrueba, decos } from '../../pruebas/ayudas/decoraciones';
import { leerFixture } from '../../pruebas/ayudas/temporales';
import { decorar } from '../vista';
import { protegerEpigrafe } from './figura';

const ctx = ctxDePrueba();
const SIMPLE = '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{figs/a.png}\n'
  + '  \\caption{Una figura}\n  \\label{fig:a}\n\\end{figure}';
const T = `antes\n${SIMPLE}\ndespués`;
const EPIGRAFE = T.indexOf('Una figura');
const FIN_EPIGRAFE = EPIGRAFE + 'Una figura'.length;

describe('figuras', () => {
  it('sin el cursor: armado oculto, imagen y prefijo', () => {
    const d = decos(T, 0, ctx);
    expect(d.filter((x) => x.reemplaza && !x.widget).map((x) => T.slice(x.desde, x.hasta))).toEqual([
      '\\begin{figure}[htbp]\n  \\centering\n  ', '\n  \\caption{', '}\n  \\label{fig:a}\n\\end{figure}',
    ]);
    expect(d).toContainEqual({
      desde: T.indexOf('\\includegraphics'), hasta: T.indexOf('\n  \\caption'), reemplaza: true, widget: 'figs/a.png', clase: 'cm-imagen',
    });
    expect(d).toContainEqual(expect.objectContaining({ desde: EPIGRAFE, hasta: EPIGRAFE, widget: 'Figura 2.1: ', clase: 'cm-prefijo-epigrafe', reemplaza: false }));
    expect(d).toContainEqual(expect.objectContaining({ desde: EPIGRAFE, hasta: FIN_EPIGRAFE, clase: 'cm-epigrafe' }));
  });

  it('con el cursor dentro del epígrafe la figura sigue dibujada', () => {
    for (const pos of [EPIGRAFE, EPIGRAFE + 2, FIN_EPIGRAFE]) {
      expect(decos(T, pos, ctx).filter((x) => x.reemplaza), `cursor en ${pos}`).toHaveLength(4);   // los tres tramos de armado y la imagen
    }
  });

  it('con el cursor en el armado se ve todo el código, sin prefijo', () => {
    for (const pos of [T.indexOf('\\begin{figure}'), T.indexOf('\\centering'), T.indexOf('figs/a.png'), T.indexOf('\\label'), T.indexOf('\ndespués')]) {
      const d = decos(T, pos, ctx);
      expect(d.some((x) => x.reemplaza), `cursor en ${pos}`).toBe(false);
      expect(d.some((x) => x.clase === 'cm-prefijo-epigrafe'), `cursor en ${pos}`).toBe(false);
    }
  });

  it('al verse el código, todos sus comandos se resaltan como comando', () => {
    const comandos = (t: string, cursor: number) => decos(t, cursor, ctx).filter((x) => x.clase === 'cm-comando').map((x) => t.slice(x.desde, x.hasta));
    expect(comandos(T, T.indexOf('\\centering'))).toEqual(['\\begin', '\\centering', '\\includegraphics', '\\textwidth', '\\caption', '\\end']);
    const suelta = 'a\n\\includegraphics{figs/b.png}\nc';
    expect(comandos(suelta, 5)).toEqual(['\\includegraphics']);
    const tabla = '\\begin{table}\n\\begin{tabular}{l}\nx\n\\end{tabular}\n\\end{table}\n';
    expect(comandos(tabla, 0)).toEqual(['\\begin', '\\begin', '\\end', '\\end']);
  });

  it('una selección que sale del epígrafe muestra el código', () => {
    expect(decos(T, EPIGRAFE - 1, ctx).some((x) => x.reemplaza)).toBe(false);
    expect(decos(T, FIN_EPIGRAFE + 1, ctx).some((x) => x.reemplaza)).toBe(false);
  });

  it('sin foco se dibuja aunque el cursor esté en el armado', () => {
    expect(decos(T, T.indexOf('\\centering'), ctx, false).filter((x) => x.reemplaza)).toHaveLength(4);
  });

  it('una figura no dibujable queda como código', () => {
    const t = '\\begin{figure}\\includegraphics{a}\\includegraphics{b}\\end{figure}\n';
    const d = decos(t, t.length, ctx);
    expect(d.some((x) => x.reemplaza)).toBe(false);
    expect(d.some((x) => x.clase === 'cm-imagen')).toBe(false);
  });

  it('una imagen fuera de una figura se dibuja sola, y con el cursor encima muestra el código', () => {
    const t = 'a\n\\includegraphics{figs/b.png}\nc';
    expect(decos(t, 0, ctx)).toContainEqual({ desde: 2, hasta: t.indexOf('\nc'), reemplaza: true, widget: 'figs/b.png', clase: 'cm-imagen' });
    expect(decos(t, 5, ctx).some((x) => x.reemplaza)).toBe(false);
  });

  it('figura sin número y figura sin epígrafe', () => {
    expect(decos(T, 0, ctxDePrueba({ numeroCapitulo: null }))).toContainEqual(expect.objectContaining({ widget: 'Figura: ' }));
    const sinEpigrafe = 'x\n\\begin{figure}\n\\includegraphics{a.png}\n\\end{figure}\n';
    const d = decos(sinEpigrafe, 0, ctx);
    expect(d.filter((x) => x.reemplaza)).toHaveLength(3);
    expect(d.some((x) => x.clase === 'cm-prefijo-epigrafe')).toBe(false);
  });

  it('la segunda figura del capítulo lleva el número siguiente', () => {
    const dos = `${SIMPLE}\n\n${SIMPLE}\n`;
    expect(decos(dos, dos.length, ctx).filter((x) => x.clase === 'cm-prefijo-epigrafe').map((x) => x.widget)).toEqual(['Figura 2.1: ', 'Figura 2.2: ']);
  });

  it('el formato dentro del epígrafe se sigue dibujando', () => {
    const t = `x\n${SIMPLE.replace('Una figura', 'Una \\textbf{figura}')}\n`;
    expect(decos(t, 0, ctx)).toContainEqual(expect.objectContaining({ clase: 'cm-negrita' }));
  });

  // Con la figura dibujada, lo que rodea al epígrafe está oculto: borrar ahí rompería la figura a ciegas.
  describe('borrar en los bordes del epígrafe', () => {
    const borrar = (texto: string, cursor: number, desde: number, hasta: number, evento = 'delete.backward') =>
      EditorState.create({ doc: texto, selection: { anchor: cursor }, extensions: [protegerEpigrafe] })
        .update({ changes: { from: desde, to: hasta }, userEvent: evento }).state.doc.toString();

    it('Retroceso al comienzo no borra la llave oculta', () => {
      expect(borrar(T, EPIGRAFE, EPIGRAFE - 1, EPIGRAFE)).toBe(T);
    });

    it('Suprimir al final no borra la llave oculta', () => {
      expect(borrar(T, FIN_EPIGRAFE, FIN_EPIGRAFE, FIN_EPIGRAFE + 1, 'delete.forward')).toBe(T);
    });

    it('borrar la palabra anterior desde el comienzo tampoco sale del epígrafe', () => {
      expect(borrar(T, EPIGRAFE, T.indexOf('\\caption'), EPIGRAFE, 'delete.group.backward')).toBe(T);
    });

    it('dentro del epígrafe se borra normalmente, hasta vaciarlo', () => {
      expect(borrar(T, EPIGRAFE + 3, EPIGRAFE + 2, EPIGRAFE + 3)).toBe(T.replace('Una figura', 'Un figura'));
      expect(borrar(T, EPIGRAFE + 1, EPIGRAFE, EPIGRAFE + 1)).toBe(T.replace('Una figura', 'na figura'));
      expect(borrar(T, FIN_EPIGRAFE, FIN_EPIGRAFE - 1, FIN_EPIGRAFE)).toBe(T.replace('Una figura', 'Una figur'));
      const vacio = T.replace('Una figura', '');
      expect(borrar(vacio, EPIGRAFE, EPIGRAFE - 1, EPIGRAFE)).toBe(vacio);
    });

    it('escribir en los bordes sigue funcionando', () => {
      const estado = EditorState.create({ doc: T, selection: { anchor: EPIGRAFE }, extensions: [protegerEpigrafe] });
      expect(estado.update({ changes: { from: EPIGRAFE, insert: 'X' }, userEvent: 'input.type' }).state.doc.toString()).toBe(T.replace('Una figura', 'XUna figura'));
    });

    it('con el cursor en el armado, donde se ve el código, se borra normalmente', () => {
      const pos = T.indexOf('\\centering') + 3;
      expect(borrar(T, pos, pos - 1, pos)).toBe(T.slice(0, pos - 1) + T.slice(pos));
    });

    it('en una figura que no se dibuja no se impide nada', () => {
      const t = '\\begin{figure}\\includegraphics{a}\\includegraphics{b}\\caption{Hola}\\end{figure}';
      const pos = t.indexOf('Hola');
      expect(borrar(t, pos, pos - 1, pos)).toBe(t.slice(0, pos - 1) + t.slice(pos));
    });

    it('el epígrafe de una tabla dibujada se protege igual', () => {
      const tabla = '\\begin{table}\n\\caption{Corpus}\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}\n\\end{table}';
      const desde = tabla.indexOf('Corpus');
      const hasta = desde + 'Corpus'.length;
      expect(borrar(tabla, desde, desde - 1, desde)).toBe(tabla);
      expect(borrar(tabla, hasta, hasta, hasta + 1, 'delete.forward')).toBe(tabla);
      expect(borrar(tabla, desde + 3, desde + 2, desde + 3)).toBe(tabla.replace('Corpus', 'Copus'));
      // Una tabla que el editor no dibuja se ve como código: ahí no se impide nada.
      const rara = tabla.replace('{l}', '{@{}l}');
      expect(borrar(rara, desde, desde - 1, desde)).toBe(rara.slice(0, desde - 1) + rara.slice(desde));
    });

    it('con una selección, se borra lo seleccionado', () => {
      const estado = EditorState.create({ doc: T, selection: { anchor: EPIGRAFE - 3, head: EPIGRAFE + 3 }, extensions: [protegerEpigrafe] });
      expect(estado.update({ changes: { from: EPIGRAFE - 3, to: EPIGRAFE + 3 }, userEvent: 'delete.selection' }).state.doc.toString())
        .toBe(T.slice(0, EPIGRAFE - 3) + T.slice(EPIGRAFE + 3));
    });
  });

  it('la imagen dibujada deja pasar el arrastre de archivos y se queda con sus clics', () => {
    const estado = EditorState.create({ doc: T, selection: { anchor: 0 } });
    let imagen: { ignoreEvent(e: Event): boolean } | undefined;
    decorar(estado, ctx).between(0, T.length, (_d, _h, d) => { if (d.spec.widget?.clase === 'cm-imagen') imagen = d.spec.widget; });
    expect(imagen).toBeDefined();
    for (const tipo of ['dragenter', 'dragover', 'dragleave', 'drop']) expect(imagen!.ignoreEvent(new Event(tipo)), tipo).toBe(false);
    for (const tipo of ['mousedown', 'click', 'keydown']) expect(imagen!.ignoreEvent(new Event(tipo)), tipo).toBe(true);
  });

  it('el fixture: una figura dibujada y otra como código', () => {
    const d = decos(leerFixture('Bloques.tex'), 0, ctxDePrueba({ numeroCapitulo: '7' }));
    expect(d.filter((x) => x.clase === 'cm-imagen')).toHaveLength(1);
    expect(d.filter((x) => x.clase === 'cm-prefijo-epigrafe').map((x) => x.widget)).toEqual(['Figura 7.1: ']);
  });
});
