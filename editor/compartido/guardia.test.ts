import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// main es la herramienta genérica: lo propio de un proyecto va en proyecto/ de su rama, nunca en
// el código. Esta prueba falla si vuelve a aparecer algo de la tesis.
const PROHIBIDAS = ['uy-social', 'processing_orchestrator', 'tópico', 'UdelaR', 'proyecto de grado', 'Cristhian'];
const CARPETAS = ['cliente', 'servidor', 'compartido'];
const DIR_EDITOR = path.resolve(import.meta.dirname, '..');   // guardia vive en compartido/

function archivosDe(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return archivosDe(ruta);
    return /\.(ts|css)$/.test(e.name) && !e.name.endsWith('.test.ts') ? [ruta] : [];
  });
}

describe('guardia', () => {
  it('el código no tiene nada propio de un proyecto', () => {
    const encontradas = CARPETAS.flatMap((c) => archivosDe(path.join(DIR_EDITOR, c))).flatMap((archivo) => {
      const texto = fs.readFileSync(archivo, 'utf8').toLowerCase();
      return PROHIBIDAS.filter((p) => texto.includes(p.toLowerCase()))
        .map((p) => `${path.relative(DIR_EDITOR, archivo)}: ${p}`);
    });
    expect(encontradas).toEqual([]);
  });
});
