// Prompts para pegar en un modelo de lenguaje. El editor no llama a ninguna IA: arma el pedido
// y lo copia; lo que el modelo responda lo pega quien escribe.

export type AccionDeIa = 'desarrollar' | 'estilo' | 'consistencia';

export interface DatosDePrompt {
  accion: AccionDeIa;
  // Títulos que contienen el texto, del más general al más particular: "2 Antecedentes", "2.1 …".
  ubicacion: string[];
  guia: string;
  texto: string;
}

export const INICIO_DEL_TEXTO = '===== INICIO DEL TEXTO =====';
export const FIN_DEL_TEXTO = '===== FIN DEL TEXTO =====';

const R = String.raw;

const PRESENTACION = 'Estoy escribiendo, en LaTeX y en español, el informe de un proyecto de grado de Ingeniería en Computación. Necesito tu ayuda con una parte.';

// Sin esto un modelo completa lo que no sabe con algo verosímil, y en un informe eso es un dato falso.
const NO_INVENTAR = 'No inventes datos, cifras, resultados, ejemplos ni citas. Donde haga falta algo que el texto no trae, escribí [FALTA: qué falta] en ese lugar y seguí.';

const REGLAS_DE_LATEX = [
  R`Conservá tal cual los comandos que ya están en el texto: \cite{…}, \ref{…}, \label{…}, las fórmulas y los entornos. No agregues \cite ni \ref nuevos: no conocés las claves.`,
  R`No agregues títulos, paquetes ni comandos nuevos. Para destacar algo alcanzan \textit{…} y \textbf{…}.`,
  R`Escapá los caracteres especiales de LaTeX que escribas en la prosa: \%, \&, \_, \#.`,
  'Separá los párrafos con una línea en blanco.',
  // Un chat dibuja lo que no está en un bloque de código, y al copiarlo se pierden barras y fórmulas.
  'Devolvé el resultado en un único bloque de código que tenga solo el LaTeX, para que pueda copiarlo tal cual.',
];

const ACCIONES: Record<AccionDeIa, { tarea: string; reglas: string[] }> = {
  desarrollar: {
    tarea: [
      'Abajo van mis notas para esta parte del informe. Son apuntes sueltos, sin redactar, y pueden estar mezclados con texto ya escrito.',
      'Convertilas en prosa académica lista para el informe. Desarrollá cada idea de las notas, en el orden que mejor se lea, y conservá el texto que ya esté redactado.',
    ].join(' '),
    reglas: [
      'Trabajá solo con las ideas de las notas: no agregues temas que no estén en ellas.',
      NO_INVENTAR,
      'Si una nota es una duda o una pregunta mía y no contenido, no la redactes: dejala donde está como [FALTA: …].',
      ...REGLAS_DE_LATEX,
    ],
  },
  estilo: {
    tarea: [
      'Abajo va un fragmento ya redactado. Mejorá la redacción sin cambiar lo que dice:',
      'registro académico, claridad, concordancia, puntuación, ortografía, y la persona y el tiempo verbal que indica la guía.',
    ].join(' '),
    reglas: [
      'No agregues ni quites información. Una oración que ya está bien queda como está.',
      NO_INVENTAR,
      ...REGLAS_DE_LATEX,
      'Después del bloque, listá en pocas líneas los cambios que no sean triviales y por qué los hiciste.',
    ],
  },
  consistencia: {
    tarea: 'Abajo va un capítulo entero del informe. No lo reescribas. Leelo completo y buscá problemas de consistencia.',
    reglas: [
      'Buscá: un mismo concepto nombrado de dos formas; cambios de persona o de tiempo verbal respecto de la guía; siglas o conceptos que se usan sin haberlos definido; afirmaciones que se contradicen; anuncios de algo que después no aparece; y texto de relleno o de plantilla que quedó sin reemplazar.',
      'Devolvé una lista ordenada de lo más importante a lo menos. Para cada problema: una cita textual breve del lugar, qué pasa y cómo lo arreglarías.',
      'No corrijas la ortografía ni propongas mejoras de redacción: de eso se ocupa otra revisión.',
      'Si de alguna clase no encontrás problemas, no la menciones.',
    ],
  },
};

const sinBlancosEnLosBordes = (texto: string) => texto.replace(/^\s*\n/, '').trimEnd();

export function armarPrompt(d: DatosDePrompt): string {
  const { tarea, reglas } = ACCIONES[d.accion];
  const apartados = [
    PRESENTACION,
    `## Tarea\n\n${tarea}`,
    d.ubicacion.length > 0 && `## Dónde va este texto\n\n${d.ubicacion.map((titulo) => `- ${titulo}`).join('\n')}`,
    `## Guía de estilo\n\n${d.guia.trim()}`,
    `## Reglas\n\n${reglas.map((regla) => `- ${regla}`).join('\n')}`,
    `## Texto\n\n${INICIO_DEL_TEXTO}\n${sinBlancosEnLosBordes(d.texto)}\n${FIN_DEL_TEXTO}`,
  ];
  return `${apartados.filter(Boolean).join('\n\n')}\n`;
}

// La guía con la que arranca el editor. Quien escribe la corrige desde "Guía de estilo…".
export const GUIA_INICIAL = R`# Guía de estilo del informe

## De qué trata

Informe de proyecto de grado de Ingeniería en Computación (Facultad de Ingeniería, UdelaR): "Análisis de tópicos en sitios con participación uruguaya".

Estudia cómo identificar los temas de los que se habla en mensajes de redes sociales de Uruguay, que son textos cortos y con lenguaje ruidoso. Compara combinaciones de preprocesamiento y distintos modelos de tópicos (LDA, BERTopic, BTM, entre otros).

## Voz

- Primera persona del plural: "exploramos", "proponemos". Nunca "yo".
- Registro académico, sobrio y directo. Sin coloquialismos ni voseo.
- Sin adjetivos de venta: "novedoso", "potente", "revolucionario".
- Oraciones cortas. Un párrafo, una idea.

## Tiempos verbales

- Presente para lo que el informe dice y para hechos generales: "en este capítulo presentamos", "LDA modela cada documento como una mezcla de tópicos".
- Pretérito para lo que hicimos: "entrenamos", "evaluamos".

## Términos

- "tópico" para lo que devuelve un modelo; no "tema" ni "topic".
- "Procesamiento de Lenguaje Natural (PLN)" la primera vez; después, "PLN".
- "Aprendizaje Automático"; no "machine learning".
- Modelos: LDA, BERTopic, BTM.
- Términos en inglés sin traducción habitual, en cursiva: \textit{embeddings}.
- Toda sigla se define la primera vez que aparece.
`;
