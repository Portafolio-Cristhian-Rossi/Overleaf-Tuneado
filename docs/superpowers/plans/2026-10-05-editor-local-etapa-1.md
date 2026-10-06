# Editor local del informe, etapa 1: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una aplicación web local que abre los `.tex` del informe, los muestra como prosa formateada, sincroniza con Overleaf por Git y compila el PDF.

**Architecture:** Servidor Node en `127.0.0.1` (archivos, Git, compilación) y cliente en el navegador con CodeMirror 6. El documento en memoria es siempre el texto literal del `.tex`; la presentación son decoraciones sobre ese texto. El analizador de LaTeX es una función pura compartida entre servidor y cliente.

**Tech Stack:** TypeScript, Node 24, Express 5, `tsx`, Vite, Vitest, CodeMirror 6 (`@codemirror/state`, `view`, `commands`, `language`, `autocomplete`, `search`), MiKTeX, PowerShell 5.1 para el lanzador.

**Spec:** `docs/superpowers/specs/2026-10-05-editor-local-informe-design.md` (secciones 3, 4 y 6). Leerla antes de empezar.

## Global Constraints

- Plataforma: Windows 11, Node ≥ 24, Git ≥ 2.54. Los scripts `.ps1` deben correr en Windows PowerShell 5.1 (sin `&&`, sin `?:`, sin `??`).
- **Invariante de fidelidad:** abrir y guardar un archivo sin editar produce los mismos bytes. Una edición cambia solo los caracteres tocados.
- `informe/` es un documento compartido con otras cuatro personas. Las pruebas automáticas nunca escriben en `Tesis/informe/` ni contactan a Overleaf: usan `pruebas/fixtures/` y directorios temporales. Leer `informe/` sí está permitido.
- Ningún `git push` al remoto real sin confirmación explícita de Cristhian en la sesión (solo ocurre en la tarea 12).
- Nunca leer, guardar, pedir ni imprimir credenciales. Todo `git` lanzado por la aplicación lleva `GIT_TERMINAL_PROMPT=0` y `GCM_INTERACTIVE=Never`.
- Git: nunca `--force`, nunca `rebase`, nunca tocar la configuración de credenciales.
- Nunca modificar `prgrado.cls`. Los paquetes se agregan en el archivo principal.
- El servidor escucha solo en `127.0.0.1`. Puerto por defecto `4317`.
- Dependencias: solo las del Tech Stack. Sin framework de interfaz.
- Toda la interfaz en español rioplatense (voseo), sin mayúsculas de título, sin signos de exclamación. Los textos entre comillas de este plan son copia exacta.
- Identificadores del código en español, como en la especificación.
- Las posiciones (`desde`, `hasta`) son índices sobre el texto con saltos de línea normalizados a `\n`, `hasta` exclusivo.
- Commits del repositorio `Tesis/` en español, uno por tarea como mínimo.

## Review Focus

1. **Temporales de LaTeX dentro de `informe/`.** Si alguien compila ahí con VS Code u otra herramienta, aparecen `.aux`, `.log`, `main.pdf`. Enviar no debe subirlos a Overleaf. Prueba en la tarea 5.
2. **El archivo abierto fue borrado o renombrado por un compañero.** Después de Traer, el guardado automático no debe recrearlo; el editor avisa. Prueba en la tarea 2 y comportamiento en la tarea 8.
3. **Archivo con BOM o con fines de línea mezclados.** Abrirlo y guardarlo sin editar no debe hacerlo figurar como modificado en Git. Prueba en las tareas 2 y 5.
4. **Compilación que no termina.** MiKTeX esperando un paquete o un bucle de LaTeX: se corta por tiempo, informa, y la siguiente compilación funciona. Prueba en la tarea 6.
5. **Texto pegado desde Word o un PDF.** Comillas tipográficas, rayas, espacios duros: `pdflatex` falla con un error críptico. El panel debe decir qué carácter es. Prueba en la tarea 6.

## Estructura de archivos

```
Tesis/
├── .gitignore
├── docs/superpowers/{specs,plans}/
└── editor/
    ├── package.json, tsconfig.json, vite.config.ts, config.json
    ├── INSTALACION.md
    ├── compartido/        usado por servidor y cliente
    │   ├── tipos.ts          tipos de datos del API
    │   ├── analizador.ts     texto LaTeX → elementos reconocidos
    │   └── numeracion.ts     elementos → números de título
    ├── servidor/
    │   ├── config.ts         carga config.json
    │   ├── archivos.ts       leer y escribir con fidelidad
    │   ├── proyecto.ts       capítulos, etiquetas, paquetes
    │   ├── git.ts            sincronización
    │   ├── logLatex.ts       log de LaTeX → problemas legibles
    │   ├── compilar.ts       secuencia pdflatex y bibtex
    │   ├── vigia.ts          cierre automático por inactividad
    │   ├── app.ts            rutas HTTP
    │   └── index.ts          arranque
    ├── cliente/
    │   ├── index.html, main.ts, estilos.css
    │   ├── api.ts            llamadas al servidor
    │   ├── editor.ts         CodeMirror, guardado automático
    │   ├── vista.ts          decoraciones
    │   ├── comandos.ts       negrita, cursiva, nivel de título, paquetes
    │   ├── plantillas.ts     plantillas del menú /
    │   ├── menuBarra.ts      menú / y autocompletado de \ref
    │   └── pantalla/         lateral.ts, barra.ts, sincronizacion.ts,
    │                         bloqueoConflicto.ts, panelPdf.ts
    ├── lanzador/           abrir.ps1, crear-acceso-directo.ps1
    └── pruebas/
        ├── fixtures/informe/   copia de los .tex, .bib y .cls actuales
        ├── fixtures/logs/      logs de LaTeX de ejemplo
        └── ayudas/             entornoPrueba.ts, companero.ts
```

Las pruebas van junto al código: `x.ts` y `x.test.ts`.

---

### Task 1: Andamiaje, tipos y configuración

**Files:**
- Create: `Tesis/.gitignore`, `editor/package.json`, `editor/tsconfig.json`, `editor/vite.config.ts`, `editor/config.json`
- Create: `editor/compartido/tipos.ts`, `editor/servidor/config.ts`
- Create: `editor/pruebas/fixtures/informe/` (copia de `main.tex`, `Cap1.tex`…`Cap6.tex`, `referencias.bib`, `prgrado.cls` desde `Tesis/informe/`)
- Test: `editor/servidor/config.test.ts`

**Interfaces:**
- Produces: todos los tipos de `compartido/tipos.ts` (abajo, completos) y
  `cargarConfig(dirEditor: string, archivo?: string): Config`, donde `archivo` vale por defecto `process.env.EDITOR_CONFIG ?? 'config.json'`.

- [ ] **Step 1: Crear el repositorio y el andamiaje**

En `Tesis/`: `git init -b main`. `.gitignore` con `informe/`, `build/`, `node_modules/`, `editor/dist/`, `editor/config.prueba.json`, `editor/.entorno-prueba/`. Verificar que `git status` no lista nada de `informe/`.

`editor/package.json`: `"type": "module"`, y scripts:

```json
{
  "servir": "node --import tsx servidor/index.ts",
  "dev": "vite",
  "build": "vite build",
  "start": "npm run build && npm run servir",
  "test": "vitest run",
  "entorno-prueba": "node --import tsx pruebas/ayudas/entornoPrueba.ts",
  "companero": "node --import tsx pruebas/ayudas/companero.ts",
  "acceso-directo": "powershell -NoProfile -ExecutionPolicy Bypass -File lanzador/crear-acceso-directo.ps1"
}
```

`vite.config.ts`: `root: 'cliente'`, `build.outDir: '../dist'`, proxy de `/api` a `http://127.0.0.1:4317`, y Vitest incluyendo `**/*.test.ts` de `compartido`, `servidor` y `cliente` con entorno `node`.

`config.json`:

```json
{ "informe": "../informe", "build": "../build", "principal": "main.tex", "puerto": 4317, "compilarAlGuardar": false }
```

- [ ] **Step 2: Escribir `compartido/tipos.ts`**

```ts
export type FinDeLinea = '\r\n' | '\n';

export interface Config {
  informe: string; build: string;      // rutas absolutas
  principal: string; puerto: number; compilarAlGuardar: boolean;
}

export interface ArchivoLeido {
  contenido: string;                   // saltos normalizados a \n, sin BOM
  finDeLinea: FinDeLinea; bom: boolean;
  version: string;                     // SHA-1 hex de los bytes en disco
}
export type ResultadoEscritura =
  | { tipo: 'ok'; version: string }
  | { tipo: 'cambio-en-disco'; actual: ArchivoLeido }
  | { tipo: 'desaparecido' };

export interface Capitulo { ruta: string; titulo: string; numero: string | null }
export interface Etiqueta {
  nombre: string; ruta: string; linea: number;   // línea desde 1
  titulo: string; numero: string | null;
}
export interface Proyecto {
  capitulos: Capitulo[]; etiquetas: Etiqueta[];
  paquetes: string[]; bibliografia: string | null;
}

export interface EstadoGit {
  cambiosLocales: boolean; commitsSinEnviar: number; commitsSinTraer: number;
  combinacionEnCurso: boolean; archivosEnConflicto: string[];
}
export type ErrorRed = { tipo: 'error'; motivo: 'autenticacion' | 'sin-conexion' | 'otro'; mensaje: string };
export type ResultadoTraer =
  | { tipo: 'ok'; archivosCambiados: string[] }
  | { tipo: 'conflicto'; archivos: string[] } | ErrorRed;
export type ResultadoEnviar =
  | { tipo: 'ok'; enviado: boolean }
  | { tipo: 'conflicto'; archivos: string[] }
  | { tipo: 'rechazado'; mensaje: string } | ErrorRed;
export type ResultadoTerminar = { tipo: 'ok' } | { tipo: 'quedan-marcas'; archivos: string[] };

export interface ProblemaLatex {
  gravedad: 'error' | 'advertencia';
  ruta: string | null; linea: number | null;
  mensaje: string;                     // en español si es de los conocidos
  original: string;
}
export type ResultadoCompilacion =
  | { tipo: 'ok' | 'con-errores'; problemas: ProblemaLatex[]; pdfActualizado: boolean }
  | { tipo: 'sin-latex' } | { tipo: 'vencido' };
```

- [ ] **Step 3: Escribir la prueba de configuración (falla)**

