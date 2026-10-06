import fs from 'node:fs/promises';
import path from 'node:path';
import { resolverEnInforme } from './archivos';

export type TipoDeImagen = 'image/png' | 'image/jpeg' | 'application/pdf';
export type ResultadoGuardar =
  | { tipo: 'ok'; ruta: string }
  | { tipo: 'existe'; ruta: string; sugerido: string }
  | { tipo: 'invalido'; mensaje: string };

export interface Imagenes {
  // Archivo de imagen al que apunta una ruta de \includegraphics; null si no existe.
  resolver(ruta: string): Promise<{ absoluta: string; tipo: TipoDeImagen } | null>;
  listar(): Promise<{ ruta: string; bytes: number }[]>;
  // Guarda una imagen nueva en figs/. Nunca sobrescribe.
  guardar(nombre: string, bytes: Buffer): Promise<ResultadoGuardar>;
}

const CARPETA = 'figs';
// En el orden en que pdflatex las prueba cuando la ruta no trae extensión.
const TIPOS: [string, TipoDeImagen][] = [
  ['.pdf', 'application/pdf'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
];
const tipoDeExtension = (extension: string) => TIPOS.find(([e]) => e === extension.toLowerCase())?.[1] ?? null;
const tipoDe = (archivo: string) => tipoDeExtension(path.extname(archivo));

// Primeros bytes de cada formato: una foto renombrada a .png haría fallar a pdflatex sin explicación.
const FIRMAS: Record<TipoDeImagen, number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
};
const tieneFirma = (bytes: Buffer, tipo: TipoDeImagen) => FIRMAS[tipo].every((b, i) => bytes[i] === b);

// Nombre seguro para LaTeX y para Git: sin carpeta, sin tildes ni espacios, extensión en minúsculas.
// 'Gráfico final (2).PNG' → 'Grafico-final-2.png'. null si la extensión no es de imagen o no queda nombre.
export function nombreDeImagen(nombre: string): string | null {
  const base = String(nombre).split(/[\\/]/).pop() ?? '';
  const extension = path.extname(base).toLowerCase();
  if (tipoDeExtension(extension) === null) return null;
  const tronco = base.slice(0, base.length - extension.length)
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return tronco === '' ? null : tronco + extension;
}

async function esArchivo(absoluta: string): Promise<boolean> {
  return fs.stat(absoluta).then((s) => s.isFile(), () => false);
}

export function crearImagenes(dirInforme: string): Imagenes {
  const raiz = path.resolve(dirInforme);
  const carpeta = path.join(raiz, CARPETA);

  async function nombresEnFigs(): Promise<string[]> {
    return fs.readdir(carpeta).catch(() => []);
  }

  return {
    async resolver(ruta) {
      const absoluta = resolverEnInforme(raiz, ruta);
      const propio = tipoDe(absoluta);
      if (propio !== null) return (await esArchivo(absoluta)) ? { absoluta, tipo: propio } : null;
      for (const [extension, tipo] of TIPOS) {
        if (await esArchivo(absoluta + extension)) return { absoluta: absoluta + extension, tipo };
      }
      return null;
    },

    async listar() {
      const entradas = await fs.readdir(carpeta, { recursive: true, withFileTypes: true }).catch(() => []);
      const imagenes = await Promise.all(entradas
        .filter((e) => e.isFile() && tipoDe(e.name) !== null)
        .map(async (e) => {
          const absoluta = path.join(e.parentPath, e.name);
          return { ruta: path.relative(raiz, absoluta).split(path.sep).join('/'), bytes: (await fs.stat(absoluta)).size };
        }));
      return imagenes.sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));
    },

    async guardar(nombre, bytes) {
      const limpio = nombreDeImagen(nombre);
      if (limpio === null) return { tipo: 'invalido', mensaje: 'Solo se aceptan imágenes PNG, JPG o PDF.' };
      if (!tieneFirma(bytes, tipoDe(limpio)!)) {
        return { tipo: 'invalido', mensaje: 'El archivo no es una imagen PNG, JPG o PDF válida.' };
      }

      // Windows no distingue mayúsculas: Foto.png y foto.png son el mismo archivo.
      const existentes = await nombresEnFigs();
      const enUso = new Map(existentes.map((n) => [n.toLowerCase(), n]));
      const repetido = enUso.get(limpio.toLowerCase());
      if (repetido !== undefined) {
        const extension = path.extname(limpio);
        const tronco = limpio.slice(0, limpio.length - extension.length);
        let n = 2;
        while (enUso.has(`${tronco}-${n}${extension}`.toLowerCase())) n++;
        return { tipo: 'existe', ruta: `${CARPETA}/${repetido}`, sugerido: `${tronco}-${n}${extension}` };
      }

      await fs.mkdir(carpeta, { recursive: true });
      try {
        await fs.writeFile(path.join(carpeta, limpio), bytes, { flag: 'wx' });
      } catch (e) {
        // Apareció entre la comprobación y la escritura: se informa igual que si ya estaba.
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        return { tipo: 'existe', ruta: `${CARPETA}/${limpio}`, sugerido: limpio.replace(/(\.[^.]+)$/, '-2$1') };
      }
      return { tipo: 'ok', ruta: `${CARPETA}/${limpio}` };
    },
  };
}
