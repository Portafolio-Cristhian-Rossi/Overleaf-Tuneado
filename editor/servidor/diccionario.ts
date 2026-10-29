import fs from 'node:fs/promises';
import path from 'node:path';

// Diccionario y excepciones de autocorrección del equipo. Vive en la carpeta del proyecto, no en el informe.
export interface DatosDeCorreccion { palabras: string[]; excepciones: string[] }

export interface Diccionario {
  leer(): Promise<DatosDeCorreccion>;
  // Palabra que el corrector no debe marcar (un término técnico, un nombre propio).
  agregarPalabra(palabra: string): Promise<void>;
  // Palabra que la autocorrección no debe volver a tocar.
  agregarExcepcion(palabra: string): Promise<void>;
}

const LARGO_MAXIMO = 80;

function validar(palabra: unknown): string {
  const limpia = typeof palabra === 'string' ? palabra.trim() : '';
  if (limpia === '' || /\s/.test(limpia) || limpia.length > LARGO_MAXIMO) {
    throw new Error('La palabra no es válida: tiene que ser una sola palabra.');
  }
  return limpia;
}

const soloTexto = (lista: unknown): string[] =>
  Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [];

export function crearDiccionario(archivo: string): Diccionario {
  // Devuelve null si el archivo existe pero no se puede interpretar.
  async function cargar(): Promise<DatosDeCorreccion | null> {
    let texto: string;
    try {
      texto = await fs.readFile(archivo, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { palabras: [], excepciones: [] };
      throw e;
    }
    try {
      const datos = JSON.parse(texto.replace(/^﻿/, ''));
      return { palabras: soloTexto(datos?.palabras), excepciones: soloTexto(datos?.excepciones) };
    } catch {
      return null;
    }
  }

  // Los cambios van de a uno, y se escribe a un archivo aparte que después reemplaza al real:
  // un corte a mitad de la escritura no deja el diccionario por la mitad.
  let cola: Promise<unknown> = Promise.resolve();
  function cambiar(modificar: (d: DatosDeCorreccion) => void): Promise<void> {
    const resultado = cola.then(async () => {
      const datos = await cargar();
      if (datos === null) {
        throw new Error(`El archivo ${archivo} está dañado. Corregilo o borralo para volver a usar el diccionario.`);
      }
      modificar(datos);
      // La carpeta del proyecto puede no existir todavía: se crea con lo primero que se guarda.
      await fs.mkdir(path.dirname(archivo), { recursive: true });
      const temporal = `${archivo}.tmp`;
      await fs.writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`);
      await fs.rename(temporal, archivo);
    });
    cola = resultado.catch(() => undefined);
    return resultado;
  }

  const sumar = (lista: string[], valor: string) => { if (!lista.includes(valor)) lista.push(valor); };

  return {
    leer: async () => (await cargar()) ?? { palabras: [], excepciones: [] },
    async agregarPalabra(palabra) {
      const limpia = validar(palabra);
      await cambiar((d) => sumar(d.palabras, limpia));
    },
    async agregarExcepcion(palabra) {
      const limpia = validar(palabra).toLowerCase();
      await cambiar((d) => sumar(d.excepciones, limpia));
    },
  };
}
