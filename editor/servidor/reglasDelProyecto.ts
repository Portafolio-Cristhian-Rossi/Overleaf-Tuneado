import fs from 'node:fs/promises';

// Reglas propias de un proyecto para la verificación contra el código: van en
// proyecto/verificacion-codigo.md y se suman a la prompt tal como están.

export const LARGO_MAXIMO_DE_REGLAS = 20000;

export class ReglasDemasiadoLargas extends Error {
  constructor() {
    super(`proyecto/verificacion-codigo.md es demasiado largo: admite hasta ${LARGO_MAXIMO_DE_REGLAS} caracteres.`);
  }
}

// null si el archivo falta o está en blanco. Se lee en cada corrida: un cambio no pide reiniciar.
export async function leerReglasDelProyecto(archivo: string): Promise<string | null> {
  let texto: string;
  try {
    texto = await fs.readFile(archivo, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  const limpio = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (limpio.trim() === '') return null;
  if (limpio.length > LARGO_MAXIMO_DE_REGLAS) throw new ReglasDemasiadoLargas();
  return limpio;
}