```ts
it('resuelve las rutas como absolutas respecto de editor/', () => {
  const c = cargarConfig(dirTemporalCon({ informe: '../informe', build: '../build' }));
  expect(path.isAbsolute(c.informe)).toBe(true);
  expect(c.informe).toBe(path.resolve(dir, '../informe'));
});
it('usa los valores por defecto para lo que falte', () => {
  const c = cargarConfig(dirTemporalCon({}));
  expect(c).toMatchObject({ principal: 'main.tex', puerto: 4317, compilarAlGuardar: false });
});
it('rechaza un puerto que no es entero entre 1024 y 65535', () => {
  expect(() => cargarConfig(dirTemporalCon({ puerto: 'x' }))).toThrow(/puerto/);
});
it('lee el archivo indicado por el segundo argumento', () => { /* config.prueba.json */ });
```

Run: `npm test -- servidor/config` → FAIL (no existe `cargarConfig`).

- [ ] **Step 4: Implementar `cargarConfig` y verificar**

Run: `npm test -- servidor/config` → PASS.

- [ ] **Step 5: Commit**

`git add .gitignore docs editor` y commit `Andamiaje del editor, tipos y configuración`. Incluye la especificación y este plan.

---

### Task 2: Archivos con fidelidad

**Files:**
- Create: `editor/servidor/archivos.ts`
- Test: `editor/servidor/archivos.test.ts`

**Interfaces:**
- Consumes: `ArchivoLeido`, `ResultadoEscritura`, `FinDeLinea`.
- Produces:

```ts
export function decodificar(bytes: Buffer): Omit<ArchivoLeido, 'version'>;
export function codificar(contenido: string, finDeLinea: FinDeLinea, bom: boolean): Buffer;
export function versionDe(bytes: Buffer): string;
export class RutaInvalida extends Error {}
export interface Archivos {
  leer(ruta: string): Promise<ArchivoLeido>;
  escribir(ruta: string, datos: {
    contenido: string; finDeLinea: FinDeLinea; bom: boolean;
    versionBase: string; forzar?: boolean;
  }): Promise<ResultadoEscritura>;
}
export function crearArchivos(dirInforme: string): Archivos;
```

Reglas que la firma no determina:
- `ruta` es relativa a `dirInforme`, con `/`. Se rechaza con `RutaInvalida` si resuelve fuera de `dirInforme`, si pasa por `.git`, o si al escribir la extensión no es `.tex` ni `.bib`.
- `finDeLinea` detectado: el más frecuente entre `\r\n` y `\n` suelto; si no hay saltos o hay empate, `\n`.
- `escribir` compara `versionBase` con la versión actual en disco. Si difieren y no hay `forzar`, devuelve `cambio-en-disco` con el archivo actual. Si el archivo no existe, devuelve `desaparecido` siempre, también con `forzar`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

```ts
describe('fidelidad', () => {
  // Solo lectura sobre el informe real, si existe; siempre sobre los fixtures.
  it.each(archivosDe('pruebas/fixtures/informe', '../informe'))('%s vuelve idéntico', (ruta) => {
    const bytes = fs.readFileSync(ruta);
    const d = decodificar(bytes);
    expect(codificar(d.contenido, d.finDeLinea, d.bom).equals(bytes)).toBe(true);
  });
  it.each([
    ['CRLF', 'a\r\nb\r\n'], ['LF', 'a\nb\n'], ['sin salto final', 'a\r\nb'],
    ['espacios al final', 'a  \r\n\tb \r\n'], ['vacío', ''], ['tildes', 'análisis ñ\n'],
  ])('%s vuelve idéntico', (_n, texto) => { /* misma comprobación */ });
  it('conserva el BOM', () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a\n')]);
    const d = decodificar(bytes);
    expect(d.bom).toBe(true); expect(d.contenido).toBe('a\n');
    expect(codificar(d.contenido, d.finDeLinea, d.bom).equals(bytes)).toBe(true);
  });
  it('entrega el contenido solo con \\n', () => {
    expect(decodificar(Buffer.from('a\r\nb\r\n'))).toMatchObject({ contenido: 'a\nb\n', finDeLinea: '\r\n' });
  });
  it('con fines mezclados elige el más frecuente', () => {
    expect(decodificar(Buffer.from('a\r\nb\r\nc\n')).finDeLinea).toBe('\r\n');
  });
});
describe('crearArchivos', () => {
  it('escribe cuando versionBase coincide y devuelve la versión nueva');
  it('devuelve cambio-en-disco, sin escribir, si el archivo cambió', async () => {
    const leido = await a.leer('Cap1.tex');
    fs.writeFileSync(ruta, 'otro contenido\n');
    const r = await a.escribir('Cap1.tex', { ...leido, contenido: 'mío\n', versionBase: leido.version });
    expect(r.tipo).toBe('cambio-en-disco');
    expect(fs.readFileSync(ruta, 'utf8')).toBe('otro contenido\n');
  });
  it('con forzar sobrescribe aunque haya cambiado');
  it('devuelve desaparecido y no recrea el archivo si fue borrado', async () => {
    const leido = await a.leer('Cap1.tex'); fs.rmSync(ruta);
    const r = await a.escribir('Cap1.tex', { ...leido, versionBase: leido.version, forzar: true });
    expect(r.tipo).toBe('desaparecido'); expect(fs.existsSync(ruta)).toBe(false);
  });
  it.each(['../fuera.tex', 'a/../../fuera.tex', '.git/config', 'C:/Windows/x.tex'])('rechaza %s', async (r) => {
    await expect(a.leer(r)).rejects.toBeInstanceOf(RutaInvalida);
  });
  it('rechaza escribir prgrado.cls y una imagen', async () => { /* RutaInvalida */ });
});
```

Run: `npm test -- servidor/archivos` → FAIL.

- [ ] **Step 2: Implementar `archivos.ts` y verificar**

Run: `npm test -- servidor/archivos` → PASS, incluidos los archivos reales de `../informe`.

- [ ] **Step 3: Commit** — `Lectura y escritura de archivos con fidelidad`.

---

### Task 3: Analizador de LaTeX

**Files:**
- Create: `editor/compartido/analizador.ts`
- Test: `editor/compartido/analizador.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Rango { desde: number; hasta: number }
export type Elemento =
  | ({ tipo: 'titulo'; nivel: 0 | 1 | 2 | 3; conAsterisco: boolean; contenido: Rango } & Rango)
  | ({ tipo: 'formato'; estilo: 'negrita' | 'cursiva' | 'mono'; contenido: Rango } & Rango)
  | ({ tipo: 'inicioLista' | 'finLista'; clase: 'itemize' | 'enumerate' } & Rango)
  | ({ tipo: 'item'; ordinal: number | null } & Rango)
  | ({ tipo: 'ref'; clave: string } & Rango)
  | ({ tipo: 'cita'; comando: string; claves: string[] } & Rango)
  | ({ tipo: 'etiqueta'; nombre: string } & Rango)
  | ({ tipo: 'comentario' } & Rango)
  | ({ tipo: 'preambulo' } & Rango);
export function analizar(texto: string): Elemento[];   // ordenados por desde; pueden anidarse
```

Reglas:
- Niveles: `\chapter` 0, `\section` 1, `\subsection` 2, `\subsubsection` 3. `\textbf` negrita; `\textit` y `\emph` cursiva; `\texttt` mono.
- El rango de un comando va de la barra a la llave de cierre inclusive; `contenido` es lo de adentro de las llaves. Las llaves se emparejan respetando anidamiento y los escapes `\{`, `\}`, `\%`, `\\`.
- `item`: el rango cubre solo `\item`. `ordinal` cuenta desde 1 dentro de cada `enumerate` (reinicia en los anidados) y es `null` en `itemize`.
- `cita`: toda la familia de `apacite`, es decir `\cite`, `\citeA`, `\citeNP`, `\citeauthor`, `\citeyear`, `\citeyearNP`, sus variantes `\full…` y `\short…`, y `\nocite`. Admite `<…>` y `[…]` opcionales antes de las llaves. `comando` va sin la barra.
- `comentario`: desde un `%` no escapado hasta el fin de línea, sin incluir el salto. Dentro de un comentario no se reporta nada más.
- `preambulo`: de 0 hasta el inicio de `\begin{document}`; no existe si el texto no lo contiene.
- No se analiza el interior de `verbatim`, `lstlisting`, `minted` ni de `\verb`.
- Entrada mal formada nunca lanza excepción: lo que no cierra, no se reporta.

- [ ] **Step 1: Escribir las pruebas (fallan)**

```ts
it('título simple', () => {
  expect(analizar('\\section{Hola}')).toEqual([
    { tipo: 'titulo', nivel: 1, conAsterisco: false, desde: 0, hasta: 14, contenido: { desde: 9, hasta: 13 } },
  ]);
});
it('capítulo con asterisco', () => {
  expect(analizar('\\chapter*{Resumen}')[0]).toMatchObject({ tipo: 'titulo', nivel: 0, conAsterisco: true });
});
it('formato anidado en un título', () => {
  expect(analizar('\\section{Uso de \\textbf{BTM}}').map(e => e.tipo)).toEqual(['titulo', 'formato']);
});
it('llaves anidadas en el contenido', () => {
  const [e] = analizar('\\textbf{a {b} c}');
  expect('\\textbf{a {b} c}'.slice(e.contenido.desde, e.contenido.hasta)).toBe('a {b} c');
});
it('porcentaje escapado no abre comentario', () => {
  const t = '50\\% de \\textit{x} % nota';
  expect(analizar(t).map(e => [e.tipo, t.slice(e.desde, e.hasta)])).toEqual([
    ['formato', '\\textit{x}'], ['comentario', '% nota'],
  ]);
});
it('nada se reporta dentro de un comentario', () => {
  expect(analizar('% \\section{no}')).toEqual([{ tipo: 'comentario', desde: 0, hasta: 14 }]);
});
it('citas de apacite', () => {
  expect(analizar('\\cite<ver>[p.~3]{a, b}')[0]).toMatchObject({ tipo: 'cita', comando: 'cite', claves: ['a', 'b'] });
  expect(analizar('\\citeA{x}')[0]).toMatchObject({ comando: 'citeA', claves: ['x'] });
});
it('referencia y etiqueta', () => {
  expect(analizar('~\\ref{sec:CAP2_IA}')[0]).toMatchObject({ tipo: 'ref', clave: 'sec:CAP2_IA', desde: 1 });
  expect(analizar('\\label{sec:x}')[0]).toMatchObject({ tipo: 'etiqueta', nombre: 'sec:x' });
});
it('listas con ordinales', () => {
  const t = '\\begin{enumerate}\n\\item a\n\\item b\n\\end{enumerate}';
  expect(analizar(t).map(e => [e.tipo, (e as any).ordinal])).toEqual([
    ['inicioLista', undefined], ['item', 1], ['item', 2], ['finLista', undefined],
  ]);
});
it('itemize no numera y enumerate anidado reinicia');
it('preámbulo', () => {
  const t = '\\documentclass{x}\n\\title{T}\n\\begin{document}\nHola';
  expect(analizar(t).find(e => e.tipo === 'preambulo')).toEqual({ tipo: 'preambulo', desde: 0, hasta: t.indexOf('\\begin{document}') });
});
it('sin \\begin{document} no hay preámbulo');
it('no analiza dentro de lstlisting ni de \\verb', () => {
  expect(analizar('\\begin{lstlisting}\n% x \\textbf{y}\n\\end{lstlisting}')).toEqual([]);
  expect(analizar('\\verb|\\textbf{y}|')).toEqual([]);
});
it.each(['\\textbf{sin cerrar', '}', '\\section', '\\begin{itemize}\n\\item', '\\cite{'])('no falla con %j', (t) => {
  expect(() => analizar(t)).not.toThrow();
});
it('reconoce todo Cap2.tex del fixture', () => {
  const e = analizar(leerFixture('Cap2.tex'));
  expect(e.filter(x => x.tipo === 'titulo')).toHaveLength(20);
  expect(e.filter(x => x.tipo === 'etiqueta')).toHaveLength(4);
  expect(e.filter(x => x.tipo === 'ref')).toHaveLength(4);
});
```

