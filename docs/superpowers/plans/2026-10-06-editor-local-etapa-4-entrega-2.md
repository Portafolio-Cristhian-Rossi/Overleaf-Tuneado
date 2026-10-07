# Editor local del informe, etapa 4, entrega 2: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que citar sea un solo paso: las citas se ven como "(Autor, año)", un buscador encuentra el paper en `referencias.bib` o en el Zotero de Cristhian, y al elegir uno de Zotero su entrada se agrega sola al final del `.bib`.

**Architecture:** Un lector de BibTeX puro y compartido alimenta la pastilla de la cita y el buscador. El servidor suma dos unidades: `referencias` (agrega entradas al final del `.bib`, sin tocar lo existente) y `zotero` (lee la API local de Zotero; nunca escribe ahí). La decisión de qué agregar y con qué clave es una función pura, probada sin disco ni red.

**Tech Stack:** el de la entrega 1 (TypeScript, Node 24, Express 5, Vite, Vitest, CodeMirror 6, KaTeX). Sin dependencias nuevas: el acceso a Zotero usa `fetch` de Node.

**Spec:** `docs/superpowers/specs/2026-10-06-editor-local-etapa-4-design.md` (secciones 3, 6, 8, 9 y 10). Leerla antes de empezar; la 6.5 tiene las respuestas reales de Zotero. La entrega 3 (tablas) tiene su propio plan.

## Global Constraints

- **Invariante de fidelidad:** dibujar no modifica el documento. Cambiar una cita cambia solo su comando y sus claves. Agregar una referencia solo agrega bytes al final de `referencias.bib`: ningún byte anterior cambia, ni el fin de línea del archivo.
- `Tesis/informe/` y su `referencias.bib` son de cinco personas. Las pruebas automáticas y manuales nunca escriben ahí ni contactan a Overleaf: usan `pruebas/fixtures/`, directorios temporales y `npm run entorno-prueba`. Leer `informe/` sí está permitido.
- **Zotero es solo lectura.** Únicamente pedidos `GET` a `http://127.0.0.1:23119/api/…`. Nada de lo que se lee de Zotero sale de la máquina salvo la entrada limpia que el usuario elige citar, que va al `.bib`.
- Al `.bib` nunca llegan los campos `file`, `annote`, `abstract` ni `keywords`.
- Las pruebas automáticas no dependen de que Zotero esté abierto: usan un servidor HTTP falso con respuestas copiadas de la sonda (spec 6.5). Una sola prueba de integración con el Zotero real, que se saltea si no responde.
- Se trabaja en un worktree de Git aparte, no en `Tesis/editor/`, que es lo que abre el ícono. Si el editor de Cristhian corre (puertos 4317 y 4319) no se lo mata: las pruebas manuales usan 4327 y 4329, con `"corrector": false` en `config.prueba.json`.
- Dentro del worktree los comandos de shell van de a uno y simples (sin heredocs ni cadenas con `git`); los archivos se escriben con la herramienta de edición.
- Sin dependencias nuevas. Nunca modificar `prgrado.cls`.
- Interfaz en español rioplatense (voseo), sin mayúsculas de título, sin signos de exclamación. Los textos entre comillas de este plan son copia exacta.
- Identificadores en español. Posiciones (`desde`, `hasta`) sobre el texto con saltos normalizados a `\n`, `hasta` exclusivo.
- TDD en cada tarea; un commit por tarea como mínimo. Al cerrar cada tarea: `npx vitest run --exclude servidor/git.test.ts` y `npx tsc --noEmit -p .`. La suite completa (`npx vitest run`, unos 3 minutos) en la tarea 9.

## Review Focus

1. **Un `.bib` que escribieron otros.** Una entrada rota de un compañero en el medio, `@string`, `@comment`, líneas con `%`, valores entre comillas, una clave repetida, un archivo sin salto final o en Latin-1: el lector no falla, las demás entradas se usan, y agregar una referencia no reescribe nada de eso (o se niega, si el archivo no es reproducible). Pruebas en las tareas 1 y 5.
2. **Datos de Zotero incompletos o personales.** Un ítem sin autor, con autor institucional, sin fecha; una tesis cargada como artículo; notas personales en `annote`; la ruta del PDF en `file`. Se cita igual, con advertencia cuando corresponde, y lo personal nunca llega al `.bib`. Pruebas en las tareas 4 y 6.
3. **El mismo paper dos veces.** Un compañero ya lo cargó con otra clave, o Cristhian lo cita por segunda vez: no se duplica; se usa la entrada que está. Y dos papers distintos con la misma clave no se pisan. Prueba en la tarea 4.
4. **Citar mientras el editor no admite cambios, o con el `.bib` abierto y sin guardar.** Durante Traer o Enviar no se agrega nada; con el `.bib` abierto se guarda antes y se recarga después, sin perder lo escrito. Pruebas en las tareas 5 y 8.
5. **Citar donde no se puede.** Con el cursor dentro de una fórmula o de un bloque de código, una cita no compila: el buscador no se abre y la barra lo explica. Prueba en la tarea 7.

## Estructura de archivos

```
editor/
├── compartido/
│   ├── bib.ts            (crear) leer BibTeX; autores cortos, año, texto sin LaTeX
│   ├── citas.ts          (crear) texto de la pastilla; candidatos del buscador y su filtro
│   ├── referencias.ts    (crear) limpiar una entrada, detectar la misma obra, planear el agregado
│   ├── analizador.ts     (modificar) la cita informa sus argumentos opcionales y el rango de claves
│   └── tipos.ts          (modificar) tipos de Zotero y de los resultados de agregar
├── servidor/
│   ├── referencias.ts    (crear) agregar al final del .bib
│   ├── zotero.ts         (crear) estado, ítems y BibTeX de la API local
│   ├── app.ts, index.ts  (modificar) rutas y cableado
├── cliente/
│   ├── bloques/cita.ts   (crear) pastilla autor-año
│   ├── bloques/tipos.ts, vista.ts (modificar) el contexto lleva la bibliografía y el clic en una cita
│   ├── comandos.ts       (modificar) insertarCita, cambiarCita, citaEn, puedeCitarse
│   ├── pantalla/buscadorCitas.ts (crear) el diálogo
│   ├── menuBarra.ts, plantillas.ts, atajos.ts, api.ts, main.ts, estilos.css (modificar)
├── pruebas/
│   ├── ayudas/zoteroFalso.ts (crear) servidor HTTP con respuestas de la sonda
│   └── fixtures/zotero/      (crear) items.json, entrada.bib
└── INSTALACION.md        (modificar)
```

---

### Task 1: Lector de BibTeX

**Files:**
- Create: `editor/compartido/bib.ts`
- Test: `editor/compartido/bib.test.ts`

**Interfaces:**
- Produces:

```ts
export interface EntradaBib {
  tipo: string;                      // en minúsculas: 'article', 'inproceedings'…
  clave: string;
  campos: Record<string, string>;    // nombre en minúsculas → valor sin sus delimitadores
  desde: number; hasta: number;      // de la arroba a la llave de cierre
}
export interface ProblemaBib { linea: number; mensaje: string }   // línea desde 1
export function analizarBib(texto: string): { entradas: EntradaBib[]; problemas: ProblemaBib[] };

// 'An{\'a}lisis de {BTM}' → 'Análisis de BTM'
export function sinLatex(valor: string): string;
// Apellidos, como los lee quien cita: [] si no hay autor ni editor.
export function apellidos(entrada: EntradaBib): string[];
// 'Cohen' | 'Susskind y Hrabovsky' | 'Holleis et al.' | los primeros términos del título si no hay autores
export function autoresCortos(entrada: EntradaBib): string;
// El primer número de cuatro cifras de `year` (o de `date`); 's.f.' si no hay.
export function anioDe(entrada: EntradaBib): string;
```

Reglas del lector: una entrada es `@tipo{clave, campo = valor, …}` o con paréntesis en lugar de llaves. Un valor va entre llaves (anidadas), entre comillas (con llaves adentro), es un número o es una palabra (`jun`); varios trozos unidos con `#` se concatenan con un espacio. `@comment`, `@preamble` y `@string` se saltean sin informar. Todo lo que está fuera de una entrada se ignora (los comentarios con `%` del archivo real). El nombre del campo y el tipo se guardan en minúsculas; la clave, tal cual. Problemas: `'La entrada que empieza acá no cierra su llave.'`, `'Falta la clave de la entrada.'`, `'La clave "<clave>" ya se usó en la línea <n>.'` (la segunda aparición se omite de `entradas`). Tras una entrada que no cierra, la lectura sigue desde la siguiente línea que empieza con `@`.

Reglas de los apellidos: los autores se separan con ` and ` fuera de llaves. `Apellido, Nombre` → lo anterior a la coma; `Nombre Apellido` → la última palabra, con las partículas en minúscula que la preceden (`Ludwig van Beethoven` → `van Beethoven`); un nombre entero entre llaves (`{Universidad de la República}`) queda entero; `others` se omite. Si no hay `author` se usa `editor`.

- [ ] **Step 1: Escribir las pruebas que fallan:**

