# Editor local del informe, etapa 4, entrega 1: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el editor dibuje ecuaciones (con vista previa al editarlas), figuras (con selector y subida de imágenes) y bloques de código, y que las referencias a figuras, tablas y ecuaciones muestren su número.

**Architecture:** El analizador compartido aprende matemática, entornos de bloque, `\includegraphics` y `\caption`. La vista pasa a ser un orquestador y cada clase de bloque vive en `cliente/bloques/`, devolviendo decoraciones de CodeMirror sobre el texto literal. El servidor suma una unidad de imágenes (servir, listar, subir a `figs/`). Nada de lo que se dibuja modifica el documento.

**Tech Stack:** el de las etapas anteriores (TypeScript, Node 24, Express 5, Vite, Vitest, CodeMirror 6) más `katex` ^0.19.0.

**Spec:** `docs/superpowers/specs/2026-10-06-editor-local-etapa-4-design.md` (secciones 3, 5, 8, 9 y 10). Leerla antes de empezar. Las entregas 2 (citas) y 3 (tablas) tienen su propio plan, que se escribe al terminar esta.

## Global Constraints

- **Invariante de fidelidad:** dibujar un bloque no modifica el documento. Una edición hecha a través de un bloque cambia solo los caracteres de esa parte.
- Todo bloque que el editor no entienda se sigue mostrando como código.
- `Tesis/informe/` es un documento compartido con otras cuatro personas. Las pruebas automáticas y manuales nunca escriben ahí ni contactan a Overleaf: usan `pruebas/fixtures/`, directorios temporales y `npm run entorno-prueba`.
- **El ícono del escritorio ejecuta lo que hay en `Tesis/editor/`.** Se trabaja en un worktree de Git aparte (rama `etapa-4-entrega-1`), no en esa carpeta. Si el editor de Cristhian está corriendo (puertos 4317 y 4319) no se lo mata: las pruebas manuales usan 4327 y 4329 con un `config.prueba.json`.
- Única dependencia nueva: `katex`. Sin framework de interfaz. KaTeX se empaqueta con Vite; nada se carga de internet.
- Nunca modificar `prgrado.cls`.
- Interfaz en español rioplatense (voseo), sin mayúsculas de título, sin signos de exclamación. Los textos entre comillas de este plan son copia exacta.
- Identificadores del código en español. Posiciones (`desde`, `hasta`) sobre el texto con saltos normalizados a `\n`, `hasta` exclusivo.
- Los elementos que devuelve `analizar` siguen ordenados por `desde`; lo que no cierra no se reporta.
- TDD en cada tarea. Un commit por tarea como mínimo, en español. `npm test` tarda unos 3 minutos; durante una tarea se corre solo el archivo de prueba que corresponde (`npx vitest run <archivo>`) y la suite completa al cerrar la tarea.
- Los heredocs largos de bash fallan en esta máquina: los scripts auxiliares se escriben como archivo y se ejecutan.

## Review Focus

1. **Un `$` suelto o de moneda.** "Cuesta $50" sin cerrar no debe tragarse el resto del documento: la matemática en línea no cruza una línea en blanco y lo que sigue se analiza normal. Prueba en la tarea 1.
2. **Una fórmula que KaTeX no soporta, vacía o enorme.** Dibujar nunca lanza una excepción: una que escape de un widget rompe toda la vista del editor. Prueba en la tarea 6.
3. **La etiqueta de una ecuación.** Que dentro de la matemática no se reporten elementos no puede hacer desaparecer su `\label` del índice: `\ref{eq:x}` se vería roto. Pruebas en las tareas 1 y 4.
4. **Un archivo que no es lo que dice su extensión, o un nombre problemático.** Una foto HEIC o WebP renombrada a `.png`, un archivo vacío, "Gráfico final (2).PNG", o `Foto.png` cuando ya existe `foto.png` (Windows no distingue mayúsculas): se rechaza con el motivo o se normaliza, y nunca se sobrescribe. Pruebas en la tarea 7.
5. **Una figura que no tiene la forma de la plantilla.** Dos imágenes, `subfigure`, texto suelto, un comentario: ocultar el "armado" escondería contenido que el usuario no podría ver ni editar. Se muestra como código. Prueba en la tarea 8.

## Estructura de archivos

```
editor/
├── compartido/
│   ├── analizador.ts        (modificar) matemática, entornos, imagen, epígrafe
│   ├── numeracion.ts        (modificar) numerarObjetos, objetoEn
│   ├── flotante.ts          (crear) partes de una figura y qué se oculta
│   └── tipos.ts             (modificar) Etiqueta.clase
├── servidor/
│   ├── archivos.ts          (modificar) exporta resolverEnInforme
│   ├── imagenes.ts          (crear) servir, listar y guardar imágenes
│   ├── proyecto.ts          (modificar) etiquetas con clase y número de objeto
│   ├── app.ts, index.ts     (modificar) rutas de imágenes y cableado
├── cliente/
│   ├── vista.ts             (modificar) orquestador
│   ├── bloques/
│   │   ├── tipos.ts         (crear) ContextoVista, Dibujo, Decorador
│   │   ├── codigo.ts        (crear)
│   │   ├── formula.ts       (crear) KaTeX: preparar y dibujar, puro
│   │   ├── ecuacion.ts      (crear)
│   │   └── figura.ts        (crear)
│   ├── imagenes.ts          (crear) subida con sus preguntas, arrastre
│   ├── pantalla/selectorImagen.ts (crear)
│   ├── comandos.ts          (modificar) cambiarRutaDeImagen, insertarFigura
│   ├── menuBarra.ts         (modificar) describirEtiqueta, Figura con selector
│   ├── api.ts, main.ts, estilos.css (modificar)
├── pruebas/
│   ├── ayudas/decoraciones.ts (crear) `decos`, movido desde vista.test.ts
│   └── fixtures/informe/Bloques.tex, figs/ejemplo.png (crear)
└── INSTALACION.md           (modificar)
```

Cada `X.ts` de `compartido/`, `servidor/` y `cliente/` lleva su `X.test.ts` al lado, como en el resto del proyecto.

---

### Task 1: Matemática en el analizador

**Files:**
- Modify: `editor/compartido/analizador.ts`
- Test: `editor/compartido/analizador.test.ts`

**Interfaces:**
- Produces: variante nueva de `Elemento`:
  `{ tipo: 'matematica'; enLinea: boolean; entorno: 'equation' | 'equation*' | 'align' | 'align*' | null; contenido: Rango } & Rango`.
  `contenido` es lo que va entre los delimitadores (`$`, `\(`, `\[`, `$$`) o entre `\begin{…}` y `\end{…}`.

- [ ] **Step 1: Escribir las pruebas que fallan**, en un `describe('matemática')`:

