import { describe, expect, it } from 'vitest';
import type { Corrida, EstadoVerificacion, Hallazgo, Ignorado, TipoDeHallazgo } from '../compartido/verificacion';
import {
  agrupar, avisoAlTerminar, encabezado, hallazgosVisibles, ignoradosDe, mensajesDelPanel, NOMBRE_DE_TIPO, opcionesDeVerificacion, rutaParaCopiar,
  tiempoTranscurrido, ubicarCita, ubicarEnArchivo,
} from './verificacion';

function hallazgo(id: string, tipo: TipoDeHallazgo, archivo = 'a.tex'): Hallazgo {
  const conRepo = tipo === 'contradiccion' || tipo === 'no-lo-cuenta';
  return { id, tipo, informe: { archivo, linea: 1, cita: 'x' }, repo: conRepo ? { archivo: 'r.py', linea: 1 } : null, explicacion: 'e' };
}

function corrida(extra: Partial<Corrida> = {}): Corrida {
  return {
    fecha: new Date(2026, 9, 18, 14, 32).toISOString(), contra: 'codigo', alcance: 'capitulo', archivos: ['a.tex'], rama: 'main', commit: 'abcdef1234',
    duracionMs: 1000, costoUsd: null, estado: 'ok', crudo: null, descartados: 0, hallazgos: [], resueltos: [], comparacion: null, ...extra,
  };
}

const LIBRE = { estado: 'libre', motivos: { codigo: null, informe: null }, errores: { codigo: null, informe: null } } as const;

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
  it('en Código agrupa en orden contradicción, sin respaldo, no lo cuenta, y por archivo', () => {
    const grupos = agrupar([
      hallazgo('1', 'no-lo-cuenta', 'b.tex'),
      hallazgo('2', 'sin-respaldo', 'a.tex'),
      hallazgo('3', 'contradiccion', 'b.tex'),
      hallazgo('4', 'contradiccion', 'a.tex'),
      hallazgo('5', 'contradiccion', 'b.tex'),
    ], 'codigo');
    expect(grupos.map((g) => g.tipo)).toEqual(['contradiccion', 'sin-respaldo', 'no-lo-cuenta']);
    expect(grupos[0].archivos.map((a) => [a.archivo, a.hallazgos.map((h) => h.id)])).toEqual([['b.tex', ['3', '5']], ['a.tex', ['4']]]);
  });

  it('en Informe agrupa en orden se contradice, definición distinta, corta el hilo, sin definir, sugerencia', () => {
    const grupos = agrupar([
      hallazgo('1', 'sugerencia'), hallazgo('2', 'sin-definir'), hallazgo('3', 'corta-el-hilo'),
      hallazgo('4', 'definicion-distinta'), hallazgo('5', 'se-contradice'),
    ], 'informe');
    expect(grupos.map((g) => g.tipo)).toEqual(['se-contradice', 'definicion-distinta', 'corta-el-hilo', 'sin-definir', 'sugerencia']);
  });

  it('en Código no muestra sugerencias ni tipos de Informe', () => {
    expect(agrupar([hallazgo('1', 'sugerencia'), hallazgo('2', 'se-contradice')], 'codigo')).toEqual([]);
  });

  it('omite los tipos sin hallazgos', () => {
    expect(agrupar([], 'informe')).toEqual([]);
  });
});

describe('ignoradosDe', () => {
  it('separa los ignorados por pestaña; las sugerencias van con Informe', () => {
    const ignorado = (id: string, tipo: TipoDeHallazgo) => ({ id, tipo }) as Ignorado;
    const lista = [ignorado('1', 'contradiccion'), ignorado('2', 'sugerencia'), ignorado('3', 'corta-el-hilo'), ignorado('4', 'sin-respaldo')];
    expect(ignoradosDe(lista, 'codigo').map((i) => i.id)).toEqual(['1', '4']);
    expect(ignoradosDe(lista, 'informe').map((i) => i.id)).toEqual(['2', '3']);
  });
});

