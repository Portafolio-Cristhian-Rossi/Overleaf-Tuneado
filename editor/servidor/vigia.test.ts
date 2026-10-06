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
