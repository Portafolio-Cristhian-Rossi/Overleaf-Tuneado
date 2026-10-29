import { describe, expect, it } from 'vitest';
import { armarPrompt, FIN_DEL_TEXTO, GUIA_INICIAL, INICIO_DEL_TEXTO, type AccionDeIa } from './prompt';

const R = String.raw;
const NOTAS = R`Poner algo sobre el flujo de mensajes, ver \cite{pham2024} y la sección~\ref{sec:CAP2_PLN}.

El 50\% de $n_k$ no alcanza.`;
const GUIA = 'Primera persona del plural.';
const UBICACION = ['1 Introducción', '1.1 Problema y motivación'];

const prompt = (accion: AccionDeIa, cambios: Partial<Parameters<typeof armarPrompt>[0]> = {}) =>
  armarPrompt({ accion, ubicacion: UBICACION, guia: GUIA, texto: NOTAS, ...cambios });

// Lo que quedó entre las dos líneas delimitadoras.
function textoDe(p: string): string {
  const desde = p.indexOf(`${INICIO_DEL_TEXTO}\n`) + INICIO_DEL_TEXTO.length + 1;
  return p.slice(desde, p.indexOf(`\n${FIN_DEL_TEXTO}`));
}

describe('armarPrompt', () => {
  it.each(['desarrollar', 'estilo', 'consistencia'] as const)('%s lleva el texto tal cual, entre los delimitadores', (accion) => {
    expect(textoDe(prompt(accion))).toBe(NOTAS);
  });

  it('el texto se copia aunque tenga secuencias que un reemplazo interpretaría', () => {
    const raro = R`cuesta $& o $1 o $$ y \\ al final`;
    expect(textoDe(prompt('estilo', { texto: raro }))).toBe(raro);
  });

  it('quita las líneas en blanco de los bordes del texto, no las del medio', () => {
    expect(textoDe(prompt('estilo', { texto: '\n\n  Uno.\n\nDos.\n\n' }))).toBe('  Uno.\n\nDos.');
  });

  it('dice dónde va el texto, del título más general al más particular', () => {
    const p = prompt('desarrollar');
    expect(p).toContain('- 1 Introducción\n- 1.1 Problema y motivación\n');
  });

  it('sin ubicación no deja el apartado vacío', () => {
    expect(prompt('desarrollar', { ubicacion: [] })).not.toContain('## Dónde va');
  });

  it('incluye la guía de estilo sin sus blancos de los bordes', () => {
    expect(prompt('estilo', { guia: '\n  Presente para hechos generales.\n\n' })).toContain('## Guía de estilo\n\nPresente para hechos generales.\n\n## ');
  });

  it('los títulos de la guía quedan por debajo de los apartados de la prompt', () => {
    const p = prompt('estilo', { guia: '# Guía\n\n## Voz\n\nPlural.\n\n### Detalle\n\nEl símbolo # suelto y C# no son títulos.' });
    expect(p).toContain('## Guía de estilo\n\n### Guía\n\n#### Voz\n\nPlural.\n\n##### Detalle\n\nEl símbolo # suelto y C# no son títulos.\n\n## Reglas');
  });

  it('con la guía inicial, los únicos apartados de segundo nivel son los de la prompt', () => {
    const apartados = prompt('desarrollar', { guia: GUIA_INICIAL }).split('\n').filter((linea) => /^#{1,2} /.test(linea));
    expect(apartados).toEqual(['## Tarea', '## Dónde va este texto', '## Guía de estilo', '## Reglas', '## Texto']);
  });

  it('el orden es tarea, ubicación, guía, reglas y texto', () => {
    const p = prompt('desarrollar');
    const lugares = ['## Tarea', '## Dónde va', '## Guía de estilo', '## Reglas', INICIO_DEL_TEXTO].map((marca) => p.indexOf(marca));
    expect(lugares.every((lugar) => lugar >= 0)).toBe(true);
    expect([...lugares].sort((a, b) => a - b)).toEqual(lugares);
  });

  it.each(['desarrollar', 'estilo'] as const)('%s prohíbe inventar, pide marcar lo que falta y un único bloque de código', (accion) => {
    const p = prompt(accion);
    expect(p).toContain('[FALTA: ');
    expect(p).toMatch(/No inventes/);
    expect(p).toMatch(/único bloque de código/);
    expect(p).toContain(R`\cite`);
  });

  it('desarrollar pide redactar las notas; estilo, no cambiar lo que dicen', () => {
    expect(prompt('desarrollar')).toMatch(/notas/);
    expect(prompt('estilo')).toMatch(/sin cambiar lo que dice/);
    expect(prompt('estilo')).toMatch(/cambios que no sean triviales/);
  });

  it('consistencia pide una lista y no reescribe', () => {
    const p = prompt('consistencia');
    expect(p).toMatch(/No lo reescribas/);
    expect(p).not.toMatch(/bloque de código/);
    expect(p).not.toContain('[FALTA: ');
  });

  it('las tres prompts son distintas', () => {
    expect(new Set([prompt('desarrollar'), prompt('estilo'), prompt('consistencia')]).size).toBe(3);
  });
});

describe('GUIA_INICIAL', () => {
  it('es genérica: pide contar de qué trata y trae las reglas de voz y de siglas', () => {
    expect(GUIA_INICIAL).toContain('## De qué trata');
    expect(GUIA_INICIAL).toMatch(/primera persona del plural/i);
    expect(GUIA_INICIAL).toContain('Toda sigla se define la primera vez que aparece.');
    expect(GUIA_INICIAL).not.toContain('tópicos');
  });
});
