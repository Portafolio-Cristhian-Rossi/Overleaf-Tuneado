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
    expect(c).toMatchObject({ principal: 'main.tex', puerto: 4317, compilarAlGuardar: false, corrector: true, puertoCorrector: 4319 });
    expect(c.informe).toBe(path.resolve(dir, '../informe'));
  });

  it.each(['x', 80, 70000, 4317.5])('rechaza el puerto %j', (puerto) => {
    expect(() => cargarConfig(dirCon({ puerto }), 'config.json')).toThrow(/puerto/);
  });

  it('el corrector se puede apagar y cambiar de puerto', () => {
    const c = cargarConfig(dirCon({ corrector: false, puertoCorrector: 5001 }), 'config.json');
    expect(c).toMatchObject({ corrector: false, puertoCorrector: 5001 });
  });

  it.each([80, 'x', 4317])('rechaza el puerto del corrector %j (inválido o igual al del editor)', (puertoCorrector) => {
    expect(() => cargarConfig(dirCon({ puertoCorrector }), 'config.json')).toThrow(/puertoCorrector/);
  });

  it('lee el archivo indicado por el segundo argumento', () => {
    const dir = dirCon({ puerto: 5000 }, 'config.prueba.json');
    expect(cargarConfig(dir, 'config.prueba.json').puerto).toBe(5000);
  });

  it('sin archivo de configuración usa todos los valores por defecto', () => {
    expect(cargarConfig(dirTemporal(), 'config.json').puerto).toBe(4317);
  });

  it('la verificación tiene valores por defecto', () => {
    const dir = dirCon({});
    const c = cargarConfig(dir, 'config.json');
    expect(c).toMatchObject({ repositorio: null, ramaRepositorio: 'main', limiteVerificacion: { capitulo: 15, todo: 45 } });
    expect(c.verificaciones).toBe(path.resolve(dir, '../verificaciones'));
  });

  it('el repositorio se resuelve como ruta absoluta respecto de editor/', () => {
    const dir = dirCon({ repositorio: '../../app', ramaRepositorio: 'desarrollo' });
    const c = cargarConfig(dir, 'config.json');
    expect(c.repositorio).toBe(path.resolve(dir, '../../app'));
    expect(c.ramaRepositorio).toBe('desarrollo');
  });

  it('agente: null por defecto, y la ruta tal como se escribió', () => {
    expect(cargarConfig(dirCon({}), 'config.json').agente).toBeNull();
    const ruta = 'C:\\Users\\Alguien Con Espacios\\claude.exe';
    expect(cargarConfig(dirCon({ agente: ruta }), 'config.json').agente).toBe(ruta);
  });

  it.each(['', 5])('rechaza el agente %j', (agente) => {
    expect(() => cargarConfig(dirCon({ agente }), 'config.json')).toThrow(/config: agente tiene que ser la ruta de claude\.exe/);
  });

  it('rechaza un repositorio que no es una ruta', () => {
    expect(() => cargarConfig(dirCon({ repositorio: 5 }), 'config.json')).toThrow(/repositorio tiene que ser la ruta de una carpeta/);
  });

  it.each(['', 3])('rechaza la rama %j', (ramaRepositorio) => {
    expect(() => cargarConfig(dirCon({ ramaRepositorio }), 'config.json')).toThrow(/ramaRepositorio/);
  });

  it('el límite parcial se completa con los valores por defecto', () => {
    expect(cargarConfig(dirCon({ limiteVerificacion: { todo: 60 } }), 'config.json').limiteVerificacion).toEqual({ capitulo: 15, todo: 60 });
  });

  it.each([{ capitulo: 0 }, { todo: -1 }, { capitulo: 'x' }, { todo: null }])('rechaza el límite %j', (limiteVerificacion) => {
    expect(() => cargarConfig(dirCon({ limiteVerificacion }), 'config.json'))
      .toThrow('config: limiteVerificacion necesita capitulo y todo, en minutos mayores que cero');
  });
});
