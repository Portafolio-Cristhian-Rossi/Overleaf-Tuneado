import { describe, expect, it } from 'vitest';
import {
  compararCorridas, contraDe, contraDeTipo, idDeHallazgo, normalizarEspacios, normalizarRuta, TIPOS_DEL_AGENTE, validarHallazgos, type Hallazgo,
} from './verificacion';

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

describe('validarHallazgos contra el informe', () => {
  const TEXTOS = new Map([
    ['Cap1.tex', 'Se usan tres redes sociales.\n'],
    ['Cap3.tex', 'Se usan cuatro redes\nsociales.\nEl preprocesamiento limpia.\n'],
    ['Glosario.tex', '\\item[Preprocesamiento] Transformar el texto.\n'],
  ]);
  const ctx = { informe: TEXTOS, lineasDelRepo: () => null, revisados: ['Cap3.tex'] };
  const tipos = TIPOS_DEL_AGENTE.informe;
  const principal = { archivo: 'Cap3.tex', linea: 1, cita: 'Se usan cuatro redes sociales.' };
  const otra = { archivo: 'Cap1.tex', linea: 1, cita: 'Se usan tres redes sociales.' };
  const informe = (cambios: object = {}) => ({ tipo: 'se-contradice', informe: principal, referencia: otra, explicacion: 'No coincide la cantidad.', ...cambios });

  it('acepta se-contradice con las dos citas y la referencia en otro archivo', () => {
    const r = validarHallazgos([informe()], ctx, tipos);
    expect(r.descartados).toBe(0);
    expect(r.hallazgos[0]).toMatchObject({
      tipo: 'se-contradice', repo: null,
      informe: { archivo: 'Cap3.tex', cita: 'Se usan cuatro redes sociales.' },
      referencia: { archivo: 'Cap1.tex', linea: 1, cita: 'Se usan tres redes sociales.' },
    });
  });

  it('descarta se-contradice y definicion-distinta sin referencia', () => {
    const r = validarHallazgos([
      informe({ referencia: undefined }),
      informe({ tipo: 'definicion-distinta', referencia: null }),
    ], ctx, tipos);
    expect(r).toEqual({ hallazgos: [], descartados: 2 });
  });

  it('corta-el-hilo acepta con y sin referencia', () => {
    const r = validarHallazgos([
      informe({ tipo: 'corta-el-hilo' }),
      informe({ tipo: 'corta-el-hilo', informe: { archivo: 'Cap3.tex', linea: 3, cita: 'El preprocesamiento limpia.' }, referencia: undefined }),
    ], ctx, tipos);
    expect(r.descartados).toBe(0);
    expect(r.hallazgos[0].referencia?.archivo).toBe('Cap1.tex');
    expect('referencia' in r.hallazgos[1]).toBe(false);
  });

  it('descarta sin-definir con referencia', () => {
    const r = validarHallazgos([
      informe({ tipo: 'sin-definir' }),
      informe({ tipo: 'sin-definir', referencia: undefined }),
    ], ctx, tipos);
    expect(r.descartados).toBe(1);
    expect(r.hallazgos.map((h) => h.tipo)).toEqual(['sin-definir']);
  });

  it('descarta la cita principal fuera de los revisados, pero acepta la referencia en cualquier archivo de la foto', () => {
    const definicion = { archivo: 'Glosario.tex', linea: 1, cita: '\\item[Preprocesamiento] Transformar el texto.' };
    const uso = { archivo: 'Cap3.tex', linea: 3, cita: 'El preprocesamiento limpia.' };
    const r = validarHallazgos([
      informe({ tipo: 'definicion-distinta', informe: definicion, referencia: uso }),
      informe({ tipo: 'definicion-distinta', informe: uso, referencia: definicion }),
    ], ctx, tipos);
    expect(r.descartados).toBe(1);
    expect(r.hallazgos[0]).toMatchObject({ informe: { archivo: 'Cap3.tex' }, referencia: { archivo: 'Glosario.tex' } });
  });

  it('descarta una referencia inventada, sin cita o igual a la cita principal', () => {
    const r = validarHallazgos([
      informe({ referencia: { archivo: 'Cap1.tex', linea: 1, cita: 'Se usan cinco redes.' } }),
      informe({ referencia: { archivo: 'Cap1.tex', linea: 1, cita: '' } }),
      informe({ referencia: { archivo: 'Cap1.tex', linea: 1 } }),
      informe({ referencia: { archivo: 'Otro.tex', linea: 1, cita: 'Se usan' } }),
      informe({ referencia: { ...principal, cita: 'Se usan  cuatro redes sociales.' } }),
    ], ctx, tipos);
    expect(r).toEqual({ hallazgos: [], descartados: 5 });
  });

  it('descarta los tipos de Código y sugerencia en una corrida de Informe, y los de Informe en una de Código', () => {
    expect(validarHallazgos([
      informe({ tipo: 'contradiccion', repo: { archivo: 'a.py', linea: 1 } }),
      informe({ tipo: 'sugerencia', referencia: undefined }),
    ], { ...ctx, lineasDelRepo: () => 10 }, tipos)).toEqual({ hallazgos: [], descartados: 2 });
    expect(validarHallazgos([informe()], { informe: TEXTOS, lineasDelRepo: () => 10 })).toEqual({ hallazgos: [], descartados: 1 });
  });

  it('normaliza la ruta de la referencia y conserva su línea solo si es un entero positivo', () => {
    const [a, b] = validarHallazgos([
      informe({ referencia: { archivo: 'informe/Cap1.tex', linea: 0, cita: 'Se usan tres' } }),
      // Otra cita principal: con la misma, los dos tendrían el mismo id y se fusionarían.
      informe({ informe: { archivo: 'Cap3.tex', linea: 3, cita: 'El preprocesamiento limpia.' }, referencia: { archivo: './Cap1.tex', linea: 4, cita: 'tres redes sociales.' } }),
    ], ctx, tipos).hallazgos;
    expect(a.referencia).toEqual({ archivo: 'Cap1.tex', linea: null, cita: 'Se usan tres' });
    expect(b.referencia).toEqual({ archivo: 'Cap1.tex', linea: 4, cita: 'tres redes sociales.' });
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

describe('idDeHallazgo de Código y de Informe', () => {
  it('los ids de Código no cambian', () => {
    expect(idDeHallazgo({ tipo: 'contradiccion', informe: { archivo: 'Cap3.tex', linea: 3, cita: 'la API escribe en la base' }, repo: { archivo: 'backend/app.py', linea: 2 } }))
      .toBe('237f7039');
  });

  it('en Informe cambia con el archivo de la referencia', () => {
    const base = { tipo: 'se-contradice', informe: { archivo: 'Cap3.tex', linea: 1, cita: 'x' }, repo: null, referencia: { archivo: 'Cap1.tex', linea: 1, cita: 'y' } } as const;
    expect(idDeHallazgo({ ...base, referencia: { ...base.referencia, archivo: 'Cap2.tex' } })).not.toBe(idDeHallazgo(base));
    expect(idDeHallazgo({ ...base, referencia: { ...base.referencia, cita: 'z' } })).toBe(idDeHallazgo(base));
  });
});

describe('contraDe', () => {
  it('usa contra si está; si no, autor → informe y sin autor → codigo', () => {
    expect(contraDe({ contra: 'informe' })).toBe('informe');
    expect(contraDe({ contra: 'codigo', autor: 'Claude' })).toBe('codigo');
    expect(contraDe({ autor: 'Claude' })).toBe('informe');
    expect(contraDe({})).toBe('codigo');
  });
});

describe('contraDeTipo', () => {
  it('sugerencia y los cuatro de Informe son informe; los otros, codigo', () => {
    for (const t of ['se-contradice', 'definicion-distinta', 'corta-el-hilo', 'sin-definir', 'sugerencia'] as const) expect(contraDeTipo(t)).toBe('informe');
    for (const t of ['contradiccion', 'no-lo-cuenta', 'sin-respaldo'] as const) expect(contraDeTipo(t)).toBe('codigo');
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
