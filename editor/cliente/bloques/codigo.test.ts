import { describe, expect, it } from 'vitest';
import { ctxDePrueba, decos } from '../../pruebas/ayudas/decoraciones';

const ctx = ctxDePrueba();
const T = 'a\n\\begin{lstlisting}[language=Python]\nx = 1\ny = \\textbf{2}\n\\end{lstlisting}\nb';

describe('bloque de código', () => {
  it('las líneas del interior llevan la clase de código', () => {
    const d = decos(T, 0, ctx);
    expect(d).toContainEqual(expect.objectContaining({ desde: T.indexOf('x = 1'), clase: 'cm-codigo' }));
    expect(d).toContainEqual(expect.objectContaining({ desde: T.indexOf('y = '), clase: 'cm-codigo' }));
    expect(d.filter((x) => x.clase === 'cm-codigo')).toHaveLength(2);
  });

  it('las líneas \\begin y \\end quedan atenuadas y nada se reemplaza', () => {
    const d = decos(T, 0, ctx);
    expect(d).toContainEqual({ desde: 2, hasta: T.indexOf('\nx'), clase: 'cm-atenuado', reemplaza: false });
    expect(d).toContainEqual({ desde: T.indexOf('\\end'), hasta: T.indexOf('\nb'), clase: 'cm-atenuado', reemplaza: false });
    expect(d.some((x) => x.reemplaza)).toBe(false);
  });

  it('los comandos del bloque no se resaltan como comando', () => {
    expect(decos(T, 0, ctx).some((x) => x.clase === 'cm-comando')).toBe(false);
  });

  it('con el cursor adentro se dibuja igual', () => {
    expect(decos(T, T.indexOf('x = 1') + 2, ctx)).toEqual(decos(T, 0, ctx));
  });

  it('verbatim se dibuja igual', () => {
    expect(decos('\\begin{verbatim}\nz\n\\end{verbatim}', 0, ctx)).toContainEqual(expect.objectContaining({ desde: 17, clase: 'cm-codigo' }));
  });

  it('un bloque vacío o de una sola línea no falla', () => {
    expect(() => decos('\\begin{lstlisting}\n\\end{lstlisting}', 0, ctx)).not.toThrow();
    expect(() => decos('\\begin{verbatim}x\\end{verbatim}', 0, ctx)).not.toThrow();
    expect(decos('\\begin{verbatim}x\\end{verbatim}', 0, ctx).some((x) => x.clase === 'cm-codigo')).toBe(false);
  });

  it('una línea en blanco del interior también es de código', () => {
    const t = '\\begin{lstlisting}\na\n\nb\n\\end{lstlisting}';
    expect(decos(t, 0, ctx).filter((x) => x.clase === 'cm-codigo').map((x) => x.desde)).toEqual([19, 21, 22]);
  });
});
