import { snippet } from '@codemirror/autocomplete';
import { EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { analizar } from '../compartido/analizador';
import { detectarBarra, filtrarEtiquetas, filtrarPlantillas } from './menuBarra';
import { CONFIG_LISTINGS, PLANTILLAS } from './plantillas';

// Texto que queda en el documento al insertar una plantilla en un archivo vacío.
function expandir(texto: string): string {
  let resultado = '';
  const editor = {
    state: EditorState.create({ doc: '' }),
    dispatch(tr: Transaction) { resultado = tr.state.doc.toString(); },
  };
  snippet(texto)(editor, null, 0, 0);
  return resultado;
}

describe('detectarBarra', () => {
  it.each([
    ['/', { desde: 0, consulta: '' }],
    ['  /ta', { desde: 2, consulta: 'ta' }],
    ['/ecuación', { desde: 0, consulta: 'ecuación' }],
    ['texto /ta', null],
    ['http://x', null],
    ['', null],
    ['/ta bla', null],
  ])('detectarBarra(%j)', (linea, esperado) => {
    expect(detectarBarra(linea)).toEqual(esperado);
  });
});

describe('filtrarPlantillas', () => {
  it('sin consulta ofrece las diez, en orden', () => {
    expect(filtrarPlantillas('').map((p) => p.id)).toEqual([
      'seccion', 'subseccion', 'lista', 'listaNumerada', 'figura', 'tabla', 'ecuacion', 'cita', 'codigo', 'referencia',
    ]);
  });

  it('filtra sin importar tildes ni mayúsculas', () => {
    expect(filtrarPlantillas('ecu').map((p) => p.id)).toEqual(['ecuacion']);
    expect(filtrarPlantillas('ECUACIÓN').map((p) => p.id)).toEqual(['ecuacion']);
    expect(filtrarPlantillas('codigo').map((p) => p.id)).toEqual(['codigo']);
    expect(filtrarPlantillas('ta').map((p) => p.id)).toEqual(['tabla']);
  });

  it('busca por el inicio de cualquier palabra del nombre', () => {
    expect(filtrarPlantillas('num').map((p) => p.id)).toEqual(['listaNumerada']);
    expect(filtrarPlantillas('cruz').map((p) => p.id)).toEqual(['referencia']);
    expect(filtrarPlantillas('ista')).toEqual([]);
  });
});

describe('filtrarEtiquetas', () => {
  const etiquetas = [
    { nombre: 'sec:CAP2_IA', ruta: 'Cap2.tex', linea: 15, titulo: 'Inteligencia Artificial', numero: '2.1' },
    { nombre: 'sec:CAP2_AA', ruta: 'Cap2.tex', linea: 17, titulo: 'Aprendizaje Automático', numero: '2.2' },
  ];

  it('busca en el nombre de la etiqueta y en el título, sin tildes ni mayúsculas', () => {
    expect(filtrarEtiquetas(etiquetas, '').map((e) => e.nombre)).toEqual(['sec:CAP2_IA', 'sec:CAP2_AA']);
    expect(filtrarEtiquetas(etiquetas, 'automatico').map((e) => e.nombre)).toEqual(['sec:CAP2_AA']);
    expect(filtrarEtiquetas(etiquetas, 'cap2_ia').map((e) => e.nombre)).toEqual(['sec:CAP2_IA']);
    expect(filtrarEtiquetas(etiquetas, '2.2').map((e) => e.nombre)).toEqual(['sec:CAP2_AA']);
  });
});

describe('PLANTILLAS', () => {
  const plantilla = (id: string) => PLANTILLAS.find((p) => p.id === id)!;

  it('la plantilla de tabla termina sus filas con dos barras invertidas', () => {
    const texto = expandir(plantilla('tabla').texto);
    expect(texto).toContain('Columna 1 & Columna 2 \\\\\n');
    expect(texto).toContain('dato & dato \\\\\n');
    expect(texto).not.toContain('\\\\\\');
  });

  it('las plantillas con campos quedan con su texto de ejemplo y sin marcas de snippet', () => {
    expect(expandir(plantilla('seccion').texto)).toBe('\\section{Título}\n\n');
    expect(expandir(plantilla('figura').texto)).toBe(
      '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{figs/archivo.png}\n'
      + '  \\caption{Descripción de la figura}\n  \\label{fig:nombre}\n\\end{figure}\n');
    expect(expandir(plantilla('ecuacion').texto)).toBe('\\begin{equation}\n  a = b\n  \\label{eq:nombre}\n\\end{equation}\n');
    expect(expandir(plantilla('cita').texto)).toBe('\\cite{clave}');
    expect(expandir(plantilla('referencia').texto)).toBe('\\ref{}');
    expect(expandir(plantilla('codigo').texto)).toBe(
      '\\begin{lstlisting}[language=Python, caption={Descripción}, label={lst:nombre}]\n\n\\end{lstlisting}\n');
    for (const p of PLANTILLAS) expect(expandir(p.texto), p.id).not.toMatch(/\$\{|#\{/);
  });

  it('declaran el paquete que necesitan', () => {
    expect(Object.fromEntries(PLANTILLAS.filter((p) => p.paquete).map((p) => [p.id, p.paquete]))).toEqual({
      figura: 'graphicx', tabla: 'booktabs', ecuacion: 'amsmath', codigo: 'listings',
    });
    expect(plantilla('codigo').configuracion).toBe(CONFIG_LISTINGS);
    expect(CONFIG_LISTINGS).toContain("{á}{{\\'a}}1");
    expect(CONFIG_LISTINGS).toContain('{ñ}{{\\~n}}1');
  });

  it('toda plantilla expandida es reconocida sin error por analizar', () => {
    for (const p of PLANTILLAS) expect(() => analizar(expandir(p.texto)), p.id).not.toThrow();
    expect(analizar(expandir(plantilla('lista').texto)).map((e) => e.tipo)).toEqual(['inicioLista', 'item', 'finLista']);
    expect(analizar(expandir(plantilla('figura').texto)).map((e) => e.tipo)).toEqual(['entorno', 'imagen', 'epigrafe', 'etiqueta']);
    expect(analizar(expandir(plantilla('ecuacion').texto)).map((e) => e.tipo)).toEqual(['matematica', 'etiqueta']);
    expect(analizar(expandir(plantilla('codigo').texto)).map((e) => e.tipo)).toEqual(['entorno']);
  });
});
