import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../compartido/tipos';

const POR_DEFECTO = {
  informe: '../informe',
  build: '../build',
  principal: 'main.tex',
  puerto: 4317,
  compilarAlGuardar: false,
  corrector: true,
  puertoCorrector: 4319,
  verificaciones: '../verificaciones',
  repositorio: null as string | null,
  ramaRepositorio: 'main',
};
const LIMITE_POR_DEFECTO = { capitulo: 15, todo: 45 };

export function cargarConfig(
  dirEditor: string,
  archivo: string = process.env.EDITOR_CONFIG ?? 'config.json',
): Config {
  const ruta = path.resolve(dirEditor, archivo);
  const leido = fs.existsSync(ruta) ? JSON.parse(fs.readFileSync(ruta, 'utf8')) : {};
  const c = { ...POR_DEFECTO, ...leido };

  if (!Number.isInteger(c.puerto) || c.puerto < 1024 || c.puerto > 65535) {
    throw new Error(`config: el puerto debe ser un entero entre 1024 y 65535 (se recibió ${JSON.stringify(c.puerto)})`);
  }

  if (!Number.isInteger(c.puertoCorrector) || c.puertoCorrector < 1024 || c.puertoCorrector > 65535 || c.puertoCorrector === c.puerto) {
    throw new Error(`config: puertoCorrector debe ser un entero entre 1024 y 65535, distinto de puerto (se recibió ${JSON.stringify(c.puertoCorrector)})`);
  }

  if (c.repositorio !== null && typeof c.repositorio !== 'string') {
    throw new Error('config: repositorio tiene que ser la ruta de una carpeta');
  }
  if (typeof c.ramaRepositorio !== 'string' || c.ramaRepositorio === '') {
    throw new Error(`config: ramaRepositorio tiene que ser el nombre de una rama (se recibió ${JSON.stringify(c.ramaRepositorio)})`);
  }
  // El límite puede venir incompleto en config.json: lo que falte sale de los valores por defecto.
  const parcial = typeof leido.limiteVerificacion === 'object' && leido.limiteVerificacion !== null ? leido.limiteVerificacion : {};
  const limite = { ...LIMITE_POR_DEFECTO, ...parcial };
  const positivo = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;
  if (!positivo(limite.capitulo) || !positivo(limite.todo)) {
    throw new Error('config: limiteVerificacion necesita capitulo y todo, en minutos mayores que cero');
  }

  return {
    informe: path.resolve(dirEditor, String(c.informe)),
    build: path.resolve(dirEditor, String(c.build)),
    principal: String(c.principal),
    puerto: c.puerto,
    compilarAlGuardar: Boolean(c.compilarAlGuardar),
    corrector: Boolean(c.corrector),
    puertoCorrector: c.puertoCorrector,
    verificaciones: path.resolve(dirEditor, String(c.verificaciones)),
    repositorio: c.repositorio === null ? null : path.resolve(dirEditor, c.repositorio),
    ramaRepositorio: c.ramaRepositorio,
    limiteVerificacion: { capitulo: limite.capitulo, todo: limite.todo },
  };
}
