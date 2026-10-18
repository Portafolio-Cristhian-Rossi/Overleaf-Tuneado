import type { Segmento } from '../compartido/prosa';
import type {
  ArchivoLeido, Aviso, EstadoCorrector, EstadoGit, EstadoZotero, FinDeLinea, ItemZotero, Proyecto, ResultadoAgregar, ResultadoCompilacion, ResultadoEnviar,
  ResultadoEscritura, ResultadoTerminar, ResultadoTraer,
} from '../compartido/tipos';
import type { Alcance, Corrida, EstadoVerificacion, Ignorado } from '../compartido/verificacion';

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

const INTERVALO_DE_LATIDO_MS = 30 * 1000;

// Mientras haya una ventana abierta, del editor o del PDF, el servidor sigue vivo.
export function mantenerVivoAlServidor(): void {
  const latir = () => { api.latido().catch(() => undefined); };
  latir();
  setInterval(latir, INTERVALO_DE_LATIDO_MS);
}

// Dirección desde la que el navegador carga una imagen del informe.
export const urlDeImagen = (ruta: string) => `/api/imagen?ruta=${encodeURIComponent(ruta)}`;

// Lo que respondió el servidor a una subida: 201 con `ruta`, 409 con `ruta` y `sugerido`, 400 o 413 con `mensaje`.
export interface RespuestaDeSubida { estado: number; ruta?: string; sugerido?: string; mensaje?: string }

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
  referencias: {
    agregar: (bibtex: string, alRepetir?: 'preguntar' | 'renombrar') =>
      pedir<ResultadoAgregar>('POST', '/api/referencias', { bibtex, alRepetir }),
  },
  zotero: {
    items: () => pedir<{ estado: EstadoZotero; items: ItemZotero[] }>('GET', '/api/zotero/items'),
    citar: (biblioteca: string, item: string, alRepetir?: 'preguntar' | 'renombrar') =>
      pedir<ResultadoAgregar>('POST', '/api/zotero/citar', { biblioteca, item, alRepetir }),
  },
  imagenes: {
    listar: () => pedir<{ ruta: string; bytes: number }[]>('GET', '/api/imagenes'),
    // No lanza por un rechazo del servidor: quien llama decide qué hacer con cada estado.
    async subir(nombre: string, archivo: Blob): Promise<RespuestaDeSubida> {
      const respuesta = await fetch(`/api/imagenes?nombre=${encodeURIComponent(nombre)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: archivo,
      });
      const cuerpo = await respuesta.json().catch(() => ({}));
      return { ...cuerpo, estado: respuesta.status };
    },
  },
  ia: {
    guia: async () => (await pedir<{ texto: string }>('GET', '/api/ia/guia')).texto,
    guardarGuia: (texto: string) => pedir<void>('PUT', '/api/ia/guia', { texto }),
  },
  verificacion: {
    leer: () => pedir<{ estado: EstadoVerificacion; corrida: Corrida | null; ignorados: Ignorado[] }>('GET', '/api/verificacion'),
    // El servidor responde 202 al aceptar la corrida; 409 y 400 llegan como ErrorDeApi con su mensaje.
    iniciar: (alcance: Alcance, ruta: string | null) =>
      pedir<unknown>('POST', '/api/verificacion', { alcance, ...(ruta === null ? {} : { ruta }) }).then(() => undefined),
    cancelar: () => pedir<void>('POST', '/api/verificacion/cancelar'),
    resuelto: (id: string) => pedir<void>('POST', '/api/verificacion/resuelto', { id }),
    ignorar: (id: string) => pedir<void>('POST', '/api/verificacion/ignorar', { id }),
    recuperar: (id: string) => pedir<void>('POST', '/api/verificacion/recuperar', { id }),
  },
  correccion: {
    estado: () => pedir<EstadoCorrector>('GET', '/api/correccion/estado'),
    revisar: (parrafos: Segmento[][]) => pedir<(Aviso[] | null)[]>('POST', '/api/correccion/revisar', { parrafos }),
    diccionario: () => pedir<{ palabras: string[]; excepciones: string[] }>('GET', '/api/correccion/diccionario'),
    agregarPalabra: (palabra: string) => pedir<void>('POST', '/api/correccion/palabra', { palabra }),
    agregarExcepcion: (palabra: string) => pedir<void>('POST', '/api/correccion/excepcion', { palabra }),
  },
};