```ts
const mates = (t: string) => deTipo(analizar(t), 'matematica');

it('en línea con $', () => {
  expect(mates('sea $a+b$ fin')).toEqual([
    { tipo: 'matematica', enLinea: true, entorno: null, desde: 4, hasta: 9, contenido: { desde: 5, hasta: 8 } },
  ]);
});
it.each([
  ['\\(x\\)', true, null], ['\\[x\\]', false, null], ['$$x$$', false, null],
  ['\\begin{equation}x\\end{equation}', false, 'equation'], ['\\begin{equation*}x\\end{equation*}', false, 'equation*'],
  ['\\begin{align}x\\end{align}', false, 'align'], ['\\begin{align*}x\\end{align*}', false, 'align*'],
])('%s', (t, enLinea, entorno) => {
  const [e] = mates(t);
  expect(e).toMatchObject({ enLinea, entorno, desde: 0, hasta: t.length });
  expect(tramo(t, e.contenido)).toBe('x');
});
it('\\$ no abre ni cierra', () => {
  expect(mates('cuesta \\$5 y \\$8')).toEqual([]);
  expect(tramo('$a\\$b$', mates('$a\\$b$')[0].contenido)).toBe('a\\$b');
});
it('un $ suelto no cruza la línea en blanco ni afecta lo que sigue', () => {
  const es = analizar('cuesta $50\n\nOtro \\textbf{párrafo} con $x$');
  expect(es.map((e) => e.tipo)).toEqual(['formato', 'matematica']);
});
it('dentro de la matemática no se reporta formato', () => {
  expect(analizar('$a \\textbf{b}$').map((e) => e.tipo)).toEqual(['matematica']);
});
it('la etiqueta y los comentarios de una ecuación sí se reportan', () => {
  const t = '\\begin{equation}\n a = b % nota\n \\label{eq:e}\n\\end{equation}';
  expect(analizar(t).map((e) => e.tipo)).toEqual(['matematica', 'comentario', 'etiqueta']);
});
it('no hay matemática en comentarios ni en texto literal', () => {
  expect(mates('% $x$\n\\verb|$y$|\n\\begin{verbatim}\n$z$\n\\end{verbatim}')).toEqual([]);
});
it('una ecuación sin cerrar no se reporta y lo que sigue sí', () => {
  expect(analizar('\\begin{equation}\na\n\n\\section{S}').map((e) => e.tipo)).toEqual(['titulo']);
});
```

- [ ] **Step 2: Correr y ver que fallan.** `npx vitest run compartido/analizador.test.ts` → fallan las nuevas, pasan las anteriores.
- [ ] **Step 3: Implementar en `analizar`.** Dentro de un tramo de matemática solo siguen activas las ramas de comentario y de `\label`; el resto de los comandos se saltea. `$…$` y `\(…\)` no se reportan si antes del cierre aparece una línea en blanco (`\n` seguido de blancos y otro `\n`).
- [ ] **Step 4: Correr y ver que pasan** todas las de `analizador.test.ts`.
- [ ] **Step 5: Commit.** `git commit -m "Analizador: matemática en línea y en bloque"`

### Task 2: Entornos de bloque, imagen y epígrafe en el analizador

**Files:**
- Modify: `editor/compartido/analizador.ts`
- Test: `editor/compartido/analizador.test.ts`
- Create: `editor/pruebas/fixtures/informe/Bloques.tex`

**Interfaces:**
- Produces: tres variantes de `Elemento`:
  - `{ tipo: 'entorno'; nombre: 'figure' | 'table' | 'tabular' | 'lstlisting' | 'verbatim'; interior: Rango } & Rango` — `figure*`, `table*` y `verbatim*` se reportan con el nombre sin asterisco. `interior` va desde el fin de `\begin{nombre}` hasta el comienzo de `\end{nombre}`.
  - `{ tipo: 'imagen'; ruta: string; rutaRango: Rango } & Rango` — `\includegraphics[opciones]{ruta}`; `ruta` sin espacios en los bordes; `rutaRango` es el interior de las llaves.
  - `{ tipo: 'epigrafe'; contenido: Rango } & Rango` — `\caption[corto]{…}`.
- `Bloques.tex` no se incluye desde `main.tex` del fixture: así las pruebas de `proyecto` no cambian, y las que recorren todos los fixtures (`prosa.test.ts`, `vista.test.ts`, fidelidad) lo cubren solas.

- [ ] **Step 1: Crear `Bloques.tex`** con, en este orden: `\chapter{Bloques}`; un párrafo con `$k$` y `\(n\)`; un `equation` con `\label{eq:coherencia}`; un `align` de dos filas, la segunda con `\nonumber`; un `\[ … \]`; una figura con la plantilla del menú (`figs/ejemplo.png`, `\caption{Distribución de \textbf{tópicos}}`, `\label{fig:distribucion}`); una figura con dos `\includegraphics`, sin `\caption` ni `\label`; un `table` con `\caption`, `\label{tab:corpus}` y un `tabular{ll}` con `booktabs`; un `lstlisting` con `language=Python` y un `$` y un `\textbf` adentro; un párrafo con `\ref{fig:distribucion}`, `\ref{tab:corpus}` y `\ref{eq:coherencia}`. Fines de línea LF.
- [ ] **Step 2: Escribir las pruebas que fallan:**

```ts
const FIGURA = '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{ figs/a.png }\n'
  + '  \\caption{Una \\textbf{figura}}\n  \\label{fig:a}\n\\end{figure}';

it('figura: entorno, imagen, epígrafe y etiqueta, en orden', () => {
  const es = analizar(FIGURA);
  expect(es.map((e) => e.tipo)).toEqual(['entorno', 'imagen', 'epigrafe', 'formato', 'etiqueta']);
  const [entorno] = deTipo(es, 'entorno');
  expect(entorno).toMatchObject({ nombre: 'figure', desde: 0, hasta: FIGURA.length });
  expect(tramo(FIGURA, entorno.interior).startsWith('[htbp]')).toBe(true);
  const [imagen] = deTipo(es, 'imagen');
  expect(imagen.ruta).toBe('figs/a.png');
  expect(tramo(FIGURA, imagen.rutaRango)).toBe(' figs/a.png ');
  expect(tramo(FIGURA, deTipo(es, 'epigrafe')[0].contenido)).toBe('Una \\textbf{figura}');
});
it('figure* y table* se reportan sin asterisco', () => {
  expect(deTipo(analizar('\\begin{figure*}\\end{figure*}\\begin{table*}\\end{table*}'), 'entorno').map((e) => e.nombre)).toEqual(['figure', 'table']);
});
it('table con tabular: dos entornos, el de afuera primero', () => {
  const t = '\\begin{table}\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}\n\\end{table}';
  expect(deTipo(analizar(t), 'entorno').map((e) => e.nombre)).toEqual(['table', 'tabular']);
});
it('lstlisting: interior exacto y nada reportado adentro', () => {
  const t = '\\begin{lstlisting}[language=Python]\nx = "$a$" # \\textbf{no}\n\\end{lstlisting}';
  const es = analizar(t);
  expect(es.map((e) => e.tipo)).toEqual(['entorno']);
  expect(tramo(t, deTipo(es, 'entorno')[0].interior)).toBe('[language=Python]\nx = "$a$" # \\textbf{no}\n');
});
it('un entorno sin cerrar no se reporta, pero sí lo que contiene', () => {
  expect(analizar('\\begin{figure}\n\\includegraphics{a.png}').map((e) => e.tipo)).toEqual(['imagen']);
});
it('\\caption con texto corto opcional', () => {
  const t = '\\caption[Corto]{Largo}';
  expect(tramo(t, deTipo(analizar(t), 'epigrafe')[0].contenido)).toBe('Largo');
});
it('el fixture de bloques se analiza entero', () => {
  const es = analizar(leerFixture('Bloques.tex'));
  expect(deTipo(es, 'entorno').map((e) => e.nombre)).toEqual(['figure', 'figure', 'table', 'tabular', 'lstlisting']);
  expect(deTipo(es, 'matematica')).toHaveLength(5);
  expect(deTipo(es, 'etiqueta').map((e) => e.nombre)).toEqual(['eq:coherencia', 'fig:distribucion', 'tab:corpus']);
});
```

- [ ] **Step 3: Correr y ver que fallan.**
- [ ] **Step 4: Implementar.** Los entornos no literales se apilan en `\begin` y se emiten al encontrar su `\end`; el orden final lo da el `sort` por `desde` que ya existe. Los literales se emiten al encontrarlos, como hoy se saltean.
- [ ] **Step 5: Correr** `npx vitest run compartido cliente/vista.test.ts` → todo pasa (incluidas las pruebas que recorren los fixtures).
- [ ] **Step 6: Commit.** `git commit -m "Analizador: entornos de bloque, imagen y epígrafe; fixture de bloques"`

