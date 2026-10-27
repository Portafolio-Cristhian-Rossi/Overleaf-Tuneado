import { describe, expect, it } from 'vitest';
import { armarPromptDeVerificacionInforme } from './promptVerificacionInforme';
import type { Ignorado } from './verificacion';

const CAPITULOS = [
  { ruta: 'main.tex', texto: '\\chapter*{Resumen}\nTexto.\n' },
  { ruta: 'Cap1.tex', texto: '\\chapter{Introducción}\n% Presentar el problema.\nTexto.\n' },
  { ruta: 'Cap2.tex', texto: '\\chapter{Revisión de antecedentes}\nTexto.\n' },
  { ruta: 'Glosario.tex', texto: '\\chapter*{Glosario}\nTexto.\n' },
  { ruta: 'Cap3.tex', texto: '\\chapter{Solución}\n% Cómo quedó el sistema.\n' },
];

const base = { capitulos: CAPITULOS, revisados: ['Cap3.tex'], glosario: 'Glosario.tex', marcoTeorico: 'Cap2.tex', ignorados: [] as Ignorado[] };

const ignorado = (o: Partial<Ignorado>): Ignorado => ({
  id: 'a', tipo: 'se-contradice', archivoInforme: 'Cap3.tex', cita: 'frase', archivoRepo: null, archivoReferencia: 'Cap1.tex',
  explicacion: 'No coincide.', fecha: '', ...o,
});

describe('armarPromptDeVerificacionInforme', () => {
  it('numera los capítulos en orden y lista los revisados', () => {
    const p = armarPromptDeVerificacionInforme(base);
    expect(p).toContain('1. informe/main.tex\n2. informe/Cap1.tex\n3. informe/Cap2.tex');
    expect(p).toContain('## Archivos a revisar\nLa cita principal de cada hallazgo tiene que estar en uno de estos:\n- informe/Cap3.tex\n');
  });

  it('nombra el glosario y el marco teórico', () => {
    const p = armarPromptDeVerificacionInforme(base);
    expect(p).toContain('## Referencias\n- Glosario: informe/Glosario.tex\n- Marco teórico: informe/Cap2.tex\n');
    expect(p).toContain('- "definicion-distinta": un término se usa con otro sentido del que le da el glosario o el marco teórico.');
    expect(p).toContain('- "sin-definir": usa un término o concepto central que no está en el glosario ni en el marco teórico.');
  });

  it('sin glosario ni marco teórico no pide definicion-distinta ni sin-definir', () => {
    const p = armarPromptDeVerificacionInforme({ ...base, glosario: null, marcoTeorico: null });
    expect(p).not.toContain('"definicion-distinta"');
    expect(p).not.toContain('"sin-definir"');
    expect(p).not.toContain('## Referencias');
    expect(p).toContain('"se-contradice"');
    expect(p).toContain('"corta-el-hilo"');
  });

  it('con uno solo, nombra solo ese', () => {
    const p = armarPromptDeVerificacionInforme({ ...base, glosario: null });
    expect(p).toContain('## Referencias\n- Marco teórico: informe/Cap2.tex\n');
    expect(p).not.toContain('- Glosario:');
    expect(p).toContain('del que le da el marco teórico.');
    expect(p).toContain('que no está en el marco teórico.');
  });

  it('lleva las notas de todos los capítulos, no solo de los revisados', () => {
    const p = armarPromptDeVerificacionInforme(base);
    expect(p).toContain('### Cap1.tex\n- Introducción: Presentar el problema.');
    expect(p).toContain('### Cap3.tex\n- Solución: Cómo quedó el sistema.');
  });

  it('escribe los ignorados con y sin referencia', () => {
    const p = armarPromptDeVerificacionInforme({
      ...base,
      ignorados: [ignorado({}), ignorado({ tipo: 'sin-definir', cita: 'término', archivoReferencia: null, explicacion: 'Falta.' })],
    });
    expect(p).toContain('## Ya ignorados\nNo vuelvas a reportar estos:\n');
    expect(p).toContain('- [se-contradice] Cap3.tex: «frase» (ver Cap1.tex) — No coincide.');
    expect(p).toContain('- [sin-definir] Cap3.tex: «término» — Falta.');
  });

  it('sin ignorados no lleva esa sección', () => {
    expect(armarPromptDeVerificacionInforme(base)).not.toContain('## Ya ignorados');
  });

  it('termina pidiendo el JSON', () => {
    const p = armarPromptDeVerificacionInforme(base);
    expect(p).toContain('- En "sin-definir" no va "referencia".\n- Si no encontrás nada, devolvé [].');
    expect(p.trim().endsWith('Si no encontrás nada, devolvé [].')).toBe(true);
  });
});
