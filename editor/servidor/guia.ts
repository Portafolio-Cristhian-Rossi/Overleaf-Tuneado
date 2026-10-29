import fs from 'node:fs/promises';
import path from 'node:path';
import { GUIA_INICIAL } from '../compartido/prompt';

// Guía de estilo que acompaña a cada prompt. Vive en la carpeta del proyecto, no en el informe.
export interface Guia {
  // La guía guardada o, mientras no haya ninguna, la inicial.
  leer(): Promise<string>;
  guardar(texto: unknown): Promise<void>;
}

export const LARGO_MAXIMO_DE_GUIA = 20000;

// Lo que se quiso guardar no es una guía: es un error de quien pide, no del servidor.
export class GuiaInvalida extends Error {}

export function crearGuia(archivo: string): Guia {
  // Los guardados van de a uno, y a un archivo aparte que después reemplaza al real: un corte a
  // mitad de la escritura no deja la guía por la mitad.
  let cola: Promise<unknown> = Promise.resolve();

  return {
    async leer() {
      let texto: string;
      try {
        texto = await fs.readFile(archivo, 'utf8');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return GUIA_INICIAL;
        throw e;
      }
      const limpio = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n');
      return limpio.trim() === '' ? GUIA_INICIAL : limpio;
    },
    guardar(texto) {
      if (typeof texto !== 'string') return Promise.reject(new GuiaInvalida('La guía no es válida: tiene que ser texto.'));
      if (texto.length > LARGO_MAXIMO_DE_GUIA) {
        return Promise.reject(new GuiaInvalida(`La guía es demasiado larga: admite hasta ${LARGO_MAXIMO_DE_GUIA} caracteres.`));
      }
      const resultado = cola.then(async () => {
        // La carpeta del proyecto puede no existir todavía: se crea con lo primero que se guarda.
        await fs.mkdir(path.dirname(archivo), { recursive: true });
        const temporal = `${archivo}.tmp`;
        await fs.writeFile(temporal, texto);
        await fs.rename(temporal, archivo);
      });
      cola = resultado.catch(() => undefined);
      return resultado;
    },
  };
}
