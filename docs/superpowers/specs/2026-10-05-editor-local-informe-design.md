# Editor local para el informe de proyecto de grado

Fecha: 2026-10-05
Estado: diseño aprobado en conversación, pendiente de revisión escrita

## 1. Propósito

Cristhian escribe, junto a dos compañeros y dos supervisores, el informe
"Análisis de tópicos en sitios con participación uruguaya" en un proyecto
compartido de Overleaf. Maneja LaTeX básico pero no avanzado, y escribir en
Overleaf le resulta incómodo.

El objetivo es una aplicación local que le permita:

1. Escribir la prosa sin ver LaTeX crudo ni recordar sintaxis.
2. Tener corrección automática de tipeo, y ortografía y gramática en español.
3. Pedir a la IA revisión de estilo académico y generación de bloques
   (tablas, ecuaciones), usando su suscripción de Claude.
4. Seguir colaborando con el resto del equipo, que edita en Overleaf.

Éxito: Cristhian puede escribir un capítulo completo en el editor, enviarlo a
Overleaf, y sus compañeros ven únicamente los cambios que él hizo.

## 2. Restricciones y hechos verificados

- Overleaf es la fuente de verdad compartida. Los archivos `.tex` no se
  convierten a ningún otro formato.
- El dueño del proyecto es premium. La integración Git funciona con la cuenta
  de Cristhian: el clon en `informe/` (rama `main`) ya existe.
- El equipo no edita al mismo tiempo, por lo que los conflictos serán raros.
- Los comentarios y el control de cambios de Overleaf no viajan por Git. Se
  siguen leyendo en la web de Overleaf.
- Plantilla: `prgrado.cls` (InCo, FIng, UdelaR) sobre `book`. Compila con
  `pdflatex`, usa `babel` español, `hyperref`, `graphicx`, `apacite` y BibTeX.
- Estructura: `main.tex` incluye `Cap1.tex` a `Cap6.tex` con `\include`;
  bibliografía en `referencias.bib`; imágenes en `figs/`.
- Git en Windows tiene `core.autocrlf=true`: en disco los archivos tienen CRLF
  y en el repositorio LF.
- Instalado: Git 2.54, Node 24, Java, VS Code. No instalado: distribución
  LaTeX, CLI de Claude Code.
- Las credenciales (token de Overleaf, sesión de Claude) las ingresa siempre
  Cristhian. La aplicación no las guarda ni las lee.

## 3. Decisión central

El documento que el editor tiene en memoria es siempre el texto literal del
archivo `.tex`. La presentación amigable se logra solo con decoraciones
visuales sobre ese texto (CodeMirror 6): `\section{X}` se dibuja como título,
`\textbf{x}` como negrita, y así. Es la técnica del Visual Editor de Overleaf.

De esto se desprende el invariante del proyecto:

> **Invariante de fidelidad.** Abrir un archivo y guardarlo sin editar produce
> exactamente los mismos bytes. Una edición cambia solo los caracteres que el
> usuario tocó.

Todo comando o entorno que el editor no reconozca se muestra como código, sin
modificarse.

## 4. Estructura de carpetas

```
Tesis/
├── informe/    clon Git del proyecto de Overleaf (solo contenido del informe)
├── editor/     la aplicación
├── build/      salida de compilación LaTeX (PDF, .aux, .log)
└── docs/       esta especificación y los planes
```

`Tesis/` será un repositorio Git local para `editor/` y `docs/`, con
`informe/` y `build/` ignorados. `informe/` conserva su propio repositorio,
cuyo único remoto es Overleaf. Nada de `editor/`, `build/` ni `docs/` llega a
Overleaf.

## 5. Etapas

Cada etapa es usable por sí sola y tiene su propio plan de implementación.

| Etapa | Contenido | Detalle |
|---|---|---|
| 1 | Base y editor de prosa | Sección 6 (detallada) |
| 2 | Corrección | Sección 7 (resumen) |
| 3 | IA | Sección 8 (resumen) |
| 4 | Bloques visuales | Sección 9 (resumen) |

Esta especificación detalla la etapa 1. Las etapas 2 a 4 quedan resumidas con
las decisiones ya tomadas; cada una recibirá su especificación detallada
antes de construirse.

## 6. Etapa 1: base y editor de prosa

### 6.1 Arquitectura

Aplicación web local en TypeScript:

- **Servidor** (Node): escucha solo en `127.0.0.1`. Lee y escribe archivos de
  `informe/`, ejecuta Git, compila el PDF.
- **Cliente** (navegador, Vite + CodeMirror 6): la interfaz.

Se inicia con un acceso directo en el escritorio (sección 6.7) o, para
desarrollo, con `npm start` dentro de `editor/`.

