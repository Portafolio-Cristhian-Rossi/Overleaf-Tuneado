import { describe, expect, it } from 'vitest';
import { dibujarFormula, prepararFormula } from './formula';

describe('prepararFormula', () => {
  it('quita lo que KaTeX no usa', () => {
    expect(prepararFormula(' a = b \\label{eq:x} \\nonumber ', 'equation')).toBe('a = b');
    expect(prepararFormula('a \\notag', null)).toBe('a');
  });

  it('no confunde \\nonumber con un comando que empieza igual', () => {
    expect(prepararFormula('\\nonumberx + \\labelx', null)).toBe('\\nonumberx + \\labelx');
  });

  it('align se dibuja como aligned', () => {
    expect(prepararFormula('a &= b \\\\ c &= d', 'align')).toBe('\\begin{aligned}a &= b \\\\ c &= d\\end{aligned}');
    expect(prepararFormula('a &= b', 'align*')).toBe('\\begin{aligned}a &= b\\end{aligned}');
  });

  it('una fórmula vacía queda vacía, también en align', () => {
    expect(prepararFormula('  \\label{eq:x} ', 'align')).toBe('');
  });
});

describe('dibujarFormula', () => {
  it('dibuja una fórmula válida', () => {
    const r = dibujarFormula('\\frac{a}{b}', null, false);
    expect(r.tipo).toBe('ok');
    expect(r.tipo === 'ok' && r.html).toContain('katex');
  });

  it('dibuja las fórmulas del fixture', () => {
    expect(dibujarFormula('C(t) = \\sum_{i<j} \\log \\frac{D(w_i, w_j) + 1}{D(w_j)}\n  \\label{eq:coherencia}', 'equation', true).tipo).toBe('ok');
    expect(dibujarFormula('\\theta_d &\\sim \\mathrm{Dir}(\\alpha) \\\\\n  z_{d,n} &\\sim \\mathrm{Mult}(\\theta_d) \\nonumber', 'align', true).tipo).toBe('ok');
  });

  it.each(['\\frac{a', '\\comandoinventado{x}'])('informa el error de %s sin el prefijo de KaTeX', (fuente) => {
    const r = dibujarFormula(fuente, null, false);
    expect(r).toMatchObject({ tipo: 'error' });
    expect(r.tipo === 'error' && r.mensaje).not.toMatch(/^KaTeX parse error/);
    expect(r.tipo === 'error' && r.mensaje.length).toBeGreaterThan(0);
  });

  it('una fórmula vacía es un error con texto propio', () => {
    expect(dibujarFormula('  ', null, true)).toEqual({ tipo: 'error', mensaje: 'La fórmula está vacía.' });
  });

  it('el mismo pedido devuelve el mismo resultado', () => {
    expect(dibujarFormula('x^2', null, true)).toBe(dibujarFormula('x^2', null, true));
    expect(dibujarFormula('x^2', null, true)).not.toBe(dibujarFormula('x^2', null, false));
  });

  it.each(['', '}', '\\begin{align}', '\\', '$', '&', 'x'.repeat(20000), '\u0000', '\\def\\x{\\x}\\x'])(
    'nunca lanza una excepción (%#)', (fuente) => {
      for (const entorno of [null, 'equation', 'align'] as const) {
        expect(() => dibujarFormula(fuente, entorno, true)).not.toThrow();
        expect(['ok', 'error']).toContain(dibujarFormula(fuente, entorno, true).tipo);
      }
    });

  // KaTeX guarda la fuente como texto en una anotación; lo que no puede haber es un enlace.
  it.each(['\\href{javascript:alert(1)}{x}', '\\url{javascript:alert(1)}', '\\includegraphics{javascript:alert(1)}', '\\htmlData{onclick=alert(1)}{x}'])(
    'no genera enlaces ni atributos a partir de %s', (fuente) => {
      const r = dibujarFormula(fuente, null, true);
      if (r.tipo === 'ok') {
        expect(r.html).not.toMatch(/<a[\s>]/);
        expect(r.html).not.toMatch(/\s(?:href|src|on\w+|data-\w+)\s*=/i);
      }
    });
});
