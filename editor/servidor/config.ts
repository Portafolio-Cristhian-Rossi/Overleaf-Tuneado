import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../compartido/tipos';

const POR_DEFECTO = {
  informe: '../informe',
  build: '../build',
  principal: 'main.tex',
  puerto: 4317,
  compilarAlGuardar: false,
};

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

  return {
    informe: path.resolve(dirEditor, String(c.informe)),
    build: path.resolve(dirEditor, String(c.build)),
    principal: String(c.principal),
    puerto: c.puerto,
    compilarAlGuardar: Boolean(c.compilarAlGuardar),
  };
}
