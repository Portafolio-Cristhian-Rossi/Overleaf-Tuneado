import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Alcance, Corrida, Hallazgo } from '../compartido/verificacion';
import { dirTemporal } from '../pruebas/ayudas/temporales';
import { crearVerificaciones, HallazgoDesconocido, type Verificaciones } from './verificaciones';

let dir: string;
let v: Verificaciones;

beforeEach(() => {
  dir = path.join(dirTemporal(), 'verificaciones');
  v = crearVerificaciones(dir);
});

const hallazgo = (id: string): Hallazgo => ({
  id,
  tipo: 'contradiccion',
  informe: { archivo: 'Cap3.tex', linea: 4, cita: `cita ${id}` },
  repo: { archivo: 'src/a.py', linea: 2 },
  explicacion: `explicación ${id}`,
});

const FECHA = new Date(2026, 9, 18, 14, 32).toISOString();

function corrida(parcial: Partial<Omit<Corrida, 'comparacion' | 'resueltos'>> & { ids?: string[] } = {}) {
  const { ids = [], ...resto } = parcial;
  return {
    fecha: FECHA,
    alcance: 'capitulo' as Alcance,
    archivos: ['Cap3.tex'],
    rama: 'main',
    commit: '583d2cc1aaaaaaaa',
    duracionMs: 1000,
    estado: 'ok' as const,
    crudo: null,
    descartados: 0,
    hallazgos: ids.map(hallazgo),
    ...resto,
  };
}

