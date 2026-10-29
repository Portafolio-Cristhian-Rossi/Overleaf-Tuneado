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
  agente: null as string | null,
  glosario: 'Glosario' as string | null,
  marcoTeorico: ['antecedentes', 'marco teórico'] as string[] | null,
};
const LIMITE_POR_DEFECTO = { capitulo: 15, todo: 45 };
const PROYECTO_POR_DEFECTO = '../proyecto';

// Claves que son rutas: cada capa las resuelve contra la carpeta de su propio archivo.
const RUTAS = ['informe', 'build', 'verificaciones', 'repositorio'] as const;

// Un config.json que falta es un objeto vacío. El BOM se quita: el Bloc de notas lo agrega.
function leerJson(ruta: string, nombre: string): Record<string, any> {
  if (!fs.existsSync(ruta)) return {};
  try {
    const leido = JSON.parse(fs.readFileSync(ruta, 'utf8').replace(/^﻿/, ''));
    if (typeof leido !== 'object' || leido === null || Array.isArray(leido)) throw new Error();
    return leido;
  } catch {
    throw new Error(`config: ${nombre} no es un JSON válido`);
  }
}

function conRutasAbsolutas(capa: Record<string, any>, dir: string): Record<string, any> {
  const r = { ...capa };
  for (const clave of RUTAS) {
    if (typeof r[clave] === 'string') r[clave] = path.resolve(dir, r[clave]);
  }
  return r;
}

const limiteDe = (capa: Record<string, any>) =>
  typeof capa.limiteVerificacion === 'object' && capa.limiteVerificacion !== null ? capa.limiteVerificacion : {};

// La configuración se arma en capas; gana la última que define cada clave:
// los valores por defecto, proyecto/config.json (del equipo) y editor/config.json (personal).
export function cargarConfig(
  dirEditor: string,
  archivo: string = process.env.EDITOR_CONFIG ?? 'config.json',
): Config {
  const personal = leerJson(path.resolve(dirEditor, archivo), archivo);
  if (personal.proyecto !== undefined && (typeof personal.proyecto !== 'string' || personal.proyecto === '')) {
    throw new Error('config: proyecto tiene que ser la ruta de una carpeta');
  }
  const dirProyecto = path.resolve(dirEditor, personal.proyecto ?? PROYECTO_POR_DEFECTO);
  const proyecto = leerJson(path.join(dirProyecto, 'config.json'), 'proyecto/config.json');
  // proyecto y puerto son de cada máquina: el lanzador (abrir.ps1) lee el puerto solo de la config personal.
  for (const clave of ['proyecto', 'puerto']) {
    if (clave in proyecto) {
      throw new Error(`config: proyecto/config.json no puede definir ${clave}; va en editor/config.json`);
    }
  }

  const c = {
    ...conRutasAbsolutas(POR_DEFECTO, dirEditor),
    ...conRutasAbsolutas(proyecto, dirProyecto),
    ...conRutasAbsolutas(personal, dirEditor),
  };

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
  if (c.agente !== null && (typeof c.agente !== 'string' || c.agente === '')) {
    throw new Error('config: agente tiene que ser la ruta de claude.exe');
  }
  if (c.glosario !== null && (typeof c.glosario !== 'string' || c.glosario.trim() === '')) {
    throw new Error('config: glosario tiene que ser el título de un capítulo o null');
  }
  const palabras = c.marcoTeorico;
  if (palabras !== null && (!Array.isArray(palabras) || palabras.length === 0
    || !palabras.every((p: unknown) => typeof p === 'string' && p.trim() !== ''))) {
    throw new Error('config: marcoTeorico tiene que ser una lista de palabras o null');
  }
  // El límite puede venir incompleto en cada capa: lo que falte sale de la capa de abajo.
  const limite = { ...LIMITE_POR_DEFECTO, ...limiteDe(proyecto), ...limiteDe(personal) };
  const positivo = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;
  if (!positivo(limite.capitulo) || !positivo(limite.todo)) {
    throw new Error('config: limiteVerificacion necesita capitulo y todo, en minutos mayores que cero');
  }

  return {
    informe: String(c.informe),
    build: String(c.build),
    principal: String(c.principal),
    puerto: c.puerto,
    compilarAlGuardar: Boolean(c.compilarAlGuardar),
    corrector: Boolean(c.corrector),
    puertoCorrector: c.puertoCorrector,
    verificaciones: String(c.verificaciones),
    repositorio: c.repositorio,
    ramaRepositorio: c.ramaRepositorio,
    limiteVerificacion: { capitulo: limite.capitulo, todo: limite.todo },
    // Tal como se escribió: puede ser solo "claude" (el del PATH) o una ruta con espacios.
    agente: c.agente,
    proyecto: dirProyecto,
    glosario: c.glosario,
    marcoTeorico: c.marcoTeorico,
  };
}
