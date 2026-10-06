import type { ProblemaLatex } from '../compartido/tipos';

const ANCHO_DE_LINEA = 79;   // TeX corta las líneas del log en esta columna

// Reúne las líneas que TeX partió por ancho, para poder leer cada aviso entero.
function lineasDe(log: string): string[] {
  const salida: string[] = [];
  let pendiente = '';
  for (const linea of log.split(/\r?\n/)) {
    pendiente += linea;
    if (linea.length === ANCHO_DE_LINEA) continue;
    salida.push(pendiente);
    pendiente = '';
  }
  if (pendiente) salida.push(pendiente);
  return salida;
}

function normalizarRuta(ruta: string): string {
  return ruta.replace(/\\/g, '/').replace(/^\.\//, '');
}

// Mensaje en español para los errores comunes; null si no es de los conocidos.
function traducir(original: string, siguientes: string[]): string | null {
  let m: RegExpMatchArray | null;
  if (/Undefined control sequence/.test(original)) {
    const contexto = siguientes.find((l) => /^l\.\d+ /.test(l)) ?? '';
    const comandos = contexto.match(/\\[a-zA-Z@]+/g);
    return comandos ? `Comando desconocido: ${comandos[comandos.length - 1]}` : 'Comando desconocido';
  }
  if (/Missing \} inserted|Runaway argument|File ended while scanning|Paragraph ended before/.test(original)) {
    return 'Falta cerrar una llave }';
  }
  if (/Extra \}, or forgotten \$/.test(original)) return 'Sobra una llave } o falta un $';
  if (/Missing \$ inserted/.test(original)) return 'Hay un símbolo matemático fuera de una ecuación';
  if ((m = original.match(/File `([^']+)' not found/))) return `No se encontró el archivo ${m[1]}`;
  if ((m = original.match(/Environment (\S+) undefined/))) return `Entorno desconocido: ${m[1]}`;
  if ((m = original.match(/Unicode character (.+?) \(U\+[0-9A-Fa-f]+\)/))) {
    return `Carácter no soportado: «${m[1]}». Suele aparecer al copiar y pegar desde Word o un PDF; reemplazalo por el equivalente común`;
  }
  return null;
}

function sinDuplicados(problemas: ProblemaLatex[]): ProblemaLatex[] {
  const vistos = new Set<string>();
  return problemas.filter((p) => {
    const clave = `${p.gravedad}|${p.ruta}|${p.linea}|${p.mensaje}`;
    return vistos.has(clave) ? false : (vistos.add(clave), true);
  });
}

// Espera un log generado con -file-line-error: los errores vienen como ARCHIVO:LÍNEA: MENSAJE.
export function interpretarLog(log: string): ProblemaLatex[] {
  const lineas = lineasDe(log);
  const problemas: ProblemaLatex[] = [];

  lineas.forEach((linea, i) => {
    const error = linea.match(/^(.+?\.[a-zA-Z]+):(\d+): (.*)$/);
    if (error) {
      const original = error[3].trim();
      problemas.push({
        gravedad: 'error',
        ruta: normalizarRuta(error[1]),
        linea: Number(error[2]),
        mensaje: traducir(original, lineas.slice(i + 1, i + 6)) ?? original,
        original,
      });
      return;
    }
    const aviso = linea.match(/Warning: (Reference|Citation) `([^']+)'.*?undefined(?:.*?on input line (\d+))?/);
    if (aviso) {
      problemas.push({
        gravedad: 'advertencia',
        ruta: null,
        linea: aviso[3] ? Number(aviso[3]) : null,
        mensaje: aviso[1] === 'Reference' ? `La referencia ${aviso[2]} no existe` : `La cita ${aviso[2]} no está en la bibliografía`,
        original: linea.trim(),
      });
    }
  });

  return sinDuplicados(problemas);
}

export function interpretarBlg(blg: string): ProblemaLatex[] {
  const problemas: ProblemaLatex[] = [];
  for (const linea of blg.split(/\r?\n/)) {
    let m: RegExpMatchArray | null;
    if ((m = linea.match(/I didn't find a database entry for "([^"]+)"/))) {
      problemas.push({ gravedad: 'advertencia', ruta: null, linea: null, mensaje: `La cita ${m[1]} no está en la bibliografía`, original: linea.trim() });
    } else if ((m = linea.match(/I couldn't open database file (\S+)/))) {
      problemas.push({ gravedad: 'error', ruta: null, linea: null, mensaje: `No se encontró el archivo ${m[1]}`, original: linea.trim() });
    }
  }
  return sinDuplicados(problemas);
}
