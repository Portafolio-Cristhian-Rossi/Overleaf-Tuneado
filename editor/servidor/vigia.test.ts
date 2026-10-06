import { describe, expect, it, vi } from 'vitest';
import { crearVigia } from './vigia';

describe('crearVigia', () => {
  it('no vence antes del límite y vence una sola vez después', () => {
    let t = 0;
    const alVencer = vi.fn();
    const v = crearVigia({ limiteMs: 600000, ahora: () => t, alVencer });
    t = 600000; v.revisar();
    expect(alVencer).not.toHaveBeenCalled();
    t = 600001; v.revisar(); v.revisar();
    expect(alVencer).toHaveBeenCalledTimes(1);
  });

  it('un latido reinicia la cuenta', () => {
    let t = 0;
    const alVencer = vi.fn();
    const v = crearVigia({ limiteMs: 600000, ahora: () => t, alVencer });
    t = 500000; v.latido();
    t = 1000000; v.revisar();
    expect(alVencer).not.toHaveBeenCalled();
    t = 1100001; v.revisar();
    expect(alVencer).toHaveBeenCalledTimes(1);
  });

  it('cuenta desde su creación aunque nunca haya latidos', () => {
    let t = 1000;
    const alVencer = vi.fn();
    const v = crearVigia({ limiteMs: 50, ahora: () => t, alVencer });
    t = 1050; v.revisar();
    expect(alVencer).not.toHaveBeenCalled();
    t = 1051; v.revisar();
    expect(alVencer).toHaveBeenCalledTimes(1);
  });
});

// Al suspender la máquina no corren ni los latidos ni las revisiones: al despertar, el tiempo
// "pasó" de golpe. Eso no significa que se hayan cerrado las pestañas.
describe('suspensión del equipo', () => {
  it('un salto grande entre revisiones se toma como despertar y reinicia la cuenta', () => {
    let t = 0;
    const alVencer = vi.fn();
    const v = crearVigia({ limiteMs: 600000, saltoDeSuspensionMs: 120000, ahora: () => t, alVencer });
    t = 30000; v.revisar();
    t = 30000 + 8 * 3600 * 1000; v.revisar();          // ocho horas suspendida
    expect(alVencer).not.toHaveBeenCalled();
    t += 30000; v.latido();                             // la pestaña sigue ahí y vuelve a latir
    t += 600000; v.revisar();
    expect(alVencer).not.toHaveBeenCalled();
  });

  it('si tras despertar no llega ningún latido, igual vence al cumplirse el límite', () => {
    let t = 0;
    const alVencer = vi.fn();
    const v = crearVigia({ limiteMs: 600000, saltoDeSuspensionMs: 120000, ahora: () => t, alVencer });
    t = 8 * 3600 * 1000; v.revisar();
    for (let i = 0; i < 21; i++) { t += 30000; v.revisar(); }
    expect(alVencer).toHaveBeenCalledTimes(1);
  });
});
