import { describe, expect, it } from 'vitest';
import { ctxDePrueba, decos } from '../../pruebas/ayudas/decoraciones';
import { leerFixture } from '../../pruebas/ayudas/temporales';

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

  it('el fixture: una figura dibujada y otra como código', () => {
    const d = decos(leerFixture('Bloques.tex'), 0, ctxDePrueba({ numeroCapitulo: '7' }));
    expect(d.filter((x) => x.clase === 'cm-imagen')).toHaveLength(1);
    expect(d.filter((x) => x.clase === 'cm-prefijo-epigrafe').map((x) => x.widget)).toEqual(['Figura 7.1: ']);
  });
});
