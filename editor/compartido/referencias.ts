import { analizarBib, anioDe, apellidos, autoresCortos, sinLatex, type EntradaBib } from './bib';
import type { ResultadoAgregar, ResultadoDeReferencia } from './tipos';

// referencias.bib es de todo el equipo. No se escriben ahí: la ruta del PDF en la máquina de
// quien exporta, sus notas personales, el resumen y las palabras clave (lo que agrega Zotero),
// ni lo equivalente que agregan JabRef, BibDesk o Mendeley a una ficha que se pega.
export const CAMPOS_QUE_NO_VIAJAN = [
  'file', 'annote', 'abstract', 'keywords',
  'annotation', 'review', 'comment', 'local-url', 'owner', 'mendeley-tags', 'groups',
  'timestamp', 'date-added', 'date-modified', 'readstatus', 'priority', 'ranking',
];
const OTROS_QUE_NO_VIAJAN = /^bdsk-file-\d+$/;

export function noViaja(campo: string): boolean {
  const nombre = campo.toLowerCase();
  return CAMPOS_QUE_NO_VIAJAN.includes(nombre) || OTROS_QUE_NO_VIAJAN.test(nombre);
}

// El texto de la entrada sin esos campos, en todas sus apariciones; nada más cambia.
// `texto` es la fuente que se analizó.
export function limpiarEntrada(texto: string, entrada: EntradaBib): string {
  const quitar = Object.entries(entrada.tramos)
    .flatMap(([campo, tramos]) => (noViaja(campo) ? tramos : []))
    .map((tramo) => {
      // Con su coma, y con el salto y la sangría que lo preceden si está en línea propia.
      let hasta = tramo.hasta;
      while (texto[hasta] === ' ' || texto[hasta] === '\t') hasta++;
      const conComa = texto[hasta] === ',';
      if (conComa) hasta++;
      let desde = tramo.desde;
      while (texto[desde - 1] === ' ' || texto[desde - 1] === '\t') desde--;
      if (texto[desde - 1] === '\n') return { desde: desde - 1, hasta };
      // En la misma línea que otro campo: se va también lo que lo separaba del siguiente o,
      // si era el último, la coma que lo separaba del anterior.
      if (conComa) {
        while (texto[hasta] === ' ' || texto[hasta] === '\t') hasta++;
        return { desde: tramo.desde, hasta };
      }
      return { desde: texto[desde - 1] === ',' ? desde - 1 : tramo.desde, hasta };
    })
    .sort((a, b) => a.desde - b.desde);

  let salida = '';
  let cursor = entrada.desde;
  for (const tramo of quitar) {
    // Dos campos vecinos pueden compartir la coma que los separa: lo ya quitado no se repite.
    if (tramo.hasta <= cursor) continue;
    salida += texto.slice(cursor, Math.max(cursor, tramo.desde));
    cursor = tramo.hasta;
  }
  return salida + texto.slice(cursor, entrada.hasta);
}

// Lo que identifica un trabajo, venga de un .bib o de Zotero. `autor` es el primer apellido.
export interface Obra { doi: string | null; titulo: string; anio: string | null; autor: string | null }

const sinTildes = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const doiNormal = (doi: string) => doi.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '');
// Sin comandos, tildes, mayúsculas ni signos: 'Extracci{\'o}n de {Tópicos}' → 'extraccion de topicos'
export const tituloNormal = (titulo: string) => sinTildes(sinLatex(titulo)).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function obraDe(entrada: EntradaBib): Obra {
  const anio = anioDe(entrada);
  return {
    doi: entrada.campos.doi?.trim() || null, titulo: entrada.campos.title ?? '',
    anio: anio === 's.f.' ? null : anio, autor: apellidos(entrada)[0] ?? null,
  };
}

// Una obra ya normalizada, para compararla muchas veces sin repetir el trabajo.
interface Huella { doi: string | null; tituloYAnio: string | null; autor: string | null }

