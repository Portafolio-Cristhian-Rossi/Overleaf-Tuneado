import type { Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import type { Elemento } from '../../compartido/analizador';
import type { Decorador } from './tipos';

type Entorno = Extract<Elemento, { tipo: 'entorno' }>;

export const esCodigo = (e: Elemento): e is Entorno => e.tipo === 'entorno' && (e.nombre === 'lstlisting' || e.nombre === 'verbatim');

// El interior de lstlisting y verbatim se ve como un recuadro monoespaciado y se edita directo:
// nada se reemplaza, solo se atenúan las líneas que abren y cierran.
export const decorarCodigo: Decorador = ({ estado, elementos }) => {
  const rangos: Range<Decoration>[] = [];
  const atenuar = (desde: number, hasta: number) => {
    if (hasta > desde) rangos.push(Decoration.mark({ class: 'cm-atenuado' }).range(desde, hasta));
  };

  for (const e of elementos.filter(esCodigo)) {
    const primera = estado.doc.lineAt(e.desde);
    const ultima = estado.doc.lineAt(e.interior.hasta);
    if (primera.number === ultima.number) {
      atenuar(e.desde, e.interior.desde);
      atenuar(e.interior.hasta, e.hasta);
      continue;
    }
    atenuar(e.desde, primera.to);
    atenuar(e.interior.hasta, e.hasta);
    for (let n = primera.number + 1; n < ultima.number; n++) {
      rangos.push(Decoration.line({ class: 'cm-codigo' }).range(estado.doc.line(n).from));
    }
  }
  return rangos;
};
