import { analizarBib, anioDe, sinLatex, type EntradaBib } from './bib';
import type { ResultadoAgregar, ResultadoDeReferencia } from './tipos';

// referencias.bib es de todo el equipo: la ruta del PDF en la máquina de quien exporta, sus
// notas personales, el resumen y las palabras clave no se escriben ahí.
export const CAMPOS_QUE_NO_VIAJAN = ['file', 'annote', 'abstract', 'keywords'];

// El texto de la entrada sin esos campos; nada más cambia. `texto` es la fuente que se analizó.
export function limpiarEntrada(texto: string, entrada: EntradaBib): string {
  const quitar = CAMPOS_QUE_NO_VIAJAN.flatMap((campo) => (entrada.tramos[campo] ? [entrada.tramos[campo]] : []))
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
    salida += texto.slice(cursor, tramo.desde);
    cursor = tramo.hasta;
  }
  return salida + texto.slice(cursor, entrada.hasta);
}

// Lo que identifica un trabajo, venga de un .bib o de Zotero.
export interface Obra { doi: string | null; titulo: string; anio: string | null }

const doiNormal = (doi: string) => doi.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '');
// Sin comandos, tildes, mayúsculas ni signos: 'Extracci{\'o}n de {Tópicos}' → 'extraccion de topicos'
export const tituloNormal = (titulo: string) => sinLatex(titulo).normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function obraDe(entrada: EntradaBib): Obra {
  const anio = anioDe(entrada);
  return { doi: entrada.campos.doi?.trim() || null, titulo: entrada.campos.title ?? '', anio: anio === 's.f.' ? null : anio };
}

// Si las dos tienen DOI, decide el DOI (un preprint y su versión publicada son dos trabajos).
// Si no, el mismo título y el mismo año.
export function mismaObra(a: Obra, b: Obra): boolean {
  if (a.doi && b.doi) return doiNormal(a.doi) === doiNormal(b.doi);
  const titulo = tituloNormal(a.titulo);
  return titulo !== '' && titulo === tituloNormal(b.titulo) && a.anio === b.anio;
}

export function esLaMismaObra(a: EntradaBib, b: EntradaBib): boolean {
  return mismaObra(obraDe(a), obraDe(b));
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
const CLAVE_VALIDA = /^[A-Za-z0-9_\-:.+]+$/;

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
  const malaClave = pegado.entradas.find((e) => !CLAVE_VALIDA.test(e.clave));
  if (malaClave) return invalido(`La clave "${malaClave.clave}" tiene caracteres que LaTeX no acepta en una cita.`);

  // Lo que ya hay, más lo que esta misma llamada va aceptando.
  const presentes = analizarBib(bibActual).entradas;
  const ocupada = (clave: string) => presentes.some((p) => p.clave.toLowerCase() === clave.toLowerCase());
  const textos: string[] = [];
  const referencias: ResultadoDeReferencia[] = [];

  for (const entrada of pegado.entradas) {
    let texto = limpiarEntrada(nuevo, entrada).trim();
    let limpia = analizarBib(texto).entradas[0];
    const existente = presentes.find((p) => esLaMismaObra(p, limpia) || (p.clave === limpia.clave && mismosCampos(p, limpia)));
    if (existente) {
      referencias.push({ tipo: 'ya-estaba', clave: existente.clave, advertencias: [] });
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
      // La clave es lo primero después de la llave que abre la entrada.
      const inicio = texto.indexOf(limpia.clave);
      texto = texto.slice(0, inicio) + sugerida + texto.slice(inicio + limpia.clave.length);
      limpia = analizarBib(texto).entradas[0];
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
