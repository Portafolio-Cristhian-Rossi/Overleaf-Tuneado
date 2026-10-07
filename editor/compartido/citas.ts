import { anioDe, autoresCortos, sinLatex, type EntradaBib } from './bib';

// Las entradas del .bib por su clave, tal como está escrita.
export type Bibliografia = Map<string, EntradaBib>;

export interface TextoDeCita { texto: string; faltan: string[] }   // faltan: claves que no están en el .bib

// Cómo se lee una cita de apacite. Es orientativo: el formato final lo decide apacite en el PDF.
export function textoDeCita(
  comando: string, claves: string[], previo: string | null, posterior: string | null, bib: Bibliografia,
): TextoDeCita {
  const faltan = claves.filter((clave) => !bib.has(clave));
  const forma = comando.replace(/^(?:full|short)/, '');
  if (forma === 'nocite') return { texto: claves.join(', '), faltan };

  const antes = previo ? sinLatex(previo) : '';
  const despues = posterior ? sinLatex(posterior) : '';
  // De cada clave, lo que se muestra; una clave que falta se muestra tal cual.
  const cada = (dibujar: (entrada: EntradaBib, esUltima: boolean) => string) =>
    claves.map((clave, n) => {
      const entrada = bib.get(clave);
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
