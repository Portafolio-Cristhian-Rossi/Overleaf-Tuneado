import fs from 'node:fs';
import path from 'node:path';
import { analizar, type Elemento } from '../compartido/analizador';
import { numerarTitulos } from '../compartido/numeracion';
import type { Capitulo, Etiqueta, Proyecto } from '../compartido/tipos';
import { decodificar } from './archivos';

const TITULO_PRINCIPAL = 'Portada y resumen';

interface Fuente { texto: string; elementos: Elemento[]; sinComentarios: string }

function leerFuente(absoluta: string): Fuente | null {
  if (!fs.existsSync(absoluta) || !fs.statSync(absoluta).isFile()) return null;
  const texto = decodificar(fs.readFileSync(absoluta)).contenido;
  const elementos = analizar(texto);
  // Los comentarios se reemplazan por espacios para conservar las posiciones.
  let sinComentarios = texto;
  for (const e of elementos) {
    if (e.tipo === 'comentario') {
      sinComentarios = sinComentarios.slice(0, e.desde) + ' '.repeat(e.hasta - e.desde) + sinComentarios.slice(e.hasta);
    }
  }
  return { texto, elementos, sinComentarios };
}

// Ruta relativa con / de un \include o \input, o null si no existe o sale del informe.
function resolverIncluido(dirInforme: string, nombre: string): string | null {
  const conExtension = /\.tex$/i.test(nombre.trim()) ? nombre.trim() : `${nombre.trim()}.tex`;
  const absoluta = path.resolve(dirInforme, conExtension);
  const relativa = path.relative(dirInforme, absoluta);
  if (relativa.startsWith('..') || path.isAbsolute(relativa)) return null;
  if (!fs.existsSync(absoluta) || !fs.statSync(absoluta).isFile()) return null;
  return relativa.split(path.sep).join('/');
}

function primerCapitulo(f: Fuente) {
  const e = f.elementos.find((x) => x.tipo === 'titulo' && x.nivel === 0);
  return e?.tipo === 'titulo' ? e : null;
}

function nombresDePaquetes(texto: string, comando: 'usepackage' | 'RequirePackage'): string[] {
  const patron = new RegExp(`\\\\${comando}(?:\\[[^\\]]*\\])?\\{([^}]*)\\}`, 'g');
  return [...texto.matchAll(patron)].flatMap((m) => m[1].split(',').map((p) => p.trim()).filter(Boolean));
}

function etiquetasDe(ruta: string, f: Fuente, numeroCapitulo: string | null): Etiqueta[] {
  const numeros = numerarTitulos(f.elementos, numeroCapitulo);
  const salida: Etiqueta[] = [];
  let titulo = '';
  let numero: string | null = null;
  for (const e of f.elementos) {
    if (e.tipo === 'titulo') {
      titulo = f.texto.slice(e.contenido.desde, e.contenido.hasta);
      numero = numeros.get(e.desde) ?? null;
    } else if (e.tipo === 'etiqueta') {
      const linea = f.texto.slice(0, e.desde).split('\n').length;
      salida.push({ nombre: e.nombre, ruta, linea, titulo, numero });
    }
  }
  return salida;
}

