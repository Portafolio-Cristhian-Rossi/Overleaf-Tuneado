import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { dirTemporal } from '../pruebas/ayudas/temporales';
import { cargarSugerencias, lineaDeCita } from './sugerencias';
import { crearVerificaciones, type Verificaciones } from './verificaciones';

let informe: string;
let dirVerificaciones: string;
let v: Verificaciones;
const FECHA = new Date(2026, 9, 26, 21, 54);

beforeEach(() => {
  const raiz = dirTemporal();
  informe = path.join(raiz, 'informe');
  fs.mkdirSync(path.join(informe, 'Cap6 - Anexos'), { recursive: true });
  // Como los archivos de Overleaf: con CRLF.
  fs.writeFileSync(path.join(informe, 'Cap2.tex'), '\\chapter{Antecedentes}\r\n\r\nEl modelo no puede\r\nclasificar una categoría.\r\n');
  fs.writeFileSync(path.join(informe, 'Cap6 - Anexos', 'B.tex'), '\\chapter{Arquitectura}\r\n');
  dirVerificaciones = path.join(raiz, 'verificaciones');
  v = crearVerificaciones(dirVerificaciones);
});

const cargar = (crudas: unknown) => cargarSugerencias({ dirInforme: informe, verificaciones: v, crudas, autor: 'Claude', fecha: FECHA });

describe('lineaDeCita', () => {
  it('encuentra la cita aunque cruce un salto de línea', () => {
    expect(lineaDeCita('a\nb\nEl modelo no puede\nclasificar', 'El modelo no puede clasificar')).toBe(3);
    expect(lineaDeCita('a\nb', 'c')).toBeNull();
    expect(lineaDeCita('a', '  ')).toBeNull();
  });
});

describe('cargarSugerencias', () => {
  it('guarda una corrida de sugerencias con la línea de cada cita', async () => {
    const r = await cargar([
      { archivo: 'Cap2.tex', cita: 'El modelo no puede clasificar', explicacion: 'Redacción: «no puede asignar».' },
      { archivo: 'Cap6 - Anexos/B.tex', cita: '\\chapter{Arquitectura}', explicacion: 'Nombre del archivo cruzado.' },
    ]);
    expect(r.descartadas).toEqual([]);
    expect(r.corrida).toMatchObject({ contra: 'informe', autor: 'Claude', estado: 'ok', descartados: 0, archivos: ['Cap2.tex', 'Cap6 - Anexos/B.tex'] });
    expect(r.corrida!.hallazgos.map((h) => [h.tipo, h.informe.archivo, h.informe.linea, h.repo])).toEqual([
      ['sugerencia', 'Cap2.tex', 3, null],
      ['sugerencia', 'Cap6 - Anexos/B.tex', 1, null],
    ]);
    expect(fs.readdirSync(dirVerificaciones)).toEqual(['2026-10-26-2154-sugeren.json']);
    expect(await v.ultima('informe')).toEqual(r.corrida);
  });

  it('descarta las que no se pueden ubicar y dice cuáles', async () => {
    const r = await cargar([
      { archivo: 'Cap2.tex', cita: 'una frase que no está', explicacion: 'x' },
      { archivo: 'Cap2.tex', cita: '\\chapter{Antecedentes}', explicacion: 'Bien.' },
      { archivo: 'Otro.tex', cita: 'El modelo', explicacion: 'x' },
      { archivo: '../afuera.tex', cita: 'El modelo', explicacion: 'x' },
      { archivo: 'Cap2.tex', cita: 'El modelo', explicacion: '  ' },
      'no es un objeto',
    ]);
    expect(r.descartadas).toEqual([1, 3, 4, 5, 6]);
    expect(r.corrida!.descartados).toBe(5);
    expect(r.corrida!.hallazgos.map((h) => h.explicacion)).toEqual(['Bien.']);
  });

  it('si no queda ninguna, no guarda nada', async () => {
    const r = await cargar([{ archivo: 'Cap2.tex', cita: 'no está', explicacion: 'x' }]);
    expect(r).toEqual({ corrida: null, descartadas: [1] });
    expect(fs.existsSync(dirVerificaciones)).toBe(false);
  });

  it('rechaza un archivo que no es una lista', async () => {
    await expect(cargar({ archivo: 'Cap2.tex' })).rejects.toThrow('lista de sugerencias');
  });
});