```ts
const una = (t: string) => analizarBib(t).entradas[0];

it('lee el referencias.bib del fixture', () => {
  const { entradas, problemas } = analizarBib(leerFixture('referencias.bib'));
  expect(entradas.map((e) => [e.tipo, e.clave])).toEqual([
    ['article', 'CitekeyArticle'], ['book', 'CitekeyBook'], ['inproceedings', 'CitekeyInproceedings'],
    ['manual', 'CitekeyManual'], ['misc', 'CitekeyMisc'],
  ]);
  expect(problemas).toEqual([]);
  expect(entradas[0].campos).toMatchObject({ author: 'P. J. Cohen', year: '1963', pages: '1143--1148' });
});
it('los rangos cubren cada entrada, de la arroba a su llave', () => {
  const t = leerFixture('referencias.bib');
  for (const e of analizarBib(t).entradas) {
    expect(t[e.desde]).toBe('@');
    expect(t[e.hasta - 1]).toBe('}');
  }
});
it.each([
  ['llaves anidadas', '@misc{k, title = {Un {BTM} y {\\\'e}xito}}', 'Un {BTM} y {\\\'e}xito'],
  ['comillas con llaves', '@misc{k, title = "Dice {"}hola{"}"}', 'Dice {"}hola{"}'],
  ['número', '@misc{k, title = 2014}', '2014'],
  ['palabra', '@misc{k, title = jun}', 'jun'],
  ['concatenación', '@misc{k, title = "a" # jun # {b}}', 'a jun b'],
  ['paréntesis', '@misc(k, title = {x})', 'x'],
  ['mayúsculas en el nombre', '@MISC{k, Title = {x}}', 'x'],
  ['sin coma final ni espacios', '@misc{k,title={x}}', 'x'],
])('valor: %s', (_n, t, esperado) => { expect(una(t).campos.title).toBe(esperado); });

it('saltea comentarios, @comment, @string y @preamble', () => {
  const t = '% @misc{no, title = {x}}\n@comment{@misc{tampoco, title = {x}}}\n@string{j = "Revista"}\n@preamble{"\\\\x"}\n@misc{si, title = {x}}';
  expect(analizarBib(t)).toMatchObject({ entradas: [{ clave: 'si' }], problemas: [] });
});
it('una entrada rota no impide leer las demás', () => {
  const t = '@misc{a, title = {x}}\n@misc{rota, title = {sin cerrar\n@misc{b, title = {y}}\n';
  const r = analizarBib(t);
  expect(r.entradas.map((e) => e.clave)).toEqual(['a', 'b']);
  expect(r.problemas).toEqual([{ linea: 2, mensaje: 'La entrada que empieza acá no cierra su llave.' }]);
});
it('informa la clave faltante y la repetida', () => {
  expect(analizarBib('@misc{, title = {x}}').problemas).toEqual([{ linea: 1, mensaje: 'Falta la clave de la entrada.' }]);
  const r = analizarBib('@misc{a, title = {x}}\n\n@misc{a, title = {y}}');
  expect(r.entradas).toHaveLength(1);
  expect(r.problemas).toEqual([{ linea: 3, mensaje: 'La clave "a" ya se usó en la línea 1.' }]);
});
it.each(['', '@', '@misc', '@misc{', '@misc{k', '@misc{k,', '@misc{k, a', '@misc{k, a =', '@misc{k, a = {', '}}}', '@misc{k, a = "x}'])(
  'no falla con %j', (t) => { expect(() => analizarBib(t)).not.toThrow(); });

it.each([
  ["An{\\'a}lisis de {BTM}", 'Análisis de BTM'], ["Mu\\~noz y G\\\"unther", 'Muñoz y Günther'], ["\\'{E}xito", 'Éxito'],
  ['R\\&D --- a~b', 'R&D — a b'], ['p. 3--5', 'p. 3–5'], ['{\\ss} {\\o} {\\L}', 'ß ø Ł'], ['Extracción', 'Extracción'],
])('sinLatex(%j) → %j', (entrada, salida) => { expect(sinLatex(entrada)).toBe(salida); });

const con = (author: string, otros: Record<string, string> = {}) => ({ tipo: 'article', clave: 'k', campos: { author, ...otros }, desde: 0, hasta: 0 });
it.each([
  ['P. J. Cohen', ['Cohen'], 'Cohen'],
  ['Leonard Susskind and George Hrabovsky', ['Susskind', 'Hrabovsky'], 'Susskind y Hrabovsky'],
  ['Holleis, Paul and Wagner, Matthias and Koolwaaij, Johan', ['Holleis', 'Wagner', 'Koolwaaij'], 'Holleis et al.'],
  ['Ludwig van Beethoven', ['van Beethoven'], 'van Beethoven'],
  ['{Universidad de la Rep{\\\'u}blica}', ['Universidad de la República'], 'Universidad de la República'],
  ['Inzua Herken, Nicolás and others', ['Inzua Herken'], 'Inzua Herken et al.'],
  ['Ros{\\\'a}, Aiala', ['Rosá'], 'Rosá'],
])('autores de %j', (author, lista, corto) => {
  expect(apellidos(con(author))).toEqual(lista);
  expect(autoresCortos(con(author))).toBe(corto);
});
it('sin autor usa el editor; sin ninguno, el comienzo del título', () => {
  expect(autoresCortos({ ...con(''), campos: { editor: 'Duh, Kevin and Gomez, Helena' } })).toBe('Duh y Gomez');
  expect(autoresCortos({ ...con(''), campos: { title: 'Zotero {\\textbar} Your personal research assistant' } })).toBe('Zotero | Your personal…');
  expect(autoresCortos({ ...con(''), campos: {} })).toBe('k');
});
it.each([[{ year: '2014' }, '2014'], [{ year: '{2014}' }, '2014'], [{ date: '2019-01-10' }, '2019'], [{ year: 'en prensa' }, 's.f.'], [{}, 's.f.']])(
  'año de %j', (campos, anio) => { expect(anioDe({ ...con('x'), campos })).toBe(anio); });
```

  (`{\textbar}` se lee como `|`. "El comienzo del título" son sus primeras cuatro palabras, seguidas de `…` si hay más.)
- [ ] **Step 2: Correr y ver que fallan.** `npx vitest run compartido/bib.test.ts`
- [ ] **Step 3: Implementar `bib.ts`.**
- [ ] **Step 4: Correr y ver que pasan.**
- [ ] **Step 5: Commit.** `git commit -m "Lector de BibTeX: entradas, autores cortos y año"`

### Task 2: La cita informa sus partes; texto de la pastilla

**Files:**
- Modify: `editor/compartido/analizador.ts`
- Create: `editor/compartido/citas.ts`
- Test: `editor/compartido/analizador.test.ts`, `editor/compartido/citas.test.ts`

**Interfaces:**
- Consumes: `EntradaBib`, `autoresCortos`, `anioDe`, `sinLatex` (tarea 1).
- Produces: el elemento `cita` del analizador suma `previo: Rango | null` (interior de `<…>`), `posterior: Rango | null` (interior de `[…]`), `clavesRango: Rango` (interior de las llaves) y `comandoRango: Rango` (el nombre, sin la barra). Lo demás no cambia.
- Produces, en `citas.ts`:

```ts
export type Bibliografia = Map<string, EntradaBib>;
export interface TextoDeCita { texto: string; faltan: string[] }   // faltan: claves que no están en el .bib
export function textoDeCita(
  comando: string, claves: string[], previo: string | null, posterior: string | null, bib: Bibliografia,
): TextoDeCita;
```

Formas, con `A` = autores cortos y `Y` = año: `cite` → `(A, Y)`; `citeA` → `A (Y)`; `citeNP` → `A, Y`; `citeauthor` → `A`; `citeyear` → `(Y)`; `citeyearNP` → `Y`. Los prefijos `full` y `short` se dibujan como la forma sin prefijo. `nocite` muestra las claves separadas por coma, como hoy. Varias claves se separan con `; ` (en las formas textuales, cada una con su paréntesis). `previo` va al comienzo del paréntesis seguido de un espacio, y `posterior` al final precedido de `, `; ambos pasan por `sinLatex`. En `citeA`, `previo` va antes del primer autor y `posterior` dentro del último paréntesis. Una clave que no está en `bib` se muestra como la clave misma y se lista en `faltan`.

- [ ] **Step 1: Escribir las pruebas que fallan.** En `analizador.test.ts`:

```ts
it('la cita informa sus argumentos opcionales, su comando y el rango de sus claves', () => {
  const t = 'x \\citeA<ver>[p.~3]{a, b} y';
  const [c] = deTipo(analizar(t), 'cita');
  expect(tramo(t, c.comandoRango)).toBe('citeA');
  expect(tramo(t, c.previo!)).toBe('ver');
  expect(tramo(t, c.posterior!)).toBe('p.~3');
  expect(tramo(t, c.clavesRango)).toBe('a, b');
  expect(deTipo(analizar('\\cite{a}'), 'cita')[0]).toMatchObject({ previo: null, posterior: null });
  expect(tramo('\\cite[p. 2]{a}', deTipo(analizar('\\cite[p. 2]{a}'), 'cita')[0].posterior!)).toBe('p. 2');
});
```

  En `citas.test.ts`, con `bib` armado desde `analizarBib(leerFixture('referencias.bib'))` (Cohen 1963; Susskind y Hrabovsky 2014; Holleis et al. 2010):

