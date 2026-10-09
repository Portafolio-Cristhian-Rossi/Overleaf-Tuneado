import { describe, expect, it } from 'vitest';
import { FIN_DEL_TEXTO, INICIO_DEL_TEXTO } from '../compartido/prompt';
import { avisoDeCopia, opcionesDeIa, prepararPrompt, ubicacionDe } from './ia';
import { titulosDelIndice } from './indice';

const R = String.raw;
const CAPITULO = R`\chapter{Revisión de antecedentes}

Presentación del capítulo.

\section{Aprendizaje Automático}\label{sec:AA}

\subsection{Aprendizaje Supervisado}

notas sobre supervisado

\subsection*{Aparte}

sin número

\section{Procesamiento de Lenguaje Natural}

\subsubsection{Word embeddings}

notas sobre embeddings
`;
const TITULOS = titulosDelIndice(CAPITULO, '2');
const en = (fragmento: string) => CAPITULO.indexOf(fragmento);
const seleccionDe = (fragmento: string) => ({ desde: en(fragmento), hasta: en(fragmento) + fragmento.length });

function textoDe(prompt: string): string {
  const desde = prompt.indexOf(`${INICIO_DEL_TEXTO}\n`) + INICIO_DEL_TEXTO.length + 1;
  return prompt.slice(desde, prompt.indexOf(`\n${FIN_DEL_TEXTO}`));
}

describe('ubicacionDe', () => {
  it('da los títulos que contienen la posición, del capítulo hacia adentro', () => {
    expect(ubicacionDe(TITULOS, en('notas sobre supervisado'))).toEqual([
      '2 Revisión de antecedentes', '2.1 Aprendizaje Automático', '2.1.1 Aprendizaje Supervisado',
    ]);
  });

  it('una sección nueva deja atrás las subsecciones de la anterior', () => {
    expect(ubicacionDe(TITULOS, en('notas sobre embeddings'))).toEqual([
      '2 Revisión de antecedentes', '2.2 Procesamiento de Lenguaje Natural', 'Word embeddings',
    ]);
  });

  it('un título sin número va solo con su texto, y reemplaza al de su mismo nivel', () => {
    expect(ubicacionDe(TITULOS, en('sin número'))).toEqual(['2 Revisión de antecedentes', '2.1 Aprendizaje Automático', 'Aparte']);
  });

  it('una posición sobre el título mismo ya está dentro de él', () => {
    expect(ubicacionDe(TITULOS, en(R`\section{Aprendizaje`))).toEqual(['2 Revisión de antecedentes', '2.1 Aprendizaje Automático']);
  });

  it('antes del primer título, o sin títulos, no hay ubicación', () => {
    expect(ubicacionDe(titulosDelIndice(`Suelto.\n\n${CAPITULO}`, '2'), 0)).toEqual([]);
    expect(ubicacionDe([], 10)).toEqual([]);
  });
});

describe('prepararPrompt', () => {
  const pedir = (accion: Parameters<typeof prepararPrompt>[0]['accion'], seleccion = { desde: 0, hasta: 0 }, texto = CAPITULO) =>
    prepararPrompt({ accion, texto, seleccion, titulos: titulosDelIndice(texto, '2'), guia: 'Primera persona del plural.' });

  it.each(['desarrollar', 'estilo'] as const)('%s actúa sobre la selección y dice en qué sección está', (accion) => {
    const r = pedir(accion, seleccionDe('notas sobre supervisado'));
    if (r.tipo !== 'ok') throw new Error(r.mensaje);
    expect(textoDe(r.prompt)).toBe('notas sobre supervisado');
    expect(r.prompt).toContain('- 2.1.1 Aprendizaje Supervisado\n');
    expect(r.prompt).toContain('Primera persona del plural.');
  });

  it('la ubicación es la de la primera letra seleccionada, no la de los blancos de adelante', () => {
    const r = pedir('desarrollar', { desde: en(R`\subsubsection{Word`) - 2, hasta: CAPITULO.length });
    if (r.tipo !== 'ok') throw new Error(r.mensaje);
    expect(r.prompt).toContain('- Word embeddings\n');
  });

  it('una selección hecha de derecha a izquierda vale igual', () => {
    const { desde, hasta } = seleccionDe('notas sobre supervisado');
    const r = pedir('estilo', { desde: hasta, hasta: desde });
    expect(r.tipo === 'ok' && textoDe(r.prompt)).toBe('notas sobre supervisado');
  });

  it.each(['desarrollar', 'estilo'] as const)('%s sin selección, o con una en blanco, no arma nada y dice qué hacer', (accion) => {
    expect(pedir(accion)).toEqual({ tipo: 'no', mensaje: expect.stringMatching(/Seleccioná/) });
    expect(pedir(accion, seleccionDe('\n\n'))).toMatchObject({ tipo: 'no' });
  });

  it('consistencia manda el archivo entero, haya o no selección, y lo ubica en su capítulo', () => {
    const r = pedir('consistencia', seleccionDe('notas sobre supervisado'));
    if (r.tipo !== 'ok') throw new Error(r.mensaje);
    expect(textoDe(r.prompt)).toBe(CAPITULO.trimEnd());
    expect(r.prompt).toContain('## Dónde va este texto\n\n- 2 Revisión de antecedentes\n\n');
  });

  it('consistencia sobre un archivo vacío no arma nada', () => {
    expect(pedir('consistencia', undefined, ' \n')).toEqual({ tipo: 'no', mensaje: expect.stringMatching(/vacío/) });
  });

  it('cuenta las palabras de la prompt', () => {
    const r = pedir('estilo', seleccionDe('notas sobre supervisado'));
    if (r.tipo !== 'ok') throw new Error(r.mensaje);
    expect(r.palabras).toBe(r.prompt.trim().split(/\s+/).length);
    expect(r.palabras).toBeGreaterThan(50);
  });
});

describe('opcionesDeIa', () => {
  it('con selección ofrece las tres acciones', () => {
    expect(opcionesDeIa(true)).toEqual([
      { accion: 'desarrollar', texto: 'Desarrollar notas', habilitada: true },
      { accion: 'estilo', texto: 'Revisar estilo', habilitada: true },
      { accion: 'consistencia', texto: 'Revisar consistencia', habilitada: true },
    ]);
  });

  it('sin selección deja solo la que actúa sobre el capítulo, y explica las otras', () => {
    const opciones = opcionesDeIa(false);
    expect(opciones.map((o) => o.habilitada)).toEqual([false, false, true]);
    expect(opciones[0].ayuda).toMatch(/Seleccioná/);
    expect(opciones[1].ayuda).toMatch(/Seleccioná/);
    expect(opciones[2].ayuda).toBeUndefined();
  });
});

describe('avisoDeCopia', () => {
  it('dice cuánto se copió y qué hacer con la respuesta', () => {
    expect(avisoDeCopia('desarrollar', 1)).toBe('Prompt copiada (1 palabra). Pegala en el modelo; su respuesta, pegala acá sobre la selección.');
    expect(avisoDeCopia('estilo', 350)).toMatch(/^Prompt copiada \(350 palabras\)\. .*sobre la selección\.$/);
  });

  it('la de consistencia no se pega de vuelta', () => {
    expect(avisoDeCopia('consistencia', 900)).toBe('Prompt copiada (900 palabras). Pegala en el modelo.');
  });
});