function huellaDe(obra: Obra): Huella {
  const titulo = tituloNormal(obra.titulo);
  return {
    doi: obra.doi ? doiNormal(obra.doi) : null,
    tituloYAnio: titulo === '' ? null : `${titulo}|${obra.anio ?? ''}`,
    autor: obra.autor ? sinTildes(obra.autor).trim() || null : null,
  };
}

// Si las dos tienen DOI, decide el DOI (un preprint y su versión publicada son dos trabajos).
// Si no: el mismo título, el mismo año y, cuando las dos tienen autores, el mismo primer
// apellido ("Introduction" o "Editorial" de dos autores distintos son dos trabajos).
function mismaHuella(a: Huella, b: Huella): boolean {
  if (a.doi && b.doi) return a.doi === b.doi;
  if (a.tituloYAnio === null || a.tituloYAnio !== b.tituloYAnio) return false;
  return a.autor === null || b.autor === null || a.autor === b.autor;
}

export function mismaObra(a: Obra, b: Obra): boolean {
  return mismaHuella(huellaDe(a), huellaDe(b));
}

export function esLaMismaObra(a: EntradaBib, b: EntradaBib): boolean {
  return mismaObra(obraDe(a), obraDe(b));
}

// Un conjunto de obras donde preguntar "¿ya está?" no depende de cuántas haya.
export function crearIndiceDeObras() {
  const porDoi = new Set<string>();
  const porTitulo = new Map<string, Huella[]>();
  return {
    agregar(obra: Obra): void {
      const huella = huellaDe(obra);
      if (huella.doi) porDoi.add(huella.doi);
      if (huella.tituloYAnio !== null) porTitulo.set(huella.tituloYAnio, [...(porTitulo.get(huella.tituloYAnio) ?? []), huella]);
    },
    tiene(obra: Obra): boolean {
      const huella = huellaDe(obra);
      if (huella.doi && porDoi.has(huella.doi)) return true;
      return huella.tituloYAnio !== null && (porTitulo.get(huella.tituloYAnio) ?? []).some((otra) => mismaHuella(huella, otra));
    },
  };
}

const LARGO_DE_NOTA = 80;

export function advertenciasDe(entrada: EntradaBib): string[] {
  const advertencias: string[] = [];
  if (entrada.tipo === 'article' && !entrada.campos.journal?.trim() && !entrada.campos.journaltitle?.trim()) {
    advertencias.push(`A "${entrada.clave}" le falta la revista (journal). Al compilar, la bibliografía puede dar error. `
      + 'Si es una tesis o un informe, corregí el tipo en Zotero.');
  }
  const nota = sinLatex(entrada.campos.note ?? '');
  if (nota !== '') {
    const recortada = nota.length > LARGO_DE_NOTA ? `${nota.slice(0, LARGO_DE_NOTA)}…` : nota;
    advertencias.push(`"${entrada.clave}" trae una nota que se va a imprimir en la bibliografía: "${recortada}".`);
  }
  return advertencias;
}

