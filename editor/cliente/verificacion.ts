// Lógica de las pestañas Código e Informe, sin DOM: ubicar citas en el texto, agrupar hallazgos y armar los textos.
import { contraDe, contraDeTipo, normalizarEspacios, TIPOS_DE_PESTANA } from '../compartido/verificacion';
import type { Alcance, Contra, Corrida, EstadoVerificacion, Hallazgo, Ignorado, TipoDeHallazgo } from '../compartido/verificacion';

// Un hallazgo de Informe puede citar dos lugares: la cita principal y la referencia.
export type Lado = 'informe' | 'referencia';

export const NOMBRE_DE_TIPO: Record<TipoDeHallazgo, string> = {
  'contradiccion': 'Contradicción',
  'no-lo-cuenta': 'El informe no lo cuenta',
  'sin-respaldo': 'Sin respaldo en el código',
  'sugerencia': 'Sugerencia',
  'se-contradice': 'Se contradice',
  'definicion-distinta': 'Definición distinta',
  'corta-el-hilo': 'Corta el hilo',
  'sin-definir': 'Sin definir',
};

const escaparRegExp = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// La cita viene con los espacios normalizados; en el texto puede tener saltos de línea o sangrías.
export function ubicarCita(texto: string, cita: string, lineaPista: number | null): { desde: number; hasta: number } | null {
  const trozos = normalizarEspacios(cita).split(' ').filter((t) => t !== '');
  if (trozos.length === 0) return null;
  const expresion = new RegExp(trozos.map(escaparRegExp).join('\\s+'), 'g');

  let mejor: { desde: number; hasta: number; distancia: number } | null = null;
  let linea = 1;
  let contadoHasta = 0;
  for (const m of texto.matchAll(expresion)) {
    for (; contadoHasta < m.index; contadoHasta++) if (texto[contadoHasta] === '\n') linea++;
    const distancia = lineaPista === null ? 0 : Math.abs(linea - lineaPista);
    if (mejor === null || distancia < mejor.distancia) mejor = { desde: m.index, hasta: m.index + m[0].length, distancia };
  }
  return mejor && { desde: mejor.desde, hasta: mejor.hasta };
}

// Las dos citas de un hallazgo, o solo la principal; null si ese lado no tiene cita.
function citaDe(h: Hallazgo, lado: Lado): { archivo: string; linea: number | null; cita: string } | null {
  if (lado === 'referencia') return h.referencia ?? null;
  return h.informe.cita === null ? null : { ...h.informe, cita: h.informe.cita };
}

// Solo se conoce el texto del archivo abierto: las citas de otros archivos se dan por ubicadas.
export function ubicarEnArchivo(texto: string, ruta: string | null, hallazgos: readonly Hallazgo[]):
  { citas: { desde: number; hasta: number; id: string; lado: Lado }[]; ubicado(h: Hallazgo, lado?: Lado): boolean } {
  const citas = [];
  for (const h of hallazgos) {
    for (const lado of ['informe', 'referencia'] as const) {
      const c = citaDe(h, lado);
      if (c === null || c.archivo !== ruta) continue;
      const lugar = ubicarCita(texto, c.cita, c.linea);
      if (lugar) citas.push({ ...lugar, id: h.id, lado });
    }
  }
  const ubicados = new Set(citas.map((c) => `${c.id}|${c.lado}`));
  return {
    citas,
    ubicado: (h, lado = 'informe') => {
      const c = citaDe(h, lado);
      return c === null || c.archivo !== ruta || ubicados.has(`${h.id}|${lado}`);
    },
  };
}

// La foto del repositorio que lee el agente está en la carpeta repositorio/: así cita las rutas.
export const rutaParaCopiar = (repo: { archivo: string; linea: number | null }) =>
  `repositorio/${repo.archivo}${repo.linea === null ? '' : `:${repo.linea}`}`;

export function tiempoTranscurrido(ms: number): string {
  const segundos = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
}

interface DatosDeVerificacion { estado: EstadoVerificacion; corridas: Record<Contra, Corrida | null>; ignorados: readonly Ignorado[] }

// Una cancelación no deja corrida nueva ni error: no hay nada que avisar.
export function avisoAlTerminar(anterior: EstadoVerificacion | null, actual: DatosDeVerificacion):
  { texto: string; tipo: 'info' | 'error' } | null {
  if (anterior?.estado !== 'en-curso' || actual.estado.estado === 'en-curso') return null;
  if (actual.estado.error) return { texto: actual.estado.error.mensaje, tipo: 'error' };
  const c = actual.corridas[anterior.contra];
  if (c === null || c.estado !== 'ok' || c.fecha !== new Date(anterior.desde).toISOString()) return null;
  const n = hallazgosVisibles(c, actual.ignorados).length;
  return { texto: `Verificación terminada: ${n} ${n === 1 ? 'hallazgo' : 'hallazgos'}.`, tipo: 'info' };
}

