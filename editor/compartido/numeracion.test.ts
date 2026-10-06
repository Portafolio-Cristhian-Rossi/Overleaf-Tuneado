import { describe, expect, it } from 'vitest';
import { leerFixture } from '../pruebas/ayudas/temporales';
import { analizar } from './analizador';
import { numerarTitulos } from './numeracion';

// Devuelve [texto del título, número] en orden de aparición.
function numerar(texto: string, numeroCapitulo: string | null): [string, string | null][] {
  const elementos = analizar(texto);
  const numeros = numerarTitulos(elementos, numeroCapitulo);
  return elementos.flatMap((e) =>
    e.tipo === 'titulo' ? [[texto.slice(e.contenido.desde, e.contenido.hasta), numeros.get(e.desde) ?? null] as [string, string | null]] : []);
}

describe('numerarTitulos', () => {
  it('numera Cap2 del fixture', () => {
    const n = new Map(numerar(leerFixture('Cap2.tex'), '2'));
    expect(n.get('Revision de antecedentes')).toBe('2');
    expect(n.get('Inteligencia Artificial')).toBe('2.1');
    expect(n.get('Aprendizaje Automático')).toBe('2.2');
    expect(n.get('Aprendizaje Supervisado')).toBe('2.2.1');
    expect(n.get('Entrenamiento, validación y verificación')).toBe('2.2.3');
    expect(n.get('Preprocesamiento')).toBe('2.3.1');
    expect(n.get('Conceptos Complementarios')).toBe('2.4');
    expect(n.get('Web API')).toBe('2.4.3');
    expect(n.get('Word embeddings')).toBeNull();
  });

  it('con capítulo null todo es null', () => {
    expect(numerar('\\chapter{A}\n\\section{B}\n\\subsection{C}', null).map(([, n]) => n)).toEqual([null, null, null]);
  });

  it('los títulos con asterisco no numeran ni avanzan el contador', () => {
    expect(numerar('\\chapter{A}\n\\section{B}\n\\section*{X}\n\\section{C}\n\\subsection*{Y}\n\\subsection{D}', '3')).toEqual([
      ['A', '3'], ['B', '3.1'], ['X', null], ['C', '3.2'], ['Y', null], ['D', '3.2.1'],
    ]);
  });

  it('una sección nueva reinicia las subsecciones', () => {
    expect(numerar('\\section{A}\n\\subsection{a}\n\\subsection{b}\n\\section{B}\n\\subsection{c}', '1').map(([, n]) => n))
      .toEqual(['1.1', '1.1.1', '1.1.2', '1.2', '1.2.1']);
  });

  it('anexo usa letras', () => {
    expect(numerar(leerFixture('Cap6.tex'), 'A')).toEqual([['Anexo 1', 'A'], ['Sección del Anexo', 'A.1']]);
  });

  it('las claves del mapa son el inicio de cada título', () => {
    const elementos = analizar('x\n\\section{A}');
    expect([...numerarTitulos(elementos, '1').keys()]).toEqual([2]);
  });
});
