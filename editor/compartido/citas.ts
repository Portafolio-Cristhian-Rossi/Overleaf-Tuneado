import { anioDe, apellidos, autoresCortos, nombrarAutores, sinLatex, type EntradaBib } from './bib';
import { crearIndiceDeObras, obraDe, type Obra } from './referencias';
import type { ItemZotero } from './tipos';

// Las entradas del .bib por su clave, tal como está escrita.
export type Bibliografia = Map<string, EntradaBib>;

export interface TextoDeCita { texto: string; faltan: string[] }   // faltan: claves que no están en el .bib

// Cómo se lee una cita de apacite. Es orientativo: el formato final lo decide apacite en el PDF.
export function textoDeCita(
  comando: string, claves: string[], previo: string | null, posterior: string | null, bib: Bibliografia,
): TextoDeCita {
  // bibtex busca las claves sin distinguir mayúsculas; si no está escrita igual, se busca así.
  const buscar = (clave: string): EntradaBib | undefined => {
    const exacta = bib.get(clave);
    if (exacta) return exacta;
    const enMinusculas = clave.toLowerCase();
    for (const [otra, entrada] of bib) if (otra.toLowerCase() === enMinusculas) return entrada;
    return undefined;
  };
  const forma = comando.replace(/^(?:full|short)/, '');
  // `\nocite{*}` pide toda la bibliografía: el asterisco no es una clave.
  const faltan = claves.filter((clave) => !(forma === 'nocite' && clave === '*') && !buscar(clave));
  if (forma === 'nocite') return { texto: claves.join(', '), faltan };

  const antes = previo ? sinLatex(previo) : '';
  const despues = posterior ? sinLatex(posterior) : '';
  // De cada clave, lo que se muestra; una clave que falta se muestra tal cual.
  const cada = (dibujar: (entrada: EntradaBib, esUltima: boolean) => string) =>
    claves.map((clave, n) => {
      const entrada = buscar(clave);
      return entrada ? dibujar(entrada, n === claves.length - 1) : clave;
    }).join('; ');
  const conOpcionales = (interior: string) => `${antes ? `${antes} ` : ''}${interior}${despues ? `, ${despues}` : ''}`;

  switch (forma) {
    case 'citeA':
      return {
        texto: `${antes ? `${antes} ` : ''}${cada((e, esUltima) => `${autoresCortos(e)} (${anioDe(e)}${esUltima && despues ? `, ${despues}` : ''})`)}`,
        faltan,
      };
    case 'citeNP':
      return { texto: conOpcionales(cada((e) => `${autoresCortos(e)}, ${anioDe(e)}`)), faltan };
    case 'citeauthor':
      return { texto: conOpcionales(cada(autoresCortos)), faltan };
    case 'citeyear':
      return { texto: `(${conOpcionales(cada(anioDe))})`, faltan };
    case 'citeyearNP':
      return { texto: conOpcionales(cada(anioDe)), faltan };
    default:
      return { texto: `(${conOpcionales(cada((e) => `${autoresCortos(e)}, ${anioDe(e)}`))})`, faltan };
  }
}

// Una referencia que el buscador puede ofrecer: ya está en el .bib, o está solo en Zotero.
export interface Candidato {
  origen: 'informe' | 'zotero';
  clave: string | null;                              // la del .bib; null si todavía no está
  zotero: { biblioteca: string; item: string } | null;
  autores: string; anio: string; titulo: string;     // para mostrar
  detalle: string;                                   // 'en el informe' o el nombre de la biblioteca de Zotero
  busqueda: string;                                  // todo lo que se puede buscar, sin tildes ni mayúsculas
}

const sinTildes = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Los del informe, en el orden del .bib; después los de Zotero que no son ninguna de esas
// obras ni se repiten entre sí, por autor y año.
export function candidatos(entradas: EntradaBib[], items: ItemZotero[]): Candidato[] {
  const delInforme = entradas.map((e): Candidato => {
    const titulo = sinLatex(e.campos.title ?? '');
    return {
      origen: 'informe', clave: e.clave, zotero: null, autores: autoresCortos(e), anio: anioDe(e), titulo, detalle: 'en el informe',
      busqueda: sinTildes([...apellidos(e), titulo, anioDe(e), e.clave].join(' ')),
    };
  });

  // Con un índice: comparar cada ítem contra todos los anteriores cuelga la pestaña con miles.
  const vistas = crearIndiceDeObras();
  for (const entrada of entradas) vistas.agregar(obraDe(entrada));
  const deZotero: Candidato[] = [];
  for (const item of items) {
    const obra: Obra = { doi: item.doi, titulo: item.titulo, anio: item.anio, autor: item.autores[0] ?? null };
    if (vistas.tiene(obra)) continue;
    vistas.agregar(obra);
    deZotero.push({
      origen: 'zotero', clave: null, zotero: { biblioteca: item.biblioteca, item: item.item },
      autores: nombrarAutores(item.autores, item.titulo) || 'Sin título', anio: item.anio ?? 's.f.', titulo: item.titulo,
      detalle: item.nombreBiblioteca,
      busqueda: sinTildes([...item.autores, item.titulo, item.anio ?? ''].join(' ')),
    });
  }
  deZotero.sort((a, b) => a.autores.localeCompare(b.autores, 'es', { sensitivity: 'base' }) || a.anio.localeCompare(b.anio));
  return [...delInforme, ...deZotero];
}

// Con qué se reconoce a un candidato mientras el buscador está abierto.
export const idDeCandidato = (c: Candidato) => (c.clave !== null ? `clave:${c.clave}` : `zotero:${c.zotero?.biblioteca}/${c.zotero?.item}`);

// Qué se cita al aceptar: lo marcado, en el orden en que se marcó. Sin nada marcado, en una
// cita nueva vale lo resaltado; al cambiar una cita existente, no: quedarse sin marcas no es
// pedir que la reemplacen por la primera de la lista.
export function elegidosDe(lista: Candidato[], marcados: string[], resaltado: Candidato | null, cambiando: boolean): Candidato[] {
  const porId = new Map(lista.map((c) => [idDeCandidato(c), c]));
  const delOrden = marcados.flatMap((id) => porId.get(id) ?? []);
  if (delOrden.length > 0 || cambiando || resaltado === null) return delOrden;
  return [resaltado];
}

// Sin tildes ni mayúsculas; todas las palabras tienen que aparecer en autores, título, año o clave.
export function filtrarCandidatos(lista: Candidato[], consulta: string): Candidato[] {
  const palabras = sinTildes(consulta).split(/\s+/).filter(Boolean);
  return palabras.length === 0 ? lista : lista.filter((c) => palabras.every((palabra) => c.busqueda.includes(palabra)));
}