describe('NOMBRE_DE_TIPO', () => {
  it('usa los textos del panel', () => {
    expect(NOMBRE_DE_TIPO).toEqual({
      contradiccion: 'Contradicción', 'no-lo-cuenta': 'El informe no lo cuenta', 'sin-respaldo': 'Sin respaldo en el código', sugerencia: 'Sugerencia',
      'se-contradice': 'Se contradice', 'definicion-distinta': 'Definición distinta', 'corta-el-hilo': 'Corta el hilo', 'sin-definir': 'Sin definir',
    });
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

  it('una corrida de sugerencias dice de quién son, sin rama ni duración', () => {
    expect(encabezado(corrida({ contra: 'informe', autor: 'Claude', rama: '', commit: 'sugerencias', duracionMs: 0 }))).toEqual(['18/10 14:32 · sugerencias de Claude']);
    expect(encabezado(corrida({ contra: 'informe', autor: 'Claude', descartados: 1 }))).toEqual(['18/10 14:32 · sugerencias de Claude', '1 hallazgo descartado por una cita que no existe']);
  });

  it('una corrida contra el informe dice el alcance y "contra el informe", sin rama', () => {
    const informe = corrida({ contra: 'informe', rama: null, commit: null, fecha: new Date(2026, 9, 27, 10, 5).toISOString(), duracionMs: 65_000, costoUsd: 0.4 });
    expect(encabezado(informe)).toEqual(['27/10 10:05 · capítulo · contra el informe', 'Tardó 1:05 · costó US$ 0,40']);
    expect(encabezado({ ...informe, alcance: 'todo' })[0]).toBe('27/10 10:05 · todo el informe · contra el informe');
  });
});

describe('opcionesDeVerificacion', () => {
  it('libre con un capítulo abierto habilita las dos', () => {
    expect(opcionesDeVerificacion(LIBRE, 'informe', 'a.tex', true)).toEqual([
      { alcance: 'capitulo', texto: 'Verificar capítulo', habilitada: true },
      { alcance: 'todo', texto: 'Verificar todo', habilitada: true },
    ]);
  });

  it('con otro archivo abierto, el capítulo queda deshabilitado', () => {
    const [capitulo, todo] = opcionesDeVerificacion(LIBRE, 'codigo', 'refs.bib', false);
    expect(capitulo).toMatchObject({ habilitada: false, ayuda: 'Abrí un capítulo para verificarlo.' });
    expect(todo.habilitada).toBe(true);
  });

  it('en curso deshabilita los dos botones con "Ya hay una verificación en curso."', () => {
    const enCurso = { ...LIBRE, estado: 'en-curso', contra: 'codigo', alcance: 'todo', desde: 0 } as const;
    for (const contra of ['codigo', 'informe'] as const) {
      expect(opcionesDeVerificacion(enCurso, contra, 'a.tex', true).map((o) => [o.habilitada, o.ayuda]))
        .toEqual([[false, 'Ya hay una verificación en curso.'], [false, 'Ya hay una verificación en curso.']]);
    }
  });

  it('con motivo de Código, Código queda deshabilitada y Informe libre', () => {
    const estado = { ...LIBRE, motivos: { codigo: 'No hay repositorio.', informe: null } };
    expect(opcionesDeVerificacion(estado, 'codigo', 'a.tex', true).map((o) => [o.habilitada, o.ayuda]))
      .toEqual([[false, 'No hay repositorio.'], [false, 'No hay repositorio.']]);
    expect(opcionesDeVerificacion(estado, 'informe', 'a.tex', true).every((o) => o.habilitada)).toBe(true);
  });
});

describe('ubicarEnArchivo', () => {
  const conCita = (id: string, archivo: string, cita: string | null): Hallazgo =>
    ({ ...hallazgo(id, cita === null ? 'no-lo-cuenta' : 'contradiccion', archivo), informe: { archivo, linea: 1, cita } });
  const hallazgos = [conCita('1', 'a.tex', 'la API escribe'), conCita('2', 'a.tex', 'ya no está'), conCita('3', 'b.tex', 'otra'), conCita('4', 'a.tex', null)];

  it('subraya solo las citas del archivo abierto que se encuentran', () => {
    expect(ubicarEnArchivo('Acá la API\nescribe.', 'a.tex', hallazgos).citas).toEqual([{ desde: 4, hasta: 18, id: '1', lado: 'informe' }]);
  });

  it('la frase cambió solo para las citas del archivo abierto que no están', () => {
    const { ubicado } = ubicarEnArchivo('Acá la API escribe.', 'a.tex', hallazgos);
    expect(hallazgos.map((h) => ubicado(h))).toEqual([true, false, true, true]);
  });

  it('sin archivo abierto no subraya nada ni marca cambios', () => {
    const { citas, ubicado } = ubicarEnArchivo('', null, hallazgos);
    expect(citas).toEqual([]);
    expect(hallazgos.every((h) => ubicado(h))).toBe(true);
  });

  const conReferencia: Hallazgo = {
    id: 'r', tipo: 'definicion-distinta', repo: null, explicacion: 'e',
    informe: { archivo: 'Cap3.tex', linea: 1, cita: 'el uso' },
    referencia: { archivo: 'Glosario.tex', linea: 1, cita: 'la definición' },
  };

  it('subraya la referencia cuando su archivo es el abierto', () => {
    expect(ubicarEnArchivo('Acá la definición.', 'Glosario.tex', [conReferencia]).citas)
      .toEqual([{ desde: 4, hasta: 17, id: 'r', lado: 'referencia' }]);
    expect(ubicarEnArchivo('Acá el uso.', 'Cap3.tex', [conReferencia]).citas).toEqual([{ desde: 4, hasta: 10, id: 'r', lado: 'informe' }]);
  });

  it('la frase cambió es por lado', () => {
    const { ubicado } = ubicarEnArchivo('Otra cosa.', 'Glosario.tex', [conReferencia]);
    expect(ubicado(conReferencia, 'referencia')).toBe(false);
    expect(ubicado(conReferencia)).toBe(true);
    expect(ubicado(conReferencia, 'informe')).toBe(true);
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
  const enCurso = { ...LIBRE, estado: 'en-curso', contra: 'codigo', alcance: 'capitulo', desde } as const;
  const tres = [hallazgo('1', 'contradiccion'), hallazgo('2', 'contradiccion'), hallazgo('3', 'contradiccion')];
  const nueva = corrida({ fecha: new Date(desde).toISOString(), hallazgos: tres, resueltos: ['3'] });
  const datos = (estado: EstadoVerificacion, codigo: Corrida | null, ignorados: Ignorado[] = [], informe: Corrida | null = null) =>
    ({ estado, corridas: { codigo, informe }, ignorados });

  it('al terminar con una corrida nueva cuenta los hallazgos visibles', () => {
    expect(avisoAlTerminar(enCurso, datos(LIBRE, nueva, [{ id: '2' } as Ignorado])))
      .toEqual({ texto: 'Verificación terminada: 1 hallazgo.', tipo: 'info' });
    expect(avisoAlTerminar(enCurso, datos(LIBRE, nueva)))
      .toEqual({ texto: 'Verificación terminada: 2 hallazgos.', tipo: 'info' });
    expect(avisoAlTerminar(enCurso, datos(LIBRE, corrida({ fecha: new Date(desde).toISOString() })))?.texto)
      .toBe('Verificación terminada: 0 hallazgos.');
  });

  it('avisa con la corrida del tipo que estaba en curso', () => {
    const enCursoInforme = { ...enCurso, contra: 'informe' } as const;
    const deInforme = corrida({ contra: 'informe', fecha: new Date(desde).toISOString(), hallazgos: [hallazgo('i', 'sin-definir')] });
    expect(avisoAlTerminar(enCursoInforme, datos(LIBRE, nueva, [], deInforme))?.texto).toBe('Verificación terminada: 1 hallazgo.');
    expect(avisoAlTerminar(enCursoInforme, datos(LIBRE, nueva, [], null))).toBeNull();
  });

  it('si terminó con error, avisa el error', () => {
    const error = { contra: 'codigo', motivo: 'sin-cli', mensaje: 'No se encontró Claude Code.' } as const;
    expect(avisoAlTerminar(enCurso, datos({ ...LIBRE, errores: { codigo: error, informe: null } }, null)))
      .toEqual({ texto: 'No se encontró Claude Code.', tipo: 'error' });
  });

  it('cancelada: sin corrida nueva ni error, no avisa', () => {
    expect(avisoAlTerminar(enCurso, datos(LIBRE, corrida()))).toBeNull();
    expect(avisoAlTerminar(enCurso, datos(LIBRE, null))).toBeNull();
  });

  it('solo avisa al pasar de en curso a otro estado', () => {
    expect(avisoAlTerminar(LIBRE, datos(LIBRE, nueva))).toBeNull();
    expect(avisoAlTerminar(null, datos(LIBRE, nueva))).toBeNull();
    expect(avisoAlTerminar(enCurso, datos(enCurso, nueva))).toBeNull();
  });
});

describe('mensajesDelPanel', () => {
  const primeraCodigo = 'Todavía no hay verificaciones contra el código. Elegí Contra código ▾ para hacer la primera.';
  const primeraInforme = 'Todavía no hay verificaciones contra el informe. Elegí Contra informe ▾ para hacer la primera.';

  it('sin corrida, cada pestaña dice su botón', () => {
    expect(mensajesDelPanel(LIBRE, 'codigo', null)).toEqual([primeraCodigo]);
    expect(mensajesDelPanel(LIBRE, 'informe', null)).toEqual([primeraInforme]);
    expect(mensajesDelPanel(LIBRE, 'codigo', corrida())).toEqual([]);
  });

  it('el error del estado va arriba', () => {
    const estado = { ...LIBRE, errores: { ...LIBRE.errores, codigo: { contra: 'codigo', motivo: 'limite', mensaje: 'Se cortó.' } } } as const;
    expect(mensajesDelPanel(estado, 'codigo', corrida())).toEqual(['Se cortó.']);
    expect(mensajesDelPanel(estado, 'codigo', null)).toEqual(['Se cortó.', primeraCodigo]);
  });

  it('el error se muestra solo en la pestaña de su tipo', () => {
    const estado = { ...LIBRE, errores: { ...LIBRE.errores, informe: { contra: 'informe', motivo: 'limite', mensaje: 'Se cortó.' } } } as const;
    expect(mensajesDelPanel(estado, 'informe', corrida({ contra: 'informe' }))).toEqual(['Se cortó.']);
    expect(mensajesDelPanel(estado, 'codigo', corrida())).toEqual([]);
  });

  it('mientras corre Informe, Código sigue mostrando su motivo y su error', () => {
    const estado = {
      estado: 'en-curso', contra: 'informe', alcance: 'capitulo', desde: 0,
      motivos: { codigo: 'Falta repositorio.', informe: null },
      errores: { codigo: { contra: 'codigo', motivo: 'limite', mensaje: 'Se cortó.' }, informe: null },
    } as const;
    expect(mensajesDelPanel(estado, 'codigo', corrida())).toEqual(['Falta repositorio.', 'Se cortó.']);
    expect(mensajesDelPanel(estado, 'informe', corrida({ contra: 'informe' }))).toEqual([]);
  });

  it('un error de Informe al terminar avisa aunque Código tenga uno viejo', () => {
    const viejo = { contra: 'codigo', motivo: 'limite', mensaje: 'Error viejo de Código.' } as const;
    const nuevo = { contra: 'informe', motivo: 'sin-cli', mensaje: 'No se encontró Claude Code.' } as const;
    const enCursoInforme = { ...LIBRE, errores: { codigo: viejo, informe: null }, estado: 'en-curso', contra: 'informe', alcance: 'todo', desde: 0 } as const;
    const despues = { ...LIBRE, errores: { codigo: viejo, informe: nuevo } };
    expect(avisoAlTerminar(enCursoInforme, { estado: despues, corridas: { codigo: null, informe: null }, ignorados: [] }))
      .toEqual({ texto: 'No se encontró Claude Code.', tipo: 'error' });
    expect(avisoAlTerminar(enCursoInforme, { estado: { ...LIBRE, errores: { codigo: viejo, informe: null } }, corridas: { codigo: null, informe: null }, ignorados: [] }))
      .toBeNull();
  });

  it('el motivo de Código se muestra solo en Código', () => {
    const estado = { ...LIBRE, motivos: { codigo: 'Falta repositorio.', informe: null } };
    expect(mensajesDelPanel(estado, 'codigo', null)).toEqual(['Falta repositorio.', primeraCodigo]);
    expect(mensajesDelPanel(estado, 'informe', null)).toEqual([primeraInforme]);
  });

  it('corrida fallida, sin repetir el aviso de respuesta ilegible', () => {
    const fallida = corrida({ estado: 'fallida', crudo: 'basura' });
    expect(mensajesDelPanel(LIBRE, 'codigo', fallida)).toEqual(['La última verificación falló: la respuesta del agente no se pudo leer.']);
    const estado = { ...LIBRE, errores: { ...LIBRE.errores, codigo: { contra: 'codigo', motivo: 'ilegible', mensaje: 'No se pudo leer.' } } } as const;
    expect(mensajesDelPanel(estado, 'codigo', fallida)).toEqual(['No se pudo leer.']);
  });
});