### Task 3: Numeración de objetos

**Files:**
- Modify: `editor/compartido/numeracion.ts`
- Test: `editor/compartido/numeracion.test.ts`

**Interfaces:**
- Consumes: los elementos de las tareas 1 y 2.
- Produces:

```ts
export type ClaseDeObjeto = 'figura' | 'tabla' | 'ecuacion';
export interface ObjetoNumerado {
  clase: ClaseDeObjeto; desde: number; hasta: number;
  tramos: { desde: number; hasta: number; numero: string }[];
}
export function numerarObjetos(texto: string, elementos: Elemento[], numeroCapitulo: string | null): ObjetoNumerado[];
// Objeto más interno que contiene la posición, con el número del tramo que la contiene.
export function objetoEn(objetos: ObjetoNumerado[], posicion: number): { clase: ClaseDeObjeto; numero: string | null } | null;
```

Reglas (clase book): cada clase cuenta por separado dentro del archivo, con la forma `capítulo.n`. Entran en la lista `figure`, `table` y toda matemática en bloque; no entran `tabular`, `lstlisting`, `verbatim` ni la matemática en línea. Una figura o tabla tiene un tramo (todo su rango) solo si contiene un epígrafe. `equation` tiene un tramo. `align` tiene un tramo por fila (las filas se separan con `\\` fuera de llaves), salvo las que contienen `\nonumber` o `\notag`. `equation*`, `align*`, `\[…\]` y `$$…$$` van sin tramos. Con `numeroCapitulo === null`, nadie tiene tramos.

- [ ] **Step 1: Escribir las pruebas que fallan:**

```ts
const numerar = (t: string, cap: string | null) => numerarObjetos(t, analizar(t), cap);
const numeros = (t: string, cap: string | null = '2') => numerar(t, cap).map((o) => [o.clase, o.tramos.map((x) => x.numero)]);

it('cada clase cuenta por separado', () => {
  const fig = '\\begin{figure}\\caption{x}\\end{figure}';
  const tab = '\\begin{table}\\caption{x}\\end{table}';
  const ec = '\\begin{equation}a\\end{equation}';
  expect(numeros([fig, ec, tab, fig, ec].join('\n'))).toEqual([
    ['figura', ['2.1']], ['ecuacion', ['2.1']], ['tabla', ['2.1']], ['figura', ['2.2']], ['ecuacion', ['2.2']],
  ]);
});
it('sin epígrafe no lleva número', () => {
  expect(numeros('\\begin{figure}\\includegraphics{a}\\end{figure}')).toEqual([['figura', []]]);
});
it('las variantes sin número no cuentan', () => {
  expect(numeros('\\[a\\] $$b$$ \\begin{equation*}c\\end{equation*} \\begin{align*}d\\end{align*} \\begin{equation}e\\end{equation}'))
    .toEqual([['ecuacion', []], ['ecuacion', []], ['ecuacion', []], ['ecuacion', []], ['ecuacion', ['2.1']]]);
});
it('align numera cada fila, menos las marcadas', () => {
  expect(numeros('\\begin{align}a &= b \\\\ c &= d \\nonumber \\\\ e &= f\\end{align}')).toEqual([['ecuacion', ['2.1', '2.2']]]);
});
it('capítulo sin número: nadie lleva número', () => {
  expect(numeros('\\begin{equation}a\\end{equation}', null)).toEqual([['ecuacion', []]]);
});
it('objetoEn da la clase y el número del tramo', () => {
  const t = 'x \\begin{align}a \\label{eq:1} \\\\ b \\label{eq:2}\\end{align} y';
  const o = numerar(t, 'A');
  expect(objetoEn(o, t.indexOf('eq:1'))).toEqual({ clase: 'ecuacion', numero: 'A.1' });
  expect(objetoEn(o, t.indexOf('eq:2'))).toEqual({ clase: 'ecuacion', numero: 'A.2' });
  expect(objetoEn(o, 0)).toBeNull();
});
it('el fixture de bloques', () => {
  expect(numeros(leerFixture('Bloques.tex'), '7')).toEqual([
    ['ecuacion', ['7.1']], ['ecuacion', ['7.2']], ['ecuacion', []],
    ['figura', ['7.1']], ['figura', []], ['tabla', ['7.1']],
  ]);
});
```

(La segunda figura del fixture, la de dos imágenes, no lleva `\caption`.)

- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar** `numerarObjetos` y `objetoEn`.
- [ ] **Step 4: Correr** `npx vitest run compartido/numeracion.test.ts` → pasa.
- [ ] **Step 5: Commit.** `git commit -m "Numeración de figuras, tablas y ecuaciones"`

### Task 4: Etiquetas con clase y número de objeto

**Files:**
- Modify: `editor/compartido/tipos.ts`, `editor/servidor/proyecto.ts`, `editor/cliente/vista.ts`, `editor/cliente/menuBarra.ts`
- Test: `editor/servidor/proyecto.test.ts`, `editor/cliente/vista.test.ts`, `editor/cliente/menuBarra.test.ts`

**Interfaces:**
- Consumes: `numerarObjetos`, `objetoEn`, `ClaseDeObjeto` (tarea 3).
- Produces: `Etiqueta` suma `clase: 'seccion' | ClaseDeObjeto`. En `menuBarra.ts`, `export function describirEtiqueta(e: Etiqueta): string`.

- [ ] **Step 1: Actualizar y agregar pruebas.**
  - En las tres pruebas, toda `Etiqueta` literal existente suma `clase: 'seccion'`.
  - `proyecto.test.ts`, prueba "una etiqueta dentro de una figura, tabla o ecuación…": pasa a comparar `[e.nombre, e.clase, e.titulo, e.numero]` y espera
    `['sec:s','seccion','S','1.1']`, `['fig:f','figura','','1.1']`, `['tab:t','tabla','',null]`, `['eq:e','ecuacion','','1.1']`, `['sec:despues','seccion','S','1.1']`.
  - `proyecto.test.ts`, nueva: una etiqueta dentro de `eqnarray` da `['ecuacion', '', null]` y dentro de `subfigure` da `['figura', '', null]` (objetos que `numerarObjetos` no conoce).
  - `vista.test.ts`, nuevas: con una etiqueta `{ clase: 'figura', titulo: '', numero: '2.1' }`, `\ref` dibuja el widget `'2.1'` con clase `'cm-ref'`; con `numero: null` dibuja la clave.
  - `menuBarra.test.ts`, nueva: `describirEtiqueta` da `'Figura 2.1'`, `'Tabla 2.3'`, `'Ecuación 2.2'`, `'2.1 Inteligencia Artificial'` para una sección, y `''` para un objeto sin número; `filtrarEtiquetas` encuentra una figura buscando `'figura 2'`.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.** En `etiquetasDe`, primero `objetoEn`; si no hay objeto, el patrón `ENTORNO_CON_ETIQUETA_PROPIA` que ya existe decide la clase (`eqnarray` → ecuación, `subfigure` → figura) con número nulo; si tampoco, es de sección. En `menuBarra.ts`, `describirEtiqueta` reemplaza a la constante privada `descripcion`.
- [ ] **Step 4: Correr** las tres pruebas → pasan.
- [ ] **Step 5: Commit.** `git commit -m "Etiquetas de figuras, tablas y ecuaciones con su número"`

### Task 5: Vista en bloques, y bloque de código

