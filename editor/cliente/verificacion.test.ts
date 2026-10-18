import { describe, expect, it } from 'vitest';
import type { Corrida, Hallazgo, Ignorado, TipoDeHallazgo } from '../compartido/verificacion';
import {
  agrupar, avisoAlTerminar, encabezado, hallazgosVisibles, mensajesDelPanel, NOMBRE_DE_TIPO, opcionesDeVerificacion, rutaParaCopiar,
  tiempoTranscurrido, ubicarCita, ubicarEnArchivo,
} from './verificacion';

function hallazgo(id: string, tipo: TipoDeHallazgo, archivo = 'a.tex'): Hallazgo {
  return { id, tipo, informe: { archivo, linea: 1, cita: 'x' }, repo: tipo === 'sin-respaldo' ? null : { archivo: 'r.py', linea: 1 }, explicacion: 'e' };
}

function corrida(extra: Partial<Corrida> = {}): Corrida {
  return {
    fecha: new Date(2026, 9, 18, 14, 32).toISOString(), alcance: 'capitulo', archivos: ['a.tex'], rama: 'main', commit: 'abcdef1234',
    duracionMs: 1000, costoUsd: null, estado: 'ok', crudo: null, descartados: 0, hallazgos: [], resueltos: [], comparacion: null, ...extra,
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
  it('primera línea con fecha local, alcance y rama; la segunda, cuánto tardó', () => {
    expect(encabezado(corrida())).toEqual(['18/10 14:32 · capítulo · main abcdef1', 'Tardó 0:01']);
    expect(encabezado(corrida({ alcance: 'todo' }))[0]).toContain('todo el informe');
  });

  it('con el costo en la cuenta, también cuánto costó', () => {
    expect(encabezado(corrida({ duracionMs: 118_928, costoUsd: 0.5187728 }))[1]).toBe('Tardó 1:58 · costó US$ 0,52');
    // Las corridas guardadas antes de esta versión no tienen costo.
    const vieja: Partial<Corrida> = { duracionMs: 60_000 };
    expect(encabezado({ ...corrida(vieja), costoUsd: undefined as unknown as null })[1]).toBe('Tardó 1:00');
  });

  it('agrega la comparación y los descartados', () => {
    expect(encabezado(corrida({ comparacion: { nuevos: 3, yaNoAparecen: 2 } }))[2]).toBe('3 nuevos · 2 ya no aparecen');
    expect(encabezado(corrida({ descartados: 2 }))).toEqual(['18/10 14:32 · capítulo · main abcdef1', 'Tardó 0:01', '2 hallazgos descartados por citas que no existen']);
    expect(encabezado(corrida({ descartados: 1 }))[2]).toBe('1 hallazgo descartado por una cita que no existe');
    expect(encabezado(corrida({ comparacion: { nuevos: 0, yaNoAparecen: 0 }, descartados: 1 }))).toHaveLength(4);
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

describe('ubicarEnArchivo', () => {
  const conCita = (id: string, archivo: string, cita: string | null): Hallazgo =>
    ({ ...hallazgo(id, cita === null ? 'no-lo-cuenta' : 'contradiccion', archivo), informe: { archivo, linea: 1, cita } });
  const hallazgos = [conCita('1', 'a.tex', 'la API escribe'), conCita('2', 'a.tex', 'ya no está'), conCita('3', 'b.tex', 'otra'), conCita('4', 'a.tex', null)];

  it('subraya solo las citas del archivo abierto que se encuentran', () => {
    expect(ubicarEnArchivo('Acá la API\nescribe.', 'a.tex', hallazgos).citas).toEqual([{ desde: 4, hasta: 18, id: '1' }]);
  });

  it('la frase cambió solo para las citas del archivo abierto que no están', () => {
    const { ubicado } = ubicarEnArchivo('Acá la API escribe.', 'a.tex', hallazgos);
    expect(hallazgos.map(ubicado)).toEqual([true, false, true, true]);
  });

  it('sin archivo abierto no subraya nada ni marca cambios', () => {
    const { citas, ubicado } = ubicarEnArchivo('', null, hallazgos);
    expect(citas).toEqual([]);
    expect(hallazgos.every(ubicado)).toBe(true);
  });
});

describe('rutaParaCopiar', () => {
  it('con y sin línea', () => {
    expect(rutaParaCopiar({ archivo: 'backend/jobs.py', linea: 88 })).toBe('repositorio/backend/jobs.py:88');
    expect(rutaParaCopiar({ archivo: 'README.md', linea: null })).toBe('repositorio/README.md');
  });
});

describe('tiempoTranscurrido', () => {
  it('minutos y segundos con dos cifras', () => {
    expect(tiempoTranscurrido(0)).toBe('0:00');
    expect(tiempoTranscurrido(65_400)).toBe('1:05');
    expect(tiempoTranscurrido(16 * 60_000)).toBe('16:00');
  });

  it('un reloj que se adelanta no da negativo', () => {
    expect(tiempoTranscurrido(-3000)).toBe('0:00');
  });
});

describe('avisoAlTerminar', () => {
  const desde = new Date(2026, 9, 18, 15, 0).getTime();
  const enCurso = { estado: 'en-curso', alcance: 'capitulo', desde } as const;
  const libre = { estado: 'libre', error: null } as const;
  const tres = [hallazgo('1', 'contradiccion'), hallazgo('2', 'contradiccion'), hallazgo('3', 'contradiccion')];
  const nueva = corrida({ fecha: new Date(desde).toISOString(), hallazgos: tres, resueltos: ['3'] });

  it('al terminar con una corrida nueva cuenta los hallazgos visibles', () => {
    expect(avisoAlTerminar(enCurso, { estado: libre, corrida: nueva, ignorados: [{ id: '2' } as Ignorado] }))
      .toEqual({ texto: 'Verificación terminada: 1 hallazgo.', tipo: 'info' });
    expect(avisoAlTerminar(enCurso, { estado: libre, corrida: nueva, ignorados: [] }))
      .toEqual({ texto: 'Verificación terminada: 2 hallazgos.', tipo: 'info' });
    expect(avisoAlTerminar(enCurso, { estado: libre, corrida: corrida({ fecha: new Date(desde).toISOString() }), ignorados: [] })?.texto)
      .toBe('Verificación terminada: 0 hallazgos.');
  });

  it('si terminó con error, avisa el error', () => {
    const error = { motivo: 'sin-cli', mensaje: 'No se encontró Claude Code.' } as const;
    expect(avisoAlTerminar(enCurso, { estado: { estado: 'libre', error }, corrida: null, ignorados: [] }))
      .toEqual({ texto: 'No se encontró Claude Code.', tipo: 'error' });
  });

  it('cancelada: sin corrida nueva ni error, no avisa', () => {
    expect(avisoAlTerminar(enCurso, { estado: libre, corrida: corrida(), ignorados: [] })).toBeNull();
    expect(avisoAlTerminar(enCurso, { estado: libre, corrida: null, ignorados: [] })).toBeNull();
  });

  it('solo avisa al pasar de en curso a otro estado', () => {
    expect(avisoAlTerminar(libre, { estado: libre, corrida: nueva, ignorados: [] })).toBeNull();
    expect(avisoAlTerminar(null, { estado: libre, corrida: nueva, ignorados: [] })).toBeNull();
    expect(avisoAlTerminar(enCurso, { estado: enCurso, corrida: nueva, ignorados: [] })).toBeNull();
  });
});

describe('mensajesDelPanel', () => {
  const libre = { estado: 'libre', error: null } as const;
  const primera = 'Todavía no hay verificaciones. Elegí Verificación ▾ para hacer la primera.';

  it('sin corrida invita a hacer la primera', () => {
    expect(mensajesDelPanel(libre, null)).toEqual([primera]);
    expect(mensajesDelPanel(libre, corrida())).toEqual([]);
  });

  it('el error del estado va arriba', () => {
    const estado = { estado: 'libre', error: { motivo: 'limite', mensaje: 'Se cortó.' } } as const;
    expect(mensajesDelPanel(estado, corrida())).toEqual(['Se cortó.']);
    expect(mensajesDelPanel(estado, null)).toEqual(['Se cortó.', primera]);
  });

  it('deshabilitada muestra el motivo', () => {
    expect(mensajesDelPanel({ estado: 'deshabilitada', motivo: 'Falta repositorio.' }, null)).toEqual(['Falta repositorio.', primera]);
  });

  it('corrida fallida, sin repetir el aviso de respuesta ilegible', () => {
    const fallida = corrida({ estado: 'fallida', crudo: 'basura' });
    expect(mensajesDelPanel(libre, fallida)).toEqual(['La última verificación falló: la respuesta del agente no se pudo leer.']);
    const estado = { estado: 'libre', error: { motivo: 'ilegible', mensaje: 'No se pudo leer.' } } as const;
    expect(mensajesDelPanel(estado, fallida)).toEqual(['No se pudo leer.']);
  });
});
