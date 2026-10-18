import { describe, expect, it } from 'vitest';
import type { Corrida, Hallazgo, Ignorado, TipoDeHallazgo } from '../compartido/verificacion';
import { agrupar, encabezado, hallazgosVisibles, NOMBRE_DE_TIPO, opcionesDeVerificacion, ubicarCita } from './verificacion';

function hallazgo(id: string, tipo: TipoDeHallazgo, archivo = 'a.tex'): Hallazgo {
  return { id, tipo, informe: { archivo, linea: 1, cita: 'x' }, repo: tipo === 'sin-respaldo' ? null : { archivo: 'r.py', linea: 1 }, explicacion: 'e' };
}

function corrida(extra: Partial<Corrida> = {}): Corrida {
  return {
    fecha: new Date(2026, 9, 18, 14, 32).toISOString(), alcance: 'capitulo', archivos: ['a.tex'], rama: 'main', commit: 'abcdef1234',
    duracionMs: 1000, estado: 'ok', crudo: null, descartados: 0, hallazgos: [], resueltos: [], comparacion: null, ...extra,
  };
}

describe('ubicarCita', () => {
  it('ubica una cita con otros espacios y saltos de línea', () => {
    expect(ubicarCita('Hola.\nLa API\n  escribe en la base.', 'La API escribe en la base', 2)).toEqual({ desde: 6, hasta: 33 });
  });

  it('si aparece dos veces, elige la más cercana a la línea pista', () => {
    const texto = 'uno\nrepetida\ndos\ntres\ncuatro\nrepetida\n';
    expect(ubicarCita(texto, 'repetida', 2)?.desde).toBe(texto.indexOf('repetida'));
    expect(ubicarCita(texto, 'repetida', 6)?.desde).toBe(texto.lastIndexOf('repetida'));
    expect(ubicarCita(texto, 'repetida', null)?.desde).toBe(texto.indexOf('repetida'));
  });

  it('cita que ya no está o vacía → null', () => {
    expect(ubicarCita('Hola mundo', 'adiós', 1)).toBeNull();
    expect(ubicarCita('Hola mundo', '   ', 1)).toBeNull();
    expect(ubicarCita('Hola mundo', '', null)).toBeNull();
  });

  it('caracteres especiales de expresiones regulares en la cita', () => {
    const texto = 'Antes f(x) = $a+b$ [1] después';
    expect(ubicarCita(texto, 'f(x) = $a+b$ [1]', null)).toEqual({ desde: 6, hasta: 22 });
  });
});

describe('hallazgosVisibles', () => {
  it('oculta resueltos e ignorados', () => {
    const c = corrida({ hallazgos: [hallazgo('1', 'contradiccion'), hallazgo('2', 'contradiccion'), hallazgo('3', 'contradiccion')], resueltos: ['1'] });
    const ignorados = [{ id: '2' }] as Ignorado[];
    expect(hallazgosVisibles(c, ignorados).map((h) => h.id)).toEqual(['3']);
  });
});

describe('agrupar', () => {
  it('agrupa en orden contradicción, sin respaldo, no lo cuenta, y por archivo', () => {
    const grupos = agrupar([
      hallazgo('1', 'no-lo-cuenta', 'b.tex'),
      hallazgo('2', 'sin-respaldo', 'a.tex'),
      hallazgo('3', 'contradiccion', 'b.tex'),
      hallazgo('4', 'contradiccion', 'a.tex'),
      hallazgo('5', 'contradiccion', 'b.tex'),
    ]);
    expect(grupos.map((g) => g.tipo)).toEqual(['contradiccion', 'sin-respaldo', 'no-lo-cuenta']);
    expect(grupos[0].archivos.map((a) => [a.archivo, a.hallazgos.map((h) => h.id)])).toEqual([['b.tex', ['3', '5']], ['a.tex', ['4']]]);
  });

  it('omite los tipos sin hallazgos', () => {
    expect(agrupar([])).toEqual([]);
  });
});

describe('NOMBRE_DE_TIPO', () => {
  it('usa los textos del panel', () => {
    expect(NOMBRE_DE_TIPO).toEqual({ contradiccion: 'Contradicción', 'no-lo-cuenta': 'El informe no lo cuenta', 'sin-respaldo': 'Sin respaldo en el código' });
  });
});

describe('encabezado', () => {
  it('primera línea con fecha local, alcance y rama', () => {
    expect(encabezado(corrida())).toEqual(['18/10 14:32 · capítulo · main abcdef1']);
    expect(encabezado(corrida({ alcance: 'todo' }))[0]).toContain('todo el informe');
  });

  it('agrega la comparación y los descartados', () => {
    expect(encabezado(corrida({ comparacion: { nuevos: 3, yaNoAparecen: 2 } }))[1]).toBe('3 nuevos · 2 ya no aparecen');
    expect(encabezado(corrida({ descartados: 2 }))).toEqual(['18/10 14:32 · capítulo · main abcdef1', '2 hallazgos descartados por citas que no existen']);
    expect(encabezado(corrida({ descartados: 1 }))[1]).toBe('1 hallazgo descartado por una cita que no existe');
    expect(encabezado(corrida({ comparacion: { nuevos: 0, yaNoAparecen: 0 }, descartados: 1 }))).toHaveLength(3);
  });
});

describe('opcionesDeVerificacion', () => {
  const libre = { estado: 'libre', error: null } as const;

  it('libre con un capítulo abierto habilita las dos', () => {
    expect(opcionesDeVerificacion(libre, 'a.tex', true)).toEqual([
      { alcance: 'capitulo', texto: 'Verificar capítulo', habilitada: true },
      { alcance: 'todo', texto: 'Verificar todo', habilitada: true },
    ]);
  });

  it('con otro archivo abierto, el capítulo queda deshabilitado', () => {
    const [capitulo, todo] = opcionesDeVerificacion(libre, 'refs.bib', false);
    expect(capitulo).toMatchObject({ habilitada: false, ayuda: 'Abrí un capítulo para verificarlo.' });
    expect(todo.habilitada).toBe(true);
  });

  it('en curso deshabilita las dos', () => {
    const opciones = opcionesDeVerificacion({ estado: 'en-curso', alcance: 'todo', desde: 0 }, 'a.tex', true);
    expect(opciones.map((o) => [o.habilitada, o.ayuda])).toEqual([[false, 'Ya hay una verificación en curso.'], [false, 'Ya hay una verificación en curso.']]);
  });

  it('deshabilitada deshabilita las dos con el motivo', () => {
    const opciones = opcionesDeVerificacion({ estado: 'deshabilitada', motivo: 'No hay repositorio.' }, 'a.tex', true);
    expect(opciones.map((o) => [o.habilitada, o.ayuda])).toEqual([[false, 'No hay repositorio.'], [false, 'No hay repositorio.']]);
  });
});