Configuración en `editor/config.json`: ruta de `informe/`, ruta de `build/`,
nombre del archivo principal (`main.tex`), puerto, y si compila al guardar.

### 6.2 Unidades del servidor

Cada unidad tiene una responsabilidad y se prueba de forma aislada.

**`archivos`** — Lee y escribe archivos del informe.
- Solo opera dentro de `informe/`; rechaza rutas que salgan de ahí.
- Al leer, detecta el fin de línea del archivo (CRLF o LF) y lo devuelve junto
  al contenido. Al escribir, usa ese mismo fin de línea. UTF-8 sin BOM.
- Antes de escribir, comprueba que el archivo en disco no cambió desde la
  última lectura o escritura. Si cambió (por un Traer o por VS Code), no
  sobrescribe y devuelve un aviso para que el cliente recargue.

**`proyecto`** — Describe el informe.
- Lee `main.tex` y obtiene, en orden, los archivos incluidos con `\include` o
  `\input`.
- Para cada archivo devuelve su título (primer `\chapter{...}`) y si está
  numerado según su posición respecto de `\frontmatter`, `\mainmatter`,
  `\backmatter` y `appendix`.
- Construye un índice de etiquetas: para cada `\label{...}`, el archivo, la
  línea y el título de la sección a la que pertenece.

**`git`** — Sincroniza con Overleaf. Operaciones:
- `estado`: cambios locales sin enviar; commits remotos sin traer.
- `traer`: si hay cambios locales, hace commit; luego `fetch` y `merge` de
  `origin/main`.
- `enviar`: ejecuta `traer` y, si terminó limpio, `push`. Si el push se
  rechaza porque entró un cambio en el medio, repite una vez.
- `terminarCombinacion`: comprueba que no queden marcas de conflicto en los
  archivos y cierra la combinación con un commit.
- `cancelarCombinacion`: `merge --abort`.
- `preparar`: agrega a `informe/.git/info/exclude` (ignorados locales, que no
  viajan a Overleaf) los archivos temporales de LaTeX, para que una
  compilación hecha dentro de `informe/` con otra herramienta nunca termine
  enviada al equipo.
- Mensaje de commit: `Edición desde el editor local, <fecha y hora>`.
- Nunca usa `--force`, ni `rebase`, ni toca la configuración de credenciales.

**`compilar`** — Genera el PDF.
- Ejecuta `pdflatex`, `bibtex` cuando hace falta, y `pdflatex` de nuevo hasta
  resolver referencias, con la salida en `build/`.
- Interpreta el log y devuelve una lista de errores y advertencias con
  archivo, línea y mensaje en español cuando el error es de los comunes
  (comando desconocido, llave sin cerrar, referencia o cita inexistente,
  archivo de imagen no encontrado). El resto se muestra con el mensaje
  original.
- Una sola compilación a la vez; un pedido nuevo durante una compilación en
  curso se encola, sin acumular más de uno.

Requiere instalar MiKTeX con instalación automática de paquetes. La instalación
es un paso del plan que Cristhian aprueba.

### 6.3 Unidades del cliente

**`analizador`** — Función pura: recibe el texto de un archivo y devuelve la
lista de elementos reconocidos con sus posiciones. Reconoce:
- Títulos: `\chapter`, `\section`, `\subsection`, `\subsubsection`, con y sin
  asterisco.
- Formato en línea: `\textbf`, `\textit`, `\emph`, `\texttt`.
- Listas: entornos `itemize` y `enumerate`, y sus `\item`.
- Referencias: `\ref`, `\label`, y la familia `\cite` de `apacite`.
- Comentarios `%`.
- El preámbulo de `main.tex` (todo lo anterior a `\begin{document}`).

Respeta llaves anidadas y caracteres escapados. Lo que no reconoce no aparece
en la lista y por lo tanto se muestra como código.

**`vista`** — Convierte la lista del analizador en decoraciones de CodeMirror:
- Títulos con tamaño según nivel y número calculado: el número de capítulo
  viene de `proyecto`, y los de sección se cuentan dentro del archivo. El
  número es orientativo; la referencia es el PDF.
- Negrita, cursiva y monoespaciado aplicados; las marcas LaTeX ocultas.
- `\item` como viñeta o número; líneas `\begin` y `\end` de listas atenuadas.
- `\ref{etiqueta}` como etiqueta con el número y título de la sección
  destino, o en rojo si la etiqueta no existe.
- `\cite{clave}` como etiqueta con la clave.
- `\label{...}` y comentarios, atenuados.
- Preámbulo de `main.tex` plegado por defecto.
- Cuando el cursor está dentro de un elemento, ese elemento muestra su LaTeX
  original para poder editarlo.

