% Clase LaTeX para Informes de Proyectos de Grado de Computación
% InCo, Facultad de Ingeniería, Universidad de la República
% 06/2023

\def\filename{prgrado}
\def\fileversion{2.1}
\def\filedate{08/06/2023}

\NeedsTeXFormat{LaTeX2e}

\ProvidesClass{prgrado}[\filedate\space\fileversion\space%
       Clase LaTeX Proyectos de Grado - InCo, FIng, UdelaR ]

\LoadClassWithOptions{book}



%paquetes

\RequirePackage[utf8]{inputenc} % para utilizar codificación utf8
\RequirePackage[spanish]{babel} % para documentos en español
\RequirePackage{hyperref}       % para seguir los hipervínculos
\RequirePackage{graphicx}       % para usar includegraphics
\RequirePackage{apacite}        % para citar en formato APA
\RequirePackage{ifthen}         % para comandos condicionales


%comandos

\newcommand{\keywords}[1]{\textbf{Palabras clave:} #1}
\newcommand{\supervisor}[1]{\def\@supervisor{#1}}
\newcommand{\cosupervisor}[1]{\def\@cosupervisor{#1}}
\newcommand{\cclicense}[2]{\def\@cclicense{#1} \def\@ccversion{#2}}

\supervisor{}
\cosupervisor{}
\cclicense{by-nc-nd}{4.0}

%cambio de nombres

\addto\captionsspanish{\renewcommand{\appendixname}{Anexo}} % Anexo en lugar de Apéndice
\addto\captionsspanish{\renewcommand{\tablename}{Tabla}} % Tabla en lugar de Cuadro


%carátula

\renewcommand{\maketitle}[0]{%
\thispagestyle{empty}

\begin{center}
\includegraphics[height=3cm]{figs/logo-udelar-fing.png} 
\end{center}

\vfill

\begin{center}
 \textbf{\Huge \@title }\\[1.5cm]
\end{center}

\begin{center}
Informe de Proyecto de Grado presentado por\\[1.0cm]

{\Large  \@author}\\[1.0cm]

en cumplimiento parcial de los requerimientos para la graduación de la carrera de Ingeniería en Computación de Facultad de Ingeniería de la Universidad de la República\\[1.5cm]

\ifthenelse{\equal{\@cosupervisor}{}}{Supervisor}{Supervisores}\\[0.5cm]
{\large  \@supervisor}\\
{\large  \ifthenelse{\equal{\@cosupervisor}{}}{}{\@cosupervisor}}
\end{center}

\vfill 

\begin{center}
Montevideo,  \@date
\end{center}
\makelicense
}

% licencia

\newcommand{\makelicense}[0]{%
\clearpage\null\vfill
\pagestyle{empty}

\begin{tabular}{l | l}
\begin{minipage}{0.28\textwidth}
\ifthenelse{\equal{\@cclicense}{by}}{\includegraphics{figs/cc/by.png}}
{\ifthenelse{\equal{\@cclicense}{by-sa}}{\includegraphics{figs/cc/by-sa.png}}
{\ifthenelse{\equal{\@cclicense}{by-nd}}{\includegraphics{figs/cc/by-nd.png}}
{\ifthenelse{\equal{\@cclicense}{by-nc}}{\includegraphics{figs/cc/by-nc.png}}
{\ifthenelse{\equal{\@cclicense}{by-nc-sa}}{\includegraphics{figs/cc/by-nc-sa.png}}
{\ifthenelse{\equal{\@cclicense}{by-nc-nd}}{\includegraphics{figs/cc/by-nc-nd.png}}{}}}}}}
\end{minipage}
&
\begin{minipage}{0.7\textwidth}
{\footnotesize \textbf{\@title}\ por \@author\ tiene licencia \href{https://creativecommons.org/licenses/\@cclicense/\@ccversion}{CC
\ifthenelse{\equal{\@cclicense}{by}}{Atribución}
{\ifthenelse{\equal{\@cclicense}{by-sa}}{Atribución - Compartir Igual}
{\ifthenelse{\equal{\@cclicense}{by-nd}}{Atribución - Sin Derivadas}
{\ifthenelse{\equal{\@cclicense}{by-nc}}{Atribución - No Comercial}
{\ifthenelse{\equal{\@cclicense}{by-nc-sa}}{Atribución - No Comercial - Compartir Igual }
{\ifthenelse{\equal{\@cclicense}{by-nc-nd}}{Atribución - No Comercial - Sin Derivadas}{}}}}}} \@ccversion}.} 
\end{minipage}
\end{tabular}
}
