export interface Vigia { latido(): void; revisar(): void }

// Avisa una sola vez cuando pasa demasiado tiempo sin latidos del navegador.
//
// `saltoDeSuspensionMs`: si entre dos revisiones pasa más que esto, la máquina estuvo
// suspendida (o el proceso congelado). Ese tiempo no cuenta como pestañas cerradas: la cuenta
// se reinicia y el navegador tiene el límite completo para volver a latir.
export function crearVigia(o: {
  limiteMs: number; ahora: () => number; alVencer: () => void; saltoDeSuspensionMs?: number;
}): Vigia {
  let ultimoLatido = o.ahora();
  let ultimaRevision = o.ahora();
  let vencida = false;
  return {
    latido() { ultimoLatido = o.ahora(); },
    revisar() {
      const ahora = o.ahora();
      const desperto = o.saltoDeSuspensionMs !== undefined && ahora - ultimaRevision > o.saltoDeSuspensionMs;
      ultimaRevision = ahora;
      if (desperto) ultimoLatido = ahora;
      if (vencida || ahora - ultimoLatido <= o.limiteMs) return;
      vencida = true;
      o.alVencer();
    },
  };
}
