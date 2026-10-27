import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizarEspacios, normalizarRuta, validarHallazgos, type Corrida } from '../compartido/verificacion';
import { cargarConfig } from './config';
import { crearVerificaciones, type Verificaciones } from './verificaciones';

// Carga observaciones de redacción al panel de verificación, como una corrida de tipo «sugerencia».
// Cada una dice en qué archivo del informe va, qué frase cita tal como está y qué propone:
// [{ "archivo": "Cap2 - Antecedentes.tex", "cita": "frase del informe", "explicacion": "qué cambiar" }]

const escaparRegExp = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// La línea de la primera aparición de la cita; en el texto puede cruzar saltos de línea.
export function lineaDeCita(texto: string, cita: string): number | null {
  const trozos = normalizarEspacios(cita).split(' ').filter((t) => t !== '');
  if (trozos.length === 0) return null;
  const m = new RegExp(trozos.map(escaparRegExp).join('\\s+')).exec(texto);
  return m ? texto.slice(0, m.index).split('\n').length : null;
}

async function leerDelInforme(dirInforme: string, ruta: string): Promise<string | null> {
  try {
    return (await fs.readFile(path.join(dirInforme, ruta), 'utf8')).replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

// Guarda las que se pueden ubicar en el informe. descartadas: posiciones (desde 1) de las que no.
export async function cargarSugerencias(o: {
  dirInforme: string; verificaciones: Verificaciones; crudas: unknown; autor: string; fecha?: Date;
}): Promise<{ corrida: Corrida | null; descartadas: number[] }> {
  if (!Array.isArray(o.crudas)) throw new Error('El archivo tiene que tener una lista de sugerencias.');

  const informe = new Map<string, string>();
  for (const c of o.crudas) {
    const ruta = esObjeto(c) && typeof c.archivo === 'string' ? normalizarRuta(c.archivo, 'informe') : null;
    if (ruta === null || informe.has(ruta)) continue;
    const texto = await leerDelInforme(o.dirInforme, ruta);
    if (texto !== null) informe.set(ruta, texto);
  }

  const entrada = o.crudas.map((c) => {
    if (!esObjeto(c)) return c;
    const ruta = typeof c.archivo === 'string' ? normalizarRuta(c.archivo, 'informe') : null;
    const texto = ruta === null ? undefined : informe.get(ruta);
    const linea = texto !== undefined && typeof c.cita === 'string' ? lineaDeCita(texto, c.cita) : null;
    return { tipo: 'sugerencia', informe: { archivo: c.archivo, linea, cita: c.cita ?? null }, repo: null, explicacion: c.explicacion };
  });
  const contexto = { informe, lineasDelRepo: () => null };
  const descartadas = entrada.flatMap((e, i) => (validarHallazgos([e], contexto, ['sugerencia']).hallazgos.length === 0 ? [i + 1] : []));
  const { hallazgos, descartados } = validarHallazgos(entrada, contexto, ['sugerencia']);
  if (hallazgos.length === 0) return { corrida: null, descartadas };

  const corrida = await o.verificaciones.guardar({
    fecha: (o.fecha ?? new Date()).toISOString(),
    alcance: 'todo',
    archivos: [...new Set(hallazgos.map((h) => h.informe.archivo))],
    rama: '',
    commit: 'sugerencias',
    duracionMs: 0,
    costoUsd: null,
    estado: 'ok',
    crudo: null,
    descartados,
    hallazgos,
    autor: o.autor,
  });
  return { corrida, descartadas };
}

// npm run sugerencias -- <archivo.json> [autor]
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [archivo, autor = 'Claude'] = process.argv.slice(2);
  if (!archivo) {
    console.error('Uso: npm run sugerencias -- <archivo.json> [autor]');
    process.exit(1);
  }
  const config = cargarConfig(path.resolve(import.meta.dirname, '..'));
  // npm corre el script desde editor/: la ruta se toma desde donde se lo llamó.
  const crudas = JSON.parse(await fs.readFile(path.resolve(process.env.INIT_CWD ?? process.cwd(), archivo), 'utf8'));
  const r = await cargarSugerencias({ dirInforme: config.informe, verificaciones: crearVerificaciones(config.verificaciones), crudas, autor });
  for (const n of r.descartadas) console.error(`La sugerencia ${n} no se cargó: su archivo o su cita no están en el informe.`);
  if (!r.corrida) {
    console.error('No se cargó ninguna sugerencia.');
    process.exit(1);
  }
  const n = r.corrida.hallazgos.length;
  console.log(`${n} ${n === 1 ? 'sugerencia cargada' : 'sugerencias cargadas'}. Recargá la pestaña del editor para verlas en Verificación.`);
}
