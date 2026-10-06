import { describe, expect, it } from 'vitest';
import { leerFixture } from '../pruebas/ayudas/temporales';
import { analizar, type Elemento } from './analizador';
import { partesDeFigura } from './flotante';

const tramo = (t: string, e: { desde: number; hasta: number }) => t.slice(e.desde, e.hasta);
const figuras = (t: string) => {
  const es = analizar(t);
  return es.filter((e): e is Extract<Elemento, { tipo: 'entorno' }> => e.tipo === 'entorno' && e.nombre === 'figure')
    .map((figura) => partesDeFigura(t, figura, es));
};
const partes = (t: string) => figuras(t)[0];

const FIGURA = '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{figs/a.png}\n'
  + '  \\caption{Una \\textbf{figura}}\n  \\label{fig:a}\n\\end{figure}';

describe('partesDeFigura', () => {
  it('plantilla: se oculta exactamente el armado', () => {
    const p = partes(FIGURA)!;
    expect(p.ocultar.map((r) => tramo(FIGURA, r))).toEqual([
      '\\begin{figure}[htbp]\n  \\centering\n  ',
      '\n  \\caption{',
      '}\n  \\label{fig:a}\n\\end{figure}',
    ]);
    expect(p.imagen.ruta).toBe('figs/a.png');
    expect(tramo(FIGURA, p.epigrafe!.contenido)).toBe('Una \\textbf{figura}');
  });

  it('lo oculto, la imagen y el epígrafe cubren la figura sin solaparse', () => {
    const p = partes(FIGURA)!;
    const piezas = [...p.ocultar, p.imagen, p.epigrafe!.contenido].sort((a, b) => a.desde - b.desde);
    expect(piezas.map((r) => tramo(FIGURA, r)).join('')).toBe(FIGURA);
  });

  it('epígrafe antes de la imagen', () => {
    const t = '\\begin{figure}\\caption{x}\\includegraphics{a.png}\\end{figure}';
    expect(partes(t)!.ocultar.map((r) => tramo(t, r))).toEqual(['\\begin{figure}\\caption{', '}', '\\end{figure}']);
  });

  it('figura sin epígrafe', () => {
    const t = '\\begin{figure}\\includegraphics{a.png}\\end{figure}';
    const p = partes(t)!;
    expect(p.epigrafe).toBeNull();
    expect(p.ocultar.map((r) => tramo(t, r))).toEqual(['\\begin{figure}', '\\end{figure}']);
  });

  it('acepta figure*, epígrafe con texto corto y epígrafe vacío', () => {
    expect(partes('\\begin{figure*}[t]\\includegraphics{a}\\caption[Corto]{Largo}\\end{figure*}')).not.toBeNull();
    const vacio = '\\begin{figure}\\includegraphics{a}\\caption{}\\end{figure}';
    expect(partes(vacio)!.epigrafe!.contenido).toEqual({ desde: vacio.indexOf('{}') + 1, hasta: vacio.indexOf('{}') + 1 });
  });

  it.each([
    ['dos imágenes', '\\begin{figure}\\includegraphics{a}\\includegraphics{b}\\caption{x}\\end{figure}'],
    ['sin imagen', '\\begin{figure}\\caption{x}\\end{figure}'],
    ['texto suelto', '\\begin{figure}\\includegraphics{a}\nFuente: elaboración propia\n\\caption{x}\\end{figure}'],
    ['otro comando', '\\begin{figure}\\vspace{1cm}\\includegraphics{a}\\end{figure}'],
    ['un comentario', '\\begin{figure}\n% revisar\n\\includegraphics{a}\\end{figure}'],
    ['otro entorno', '\\begin{figure}\\begin{center}\\includegraphics{a}\\end{center}\\end{figure}'],
    ['dos epígrafes', '\\begin{figure}\\includegraphics{a}\\caption{x}\\caption{y}\\end{figure}'],
    ['la imagen dentro del epígrafe', '\\begin{figure}\\caption{x \\includegraphics{a}}\\end{figure}'],
    ['una tabla adentro', '\\begin{figure}\\includegraphics{a}\\begin{tabular}{l}x\\end{tabular}\\end{figure}'],
    ['una fórmula suelta', '\\begin{figure}\\includegraphics{a} $x$\\end{figure}'],
  ])('no es dibujable: %s', (_nombre, t) => {
    expect(partes(t)).toBeNull();
  });

  it('una figura dentro de otra: la de afuera no es dibujable, la de adentro sí', () => {
    const t = '\\begin{figure}\\begin{figure}\\includegraphics{a}\\end{figure}\\end{figure}';
    expect(figuras(t).map((p) => p !== null)).toEqual([false, true]);
  });

  it('del fixture: la figura de la plantilla es dibujable y la de dos imágenes no', () => {
    expect(figuras(leerFixture('Bloques.tex')).map((p) => p !== null)).toEqual([true, false]);
  });
});