const PRIMERA: Record<Contra, string> = {
  codigo: 'Todavía no hay verificaciones contra el código. Elegí Contra código ▾ para hacer la primera.',
  informe: 'Todavía no hay verificaciones contra el informe. Elegí Contra informe ▾ para hacer la primera.',
};

export function mensajesDelPanel(e: EstadoVerificacion, contra: Contra, c: Corrida | null): string[] {
  const mensajes = [];
  const error = e.estado === 'libre' && e.error?.contra === contra ? e.error : null;
  if (e.estado === 'libre' && e.motivos[contra]) mensajes.push(e.motivos[contra]);
  if (error) mensajes.push(error.mensaje);
  if (c === null) mensajes.push(PRIMERA[contra]);
  // El error de respuesta ilegible ya dice que la corrida quedó guardada como fallida.
  else if (c.estado === 'fallida' && error?.motivo !== 'ilegible') {
    mensajes.push('La última verificación falló: la respuesta del agente no se pudo leer.');
  }
  return mensajes;
}

export function hallazgosVisibles(c: Corrida, ignorados: readonly Ignorado[]): Hallazgo[] {
  const ocultos = new Set([...c.resueltos, ...ignorados.map((i) => i.id)]);
  return c.hallazgos.filter((h) => !ocultos.has(h.id));
}

export const ignoradosDe = (ignorados: readonly Ignorado[], contra: Contra): Ignorado[] =>
  ignorados.filter((i) => contraDeTipo(i.tipo) === contra);

export function agrupar(h: readonly Hallazgo[], contra: Contra):
  { tipo: TipoDeHallazgo; archivos: { archivo: string; hallazgos: Hallazgo[] }[] }[] {
  const grupos = [];
  for (const tipo of TIPOS_DE_PESTANA[contra]) {
    const archivos = new Map<string, Hallazgo[]>();
    for (const x of h.filter((y) => y.tipo === tipo)) {
      const lista = archivos.get(x.informe.archivo) ?? [];
      lista.push(x);
      archivos.set(x.informe.archivo, lista);
    }
    if (archivos.size > 0) grupos.push({ tipo, archivos: [...archivos].map(([archivo, hallazgos]) => ({ archivo, hallazgos })) });
  }
  return grupos;
}

const dos = (n: number) => String(n).padStart(2, '0');

export function encabezado(c: Corrida): string[] {
  const f = new Date(c.fecha);
  const fecha = `${dos(f.getDate())}/${dos(f.getMonth() + 1)} ${dos(f.getHours())}:${dos(f.getMinutes())}`;
  const lineas: string[] = [];
  // Las sugerencias no salen del agente: no tienen rama, ni duración, ni costo.
  if (c.autor !== undefined) lineas.push(`${fecha} · sugerencias de ${c.autor}`);
  else {
    const alcance = c.alcance === 'capitulo' ? 'capítulo' : 'todo el informe';
    // Contra el informe no hay rama ni commit.
    const contra = contraDe(c) === 'informe' ? 'contra el informe' : `${c.rama} ${(c.commit ?? '').slice(0, 7)}`;
    lineas.push(`${fecha} · ${alcance} · ${contra}`);
    // Cada corrida gasta de la cuenta de Claude de quien la lanza: se muestra cuánto.
    const costo = typeof c.costoUsd === 'number'
      ? ` · costó US$ ${c.costoUsd.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '';
    lineas.push(`Tardó ${tiempoTranscurrido(c.duracionMs)}${costo}`);
  }
  if (c.comparacion) lineas.push(`${c.comparacion.nuevos} nuevos · ${c.comparacion.yaNoAparecen} ya no aparecen`);
  if (c.descartados > 0) {
    lineas.push(c.descartados === 1
      ? '1 hallazgo descartado por una cita que no existe'
      : `${c.descartados} hallazgos descartados por citas que no existen`);
  }
  return lineas;
}

export function opcionesDeVerificacion(e: EstadoVerificacion, contra: Contra, rutaAbierta: string | null, esCapitulo: boolean):
  { alcance: Alcance; texto: string; habilitada: boolean; ayuda?: string }[] {
  const opciones: { alcance: Alcance; texto: string }[] = [
    { alcance: 'capitulo', texto: 'Verificar capítulo' },
    { alcance: 'todo', texto: 'Verificar todo' },
  ];
  return opciones.map((o) => {
    if (e.estado === 'en-curso') return { ...o, habilitada: false, ayuda: 'Ya hay una verificación en curso.' };
    const motivo = e.motivos[contra];
    if (motivo) return { ...o, habilitada: false, ayuda: motivo };
    if (o.alcance === 'capitulo' && (rutaAbierta === null || !esCapitulo)) {
      return { ...o, habilitada: false, ayuda: 'Abrí un capítulo para verificarlo.' };
    }
    return { ...o, habilitada: true };
  });
}