```ts
const t = (comando: string, claves: string[], previo: string | null = null, posterior: string | null = null) =>
  textoDeCita(comando, claves, previo, posterior, bib).texto;

it.each([
  ['cite', '(Cohen, 1963)'], ['citeA', 'Cohen (1963)'], ['citeNP', 'Cohen, 1963'],
  ['citeauthor', 'Cohen'], ['citeyear', '(1963)'], ['citeyearNP', '1963'],
  ['fullcite', '(Cohen, 1963)'], ['shortciteA', 'Cohen (1963)'], ['nocite', 'CitekeyArticle'],
])('\\%s', (comando, esperado) => { expect(t(comando, ['CitekeyArticle'])).toBe(esperado); });

it('varias claves', () => {
  expect(t('cite', ['CitekeyArticle', 'CitekeyBook'])).toBe('(Cohen, 1963; Susskind y Hrabovsky, 2014)');
  expect(t('citeA', ['CitekeyArticle', 'CitekeyInproceedings'])).toBe('Cohen (1963); Holleis et al. (2010)');
});
it('argumentos opcionales', () => {
  expect(t('cite', ['CitekeyArticle'], 'ver', 'p.~5')).toBe('(ver Cohen, 1963, p. 5)');
  expect(t('citeA', ['CitekeyArticle'], 'ver', 'p.~5')).toBe('ver Cohen (1963, p. 5)');
  expect(t('cite', ['CitekeyArticle'], null, 'cap. 2')).toBe('(Cohen, 1963, cap. 2)');
});
it('una clave que no está se muestra tal cual y se informa', () => {
  expect(textoDeCita('cite', ['CitekeyArticle', 'nada'], null, null, bib)).toEqual({ texto: '(Cohen, 1963; nada)', faltan: ['nada'] });
  expect(textoDeCita('cite', [], null, null, bib)).toEqual({ texto: '()', faltan: [] });
});
```

- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.** En el analizador, los opcionales pueden venir en cualquiera de los dos órdenes que acepta `apacite` (`<…>` antes que `[…]`); un opcional que no cierra deja la cita sin reportar, como hoy.
- [ ] **Step 4: Correr** `npx vitest run compartido` → pasa.
- [ ] **Step 5: Commit.** `git commit -m "Citas: argumentos opcionales en el analizador y texto autor-año"`

### Task 3: Pastilla autor-año en la vista

**Files:**
- Create: `editor/cliente/bloques/cita.ts`
- Modify: `editor/cliente/bloques/tipos.ts`, `editor/cliente/vista.ts`, `editor/cliente/main.ts`, `editor/cliente/estilos.css`, `editor/pruebas/ayudas/decoraciones.ts`
- Test: `editor/cliente/bloques/cita.test.ts`, `editor/cliente/vista.test.ts`

**Interfaces:**
- Consumes: `textoDeCita`, `Bibliografia` (tarea 2); `analizarBib` (tarea 1); `Dibujo`, `Decorador`, `decos`, `ctxDePrueba` (entrega 1).
- Produces: `ContextoVista` suma `bibliografia: Bibliografia` y `alElegirCita(vista: EditorView, posicion: number): void`. `ctxDePrueba` los completa con la bibliografía del fixture y una función vacía.
- Produces: `export const decorarCitas: Decorador`. El widget tiene `clase` `'cm-cita'`, o `'cm-cita cm-cita-rota'` si falta alguna clave, y `texto` = el texto de la cita.
- En `main.ts`: la variable `bibliografia`, que se rearma en `recargarProyecto` leyendo `proyecto.bibliografia` con `api.leer` y `analizarBib` (si no hay archivo o falla la lectura, queda vacía). `alElegirCita` queda vacío hasta la tarea 8.

- [ ] **Step 1: Escribir las pruebas que fallan** (`cita.test.ts`, `ctx = ctxDePrueba()`):

```ts
it('se ve como autor y año', () => {
  expect(decos('según \\cite{CitekeyArticle} x', 0, ctx)).toContainEqual(
    { desde: 6, hasta: 27, reemplaza: true, widget: '(Cohen, 1963)', clase: 'cm-cita' });
  expect(decos('según \\citeA<ver>[p.~5]{CitekeyBook} x', 0, ctx)).toContainEqual(
    expect.objectContaining({ widget: 'ver Susskind y Hrabovsky (2014, p. 5)', clase: 'cm-cita' }));
});
it('una clave que no está en el .bib se ve en rojo, con la clave', () => {
  expect(decos('\\cite{nada} x', 12, ctx)).toContainEqual(expect.objectContaining({ widget: '(nada)', clase: 'cm-cita cm-cita-rota' }));
});
it('con el cursor encima se ve el código', () => {
  expect(decos('según \\cite{CitekeyArticle} x', 10, ctx).some((x) => x.reemplaza)).toBe(false);
});
it('sin bibliografía cargada, todas las citas muestran su clave sin marcarse rotas', () => {
  const sinBib = ctxDePrueba({ bibliografia: new Map() });
  expect(decos('\\cite{CitekeyArticle} x', 22, sinBib)).toContainEqual(expect.objectContaining({ widget: 'CitekeyArticle', clase: 'cm-cita' }));
});
it('la pastilla se queda con el clic del ratón y no con lo demás', () => {
  const t = 'según \\cite{CitekeyArticle} x';
  let pastilla: { ignoreEvent(e: Event): boolean } | undefined;
  decorar(EditorState.create({ doc: t }), ctx).between(0, t.length, (_d, _h, d) => { if (d.spec.widget?.clase === 'cm-cita') pastilla = d.spec.widget; });
  for (const tipo of ['mousedown', 'click']) expect(pastilla!.ignoreEvent(new Event(tipo)), tipo).toBe(true);
  for (const tipo of ['keydown', 'dragover', 'drop']) expect(pastilla!.ignoreEvent(new Event(tipo)), tipo).toBe(false);
});
```

  En `vista.test.ts`, la prueba `'cita muestra las claves'` se reemplaza por la primera de arriba.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.** La bibliografía vacía significa "todavía no se leyó el `.bib`": en ese caso se dibuja como antes de esta entrega (las claves, sin rojo). El widget llama `ctx.alElegirCita(vista, vista.posAtDOM(nodo))` al hacer clic. Estilo `.cm-cita-rota` igual a `.cm-ref-rota`; `.cm-cita` con `cursor: pointer`.
- [ ] **Step 4: Correr** `npx vitest run cliente` → pasa.
- [ ] **Step 5: Commit.** `git commit -m "Vista: las citas se ven como autor y año"`

### Task 4: Qué se agrega al `.bib` y con qué clave

**Files:**
- Create: `editor/compartido/referencias.ts`, `editor/pruebas/fixtures/zotero/entrada.bib`
- Modify: `editor/compartido/tipos.ts`
- Test: `editor/compartido/referencias.test.ts`

**Interfaces:**
- Consumes: `analizarBib`, `EntradaBib`, `sinLatex`, `anioDe` (tarea 1).
- Produces, en `tipos.ts`:

```ts
export type ResultadoDeReferencia =
  | { tipo: 'agregada' | 'ya-estaba'; clave: string; advertencias: string[] }
  | { tipo: 'clave-repetida'; clave: string; sugerida: string };
export type ResultadoAgregar =
  | { tipo: 'ok'; referencias: ResultadoDeReferencia[] }
  | { tipo: 'invalido'; mensaje: string };
```

- Produces, en `referencias.ts`:

```ts
export const CAMPOS_QUE_NO_VIAJAN = ['file', 'annote', 'abstract', 'keywords'];
// El texto de la entrada sin esos campos; nada más cambia.
export function limpiarEntrada(texto: string, entrada: EntradaBib): string;
// ¿Son el mismo trabajo? Mismo DOI, o mismo título y mismo año.
export function esLaMismaObra(a: EntradaBib, b: EntradaBib): boolean;
export function advertenciasDe(entrada: EntradaBib): string[];
// Decide, sin tocar nada, qué hay que escribir al final del .bib.
export function planearAgregado(
  bibActual: string, bibtexNuevo: string, alRepetir: 'preguntar' | 'renombrar',
): { agregar: string; resultado: ResultadoAgregar };
```

Reglas de `planearAgregado`, para cada entrada de `bibtexNuevo`, en orden:
1. Si en `bibActual` (o entre las ya aceptadas de esta misma llamada) hay una entrada que es la misma obra, o que tiene la misma clave y exactamente los mismos campos → `ya-estaba` con la clave **existente**; no se agrega.
2. Si no, y su clave ya existe → con `'preguntar'`: `clave-repetida`, con `sugerida` = la primera de `clave-2`, `clave-3`… libre; no se agrega. Con `'renombrar'`: se agrega con la clave sugerida y el resultado es `agregada` con esa clave.
3. Si no → `agregada`.

`agregar` es lo que hay que anexar: cada entrada aceptada, limpia y sin blancos en los bordes, separadas entre sí y del contenido previo por exactamente una línea en blanco, y terminado en un salto de línea. Tiene en cuenta cómo termina `bibActual`: sin salto final empieza con `\n\n`; con un salto, con `\n`; con una línea en blanco o vacío, con nada. Si no hay nada que agregar, `agregar` es `''`. Los saltos de `bibtexNuevo` se normalizan a `\n`.

`invalido` (y `agregar` vacío): `bibtexNuevo` sin ninguna entrada → `'No encontré ninguna referencia en el texto pegado. Tiene que empezar con @article{…, @book{… o similar.'`; con algún problema del lector → `'La referencia no está bien formada (línea <n>): <mensaje del lector>'`; una clave con algo que no sea letras, números, `_`, `-`, `:`, `.` o `+` → `'La clave "<clave>" tiene caracteres que LaTeX no acepta en una cita.'`.

`esLaMismaObra`: el DOI se compara sin mayúsculas y sin `https://doi.org/`; el título, con `sinLatex`, sin tildes, sin mayúsculas y sin signos; el año, con `anioDe`. Dos entradas sin título no son la misma obra por título.

Advertencias, copia exacta: `'A "<clave>" le falta la revista (journal). Al compilar, la bibliografía puede dar error. Si es una tesis o un informe, corregí el tipo en Zotero.'` para `article` sin `journal` ni `journaltitle`; `'"<clave>" trae una nota que se va a imprimir en la bibliografía: "<nota>".'` para una entrada con `note` (la nota con `sinLatex`, recortada a 80 caracteres con `…`).