Run: `npm test -- compartido/analizador` → FAIL.

- [ ] **Step 2: Implementar `analizar` y verificar**

Un solo recorrido del texto con un índice, sin expresiones regulares globales sobre todo el documento. Run → PASS.

- [ ] **Step 3: Commit** — `Analizador de LaTeX`.

---

### Task 4: Numeración y descripción del proyecto

**Files:**
- Create: `editor/compartido/numeracion.ts`, `editor/servidor/proyecto.ts`
- Test: `editor/compartido/numeracion.test.ts`, `editor/servidor/proyecto.test.ts`

**Interfaces:**
- Consumes: `analizar`, `Elemento`; `decodificar` de la tarea 2.
- Produces:

```ts
// clave del mapa: `desde` del elemento título
export function numerarTitulos(elementos: Elemento[], numeroCapitulo: string | null): Map<number, string | null>;
export function describirProyecto(dirInforme: string, principal: string): Promise<Proyecto>;
```

Reglas de `numerarTitulos`: el capítulo sin asterisco recibe `numeroCapitulo`; secciones `N.1`, subsecciones `N.1.1`; nivel 3 siempre `null` (la clase `book` no lo numera); todo título con asterisco `null` y no avanza contadores; si `numeroCapitulo` es `null`, todo `null`.

Reglas de `describirProyecto`:
- Primer capítulo siempre `{ ruta: principal, titulo: 'Portada y resumen', numero: null }`.
- Luego, en orden de aparición, cada `\include{X}` o `\input{X}` del archivo principal fuera de comentarios. `X` puede traer o no `.tex`, y puede tener subcarpeta o espacios. Si el archivo no existe, se omite.
- `titulo`: contenido del primer `\chapter` del archivo; si no hay, el nombre del archivo.
- `numero`: se recorre el archivo principal con una pila de modos (`{` apila el modo actual, `}` lo restaura). `\frontmatter` y `\backmatter` ponen modo sin numerar; `\mainmatter` modo numerado; el modo inicial es numerado. Un incluido en modo numerado cuyo primer `\chapter` no tiene asterisco recibe el siguiente número. Si el incluido contiene `\begin{appendix}` o `\appendix` antes de su primer `\chapter`, o si el principal ya pasó un `\appendix`, recibe letras `A`, `B`… con contador propio.
- `etiquetas`: por cada `\label` de cada archivo, el título y número del título inmediatamente anterior (o el mismo título si la etiqueta está en su línea).
- `paquetes`: nombres de `\usepackage` del preámbulo del principal más los `\RequirePackage` del `.cls` nombrado en `\documentclass` si existe en `dirInforme`. Las listas separadas por coma cuentan por separado.
- `bibliografia`: `X.bib` tomado de `\bibliography{X}`, o `null`.
- Si el principal no tiene incluidos reconocibles, los capítulos son todos los `.tex` de `dirInforme` por nombre, con `titulo` igual al nombre de archivo.

- [ ] **Step 1: Escribir las pruebas (fallan)**

```ts
// numeracion.test.ts
it('numera Cap2 del fixture', () => {
  const t = leerFixture('Cap2.tex'); const e = analizar(t);
  const n = numerarTitulos(e, '2');
  const de = (titulo: string) => n.get(e.find(x => x.tipo === 'titulo' && t.slice(x.contenido.desde, x.contenido.hasta) === titulo)!.desde);
  expect(de('Revision de antecedentes')).toBe('2');
  expect(de('Inteligencia Artificial')).toBe('2.1');
  expect(de('Aprendizaje Supervisado')).toBe('2.2.1');
  expect(de('Conceptos Complementarios')).toBe('2.4');
  expect(de('Word embeddings')).toBeNull();
});
it('con capítulo null todo es null');
it('los títulos con asterisco no numeran ni avanzan el contador');
it('anexo usa letras', () => { /* numeroCapitulo 'A' → 'A.1' */ });

// proyecto.test.ts, sobre pruebas/fixtures/informe
it('lista los capítulos en orden con título y número', async () => {
  expect((await describirProyecto(fixture, 'main.tex')).capitulos).toEqual([
    { ruta: 'main.tex', titulo: 'Portada y resumen', numero: null },
    { ruta: 'Cap1.tex', titulo: 'Introducción', numero: '1' },
    { ruta: 'Cap2.tex', titulo: 'Revision de antecedentes', numero: '2' },
    { ruta: 'Cap3.tex', titulo: 'Parte Central', numero: '3' },
    { ruta: 'Cap4.tex', titulo: 'Experimentación', numero: '4' },
    { ruta: 'Cap5.tex', titulo: 'Conclusiones y Trabajo Futuro', numero: '5' },
    { ruta: 'Cap6.tex', titulo: 'Anexo 1', numero: 'A' },
  ]);
});
it('indexa las etiquetas', async () => {
  expect(p.etiquetas).toContainEqual({ nombre: 'sec:CAP2_IA', ruta: 'Cap2.tex', linea: 15, titulo: 'Inteligencia Artificial', numero: '2.1' });
  expect(p.etiquetas).toContainEqual({ nombre: 'sec:CAP2_Extra', ruta: 'Cap2.tex', linea: 48, titulo: 'Conceptos Complementarios', numero: '2.4' });
});
it('junta los paquetes del principal y de la clase', async () => {
  expect(p.paquetes).toEqual(expect.arrayContaining(['inputenc', 'babel', 'hyperref', 'graphicx', 'apacite', 'ifthen']));
});
it('encuentra la bibliografía', async () => { expect(p.bibliografia).toBe('referencias.bib'); });
it('resuelve \\input{caps/Cap 1.tex} e \\include{caps/intro}', async () => { /* directorio temporal */ });
it('omite un incluido cuyo archivo no existe');
it('ignora \\include dentro de comentarios');
it('sin incluidos reconocibles lista todos los .tex por nombre');
```

Run: `npm test -- numeracion proyecto` → FAIL.

- [ ] **Step 2: Implementar `numerarTitulos` y verificar** → PASS en `numeracion`.

- [ ] **Step 3: Implementar `describirProyecto` y verificar** → PASS en `proyecto`.

- [ ] **Step 4: Commit** — `Numeración de títulos y descripción del proyecto`.

---

### Task 5: Sincronización con Git

**Files:**
- Create: `editor/servidor/git.ts`, `editor/pruebas/ayudas/entornoPrueba.ts`, `editor/pruebas/ayudas/companero.ts`
- Test: `editor/servidor/git.test.ts`

**Interfaces:**
- Consumes: `EstadoGit`, `ResultadoTraer`, `ResultadoEnviar`, `ResultadoTerminar`, `ErrorRed`.
- Produces:

```ts
export interface Git {
  preparar(): Promise<void>;
  estado(): Promise<EstadoGit>;
  buscar(): Promise<{ tipo: 'ok' } | ErrorRed>;        // git fetch
  traer(): Promise<ResultadoTraer>;
  enviar(): Promise<ResultadoEnviar>;
  terminarCombinacion(): Promise<ResultadoTerminar>;
  cancelarCombinacion(): Promise<void>;
}
export function crearGit(dirInforme: string): Git;

// pruebas/ayudas/entornoPrueba.ts
export interface EntornoPrueba { raiz: string; remoto: string; informe: string; companero: string }
export function crearEntornoPrueba(raiz?: string): Promise<EntornoPrueba>;
// pruebas/ayudas/companero.ts
export function cambioDelCompanero(e: EntornoPrueba, ruta: string, transformar: (texto: string) => string): Promise<void>;
```

`crearEntornoPrueba` crea un repositorio remoto local (`git init --bare`) con el contenido de `pruebas/fixtures/informe`, y dos clones: `informe` (el del editor) y `companero`. Ambos con `user.name` y `user.email` locales de prueba y `core.autocrlf=true`, como en la máquina de Cristhian. Ejecutado como script (`npm run entorno-prueba`), usa `editor/.entorno-prueba/` como raíz, la recrea, y escribe `editor/config.prueba.json` apuntando ahí con `build` dentro de esa raíz. `companero.ts` como script: `npm run companero -- <ruta> <texto>` agrega `<texto>` como párrafo nuevo al final del archivo en el clon del compañero, hace commit y push al remoto local.

Reglas de `git.ts`:
- Cada invocación: `execFile('git', args, { cwd: dirInforme, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' }, timeout: 60000 })`.
- Rama: la actual (`git rev-parse --abbrev-ref HEAD`). Remoto: `origin`.
- `preparar`: asegura en `.git/info/exclude`, sin duplicar líneas, estos patrones: `*.aux`, `*.log`, `*.out`, `*.toc`, `*.lof`, `*.lot`, `*.bbl`, `*.blg`, `*.fls`, `*.fdb_latexmk`, `*.synctex.gz`, `/main.pdf`.
- `traer`: si hay combinación en curso, devuelve `conflicto` con los archivos. Si hay cambios locales, `git add -A` y commit con mensaje `Edición desde el editor local, AAAA-MM-DD HH:mm`. Luego `fetch` y `merge --no-edit origin/<rama>`. `archivosCambiados`: los que difieren entre el `HEAD` anterior y el nuevo por efecto de lo traído. Si el merge falla por conflicto, deja la combinación en curso y devuelve `conflicto`.
- `enviar`: `traer`; si no fue `ok`, devuelve ese resultado. Si no hay commits sin enviar, `{ tipo: 'ok', enviado: false }`. Si no, `push origin <rama>`. Ante un rechazo por no ser avance rápido, repite `traer` y `push` una vez. Otro rechazo del remoto: `rechazado` con el texto de stderr.
- `terminarCombinacion`: si algún archivo en conflicto conserva una línea que empieza con `<<<<<<<`, `=======` o `>>>>>>>`, devuelve `quedan-marcas`. Si no, `add -A` y `commit --no-edit`.
- Clasificación de errores por stderr: `Authentication failed`, `403`, `could not read Username` o `terminal prompts disabled` → `autenticacion`; `Could not resolve host`, `Failed to connect`, `timed out` → `sin-conexion`; el resto → `otro`. `mensaje` es stderr tal cual.