export async function describirProyecto(dirInforme: string, principal: string): Promise<Proyecto> {
  const raiz = path.resolve(dirInforme);
  const fuentePrincipal = leerFuente(path.join(raiz, principal));

  const capitulos: Capitulo[] = [];
  const etiquetas: Etiqueta[] = [];

  if (fuentePrincipal) {
    // `{` apila el modo vigente y `}` lo restaura: \backmatter dentro de un grupo no afecta lo que sigue.
    let modo = { numerado: true, apendice: false };
    const pila: (typeof modo)[] = [];
    let numeroSiguiente = 1;
    let letraSiguiente = 0;
    const vistos = new Set<string>();
    const patron = /\\(frontmatter|mainmatter|backmatter|appendix)(?![a-zA-Z@])|\\begin\{appendix\}|\\(?:include|input)\{([^}]*)\}|[{}]/g;

    for (const m of fuentePrincipal.sinComentarios.matchAll(patron)) {
      if (m[0] === '{') pila.push({ ...modo });
      else if (m[0] === '}') modo = pila.pop() ?? modo;
      else if (m[1] === 'frontmatter' || m[1] === 'backmatter') modo = { ...modo, numerado: false };
      else if (m[1] === 'mainmatter') modo = { ...modo, numerado: true };
      else if (m[1] === 'appendix' || m[0] === '\\begin{appendix}') modo = { ...modo, apendice: true };
      else if (m[2] !== undefined) {
        const ruta = resolverIncluido(raiz, m[2]);
        if (ruta === null || vistos.has(ruta) || ruta === principal) continue;
        vistos.add(ruta);
        const f = leerFuente(path.join(raiz, ruta))!;
        const capitulo = primerCapitulo(f);
        let numero: string | null = null;
        if (capitulo && !capitulo.conAsterisco && modo.numerado) {
          const antes = f.sinComentarios.slice(0, capitulo.desde);
          const esApendice = modo.apendice || /\\begin\{appendix\}|\\appendix(?![a-zA-Z@])/.test(antes);
          numero = esApendice ? String.fromCharCode(65 + letraSiguiente++) : String(numeroSiguiente++);
        }
        capitulos.push({
          ruta,
          titulo: capitulo ? f.texto.slice(capitulo.contenido.desde, capitulo.contenido.hasta) : path.basename(ruta),
          numero,
        });
        etiquetas.push(...etiquetasDe(ruta, f, numero));
      }
    }
  }

  if (!fuentePrincipal || capitulos.length === 0) {
    const sueltos = fs.readdirSync(raiz).filter((n) => /\.tex$/i.test(n)).sort();
    return {
      capitulos: sueltos.map((ruta) => ({ ruta, titulo: ruta, numero: null })),
      etiquetas: sueltos.flatMap((ruta) => etiquetasDe(ruta, leerFuente(path.join(raiz, ruta))!, null)),
      paquetes: fuentePrincipal ? paquetesDe(raiz, fuentePrincipal) : [],
      bibliografia: fuentePrincipal ? bibliografiaDe(raiz, fuentePrincipal) : null,
    };
  }

  return {
    capitulos: [{ ruta: principal, titulo: TITULO_PRINCIPAL, numero: null }, ...capitulos],
    etiquetas: [...etiquetasDe(principal, fuentePrincipal, null), ...etiquetas],
    paquetes: paquetesDe(raiz, fuentePrincipal),
    bibliografia: bibliografiaDe(raiz, fuentePrincipal),
  };
}

function paquetesDe(raiz: string, principal: Fuente): string[] {
  const preambulo = principal.elementos.find((e) => e.tipo === 'preambulo');
  const cabecera = principal.sinComentarios.slice(0, preambulo ? preambulo.hasta : principal.sinComentarios.length);
  const paquetes = nombresDePaquetes(cabecera, 'usepackage');

  const clase = cabecera.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]*)\}/)?.[1].trim();
  const fuenteClase = clase ? leerFuente(path.join(raiz, `${clase}.cls`)) : null;
  if (fuenteClase) {
    paquetes.push(...nombresDePaquetes(fuenteClase.sinComentarios, 'RequirePackage'));
    paquetes.push(...nombresDePaquetes(fuenteClase.sinComentarios, 'usepackage'));
  }
  return [...new Set(paquetes)];
}

function bibliografiaDe(raiz: string, principal: Fuente): string | null {
  const nombre = principal.sinComentarios.match(/\\bibliography\{([^}]*)\}/)?.[1].split(',')[0].trim();
  if (!nombre) return null;
  const archivo = /\.bib$/i.test(nombre) ? nombre : `${nombre}.bib`;
  return fs.existsSync(path.join(raiz, archivo)) ? archivo : null;
}
