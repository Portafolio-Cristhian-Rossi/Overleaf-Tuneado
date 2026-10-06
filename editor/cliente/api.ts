import type { Segmento } from '../compartido/prosa';
import type {
  ArchivoLeido, Aviso, EstadoCorrector, EstadoGit, FinDeLinea, Proyecto, ResultadoCompilacion, ResultadoEnviar,
  ResultadoEscritura, ResultadoTerminar, ResultadoTraer,
} from '../compartido/tipos';

export class ErrorDeApi extends Error {
  constructor(mensaje: string, readonly estado: number) { super(mensaje); }
}

// keepalive permite que el pedido termine aunque se cierre la pestaña, pero el navegador
// lo limita a 64 KiB: por encima de eso se envía como un pedido común.
const LIMITE_KEEPALIVE = 60000;

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown, opciones: { aceptar?: number[]; urgente?: boolean } = {}): Promise<T> {
  const texto = cuerpo === undefined ? undefined : JSON.stringify(cuerpo);
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers: texto === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: texto,
      keepalive: opciones.urgente === true && (texto?.length ?? 0) < LIMITE_KEEPALIVE,
    });
  } catch {
    throw new ErrorDeApi('No se pudo conectar con el editor. Puede haberse cerrado: volvé a abrirlo desde el acceso directo.', 0);
  }
  if (!respuesta.ok && !opciones.aceptar?.includes(respuesta.status)) {
    const detalle = await respuesta.json().catch(() => null);
    throw new ErrorDeApi(detalle?.mensaje ?? `El editor respondió con un error (${respuesta.status}).`, respuesta.status);
  }
  return respuesta.json();
}

export interface DatosDeEscritura {
  contenido: string; finDeLinea: FinDeLinea; bom: boolean; versionBase: string; forzar?: boolean;
}

export const api = {
  config: () => pedir<{ compilarAlGuardar: boolean; principal: string; problema: string | null }>('GET', '/api/config'),
  proyecto: () => pedir<Proyecto>('GET', '/api/proyecto'),
  leer: (ruta: string) => pedir<ArchivoLeido>('GET', `/api/archivo?ruta=${encodeURIComponent(ruta)}`),
  escribir: (ruta: string, datos: DatosDeEscritura, urgente = false) =>
    pedir<ResultadoEscritura>('PUT', '/api/archivo', { ruta, ...datos }, { aceptar: [409, 410], urgente }),
  estadoGit: () => pedir<EstadoGit>('GET', '/api/git/estado'),
  traer: () => pedir<ResultadoTraer>('POST', '/api/git/traer'),
  enviar: () => pedir<ResultadoEnviar>('POST', '/api/git/enviar'),
  terminar: () => pedir<ResultadoTerminar>('POST', '/api/git/terminar'),
  cancelar: () => pedir<void>('POST', '/api/git/cancelar'),
  abrirVsCode: () => pedir<void>('POST', '/api/git/abrir-vscode'),
  compilar: () => pedir<ResultadoCompilacion>('POST', '/api/compilar'),
  latido: () => pedir<void>('POST', '/api/latido'),
  correccion: {
    estado: () => pedir<EstadoCorrector>('GET', '/api/correccion/estado'),
    revisar: (parrafos: Segmento[][]) => pedir<(Aviso[] | null)[]>('POST', '/api/correccion/revisar', { parrafos }),
    diccionario: () => pedir<{ palabras: string[]; excepciones: string[] }>('GET', '/api/correccion/diccionario'),
    agregarPalabra: (palabra: string) => pedir<void>('POST', '/api/correccion/palabra', { palabra }),
    agregarExcepcion: (palabra: string) => pedir<void>('POST', '/api/correccion/excepcion', { palabra }),
  },
};