**`comandos`** — Acciones de edición, todas como inserciones de texto LaTeX:
- Ctrl+B, Ctrl+I: envuelven la selección en `\textbf{}` o `\textit{}`, o la
  desenvuelven si ya lo está.
- Selector de nivel de título para la línea actual.
- Menú `/` al inicio de una línea: Sección, Subsección, Lista, Lista numerada,
  Figura, Tabla, Ecuación, Cita, Bloque de código, Referencia cruzada. Cada
  opción inserta una plantilla correcta con el cursor en el primer campo a
  completar. "Referencia cruzada" ofrece las etiquetas del índice.
- Si la plantilla necesita un paquete que `main.tex` no carga (`amsmath` para
  Ecuación, `booktabs` para Tabla, `listings` para Bloque de código), pide
  confirmación y agrega el `\usepackage` al preámbulo de `main.tex`. Nunca
  modifica `prgrado.cls`.

**`pantalla`** — Distribución en tres zonas, según la maqueta aprobada:
- Izquierda: capítulos por título, en el orden de `main.tex`, más
  "Referencias" (`referencias.bib`, editado como texto plano en esta etapa).
  Debajo, el índice de secciones del archivo abierto; clic para saltar.
- Centro: el editor.
- Derecha: PDF (visor del navegador) y lista de errores de compilación; clic
  en un error lleva a la línea.
- Barra superior: estado de guardado, botón Compilar, botones Traer y Enviar,
  y aviso cuando hay cambios nuevos en Overleaf.

### 6.4 Flujos

**Guardado.** Un segundo después de la última tecla, el cliente envía el
archivo al servidor. La barra muestra "Guardando" y luego "Guardado". Al
cambiar de archivo o cerrar la pestaña se guarda de inmediato.

**Traer.** Guarda lo pendiente, ejecuta `traer`, recarga el archivo abierto y
la lista de capítulos. Informa cuántos archivos cambiaron.

**Enviar.** Guarda lo pendiente, ejecuta `enviar`. Informa el resultado.

**Aviso de cambios remotos.** Cada cinco minutos el servidor hace `fetch`. Si
`origin/main` tiene commits nuevos, la barra muestra "Hay cambios nuevos en
Overleaf". No modifica archivos.

**Conflicto.** Si el `merge` no puede combinar, el editor bloquea la edición y
muestra qué archivos chocaron, con tres botones: "Resolver en VS Code" (abre
`informe/` en VS Code, que tiene herramienta de resolución), "Ya lo resolví"
(ejecuta `terminarCombinacion`; si quedan marcas de conflicto, dice en qué
archivos) y "Cancelar la combinación" (vuelve al estado anterior al Traer,
con el trabajo local intacto). El editor se desbloquea cuando Git informa que
no hay combinación en curso.

**Compilar.** A pedido con el botón. Opcionalmente al guardar, apagado por
defecto.

### 6.5 Manejo de errores

| Situación | Comportamiento |
|---|---|
| Git no puede autenticarse | Mensaje indicando ejecutar `git pull` en una terminal dentro de `informe/` para reingresar el token. El editor no pide el token. |
| Sin conexión | Traer y Enviar informan que no hay conexión. Escribir y compilar siguen funcionando. |
| Overleaf rechaza el push | Se muestra el mensaje de Overleaf tal cual. Los cambios quedan guardados localmente. |
| Archivo cambió en disco | No se sobrescribe. Sin ediciones pendientes, se recarga solo. Con ediciones pendientes, se pregunta: recargar la versión del disco, o conservar la del editor y sobrescribir. |
| MiKTeX no instalado | El panel de PDF explica cómo instalarlo. El resto del editor funciona. |
| Error de compilación | Lista de errores; se mantiene visible el último PDF correcto. |
| `main.tex` sin `\include` reconocibles | La lista lateral muestra todos los `.tex` por nombre de archivo. |

### 6.6 Pruebas

Automáticas (Vitest):
- **Fidelidad:** para cada archivo de `informe/`, leer y escribir sin editar
  da bytes idénticos. Se repite con archivos de prueba en CRLF, LF, sin salto
  final y con espacios al final de línea.
- **Analizador:** cada construcción reconocida; llaves anidadas; comandos
  dentro de comandos; comentarios con `%` escapado; entrada mal formada sin
  fallar.
- **Proyecto:** orden y títulos sobre una copia de `main.tex`; índice de
  etiquetas sobre `Cap2.tex`.
- **Git:** contra un repositorio remoto local temporal que simula Overleaf.
  Casos: traer sin cambios, traer con cambios en otro archivo, enviar, enviar
  con remoto adelantado, conflicto y cancelación.
- **Compilar:** interpretación de logs de ejemplo con cada tipo de error.
- **Comandos:** plantillas insertadas; alta de paquete en el preámbulo sin
  alterar el resto de `main.tex`.