**Files:**
- Create: `editor/cliente/bloques/tipos.ts`, `editor/cliente/bloques/codigo.ts`, `editor/pruebas/ayudas/decoraciones.ts`
- Modify: `editor/cliente/vista.ts`, `editor/cliente/vista.test.ts`, `editor/cliente/estilos.css`
- Test: `editor/cliente/bloques/codigo.test.ts`

**Interfaces:**
- Produces, en `bloques/tipos.ts`:

```ts
export interface ContextoVista { numeroCapitulo: string | null; etiquetas: Map<string, Etiqueta> }
export interface Dibujo {
  estado: EditorState; texto: string; elementos: Elemento[]; ctx: ContextoVista;
  objetos: ObjetoNumerado[];
  activo(r: Rango): boolean;      // la selección toca el rango y el editor tiene foco
}
export type Decorador = (d: Dibujo) => Range<Decoration>[];
```

  `vista.ts` reexporta `ContextoVista` y sigue exportando `decorar`, `contextoCambiado` y `extensionVista` con las mismas firmas.
- Produces, en `pruebas/ayudas/decoraciones.ts`: `decos(texto, cursor, ctx, conFoco = true): Deco[]` con `Deco = { desde; hasta; clase?; reemplaza: boolean; widget?: string; numero?: string }`. Lee del widget las propiedades `texto`, `clase` y `numero`: todo widget de `bloques/` las expone para que las pruebas no necesiten DOM.
- Produces, en el mismo archivo: `ctxDePrueba(cambios?: Partial<ContextoVista>): ContextoVista`, con `numeroCapitulo: '2'` y la etiqueta `sec:CAP2_IA` que hoy arma `vista.test.ts`. Las pruebas de `bloques/` lo usan como `ctx`; cuando una tarea posterior agrega campos a `ContextoVista`, los completa acá.
- Produces: `export const decorarCodigo: Decorador`.

- [ ] **Step 1: Mover `decos`** de `vista.test.ts` a `pruebas/ayudas/decoraciones.ts` e importarlo. `npx vitest run cliente/vista.test.ts` → pasa igual que antes.
- [ ] **Step 2: Escribir la prueba que falla** (`codigo.test.ts`):

```ts
const T = 'a\n\\begin{lstlisting}[language=Python]\nx = 1\ny = \\textbf{2}\n\\end{lstlisting}\nb';
it('las líneas del interior llevan la clase de código', () => {
  const d = decos(T, 0, ctx);
  expect(d).toContainEqual(expect.objectContaining({ desde: T.indexOf('x = 1'), clase: 'cm-codigo' }));
  expect(d).toContainEqual(expect.objectContaining({ desde: T.indexOf('y = '), clase: 'cm-codigo' }));
});
it('las líneas \\begin y \\end quedan atenuadas y nada se reemplaza', () => {
  const d = decos(T, 0, ctx);
  expect(d).toContainEqual({ desde: 2, hasta: T.indexOf('\nx'), clase: 'cm-atenuado', reemplaza: false });
  expect(d).toContainEqual(expect.objectContaining({ desde: T.indexOf('\\end'), clase: 'cm-atenuado' }));
  expect(d.some((x) => x.reemplaza)).toBe(false);
});
it('los comandos del interior no se resaltan como comando', () => {
  expect(decos(T, 0, ctx).some((x) => x.clase === 'cm-comando')).toBe(false);
});
it('verbatim se dibuja igual', () => {
  expect(decos('\\begin{verbatim}\nz\n\\end{verbatim}', 0, ctx)).toContainEqual(expect.objectContaining({ desde: 17, clase: 'cm-codigo' }));
});
```

- [ ] **Step 3: Correr y ver que falla.**
- [ ] **Step 4: Implementar.** `decorar` arma el `Dibujo` (con `numerarObjetos`), junta lo propio y lo de cada `Decorador`, y deja de resaltar como comando lo que cae dentro de un entorno literal. `decorarCodigo` usa `Decoration.line({ class: 'cm-codigo' })` por línea del interior. En `estilos.css`: `.cm-codigo` monoespaciado, con el fondo `var(--superficie-2)`.
- [ ] **Step 5: Correr** `npx vitest run cliente` → pasa.
- [ ] **Step 6: Commit.** `git commit -m "Vista: decoradores por bloque y bloque de código"`

### Task 6: Ecuaciones con KaTeX

**Files:**
- Create: `editor/cliente/bloques/formula.ts`, `editor/cliente/bloques/ecuacion.ts`
- Modify: `editor/package.json`, `editor/cliente/vista.ts`, `editor/cliente/main.ts`, `editor/cliente/estilos.css`
- Test: `editor/cliente/bloques/formula.test.ts`, `editor/cliente/bloques/ecuacion.test.ts`

**Interfaces:**
- Consumes: `Dibujo`, `Decorador`, `decos` (tarea 5); elemento `matematica` (tarea 1); `ObjetoNumerado` (tarea 3).
- Produces, en `formula.ts`:

```ts
type Entorno = Extract<Elemento, { tipo: 'matematica' }>['entorno'];
export function prepararFormula(fuente: string, entorno: Entorno): string;
export type FormulaDibujada = { tipo: 'ok'; html: string } | { tipo: 'error'; mensaje: string };
export function dibujarFormula(fuente: string, entorno: Entorno, enBloque: boolean): FormulaDibujada;
```

- Produces: `export const decorarEcuaciones: Decorador`. Widgets `Formula` (clase `'cm-formula'`, o `'cm-formula cm-formula-bloque'` en bloque; `texto` = la fuente; `numero`) y `VistaPrevia` (clase `'cm-formula-previa'`, `texto` = la fuente).

- [ ] **Step 1: Instalar.** `npm install katex@^0.19.0` en `editor/`. Si TypeScript no encuentra sus tipos, `npm install -D @types/katex`.
- [ ] **Step 2: Escribir las pruebas que fallan de `formula.ts`:**

```ts
it('quita lo que KaTeX no usa', () => {
  expect(prepararFormula(' a = b \\label{eq:x} \\nonumber ', 'equation')).toBe('a = b');
  expect(prepararFormula('a \\notag', null)).toBe('a');
});
it('align se dibuja como aligned', () => {
  expect(prepararFormula('a &= b \\\\ c &= d', 'align')).toBe('\\begin{aligned}a &= b \\\\ c &= d\\end{aligned}');
});
it('dibuja una fórmula válida', () => {
  const r = dibujarFormula('\\frac{a}{b}', null, false);
  expect(r.tipo).toBe('ok');
  expect(r.tipo === 'ok' && r.html).toContain('katex');
});
it.each(['\\frac{a', '\\comandoinventado{x}'])('informa el error de %s sin el prefijo de KaTeX', (fuente) => {
  const r = dibujarFormula(fuente, null, false);
  expect(r).toMatchObject({ tipo: 'error' });
  expect(r.tipo === 'error' && r.mensaje).not.toMatch(/^KaTeX parse error/);
});
it('una fórmula vacía es un error con texto propio', () => {
  expect(dibujarFormula('  ', null, true)).toEqual({ tipo: 'error', mensaje: 'La fórmula está vacía.' });
});
it.each(['', '}', '\\begin{align}', '\\', '$', '&', 'x'.repeat(20000), '\\href{javascript:alert(1)}{x}', '\u0000'])(
  'nunca lanza una excepción (%#)', (fuente) => {
    for (const entorno of [null, 'equation', 'align'] as const) {
      const r = dibujarFormula(fuente, entorno, true);
      if (r.tipo === 'ok') expect(r.html).not.toContain('javascript:');
    }
  });
```

