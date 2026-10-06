export type FinDeLinea = '\r\n' | '\n';

export interface Config {
  informe: string; build: string;      // rutas absolutas
  principal: string; puerto: number; compilarAlGuardar: boolean;
}

export interface ArchivoLeido {
  contenido: string;                   // saltos normalizados a \n, sin BOM
  finDeLinea: FinDeLinea; bom: boolean;
  version: string;                     // SHA-1 hex de los bytes en disco
}
export type ResultadoEscritura =
  | { tipo: 'ok'; version: string }
  | { tipo: 'cambio-en-disco'; actual: ArchivoLeido }
  | { tipo: 'desaparecido' };

export interface Capitulo { ruta: string; titulo: string; numero: string | null }
export interface Etiqueta {
  nombre: string; ruta: string; linea: number;   // línea desde 1
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
export type ErrorRed = { tipo: 'error'; motivo: 'autenticacion' | 'sin-conexion' | 'otro'; mensaje: string };
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
