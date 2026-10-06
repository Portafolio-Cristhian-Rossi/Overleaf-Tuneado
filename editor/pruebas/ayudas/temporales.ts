import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

const creados: string[] = [];

// Directorio temporal que se borra al terminar cada prueba.
export function dirTemporal(prefijo = 'editor-'): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefijo)));
  creados.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of creados.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

export const DIR_FIXTURE = path.resolve(import.meta.dirname, '../fixtures/informe');

// Texto de un fixture con los saltos normalizados a \n, como lo ve el editor.
export function leerFixture(nombre: string): string {
  return fs.readFileSync(path.join(DIR_FIXTURE, nombre), 'utf8').replace(/\r\n/g, '\n');
}

export function copiarFixture(destino: string): void {
  fs.cpSync(DIR_FIXTURE, destino, { recursive: true });
}
