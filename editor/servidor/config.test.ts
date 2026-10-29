import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dirTemporal } from '../pruebas/ayudas/temporales';
import { cargarConfig } from './config';

// editor/ va dentro de un temporal propio: así el ../proyecto por defecto no cae en os.tmpdir().
function dirEditor(): string {
  const dir = path.join(dirTemporal(), 'editor');
  fs.mkdirSync(dir);
  return dir;
}

function dirCon(contenido: object, archivo = 'config.json'): string {
  const dir = dirEditor();
  fs.writeFileSync(path.join(dir, archivo), JSON.stringify(contenido));
  return dir;
}

// editor/ y proyecto/ hermanos, cada uno con su config.json (texto tal cual, o un objeto).
function conProyecto(proyecto: object | string, personal: object | string = {}): { editor: string; proyecto: string } {
  const editor = dirEditor();
  const dirProyecto = path.resolve(editor, '../proyecto');
  fs.mkdirSync(dirProyecto);
  const texto = (x: object | string) => (typeof x === 'string' ? x : JSON.stringify(x));
  fs.writeFileSync(path.join(dirProyecto, 'config.json'), texto(proyecto));
  fs.writeFileSync(path.join(editor, 'config.json'), texto(personal));
  return { editor, proyecto: dirProyecto };
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
    expect(cargarConfig(dirEditor(), 'config.json').puerto).toBe(4317);
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

  it('proyecto/config.json se aplica debajo de editor/config.json', () => {
    const { editor } = conProyecto({ principal: 'tesis.tex', puerto: 5000 }, { puerto: 5001 });
    expect(cargarConfig(editor, 'config.json')).toMatchObject({ principal: 'tesis.tex', puerto: 5001 });
  });

  it('las rutas de proyecto/config.json son relativas a proyecto/', () => {
    const { editor, proyecto } = conProyecto({ repositorio: '../../app', informe: '../informe' });
    const c = cargarConfig(editor, 'config.json');
    expect(c.repositorio).toBe(path.resolve(proyecto, '../../app'));
    expect(c.informe).toBe(path.resolve(proyecto, '../informe'));
  });

  it('las rutas de editor/config.json siguen relativas a editor/', () => {
    const { editor } = conProyecto({ repositorio: '../../app' }, { repositorio: '../../../otra' });
    expect(cargarConfig(editor, 'config.json').repositorio).toBe(path.resolve(editor, '../../../otra'));
  });

  it('limiteVerificacion se combina por campo entre capas', () => {
    const { editor } = conProyecto({ limiteVerificacion: { capitulo: 5 } }, { limiteVerificacion: { todo: 50 } });
    expect(cargarConfig(editor, 'config.json').limiteVerificacion).toEqual({ capitulo: 5, todo: 50 });
  });

  it('proyecto: por defecto ../proyecto y se puede cambiar en la config personal', () => {
    const dir = dirCon({});
    expect(cargarConfig(dir, 'config.json').proyecto).toBe(path.resolve(dir, '../proyecto'));
    const otro = dirCon({ proyecto: '../otro' });
    fs.mkdirSync(path.resolve(otro, '../otro'));
    fs.writeFileSync(path.resolve(otro, '../otro/config.json'), JSON.stringify({ principal: 'otro.tex' }));
    const c = cargarConfig(otro, 'config.json');
    expect(c.proyecto).toBe(path.resolve(otro, '../otro'));
    expect(c.principal).toBe('otro.tex');
  });

  it('rechaza la clave proyecto dentro de proyecto/config.json', () => {
    const { editor } = conProyecto({ proyecto: '../x' });
    expect(() => cargarConfig(editor, 'config.json')).toThrow(/proyecto\/config\.json.*proyecto/);
  });

  it('glosario y marcoTeorico: defaults, null y valores', () => {
    expect(cargarConfig(dirCon({}), 'config.json')).toMatchObject({ glosario: 'Glosario', marcoTeorico: ['antecedentes', 'marco teórico'] });
    expect(cargarConfig(dirCon({ glosario: null, marcoTeorico: null }), 'config.json')).toMatchObject({ glosario: null, marcoTeorico: null });
    const { editor } = conProyecto({ glosario: 'Términos', marcoTeorico: ['estado del arte'] });
    expect(cargarConfig(editor, 'config.json')).toMatchObject({ glosario: 'Términos', marcoTeorico: ['estado del arte'] });
    expect(() => cargarConfig(dirCon({ glosario: 3 }), 'config.json')).toThrow(/glosario/);
    expect(() => cargarConfig(dirCon({ marcoTeorico: 'x' }), 'config.json')).toThrow(/marcoTeorico/);
  });

  it('sin carpeta proyecto/ arranca con los defaults', () => {
    const c = cargarConfig(dirCon({}), 'config.json');
    expect(c).toMatchObject({ principal: 'main.tex', repositorio: null, glosario: 'Glosario' });
  });

  it('un proyecto/config.json inválido nombra el archivo', () => {
    const { editor } = conProyecto('{no');
    expect(() => cargarConfig(editor, 'config.json')).toThrow(/proyecto\/config\.json/);
  });

  it('lee archivos con BOM', () => {
    const bom = String.fromCharCode(0xfeff);
    const { editor } = conProyecto(`${bom}{"principal":"b.tex"}`, `${bom}{"puerto":5002}`);
    expect(cargarConfig(editor, 'config.json')).toMatchObject({ principal: 'b.tex', puerto: 5002 });
  });
});
