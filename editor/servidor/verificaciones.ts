import fs from 'node:fs/promises';
import path from 'node:path';
import { compararCorridas, type Corrida, type Ignorado } from '../compartido/verificacion';

// Las corridas del verificador, una por archivo, y la lista de hallazgos ignorados. Viven fuera
// de informe/ y del repositorio de la aplicación.
export interface Verificaciones {
  // Calcula la comparación con la corrida anterior del mismo alcance y los mismos archivos.
  guardar(c: Omit<Corrida, 'comparacion' | 'resueltos'>): Promise<Corrida>;
  ultima(): Promise<Corrida | null>;
  marcarResuelto(id: string): Promise<void>;   // en la última corrida
  ignorados(): Promise<Ignorado[]>;
  ignorar(id: string): Promise<void>;          // toma el hallazgo de la última corrida
  recuperar(id: string): Promise<void>;
}

export class HallazgoDesconocido extends Error {}

const ARCHIVO_IGNORADOS = 'ignorados.json';
const NOMBRE = /^(\d{4}-\d{2}-\d{2}-\d{4})-(.+?)(?:-(\d+))?\.json$/;

const dos = (n: number) => String(n).padStart(2, '0');

function nombreBase(c: Pick<Corrida, 'fecha' | 'commit'>): string {
  const f = new Date(c.fecha);
  const marca = `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}-${dos(f.getHours())}${dos(f.getMinutes())}`;
  return `${marca}-${c.commit.slice(0, 7)}`;
}

// Orden por marca de tiempo y después por el sufijo numérico (-2 va después de nada, -10 después de -9).
function compararNombres(a: string, b: string): number {
  const ma = NOMBRE.exec(a);
  const mb = NOMBRE.exec(b);
  if (!ma || !mb) return a < b ? -1 : a > b ? 1 : 0;
  if (ma[1] !== mb[1]) return ma[1]! < mb[1]! ? -1 : 1;
  const sa = Number(ma[3] ?? 1);
  const sb = Number(mb[3] ?? 1);
  if (sa !== sb) return sa - sb;
  return ma[2]! < mb[2]! ? -1 : ma[2]! > mb[2]! ? 1 : 0;
}

const mismosArchivos = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

async function leerJson<T>(archivo: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(archivo, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function crearVerificaciones(dir: string): Verificaciones {
  // Toda escritura va de a una y por un archivo temporal que después reemplaza al real, como la guía.
  let cola: Promise<unknown> = Promise.resolve();
  const enSerie = <T>(tarea: () => Promise<T>): Promise<T> => {
    const resultado = cola.then(tarea);
    cola = resultado.catch(() => undefined);
    return resultado;
  };

  async function escribir(archivo: string, datos: unknown): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
    const temporal = `${archivo}.tmp`;
    await fs.writeFile(temporal, JSON.stringify(datos, null, 2));
    await fs.rename(temporal, archivo);
  }

  // De la más nueva a la más vieja; las ilegibles se saltean.
  async function corridas(): Promise<Array<{ nombre: string; corrida: Corrida }>> {
    let nombres: string[];
    try {
      nombres = await fs.readdir(dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    const validos = nombres.filter((n) => n !== ARCHIVO_IGNORADOS && NOMBRE.test(n)).sort(compararNombres).reverse();
    const lista: Array<{ nombre: string; corrida: Corrida }> = [];
    for (const nombre of validos) {
      const corrida = await leerJson<Corrida>(path.join(dir, nombre));
      if (corrida && Array.isArray(corrida.hallazgos)) lista.push({ nombre, corrida });
    }
    return lista;
  }

  async function leerIgnorados(): Promise<Ignorado[]> {
    const lista = await leerJson<Ignorado[]>(path.join(dir, ARCHIVO_IGNORADOS));
    return Array.isArray(lista) ? lista : [];
  }

  return {
    guardar: (c) => enSerie(async () => {
      const previas = await corridas();
      const anterior = previas.find(({ corrida }) =>
        corrida.estado === 'ok' && corrida.alcance === c.alcance && mismosArchivos(corrida.archivos, c.archivos));
      const completa: Corrida = {
        ...c,
        resueltos: [],
        comparacion: anterior ? compararCorridas(anterior.corrida.hallazgos, c.hallazgos) : null,
      };
      const base = nombreBase(c);
      const existentes = new Set(await fs.readdir(dir).catch(() => [] as string[]));
      let nombre = `${base}.json`;
      for (let n = 2; existentes.has(nombre); n++) nombre = `${base}-${n}.json`;
      await escribir(path.join(dir, nombre), completa);
      return completa;
    }),

    async ultima() {
      return (await corridas())[0]?.corrida ?? null;
    },

    marcarResuelto: (id) => enSerie(async () => {
      const ultima = (await corridas())[0];
      if (!ultima || !ultima.corrida.hallazgos.some((h) => h.id === id)) throw new HallazgoDesconocido(id);
      if (ultima.corrida.resueltos.includes(id)) return;
      ultima.corrida.resueltos.push(id);
      await escribir(path.join(dir, ultima.nombre), ultima.corrida);
    }),

    ignorados: leerIgnorados,

    ignorar: (id) => enSerie(async () => {
      const lista = await leerIgnorados();
      if (lista.some((i) => i.id === id)) return;
      const h = (await corridas())[0]?.corrida.hallazgos.find((x) => x.id === id);
      if (!h) throw new HallazgoDesconocido(id);
      lista.push({
        id,
        tipo: h.tipo,
        archivoInforme: h.informe.archivo,
        cita: h.informe.cita,
        archivoRepo: h.repo?.archivo ?? null,
        explicacion: h.explicacion,
        fecha: new Date().toISOString(),
      });
      await escribir(path.join(dir, ARCHIVO_IGNORADOS), lista);
    }),

    recuperar: (id) => enSerie(async () => {
      const lista = await leerIgnorados();
      if (!lista.some((i) => i.id === id)) throw new HallazgoDesconocido(id);
      await escribir(path.join(dir, ARCHIVO_IGNORADOS), lista.filter((i) => i.id !== id));
    }),
  };
}
