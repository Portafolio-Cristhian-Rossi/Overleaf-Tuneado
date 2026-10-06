export interface Vigia { latido(): void; revisar(): void }

// Avisa una sola vez cuando pasa demasiado tiempo sin latidos del navegador.
export function crearVigia(o: { limiteMs: number; ahora: () => number; alVencer: () => void }): Vigia {
  let ultimoLatido = o.ahora();
  let vencida = false;
  return {
    latido() { ultimoLatido = o.ahora(); },
    revisar() {
      if (vencida || o.ahora() - ultimoLatido <= o.limiteMs) return;
      vencida = true;
      o.alVencer();
    },
  };
}