- [ ] **Step 1: Crear el fixture** `zotero/entrada.bib` con las entradas `pham_topicgpt_2024` e `inzua_herken_extraccion_2025` tal como las entrega Zotero (spec 6.5 y la segunda sonda): con `file`, `abstract` de varias líneas con una llave adentro, `keywords`, `annote` y `note`, tabuladas con tabulador y con tildes sin convertir. La ruta de `file` se escribe con un usuario inventado (`C\:\\Users\\Alguien\\Zotero\\…`).
- [ ] **Step 2: Escribir las pruebas que fallan:**

```ts
const BIB = leerFixture('referencias.bib');
const ZOTERO = fs.readFileSync(path.join(DIR_FIXTURE, '../zotero/entrada.bib'), 'utf8');
const PHAM = '@inproceedings{pham_topicgpt_2024,\n\ttitle = {{TopicGPT}: {A} {Prompt}-based {Topic} {Modeling} {Framework}},\n\tdoi = {10.18653/v1/2024.naacl-long.164},\n\tauthor = {Pham, Chau Minh and Hoyle, Alexander},\n\tyear = {2024},\n}';
const plan = (actual: string, nuevo: string, alRepetir: 'preguntar' | 'renombrar' = 'preguntar') => planearAgregado(actual, nuevo, alRepetir);

it('limpiar quita los cuatro campos y nada más', () => {
  const [pham, inzua] = analizarBib(ZOTERO).entradas;
  const limpia = limpiarEntrada(ZOTERO, pham);
  expect(limpia).not.toMatch(/\b(file|annote|abstract|keywords)\s*=/);
  expect(limpia).not.toContain('Users');
  expect(Object.keys(analizarBib(limpia).entradas[0].campos).sort())
    .toEqual(Object.keys(pham.campos).filter((c) => !CAMPOS_QUE_NO_VIAJAN.includes(c)).sort());
  expect(analizarBib(limpia).entradas[0].campos.title).toBe(pham.campos.title);
  expect(limpiarEntrada(ZOTERO, inzua)).not.toContain('interesante');
  expect(analizarBib(limpiarEntrada(ZOTERO, inzua)).problemas).toEqual([]);
});
it('una entrada sin esos campos queda idéntica', () => {
  expect(limpiarEntrada(PHAM, analizarBib(PHAM).entradas[0])).toBe(PHAM);
});
it('agrega al final, separada por una línea en blanco', () => {
  const r = plan(BIB, PHAM);
  expect(r.resultado).toEqual({ tipo: 'ok', referencias: [{ tipo: 'agregada', clave: 'pham_topicgpt_2024', advertencias: [] }] });
  expect(r.agregar).toBe(`\n${PHAM}\n`);
  expect(analizarBib(BIB + r.agregar)).toMatchObject({ problemas: [] });
});
it.each([['sin salto final', 'x', '\n\n'], ['con un salto', 'x\n', '\n'], ['con línea en blanco', 'x\n\n', ''], ['vacío', '', '']])(
  'archivo %s', (_n, actual, comienzo) => { expect(plan(actual, PHAM).agregar).toBe(`${comienzo}${PHAM}\n`); });
it('la misma obra con otra clave no se duplica: se usa la que está', () => {
  const cargada = PHAM.replace('pham_topicgpt_2024', 'Pham2024').replace('10.18653', 'https://doi.org/10.18653');
  expect(plan(cargada, PHAM)).toEqual({ agregar: '', resultado: { tipo: 'ok', referencias: [{ tipo: 'ya-estaba', clave: 'Pham2024', advertencias: [] }] } });
  const sinDoi = '@misc{otra, title = "TopicGPT: a prompt-based topic modeling framework", year = 2024}';
  expect(plan(sinDoi, PHAM).resultado).toMatchObject({ referencias: [{ tipo: 'ya-estaba', clave: 'otra' }] });
});
it('la misma entrada, sin título ni DOI por los que reconocerla, tampoco se duplica', () => {
  const rara = '@misc{k, howpublished = {Comunicación personal}}';
  expect(plan(`${rara}\n`, rara)).toEqual({ agregar: '', resultado: { tipo: 'ok', referencias: [{ tipo: 'ya-estaba', clave: 'k', advertencias: [] }] } });
});
it('otro trabajo con la misma clave: pregunta, y al renombrar usa la primera clave libre', () => {
  const ocupada = '@book{pham_topicgpt_2024, title = {Otro libro}, year = {1999}}\n@book{pham_topicgpt_2024-2, title = {Otro más}, year = {2001}}\n';
  expect(plan(ocupada, PHAM)).toEqual({ agregar: '', resultado: { tipo: 'ok', referencias: [{ tipo: 'clave-repetida', clave: 'pham_topicgpt_2024', sugerida: 'pham_topicgpt_2024-3' }] } });
  const r = plan(ocupada, PHAM, 'renombrar');
  expect(r.resultado).toMatchObject({ referencias: [{ tipo: 'agregada', clave: 'pham_topicgpt_2024-3' }] });
  expect(r.agregar).toBe(`\n${PHAM.replace('pham_topicgpt_2024,', 'pham_topicgpt_2024-3,')}\n`);
});
it('varias entradas pegadas, una repetida dentro del mismo pegado', () => {
  const r = plan(BIB, `${PHAM}\n\n${PHAM}`);
  expect(r.resultado).toMatchObject({ referencias: [{ tipo: 'agregada' }, { tipo: 'ya-estaba', clave: 'pham_topicgpt_2024' }] });
  expect(r.agregar).toBe(`\n${PHAM}\n`);
});
it('las entradas de Zotero se agregan limpias y con sus advertencias', () => {
  const r = plan(BIB, ZOTERO);
  expect(r.agregar).not.toMatch(/Users|interesante|abstract/);
  expect(r.resultado).toMatchObject({ referencias: [
    { tipo: 'agregada', clave: 'pham_topicgpt_2024', advertencias: [] },
    { tipo: 'agregada', clave: 'inzua_herken_extraccion_2025', advertencias: [
      'A "inzua_herken_extraccion_2025" le falta la revista (journal). Al compilar, la bibliografía puede dar error. Si es una tesis o un informe, corregí el tipo en Zotero.',
      '"inzua_herken_extraccion_2025" trae una nota que se va a imprimir en la bibliografía: "Accepted: 2025-11-07T16:36:28Z".',
    ] },
  ] });
});
it('pegado con fines de línea de Windows se normaliza', () => {
  expect(plan('', PHAM.replace(/\n/g, '\r\n')).agregar).toBe(`${PHAM}\n`);
});
it.each([
  ['', 'No encontré ninguna referencia en el texto pegado. Tiene que empezar con @article{…, @book{… o similar.'],
  ['un texto cualquiera', 'No encontré ninguna referencia en el texto pegado. Tiene que empezar con @article{…, @book{… o similar.'],
  ['@misc{k, title = {sin cerrar', 'La referencia no está bien formada (línea 1): La entrada que empieza acá no cierra su llave.'],
  ['@misc{mi clave, title = {x}}', 'La clave "mi clave" tiene caracteres que LaTeX no acepta en una cita.'],
  ['@misc{a%b, title = {x}}', 'La clave "a%b" tiene caracteres que LaTeX no acepta en una cita.'],
])('rechaza %j', (nuevo, mensaje) => {
  expect(plan(BIB, nuevo)).toEqual({ agregar: '', resultado: { tipo: 'invalido', mensaje } });
});
```

- [ ] **Step 3: Correr y ver que fallan. Implementar `referencias.ts`.**
- [ ] **Step 4: Correr** `npx vitest run compartido/referencias.test.ts` → pasa.
- [ ] **Step 5: Commit.** `git commit -m "Referencias: limpiar, detectar la misma obra y planear el agregado"`

### Task 5: Agregar al `.bib` desde el servidor

**Files:**
- Create: `editor/servidor/referencias.ts`
- Modify: `editor/servidor/app.ts`, `editor/servidor/index.ts`
- Test: `editor/servidor/referencias.test.ts`, `editor/servidor/app.test.ts`

**Interfaces:**
- Consumes: `planearAgregado`, `ResultadoAgregar` (tarea 4); `decodificar`, `codificar`, `esFiel`, `resolverEnInforme` (`archivos.ts`); `describirProyecto` para saber cuál es el `.bib`.
- Produces:

```ts
export interface Referencias {
  agregar(bibtex: string, alRepetir: 'preguntar' | 'renombrar'): Promise<ResultadoAgregar>;
}
// `bibliografia` devuelve la ruta del .bib dentro del informe, o null si el informe no declara ninguno.
// `antesDeEscribir` existe para las pruebas: corre entre decidir y escribir.
export function crearReferencias(
  dirInforme: string, bibliografia: () => Promise<string | null>, o?: { antesDeEscribir?: () => Promise<void> },
): Referencias;
```

- Ruta: `POST /api/referencias` con `{ bibtex: string, alRepetir?: 'preguntar' | 'renombrar' }` → 200 con el `ResultadoAgregar` (también cuando es `invalido`: es una respuesta, no un error); 400 `{ mensaje: 'Pedido mal formado.' }` si `bibtex` no es texto o supera 200 000 caracteres. `Dependencias` suma `referencias: Referencias`. La ruta corre dentro de `enSerie`.

`agregar`: lee los bytes del `.bib`; decide con `planearAgregado`; si `agregar` no es vacío, escribe `bytes originales + codificar(agregar, finDeLinea del archivo, false)`. Nunca reescribe el archivo entero a partir del texto decodificado. Justo antes de escribir vuelve a leer el archivo: si cambió desde que se decidió (alguien lo guardó desde VS Code), decide de nuevo sobre el contenido nuevo, una sola vez; si volvió a cambiar, no escribe y responde `invalido` con `'referencias.bib cambió mientras se agregaba la referencia. Probá de nuevo.'`. Casos `invalido`: sin bibliografía → `'El informe no tiene un archivo de referencias. Agregá \\bibliography{referencias} a main.tex.'`; el archivo no es reproducible (`!esFiel`) → `'referencias.bib no está en UTF-8 o mezcla fines de línea: no se puede modificar desde el editor sin dañarlo.'` (con el nombre real del archivo).