describe('verificaciones', () => {
  it('guarda con nombre AAAA-MM-DD-HHmm-<commit corto> y la devuelve como última', async () => {
    const guardada = await v.guardar(corrida({ ids: ['x'] }));
    expect(fs.readdirSync(dir)).toEqual(['2026-10-18-1432-583d2cc.json']);
    expect(guardada.resueltos).toEqual([]);
    expect(guardada.comparacion).toBeNull();
    expect(await v.ultima()).toEqual(guardada);
  });

  it('dos corridas en el mismo minuto no se pisan', async () => {
    await v.guardar(corrida({ ids: ['x'] }));
    const segunda = await v.guardar(corrida({ ids: ['y'] }));
    await v.guardar(corrida({ ids: ['z'] }));
    expect(fs.readdirSync(dir).sort()).toEqual([
      '2026-10-18-1432-583d2cc-2.json',
      '2026-10-18-1432-583d2cc-3.json',
      '2026-10-18-1432-583d2cc.json',
    ]);
    expect(segunda.hallazgos[0]!.id).toBe('y');
    expect((await v.ultima())!.hallazgos[0]!.id).toBe('z');
  });

  it('la última respeta el orden numérico del sufijo', async () => {
    for (let i = 0; i < 10; i++) await v.guardar(corrida({ ids: [`h${i}`] }));
    expect(fs.existsSync(path.join(dir, '2026-10-18-1432-583d2cc-10.json'))).toBe(true);
    expect((await v.ultima())!.hallazgos[0]!.id).toBe('h9');
  });

  it('en el mismo minuto con otro commit, la última es la guardada después', async () => {
    await v.guardar(corrida({ ids: ['x'], commit: 'bbbbbbb1' }));
    const b = await v.guardar(corrida({ ids: ['y'], commit: 'aaaaaaa1' }));
    expect(b.comparacion).toEqual({ nuevos: 1, yaNoAparecen: 1 });
    expect((await v.ultima())!.hallazgos[0]!.id).toBe('y');
    const c = await v.guardar(corrida({ ids: ['y', 'z'], commit: 'ccccccc1' }));
    expect(c.comparacion).toEqual({ nuevos: 1, yaNoAparecen: 0 });
    expect((await v.ultima())!.hallazgos.map((h) => h.id)).toEqual(['y', 'z']);
  });

  it('marcar resuelto tolera una corrida sin lista de resueltos', async () => {
    await v.guardar(corrida({ ids: ['x'] }));
    const archivo = path.join(dir, fs.readdirSync(dir)[0]!);
    const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    delete datos.resueltos;
    fs.writeFileSync(archivo, JSON.stringify(datos));
    await v.marcarResuelto('x');
    expect((await v.ultima())!.resueltos).toEqual(['x']);
  });

  it('la última es la de fecha mayor', async () => {
    await v.guardar(corrida({ ids: ['viejo'], fecha: new Date(2026, 9, 18, 9, 5).toISOString() }));
    await v.guardar(corrida({ ids: ['nuevo'], fecha: new Date(2026, 9, 18, 14, 32).toISOString(), commit: 'aaaaaaa1' }));
    expect((await v.ultima())!.hallazgos[0]!.id).toBe('nuevo');
  });

  it('compara con la anterior del mismo alcance y los mismos archivos', async () => {
    const primera = await v.guardar(corrida({ ids: ['x', 'y'] }));
    expect(primera.comparacion).toBeNull();
    const todo = await v.guardar(corrida({ alcance: 'todo', archivos: ['Cap1.tex', 'Cap3.tex'], ids: ['x'] }));
    expect(todo.comparacion).toBeNull();
    const tercera = await v.guardar(corrida({ ids: ['y', 'z'] }));
    expect(tercera.comparacion).toEqual({ nuevos: 1, yaNoAparecen: 1 });
  });

  it('los archivos se comparan sin importar el orden', async () => {
    await v.guardar(corrida({ alcance: 'todo', archivos: ['a.tex', 'b.tex'], ids: ['x'] }));
    const c = await v.guardar(corrida({ alcance: 'todo', archivos: ['b.tex', 'a.tex'], ids: ['x', 'y'] }));
    expect(c.comparacion).toEqual({ nuevos: 1, yaNoAparecen: 0 });
  });

  it('una corrida fallida no se compara ni sirve de anterior', async () => {
    await v.guardar(corrida({ ids: ['x'] }));
    const fallida = await v.guardar(corrida({ estado: 'fallida', crudo: 'basura', ids: [] }));
    expect(fallida.comparacion).toBeNull();
    const c = await v.guardar(corrida({ ids: ['x', 'y'] }));
    expect(c.comparacion).toEqual({ nuevos: 1, yaNoAparecen: 0 });
  });

  it('marcar resuelto persiste al releer', async () => {
    await v.guardar(corrida({ ids: ['x', 'y'] }));
    await v.marcarResuelto('x');
    await v.marcarResuelto('x');
    expect((await v.ultima())!.resueltos).toEqual(['x']);
    expect((await crearVerificaciones(dir).ultima())!.resueltos).toEqual(['x']);
  });

  it('ignorar guarda cita y explicación, y recuperar lo quita', async () => {
    await v.guardar(corrida({ ids: ['x', 'y'] }));
    await v.ignorar('x');
    await v.ignorar('x');
    const lista = await v.ignorados();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      id: 'x',
      tipo: 'contradiccion',
      archivoInforme: 'Cap3.tex',
      cita: 'cita x',
      archivoRepo: 'src/a.py',
      explicacion: 'explicación x',
    });
    expect(new Date(lista[0]!.fecha).getTime()).not.toBeNaN();
    expect(fs.existsSync(path.join(dir, 'ignorados.json'))).toBe(true);
    expect((await v.ultima())!.hallazgos).toHaveLength(2);

    await v.recuperar('x');
    expect(await v.ignorados()).toEqual([]);
  });

  it('un hallazgo sin lado del repositorio se ignora con archivoRepo null', async () => {
    const h: Hallazgo = { ...hallazgo('s'), tipo: 'sin-respaldo', repo: null };
    await v.guardar({ ...corrida(), hallazgos: [h] });
    await v.ignorar('s');
    expect((await v.ignorados())[0]!.archivoRepo).toBeNull();
  });

  it('ignorar o resolver un id que no está lanza HallazgoDesconocido', async () => {
    await v.guardar(corrida({ ids: ['x'] }));
    await expect(v.ignorar('nada')).rejects.toBeInstanceOf(HallazgoDesconocido);
    await expect(v.marcarResuelto('nada')).rejects.toBeInstanceOf(HallazgoDesconocido);
    await expect(v.recuperar('nada')).rejects.toBeInstanceOf(HallazgoDesconocido);
  });

  it('sin corridas, ignorar y resolver lanzan HallazgoDesconocido', async () => {
    await expect(v.ignorar('x')).rejects.toBeInstanceOf(HallazgoDesconocido);
    await expect(v.marcarResuelto('x')).rejects.toBeInstanceOf(HallazgoDesconocido);
  });

  it('sin carpeta, ultima es null e ignorados es []', async () => {
    expect(await v.ultima()).toBeNull();
    expect(await v.ignorados()).toEqual([]);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('salta los archivos ilegibles al buscar la última', async () => {
    await v.guardar(corrida({ ids: ['x'] }));
    fs.writeFileSync(path.join(dir, '2026-10-18-1500-bbbbbbb.json'), '{ roto');
    expect((await v.ultima())!.hallazgos[0]!.id).toBe('x');
  });

  it('guardados simultáneos quedan en archivos distintos', async () => {
    await Promise.all([1, 2, 3].map((i) => v.guardar(corrida({ ids: [`h${i}`] }))));
    expect(fs.readdirSync(dir)).toHaveLength(3);
  });
});