const NINGUNA = 'No encontré ninguna referencia en el texto pegado. Tiene que empezar con @article{…, @book{… o similar.';
// Lo que no puede ir en una clave: blancos, lo que LaTeX o bibtex leen como otra cosa, y letras con tilde.
const CLAVE_VALIDA = /^[!-~]+$/;
const EN_CLAVE_NO = /[,{}"#%~\\]/;

function mismosCampos(a: EntradaBib, b: EntradaBib): boolean {
  const nombres = Object.keys(a.campos);
  return nombres.length === Object.keys(b.campos).length && nombres.every((n) => a.campos[n].trim() === b.campos[n]?.trim());
}

// Decide, sin tocar nada, qué hay que escribir al final del .bib.
export function planearAgregado(
  bibActual: string, bibtexNuevo: string, alRepetir: 'preguntar' | 'renombrar',
): { agregar: string; resultado: ResultadoAgregar } {
  const invalido = (mensaje: string) => ({ agregar: '', resultado: { tipo: 'invalido' as const, mensaje } });
  const nuevo = bibtexNuevo.replace(/\r\n?/g, '\n');
  const pegado = analizarBib(nuevo, { conRepetidas: true });
  if (pegado.problemas.length > 0) {
    const { linea, mensaje } = pegado.problemas[0];
    return invalido(`La referencia no está bien formada (línea ${linea}): ${mensaje}`);
  }
  if (pegado.entradas.length === 0) return invalido(NINGUNA);
  const malaClave = pegado.entradas.find((e) => !CLAVE_VALIDA.test(e.clave) || EN_CLAVE_NO.test(e.clave));
  if (malaClave) return invalido(`La clave "${malaClave.clave}" tiene caracteres que LaTeX no acepta en una cita.`);

  // Lo que ya hay, más lo que esta misma llamada va aceptando.
  const presentes = analizarBib(bibActual).entradas;
  const ocupada = (clave: string) => presentes.some((p) => p.clave.toLowerCase() === clave.toLowerCase());
  const textos: string[] = [];
  const referencias: ResultadoDeReferencia[] = [];

  for (const entrada of pegado.entradas) {
    let texto = limpiarEntrada(nuevo, entrada).trim();
    let limpia: EntradaBib | undefined = analizarBib(texto).entradas[0];
    // Segunda barrera: si después de limpiar queda algo que no debe viajar, no se agrega nada.
    if (!limpia || Object.keys(limpia.campos).some(noViaja)) {
      return invalido(`No se pudo preparar "${entrada.clave}" para el archivo compartido: no se agregó nada. Pegá la referencia sin sus campos personales.`);
    }
    const pedida = limpia;
    const existente = presentes.find((p) => esLaMismaObra(p, pedida) || (p.clave === pedida.clave && mismosCampos(p, pedida)));
    if (existente) {
      const conOtraClave = existente.clave !== pedida.clave;
      referencias.push({
        tipo: 'ya-estaba', clave: existente.clave,
        advertencias: conOtraClave
          ? [`"${pedida.clave}" ya estaba cargada como "${existente.clave}" (${autoresCortos(existente)}, ${anioDe(existente)}): se cita esa.`]
          : [],
      });
      continue;
    }
    if (ocupada(limpia.clave)) {
      let n = 2;
      while (ocupada(`${limpia.clave}-${n}`)) n++;
      const sugerida = `${limpia.clave}-${n}`;
      if (alRepetir === 'preguntar') {
        referencias.push({ tipo: 'clave-repetida', clave: limpia.clave, sugerida });
        continue;
      }
      // La clave es lo primero después de la llave (o el paréntesis) que abre la entrada.
      const inicio = (/^@[A-Za-z]+\s*[{(]\s*/.exec(texto)?.[0].length ?? -1);
      if (inicio === -1 || !texto.startsWith(limpia.clave, inicio)) return invalido(`No se pudo cambiar la clave de "${limpia.clave}": no se agregó nada.`);
      texto = texto.slice(0, inicio) + sugerida + texto.slice(inicio + limpia.clave.length);
      limpia = analizarBib(texto).entradas[0];
      if (!limpia) return invalido(`No se pudo cambiar la clave de "${pedida.clave}": no se agregó nada.`);
    }
    textos.push(texto);
    presentes.push(limpia);
    referencias.push({ tipo: 'agregada', clave: limpia.clave, advertencias: advertenciasDe(limpia) });
  }

  if (textos.length === 0) return { agregar: '', resultado: { tipo: 'ok', referencias } };
  // Exactamente una línea en blanco antes de lo nuevo, según cómo termina el archivo.
  const final = /(?:^|\n)[ \t]*(?:\n[ \t]*)?$/.exec(bibActual)?.[0] ?? '';
  const saltos = bibActual.trim() === '' ? 2 : (final.match(/\n/g) ?? []).length;
  const comienzo = saltos >= 2 ? '' : saltos === 1 ? '\n' : '\n\n';
  return { agregar: `${comienzo}${textos.join('\n\n')}\n`, resultado: { tipo: 'ok', referencias } };
}