- [ ] **Step 1: Escribir los ayudantes de prueba y las pruebas (fallan)**

```ts
beforeEach(async () => { e = await crearEntornoPrueba(dirTemporal()); git = crearGit(e.informe); });

it('estado limpio tras clonar', async () => {
  expect(await git.estado()).toEqual({ cambiosLocales: false, commitsSinEnviar: 0, commitsSinTraer: 0, combinacionEnCurso: false, archivosEnConflicto: [] });
});
it('traer sin novedades', async () => { expect(await git.traer()).toEqual({ tipo: 'ok', archivosCambiados: [] }); });
it('traer un cambio del compañero en otro archivo conserva lo local', async () => {
  editar(e.informe, 'Cap1.tex', t => t + '\nMío.\n');
  await cambioDelCompanero(e, 'Cap4.tex', t => t + '\nDe otro.\n');
  expect(await git.traer()).toEqual({ tipo: 'ok', archivosCambiados: ['Cap4.tex'] });
  expect(leer(e.informe, 'Cap1.tex')).toContain('Mío.');
  expect(leer(e.informe, 'Cap4.tex')).toContain('De otro.');
});
it('buscar actualiza commitsSinTraer sin tocar archivos');
it('enviar publica el cambio y el compañero lo recibe', async () => {
  editar(e.informe, 'Cap1.tex', t => t + '\nMío.\n');
  expect(await git.enviar()).toEqual({ tipo: 'ok', enviado: true });
  expect(leerDelRemoto(e, 'Cap1.tex')).toContain('Mío.');
});
it('enviar sin cambios', async () => { expect(await git.enviar()).toEqual({ tipo: 'ok', enviado: false }); });
it('enviar con el remoto adelantado trae primero y después envía');
it('el commit lleva el mensaje acordado', async () => {
  expect(ultimoMensaje(e.informe)).toMatch(/^Edición desde el editor local, \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});
it('conflicto en el mismo párrafo: no envía y deja la combinación en curso', async () => {
  editar(e.informe, 'Cap4.tex', t => t.replace('Experimentación', 'Experimentos'));
  await cambioDelCompanero(e, 'Cap4.tex', t => t.replace('Experimentación', 'Pruebas'));
  expect(await git.enviar()).toEqual({ tipo: 'conflicto', archivos: ['Cap4.tex'] });
  expect(await git.estado()).toMatchObject({ combinacionEnCurso: true, archivosEnConflicto: ['Cap4.tex'] });
  expect(leerDelRemoto(e, 'Cap4.tex')).toContain('Pruebas');
});
it('cancelarCombinacion devuelve mi versión intacta', async () => {
  /* tras el conflicto */ await git.cancelarCombinacion();
  expect(leer(e.informe, 'Cap4.tex')).toContain('Experimentos');
  expect((await git.estado()).combinacionEnCurso).toBe(false);
});
it('terminarCombinacion avisa si quedan marcas', async () => {
  expect(await git.terminarCombinacion()).toEqual({ tipo: 'quedan-marcas', archivos: ['Cap4.tex'] });
});
it('terminarCombinacion cierra la combinación cuando el archivo quedó resuelto', async () => {
  fs.writeFileSync(ruta, '\\chapter{Resuelto}\n');
  expect(await git.terminarCombinacion()).toEqual({ tipo: 'ok' });
  expect(await git.enviar()).toEqual({ tipo: 'ok', enviado: true });
});
it('preparar excluye los temporales y enviar no los sube', async () => {
  await git.preparar(); await git.preparar();
  for (const f of ['main.aux', 'main.log', 'main.pdf', 'Cap1.aux', 'main.synctex.gz']) fs.writeFileSync(path.join(e.informe, f), 'x');
  fs.writeFileSync(path.join(e.informe, 'figs-nueva.pdf'), 'x');
  editar(e.informe, 'Cap1.tex', t => t + '\nMío.\n');
  await git.enviar();
  expect(archivosDelRemoto(e)).toEqual(expect.arrayContaining(['Cap1.tex', 'figs-nueva.pdf']));
  expect(archivosDelRemoto(e)).not.toEqual(expect.arrayContaining(['main.aux']));
  expect(archivosDelRemoto(e)).not.toContain('main.pdf');
  expect(lineasDe(e.informe, '.git/info/exclude').filter(l => l === '*.aux')).toHaveLength(1);
});
it('guardar sin editar un archivo con BOM o fines mezclados no genera cambios', async () => {
  // la prueba primero crea y hace commit de mezclado.tex ('a\r\nb\r\nc\n') y conbom.tex (BOM + 'a\r\n')
  const a = crearArchivos(e.informe);
  for (const ruta of ['Cap1.tex', 'mezclado.tex', 'conbom.tex']) {
    const l = await a.leer(ruta); await a.escribir(ruta, { ...l, versionBase: l.version });
  }
  expect((await git.estado()).cambiosLocales).toBe(false);
});
it('clasifica los errores de red', async () => {
  cambiarUrlRemoto(e.informe, 'https://127.0.0.1:1/no-existe.git');
  expect(await git.traer()).toMatchObject({ tipo: 'error', motivo: 'sin-conexion' });
});
```

Run: `npm test -- servidor/git` → FAIL.

- [ ] **Step 2: Implementar `git.ts` y verificar** → PASS.

- [ ] **Step 3: Consultar la identidad de los commits**

`git -C ../informe config user.name` devuelve hoy `CNR0551`. Así figurarán los commits en el historial de Overleaf. Preguntar a Cristhian si quiere que en `informe/` figure su nombre real; si dice que sí, él indica nombre y correo y se configuran con `git -C ../informe config user.name …` (configuración local de ese repositorio, no global).

- [ ] **Step 4: Commit** — `Sincronización con Git y entorno de prueba`.

---

### Task 6: Compilación del PDF

**Files:**
- Create: `editor/servidor/logLatex.ts`, `editor/servidor/compilar.ts`, `editor/pruebas/fixtures/logs/*.log`
- Test: `editor/servidor/logLatex.test.ts`, `editor/servidor/compilar.test.ts`

**Interfaces:**
- Consumes: `ProblemaLatex`, `ResultadoCompilacion`, `Config`.
- Produces:

```ts
export function interpretarLog(log: string): ProblemaLatex[];
export function interpretarBlg(blg: string): ProblemaLatex[];

export type Ejecutar = (comando: string, args: string[], opciones: { cwd: string; timeoutMs: number })
  => Promise<{ codigo: number | null; vencido: boolean; noEncontrado: boolean }>;
export interface Compilador { compilar(): Promise<ResultadoCompilacion>; rutaPdf(): string }
export function crearCompilador(cfg: Pick<Config, 'informe' | 'build' | 'principal'>, ejecutar?: Ejecutar): Compilador;
```

Reglas de `interpretarLog`:
- Errores: líneas `ARCHIVO:LÍNEA: MENSAJE` (formato de `-file-line-error`). `ruta` relativa, con `/`, sin `./` inicial.
- Traducciones de `mensaje` (el resto queda igual a `original`):

| Texto del log | `mensaje` |
|---|---|
| `Undefined control sequence` | `Comando desconocido: \X` (X tomado de la línea `l.N …` que sigue) |
| `Missing } inserted`, `Runaway argument`, `File ended while scanning` | `Falta cerrar una llave }` |
| `Extra }, or forgotten $` | `Sobra una llave } o falta un $` |
| `Missing $ inserted` | `Hay un símbolo matemático fuera de una ecuación` |
| ``File `X' not found`` | `No se encontró el archivo X` |
| `Environment X undefined` | `Entorno desconocido: X` |
| `Unicode character X (U+NNNN)` | `Carácter no soportado: «X». Suele aparecer al copiar y pegar desde Word o un PDF; reemplazalo por el equivalente común` |

- Advertencias (gravedad `advertencia`, `ruta` null, `linea` tomada de `on input line N`): ``Reference `X' … undefined`` → `La referencia X no existe`; ``Citation `X' … undefined`` → `La cita X no está en la bibliografía`. Sin duplicados.
- `interpretarBlg`: `I didn't find a database entry for "X"` → advertencia `La cita X no está en la bibliografía`; `I couldn't open database file X` → error `No se encontró el archivo X`.

Reglas de `crearCompilador`:
- Secuencia, todo con `timeoutMs: 600000`:
  1. `pdflatex -interaction=nonstopmode -file-line-error -output-directory=<build> <principal>`, `cwd` `informe`. Crea `build` si no existe.
  2. Si `<build>/<base>.aux` contiene `\bibdata`: `bibtex --include-directory=<informe> <base>`, `cwd` `build`.
  3. `pdflatex` de nuevo mientras se haya corrido `bibtex` en este pedido o el log contenga `Rerun to get`, hasta cuatro corridas de `pdflatex` en total.
- Resultado: `sin-latex` si `noEncontrado`; `vencido` si alguna corrida venció; si no, `con-errores` cuando hay algún problema de gravedad `error`, `ok` en otro caso. `problemas` sale del último `.log` más el `.blg`. `pdfActualizado` es verdadero si la fecha de modificación del PDF cambió.
- Una compilación a la vez. Los pedidos que llegan durante una compilación comparten una única compilación siguiente.
- `ejecutar` por defecto usa `child_process.spawn`, mata el proceso al vencer, y marca `noEncontrado` ante `ENOENT`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

