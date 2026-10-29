import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dirTemporal } from '../pruebas/ayudas/temporales';
import { leerReglasDelProyecto, ReglasDemasiadoLargas } from './reglasDelProyecto';

function archivoCon(texto: string): string {
  const archivo = path.join(dirTemporal(), 'verificacion-codigo.md');
  fs.writeFileSync(archivo, texto);
  return archivo;
}

describe('leerReglasDelProyecto', () => {
  it('sin archivo no hay reglas', async () => {
    expect(await leerReglasDelProyecto(path.join(dirTemporal(), 'no-esta.md'))).toBeNull();
  });

  it('un archivo con solo espacios cuenta como vacío', async () => {
    expect(await leerReglasDelProyecto(archivoCon('  \r\n'))).toBeNull();
  });

  it('quita el BOM y lee con \n', async () => {
    expect(await leerReglasDelProyecto(archivoCon(`${String.fromCharCode(0xfeff)}a\r\nb`))).toBe('a\nb');
  });

  it('rechaza un archivo de más de 20000 caracteres', async () => {
    await expect(leerReglasDelProyecto(archivoCon('x'.repeat(20001)))).rejects.toThrow(ReglasDemasiadoLargas);
    await expect(leerReglasDelProyecto(archivoCon('x'.repeat(20001)))).rejects.toThrow(
      'proyecto/verificacion-codigo.md es demasiado largo: admite hasta 20000 caracteres.',
    );
  });
});
