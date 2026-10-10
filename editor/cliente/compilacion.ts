import type { ResultadoCompilacion } from '../compartido/tipos';

// Compilar con el PDF en otra ventana. Las ventanas del editor y la del PDF se avisan entre sí
// para mostrar lo mismo. No conoce el DOM ni el canal real: se prueba acá quién compila y cuándo.

export type MensajeDePdf =
  | { tipo: 'hola' }                                        // una ventana recién abierta pide lo último
  | { tipo: 'pedir' }                                       // la ventana del PDF pide una compilación
  | { tipo: 'compilando' }
  | { tipo: 'resultado'; resultado: ResultadoCompilacion }
  | { tipo: 'fallo'; mensaje: string }
  | { tipo: 'ir-a'; ruta: string; linea: number };          // clic en un problema, fuera del editor

// Lo que se envía llega a las otras ventanas, nunca a la que lo envió.
export interface Canal { enviar(m: MensajeDePdf): void; alRecibir(f: (m: MensajeDePdf) => void): void }

export interface PantallaDeCompilacion {
  ocupada(si: boolean): void;
  mostrar(r: ResultadoCompilacion): void;
  fallar(mensaje: string): void;
}

export interface Compilacion {
  // `guardar: false` cuando la compilación es consecuencia de un guardado.
  compilar(o?: { guardar?: boolean }): Promise<void>;
  // La ventana se cierra: si estaba compilando, las otras no deben quedarse esperando.
  soltar(): void;
}

export function abrirCanal(): Canal {
  const canal = new BroadcastChannel('editor-informe:pdf');
  return {
    enviar: (m) => canal.postMessage(m),
    alRecibir: (f) => canal.addEventListener('message', (e) => f(e.data as MensajeDePdf)),
  };
}

export function crearCompilacion(o: {
  canal: Canal;
  pantalla: PantallaDeCompilacion;
  compilar(): Promise<ResultadoCompilacion>;
  // Solo lo tiene la ventana del editor: guarda lo pendiente. Es la única que atiende los pedidos
  // de las demás, porque es la que sabe qué falta guardar.
  guardar?: () => Promise<void>;
  esperaMs?: number;
}): Compilacion {
  const espera = o.esperaMs ?? 600;
  // 'pidiendo': se le pidió al editor y todavía no contestó. 'alla': compila otra ventana.
  let estado: 'libre' | 'pidiendo' | 'aca' | 'alla' = 'libre';
  let ultimo: ResultadoCompilacion | null = null;
  let reloj: ReturnType<typeof setTimeout> | undefined;

  function liberar(): void {
    clearTimeout(reloj);
    estado = 'libre';
    o.pantalla.ocupada(false);
  }

  async function compilarAca(guardar: boolean): Promise<void> {
    estado = 'aca';
    o.pantalla.ocupada(true);
    o.canal.enviar({ tipo: 'compilando' });
    try {
      if (guardar) await o.guardar?.();
      const resultado = await o.compilar();
      ultimo = resultado;
      o.pantalla.mostrar(resultado);
      o.canal.enviar({ tipo: 'resultado', resultado });
    } catch (e) {
      const mensaje = (e as Error).message;
      o.pantalla.fallar(mensaje);
      o.canal.enviar({ tipo: 'fallo', mensaje });
    } finally {
      liberar();
    }
  }

  async function compilar(opciones: { guardar?: boolean } = {}): Promise<void> {
    if (estado !== 'libre') return;
    if (o.guardar) return compilarAca(opciones.guardar !== false);
    estado = 'pidiendo';
    o.pantalla.ocupada(true);
    // Si nadie contesta no hay editor abierto: no queda nada sin guardar, se compila desde acá.
    reloj = setTimeout(() => { void compilarAca(false); }, espera);
    o.canal.enviar({ tipo: 'pedir' });
  }

  o.canal.alRecibir((m) => {
    if (m.tipo === 'hola') {
      if (ultimo) o.canal.enviar({ tipo: 'resultado', resultado: ultimo });
      if (estado === 'aca') o.canal.enviar({ tipo: 'compilando' });
    } else if (m.tipo === 'pedir') {
      if (!o.guardar) return;
      if (estado === 'aca') o.canal.enviar({ tipo: 'compilando' });
      else void compilar();
    } else if (estado === 'aca') {
      // Lo que compila esta ventana es lo que vale acá.
    } else if (m.tipo === 'compilando') {
      clearTimeout(reloj);
      estado = 'alla';
      o.pantalla.ocupada(true);
    } else if (m.tipo === 'resultado') {
      ultimo = m.resultado;
      o.pantalla.mostrar(m.resultado);
      liberar();
    } else if (m.tipo === 'fallo') {
      o.pantalla.fallar(m.mensaje);
      liberar();
    }
  });

  return {
    compilar,
    soltar() {
      if (estado === 'aca') o.canal.enviar({ tipo: 'fallo', mensaje: 'La ventana que estaba compilando se cerró. Probá de nuevo.' });
    },
  };
}