- [ ] **Step 1: Escribir las pruebas que fallan de `referencias.test.ts`**, sobre una copia del fixture en un directorio temporal (`PHAM` como en la tarea 4):

```ts
it('agrega al final y no cambia ningún byte anterior', async () => {
  const antes = fs.readFileSync(bib);
  expect(await referencias.agregar(PHAM, 'preguntar')).toMatchObject({ tipo: 'ok', referencias: [{ tipo: 'agregada', clave: 'pham_topicgpt_2024' }] });
  const despues = fs.readFileSync(bib);
  expect(despues.subarray(0, antes.length).equals(antes)).toBe(true);
  expect(analizarBib(despues.toString('utf8').replace(/\r\n/g, '\n')).entradas.at(-1)!.clave).toBe('pham_topicgpt_2024');
});
it.each([['CRLF', '\r\n'], ['LF', '\n']])('respeta un archivo en %s', async (_n, fin) => {
  fs.writeFileSync(bib, `@misc{a, title = {x}}${fin}`);
  await referencias.agregar(PHAM, 'preguntar');
  const texto = fs.readFileSync(bib, 'utf8');
  expect(texto).toBe(`@misc{a, title = {x}}${fin}${fin}${PHAM.replace(/\n/g, fin)}${fin}`);
});
it('un archivo sin salto final queda bien formado', async () => {
  fs.writeFileSync(bib, '@misc{a, title = {x}}');
  await referencias.agregar(PHAM, 'preguntar');
  expect(fs.readFileSync(bib, 'utf8')).toBe(`@misc{a, title = {x}}\n\n${PHAM}\n`);
});
it('conserva el BOM si lo había', async () => {
  fs.writeFileSync(bib, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('@misc{a, title = {x}}\n')]));
  await referencias.agregar(PHAM, 'preguntar');
  expect(fs.readFileSync(bib).subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
});
it('si no hay nada que agregar, no toca el archivo', async () => {
  await referencias.agregar(PHAM, 'preguntar');
  const marca = fs.statSync(bib).mtimeMs;
  const antes = fs.readFileSync(bib);
  expect(await referencias.agregar(PHAM, 'preguntar')).toMatchObject({ referencias: [{ tipo: 'ya-estaba' }] });
  expect(await referencias.agregar('nada', 'preguntar')).toMatchObject({ tipo: 'invalido' });
  expect(fs.readFileSync(bib).equals(antes)).toBe(true);
  expect(fs.statSync(bib).mtimeMs).toBe(marca);
});
it('se niega ante un archivo en Latin-1 o con fines de línea mezclados', async () => {
  for (const bytes of [Buffer.from('@misc{a, title = {an\xe1lisis}}\n', 'latin1'), Buffer.from('@misc{a,\r\n title = {x}}\n')]) {
    fs.writeFileSync(bib, bytes);
    expect(await referencias.agregar(PHAM, 'preguntar')).toEqual({ tipo: 'invalido', mensaje: 'referencias.bib no está en UTF-8 o mezcla fines de línea: no se puede modificar desde el editor sin dañarlo.' });
    expect(fs.readFileSync(bib).equals(bytes)).toBe(true);
  }
});
it('sin archivo de referencias lo explica', async () => {
  const sin = crearReferencias(informe, async () => null);
  expect(await sin.agregar(PHAM, 'preguntar')).toEqual({ tipo: 'invalido', mensaje: 'El informe no tiene un archivo de referencias. Agregá \\bibliography{referencias} a main.tex.' });
});
it('si el archivo cambia entre decidir y escribir, no pisa el cambio: decide de nuevo', async () => {
  let veces = 0;
  const r = crearReferencias(informe, async () => 'referencias.bib', {
    antesDeEscribir: async () => { if (veces++ === 0) fs.appendFileSync(bib, '\n@misc{ajena, title = {De otro}}\n'); },
  });
  expect(await r.agregar(PHAM, 'preguntar')).toMatchObject({ tipo: 'ok', referencias: [{ tipo: 'agregada' }] });
  expect(analizarBib(fs.readFileSync(bib, 'utf8').replace(/\r\n/g, '\n')).entradas.map((e) => e.clave).slice(-2)).toEqual(['ajena', 'pham_topicgpt_2024']);
});
it('si cambia dos veces seguidas, no escribe y lo dice', async () => {
  const r = crearReferencias(informe, async () => 'referencias.bib', {
    antesDeEscribir: async () => { fs.appendFileSync(bib, '\n% otra línea\n'); },
  });
  expect(await r.agregar(PHAM, 'preguntar')).toEqual({ tipo: 'invalido', mensaje: 'referencias.bib cambió mientras se agregaba la referencia. Probá de nuevo.' });
  expect(fs.readFileSync(bib, 'utf8')).not.toContain('pham_topicgpt_2024');
});
it('una entrada rota que ya estaba en el archivo no impide agregar', async () => {
  fs.writeFileSync(bib, '@misc{rota, title = {sin cerrar\n\n@misc{b, title = {y}}\n');
  expect(await referencias.agregar(PHAM, 'preguntar')).toMatchObject({ tipo: 'ok', referencias: [{ tipo: 'agregada' }] });
});
```

- [ ] **Step 2: Correr y ver que fallan. Implementar `servidor/referencias.ts`.**
- [ ] **Step 3: Escribir las pruebas que fallan de la ruta** en `app.test.ts`:
  - `POST /api/referencias` con `{ bibtex: PHAM }` → 200, `tipo: 'ok'`, y la entrada está en el disco.
  - Con un texto inválido → 200 `{ tipo: 'invalido', … }`. Sin `bibtex`, con un número, o con 200 001 caracteres → 400 `{ mensaje: 'Pedido mal formado.' }`.
  - `alRepetir: 'renombrar'` llega a la unidad; un valor desconocido se trata como `'preguntar'`.
  - Mientras hay un `git.traer` en curso (mismo patrón que la prueba de subida de imágenes), el agregado espera y el archivo no cambia hasta que Traer termina.
  - Con `Origin` ajeno → 403 y el archivo no cambia.
- [ ] **Step 4: Correr y ver que fallan. Implementar** la ruta y el cableado (`crearReferencias(config.informe, async () => (await describirProyecto(config.informe, config.principal)).bibliografia)`).
- [ ] **Step 5: Correr** `npx vitest run servidor/referencias.test.ts servidor/app.test.ts` → pasan.
- [ ] **Step 6: Commit.** `git commit -m "Servidor: agregar referencias al final del .bib"`

### Task 6: Zotero en el servidor

**Files:**
- Create: `editor/servidor/zotero.ts`, `editor/pruebas/ayudas/zoteroFalso.ts`, `editor/pruebas/fixtures/zotero/items.json`
- Modify: `editor/compartido/tipos.ts`, `editor/servidor/app.ts`, `editor/servidor/index.ts`
- Test: `editor/servidor/zotero.test.ts`, `editor/servidor/app.test.ts`

**Interfaces:**
- Consumes: `Referencias` (tarea 5).
- Produces, en `tipos.ts`:

```ts
export type EstadoZotero = 'disponible' | 'cerrado' | 'sin-permiso' | 'sin-respuesta';
export interface ItemZotero {
  biblioteca: string;          // 'users/0' o 'groups/<id>'
  nombreBiblioteca: string;    // 'Mi biblioteca' o el nombre del grupo
  item: string;                // clave de ítem de Zotero, ocho caracteres
  tipo: string; titulo: string;
  autores: string[];           // apellidos (o el nombre, si es institucional); editores si no hay autores
  anio: string | null; doi: string | null;
}
```

- Produces, en `zotero.ts`:

```ts
export interface Zotero {
  // Nunca lanza. Con un estado distinto de 'disponible', `items` es [].
  items(): Promise<{ estado: EstadoZotero; items: ItemZotero[] }>;
  // El BibTeX de un ítem, o null si ya no existe o Zotero no responde. Lanza RutaInvalida si los identificadores no tienen la forma esperada.
  bibtex(biblioteca: string, item: string): Promise<string | null>;
}
export function crearZotero(o?: { base?: string; esperaMs?: number }): Zotero;   // base 'http://127.0.0.1:23119/api', espera 3000
```

- Produces, en `zoteroFalso.ts`: `crearZoteroFalso(o?: { modo?: 'disponible' | 'sin-permiso' | 'lento'; itemsDeGrupo?: number; grupoQueFalla?: number }): Promise<{ base: string; pedidos: string[]; cerrar(): Promise<void> }>` (`base` termina en `/api`; `itemsDeGrupo` genera esa cantidad de artículos en el grupo 6491700 en lugar de los del fixture) — un servidor HTTP local que responde como el real: `GET /api/users/0/groups`, `…/items/top?format=json&limit=100&start=N` con la cabecera `Total-Results`, `…/items/<clave>?format=bibtex` (404 si no existe), y en `sin-permiso` 403 con el texto `Local API is not enabled`. Registra cada pedido en `pedidos` con su método.
- Rutas: `GET /api/zotero/items` → `{ estado, items }`; `POST /api/zotero/citar` con `{ biblioteca, item, alRepetir? }` → el `ResultadoAgregar` de agregar ese ítem, o `{ tipo: 'invalido', mensaje: 'Zotero ya no tiene ese ítem, o no respondió. Actualizá la búsqueda y probá de nuevo.' }`; identificadores con otra forma → 400. `Dependencias` suma `zotero: Zotero`.

