import { describe, expect, it } from 'vitest';
import { compararCorridas, idDeHallazgo, normalizarEspacios, normalizarRuta, validarHallazgos, type Hallazgo } from './verificacion';

const INFORME = new Map([['Cap3.tex', 'La API\nescribe   en la base.\n\\section{Datos}\n']]);
const contexto = { informe: INFORME, lineasDelRepo: (a: string) => (a === 'backend/jobs.py' ? 120 : null) };
const crudo = (cambios: object = {}) => ({
  tipo: 'contradiccion', informe: { archivo: 'Cap3.tex', linea: 1, cita: 'La API escribe en la base' },
  repo: { archivo: 'backend/jobs.py', linea: 88 }, explicacion: 'Escribe el orquestador.', ...cambios,
});

describe('validarHallazgos', () => {
  it('acepta una cita que cruza un salto de línea y tiene espacios de más', () => {
    const r = validarHallazgos([crudo()], contexto);
    expect(r.descartados).toBe(0);
    expect(r.hallazgos[0]).toMatchObject({ tipo: 'contradiccion', informe: { archivo: 'Cap3.tex', cita: 'La API escribe en la base' } });
  });

  it('descarta una cita que no está en el archivo', () => {
    expect(validarHallazgos([crudo({ informe: { archivo: 'Cap3.tex', linea: 1, cita: 'la API lee' } })], contexto))
      .toEqual({ hallazgos: [], descartados: 1 });
  });

  it('descarta archivo del informe ausente, archivo del repo inexistente y línea fuera de rango', () => {
    const r = validarHallazgos([
      crudo({ informe: { archivo: 'Otro.tex', linea: 1, cita: 'La API' } }),
      crudo({ repo: { archivo: 'backend/nada.py', linea: 1 } }),
      crudo({ repo: { archivo: 'backend/jobs.py', linea: 121 } }),
    ], contexto);
    expect(r).toEqual({ hallazgos: [], descartados: 3 });
  });

  it('descarta tipo inválido y lados faltantes', () => {
    const r = validarHallazgos([
      crudo({ tipo: 'otro' }),
      crudo({ repo: null }),
      crudo({ tipo: 'no-lo-cuenta', repo: null }),
      crudo({ tipo: 'sin-respaldo', informe: { archivo: 'Cap3.tex', linea: 1, cita: null }, repo: null }),
    ], contexto);
    expect(r).toEqual({ hallazgos: [], descartados: 4 });
  });

  it('descarta explicación vacía y entradas que no son objetos', () => {
    expect(validarHallazgos([crudo({ explicacion: '  ' }), null, 'x'], contexto)).toEqual({ hallazgos: [], descartados: 3 });
  });

  it('sin-respaldo acepta repo ausente y no-lo-cuenta acepta cita ausente', () => {
    const r = validarHallazgos([
      crudo({ tipo: 'sin-respaldo', repo: null }),
      crudo({ tipo: 'no-lo-cuenta', informe: { archivo: 'Cap3.tex', linea: 2, cita: null } }),
    ], contexto);
    expect(r.descartados).toBe(0);
    expect(r.hallazgos).toHaveLength(2);
    expect(r.hallazgos[0].repo).toBeNull();
    expect(r.hallazgos[1].informe.cita).toBeNull();
  });

  it('el agente no puede devolver sugerencias', () => {
    expect(validarHallazgos([crudo({ tipo: 'sugerencia', repo: null })], contexto)).toEqual({ hallazgos: [], descartados: 1 });
  });

  it('con el tipo sugerencia pedido, exige la cita y deja el repo en null', () => {
    const r = validarHallazgos([
      crudo({ tipo: 'sugerencia', repo: null }),
      crudo({ tipo: 'sugerencia', informe: { archivo: 'Cap3.tex', linea: 1, cita: 'escribe en la base' } }),
      crudo({ tipo: 'sugerencia', informe: { archivo: 'Cap3.tex', linea: 1, cita: null }, repo: null }),
      crudo(),
    ], contexto, ['sugerencia']);
    expect(r.descartados).toBe(2);
    expect(r.hallazgos.map((h) => [h.tipo, h.informe.cita, h.repo])).toEqual([
      ['sugerencia', 'La API escribe en la base', null],
      ['sugerencia', 'escribe en la base', null],
    ]);
  });

  it('conserva la línea del informe solo si es un entero positivo', () => {
    const [a, b] = validarHallazgos([
      crudo({ informe: { archivo: 'Cap3.tex', linea: 2.5, cita: 'La API' } }),
      crudo({ informe: { archivo: 'Cap3.tex', linea: 3, cita: 'escribe en la base' } }),
    ], contexto).hallazgos;
    expect(a.informe.linea).toBeNull();
    expect(b.informe.linea).toBe(3);
  });

  it('normaliza las rutas del agente y cuenta una vez los ids repetidos', () => {
    const r = validarHallazgos([
      crudo({ informe: { archivo: 'informe/Cap3.tex', linea: 1, cita: 'La API' }, repo: { archivo: 'repositorio\\backend\\jobs.py', linea: 3 } }),
      crudo({ informe: { archivo: './Cap3.tex', linea: 9, cita: 'La  API' }, repo: { archivo: 'backend/jobs.py', linea: 4 } }),
    ], contexto);
    expect(r.hallazgos).toHaveLength(1);
    expect(r.hallazgos[0].informe.archivo).toBe('Cap3.tex');
    expect(r.hallazgos[0].repo?.archivo).toBe('backend/jobs.py');
  });

  it('fusiona los no-lo-cuenta con el mismo par de archivos y junta las explicaciones distintas', () => {
    const falta = (linea: number, explicacion: string) =>
      crudo({ tipo: 'no-lo-cuenta', informe: { archivo: 'Cap3.tex', linea, cita: null }, repo: { archivo: 'backend/jobs.py', linea }, explicacion });
    const r = validarHallazgos([
      falta(2, 'No cuenta los reintentos.'),
      falta(5, 'No cuenta el límite de tiempo.'),
      falta(7, 'No cuenta los reintentos.'),
    ], contexto);
    expect(r.descartados).toBe(0);
    expect(r.hallazgos).toHaveLength(1);
    expect(r.hallazgos[0]).toMatchObject({
      informe: { linea: 2 }, repo: { linea: 2 },
      explicacion: 'No cuenta los reintentos. No cuenta el límite de tiempo.',
    });
  });

  it('no repite la explicación cuando los repetidos dicen lo mismo', () => {
    const falta = (linea: number) =>
      crudo({ tipo: 'no-lo-cuenta', informe: { archivo: 'Cap3.tex', linea, cita: null }, explicacion: 'No cuenta los reintentos.' });
    const r = validarHallazgos([falta(2), falta(3)], contexto);
    expect(r).toMatchObject({ descartados: 0, hallazgos: [{ informe: { linea: 2 }, explicacion: 'No cuenta los reintentos.' }] });
    expect(r.hallazgos).toHaveLength(1);
  });

  it('si lo crudo no es un arreglo, no hay hallazgos ni descartados', () => {
    expect(validarHallazgos({ a: 1 }, contexto)).toEqual({ hallazgos: [], descartados: 0 });
  });
});

