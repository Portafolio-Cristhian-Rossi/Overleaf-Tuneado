import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dirTemporal } from '../pruebas/ayudas/temporales';
import { cargarConfig } from './config';

function dirCon(contenido: object, archivo = 'config.json'): string {
  const dir = dirTemporal();
  fs.writeFileSync(path.join(dir, archivo), JSON.stringify(contenido));
  return dir;
}

describe('cargarConfig', () => {
  it('resuelve las rutas como absolutas respecto de editor/', () => {
    const dir = dirCon({ informe: '../informe', build: '../build' });
    const c = cargarConfig(dir, 'config.json');
    expect(path.isAbsolute(c.informe)).toBe(true);
    expect(c.informe).toBe(path.resolve(dir, '../informe'));
    expect(c.build).toBe(path.resolve(dir, '../build'));
  });

  it('usa los valores por defecto para lo que falte', () => {
    const dir = dirCon({});
    const c = cargarConfig(dir, 'config.json');
    expect(c).toMatchObject({ principal: 'main.tex', puerto: 4317, compilarAlGuardar: false });
    expect(c.informe).toBe(path.resolve(dir, '../informe'));
  });

  it.each(['x', 80, 70000, 4317.5])('rechaza el puerto %j', (puerto) => {
    expect(() => cargarConfig(dirCon({ puerto }), 'config.json')).toThrow(/puerto/);
  });

  it('lee el archivo indicado por el segundo argumento', () => {
    const dir = dirCon({ puerto: 5000 }, 'config.prueba.json');
    expect(cargarConfig(dir, 'config.prueba.json').puerto).toBe(5000);
  });

  it('sin archivo de configuración usa todos los valores por defecto', () => {
    expect(cargarConfig(dirTemporal(), 'config.json').puerto).toBe(4317);
  });
});