Reglas: `biblioteca` cumple `^(users/0|groups/\d+)$` e `item` cumple `^[A-Z0-9]{8}$`. Bibliotecas: la personal (`users/0`, nombre `'Mi biblioteca'`) y cada grupo de `/users/0/groups` (`data.name`). De cada una, todos los ítems de `items/top`, de a 100, hasta completar `Total-Results`. Se descartan los tipos `attachment`, `note` y `annotation`. Autores: los `creators` con `creatorType: 'author'`, por `lastName`, o `name` si es institucional; si no hay ninguno, los de tipo `editor`. Año: los primeros cuatro dígitos seguidos de `meta.parsedDate`, o de `data.date`. Estados: conexión rechazada → `cerrado`; 403 → `sin-permiso`; ningún pedido puede pasar de `esperaMs` → `sin-respuesta`; cualquier otra falla → `cerrado`. Si una biblioteca falla y otra no, se devuelven los ítems de las que respondieron, con estado `disponible`. Solo se hacen pedidos `GET`.

- [ ] **Step 1: Crear `items.json`** con la forma real de la respuesta (spec 6.5 y la sonda de campos): tres ítems del grupo `6491700` — `ZXBADSCP` (conferencePaper, cinco autores y tres editores, `parsedDate` `2024-06`, DOI), un `journalArticle` con autor institucional (`name`) y sin fecha, y un `attachment` suelto — y dos de `users/0`: una `webpage` sin autores y un `book` con solo editores.
- [ ] **Step 2: Escribir las pruebas que fallan de `zotero.test.ts`:**

```ts
it('junta los ítems de la biblioteca personal y de los grupos, sin adjuntos', async () => {
  const r = await zotero.items();
  expect(r.estado).toBe('disponible');
  expect(r.items.map((i) => [i.biblioteca, i.item, i.tipo])).toEqual([
    ['users/0', expect.any(String), 'webpage'], ['users/0', expect.any(String), 'book'],
    ['groups/6491700', 'ZXBADSCP', 'conferencePaper'], ['groups/6491700', expect.any(String), 'journalArticle'],
  ]);
});
it('de cada ítem saca título, apellidos, año y DOI', async () => {
  const pham = (await zotero.items()).items.find((i) => i.item === 'ZXBADSCP')!;
  expect(pham).toEqual({
    biblioteca: 'groups/6491700', nombreBiblioteca: 'Tesis2026-Cris,Pache,Nacho', item: 'ZXBADSCP', tipo: 'conferencePaper',
    titulo: 'TopicGPT: A Prompt-based Topic Modeling Framework', autores: ['Pham', 'Hoyle', 'Sun', 'Resnik', 'Iyyer'],
    anio: '2024', doi: '10.18653/v1/2024.naacl-long.164',
  });
});
it('autor institucional, sin fecha, sin autores, solo editores', async () => {
  const items = (await zotero.items()).items;
  expect(items.find((i) => i.tipo === 'journalArticle')).toMatchObject({ autores: ['Universidad de la República'], anio: null, doi: null });
  expect(items.find((i) => i.tipo === 'webpage')).toMatchObject({ autores: [] });
  expect(items.find((i) => i.tipo === 'book')!.autores.length).toBeGreaterThan(0);
});
it('pagina de a 100 hasta completar el total', async () => {
  const grande = await crearZoteroFalso({ itemsDeGrupo: 230 });
  const r = await crearZotero({ base: grande.base }).items();
  expect(r.items.filter((i) => i.biblioteca === 'groups/6491700')).toHaveLength(230);
  expect(grande.pedidos.filter((p) => p.includes('/groups/6491700/items/top')).map((p) => new URL(p.slice(4), grande.base).searchParams.get('start') ?? '0'))
    .toEqual(['0', '100', '200']);
  await grande.cerrar();
});
it('Zotero cerrado: sin ítems y sin excepción', async () => {
  const libre = await crearZoteroFalso();
  await libre.cerrar();                                   // ese puerto ya no escucha
  expect(await crearZotero({ base: libre.base }).items()).toEqual({ estado: 'cerrado', items: [] });
});
it('Zotero sin la opción activada', async () => {
  const f = await crearZoteroFalso({ modo: 'sin-permiso' });
  expect(await crearZotero({ base: f.base }).items()).toEqual({ estado: 'sin-permiso', items: [] });
  await f.cerrar();
});
it('Zotero que no contesta a tiempo', async () => {
  const f = await crearZoteroFalso({ modo: 'lento' });    // responde recién a los 2 s
  expect(await crearZotero({ base: f.base, esperaMs: 150 }).items()).toEqual({ estado: 'sin-respuesta', items: [] });
  await f.cerrar();
});
it('si un grupo falla, igual devuelve lo de las otras bibliotecas', async () => {
  const f = await crearZoteroFalso({ grupoQueFalla: 6491700 });   // 500 en los ítems de ese grupo
  const r = await crearZotero({ base: f.base }).items();
  expect(r.estado).toBe('disponible');
  expect(r.items.every((i) => i.biblioteca === 'users/0')).toBe(true);
  expect(r.items.length).toBeGreaterThan(0);
  await f.cerrar();
});
it('entrega el BibTeX de un ítem, y null si ya no existe', async () => {
  expect(await zotero.bibtex('groups/6491700', 'ZXBADSCP')).toContain('@inproceedings{pham_topicgpt_2024,');
  expect(await zotero.bibtex('groups/6491700', 'NOEXISTE')).toBeNull();
});
it.each([['groups/6491700/../../x', 'ZXBADSCP'], ['users/1', 'ZXBADSCP'], ['groups/6491700', '../items'], ['groups/6491700', 'zxbadscp'], ['http://otro', 'ZXBADSCP']])(
  'rechaza identificadores con otra forma: %s %s', async (biblioteca, item) => {
    await expect(zotero.bibtex(biblioteca, item)).rejects.toThrow(RutaInvalida);
  });
it('solo hace pedidos GET', async () => {
  await zotero.items(); await zotero.bibtex('groups/6491700', 'ZXBADSCP');
  expect(falso.pedidos.every((p) => p.startsWith('GET '))).toBe(true);
});
it.skipIf(!zoteroRealResponde)('con el Zotero real: responde y cada ítem tiene título', async () => {
  const r = await crearZotero().items();
  expect(r.estado).toBe('disponible');
  expect(r.items.every((i) => typeof i.titulo === 'string')).toBe(true);
});
```

  (`zoteroRealResponde` se calcula antes de las pruebas con un `GET` a `http://127.0.0.1:23119/api/users/0/groups` con espera de un segundo.)
- [ ] **Step 3: Correr y ver que fallan. Implementar `zoteroFalso.ts` y `zotero.ts`.**
- [ ] **Step 4: Escribir las pruebas que fallan de las rutas** en `app.test.ts`, con un `zotero` falso inyectado en las dependencias:
  - `GET /api/zotero/items` devuelve lo que da la unidad.
  - `POST /api/zotero/citar` con un ítem que existe → 200 `tipo: 'ok'`, la entrada quedó en el `.bib` **sin** `file`, `abstract`, `keywords` ni `annote` (usar `fixtures/zotero/entrada.bib` como respuesta del falso).
  - Ítem inexistente → 200 `{ tipo: 'invalido', mensaje: 'Zotero ya no tiene ese ítem, o no respondió. Actualizá la búsqueda y probá de nuevo.' }` y el `.bib` no cambia.
  - Identificadores con otra forma → 400. `Origin` ajeno → 403.
- [ ] **Step 5: Correr y ver que fallan. Implementar** las rutas (el agregado, dentro de `enSerie`; el pedido a Zotero, fuera) y el cableado.
- [ ] **Step 6: Correr** `npx vitest run servidor` (sin `git.test.ts`) → pasa.
- [ ] **Step 7: Commit.** `git commit -m "Servidor: leer Zotero y citar un ítem agregándolo al .bib"`

### Task 7: Ediciones de citas y candidatos del buscador

**Files:**
- Modify: `editor/cliente/comandos.ts`, `editor/compartido/citas.ts`
- Test: `editor/cliente/comandos.test.ts`, `editor/compartido/citas.test.ts`

**Interfaces:**
- Consumes: el elemento `cita` con sus rangos (tarea 2); `EntradaBib`, `autoresCortos`, `anioDe`, `sinLatex` (tarea 1); `ItemZotero` (tarea 6); `Edicion` (`comandos.ts`).
- Produces, en `comandos.ts`:

```ts
export type FormaDeCita = 'parentetica' | 'textual';      // \cite | \citeA
// La cita que contiene la posición (bordes incluidos), o null.
export function citaEn(texto: string, posicion: number): { forma: FormaDeCita; claves: string[] } | null;
// false dentro de matemática, de un bloque de código o del preámbulo.
export function puedeCitarse(texto: string, posicion: number): boolean;
// Inserta \cite{a, b} o \citeA{a, b} reemplazando la selección; el cursor queda después de la cita.
export function insertarCita(texto: string, sel: Rango, forma: FormaDeCita, claves: string[]): Edicion;
// Cambia solo el nombre del comando y las claves de la cita que contiene la posición; null si no hay cita ahí.
export function cambiarCita(texto: string, posicion: number, forma: FormaDeCita, claves: string[]): Edicion | null;
```

- Produces, en `citas.ts`:

```ts
export interface Candidato {
  origen: 'informe' | 'zotero';
  clave: string | null;                       // la del .bib; null si todavía no está
  zotero: { biblioteca: string; item: string } | null;
  autores: string; anio: string; titulo: string;   // para mostrar
  detalle: string;                            // 'en el informe' o el nombre de la biblioteca de Zotero
}
// Los del informe, en el orden del .bib; después los de Zotero que no son ninguna de esas obras, por autor y año.
export function candidatos(entradas: EntradaBib[], items: ItemZotero[]): Candidato[];
// Sin tildes ni mayúsculas; todas las palabras tienen que aparecer en autores, título, año o clave.
export function filtrarCandidatos(lista: Candidato[], consulta: string): Candidato[];
```

