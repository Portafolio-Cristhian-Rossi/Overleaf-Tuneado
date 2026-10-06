import { describe, expect, it } from 'vitest';
import { leerFixture } from '../pruebas/ayudas/temporales';
import { titulosDelIndice } from './indice';

describe('titulosDelIndice', () => {
  it('lista los títulos de Cap2 con número, nivel y posición', () => {
    const texto = leerFixture('Cap2.tex');
    const indice = titulosDelIndice(texto, '2');
    expect(indice).toHaveLength(20);
    expect(indice[0]).toEqual({ texto: 'Revision de antecedentes', numero: '2', nivel: 0, posicion: 0 });
    expect(indice[1]).toEqual({ texto: 'Inteligencia Artificial', numero: '2.1', nivel: 1, posicion: texto.indexOf('\\section{Inteligencia Artificial}') });
    expect(indice.find((t) => t.texto === 'Word embeddings')).toMatchObject({ numero: null, nivel: 3 });
  });

  it('quita los comandos de formato del texto mostrado', () => {
    expect(titulosDelIndice('\\section{Uso de \\textbf{BTM} y \\emph{LDA}}', '1')[0].texto).toBe('Uso de BTM y LDA');
  });

  it('un archivo sin títulos da un índice vacío', () => {
    expect(titulosDelIndice('Solo texto.', '1')).toEqual([]);
  });
});
