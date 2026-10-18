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
