// Lógica del panel de verificación, sin DOM: ubicar citas en el texto, agrupar hallazgos y armar los textos.
import { normalizarEspacios } from '../compartido/verificacion';
import type { Alcance, Corrida, EstadoVerificacion, Hallazgo, Ignorado, TipoDeHallazgo } from '../compartido/verificacion';

export const NOMBRE_DE_TIPO: Record<TipoDeHallazgo, string> = {
  'contradiccion': 'Contradicción',
  'no-lo-cuenta': 'El informe no lo cuenta',
  'sin-respaldo': 'Sin respaldo en el código',
};

const ORDEN_DE_TIPOS: TipoDeHallazgo[] = ['contradiccion', 'sin-respaldo', 'no-lo-cuenta'];

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

// Solo se conoce el texto del archivo abierto: los hallazgos de otros archivos se dan por ubicados.
export function ubicarEnArchivo(texto: string, ruta: string | null, hallazgos: readonly Hallazgo[]):
  { citas: { desde: number; hasta: number; id: string }[]; ubicado(h: Hallazgo): boolean } {
  const citas = [];
  for (const h of hallazgos) {
    if (h.informe.archivo !== ruta || h.informe.cita === null) continue;
    const lugar = ubicarCita(texto, h.informe.cita, h.informe.linea);
    if (lugar) citas.push({ ...lugar, id: h.id });
  }
  const ubicados = new Set(citas.map((c) => c.id));
  return { citas, ubicado: (h) => h.informe.archivo !== ruta || h.informe.cita === null || ubicados.has(h.id) };
}

// La foto del repositorio que lee el agente está en la carpeta repositorio/: así cita las rutas.
export const rutaParaCopiar = (repo: { archivo: string; linea: number | null }) =>
  `repositorio/${repo.archivo}${repo.linea === null ? '' : `:${repo.linea}`}`;

export function tiempoTranscurrido(ms: number): string {
  const segundos = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
}

interface DatosDeVerificacion { estado: EstadoVerificacion; corrida: Corrida | null; ignorados: readonly Ignorado[] }

// Una cancelación no deja corrida nueva ni error: no hay nada que avisar.
export function avisoAlTerminar(anterior: EstadoVerificacion | null, actual: DatosDeVerificacion):
  { texto: string; tipo: 'info' | 'error' } | null {
  if (anterior?.estado !== 'en-curso' || actual.estado.estado === 'en-curso') return null;
  if (actual.estado.estado === 'libre' && actual.estado.error) return { texto: actual.estado.error.mensaje, tipo: 'error' };
  const c = actual.corrida;
  if (c === null || c.estado !== 'ok' || c.fecha !== new Date(anterior.desde).toISOString()) return null;
  const n = hallazgosVisibles(c, actual.ignorados).length;
  return { texto: `Verificación terminada: ${n} ${n === 1 ? 'hallazgo' : 'hallazgos'}.`, tipo: 'info' };
}

export function mensajesDelPanel(e: EstadoVerificacion, c: Corrida | null): string[] {
  const mensajes = [];
  if (e.estado === 'deshabilitada') mensajes.push(e.motivo);
  if (e.estado === 'libre' && e.error) mensajes.push(e.error.mensaje);
  if (c === null) mensajes.push('Todavía no hay verificaciones. Elegí Verificación ▾ para hacer la primera.');
  // El error de respuesta ilegible ya dice que la corrida quedó guardada como fallida.
  else if (c.estado === 'fallida' && !(e.estado === 'libre' && e.error?.motivo === 'ilegible')) {
    mensajes.push('La última verificación falló: la respuesta del agente no se pudo leer.');
  }
  return mensajes;
}

export function hallazgosVisibles(c: Corrida, ignorados: readonly Ignorado[]): Hallazgo[] {
  const ocultos = new Set([...c.resueltos, ...ignorados.map((i) => i.id)]);
  return c.hallazgos.filter((h) => !ocultos.has(h.id));
}

export function agrupar(h: readonly Hallazgo[]): { tipo: TipoDeHallazgo; archivos: { archivo: string; hallazgos: Hallazgo[] }[] }[] {
  const grupos = [];
  for (const tipo of ORDEN_DE_TIPOS) {
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
  const alcance = c.alcance === 'capitulo' ? 'capítulo' : 'todo el informe';
  const lineas = [`${dos(f.getDate())}/${dos(f.getMonth() + 1)} ${dos(f.getHours())}:${dos(f.getMinutes())} · ${alcance} · ${c.rama} ${c.commit.slice(0, 7)}`];
  if (c.comparacion) lineas.push(`${c.comparacion.nuevos} nuevos · ${c.comparacion.yaNoAparecen} ya no aparecen`);
  if (c.descartados > 0) {
    lineas.push(c.descartados === 1
      ? '1 hallazgo descartado por una cita que no existe'
      : `${c.descartados} hallazgos descartados por citas que no existen`);
  }
  return lineas;
}

export function opcionesDeVerificacion(e: EstadoVerificacion, rutaAbierta: string | null, esCapitulo: boolean):
  { alcance: Alcance; texto: string; habilitada: boolean; ayuda?: string }[] {
  const opciones: { alcance: Alcance; texto: string }[] = [
    { alcance: 'capitulo', texto: 'Verificar capítulo' },
    { alcance: 'todo', texto: 'Verificar todo' },
  ];
  return opciones.map((o) => {
    if (e.estado === 'deshabilitada') return { ...o, habilitada: false, ayuda: e.motivo };
    if (e.estado === 'en-curso') return { ...o, habilitada: false, ayuda: 'Ya hay una verificación en curso.' };
    if (o.alcance === 'capitulo' && (rutaAbierta === null || !esCapitulo)) {
      return { ...o, habilitada: false, ayuda: 'Abrí un capítulo para verificarlo.' };
    }
    return { ...o, habilitada: true };
  });
}
