import type { ErrorRed, ProblemaLatex, ResultadoCompilacion, ResultadoEnviar, ResultadoTraer } from '../compartido/tipos';

export interface Aviso { texto: string; tipo: 'info' | 'error' }

const error = (texto: string): Aviso => ({ texto, tipo: 'error' });
const info = (texto: string): Aviso => ({ texto, tipo: 'info' });
const rechazo = (mensaje: string) => error(`Overleaf rechazó la operación:\n${mensaje}`);

function avisoDeRed(e: ErrorRed): Aviso {
  if (e.motivo === 'autenticacion') {
    return error('Git no pudo autenticarse con Overleaf. Abrí una terminal en la carpeta informe, ejecutá git pull e ingresá el token.');
  }
  if (e.motivo === 'sin-conexion') return error('No hay conexión con Overleaf. Tus cambios están guardados en esta máquina.');
  return rechazo(e.mensaje);
}

// null cuando hay conflicto: de eso se ocupa el bloqueo sobre el editor, no un aviso.
export function avisoDeTraer(r: ResultadoTraer): Aviso | null {
  if (r.tipo === 'conflicto') return null;
  if (r.tipo === 'error') return avisoDeRed(r);
  const n = r.archivosCambiados.length;
  return info(n === 0 ? 'Ya estabas al día' : n === 1 ? 'Se actualizó 1 archivo' : `Se actualizaron ${n} archivos`);
}

export function avisoDeEnviar(r: ResultadoEnviar): Aviso | null {
  if (r.tipo === 'conflicto') return null;
  if (r.tipo === 'error') return avisoDeRed(r);
  if (r.tipo === 'rechazado') return rechazo(r.mensaje);
  return info(r.enviado ? 'Cambios enviados a Overleaf' : 'No había cambios para enviar');
}

export function avisoDeCompilacion(r: ResultadoCompilacion): string | null {
  if (r.tipo === 'sin-latex') return 'Para ver el PDF hace falta instalar MiKTeX. Los pasos están en INSTALACION.md.';
  if (r.tipo === 'vencido') {
    return 'La compilación tardó demasiado y se canceló. Si es la primera vez, MiKTeX puede estar descargando paquetes: probá de nuevo.';
  }
  return null;
}

// Resumen de una compilación que terminó. pdflatex suele generar un PDF aunque haya errores.
export function estadoDeCompilacion(r: Extract<ResultadoCompilacion, { problemas: ProblemaLatex[] }>): string {
  const errores = r.problemas.filter((p) => p.gravedad === 'error').length;
  const avisos = r.problemas.length - errores;
  if (errores === 0) {
    return avisos === 0 ? 'PDF actualizado' : `PDF actualizado, con ${avisos === 1 ? '1 aviso' : `${avisos} avisos`}`;
  }
  const cuantos = errores === 1 ? 'Hay 1 error' : `Hay ${errores} errores`;
  return r.pdfActualizado
    ? `${cuantos}: el PDF se generó igual, pero puede estar incompleto`
    : `${cuantos}: se muestra el último PDF que se pudo generar`;
}

export function ubicacionDe(p: ProblemaLatex): string {
  return [p.ruta, p.linea === null ? null : `línea ${p.linea}`].filter(Boolean).join(', ');
}