Reglas: `cambiarCita` conserva los argumentos opcionales, el espaciado y los prefijos `full`/`short`; si la cita usa un comando que no es `cite` ni `citeA` (con o sin prefijo) y la forma pedida coincide con la que ya tiene por `citaEn`, no toca el comando. `citaEn` da `'textual'` para `citeA` y sus prefijos, y `'parentetica'` para todo lo demás. Con las mismas claves y la misma forma, `cambios` es `[]`. `insertarCita` con `claves` vacío devuelve una edición sin cambios. `candidatos`: un ítem de Zotero es "la misma obra" que una entrada si coinciden el DOI, o el título (normalizado como en la tarea 4) y el año; en ese caso no aparece. Un ítem de Zotero muestra `autores` con la misma regla que `autoresCortos` (uno, dos con "y", tres o más con "et al."; sin autores, el comienzo del título) y `anio` `'s.f.'` si no tiene.

- [ ] **Step 1: Escribir las pruebas que fallan** de `comandos.test.ts`:

```ts
it('insertarCita en el cursor y sobre una selección', () => {
  expect(aplicar('según  x', insertarCita('según  x', { desde: 6, hasta: 6 }, 'parentetica', ['a', 'b'])).texto).toBe('según \\cite{a, b} x');
  expect(aplicar('según XX x', insertarCita('según XX x', { desde: 6, hasta: 8 }, 'textual', ['a'])).texto).toBe('según \\citeA{a} x');
  const e = insertarCita('ab', { desde: 1, hasta: 1 }, 'parentetica', ['k']);
  expect(e.seleccion).toEqual({ ancla: 9, cabeza: 9 });
  expect(insertarCita('ab', { desde: 1, hasta: 1 }, 'parentetica', []).cambios).toEqual([]);
});
it('cambiarCita toca solo el comando y las claves', () => {
  const t = 'x \\cite<ver>[p.~3]{ a , b } y';
  expect(aplicar(t, cambiarCita(t, 4, 'textual', ['c'])!).texto).toBe('x \\citeA<ver>[p.~3]{c} y');
  expect(cambiarCita(t, 4, 'parentetica', ['a', 'b'])!.cambios).toEqual([]);
  expect(aplicar(t, cambiarCita(t, 4, 'parentetica', ['a', 'b', 'c'])!).texto).toBe('x \\cite<ver>[p.~3]{a, b, c} y');
  expect(cambiarCita(t, 0, 'textual', ['c'])).toBeNull();
});
it('cambiarCita conserva los prefijos y los comandos que no conoce', () => {
  expect(aplicar('\\fullcite{a}', cambiarCita('\\fullcite{a}', 3, 'textual', ['a'])!).texto).toBe('\\fullciteA{a}');
  expect(aplicar('\\shortciteA{a}', cambiarCita('\\shortciteA{a}', 3, 'parentetica', ['a'])!).texto).toBe('\\shortcite{a}');
  expect(aplicar('\\citeNP{a}', cambiarCita('\\citeNP{a}', 3, 'parentetica', ['b'])!).texto).toBe('\\citeNP{b}');
  expect(aplicar('\\citeNP{a}', cambiarCita('\\citeNP{a}', 3, 'textual', ['b'])!).texto).toBe('\\citeA{b}');
});
it('citaEn', () => {
  expect(citaEn('x \\citeA{a, b} y', 5)).toEqual({ forma: 'textual', claves: ['a', 'b'] });
  expect(citaEn('x \\citeyear{a} y', 2)).toEqual({ forma: 'parentetica', claves: ['a'] });
  expect(citaEn('x \\cite{a} y', 0)).toBeNull();
});
it.each([
  ['en un párrafo', 'hola mundo', 4, true], ['en un título', '\\section{Hola}', 10, true], ['en un epígrafe', '\\begin{figure}\\includegraphics{a}\\caption{Hola}\\end{figure}', 44, true],
  ['en una fórmula en línea', 'sea $a+b$ x', 6, false], ['en una ecuación', '\\begin{equation}\na\n\\end{equation}', 18, false],
  ['en un bloque de código', '\\begin{lstlisting}\nx\n\\end{lstlisting}', 19, false], ['en el preámbulo', '\\documentclass{book}\n\\begin{document}\nx', 5, false],
  ['justo después de una fórmula', 'sea $a$ x', 7, true],
])('puedeCitarse %s', (_n, t, posicion, esperado) => { expect(puedeCitarse(t, posicion)).toBe(esperado); });
```

  y de `citas.test.ts` (`entradas` del fixture; `items` de `fixtures/zotero/items.json` ya convertidos a `ItemZotero`):

```ts
it('primero los del informe, después los de Zotero que no están', () => {
  const lista = candidatos(entradas, items);
  expect(lista.slice(0, 5).map((c) => [c.origen, c.clave])).toEqual([
    ['informe', 'CitekeyArticle'], ['informe', 'CitekeyBook'], ['informe', 'CitekeyInproceedings'], ['informe', 'CitekeyManual'], ['informe', 'CitekeyMisc'],
  ]);
  expect(lista.slice(5).every((c) => c.origen === 'zotero' && c.clave === null && c.zotero !== null)).toBe(true);
  expect(lista.find((c) => c.zotero?.item === 'ZXBADSCP')).toMatchObject({ autores: 'Pham et al.', anio: '2024', detalle: 'Tesis2026-Cris,Pache,Nacho' });
});
it('un ítem de Zotero que ya está en el .bib no aparece dos veces', () => {
  const yaCargado = analizarBib('@inproceedings{Pham2024, title = {TopicGPT: A Prompt-based Topic Modeling Framework}, year = 2024}').entradas;
  expect(candidatos(yaCargado, items).some((c) => c.zotero?.item === 'ZXBADSCP')).toBe(false);
});
it('filtra por autor, título, año o clave, sin tildes ni mayúsculas, y con todas las palabras', () => {
  const lista = candidatos(entradas, items);
  expect(filtrarCandidatos(lista, 'cohen').map((c) => c.clave)).toEqual(['CitekeyArticle']);
  expect(filtrarCandidatos(lista, 'TOPICGPT pham').map((c) => c.zotero?.item)).toEqual(['ZXBADSCP']);
  expect(filtrarCandidatos(lista, 'republica')).toHaveLength(1);
  expect(filtrarCandidatos(lista, 'cohen 2014')).toEqual([]);
  expect(filtrarCandidatos(lista, 'citekeybook').map((c) => c.clave)).toEqual(['CitekeyBook']);
  expect(filtrarCandidatos(lista, '  ')).toEqual(lista);
});
```

- [ ] **Step 2: Correr y ver que fallan. Implementar.** La normalización del título y la comparación de obras se reusan de `referencias.ts` (tarea 4), no se duplican.
- [ ] **Step 3: Correr** `npx vitest run compartido cliente/comandos.test.ts` → pasa.
- [ ] **Step 4: Commit.** `git commit -m "Citas: insertar, cambiar y candidatos del buscador"`

### Task 8: El buscador

**Files:**
- Create: `editor/cliente/pantalla/buscadorCitas.ts`, `editor/cliente/citar.ts`
- Modify: `editor/cliente/api.ts`, `editor/cliente/atajos.ts`, `editor/cliente/menuBarra.ts`, `editor/cliente/plantillas.ts`, `editor/cliente/main.ts`, `editor/cliente/estilos.css`
- Test: `editor/cliente/citar.test.ts`, `editor/cliente/menuBarra.test.ts`

**Interfaces:**
- Consumes: todo lo anterior; `preguntar` y `el` (`pantalla/dom.ts`); `aplicarEdicion` (`atajos.ts`); `ControlEditor` (`editor.ts`).
- Produces, en `api.ts`: `api.referencias.agregar(bibtex, alRepetir?)`, `api.zotero.items()`, `api.zotero.citar(biblioteca, item, alRepetir?)`.
- Produces, en `citar.ts` (la lógica, sin DOM):

```ts
export interface Citador {
  agregar(bibtex: string, alRepetir?: 'preguntar' | 'renombrar'): Promise<ResultadoAgregar>;
  citarDeZotero(biblioteca: string, item: string, alRepetir?: 'preguntar' | 'renombrar'): Promise<ResultadoAgregar>;
  preguntar: typeof preguntar;
  avisar(mensaje: string, tipo: 'info' | 'error'): void;
  // Antes de que el servidor toque el .bib: guarda lo pendiente. Después: recarga el .bib si está abierto y la bibliografía.
  antesDeAgregar(): Promise<boolean>;
  despuesDeAgregar(): Promise<void>;
}
// Convierte lo elegido en claves del .bib, agregando lo que falte. null si se canceló o algo falló.
export function resolverClaves(elegidos: Candidato[], c: Citador): Promise<string[] | null>;
// Agrega lo pegado; devuelve las claves que quedaron disponibles (agregadas o que ya estaban), o null.
export function agregarPegado(bibtex: string, c: Citador): Promise<string[] | null>;
```

- Produces, en `buscadorCitas.ts`: `buscarCita(o: { candidatos(): Promise<{ lista: Candidato[]; aviso: string | null }>; formaInicial: FormaDeCita; marcadas: string[]; agregarPegado(bibtex: string): Promise<string[] | null> }): Promise<{ forma: FormaDeCita; elegidos: Candidato[] } | null>`.
- Produces, en `menuBarra.ts`: `ContextoMenu` suma `citar(vista: EditorView): void`. En `plantillas.ts`, la plantilla `cita` pasa a ser `{ id: 'cita', nombre: 'Cita', accion: 'buscar-cita' }` (la unión `Plantilla` suma esa acción).
- Atajo: `Mod-k` abre el buscador.

