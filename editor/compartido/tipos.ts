import type { ClaseDeObjeto } from './numeracion';

export type FinDeLinea = '\r\n' | '\n';

// Una edición es siempre texto LaTeX que se inserta o se quita. Las posiciones de `cambios`
// refieren al texto original; las de `seleccion`, al texto ya editado.
export interface Edicion {
  cambios: { desde: number; hasta: number; insertar: string }[];
  seleccion: { ancla: number; cabeza: number };
}

export interface Config {
  informe: string; build: string;      // rutas absolutas
  principal: string; puerto: number; compilarAlGuardar: boolean;
  corrector: boolean; puertoCorrector: number;
  verificaciones: string;              // ruta absoluta: dónde se guardan las corridas del verificador
  repositorio: string | null;          // ruta absoluta del repositorio de la aplicación, si se configuró
  ramaRepositorio: string;
  agente: string | null;               // comando de Claude Code; null: `claude` del PATH
  limiteVerificacion: { capitulo: number; todo: number };   // minutos
}

export interface ArchivoLeido {
  contenido: string;                   // saltos normalizados a \n, sin BOM
  finDeLinea: FinDeLinea; bom: boolean;
  version: string;                     // SHA-1 hex de los bytes en disco
  fiel: boolean;                       // false: el editor no puede reproducirlo byte a byte; solo lectura
}
export type ResultadoEscritura =
  | { tipo: 'ok'; version: string }
  | { tipo: 'cambio-en-disco'; actual: ArchivoLeido }
  | { tipo: 'desaparecido' };

export interface Capitulo { ruta: string; titulo: string; numero: string | null }
export interface Etiqueta {
  nombre: string; ruta: string; linea: number;   // línea desde 1
  // Qué nombra: una sección (con su título) o un objeto numerado aparte (sin título).
  clase: 'seccion' | ClaseDeObjeto;
  titulo: string; numero: string | null;
}
export interface Proyecto {
  capitulos: Capitulo[]; etiquetas: Etiqueta[];
  paquetes: string[]; bibliografia: string | null;
}

export interface EstadoGit {
  cambiosLocales: boolean; commitsSinEnviar: number; commitsSinTraer: number;
  combinacionEnCurso: boolean; archivosEnConflicto: string[];
}
// 'local': falló un paso de Git en esta máquina; no tiene que ver con Overleaf.
export type ErrorRed = { tipo: 'error'; motivo: 'autenticacion' | 'sin-conexion' | 'local' | 'otro'; mensaje: string };
export type ResultadoTraer =
  | { tipo: 'ok'; archivosCambiados: string[] }
  | { tipo: 'conflicto'; archivos: string[] } | ErrorRed;
export type ResultadoEnviar =
  | { tipo: 'ok'; enviado: boolean }
  | { tipo: 'conflicto'; archivos: string[] }
  | { tipo: 'rechazado'; mensaje: string } | ErrorRed;
export type ResultadoTerminar = { tipo: 'ok' } | { tipo: 'quedan-marcas'; archivos: string[] };

export interface ProblemaLatex {
  gravedad: 'error' | 'advertencia';
  ruta: string | null; linea: number | null;
  mensaje: string;                     // en español si es de los conocidos
  original: string;
}
export type ResultadoCompilacion =
  | { tipo: 'ok' | 'con-errores'; problemas: ProblemaLatex[]; pdfActualizado: boolean }
  | { tipo: 'sin-latex' } | { tipo: 'vencido' };

// Lo que pasó con cada referencia que se quiso agregar a referencias.bib.
export type ResultadoDeReferencia =
  | { tipo: 'agregada' | 'ya-estaba'; clave: string; advertencias: string[] }
  | { tipo: 'clave-repetida'; clave: string; sugerida: string };
export type ResultadoAgregar =
  | { tipo: 'ok'; referencias: ResultadoDeReferencia[] }
  | { tipo: 'invalido'; mensaje: string };

// Zotero, leído por su API local. 'sin-respuesta': no contestó a tiempo.
export type EstadoZotero = 'disponible' | 'cerrado' | 'sin-permiso' | 'sin-respuesta';
export interface ItemZotero {
  biblioteca: string;          // 'users/0' o 'groups/<id>'
  nombreBiblioteca: string;    // 'Mi biblioteca' o el nombre del grupo
  item: string;                // clave de ítem de Zotero, ocho caracteres
  tipo: string; titulo: string;
  autores: string[];           // apellidos (o el nombre, si es institucional); editores si no hay autores
  anio: string | null; doi: string | null;
}

// Corrección ortográfica y gramatical. Las posiciones son relativas al párrafo revisado.
export interface Aviso {
  desde: number; hasta: number;
  tipo: 'ortografia' | 'gramatica' | 'estilo';
  regla: string; mensaje: string; sugerencias: string[];
}
export type EstadoCorrector =
  | { estado: 'apagado' | 'iniciando' | 'listo' }
  | { estado: 'no-disponible'; motivo: string };
