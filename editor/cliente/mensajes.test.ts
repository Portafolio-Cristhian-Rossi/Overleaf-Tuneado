import { describe, expect, it } from 'vitest';
import { avisoDeCompilacion, avisoDeEnviar, avisoDeTraer, estadoDeCompilacion, ubicacionDe } from './mensajes';

describe('avisoDeTraer', () => {
  it.each([
    [[], 'Ya estabas al día'],
    [['Cap4.tex'], 'Se actualizó 1 archivo'],
    [['Cap4.tex', 'main.tex', 'Cap1.tex'], 'Se actualizaron 3 archivos'],
  ])('%j → %s', (archivosCambiados, texto) => {
    expect(avisoDeTraer({ tipo: 'ok', archivosCambiados })).toEqual({ texto, tipo: 'info' });
  });

  it('el conflicto no genera aviso: lo muestra el bloqueo', () => {
    expect(avisoDeTraer({ tipo: 'conflicto', archivos: ['Cap4.tex'] })).toBeNull();
  });

  it('errores de red', () => {
    expect(avisoDeTraer({ tipo: 'error', motivo: 'autenticacion', mensaje: 'fatal: 403' })).toEqual({
      tipo: 'error',
      texto: 'Git no pudo autenticarse con Overleaf. Abrí una terminal en la carpeta informe, ejecutá git pull e ingresá el token.',
    });
    expect(avisoDeTraer({ tipo: 'error', motivo: 'sin-conexion', mensaje: 'x' })).toEqual({
      tipo: 'error',
      texto: 'No hay conexión con Overleaf. Tus cambios están guardados en esta máquina.',
    });
    // Una falla de Git en esta máquina no es un rechazo de Overleaf: no hay que echarle la culpa.
    expect(avisoDeTraer({ tipo: 'error', motivo: 'local', mensaje: 'fatal: empty ident name' })).toEqual({
      tipo: 'error',
      texto: 'Git no pudo completar la operación en tu máquina:\nfatal: empty ident name',
    });
    expect(avisoDeEnviar({ tipo: 'error', motivo: 'local', mensaje: 'x' })?.texto).not.toMatch(/Overleaf/);
    expect(avisoDeTraer({ tipo: 'error', motivo: 'otro', mensaje: 'fatal: algo raro' })).toEqual({
      tipo: 'error',
      texto: 'Overleaf rechazó la operación:\nfatal: algo raro',
    });
  });
});

describe('avisoDeEnviar', () => {
  it('enviado y sin nada para enviar', () => {
    expect(avisoDeEnviar({ tipo: 'ok', enviado: true })).toEqual({ texto: 'Cambios enviados a Overleaf', tipo: 'info' });
    expect(avisoDeEnviar({ tipo: 'ok', enviado: false })).toEqual({ texto: 'No había cambios para enviar', tipo: 'info' });
  });

  it('rechazo de Overleaf con su mensaje original', () => {
    expect(avisoDeEnviar({ tipo: 'rechazado', mensaje: 'remote: invalid files' })).toEqual({
      tipo: 'error', texto: 'Overleaf rechazó la operación:\nremote: invalid files',
    });
  });

  it('conflicto y errores de red como en traer', () => {
    expect(avisoDeEnviar({ tipo: 'conflicto', archivos: ['a.tex'] })).toBeNull();
    expect(avisoDeEnviar({ tipo: 'error', motivo: 'sin-conexion', mensaje: 'x' })?.texto)
      .toBe('No hay conexión con Overleaf. Tus cambios están guardados en esta máquina.');
  });
});

describe('avisoDeCompilacion', () => {
  it('sin LaTeX y tiempo vencido', () => {
    expect(avisoDeCompilacion({ tipo: 'sin-latex' }))
      .toBe('Para ver el PDF hace falta instalar MiKTeX. Los pasos están en INSTALACION.md.');
    expect(avisoDeCompilacion({ tipo: 'vencido' }))
      .toBe('La compilación tardó demasiado y se canceló. Si es la primera vez, MiKTeX puede estar descargando paquetes: probá de nuevo.');
  });

  it('una compilación que terminó no lleva aviso', () => {
    expect(avisoDeCompilacion({ tipo: 'ok', problemas: [], pdfActualizado: true })).toBeNull();
    expect(avisoDeCompilacion({ tipo: 'con-errores', problemas: [], pdfActualizado: false })).toBeNull();
  });
});

describe('estadoDeCompilacion', () => {
  const problema = (gravedad: 'error' | 'advertencia') => ({ gravedad, ruta: null, linea: null, mensaje: 'm', original: 'o' });

  it('sin errores', () => {
    expect(estadoDeCompilacion({ tipo: 'ok', problemas: [], pdfActualizado: true })).toBe('PDF actualizado');
    expect(estadoDeCompilacion({ tipo: 'ok', problemas: [problema('advertencia')], pdfActualizado: true })).toBe('PDF actualizado, con 1 aviso');
    expect(estadoDeCompilacion({ tipo: 'ok', problemas: [problema('advertencia'), problema('advertencia')], pdfActualizado: true }))
      .toBe('PDF actualizado, con 2 avisos');
  });

  // pdflatex suele generar un PDF aunque haya errores: sale, pero con partes mal o faltantes.
  it('con errores distingue si el PDF se generó igual o si quedó el anterior', () => {
    expect(estadoDeCompilacion({ tipo: 'con-errores', problemas: [problema('error')], pdfActualizado: true }))
      .toBe('Hay 1 error: el PDF se generó igual, pero puede estar incompleto');
    expect(estadoDeCompilacion({ tipo: 'con-errores', problemas: [problema('error'), problema('error'), problema('advertencia')], pdfActualizado: false }))
      .toBe('Hay 2 errores: se muestra el último PDF que se pudo generar');
  });
});

describe('ubicacionDe', () => {
  const base = { gravedad: 'error' as const, mensaje: 'm', original: 'o' };
  it('archivo y línea, solo línea, o nada', () => {
    expect(ubicacionDe({ ...base, ruta: 'Cap2.tex', linea: 12 })).toBe('Cap2.tex, línea 12');
    expect(ubicacionDe({ ...base, ruta: 'Cap2.tex', linea: null })).toBe('Cap2.tex');
    expect(ubicacionDe({ ...base, ruta: null, linea: 8 })).toBe('línea 8');
    expect(ubicacionDe({ ...base, ruta: null, linea: null })).toBe('');
  });
});
