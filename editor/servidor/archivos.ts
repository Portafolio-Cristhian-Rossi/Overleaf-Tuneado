import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArchivoLeido, FinDeLinea, ResultadoEscritura } from '../compartido/tipos';

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const EXTENSIONES_EDITABLES = new Set(['.tex', '.bib']);

export class RutaInvalida extends Error {}
// El archivo existe pero el editor no lo puede guardar sin dañarlo.
export class ArchivoProtegido extends Error {}

export function versionDe(bytes: Buffer): string {
  return createHash('sha1').update(bytes).digest('hex');
}

export function decodificar(bytes: Buffer): Omit<ArchivoLeido, 'version' | 'fiel'> {
  const bom = bytes.subarray(0, 3).equals(BOM);
  const texto = (bom ? bytes.subarray(3) : bytes).toString('utf8');
  const crlf = texto.match(/\r\n/g)?.length ?? 0;
  const lf = (texto.match(/\n/g)?.length ?? 0) - crlf;
  const finDeLinea: FinDeLinea = crlf > lf ? '\r\n' : '\n';
  return { contenido: texto.replace(/\r\n/g, '\n'), finDeLinea, bom };
}

export function codificar(contenido: string, finDeLinea: FinDeLinea, bom: boolean): Buffer {
  const texto = finDeLinea === '\n' ? contenido : contenido.replace(/\n/g, finDeLinea);
  const bytes = Buffer.from(texto, 'utf8');
  return bom ? Buffer.concat([BOM, bytes]) : bytes;
}

// ¿Puede el editor devolver exactamente estos bytes? No, si el archivo no es UTF-8 válido,
// mezcla fines de línea o tiene retornos de carro sueltos: guardarlo alteraría partes que
// nadie tocó (por ejemplo, todas las tildes de un .bib en Latin-1).
export function esFiel(bytes: Buffer): boolean {
  const d = decodificar(bytes);
  return !d.contenido.includes('\r') && codificar(d.contenido, d.finDeLinea, d.bom).equals(bytes);
}

function leido(bytes: Buffer): ArchivoLeido {
  return { ...decodificar(bytes), version: versionDe(bytes), fiel: esFiel(bytes) };
}

export interface Archivos {
  leer(ruta: string): Promise<ArchivoLeido>;
  escribir(ruta: string, datos: {
    contenido: string; finDeLinea: FinDeLinea; bom: boolean;
    versionBase: string; forzar?: boolean;
  }): Promise<ResultadoEscritura>;
}

// Ruta absoluta de un archivo del informe. Rechaza todo lo que salga de `raiz` o toque .git.
export function resolverEnInforme(raiz: string, ruta: string): string {
  if (typeof ruta !== 'string' || ruta === '' || path.isAbsolute(ruta) || /^[a-zA-Z]:/.test(ruta)) {
    throw new RutaInvalida(`Ruta no permitida: ${ruta}`);
  }
  const absoluta = path.resolve(raiz, ruta);
  const relativa = path.relative(raiz, absoluta);
  const partes = relativa.split(path.sep);
  // Windows no distingue mayúsculas: .GIT es la misma carpeta que .git.
  if (relativa === '' || partes[0] === '..' || partes.some((parte) => parte.toLowerCase() === '.git')) {
    throw new RutaInvalida(`Ruta no permitida: ${ruta}`);
  }
  return absoluta;
}

export function crearArchivos(dirInforme: string): Archivos {
  const raiz = path.resolve(dirInforme);
  const resolver = (ruta: string) => resolverEnInforme(raiz, ruta);

  async function leerBytes(absoluta: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(absoluta);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  return {
    async leer(ruta) {
      return leido(await fs.readFile(resolver(ruta)));
    },

    async escribir(ruta, datos) {
      const absoluta = resolver(ruta);
      if (!EXTENSIONES_EDITABLES.has(path.extname(absoluta).toLowerCase())) {
        throw new RutaInvalida(`Tipo de archivo no editable: ${ruta}`);
      }
      const actuales = await leerBytes(absoluta);
      if (actuales === null) return { tipo: 'desaparecido' };
      if (!esFiel(actuales)) {
        throw new ArchivoProtegido('Este archivo no está en UTF-8 o mezcla fines de línea: no se puede guardar desde el editor sin dañarlo.');
      }
      if (!datos.forzar && versionDe(actuales) !== datos.versionBase) {
        return { tipo: 'cambio-en-disco', actual: leido(actuales) };
      }
      const nuevos = codificar(datos.contenido, datos.finDeLinea, datos.bom);
      await fs.writeFile(absoluta, nuevos);
      return { tipo: 'ok', version: versionDe(nuevos) };
    },
  };
}