- [ ] **Step 3: Correr y ver que fallan. Implementar `formula.ts`.** `katex.renderToString` con `displayMode: enBloque`, `throwOnError: true`, `trust: false`, `strict: 'ignore'`, dentro de un `try` que atrapa cualquier excepción. Caché por `fuente + entorno + enBloque`, que se vacía al pasar de 500 entradas.
- [ ] **Step 4: Escribir las pruebas que fallan de `ecuacion.ts`** (`ctx = ctxDePrueba()`):

```ts
it('en línea, sin el cursor: la fórmula reemplaza al código', () => {
  expect(decos('sea $a+b$ fin\n', 0, ctx)).toContainEqual({ desde: 4, hasta: 9, reemplaza: true, widget: 'a+b', clase: 'cm-formula' });
});
it('en línea, con el cursor: se ve el código y la vista previa al final de la línea', () => {
  const d = decos('sea $a+b$ fin\notra', 6, ctx);
  expect(d.some((x) => x.reemplaza)).toBe(false);
  expect(d).toContainEqual(expect.objectContaining({ desde: 13, hasta: 13, widget: 'a+b', clase: 'cm-formula-previa' }));
});
it('en bloque, en líneas propias: reemplaza las líneas enteras y lleva número', () => {
  const t = 'x\n  \\begin{equation}\n  a = b\n  \\end{equation}  \ny';
  expect(decos(t, 0, ctx)).toContainEqual({
    desde: 2, hasta: t.indexOf('\ny'), reemplaza: true, widget: '\n  a = b\n  ', clase: 'cm-formula cm-formula-bloque', numero: '(2.1)',
  });
});
it('en bloque, compartiendo línea con texto: reemplaza solo la fórmula', () => {
  const t = 'donde \\[a\\] vale';
  expect(decos(t, 0, ctx)).toContainEqual(expect.objectContaining({ desde: 6, hasta: 11, reemplaza: true }));
});
it('align con varias filas muestra el rango de números', () => {
  const t = '\\begin{align}a \\\\ b \\\\ c\\end{align}\n';
  expect(decos(t, t.length, ctx)).toContainEqual(expect.objectContaining({ numero: '(2.1)–(2.3)' }));
});
it('con el cursor en una ecuación en bloque: código en monoespaciado y vista previa debajo', () => {
  const t = 'x\n\\begin{equation}\na = b\n\\end{equation}\ny';
  const d = decos(t, 20, ctx);
  expect(d.some((x) => x.reemplaza)).toBe(false);
  expect(d.filter((x) => x.clase === 'cm-fuente-formula')).toHaveLength(3);
  expect(d).toContainEqual(expect.objectContaining({ desde: t.indexOf('\ny'), clase: 'cm-formula-previa' }));
});
it('sin foco se dibuja aunque el cursor esté adentro', () => {
  expect(decos('$a$', 1, ctx, false).some((x) => x.reemplaza)).toBe(true);
});
```

- [ ] **Step 5: Correr y ver que fallan. Implementar `ecuacion.ts`.** Los reemplazos y la vista previa en bloque usan `block: true`. El DOM de un error: un `div.cm-formula-error` con dos líneas, `No se pudo dibujar la fórmula: <mensaje>` y `Puede compilar igual: el editor no conoce todos los comandos de LaTeX.` `toDOM` nunca deja escapar una excepción.
- [ ] **Step 6: Cablear.** `vista.ts` suma `decorarEcuaciones`; `main.ts` importa `'katex/dist/katex.min.css'`; estilos para `.cm-formula-bloque` (centrada, el número a la derecha), `.cm-formula-previa`, `.cm-fuente-formula` y `.cm-formula-error`.
- [ ] **Step 7: Correr** `npx vitest run cliente` y `npm run build` → pasan; `dist/assets/` contiene las fuentes de KaTeX.
- [ ] **Step 8: Commit.** `git commit -m "Ecuaciones dibujadas con KaTeX y vista previa al editar"`

### Task 7: Imágenes en el servidor

**Files:**
- Create: `editor/servidor/imagenes.ts`, `editor/pruebas/fixtures/informe/figs/ejemplo.png`
- Modify: `editor/servidor/archivos.ts`, `editor/servidor/app.ts`, `editor/servidor/index.ts`
- Test: `editor/servidor/imagenes.test.ts`, `editor/servidor/app.test.ts`

**Interfaces:**
- Produces, en `archivos.ts`: `export function resolverEnInforme(raiz: string, ruta: string): string` — la función `resolver` que hoy es privada, sin cambios de comportamiento (lanza `RutaInvalida`).
- Produces, en `imagenes.ts`:

```ts
export type TipoDeImagen = 'image/png' | 'image/jpeg' | 'application/pdf';
export type ResultadoGuardar =
  | { tipo: 'ok'; ruta: string }
  | { tipo: 'existe'; ruta: string; sugerido: string }
  | { tipo: 'invalido'; mensaje: string };
export interface Imagenes {
  resolver(ruta: string): Promise<{ absoluta: string; tipo: TipoDeImagen } | null>;
  listar(): Promise<{ ruta: string; bytes: number }[]>;
  guardar(nombre: string, bytes: Buffer): Promise<ResultadoGuardar>;
}
export function crearImagenes(dirInforme: string): Imagenes;
// 'Gráfico final (2).PNG' → 'Grafico-final-2.png'; null si la extensión no es png, jpg, jpeg o pdf.
export function nombreDeImagen(nombre: string): string | null;
```

- Rutas: `GET /api/imagen?ruta=`, `GET /api/imagenes`, `POST /api/imagenes?nombre=`. `Dependencias` suma `imagenes: Imagenes`.

Reglas: `resolver` acepta solo `.png`, `.jpg`, `.jpeg`, `.pdf` y lanza `RutaInvalida` ante otra extensión; si la ruta no trae extensión prueba `.pdf`, `.png`, `.jpg`, `.jpeg`, en ese orden (el de `pdflatex`); devuelve `null` si no existe. `listar` recorre `figs/` con sus subcarpetas, ordenado por ruta, con `/` como separador; si `figs/` no existe, lista vacía. `guardar` normaliza el nombre con `nombreDeImagen`, comprueba que los primeros bytes correspondan a la extensión (PNG `89 50 4E 47`, JPEG `FF D8 FF`, PDF `%PDF`), crea `figs/` si falta y escribe con la bandera `wx`. La comparación de nombres existentes no distingue mayúsculas. `sugerido` es el primer `nombre-2.ext`, `nombre-3.ext`… libre.

- [ ] **Step 1: Crear `ejemplo.png`**, un PNG de 1×1, con un script de Node de una línea que escriba en ese archivo los bytes de `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==` (base64).
- [ ] **Step 2: Escribir las pruebas que fallan de `imagenes.test.ts`**, sobre una copia del fixture en un directorio temporal (`copiarFixture`), con `PNG` = los bytes de `ejemplo.png`:

```ts
it.each([
  ['Gráfico final (2).PNG', 'Grafico-final-2.png'], ['a b.jpeg', 'a-b.jpeg'], ['../../x.png', 'x.png'],
  ['C:\\fotos\\Foto.JPG', 'Foto.jpg'], ['.png', null], ['nota.txt', null], ['foto.heic', null], ['sin-extension', null],
])('nombreDeImagen(%s) → %s', (entrada, salida) => { expect(nombreDeImagen(entrada)).toBe(salida); });

it('resuelve con y sin extensión', async () => {
  expect(await imagenes.resolver('figs/ejemplo.png')).toMatchObject({ tipo: 'image/png' });
  expect(await imagenes.resolver('figs/ejemplo')).toMatchObject({ tipo: 'image/png' });
  expect(await imagenes.resolver('figs/no-existe.png')).toBeNull();
});
it('sin extensión prefiere el PDF, como pdflatex', async () => {
  fs.writeFileSync(path.join(informe, 'figs', 'ejemplo.pdf'), '%PDF-1.4\n');
  expect(await imagenes.resolver('figs/ejemplo')).toMatchObject({ tipo: 'application/pdf' });
});
it.each(['../fuera.png', 'figs/../../fuera.png', '.git/x.png', 'C:/Windows/x.png', 'main.tex', 'prgrado.cls'])(
  'no sirve %s', async (ruta) => { await expect(imagenes.resolver(ruta)).rejects.toThrow(RutaInvalida); });
it('lista las imágenes de figs/', async () => {
  expect(await imagenes.listar()).toEqual([{ ruta: 'figs/ejemplo.png', bytes: PNG.length }]);
});
it('guarda con el nombre normalizado', async () => {
  expect(await imagenes.guardar('Mi Gráfico.PNG', PNG)).toEqual({ tipo: 'ok', ruta: 'figs/Mi-Grafico.png' });
  expect(fs.readFileSync(path.join(informe, 'figs', 'Mi-Grafico.png')).equals(PNG)).toBe(true);
});
it('nunca sobrescribe, tampoco si cambian las mayúsculas', async () => {
  const antes = fs.readFileSync(path.join(informe, 'figs', 'ejemplo.png'));
  expect(await imagenes.guardar('EJEMPLO.png', Buffer.concat([PNG, PNG]))).toEqual({ tipo: 'existe', ruta: 'figs/ejemplo.png', sugerido: 'EJEMPLO-2.png' });
  expect(fs.readFileSync(path.join(informe, 'figs', 'ejemplo.png')).equals(antes)).toBe(true);
});
it.each([['vacío', Buffer.alloc(0)], ['texto', Buffer.from('hola')], ['WebP', Buffer.from('RIFF0000WEBP')]])(
  'rechaza un archivo %s con extensión .png', async (_n, bytes) => {
    expect(await imagenes.guardar('foto.png', bytes)).toEqual({ tipo: 'invalido', mensaje: 'El archivo no es una imagen PNG, JPG o PDF válida.' });
    expect(fs.existsSync(path.join(informe, 'figs', 'foto.png'))).toBe(false);
  });
it('rechaza una extensión no admitida', async () => {
  expect(await imagenes.guardar('foto.gif', PNG)).toEqual({ tipo: 'invalido', mensaje: 'Solo se aceptan imágenes PNG, JPG o PDF.' });
});
it('crea figs/ si no existe', async () => {
  fs.rmSync(path.join(informe, 'figs'), { recursive: true });
  expect(await imagenes.guardar('a.png', PNG)).toEqual({ tipo: 'ok', ruta: 'figs/a.png' });
});
```

- [ ] **Step 3: Correr y ver que fallan. Implementar** `resolverEnInforme` e `imagenes.ts`.
- [ ] **Step 4: Escribir las pruebas que fallan de las rutas** en `app.test.ts` (con `imagenes: crearImagenes(informe)` en las dependencias):
  - `GET /api/imagen?ruta=figs/ejemplo.png` → 200, `Content-Type: image/png`, `Cache-Control: no-store`, cuerpo igual a los bytes.
  - `GET /api/imagen?ruta=figs/nada.png` → 404 con `{ mensaje: 'No se encuentra figs/nada.png' }`; `?ruta=../x.png` → 400.
  - `GET /api/imagenes` → la lista.
  - `POST /api/imagenes?nombre=Nueva.png` con los bytes y `Content-Type: application/octet-stream` → 201 `{ ruta: 'figs/Nueva.png' }`, y el archivo existe.
  - Repetido → 409 `{ ruta: 'figs/Nueva.png', sugerido: 'Nueva-2.png' }`. Inválido → 400 con el `mensaje`.
  - Un cuerpo de más de 20 MB → 413 `{ mensaje: 'La imagen supera los 20 MB.' }` y no se crea ningún archivo.
  - Un pedido con `Origin` ajeno → 403, como el resto de `/api`.
- [ ] **Step 5: Correr y ver que fallan. Implementar** las rutas en `app.ts` (el `POST` con `express.raw({ type: () => true, limit: '20mb' })` solo en esa ruta, y dentro de `enSerie`; el 413 en `alFallar`, por `error.type === 'entity.too.large'`) y el cableado en `index.ts`.
- [ ] **Step 6: Correr** `npx vitest run servidor/imagenes.test.ts servidor/app.test.ts servidor/archivos.test.ts` → pasan.
- [ ] **Step 7: Commit.** `git commit -m "Servidor: servir, listar y subir imágenes a figs/"`

### Task 8: Figuras dibujadas

**Files:**
- Create: `editor/compartido/flotante.ts`, `editor/cliente/bloques/figura.ts`
- Modify: `editor/cliente/bloques/tipos.ts`, `editor/cliente/vista.ts`, `editor/cliente/main.ts`, `editor/cliente/api.ts`, `editor/cliente/estilos.css`
- Test: `editor/compartido/flotante.test.ts`, `editor/cliente/bloques/figura.test.ts`

**Interfaces:**
- Consumes: elementos `entorno`, `imagen`, `epigrafe` (tarea 2); `Dibujo` (tarea 5); `GET /api/imagen` (tarea 7).
- Produces, en `flotante.ts`:

```ts
type Entorno = Extract<Elemento, { tipo: 'entorno' }>;
export interface PartesDeFigura {
  imagen: Extract<Elemento, { tipo: 'imagen' }>;
  epigrafe: Extract<Elemento, { tipo: 'epigrafe' }> | null;
  ocultar: Rango[];     // todo el rango de la figura menos la imagen y el contenido del epígrafe
}
// null si la figura no tiene exactamente la forma que el editor sabe dibujar.
export function partesDeFigura(texto: string, figura: Entorno, elementos: Elemento[]): PartesDeFigura | null;
```

  Forma dibujable: exactamente una imagen, a lo sumo un epígrafe, y todo lo demás dentro del rango es "armado": blancos, `\begin{figure}` o `\begin{figure*}` con su `[…]` opcional, `\end{figure}` o `\end{figure*}`, `\centering`, `\label{…}`, y el `\caption`, su `[…]` opcional y sus llaves. Cualquier otra cosa (texto, otro comando, un comentario, otro entorno) da `null`.
- Produces: `ContextoVista` suma `urlDeImagen(ruta: string): string` y `alElegirImagen(vista: EditorView, posicion: number): void`. `api.ts` suma `export const urlDeImagen = (ruta: string) => '/api/imagen?ruta=' + encodeURIComponent(ruta)`.
- Produces: `export const decorarFiguras: Decorador`. Widget `Imagen` (clase `'cm-imagen'`, `texto` = la ruta). El prefijo del epígrafe es un widget de clase `'cm-prefijo-epigrafe'` con texto `'Figura 2.1: '`, o `'Figura: '` si no hay número.

- [ ] **Step 1: Escribir las pruebas que fallan de `flotante.ts`** (`FIGURA` = la plantilla de la tarea 2, con la ruta sin espacios):