Comportamiento de `resolverClaves`: los candidatos del informe aportan su clave. Si hay alguno de Zotero: primero `antesDeAgregar()` (si devuelve `false`, se avisa `'No se pudo guardar referencias.bib. Probá de nuevo.'` y se devuelve `null`); después, de a uno, `citarDeZotero`. `agregada` y `ya-estaba` aportan la clave del resultado. `clave-repetida` pregunta `'En el informe ya hay otra referencia con la clave <clave>.'` con `'Agregar como <sugerida>'` y `'Cancelar'` (neutra): la primera repite el pedido con `'renombrar'`; la segunda devuelve `null`. `invalido` avisa su mensaje como error y devuelve `null`. Una excepción (sin conexión) avisa `'No se pudo agregar la referencia. Probá de nuevo.'` y devuelve `null`. Al final, si se agregó algo, `despuesDeAgregar()`; las advertencias de todas las referencias se avisan juntas, una por línea, como error (para que no se vayan solas). Las claves salen en el orden de `elegidos`, sin repetidas.

`agregarPegado` sigue las mismas reglas con `agregar`; con varias entradas, pregunta por cada clave repetida.

El diálogo (`buscadorCitas.ts`):
- Título `Citar`. Campo `Buscar por autor, título o año`, con el foco al abrir.
- Lista de resultados: cada uno con una casilla, `autores (año)`, el título debajo, y a la derecha el `detalle`. Flechas arriba y abajo mueven el resaltado; la barra espaciadora o un clic marca; Enter acepta lo marcado o, si no hay nada marcado, el resaltado.
- Debajo, la línea de aviso (`aviso`), por ejemplo `'Zotero está cerrado: se muestran solo las referencias del informe.'`, `'Zotero no permite la conexión. Activá "Permitir que otras aplicaciones de este equipo se comuniquen con Zotero" en Ajustes → Avanzado.'`, `'Zotero no respondió a tiempo: se muestran solo las referencias del informe.'`. Con Zotero disponible, sin aviso.
- Forma: dos botones de opción, `(Autor, año)` y `Autor (año)`; Tab alterna entre el campo y ellos.
- Botones: `Citar` (principal, deshabilitado sin nada elegido), `Agregar referencia…`, `Cancelar`. Escape cancela.
- `Agregar referencia…` cambia el diálogo a un área de texto `Pegá acá la referencia en formato BibTeX` con `Agregar` y `Volver`; al agregar con éxito vuelve a la lista con esas claves marcadas.
- Sin resultados: `'Ninguna referencia coincide. Probá con otra palabra, o usá "Agregar referencia…".'`

Cableado en `main.ts`, función `citar(vista)`:
1. Si el editor está en solo lectura, no hace nada.
2. Si `!puedeCitarse(texto, cursor)`: `barra.avisar('Acá no se puede citar: el cursor está dentro de una fórmula, de un bloque de código o del encabezado del documento.', 'info')`.
3. `citaEn(texto, cursor)` decide si se cambia una cita (forma y claves marcadas iniciales) o se inserta una nueva.
4. Abre el buscador. Los candidatos salen de la `bibliografia` en memoria y de `api.zotero.items()`; el aviso, del estado de Zotero. Si el lector informó problemas en el `.bib`, el aviso suma una línea por cada uno: `'referencias.bib, línea <n>: <mensaje>'` (esas entradas no aparecen en la lista; las demás sí).
5. Con lo elegido: `resolverClaves`; después, si el editor sigue editable, `cambiarCita` o `insertarCita` sobre el texto y la posición de ese momento.

`alElegirCita` (tarea 3) llama a `citar` después de poner el cursor en esa cita sin mostrar su código: la selección se pone en la posición del widget solo en el momento de aplicar el cambio. `antesDeAgregar` es `editor.guardarAhora()` seguido de `!editor.hayCambiosSinGuardar()`; `despuesDeAgregar` recarga el archivo abierto si es el `.bib` y llama a `recargarProyecto()`.

- [ ] **Step 1: Escribir las pruebas que fallan de `citar.test.ts`**, con un `Citador` falso (`vi.fn`), siguiendo el estilo de `cliente/imagenes.test.ts`:
  - Solo candidatos del informe → sus claves, sin llamar a `antesDeAgregar` ni a `citarDeZotero`.
  - Uno de Zotero → `antesDeAgregar`, `citarDeZotero('groups/6491700', 'ZXBADSCP', undefined)`, `despuesDeAgregar`, y la clave del resultado.
  - `ya-estaba` con otra clave → se usa la clave existente.
  - Mezcla de informe y Zotero, con uno repetido → orden de `elegidos`, sin duplicados.
  - `clave-repetida` → pregunta con los dos textos exactos; "Agregar como…" repite con `'renombrar'`; "Cancelar" → `null` y no llama a `despuesDeAgregar`… salvo que ya se hubiera agregado otra referencia antes, en cuyo caso sí la llama.
  - `invalido` → avisa el mensaje y `null`. Excepción → `'No se pudo agregar la referencia. Probá de nuevo.'` y `null`.
  - `antesDeAgregar` devuelve `false` → avisa `'No se pudo guardar referencias.bib. Probá de nuevo.'`, `null`, y no llama a `citarDeZotero`.
  - Advertencias de dos referencias → un solo aviso de tipo `'error'` con las dos líneas.
  - `agregarPegado`: una entrada agregada, una que ya estaba y una con clave repetida que se renombra → las tres claves.
- [ ] **Step 2: Correr y ver que fallan. Implementar `citar.ts` y lo nuevo de `api.ts`.**
- [ ] **Step 3: Actualizar `menuBarra.test.ts`:** la plantilla `cita` ya no tiene texto; las plantillas sin texto son exactamente `figura` (`elegir-imagen`) y `cita` (`buscar-cita`). Correr y ver que falla; cambiar `plantillas.ts` y `menuBarra.ts`.
- [ ] **Step 4: Implementar `buscadorCitas.ts`, el atajo y el cableado de `main.ts`; estilos.**
- [ ] **Step 5: Correr** `npx vitest run --exclude servidor/git.test.ts`, `npx tsc --noEmit -p .` y `npm run build` → pasan.
- [ ] **Step 6: Commit.** `git commit -m "Buscador de citas con Zotero y pegado de BibTeX"`

### Task 9: Guía, verificación manual, revisión e integración

**Files:**
- Modify: `editor/INSTALACION.md`

- [ ] **Step 1: Guía.** En "Uso diario", sección nueva "Citas": cómo se ven; cómo abrir el buscador (`/` → Cita, `Ctrl+K`, clic en una cita); las dos formas; marcar varias; qué significa una cita en rojo; Zotero (dejarlo abierto, la opción de Ajustes → Avanzado, qué pasa si está cerrado); que al citar algo de Zotero se agrega al final de `referencias.bib` y viaja con el próximo Enviar; qué se quita (ruta del PDF, notas personales, resumen, palabras clave); las dos advertencias y cómo se resuelven; pegar BibTeX. En "Qué no hace", quitar "ni busca citas". En "Requisitos", Zotero como opcional.
- [ ] **Step 2: Suite completa.** `npx vitest run` → todo pasa. `npm run build` sin errores.
- [ ] **Step 3: Verificación manual** en el entorno de prueba (4327/4329), con el Zotero real de Cristhian abierto:
  1. Las cinco citas del capítulo 1 del fixture se ven como autor y año; una clave inventada, en rojo.
  2. `Ctrl+K` en un párrafo: buscar "cohen", Enter → `\cite{CitekeyArticle}`; el cursor queda después.
  3. Buscar un paper que esté solo en Zotero, forma `Autor (año)`, Enter → la entrada aparece al final de `referencias.bib` del entorno de prueba, sin `file`, `annote`, `abstract` ni `keywords`; `git diff` del clon de prueba muestra solo líneas agregadas al final. La pastilla se ve con autor y año.
  4. Citar el mismo paper otra vez: no se duplica en el `.bib`.
  5. Citar una de las tesis catalogadas como artículo: aparece la advertencia de la revista.
  6. Marcar tres resultados → una sola cita con tres claves.
  7. Clic en una cita → el buscador abre con sus claves marcadas; cambiar la forma → cambia solo el comando.
  8. `Ctrl+K` dentro de una ecuación y de un bloque de código → el aviso, sin buscador.
  9. Cerrar Zotero → el aviso de "cerrado" y la búsqueda sobre el `.bib` sigue andando.
  10. "Agregar referencia…": pegar una entrada válida, una rota, una con la clave de otra obra.
  11. Con `referencias.bib` abierto en el editor y un cambio sin guardar, citar algo de Zotero: el cambio no se pierde y la entrada nueva aparece.
  12. Compilar: la bibliografía sale con las entradas citadas. Enviar: al remoto simulado llegan el `.tex` y el `.bib`, y nada más.
  13. Abrir cada archivo sin editar: ninguno queda modificado.
  14. Con el monitor de red del navegador y el registro de pedidos: hacia Zotero solo salieron `GET`.
- [ ] **Step 4: Commit** de la guía y de los ajustes que hayan salido, cada uno con su prueba.
- [ ] **Step 5: Revisión independiente** de toda la rama contra la especificación y este plan.
- [ ] **Step 6: Integración.** Con el visto bueno de Cristhian y su editor cerrado: fusionar en `main`, y en `Tesis/editor/` correr `npm install` y `npm run build`.