describe('normalizarEspacios', () => {
  it('junta los espacios y saltos en uno y recorta', () => {
    expect(normalizarEspacios('  a \n\t b  ')).toBe('a b');
  });
});

describe('normalizarRuta', () => {
  it('normaliza rutas del agente', () => {
    expect(normalizarRuta('repositorio/backend/jobs.py', 'repositorio')).toBe('backend/jobs.py');
    expect(normalizarRuta('.\\backend\\jobs.py', 'repositorio')).toBe('backend/jobs.py');
    expect(normalizarRuta('informe/Cap3.tex', 'informe')).toBe('Cap3.tex');
    expect(normalizarRuta('../.env', 'repositorio')).toBeNull();
    expect(normalizarRuta('C:/x/y.py', 'repositorio')).toBeNull();
    expect(normalizarRuta('/etc/passwd', 'repositorio')).toBeNull();
    expect(normalizarRuta('a/../b', 'repositorio')).toBeNull();
    expect(normalizarRuta('repositorio/', 'repositorio')).toBeNull();
  });
});

describe('idDeHallazgo', () => {
  it('no cambia con los espacios de la cita ni con la línea', () => {
    const a = validarHallazgos([crudo()], contexto).hallazgos[0];
    const b = validarHallazgos([crudo({ informe: { archivo: 'Cap3.tex', linea: 7, cita: 'La  API escribe en\nla base' } })], contexto).hallazgos[0];
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('cambia con el tipo, la cita y el archivo del repo', () => {
    const base = { tipo: 'contradiccion', informe: { archivo: 'Cap3.tex', linea: 1, cita: 'x' }, repo: { archivo: 'a.py', linea: 1 } } as const;
    const id = idDeHallazgo(base);
    expect(idDeHallazgo({ ...base, tipo: 'no-lo-cuenta' })).not.toBe(id);
    expect(idDeHallazgo({ ...base, informe: { ...base.informe, cita: 'y' } })).not.toBe(id);
    expect(idDeHallazgo({ ...base, repo: { archivo: 'b.py', linea: 1 } })).not.toBe(id);
  });
});

describe('compararCorridas', () => {
  const h = (id: string): Hallazgo => ({
    id, tipo: 'sin-respaldo', informe: { archivo: 'Cap3.tex', linea: null, cita: id }, repo: null, explicacion: 'e',
  });
  it('compara corridas por id', () => {
    const [x, y, z] = [h('x'), h('y'), h('z')];
    expect(compararCorridas([x, y], [y, z])).toEqual({ nuevos: 1, yaNoAparecen: 1 });
    expect(compararCorridas([], [])).toEqual({ nuevos: 0, yaNoAparecen: 0 });
  });
});
