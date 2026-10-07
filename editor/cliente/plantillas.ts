// Plantillas del menú "/". El texto usa la sintaxis de snippet de CodeMirror:
// ${1:ejemplo} es un campo a completar y Tab pasa al siguiente.
// Una plantilla inserta su texto, o bien abre el selector de imágenes y arma la figura con la elegida.
export type Plantilla = { id: string; nombre: string; paquete?: string; configuracion?: string }
  & ({ texto: string } | { accion: 'elegir-imagen' | 'buscar-cita' });

// listings no acepta tildes ni eñes con pdflatex salvo que se le enseñe cada una.
export const CONFIG_LISTINGS = [
  '\\lstset{basicstyle=\\ttfamily\\small, breaklines=true, frame=single, extendedchars=true,',
  "  literate={á}{{\\'a}}1 {é}{{\\'e}}1 {í}{{\\'i}}1 {ó}{{\\'o}}1 {ú}{{\\'u}}1 {ñ}{{\\~n}}1",
  "           {Á}{{\\'A}}1 {É}{{\\'E}}1 {Í}{{\\'I}}1 {Ó}{{\\'O}}1 {Ú}{{\\'U}}1 {Ñ}{{\\~N}}1 {ü}{{\\\"u}}1 {¿}{{?`}}1 {¡}{{!`}}1}",
].join('\n');

export const PLANTILLAS: Plantilla[] = [
  { id: 'seccion', nombre: 'Sección', texto: '\\section{${1:Título}}\n\n${}' },
  { id: 'subseccion', nombre: 'Subsección', texto: '\\subsection{${1:Título}}\n\n${}' },
  { id: 'lista', nombre: 'Lista', texto: '\\begin{itemize}\n  \\item ${}\n\\end{itemize}\n' },
  { id: 'listaNumerada', nombre: 'Lista numerada', texto: '\\begin{enumerate}\n  \\item ${}\n\\end{enumerate}\n' },
  { id: 'figura', nombre: 'Figura', paquete: 'graphicx', accion: 'elegir-imagen' },
  {
    id: 'tabla', nombre: 'Tabla', paquete: 'booktabs',
    texto: '\\begin{table}[htbp]\n  \\centering\n  \\caption{${1:Descripción de la tabla}}\n  \\label{tab:${2:nombre}}\n'
      + '  \\begin{tabular}{ll}\n    \\toprule\n    ${3:Columna 1} & ${4:Columna 2} \\\\\n    \\midrule\n'
      + '    ${5:dato} & ${6:dato} \\\\\n    \\bottomrule\n  \\end{tabular}\n\\end{table}\n',
  },
  {
    id: 'ecuacion', nombre: 'Ecuación', paquete: 'amsmath',
    texto: '\\begin{equation}\n  ${1:a = b}\n  \\label{eq:${2:nombre}}\n\\end{equation}\n',
  },
  { id: 'cita', nombre: 'Cita', accion: 'buscar-cita' },
  {
    id: 'codigo', nombre: 'Bloque de código', paquete: 'listings', configuracion: CONFIG_LISTINGS,
    texto: '\\begin{lstlisting}[language=${1:Python}, caption={${2:Descripción}}, label={lst:${3:nombre}}]\n${4}\n\\end{lstlisting}\n',
  },
  { id: 'referencia', nombre: 'Referencia cruzada', texto: '\\ref{${}}' },
];
