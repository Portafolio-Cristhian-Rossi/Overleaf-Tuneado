import { analizar, type Elemento, type Rango } from '../compartido/analizador';

// Una edición es siempre texto LaTeX que se inserta o se quita. Las posiciones de `cambios`
// refieren al texto original; las de `seleccion`, al texto ya editado.
export interface Edicion {
  cambios: { desde: number; hasta: number; insertar: string }[];
  seleccion: { ancla: number; cabeza: number };
}

const COMANDOS_DE_TITULO = ['chapter', 'section', 'subsection', 'subsubsection'] as const;
type Titulo = Extract<Elemento, { tipo: 'titulo' }>;
type Formato = Extract<Elemento, { tipo: 'formato' }>;

export function alternarFormato(texto: string, sel: Rango, comando: 'textbf' | 'textit'): Edicion {
  const apertura = `\\${comando}{`;
  // El formato más interno de este mismo comando que contiene a la selección.
  const envoltura = analizar(texto)
    .filter((e): e is Formato => e.tipo === 'formato' && e.desde <= sel.desde && sel.hasta <= e.hasta
      && texto.startsWith(apertura, e.desde))
    .at(-1);

  if (envoltura) {
    const corrimiento = envoltura.contenido.desde - envoltura.desde;
    const acotar = (p: number) => Math.max(envoltura.contenido.desde, Math.min(p, envoltura.contenido.hasta)) - corrimiento;
    return {
      cambios: [
        { desde: envoltura.desde, hasta: envoltura.contenido.desde, insertar: '' },
        { desde: envoltura.contenido.hasta, hasta: envoltura.hasta, insertar: '' },
      ],
      seleccion: { ancla: acotar(sel.desde), cabeza: acotar(sel.hasta) },
    };
  }

  return {
    // Sin selección es una sola inserción: dos cambios en el mismo punto no tienen orden definido.
    cambios: sel.desde === sel.hasta
      ? [{ desde: sel.desde, hasta: sel.desde, insertar: `${apertura}}` }]
      : [
        { desde: sel.desde, hasta: sel.desde, insertar: apertura },
        { desde: sel.hasta, hasta: sel.hasta, insertar: '}' },
      ],
    seleccion: { ancla: sel.desde + apertura.length, cabeza: sel.hasta + apertura.length },
  };
}

function lineaDe(texto: string, posicion: number): Rango {
  const desde = texto.lastIndexOf('\n', posicion - 1) + 1;
  const fin = texto.indexOf('\n', posicion);
  return { desde, hasta: fin === -1 ? texto.length : fin };
}

// Título que empieza en la línea de `posicion`, si lo hay.
function tituloDeLaLinea(texto: string, posicion: number): Titulo | null {
  const linea = lineaDe(texto, posicion);
  return analizar(texto).find((e): e is Titulo => e.tipo === 'titulo' && e.desde >= linea.desde && e.desde <= linea.hasta) ?? null;
}

export function nivelEnPosicion(texto: string, posicion: number): 0 | 1 | 2 | 3 | null {
  return tituloDeLaLinea(texto, posicion)?.nivel ?? null;
}

export function cambiarNivelTitulo(texto: string, posicion: number, nivel: 0 | 1 | 2 | 3 | null): Edicion {
  const sinCambios: Edicion = { cambios: [], seleccion: { ancla: posicion, cabeza: posicion } };
  const titulo = tituloDeLaLinea(texto, posicion);

  if (titulo) {
    const contenido = texto.slice(titulo.contenido.desde, titulo.contenido.hasta);
    if (nivel === null) {
      const fin = titulo.desde + contenido.length;
      return { cambios: [{ desde: titulo.desde, hasta: titulo.hasta, insertar: contenido }], seleccion: { ancla: fin, cabeza: fin } };
    }
    const apertura = `\\${COMANDOS_DE_TITULO[nivel]}${titulo.conAsterisco ? '*' : ''}{`;
    const fin = titulo.desde + apertura.length + contenido.length;
    return {
      cambios: [{ desde: titulo.desde, hasta: titulo.contenido.desde, insertar: apertura }],
      seleccion: { ancla: fin, cabeza: fin },
    };
  }

  if (nivel === null) return sinCambios;
  const linea = lineaDe(texto, posicion);
  const contenido = texto.slice(linea.desde, linea.hasta).trim();
  const apertura = `\\${COMANDOS_DE_TITULO[nivel]}{`;
  const fin = linea.desde + apertura.length + contenido.length;
  return {
    cambios: [{ desde: linea.desde, hasta: linea.hasta, insertar: `${apertura}${contenido}}` }],
    seleccion: { ancla: fin, cabeza: fin },
  };
}

// Devuelve el archivo principal con \usepackage{paquete} agregado al preámbulo, o el mismo
// texto si ya lo carga. Nunca toca nada fuera de la línea que inserta.
export function agregarPaquete(principal: string, paquete: string, configuracion?: string): string {
  const elementos = analizar(principal);
  const finPreambulo = elementos.find((e) => e.tipo === 'preambulo')?.hasta ?? principal.length;

  // Los comentarios se tapan con espacios: un \usepackage comentado no cuenta.
  let preambulo = principal.slice(0, finPreambulo);
  for (const e of elementos) {
    if (e.tipo === 'comentario' && e.desde < finPreambulo) {
      const hasta = Math.min(e.hasta, finPreambulo);
      preambulo = preambulo.slice(0, e.desde) + ' '.repeat(hasta - e.desde) + preambulo.slice(hasta);
    }
  }

  const cargas = [...preambulo.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]*)\}/g)];
  if (cargas.some((m) => m[1].split(',').some((p) => p.trim() === paquete))) return principal;

  const ancla = cargas.at(-1) ?? preambulo.match(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}/);
  const lineas = [`\\usepackage{${paquete}}`, ...(configuracion ? [configuracion] : [])].join('\n');
  if (!ancla || ancla.index === undefined) return `${lineas}\n${principal}`;

  const finDeLinea = principal.indexOf('\n', ancla.index + ancla[0].length);
  const donde = finDeLinea === -1 ? principal.length : finDeLinea;
  return `${principal.slice(0, donde)}\n${lineas}${principal.slice(donde)}`;
}