```ts
const partes = (t: string) => { const es = analizar(t); return partesDeFigura(t, deTipo(es, 'entorno')[0], es); };

it('plantilla: se oculta exactamente el armado', () => {
  const p = partes(FIGURA)!;
  expect(p.ocultar.map((r) => tramo(FIGURA, r))).toEqual([
    '\\begin{figure}[htbp]\n  \\centering\n  ',
    '\n  \\caption{',
    '}\n  \\label{fig:a}\n\\end{figure}',
  ]);
});
it('lo oculto, la imagen y el epígrafe cubren la figura sin solaparse', () => {
  const p = partes(FIGURA)!;
  const piezas = [...p.ocultar, p.imagen, p.epigrafe!.contenido].sort((a, b) => a.desde - b.desde);
  expect(piezas.map((r) => tramo(FIGURA, r)).join('')).toBe(FIGURA);
});
it('epígrafe antes de la imagen, y figura sin epígrafe', () => {
  expect(partes('\\begin{figure}\\caption{x}\\includegraphics{a.png}\\end{figure}')).not.toBeNull();
  expect(partes('\\begin{figure}\\includegraphics{a.png}\\end{figure}')!.epigrafe).toBeNull();
});
it.each([
  ['dos imágenes', '\\begin{figure}\\includegraphics{a}\\includegraphics{b}\\caption{x}\\end{figure}'],
  ['sin imagen', '\\begin{figure}\\caption{x}\\end{figure}'],
  ['texto suelto', '\\begin{figure}\\includegraphics{a}\nFuente: elaboración propia\n\\caption{x}\\end{figure}'],
  ['otro comando', '\\begin{figure}\\vspace{1cm}\\includegraphics{a}\\end{figure}'],
  ['un comentario', '\\begin{figure}\n% revisar\n\\includegraphics{a}\\end{figure}'],
  ['otro entorno', '\\begin{figure}\\begin{center}\\includegraphics{a}\\end{center}\\end{figure}'],
  ['dos epígrafes', '\\begin{figure}\\includegraphics{a}\\caption{x}\\caption{y}\\end{figure}'],
])('no es dibujable: %s', (_n, t) => { expect(partes(t)).toBeNull(); });
```

- [ ] **Step 2: Correr y ver que fallan. Implementar `flotante.ts`.**
- [ ] **Step 3: Escribir las pruebas que fallan de `figura.ts`.** `ctxDePrueba` suma las dos funciones nuevas (`urlDeImagen: (r) => r`, `alElegirImagen: () => {}`). `SIMPLE` es `FIGURA` con el epígrafe `Una figura`, sin negrita, y `T = 'antes\n' + SIMPLE + '\ndespués'`:

```ts
it('sin el cursor: armado oculto, imagen y prefijo', () => {
  const d = decos(T, 0, ctx);
  expect(d.filter((x) => x.reemplaza && !x.widget)).toHaveLength(3);
  expect(d).toContainEqual(expect.objectContaining({ reemplaza: true, widget: 'figs/a.png', clase: 'cm-imagen' }));
  expect(d).toContainEqual(expect.objectContaining({ desde: T.indexOf('Una '), widget: 'Figura 2.1: ', clase: 'cm-prefijo-epigrafe' }));
  expect(d).toContainEqual(expect.objectContaining({ clase: 'cm-epigrafe' }));
});
it('con el cursor dentro del epígrafe la figura sigue dibujada', () => {
  for (const pos of [T.indexOf('Una '), T.indexOf('Una ') + 2, T.indexOf('}\n  \\label')]) {
    expect(decos(T, pos, ctx).filter((x) => x.reemplaza)).toHaveLength(4);   // los tres tramos de armado y la imagen
  }
});
it('con el cursor en el armado se ve todo el código', () => {
  expect(decos(T, T.indexOf('\\centering'), ctx).some((x) => x.reemplaza)).toBe(false);
});
it('una figura no dibujable queda como código', () => {
  const t = '\\begin{figure}\\includegraphics{a}\\includegraphics{b}\\end{figure}\n';
  expect(decos(t, t.length, ctx).some((x) => x.reemplaza)).toBe(false);
});
it('una imagen fuera de una figura se dibuja sola', () => {
  const d = decos('a\n\\includegraphics{figs/b.png}\nc', 0, ctx);
  expect(d).toContainEqual(expect.objectContaining({ desde: 2, reemplaza: true, widget: 'figs/b.png', clase: 'cm-imagen' }));
});
it('figura sin número', () => {
  expect(decos(T, 0, ctxDePrueba({ numeroCapitulo: null }))).toContainEqual(expect.objectContaining({ widget: 'Figura: ' }));
});
```

- [ ] **Step 4: Correr y ver que fallan. Implementar `figura.ts`.** El DOM de `Imagen`: un `<img>` con `src = ctx.urlDeImagen(ruta)`. Si falla la carga, pide la misma URL con `HEAD`: si responde `application/pdf`, muestra un recuadro `<nombre> (PDF: se ve al compilar)`; si no, un recuadro rojo `No se encuentra <ruta>`. Un clic en la imagen llama `ctx.alElegirImagen(vista, vista.posAtDOM(nodo))`. Un botón `Ver código`, visible al pasar el cursor, pone la selección en el `desde` de la figura (o de la imagen suelta) y enfoca el editor.
- [ ] **Step 5: Cablear.** `vista.ts` suma `decorarFiguras`. En `main.ts`, el contexto recibe `urlDeImagen` y un `alElegirImagen` que por ahora no hace nada (la tarea 9 lo completa). Estilos: `.cm-imagen` en bloque y centrada, `max-width: 80%`, `max-height: 320px`; `.cm-epigrafe` centrado y más chico; los dos recuadros.
- [ ] **Step 6: Correr** `npx vitest run compartido cliente` → pasa.
- [ ] **Step 7: Commit.** `git commit -m "Figuras dibujadas con su imagen y epígrafe editable"`

### Task 9: Selector, subida y arrastre de imágenes

**Files:**
- Create: `editor/cliente/imagenes.ts`, `editor/cliente/pantalla/selectorImagen.ts`
- Modify: `editor/cliente/comandos.ts`, `editor/cliente/api.ts`, `editor/cliente/menuBarra.ts`, `editor/cliente/plantillas.ts`, `editor/cliente/main.ts`, `editor/cliente/estilos.css`
- Test: `editor/cliente/comandos.test.ts`, `editor/cliente/imagenes.test.ts`, `editor/cliente/menuBarra.test.ts`

**Interfaces:**
- Consumes: las rutas de la tarea 7; `alElegirImagen` (tarea 8); `Edicion` (ya existe en `comandos.ts`); `preguntar` (`pantalla/dom.ts`).
- Produces, en `comandos.ts`:

```ts
// Cambia solo la ruta de la imagen que contiene `posicion`; null si no hay ninguna ahí.
export function cambiarRutaDeImagen(texto: string, posicion: number, ruta: string): Edicion | null;
// Inserta la plantilla de Figura en una línea propia; la selección queda sobre el texto del epígrafe.
export function insertarFigura(texto: string, posicion: number, ruta: string): Edicion;
```

- Produces, en `api.ts`: `api.imagenes.listar(): Promise<{ ruta: string; bytes: number }[]>` y `api.imagenes.subir(nombre: string, archivo: Blob): Promise<{ estado: number; ruta?: string; sugerido?: string; mensaje?: string }>` (no lanza por 400, 409 ni 413).
- Produces, en `imagenes.ts`:

```ts
export interface Subida {
  subir: (typeof api)['imagenes']['subir'];
  preguntar: typeof preguntar;
  avisar(mensaje: string): void;
}
// Sube el archivo resolviendo el nombre repetido. Devuelve la ruta a usar, o null si no se subió.
export function crearSubida(s: Subida): (archivo: File) => Promise<string | null>;
export function extensionArrastre(o: { subir(archivo: File): Promise<string | null>; avisar(mensaje: string): void }): Extension;
```

- Produces, en `selectorImagen.ts`: `elegirImagen(o: { listar(): Promise<{ ruta: string; bytes: number }[]>; url(ruta: string): string; subir(archivo: File): Promise<string | null> }): Promise<string | null>`.
- Produces, en `menuBarra.ts`: `ContextoMenu` suma `elegirImagen(): Promise<string | null>`.

- [ ] **Step 1: Escribir las pruebas que fallan de `comandos.ts`:**

