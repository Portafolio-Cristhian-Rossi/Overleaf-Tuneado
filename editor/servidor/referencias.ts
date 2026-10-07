import fs from 'node:fs/promises';
import path from 'node:path';
import { planearAgregado } from '../compartido/referencias';
import type { ResultadoAgregar } from '../compartido/tipos';
import { codificar, decodificar, esFiel, resolverEnInforme } from './archivos';

export interface Referencias {
  // Agrega al final del .bib las referencias del texto que todavía no estén. Nunca toca lo existente.
  agregar(bibtex: string, alRepetir: 'preguntar' | 'renombrar'): Promise<ResultadoAgregar>;
}

const invalido = (mensaje: string): ResultadoAgregar => ({ tipo: 'invalido', mensaje });

async function leerBytes(absoluta: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(absoluta);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

// `bibliografia` devuelve la ruta del .bib dentro del informe, o null si el informe no declara ninguno.
// `antesDeEscribir` existe para las pruebas: corre entre decidir y escribir.
export function crearReferencias(
  dirInforme: string, bibliografia: () => Promise<string | null>, o: { antesDeEscribir?: () => Promise<void> } = {},
): Referencias {
  const raiz = path.resolve(dirInforme);

  return {
    async agregar(bibtex, alRepetir) {
      const ruta = await bibliografia();
      if (ruta === null) return invalido('El informe no tiene un archivo de referencias. Agregá \\bibliography{referencias} a main.tex.');
      const absoluta = resolverEnInforme(raiz, ruta);
      const nombre = path.basename(absoluta);
      const falta = invalido(`No se encuentra ${nombre} en el informe.`);

      let bytes = await leerBytes(absoluta);
      // Si alguien guarda el archivo entre decidir y escribir, se decide de nuevo, una sola vez.
      for (let intento = 0; intento < 2 && bytes !== null; intento++) {
        if (!esFiel(bytes)) {
          return invalido(`${nombre} no está en UTF-8 o mezcla fines de línea: no se puede modificar desde el editor sin dañarlo.`);
        }
        const actual = decodificar(bytes);
        const plan = planearAgregado(actual.contenido, bibtex, alRepetir);
        if (plan.agregar === '') return plan.resultado;

        await o.antesDeEscribir?.();
        const ahora = await leerBytes(absoluta);
        if (ahora !== null && ahora.equals(bytes)) {
          // Solo se anexa: los bytes que ya estaban no se vuelven a escribir.
          await fs.appendFile(absoluta, codificar(plan.agregar, actual.finDeLinea, false));
          return plan.resultado;
        }
        bytes = ahora;
      }
      return bytes === null ? falta : invalido(`${nombre} cambió mientras se agregaba la referencia. Probá de nuevo.`);
    },
  };
}
