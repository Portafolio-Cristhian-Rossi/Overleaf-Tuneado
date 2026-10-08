import { snippet } from '@codemirror/autocomplete';
import { EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { analizar } from '../compartido/analizador';
import type { Etiqueta } from '../compartido/tipos';
import { colocarPlantilla, describirEtiqueta, detectarBarra, filtrarEtiquetas, filtrarPlantillas } from './menuBarra';
import { CONFIG_LISTINGS, PLANTILLAS, type Plantilla } from './plantillas';

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
  const etiquetas: Etiqueta[] = [
    { nombre: 'sec:CAP2_IA', ruta: 'Cap2.tex', linea: 15, clase: 'seccion', titulo: 'Inteligencia Artificial', numero: '2.1' },
    { nombre: 'sec:CAP2_AA', ruta: 'Cap2.tex', linea: 17, clase: 'seccion', titulo: 'Aprendizaje Automático', numero: '2.2' },
  ];
  const objeto = (nombre: string, clase: Etiqueta['clase'], numero: string | null): Etiqueta =>
    ({ nombre, ruta: 'Cap2.tex', linea: 20, clase, titulo: '', numero });

  it('busca en el nombre de la etiqueta y en el título, sin tildes ni mayúsculas', () => {
    expect(filtrarEtiquetas(etiquetas, '').map((e) => e.nombre)).toEqual(['sec:CAP2_IA', 'sec:CAP2_AA']);
    expect(filtrarEtiquetas(etiquetas, 'automatico').map((e) => e.nombre)).toEqual(['sec:CAP2_AA']);
    expect(filtrarEtiquetas(etiquetas, 'cap2_ia').map((e) => e.nombre)).toEqual(['sec:CAP2_IA']);
    expect(filtrarEtiquetas(etiquetas, '2.2').map((e) => e.nombre)).toEqual(['sec:CAP2_AA']);
  });

  it('describe cada etiqueta por lo que nombra', () => {
    expect(describirEtiqueta(etiquetas[0])).toBe('2.1 Inteligencia Artificial');
    expect(describirEtiqueta(objeto('fig:a', 'figura', '2.1'))).toBe('Figura 2.1');
    expect(describirEtiqueta(objeto('tab:a', 'tabla', '2.3'))).toBe('Tabla 2.3');
    expect(describirEtiqueta(objeto('eq:a', 'ecuacion', '2.2'))).toBe('Ecuación 2.2');
    expect(describirEtiqueta(objeto('fig:b', 'figura', null))).toBe('');
  });

  it('encuentra una figura buscando por su clase y número', () => {
    const todas = [...etiquetas, objeto('fig:a', 'figura', '2.1'), objeto('eq:a', 'ecuacion', '2.2')];
    expect(filtrarEtiquetas(todas, 'figura 2').map((e) => e.nombre)).toEqual(['fig:a']);
    expect(filtrarEtiquetas(todas, 'ecuacion').map((e) => e.nombre)).toEqual(['eq:a']);
  });
});

