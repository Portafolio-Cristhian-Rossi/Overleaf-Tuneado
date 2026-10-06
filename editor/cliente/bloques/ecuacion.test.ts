import { describe, expect, it } from 'vitest';
import { ctxDePrueba, decos } from '../../pruebas/ayudas/decoraciones';
import { leerFixture } from '../../pruebas/ayudas/temporales';

const ctx = ctxDePrueba();

describe('ecuaciones', () => {
  it('en línea, sin el cursor: la fórmula reemplaza al código', () => {
    expect(decos('sea $a+b$ fin\n', 0, ctx)).toContainEqual({ desde: 4, hasta: 9, reemplaza: true, widget: 'a+b', clase: 'cm-formula' });
  });

  it('en línea, con el cursor: se ve el código y la vista previa al final de la línea', () => {
    const d = decos('sea $a+b$ fin\notra', 6, ctx);
    expect(d.some((x) => x.reemplaza)).toBe(false);
    expect(d).toContainEqual(expect.objectContaining({ desde: 13, hasta: 13, widget: 'a+b', clase: 'cm-formula-previa' }));
  });

  it('en bloque, en líneas propias: reemplaza las líneas enteras y lleva número', () => {
    const t = 'x\n  \\begin{equation}\n  a = b\n  \\end{equation}  \ny';
    expect(decos(t, 0, ctx)).toContainEqual({
      desde: 2, hasta: t.indexOf('\ny'), reemplaza: true, widget: '\n  a = b\n  ', clase: 'cm-formula cm-formula-bloque', numero: '(2.1)',
    });
  });

  it('en bloque, compartiendo línea con texto: reemplaza solo la fórmula', () => {
    const t = 'donde \\[a\\] vale';
    expect(decos(t, 0, ctx)).toContainEqual(expect.objectContaining({ desde: 6, hasta: 11, reemplaza: true, clase: 'cm-formula cm-formula-bloque' }));
  });

  it('las fórmulas sin número no llevan número', () => {
    const d = decos('x\n\\[a\\]\n\\begin{equation*}b\\end{equation*}\n$$c$$\n', 0, ctx);
    expect(d.filter((x) => x.clase === 'cm-formula cm-formula-bloque').map((x) => x.numero)).toEqual([undefined, undefined, undefined]);
  });

  it('en un capítulo sin número, la ecuación no lleva número', () => {
    const t = 'x\n\\begin{equation}a\\end{equation}\n';
    expect(decos(t, 0, ctxDePrueba({ numeroCapitulo: null }))).toContainEqual(expect.objectContaining({ clase: 'cm-formula cm-formula-bloque', numero: undefined }));
  });

  it('align con varias filas muestra el rango de números', () => {
    const t = '\\begin{align}a \\\\ b \\\\ c\\end{align}\n';
    expect(decos(t, t.length, ctx)).toContainEqual(expect.objectContaining({ numero: '(2.1)–(2.3)' }));
  });

  it('con el cursor en una ecuación en bloque: código en monoespaciado y vista previa debajo', () => {
    const t = 'x\n\\begin{equation}\na = b\n\\end{equation}\ny';
    const d = decos(t, 20, ctx);
    expect(d.some((x) => x.reemplaza)).toBe(false);
    expect(d.filter((x) => x.clase === 'cm-fuente-formula')).toHaveLength(3);
    expect(d).toContainEqual(expect.objectContaining({ desde: t.indexOf('\ny'), widget: '\na = b\n', clase: 'cm-formula-previa', numero: '(2.1)' }));
  });

  it('sin foco se dibuja aunque el cursor esté adentro', () => {
    expect(decos('$a$', 1, ctx, false).some((x) => x.reemplaza)).toBe(true);
  });

  it('una selección que abarca la fórmula también muestra el código', () => {
    expect(decos('a $x$ b', 3, ctx).some((x) => x.reemplaza)).toBe(false);
  });

  it('los comandos de una fórmula dibujada o en edición no se resaltan como comando suelto', () => {
    expect(decos('x\n$\\alpha$ y', 0, ctx).some((x) => x.clase === 'cm-comando')).toBe(false);
    expect(decos('x\n$\\alpha$ y', 4, ctx).some((x) => x.clase === 'cm-comando')).toBe(false);
  });

  it('el fixture de bloques: cinco fórmulas dibujadas, dos con número', () => {
    const d = decos(leerFixture('Bloques.tex'), 0, ctxDePrueba({ numeroCapitulo: '7' })).filter((x) => x.clase?.startsWith('cm-formula'));
    expect(d.map((x) => [x.clase, x.numero])).toEqual([
      ['cm-formula', undefined], ['cm-formula', undefined],
      ['cm-formula cm-formula-bloque', '(7.1)'], ['cm-formula cm-formula-bloque', '(7.2)'], ['cm-formula cm-formula-bloque', undefined],
    ]);
  });
});
