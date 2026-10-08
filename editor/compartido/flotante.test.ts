import { describe, expect, it } from 'vitest';
import { leerFixture } from '../pruebas/ayudas/temporales';
import { analizar, type Elemento } from './analizador';
import { partesDeFigura, partesDeTabla } from './flotante';

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

describe('partesDeTabla', () => {
  const R = String.raw;
  type Entorno = Extract<Elemento, { tipo: 'entorno' }>;
  const tablas = (t: string) => {
    const es = analizar(t);
    return es.filter((e): e is Entorno => e.tipo === 'entorno' && e.nombre === 'table').map((flotante) => partesDeTabla(t, flotante, es));
  };
  const partesT = (t: string) => tablas(t)[0];

  const FLOTANTE = R`\begin{table}[htbp]
  \centering
  \caption{Tamaño del corpus}
  \label{tab:corpus}
  \begin{tabular}{ll}
    Sitio & Documentos \\
  \end{tabular}
\end{table}`;

  it('una tabla con la forma de la plantilla: tabular, epígrafe y armado para ocultar', () => {
    const p = partesT(FLOTANTE)!;
    expect(tramo(FLOTANTE, p.tabular)).toBe(FLOTANTE.slice(FLOTANTE.indexOf(R`\begin{tabular}`), FLOTANTE.indexOf(R`\end{table}`) - 1));
    expect(p.tabla.clase).toBe('simple');
    expect(tramo(FLOTANTE, p.epigrafe!.contenido)).toBe('Tamaño del corpus');
    expect(p.ocultar.map((r) => tramo(FLOTANTE, r))).toEqual([
      `${R`\begin{table}[htbp]`}\n  ${R`\centering`}\n  ${R`\caption{`}`, `}\n  ${R`\label{tab:corpus}`}\n  `, `\n${R`\end{table}`}`,
    ]);
  });

  it('lo oculto, el tabular y el epígrafe cubren el flotante sin solaparse', () => {
    const p = partesT(FLOTANTE)!;
    const piezas = [...p.ocultar, p.tabular, p.epigrafe!.contenido].sort((a, b) => a.desde - b.desde);
    expect(piezas.map((r) => tramo(FLOTANTE, r)).join('')).toBe(FLOTANTE);
  });

  it('el epígrafe puede ir debajo, o faltar', () => {
    const debajo = R`\begin{table}\begin{tabular}{l}a \\\end{tabular}\caption{Abajo}\end{table}`;
    expect(partesT(debajo)!.ocultar.map((r) => tramo(debajo, r))).toEqual([R`\begin{table}`, R`\caption{`, R`}\end{table}`]);
    expect(partesT(R`\begin{table*}\begin{tabular}{l}a \\\end{tabular}\end{table*}`)).toMatchObject({ epigrafe: null });
  });

  it('lo que hay dentro del tabular no cuenta como contenido suelto', () => {
    expect(partesT(R`\begin{table}\begin{tabular}{l}\textbf{a} $k$ \cite{x} \\\end{tabular}\end{table}`)).not.toBeNull();
  });

  it.each([
    ['dos tabular', R`\begin{table}\begin{tabular}{l}a \\\end{tabular}\begin{tabular}{l}b \\\end{tabular}\end{table}`],
    ['ningún tabular', R`\begin{table}\caption{x}\end{table}`],
    ['una imagen', R`\begin{table}\includegraphics{a}\begin{tabular}{l}a \\\end{tabular}\end{table}`],
    ['texto suelto', R`\begin{table}Nota\begin{tabular}{l}a \\\end{tabular}\end{table}`],
    ['otro comando', R`\begin{table}\small\begin{tabular}{l}a \\\end{tabular}\end{table}`],
    ['un comentario', `${R`\begin{table}`}% nota\n${R`\begin{tabular}{l}a \\\end{tabular}\end{table}`}`],
    ['dos epígrafes', R`\begin{table}\caption{a}\caption{b}\begin{tabular}{l}a \\\end{tabular}\end{table}`],
    ['un tabular que no se reconoce', R`\begin{table}\begin{tabular}{@{}l}a \\\end{tabular}\end{table}`],
  ])('con %s no se dibuja', (_nombre, t) => {
    expect(partesT(t)).toBeNull();
  });

  it('las tablas del fixture', () => {
    expect(tablas(leerFixture('Bloques.tex')).map((p) => p?.tabla.clase)).toEqual(['simple', 'solo-lectura']);
  });
});