```ts
// logLatex.test.ts — cada log es un fixture corto escrito a mano con el formato real
it('comando desconocido', () => {
  expect(interpretarLog(log('comando.log'))).toEqual([{
    gravedad: 'error', ruta: 'Cap2.tex', linea: 12,
    mensaje: 'Comando desconocido: \\textbff', original: 'Undefined control sequence.',
  }]);
});
it.each([
  ['llave.log', 'Falta cerrar una llave }'],
  ['imagen.log', 'No se encontró el archivo figs/grafico.png'],
  ['entorno.log', 'Entorno desconocido: tabla'],
  ['matematica.log', 'Hay un símbolo matemático fuera de una ecuación'],
])('%s → %s', (f, m) => { expect(interpretarLog(log(f))[0].mensaje).toBe(m); });
it('carácter pegado desde Word', () => {
  expect(interpretarLog(log('unicode.log'))[0].mensaje).toMatch(/^Carácter no soportado: «“»\. Suele aparecer al copiar y pegar/);
});
it('referencia y cita inexistentes, sin duplicar', () => {
  expect(interpretarLog(log('referencias.log'))).toEqual([
    { gravedad: 'advertencia', ruta: null, linea: 11, mensaje: 'La referencia sec:nada no existe', original: expect.any(String) },
    { gravedad: 'advertencia', ruta: null, linea: 8, mensaje: 'La cita Perez2020 no está en la bibliografía', original: expect.any(String) },
  ]);
});
it('un error no reconocido conserva el mensaje original');
it('log sin problemas devuelve lista vacía');
it('blg con entrada faltante');

// compilar.test.ts — con un Ejecutar falso que registra llamadas y escribe .aux/.log/.pdf en build
it('corre pdflatex, bibtex y pdflatex cuando hay bibliografía', async () => {
  expect(llamadas.map(l => l.comando)).toEqual(['pdflatex', 'bibtex', 'pdflatex']);
  expect(llamadas[0].args).toEqual(['-interaction=nonstopmode', '-file-line-error', `-output-directory=${build}`, 'main.tex']);
  expect(llamadas[0].cwd).toBe(informe);
  expect(llamadas[1]).toMatchObject({ args: [`--include-directory=${informe}`, 'main'], cwd: build });
});
it('sin \\bibdata no corre bibtex');
it('repite mientras el log pida Rerun, con tope de cuatro pdflatex');
it('no escribe nada dentro de informe', async () => { /* lista de archivos antes y después */ });
it('sin pdflatex devuelve sin-latex', async () => { expect(r).toEqual({ tipo: 'sin-latex' }); });
it('una corrida que no termina devuelve vencido y la siguiente compilación funciona', async () => {
  falso.proximaVence();
  expect(await c.compilar()).toEqual({ tipo: 'vencido' });
  expect((await c.compilar()).tipo).toBe('ok');
});
it('con errores devuelve con-errores y pdfActualizado false si el PDF no cambió');
it('tres pedidos simultáneos producen dos compilaciones', async () => {
  await Promise.all([c.compilar(), c.compilar(), c.compilar()]);
  expect(llamadas.filter(l => l.comando === 'pdflatex' && l.primeraDelPedido)).toHaveLength(2);
});
```

Run: `npm test -- logLatex compilar` → FAIL.

- [ ] **Step 2: Implementar `logLatex.ts` y verificar** → PASS en `logLatex`.

- [ ] **Step 3: Implementar `compilar.ts` y verificar** → PASS en `compilar`.

- [ ] **Step 4: Instalar MiKTeX (requiere aprobación de Cristhian)**

Pedir aprobación y ejecutar `winget install --id MiKTeX.MiKTeX -e`. En una terminal nueva: `initexmf --set-config-value "[MPM]AutoInstall=1"`. Verificar: `pdflatex --version` menciona MiKTeX.

- [ ] **Step 5: Compilar el informe real**

Script temporal que llama `crearCompilador(cargarConfig(...)).compilar()` sobre el `informe/` real (solo lee de `informe/`, escribe en `Tesis/build/`). La primera vez descarga paquetes y puede tardar varios minutos.

Esperado: `tipo: 'ok'`, existe `Tesis/build/main.pdf`, ningún problema `La cita … no está en la bibliografía`, y `git -C ../informe status --porcelain` vacío. Si `bibtex` no encuentra `referencias.bib` o `apacite.bst`, reemplazar `--include-directory` por las variables de entorno `BIBINPUTS` y `BSTINPUTS` con valor `<informe>;`, y ajustar la prueba y la firma de `Ejecutar` para aceptar `env`. Reemplazar los fixtures de `pruebas/fixtures/logs/` que difieran del formato real observado en `build/main.log`.

- [ ] **Step 6: Commit** — `Compilación del PDF e interpretación de errores`.

---

### Task 7: Servidor HTTP

**Files:**
- Create: `editor/servidor/vigia.ts`, `editor/servidor/app.ts`, `editor/servidor/index.ts`
- Test: `editor/servidor/vigia.test.ts`, `editor/servidor/app.test.ts`

**Interfaces:**
- Consumes: `Archivos`, `RutaInvalida`, `describirProyecto`, `Git`, `Compilador`, `Config`.
- Produces:

```ts
export interface Vigia { latido(): void; revisar(): void }
export function crearVigia(o: { limiteMs: number; ahora: () => number; alVencer: () => void }): Vigia;

export interface Dependencias {
  config: Config; archivos: Archivos; proyecto: () => Promise<Proyecto>;
  git: Git; compilador: Compilador; vigia: Vigia;
  abrirVsCode: () => Promise<void>; dirEstaticos: string;
}
export function crearApp(d: Dependencias): express.Express;
```

API (JSON; los cuerpos de respuesta son los tipos de `tipos.ts`):

| Método y ruta | Entrada | Respuesta |
|---|---|---|
| `GET /api/salud` | | `{ app: 'editor-informe' }` |
| `GET /api/config` | | `{ compilarAlGuardar: boolean; principal: string }` |
| `GET /api/proyecto` | | `Proyecto` |
| `GET /api/archivo?ruta=` | | `ArchivoLeido`; 400 si `RutaInvalida`; 404 si no existe |
| `PUT /api/archivo` | `{ ruta, contenido, finDeLinea, bom, versionBase, forzar? }` | `ResultadoEscritura` (200 `ok`, 409 `cambio-en-disco`, 410 `desaparecido`); 400 si `RutaInvalida` |
| `GET /api/git/estado` | | `EstadoGit` |
| `POST /api/git/traer` | | `ResultadoTraer` |
| `POST /api/git/enviar` | | `ResultadoEnviar` |
| `POST /api/git/terminar` | | `ResultadoTerminar` |
| `POST /api/git/cancelar` | | `{}` |
| `POST /api/git/abrir-vscode` | | `{}` |
| `POST /api/compilar` | | `ResultadoCompilacion` |
| `GET /api/pdf` | | el PDF con `Cache-Control: no-store`; 404 si no existe |
| `POST /api/latido` | | `{}` |

Todo lo demás sirve estáticos de `dirEstaticos`. Los errores inesperados responden 500 con `{ mensaje }`, sin traza.

Reglas:
- `crearVigia`: `latido` guarda `ahora()`; `revisar` llama `alVencer` una sola vez cuando `ahora() - ultimoLatido > limiteMs`. El último latido inicial es el momento de creación.
- `index.ts`: carga la configuración, llama `git.preparar()`, escucha en `127.0.0.1:<puerto>`. Vigía con `limiteMs: 600000`, revisada cada 30 s; al vencer, `process.exit(0)`. Al arrancar y luego cada 5 minutos llama `git.buscar()` e ignora el resultado. Si el puerto está ocupado: consulta `/api/salud`; si responde `editor-informe`, termina con código 0 en silencio; si no, imprime `El puerto <n> está ocupado por otro programa. Cambialo en config.json.` y termina con código 1. `abrirVsCode` ejecuta `cmd /c code <informe>`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

```ts
// vigia.test.ts
it('no vence antes del límite y vence una sola vez después', () => {
  let t = 0; const alVencer = vi.fn();
  const v = crearVigia({ limiteMs: 600000, ahora: () => t, alVencer });
  t = 600000; v.revisar(); expect(alVencer).not.toHaveBeenCalled();
  t = 600001; v.revisar(); v.revisar(); expect(alVencer).toHaveBeenCalledTimes(1);
});
it('un latido reinicia la cuenta');

// app.test.ts — archivos reales sobre un directorio temporal; git y compilador falsos; app.listen(0)
it('salud', async () => { expect(await get('/api/salud')).toEqual({ app: 'editor-informe' }); });
it('lee y escribe un archivo', async () => {
  const a = await get('/api/archivo?ruta=Cap1.tex');
  const r = await put('/api/archivo', { ruta: 'Cap1.tex', ...a, contenido: a.contenido + 'x', versionBase: a.version });
  expect(r.status).toBe(200); expect(r.cuerpo.tipo).toBe('ok');
});
it('dos escrituras con la misma versionBase: la segunda da 409 y no pisa', async () => {
  await put('/api/archivo', { ...base, contenido: 'primera\n' });
  const r = await put('/api/archivo', { ...base, contenido: 'segunda\n' });
  expect(r.status).toBe(409); expect(leerDisco('Cap1.tex')).toBe('primera\n');
});
it('archivo borrado da 410');
it('ruta fuera del informe da 400 al leer y al escribir');
it('archivo inexistente da 404');
it('traer, enviar, terminar y cancelar delegan en git y devuelven su resultado');
it('compilar delega en el compilador');
it('pdf da 404 si no existe y lo sirve sin caché si existe');
it('latido avisa a la vigía');
it('un error inesperado da 500 con mensaje y sin traza');
```

Run: `npm test -- vigia app` → FAIL.

- [ ] **Step 2: Implementar `vigia.ts`, `app.ts`, `index.ts` y verificar** → PASS.

- [ ] **Step 3: Verificar el arranque sobre el entorno de prueba**

`npm run entorno-prueba`, y luego con `EDITOR_CONFIG=config.prueba.json` en el entorno: `npm run servir`. Esperado: `GET http://127.0.0.1:4317/api/proyecto` devuelve los siete capítulos. Lanzar un segundo `npm run servir` → termina en silencio con código 0.

- [ ] **Step 4: Commit** — `Servidor HTTP y cierre por inactividad`.

---

### Task 8: Cliente base: abrir, escribir y guardar

**Files:**
- Create: `editor/cliente/index.html`, `main.ts`, `estilos.css`, `api.ts`, `editor.ts`, `pantalla/lateral.ts`, `pantalla/barra.ts`

**Interfaces:**
- Consumes: API de la tarea 7; `analizar`, `numerarTitulos`.
- Produces:

```ts
// api.ts: una función por ruta, con los tipos de tipos.ts
export const api: {
  config(): Promise<{ compilarAlGuardar: boolean; principal: string }>;
  proyecto(): Promise<Proyecto>;
  leer(ruta: string): Promise<ArchivoLeido>;
  escribir(ruta: string, datos: {...}): Promise<ResultadoEscritura>;
  estadoGit(): Promise<EstadoGit>; traer(): Promise<ResultadoTraer>; enviar(): Promise<ResultadoEnviar>;
  terminar(): Promise<ResultadoTerminar>; cancelar(): Promise<void>; abrirVsCode(): Promise<void>;
  compilar(): Promise<ResultadoCompilacion>; latido(): Promise<void>;
};

// editor.ts
export type EstadoGuardado = 'guardado' | 'guardando' | 'sin-guardar' | 'error';
export interface ControlEditor {
  vista: EditorView;
  abrir(ruta: string): Promise<void>;
  guardarAhora(): Promise<void>;
  recargar(): Promise<void>;
  irA(posicion: number): void;
  irALinea(linea: number): void;
  rutaAbierta(): string | null;
  bloquear(si: boolean): void;
}
export function crearEditor(padre: HTMLElement, o: {
  extensiones: Extension[];
  alCambiarEstado(e: EstadoGuardado): void;
  alCambiarDocumento(texto: string): void;
  preguntarConflicto(): Promise<'recargar' | 'sobrescribir'>;
  alDesaparecer(ruta: string): void;
}): ControlEditor;

// pantalla/lateral.ts
export function crearLateral(padre: HTMLElement, o: { alElegirArchivo(ruta: string): void; alElegirTitulo(posicion: number): void }): {
  mostrarProyecto(p: Proyecto, rutaActiva: string | null): void;
  mostrarIndice(titulos: { texto: string; numero: string | null; nivel: number; posicion: number }[]): void;
};
// pantalla/barra.ts
export function crearBarra(padre: HTMLElement): { mostrarGuardado(e: EstadoGuardado): void; zonaAcciones: HTMLElement; avisar(texto: string, tipo: 'info' | 'error'): void };
```