```ts
it('cambiarRutaDeImagen toca solo la ruta', () => {
  const t = 'a \\includegraphics[width=5cm]{ figs/vieja.png } b';
  const e = cambiarRutaDeImagen(t, 5, 'figs/nueva.png')!;
  expect(e.cambios).toEqual([{ desde: t.indexOf(' figs'), hasta: t.indexOf('}'), insertar: 'figs/nueva.png' }]);
  expect(cambiarRutaDeImagen(t, 0, 'x')).toBeNull();
});
it('insertarFigura en una línea vacía', () => {
  const e = insertarFigura('a\n\nb', 2, 'figs/Mi-Grafico.png');
  const insertado = '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{figs/Mi-Grafico.png}\n'
    + '  \\caption{Descripción de la figura}\n  \\label{fig:mi-grafico}\n\\end{figure}\n';
  expect(e.cambios).toEqual([{ desde: 2, hasta: 2, insertar: insertado }]);
  const inicio = 2 + insertado.indexOf('Descripción');
  expect(e.seleccion).toEqual({ ancla: inicio, cabeza: inicio + 'Descripción de la figura'.length });
});
it('insertarFigura en medio de un párrafo va después de esa línea', () => {
  const e = insertarFigura('uno dos\ntres', 3, 'figs/a.png');
  expect(e.cambios[0]).toMatchObject({ desde: 7, hasta: 7 });
  expect(e.cambios[0].insertar.startsWith('\n\\begin{figure}')).toBe(true);
});
```

- [ ] **Step 2: Correr y ver que fallan. Implementar.** El nombre de la etiqueta es el del archivo sin carpeta ni extensión, en minúsculas, con todo lo que no sea letra o número convertido en `-`.
- [ ] **Step 3: Escribir las pruebas que fallan de `crearSubida`**, con `subir`, `preguntar` y `avisar` falsos (`vi.fn`) y `new File([bytes], 'a.png')`:
  - 201 → devuelve `'figs/a.png'` y no pregunta.
  - 409 `{ ruta: 'figs/a.png', sugerido: 'a-2.png' }` → pregunta `'Ya hay una imagen llamada a.png en figs/.'` con las opciones `'Usar la que ya está'`, `'Guardar como a-2.png'` y `'Cancelar'` (neutra). Según la respuesta: devuelve `'figs/a.png'` sin volver a subir; vuelve a subir con el nombre `'a-2.png'` y devuelve su ruta; devuelve `null`.
  - 400 y 413 → llama `avisar` con el `mensaje` del servidor y devuelve `null`.
  - `subir` rechaza (sin conexión) → `avisar('No se pudo subir la imagen. Probá de nuevo.')` y `null`.
- [ ] **Step 4: Correr y ver que fallan. Implementar `crearSubida` y `extensionArrastre`.** El arrastre usa `EditorView.domEventHandlers` (`dragover`, `drop`): solo actúa si lo arrastrado trae archivos; con el editor en solo lectura no hace nada; si el archivo no es PNG, JPG ni PDF avisa `'Solo se pueden arrastrar imágenes PNG, JPG o PDF.'`; si la subida devuelve una ruta, aplica `insertarFigura` en la posición donde se soltó (`posAtCoords`), con `userEvent: 'input'`. Un solo archivo por vez: de varios, toma el primero.
- [ ] **Step 5: Implementar `selectorImagen.ts`:** un `<dialog>` con el título `Elegir imagen`, un campo `Filtrar por nombre`, la grilla de miniaturas (`<img>` para PNG y JPG, un recuadro con el nombre para PDF), el botón `Elegir archivo…` (un `<input type="file" accept=".png,.jpg,.jpeg,.pdf">` que pasa el archivo a `subir` y, si devuelve una ruta, cierra con ella) y `Cancelar`. Sin imágenes: `Todavía no hay imágenes en figs/.` Escape cierra con `null`.
- [ ] **Step 6: Cablear en `main.ts`.**
  - `alElegirImagen(vista, posicion)`: si el editor no está en solo lectura, abre el selector y aplica `cambiarRutaDeImagen` con la ruta elegida.
  - `extensionArrastre` entra en la lista de extensiones del editor.
  - `extensionMenu` recibe `elegirImagen`. En `menuBarra.ts`, la plantilla `figura` deja de insertar el campo `figs/archivo.png` a completar: abre el selector y, con la ruta elegida, aplica `insertarFigura`; si se cancela, no inserta nada. Actualizar `plantillas.ts` y las pruebas de `menuBarra.test.ts` y `comandos.test.ts` que comparaban el texto de esa plantilla.
- [ ] **Step 7: Correr** `npx vitest run cliente` y `npm run build` → pasan.
- [ ] **Step 8: Commit.** `git commit -m "Selector de imágenes, subida a figs/ y arrastre al editor"`

### Task 10: Guía, verificación manual, revisión e integración

**Files:**
- Modify: `editor/INSTALACION.md`

- [ ] **Step 1: Guía.** Sección nueva "Ecuaciones, figuras y código" en `INSTALACION.md`: cómo insertar cada bloque desde el menú "/", que la fórmula se edita entrando con el cursor y muestra la vista previa, qué significa el aviso de error ("puede compilar igual"), cómo cambiar la imagen de una figura (clic) y cómo sumar una nueva (elegir archivo o arrastrar), el límite de 20 MB, que el nombre se normaliza, y que las imágenes viajan a Overleaf con el próximo Enviar.
- [ ] **Step 2: Suite completa.** `npm test` → todo pasa (la prueba con el LanguageTool real se saltea si no está instalado en el worktree). `npm run build` → sin errores.
- [ ] **Step 3: Verificación manual en el entorno de prueba.** `npm run entorno-prueba`, ajustar `config.prueba.json` a los puertos 4327 y 4329, y arrancar con `EDITOR_CONFIG=config.prueba.json`. En el navegador, sobre un capítulo del entorno de prueba:
  1. Escribir una ecuación en línea y una `equation` desde el menú "/"; introducir un error (`\frac{a`), ver el aviso, corregirlo y ver la vista previa.
  2. Menú "/" → Figura: elegir una imagen existente; ver la figura dibujada con "Figura N.1:"; editar el epígrafe y comprobar que el corrector lo revisa.
  3. Arrastrar una imagen desde el Explorador; arrastrar otra con el mismo nombre y probar las tres respuestas; arrastrar un `.txt`.
  4. Clic en la imagen y cambiarla desde el selector; `git diff` en el clon de prueba: cambió solo la ruta.
  5. "Ver código" en una figura; mover el cursor afuera y ver que vuelve a dibujarse.
  6. Escribir a mano una figura con dos `\includegraphics`: queda como código.
  7. Insertar un bloque de código y escribir adentro.
  8. `\ref` a la figura y a la ecuación: muestran el número.
  9. Compilar: el PDF tiene la figura y la ecuación, con los mismos números.
  10. Enviar: en el remoto simulado llegaron el `.tex` y la imagen, y nada más. `npm run companero` para simular un cambio ajeno y Traer.
  11. Abrir cada capítulo del fixture sin editar y comprobar con `git status` que ninguno figura modificado.
- [ ] **Step 4: Commit** de la guía y de cualquier ajuste que haya salido de la verificación, cada uno con su prueba.
- [ ] **Step 5: Revisión independiente** de toda la rama contra la especificación y este plan (un revisor nuevo, sin el contexto de la implementación). Corregir lo que encuentre, con prueba.
- [ ] **Step 6: Integración.** Con el visto bueno de Cristhian, y avisándole que cambia lo que abre su ícono: fusionar `etapa-4-entrega-1` en `main`, y en `Tesis/editor/` correr `npm install` y `npm run build`. Si su editor está abierto, pedirle que lo cierre y lo vuelva a abrir.