Manual, antes de dar la etapa por terminada:
- Editar un párrafo, Enviar, y verificar en Overleaf que el historial muestra
  solo ese cambio.
- Editar en Overleaf, Traer, y verificar que aparece en el editor.
- Compilar y comparar el PDF local con el de Overleaf.

### 6.7 Puesta en marcha

**Acceso directo.** Un ícono "Editor del informe" en el escritorio de Windows,
que también se puede anclar a la barra de tareas. Al abrirlo:
- Si el editor ya está corriendo, abre el navegador en él.
- Si no, levanta el servidor sin mostrar ventana de consola y abre el
  navegador cuando está listo.

Nunca hay más de una instancia. El servidor se cierra solo diez minutos
después de que se cerró la última pestaña del editor, para no dejar procesos
colgados.

El acceso directo lo crea el comando `npm run acceso-directo`, que forma parte
de la instalación. Si falla el arranque (por ejemplo, falta Node), el
lanzador muestra una ventana con el motivo en lugar de no hacer nada.

**Guía de instalación.** `editor/INSTALACION.md`, en español, escrita para
seguirse en una máquina con Windows desde cero, de modo que sirva también a un
compañero. Contenido:

1. Requisitos y cómo comprobar cada uno: Git, Node, MiKTeX.
2. Generar el token en Overleaf y clonar el proyecto en `informe/`. Incluye la
   advertencia de no compartir el token y qué hacer ante un error 403.
3. Instalar la aplicación (`npm install`) y crear el acceso directo.
4. Primer uso: abrir, escribir, Traer, Enviar, Compilar.
5. Opciones de `config.json`.
6. Problemas frecuentes: autenticación de Git, MiKTeX pidiendo paquetes,
   puerto ocupado, conflicto al Traer.
7. Cómo seguir trabajando en VS Code si el editor no arranca.

La guía se amplía en cada etapa con lo que esa etapa agrega (LanguageTool en
la 2, CLI de Claude Code en la 3).

Verificación: la etapa 1 se da por terminada solo si los pasos de la guía,
seguidos tal cual, dejan el editor funcionando.

### 6.8 Fuera de alcance de la etapa 1

Corrección ortográfica propia (se activa el corrector nativo del navegador en
español como paliativo), IA, vista renderizada de ecuaciones, tablas, figuras
y código, buscador de bibliografía, sincronización entre posición del PDF y
del texto.

## 7. Etapa 2: corrección (resumen)

- **Autocorrección al tipear.** Al terminar una palabra, si no está en el
  diccionario español y existe una única corrección inequívoca, se reemplaza:
  tilde faltante, letras invertidas, doble mayúscula inicial. Las palabras que
  existen con y sin tilde (`esta`, `calculo`) no se tocan. Lo corregido queda
  marcado brevemente; Ctrl+Z lo revierte, y revertir la misma palabra dos
  veces la agrega a excepciones. No actúa dentro de matemática, código,
  comandos ni claves de citas.
- **Ortografía y gramática.** LanguageTool ejecutándose localmente sobre Java.
  Se le envía solo la prosa, con las posiciones mapeadas al archivo original.
  Subrayado y sugerencias al hacer clic, y lista en el panel derecho.
- **Diccionario personal** en `editor/`, no viaja a Overleaf.

## 8. Etapa 3: IA (resumen)

- El servidor invoca el CLI de Claude Code con la suscripción de Cristhian.
- Ninguna acción escribe en los archivos sin aceptación explícita.
- **Revisar estilo:** sobre la selección; devuelve propuesta con comparación
  palabra por palabra y explicación; aceptar todo, por cambio, o descartar.
- **Pedir:** instrucción libre sobre la selección o en el cursor; resultado
  con vista previa antes de insertar.
- **Revisar consistencia:** sobre un capítulo o el informe; lista de hallazgos
  con enlace a la ubicación; no modifica nada.
- **Guía de estilo** en `editor/`: persona gramatical (primera del plural),
  tiempo verbal, términos preferidos. Se incluye en cada pedido.
- Funciona a demanda (5 a 20 segundos por pedido), no mientras se escribe.

## 9. Etapa 4: bloques visuales (resumen)

Vista renderizada, con edición de la fuente al hacer clic, para: ecuaciones
(KaTeX), figuras (miniatura y epígrafe, con selector de imágenes de `figs/`),
tablas, bloques de código, y citas con buscador sobre `referencias.bib` que
ofrece las formas parentética y textual de `apacite`.

## 10. Fuera de alcance del proyecto

Colaboración en tiempo real, comentarios y control de cambios de Overleaf,
edición de tablas tipo planilla, soporte para otros proyectos de Overleaf.