Comportamiento:
- Distribución de tres columnas de la maqueta aprobada: lateral 220 px, editor flexible, panel derecho 40 % (vacío en esta tarea). Tema claro y oscuro según el sistema.
- Editor: ajuste de línea, historial, búsqueda, tipografía de prosa a 16 px. Atributos `spellcheck="true"` y `lang="es"` en el contenido.
- Lateral: capítulos como `numero. titulo` (sin número cuando es `null`), más una entrada `Referencias` si `bibliografia` no es `null`. Debajo, el índice del archivo abierto, recalculado 300 ms después de cada cambio, con sangría por nivel.
- Al iniciar abre el último archivo abierto (guardado en `localStorage`) o el primer capítulo numerado.
- Guardado automático 1000 ms después del último cambio; inmediato al cambiar de archivo, al ocultarse la pestaña y al cerrarla (`fetch` con `keepalive`). Textos de estado: `Guardado`, `Guardando…`, `Sin guardar`, `No se pudo guardar`.
- `cambio-en-disco`: sin cambios pendientes, recarga en silencio. Con cambios pendientes, diálogo `Este archivo cambió por fuera del editor.` con botones `Recargar la versión del disco` y `Conservar la mía`.
- `desaparecido`: detiene el guardado automático de ese archivo, deja el texto visible en solo lectura y muestra `Este archivo ya no existe en el informe. Puede haber sido borrado o renombrado por otra persona.` con botón `Copiar mi texto`.
- Si el proyecto recargado ya no contiene el archivo abierto, mismo aviso.
- `latido` cada 30 s mientras la pestaña existe.

- [ ] **Step 1: Implementar `api.ts`, `editor.ts`, `lateral.ts`, `barra.ts` y `main.ts`**

- [ ] **Step 2: Verificar en el navegador, sobre el entorno de prueba**

`npm run entorno-prueba`; servidor con `EDITOR_CONFIG=config.prueba.json`; `npm run dev`; abrir `http://localhost:5173`. Comprobar cada punto:

1. Lateral: `Portada y resumen`, `1. Introducción` … `A. Anexo 1`, `Referencias`.
2. Abrir `2. Revision de antecedentes`: el índice muestra `2.1 Inteligencia Artificial` … `2.4 Conceptos Complementarios`; clic en uno desplaza el editor.
3. Escribir una palabra: `Sin guardar` → `Guardado` en ~1 s. `git -C .entorno-prueba/informe diff --stat` muestra una sola línea cambiada.
4. Abrir y cerrar cada archivo sin editar: `git -C .entorno-prueba/informe status --porcelain` vacío.
5. Modificar el archivo abierto desde afuera, sin cambios pendientes → recarga solo. Con cambios pendientes → aparece el diálogo y ambos botones hacen lo que dicen.
6. Borrar el archivo abierto desde afuera y escribir → aviso de archivo inexistente; el archivo no se recrea.
7. Sin errores en la consola del navegador.

- [ ] **Step 3: Commit** — `Cliente base: abrir, escribir y guardar`.

---

### Task 9: Vista formateada

**Files:**
- Create: `editor/cliente/vista.ts`
- Modify: `editor/cliente/editor.ts` (plegado del preámbulo), `editor/cliente/main.ts` (conectar la extensión), `editor/cliente/estilos.css`
- Test: `editor/cliente/vista.test.ts`

**Interfaces:**
- Consumes: `analizar`, `numerarTitulos`, `Etiqueta`.
- Produces:

```ts
export interface ContextoVista { numeroCapitulo: string | null; etiquetas: Map<string, Etiqueta> }
export function decorar(estado: EditorState, ctx: ContextoVista): DecorationSet;
export const contextoCambiado: StateEffectType<null>;     // fuerza a recalcular
export function extensionVista(obtenerCtx: () => ContextoVista): Extension;
```

Reglas de `decorar`. Un elemento está *activo* si algún rango de la selección toca `[desde, hasta]`. Un elemento activo recibe solo las marcas de estilo, sin reemplazos ni widgets, de modo que se ve su LaTeX.

| Elemento | No activo |
|---|---|
| `titulo` | Línea con clase `cm-titulo-N`. Se reemplazan (ocultan) el tramo de `desde` a `contenido.desde` y la llave final. Antes del contenido, widget `cm-numero-titulo` con el número si no es `null`. |
| `formato` | Se ocultan la apertura y la llave final. Contenido con marca `cm-negrita`, `cm-cursiva` o `cm-mono`. |
| `item` | Reemplazado por widget `cm-vineta` con `•`, o `N.` si tiene ordinal. |
| `inicioLista`, `finLista`, `etiqueta`, `comentario` | Marca `cm-atenuado`. |
| `ref` | Reemplazada por widget `cm-ref` con `numero titulo` de la etiqueta; si la clave no existe, clases `cm-ref cm-ref-rota` y el texto es la clave. |
| `cita` | Reemplazada por widget `cm-cita` con las claves separadas por `, `. |
| `preambulo` | Sin decoración aquí. |

Además, toda secuencia `\comando` que no pertenezca a un elemento reconocido lleva la marca `cm-comando` (monoespaciado, color atenuado): es lo que hace que lo no reconocido se vea como código.

Las decoraciones nunca alteran el documento. `extensionVista` recalcula cuando cambia el documento, la selección o llega `contextoCambiado`. La vista, el plegado y el menú `/` se aplican solo a archivos `.tex`; `referencias.bib` se edita como texto plano.

`editor.ts`: al abrir un archivo con `preambulo`, se pliega desde el fin de la primera línea hasta `preambulo.hasta`, con el texto de reemplazo `Configuración del documento`.

- [ ] **Step 1: Escribir las pruebas (fallan)**

Ayudante `decos(texto, cursor, ctx)`: crea un `EditorState`, llama `decorar` y devuelve una lista `{ desde, hasta, clase?, reemplaza: boolean, widget?: string }` (el texto del widget se obtiene de una propiedad `texto` de la clase del widget, sin tocar el DOM).

```ts
const ctx = { numeroCapitulo: '2', etiquetas: new Map([['sec:CAP2_IA', { nombre: 'sec:CAP2_IA', ruta: 'Cap2.tex', linea: 15, titulo: 'Inteligencia Artificial', numero: '2.1' }]]) };

it('título: oculta el comando, numera y estiliza', () => {
  const d = decos('Texto\n\\section{Hola}\n', 0, ctx);
  expect(d).toContainEqual({ desde: 6, hasta: 15, reemplaza: true });
  expect(d).toContainEqual({ desde: 19, hasta: 20, reemplaza: true });
  expect(d).toContainEqual(expect.objectContaining({ desde: 15, widget: '2.1' }));
  expect(d).toContainEqual(expect.objectContaining({ clase: 'cm-titulo-1' }));
});
it('con el cursor dentro del título no oculta nada', () => {
  const d = decos('Texto\n\\section{Hola}\n', 17, ctx);
  expect(d.some(x => x.reemplaza || x.widget)).toBe(false);
  expect(d).toContainEqual(expect.objectContaining({ clase: 'cm-titulo-1' }));
});
it('negrita', () => {
  const d = decos('a \\textbf{b} c', 0, ctx);
  expect(d).toContainEqual({ desde: 2, hasta: 10, reemplaza: true });
  expect(d).toContainEqual({ desde: 10, hasta: 11, clase: 'cm-negrita', reemplaza: false });
  expect(d).toContainEqual({ desde: 11, hasta: 12, reemplaza: true });
});
it('referencia conocida muestra número y título', () => {
  expect(decos('ver ~\\ref{sec:CAP2_IA} x', 0, ctx)).toContainEqual(expect.objectContaining({ widget: '2.1 Inteligencia Artificial', clase: 'cm-ref' }));
});
it('referencia desconocida se marca rota', () => {
  expect(decos('\\ref{nada} x', 12, ctx)).toContainEqual(expect.objectContaining({ widget: 'nada', clase: 'cm-ref cm-ref-rota' }));
});
it('cita muestra las claves');
it('ítems de enumerate muestran 1. y 2.; los de itemize •');
it('comentario y etiqueta atenuados');
it('un comando no reconocido se marca cm-comando y no se oculta', () => {
  const d = decos('\\hfill \\break', 0, ctx);
  expect(d.filter(x => x.clase === 'cm-comando')).toHaveLength(2);
  expect(d.some(x => x.reemplaza)).toBe(false);
});
it('decorar nunca cambia el documento', () => { /* doc.toString() idéntico para cada fixture */ });
it('decora todos los fixtures sin lanzar excepción, con el cursor en cada inicio de línea');
```

Run: `npm test -- cliente/vista` → FAIL.

- [ ] **Step 2: Implementar `vista.ts` y verificar** → PASS.

- [ ] **Step 3: Conectar y verificar en el navegador**

`main.ts` pasa `extensionVista` al editor, con `numeroCapitulo` del capítulo abierto y las etiquetas del proyecto; despacha `contextoCambiado` cuando el proyecto se recarga. Sobre el entorno de prueba:

1. `Cap2.tex`: títulos con tamaño y número; las cuatro referencias se leen como `2.1 Inteligencia Artificial`, etc.
2. Poner el cursor sobre un título o una referencia muestra su LaTeX; al salir, vuelve a verse formateado.
3. `main.tex`: el preámbulo aparece plegado como `Configuración del documento`; `\hfill \break` y `\keywords{…}` se ven como código.
4. Recorrer todos los archivos sin editar: `git status --porcelain` del entorno de prueba vacío.

- [ ] **Step 4: Commit** — `Vista formateada del LaTeX`.

---

### Task 10: Comandos de edición y menú de inserción