describe('PLANTILLAS', () => {
  const conTexto = PLANTILLAS.filter((p): p is Plantilla & { texto: string } => 'texto' in p);
  const plantilla = (id: string) => conTexto.find((p) => p.id === id)!;

  it('la plantilla de tabla termina sus filas con dos barras invertidas', () => {
    const texto = expandir(plantilla('tabla').texto);
    expect(texto).toContain('Columna 1 & Columna 2 \\\\\n');
    expect(texto).toContain('dato & dato \\\\\n');
    expect(texto).not.toContain('\\\\\\');
  });

  it('las plantillas con campos quedan con su texto de ejemplo y sin marcas de snippet', () => {
    expect(expandir(plantilla('seccion').texto)).toBe('\\section{Título}\n\n');
    expect(expandir(plantilla('ecuacion').texto)).toBe('\\begin{equation}\n  a = b\n  \\label{eq:nombre}\n\\end{equation}\n');
    expect(expandir(plantilla('referencia').texto)).toBe('\\ref{}');
    expect(expandir(plantilla('codigo').texto)).toBe(
      '\\begin{lstlisting}[language=Python, caption={Descripción}, label={lst:nombre}]\n\n\\end{lstlisting}\n');
    for (const p of conTexto) expect(expandir(p.texto), p.id).not.toMatch(/\$\{|#\{/);
  });

  // La figura y la cita no traen un texto a completar: abren el selector de imágenes y el buscador.
  it('las plantillas que abren un diálogo en vez de insertar un texto son la figura y la cita', () => {
    expect(PLANTILLAS.filter((p) => !('texto' in p))).toEqual([
      { id: 'figura', nombre: 'Figura', paquete: 'graphicx', accion: 'elegir-imagen' },
      { id: 'cita', nombre: 'Cita', accion: 'buscar-cita' },
    ]);
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
    for (const p of conTexto) expect(() => analizar(expandir(p.texto)), p.id).not.toThrow();
    expect(analizar(expandir(plantilla('lista').texto)).map((e) => e.tipo)).toEqual(['inicioLista', 'item', 'finLista']);
    expect(analizar(expandir(plantilla('ecuacion').texto)).map((e) => e.tipo)).toEqual(['matematica', 'etiqueta']);
    expect(analizar(expandir(plantilla('codigo').texto)).map((e) => e.tipo)).toEqual(['entorno']);
  });
});

// El botón Insertar de la barra: la plantilla no reemplaza una "/" escrita, va donde corresponde.
describe('colocarPlantilla', () => {
  const plantilla = (id: string) => PLANTILLAS.find((p): p is Plantilla & { texto: string } => p.id === id && 'texto' in p)!;
  const colocar = (doc: string, cursor: number, id: string) => {
    const destino = {
      state: EditorState.create({ doc, selection: { anchor: cursor } }),
      dispatch(tr: Transaction) { this.state = tr.state; },
    };
    colocarPlantilla(destino, plantilla(id));
    return { texto: destino.state.doc.toString(), seleccion: destino.state.sliceDoc(destino.state.selection.main.from, destino.state.selection.main.to) };
  };
  const tabla = expandir(plantilla('tabla').texto);

  it('un bloque va en su propia línea, debajo de la del cursor', () => {
    expect(colocar('Hola\nmundo', 2, 'tabla')).toEqual({ texto: `Hola\n${tabla}mundo`, seleccion: 'Descripción de la tabla' });
  });

  it('una línea vacía se reemplaza, y al final del archivo se agrega un salto', () => {
    expect(colocar('a\n\nb', 2, 'tabla').texto).toBe(`a\n${tabla}\nb`);
    expect(colocar('uno', 3, 'tabla').texto).toBe(`uno\n${tabla}`);
    expect(colocar('', 0, 'ecuacion').texto).toBe(expandir(plantilla('ecuacion').texto));
  });

  it('con el cursor dentro de otro bloque, va después de ese bloque', () => {
    const ecuacion = '\\begin{equation}\n  a = b\n\\end{equation}\nfin';
    expect(colocar(ecuacion, 20, 'tabla').texto).toBe(ecuacion.replace('fin', `${tabla}fin`));
  });

  it('una plantilla que no termina en salto queda separada de lo que sigue', () => {
    expect(colocar('uno\ndos', 1, 'seccion').texto).toBe('uno\n\\section{Título}\n\n\ndos');
  });

  it('la sangría de la línea siguiente no se le pega al bloque', () => {
    expect(colocar('uno\n    dos', 1, 'tabla').texto).toBe(`uno\n${tabla}    dos`);
  });

  it('una referencia va donde está el cursor', () => {
    expect(colocar('ver  acá', 4, 'referencia').texto).toBe('ver \\ref{} acá');
    expect(PLANTILLAS.filter((p) => p.enLinea).map((p) => p.id)).toEqual(['referencia']);
  });

  // La cita no trae texto: abre el buscador, que la pone donde está el cursor.
  it('la cita y la figura son las plantillas que no insertan un texto', () => {
    expect(PLANTILLAS.filter((p) => !('texto' in p)).map((p) => p.id)).toEqual(['figura', 'cita']);
  });
});