**Files:**
- Create: `editor/cliente/comandos.ts`, `editor/cliente/plantillas.ts`, `editor/cliente/menuBarra.ts`
- Modify: `editor/cliente/main.ts`, `editor/cliente/pantalla/barra.ts` (selector de nivel de título)
- Test: `editor/cliente/comandos.test.ts`, `editor/cliente/menuBarra.test.ts`

**Interfaces:**
- Consumes: `analizar`, `Etiqueta`, `ControlEditor`, `api`.
- Produces:

```ts
// comandos.ts
export interface Edicion {
  cambios: { desde: number; hasta: number; insertar: string }[];
  seleccion: { ancla: number; cabeza: number };
}
export function alternarFormato(texto: string, sel: Rango, comando: 'textbf' | 'textit'): Edicion;
export function cambiarNivelTitulo(texto: string, posicion: number, nivel: 0 | 1 | 2 | 3 | null): Edicion;
export function agregarPaquete(principal: string, paquete: string, configuracion?: string): string;

// plantillas.ts
export interface Plantilla { id: string; nombre: string; texto: string; paquete?: string; configuracion?: string }
export const PLANTILLAS: Plantilla[];

// menuBarra.ts
export function detectarBarra(lineaHastaCursor: string): { desde: number; consulta: string } | null;
export function filtrarPlantillas(consulta: string): Plantilla[];
export interface ContextoMenu {
  paquetes(): string[]; etiquetas(): Etiqueta[];
  asegurarPaquete(paquete: string, configuracion?: string): Promise<boolean>;
}
export function extensionMenu(ctx: ContextoMenu): Extension;
```

`PLANTILLAS`, en este orden y con este texto exacto (sintaxis de `snippet` de `@codemirror/autocomplete`):

```ts
export const PLANTILLAS: Plantilla[] = [
  { id: 'seccion', nombre: 'Sección', texto: '\\section{${1:Título}}\n\n${}' },
  { id: 'subseccion', nombre: 'Subsección', texto: '\\subsection{${1:Título}}\n\n${}' },
  { id: 'lista', nombre: 'Lista', texto: '\\begin{itemize}\n  \\item ${}\n\\end{itemize}\n' },
  { id: 'listaNumerada', nombre: 'Lista numerada', texto: '\\begin{enumerate}\n  \\item ${}\n\\end{enumerate}\n' },
  { id: 'figura', nombre: 'Figura', paquete: 'graphicx', texto:
    '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{figs/${1:archivo.png}}\n  \\caption{${2:Descripción de la figura}}\n  \\label{fig:${3:nombre}}\n\\end{figure}\n' },
  { id: 'tabla', nombre: 'Tabla', paquete: 'booktabs', texto:
    '\\begin{table}[htbp]\n  \\centering\n  \\caption{${1:Descripción de la tabla}}\n  \\label{tab:${2:nombre}}\n  \\begin{tabular}{ll}\n    \\toprule\n    ${3:Columna 1} & ${4:Columna 2} \\\\\n    \\midrule\n    ${5:dato} & ${6:dato} \\\\\n    \\bottomrule\n  \\end{tabular}\n\\end{table}\n' },
  { id: 'ecuacion', nombre: 'Ecuación', paquete: 'amsmath', texto:
    '\\begin{equation}\n  ${1:a = b}\n  \\label{eq:${2:nombre}}\n\\end{equation}\n' },
  { id: 'cita', nombre: 'Cita', texto: '\\cite{${1:clave}}' },
  { id: 'codigo', nombre: 'Bloque de código', paquete: 'listings', configuracion: CONFIG_LISTINGS, texto:
    '\\begin{lstlisting}[language=${1:Python}, caption={${2:Descripción}}, label={lst:${3:nombre}}]\n${4}\n\\end{lstlisting}\n' },
  { id: 'referencia', nombre: 'Referencia cruzada', texto: '\\ref{${}}' },
];
```

En la plantilla de tabla, el texto insertado en el documento termina cada fila con dos barras invertidas (`\\`); una prueba lo fija. `CONFIG_LISTINGS` permite tildes y eñes dentro del código con `pdflatex`:

```latex
\lstset{basicstyle=\ttfamily\small, breaklines=true, frame=single, extendedchars=true,
  literate={á}{{\'a}}1 {é}{{\'e}}1 {í}{{\'i}}1 {ó}{{\'o}}1 {ú}{{\'u}}1 {ñ}{{\~n}}1
           {Á}{{\'A}}1 {É}{{\'E}}1 {Í}{{\'I}}1 {Ó}{{\'O}}1 {Ú}{{\'U}}1 {Ñ}{{\~N}}1 {ü}{{\"u}}1 {¿}{{?`}}1 {¡}{{!`}}1}
```

Reglas:
- `alternarFormato`: si la selección (o el cursor) está dentro de un `formato` del mismo comando, lo desenvuelve; si no, envuelve la selección. Selección vacía fuera de un formato: inserta `\textbf{}` con el cursor entre las llaves. La selección resultante cubre el mismo texto que antes.
- `cambiarNivelTitulo`: actúa sobre la línea de `posicion`. Convierte una línea de texto en título, cambia el comando de un título existente conservando asterisco y lo que siga a la llave de cierre (por ejemplo un `\label`), o con `null` deja solo el contenido. Línea vacía: inserta el comando con llaves vacías y el cursor adentro.
- `agregarPaquete`: inserta `\usepackage{paquete}` en una línea nueva después de la última línea con `\usepackage` o, si no hay, de la de `\documentclass`, siempre dentro del preámbulo; `configuracion`, si viene, en las líneas siguientes. Usa el fin de línea `\n`. Devuelve el texto sin cambios si el paquete ya figura (también en `\usepackage[opciones]{…}` y en listas con comas). El resto del texto queda idéntico.
- `detectarBarra`: coincide cuando la línea hasta el cursor es espacios opcionales, `/` y letras. `filtrarPlantillas` ignora mayúsculas y tildes y busca por inicio de cualquier palabra del nombre.
- `extensionMenu`: fuente de autocompletado que ofrece las plantillas filtradas. Al elegir: borra `/consulta`; si la plantilla tiene `paquete` y no está en `paquetes()`, llama `asegurarPaquete`; si devuelve `false`, no inserta nada; luego inserta el `snippet`. Para `referencia`, tras insertar abre el autocompletado. Segunda fuente: dentro de `\ref{…}` ofrece las etiquetas, mostrando `numero titulo` y aplicando el nombre. Atajos: `Ctrl-b` y `Ctrl-i` para `alternarFormato`.
- `asegurarPaquete` (en `main.ts`): confirma con `Esta plantilla necesita el paquete X. ¿Agregarlo a main.tex?`. Si el archivo abierto es el principal, aplica `agregarPaquete` como cambio del editor; si no, lo lee y escribe por el API. Luego recarga el proyecto.
- Selector en la barra: `Texto`, `Capítulo`, `Sección`, `Subsección`, `Subsubsección`; refleja el nivel de la línea del cursor.

- [ ] **Step 1: Escribir las pruebas (fallan)**

```ts
// comandos.test.ts — ayudante aplicar(texto, edicion) → { texto, seleccionado }
it('envuelve la selección', () => {
  expect(aplicar('hola mundo', alternarFormato('hola mundo', { desde: 5, hasta: 10 }, 'textbf')))
    .toEqual({ texto: 'hola \\textbf{mundo}', seleccionado: 'mundo' });
});
it('desenvuelve si ya está en negrita', () => {
  const t = 'hola \\textbf{mundo}';
  expect(aplicar(t, alternarFormato(t, { desde: 13, hasta: 18 }, 'textbf'))).toEqual({ texto: 'hola mundo', seleccionado: 'mundo' });
  expect(aplicar(t, alternarFormato(t, { desde: 15, hasta: 15 }, 'textbf')).texto).toBe('hola mundo');
});
it('negrita dentro de cursiva envuelve, no desenvuelve');
it('selección vacía inserta el comando con el cursor adentro', () => {
  const e = alternarFormato('ab', { desde: 1, hasta: 1 }, 'textit');
  expect(aplicar('ab', e).texto).toBe('a\\textit{}b'); expect(e.seleccion).toEqual({ ancla: 9, cabeza: 9 });
});
it.each([
  ['Objetivos', 1, '\\section{Objetivos}'],
  ['\\section{Objetivos}', 2, '\\subsection{Objetivos}'],
  ['\\section{Objetivos}', null, 'Objetivos'],
  ['\\section{IA}\\label{sec:x}', 2, '\\subsection{IA}\\label{sec:x}'],
  ['\\chapter*{Resumen}', 1, '\\section*{Resumen}'],
  ['', 1, '\\section{}'],
])('nivel de título: %j → %j', (linea, nivel, esperado) => {
  expect(aplicar('antes\n' + linea + '\ndespués', cambiarNivelTitulo('antes\n' + linea + '\ndespués', 6, nivel)).texto).toBe('antes\n' + esperado + '\ndespués');
});
it('agrega el paquete tras \\documentclass en el main.tex del fixture, y nada más cambia', () => {
  const o = leerFixture('main.tex'); const r = agregarPaquete(o, 'amsmath');
  const linea = '\\documentclass[oneside]{prgrado}\n';
  expect(r).toBe(o.replace(linea, linea + '\\usepackage{amsmath}\n'));
});
it('lo agrega después del último \\usepackage existente');
it('con configuración la inserta a continuación');
it.each(['\\usepackage{amsmath}', '\\usepackage[fleqn]{amsmath}', '\\usepackage{amssymb, amsmath}'])('no duplica si ya está: %s', (l) => {
  const t = '\\documentclass{book}\n' + l + '\n\\begin{document}\n'; expect(agregarPaquete(t, 'amsmath')).toBe(t);
});
it('un \\usepackage comentado no cuenta como presente');

// menuBarra.test.ts
it.each([['/', { desde: 0, consulta: '' }], ['  /ta', { desde: 2, consulta: 'ta' }], ['texto /ta', null], ['http://x', null]])('detectarBarra(%j)', (l, r) => {
  expect(detectarBarra(l)).toEqual(r);
});
it('filtra sin importar tildes ni mayúsculas', () => {
  expect(filtrarPlantillas('ecu').map(p => p.id)).toEqual(['ecuacion']);
  expect(filtrarPlantillas('codigo').map(p => p.id)).toEqual(['codigo']);
  expect(filtrarPlantillas('').map(p => p.id)).toHaveLength(10);
});
it('la plantilla de tabla termina sus filas con dos barras invertidas', () => { /* expandir el snippet en un EditorState y buscar '& Columna 2 \\\\\n' */ });
it('toda plantilla expandida es reconocida sin error por analizar');
```

Run: `npm test -- comandos menuBarra` → FAIL.

- [ ] **Step 2: Implementar `comandos.ts`, `plantillas.ts`, `menuBarra.ts` y verificar** → PASS.

- [ ] **Step 3: Conectar y verificar en el navegador, sobre el entorno de prueba**

1. Ctrl+B y Ctrl+I envuelven y desenvuelven; el selector de la barra cambia el nivel de la línea.
2. `/` al inicio de una línea vacía abre el menú con las diez opciones; `/ta` deja `Tabla`.
3. `Tabla`: pide confirmación del paquete `booktabs`; al aceptar, `main.tex` gana una sola línea (`git diff` del entorno) y la plantilla queda insertada con el cursor en la descripción; Tab recorre los campos.
4. `Referencia cruzada`: ofrece las cuatro etiquetas de `Cap2.tex` con su número y título.
5. `Figura` no pide paquete (`graphicx` viene de la clase).
6. Insertar las plantillas de tabla, ecuación y código, compilar con el compilador real: sin errores.

- [ ] **Step 4: Commit** — `Comandos de edición y menú de inserción`.

---

### Task 11: Sincronización y PDF en la pantalla

**Files:**
- Create: `editor/cliente/pantalla/sincronizacion.ts`, `bloqueoConflicto.ts`, `panelPdf.ts`
- Modify: `editor/cliente/main.ts`, `estilos.css`

**Interfaces:**
- Consumes: `api`, `ControlEditor`, `crearBarra`, tipos de resultado.
- Produces:

```ts
export function crearSincronizacion(barra: ReturnType<typeof crearBarra>, o: {
  editor: ControlEditor; alActualizar(): Promise<void>;       // recargar proyecto y archivo
  alConflicto(archivos: string[]): void;
}): { revisar(): Promise<void> };
export function crearBloqueoConflicto(padre: HTMLElement, o: { editor: ControlEditor; alResolver(): Promise<void> }): { mostrar(archivos: string[]): void; ocultar(): void };
export function crearPanelPdf(padre: HTMLElement, o: { alElegirProblema(ruta: string, linea: number): void }): { compilar(): Promise<void> };
```

Comportamiento y textos exactos:

- Botones `Traer` y `Enviar` en la barra. Mientras corre una operación ambos quedan inactivos y la barra muestra `Trayendo…` o `Enviando…`. Antes de cualquiera de las dos se llama `editor.guardarAhora()`.
- Resultados de Traer: sin cambios `Ya estabas al día`; un archivo `Se actualizó 1 archivo`; varios `Se actualizaron N archivos`. Después llama `alActualizar`.
- Resultados de Enviar: `Cambios enviados a Overleaf`; sin nada para enviar `No había cambios para enviar`.
- Errores: `autenticacion` → `Git no pudo autenticarse con Overleaf. Abrí una terminal en la carpeta informe, ejecutá git pull e ingresá el token.`; `sin-conexion` → `No hay conexión con Overleaf. Tus cambios están guardados en esta máquina.`; `rechazado` y `otro` → `Overleaf rechazó la operación:` seguido del mensaje original.
- `revisar` consulta `estadoGit` al iniciar y cada 30 s. Con `commitsSinTraer > 0` la barra muestra `Hay cambios nuevos en Overleaf` junto a Traer. Con `cambiosLocales` o `commitsSinEnviar > 0`, un punto junto a Enviar con el título `Tenés cambios sin enviar`. Con `combinacionEnCurso`, llama `alConflicto`.
- Bloqueo por conflicto: cubre el editor (`editor.bloquear(true)`), con el título `Vos y otra persona cambiaron el mismo párrafo`, la lista de archivos, y los botones `Resolver en VS Code`, `Ya lo resolví` y `Cancelar la combinación`. `Ya lo resolví` con `quedan-marcas` muestra `Todavía quedan marcas de conflicto en:` y los archivos. Al resolver o cancelar: desbloquea, oculta y llama `alResolver`.
- Panel PDF: botón `Compilar` (`Compilando…` mientras corre). `iframe` con `/api/pdf?t=<marca de tiempo>`, recargado solo cuando `pdfActualizado`; ante errores se conserva el último PDF. Debajo, la lista de problemas con ícono por gravedad; `ruta` y `linea` como `Cap2.tex, línea 12`; clic abre el archivo y va a la línea (sin acción si `ruta` es null).
- `sin-latex`: `Para ver el PDF hace falta instalar MiKTeX. Los pasos están en INSTALACION.md.` `vencido`: `La compilación tardó demasiado y se canceló. Si es la primera vez, MiKTeX puede estar descargando paquetes: probá de nuevo.`
- Si `compilarAlGuardar` es verdadero, compila después de cada guardado exitoso.

- [ ] **Step 1: Implementar los tres módulos y conectarlos en `main.ts`**

- [ ] **Step 2: Verificar en el navegador, sobre el entorno de prueba**

1. Editar y `Enviar` → `Cambios enviados a Overleaf`; `git -C .entorno-prueba/remoto.git log --oneline` muestra el commit.
2. `npm run companero -- Cap4.tex "Párrafo del compañero"` y reiniciar el servidor (hace `fetch` al arrancar; si no, habría que esperar 5 minutos). En menos de 30 s la barra muestra `Hay cambios nuevos en Overleaf`. `Traer` → `Se actualizó 1 archivo` y el párrafo aparece.
3. Conflicto: editar el título de `Cap4.tex`, hacer que el compañero cambie la misma línea, `Traer` → aparece el bloqueo con `Cap4.tex`. `Ya lo resolví` sin resolver → mensaje de marcas. `Cancelar la combinación` → editor desbloqueado con mi texto.
4. Repetir el conflicto, resolver el archivo a mano fuera del editor, `Ya lo resolví` → se desbloquea; `Enviar` funciona.
5. `Compilar` → aparece el PDF. Escribir `\textbff{x}` en `Cap2.tex` y compilar → problema `Comando desconocido: \textbff` en `Cap2.tex`; el clic lleva a la línea; el PDF anterior sigue visible.
6. Cambiar la URL del remoto del entorno a una inexistente y `Traer` → mensaje de sin conexión.

- [ ] **Step 3: Commit** — `Sincronización y PDF en la pantalla`.

---

### Task 12: Acceso directo, guía de instalación y verificación final

**Files:**
- Create: `editor/lanzador/abrir.ps1`, `editor/lanzador/crear-acceso-directo.ps1`, `editor/INSTALACION.md`

**Interfaces:**
- Consumes: `GET /api/salud`, `config.json` (`puerto`), scripts de `package.json`.

Reglas de `abrir.ps1` (Windows PowerShell 5.1):
1. Lee `puerto` de `editor/config.json`.
2. Si `http://127.0.0.1:<puerto>/api/salud` responde `editor-informe`, abre esa dirección en el navegador predeterminado y termina.
3. Si no existe `editor/dist/index.html` o `editor/node_modules`, muestra una ventana (`System.Windows.Forms.MessageBox`) con `El editor no está instalado. Seguí los pasos de INSTALACION.md.` y termina.
4. Inicia `node --import tsx servidor/index.ts` con `Start-Process -WindowStyle Hidden` y directorio de trabajo `editor/`.
5. Consulta la salud cada 500 ms hasta 20 s. Si responde, abre el navegador. Si no, muestra `El editor no pudo iniciar.` seguido del motivo si se conoce (por ejemplo, `No se encontró Node.`).

Reglas de `crear-acceso-directo.ps1`: crea `Editor del informe.lnk` en `[Environment]::GetFolderPath('Desktop')`, con destino `powershell.exe`, argumentos `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "<ruta absoluta de abrir.ps1>"`, `WindowStyle = 7` (minimizada), ícono `%SystemRoot%\System32\shell32.dll,1`. Si ya existe, lo reemplaza. Imprime la ruta creada.

`INSTALACION.md`, en español, con estas secciones en este orden (contenido según la sección 6.7 de la especificación):

1. Qué es y qué necesitás
2. Requisitos: Git, Node 24, MiKTeX (con el comando de comprobación y el de instalación de cada uno, y el ajuste de instalación automática de paquetes)
3. Conectar con Overleaf: generar el token, clonar en `informe/` con `git clone https://git@git.overleaf.com/<id-del-proyecto> informe`, no compartir el token, qué hacer ante el error 403
4. Instalar el editor: `npm install`, `npm run build`, `npm run acceso-directo`
5. Uso diario: abrir, escribir, menú `/`, Traer, Enviar, Compilar, y la costumbre de Traer al empezar y Enviar al terminar
6. Qué no hace: comentarios de Overleaf, tiempo real
7. Opciones de `config.json`
8. Problemas frecuentes: autenticación de Git, MiKTeX pidiendo paquetes, puerto ocupado, conflicto al Traer
9. Si el editor no arranca: seguir en VS Code sobre `informe/`
10. Después de actualizar el editor: `npm run build`

- [ ] **Step 1: Escribir `abrir.ps1` y `crear-acceso-directo.ps1`**

- [ ] **Step 2: Verificar el lanzador**

`npm run build`, `npm run acceso-directo`. Comprobar:
1. Existe `Editor del informe.lnk` en el escritorio.
2. Doble clic: se abre el navegador con el editor, sin ventana de consola visible.
3. Segundo doble clic: se abre otra pestaña y sigue habiendo un solo proceso `node` escuchando en 4317 (`Get-NetTCPConnection -LocalPort 4317`).
4. Renombrar temporalmente `dist/` y lanzar con el servidor detenido → ventana `El editor no está instalado…`. Restaurar.

- [ ] **Step 3: Escribir `INSTALACION.md`**

- [ ] **Step 4: Verificar la guía**

Seguir la guía literalmente desde la sección 4 en una copia limpia de `editor/` (sin `node_modules` ni `dist`) en un directorio temporal, apuntando al entorno de prueba. Las secciones 2 y 3 se verifican ejecutando sus comandos de comprobación. Corregir todo paso que no funcione tal como está escrito.

- [ ] **Step 5: Suite completa**

Run: `npm test` → todo en verde. `git -C ../informe status --porcelain` → vacío (ninguna tarea tocó el informe real).

- [ ] **Step 6: Verificación manual con el informe real (con Cristhian presente)**

Con la configuración normal (`config.json`, informe real):
1. Abrir desde el acceso directo. Recorrer todos los capítulos sin editar → `git -C ../informe status --porcelain` vacío.
2. `Compilar` → comparar el PDF con el de Overleaf: mismas páginas, mismo índice, bibliografía presente.
3. `Traer` → `Ya estabas al día`, o trae lo que haya.
4. Cristhian edita un párrafo que elija. **Pedir su confirmación explícita antes de apretar Enviar**, mostrando `git -C ../informe diff`.
5. Tras Enviar, Cristhian verifica en Overleaf que el historial muestra solo ese cambio.
6. Cristhian edita una palabra en Overleaf; `Traer` → aparece en el editor.

- [ ] **Step 7: Commit** — `Acceso directo, guía de instalación y verificación de la etapa 1`.
