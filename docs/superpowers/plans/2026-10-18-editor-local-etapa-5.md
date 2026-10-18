# Editor local del informe, etapa 5: verificador informe ↔ repositorio. Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el editor lance un agente de Claude Code de solo lectura que compare el informe con `uy-social-topic-modeling` y muestre los hallazgos en una pestaña Verificación, con las frases subrayadas en el texto.

**Architecture:** El servidor arma una carpeta temporal con una foto del informe (`informe/`) y una foto de la rama `main` del repo (`repositorio/`), lanza `claude -p` ahí con la prompt por la entrada estándar, valida las citas de lo que devuelve y guarda la corrida en `Tesis/verificaciones/`. El cliente consulta el estado, muestra la última corrida en una tercera pestaña del panel derecho y subraya las citas con decoraciones propias (no con `@codemirror/lint`, que ya usa la gramática).

**Tech Stack:** el de las etapas anteriores (TypeScript, Node 24, Express 5, Vite, Vitest, CodeMirror 6). Sin dependencias nuevas. Programas externos: `git` (ya requerido), `tar` de Windows (viene con Windows 10 y 11) y el CLI `claude`.

**Spec:** `docs/superpowers/specs/2026-10-18-editor-local-etapa-5-design.md`. Leerla antes de empezar.

## Desvíos respecto de la spec (decididos al planear)

1. **Foto del repositorio con `git archive`, no con `git worktree`.** `worktree add` escribe en `.git/worktrees` del repo del equipo. `git archive <commit>` a un zip y `tar -xf` a la carpeta temporal da lo mismo (solo archivos versionados, sin `.env`) sin escribir nada en el repo.
2. **La carpeta de trabajo del agente contiene las dos fotos** (`informe/` y `repositorio/`), así no hace falta `--add-dir` ni pasar rutas con espacios por `cmd`.
3. **`cargarConfig` no valida la carpeta ni la rama.** Si lo hiciera, un repo movido impediría abrir el editor. Lo valida el verificador al consultar su estado: el botón queda deshabilitado con el motivo (sección 4 de la spec), y el editor arranca igual.
4. **Los errores que no son corridas** (CLI ausente, sesión, rama, límite) no se guardan como archivo: quedan en el estado del verificador hasta la próxima corrida. Solo "JSON ilegible" se guarda como corrida fallida, como dice la spec.

## Global Constraints

- **Invariante de fidelidad:** nada de esta etapa escribe en `informe/` ni en el repositorio de la aplicación (tampoco en su `.git`).
- `Tesis/informe/` es un documento compartido. Las pruebas nunca leen ni escriben ahí, ni contactan a Overleaf: usan `pruebas/fixtures/`, directorios temporales y repos Git creados en la prueba.
- El agente nunca recibe el `.env` del repo: la foto solo trae archivos versionados.
- `npm test` no lanza el CLI real ni gasta tokens: el lanzador se inyecta.
- **El ícono del escritorio ejecuta lo que hay en `Tesis/editor/`.** Se trabaja en un worktree aparte (rama `etapa-5`). Si el editor de Cristhian está corriendo (4317 y 4319) no se lo toca: las pruebas manuales usan 4327 y 4329 con `config.prueba.json` (`"corrector": false` en el worktree). Integrar a `main` es a pedido suyo y exige `npm run build`.
- Interfaz en español rioplatense (voseo), sin mayúsculas de título ni signos de exclamación. Los textos entre comillas de este plan son copia exacta.
- Identificadores en español. La lógica probable vive sin DOM (`compartido/`, `cliente/*.ts`); lo que arma pantalla, en `cliente/pantalla/`.
- TDD en cada tarea; un commit por tarea como mínimo, en español, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Durante la tarea se corre `npx vitest run <archivo>`; la suite completa al cerrarla.
- Los heredocs largos de bash fallan en esta máquina: scripts auxiliares como archivo.
- En Windows, `claude` instalado con npm es un `.cmd`: se lanza con `cmd /c`. Detenerlo es `taskkill /PID <pid> /T /F`, como LanguageTool.

## Review Focus

1. **Una cita que cruza un salto de línea o tiene espacios dobles.** El agente copia "la API\nescribe en la base" como "la API escribe en la base": la validación y la ubicación toleran diferencias de espacios. Una cita a la que el agente le quitó un `\textit{…}` no coincide y se descarta, no se subraya en otro lado. Pruebas en las tareas 1 y 8.
2. **Salida del agente con texto alrededor.** Prosa antes del JSON, un bloque ```json, o `[]` solo. Se extrae el arreglo; si no hay uno, la corrida queda "ilegible" con la salida cruda. Prueba en la tarea 3.
3. **Rutas que el agente escribe a su manera.** `repositorio/backend/x.py`, `.\backend\x.py`, `informe/Cap3.tex`, o una que sale de la carpeta (`../.env`). Se normalizan las primeras; las que salen se descartan. Prueba en la tarea 1.
4. **Una corrida que termina mal.** Cancelada, pasada de tiempo, CLI ausente o servidor que se cierra: la carpeta temporal se borra siempre y el proceso del agente no queda vivo. Al iniciar, se borran temporales viejos de corridas anteriores. Pruebas en la tarea 6.
5. **Dos pestañas, o dos clics.** Una segunda corrida mientras hay una en curso se rechaza con "Ya hay una verificación en curso." y no lanza otro agente. Prueba en las tareas 6 y 7.

## Estructura de archivos

```
editor/
├── compartido/
│   ├── verificacion.ts          (crear) tipos, id, normalización, validación, comparación
│   ├── promptVerificacion.ts    (crear) notas por sección y prompt
│   └── tipos.ts                 (modificar) Config
├── servidor/
│   ├── agente.ts                (crear) lanzar `claude -p`, interpretar su salida
│   ├── fotos.ts                 (crear) foto del informe y del repositorio
│   ├── proyecto.ts              (modificar) archivosDe
│   ├── verificaciones.ts        (crear) corridas, resueltos e ignorados en disco
│   ├── verificador.ts           (crear) una corrida de punta a punta
│   ├── config.ts                (modificar) claves nuevas
│   ├── app.ts, index.ts         (modificar) rutas y cableado
├── cliente/
│   ├── verificacion.ts          (crear) ubicar citas, agrupar, textos del panel y del menú
│   ├── subrayadoVerificacion.ts (crear) decoraciones de las citas
│   ├── pantalla/panelVerificacion.ts (crear)
│   ├── api.ts, main.ts, estilos.css (modificar)
├── INSTALACION.md               (modificar)
.gitignore                       (modificar) /verificaciones/
```

Cada `X.ts` lleva su `X.test.ts` al lado, salvo `panelVerificacion.ts` y `main.ts` (pantalla, se prueban a mano como el resto de `pantalla/`).

---

### Task 1: Hallazgos: tipos, id, validación y comparación

**Files:**
- Create: `editor/compartido/verificacion.ts`
- Test: `editor/compartido/verificacion.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type TipoDeHallazgo = 'contradiccion' | 'no-lo-cuenta' | 'sin-respaldo';
  export type Alcance = 'capitulo' | 'todo';
  export interface Hallazgo {
    id: string; tipo: TipoDeHallazgo;
    informe: { archivo: string; linea: number | null; cita: string | null };   // cita null solo en no-lo-cuenta
    repo: { archivo: string; linea: number | null } | null;                   // null solo en sin-respaldo
    explicacion: string;
  }
  export interface Corrida {
    fecha: string;                       // ISO 8601
    alcance: Alcance; archivos: string[]; rama: string; commit: string; duracionMs: number;
    estado: 'ok' | 'fallida'; crudo: string | null;   // crudo: la salida del agente, solo si falló
    descartados: number; hallazgos: Hallazgo[]; resueltos: string[];
    comparacion: { nuevos: number; yaNoAparecen: number } | null;
  }
  export interface Ignorado {
    id: string; tipo: TipoDeHallazgo; archivoInforme: string; cita: string | null;
    archivoRepo: string | null; explicacion: string; fecha: string;
  }
  export type MotivoDeFalla = 'sin-cli' | 'sin-sesion' | 'rama' | 'limite' | 'ilegible' | 'otro';
  export type EstadoVerificacion =
    | { estado: 'deshabilitada'; motivo: string }
    | { estado: 'libre'; error: { motivo: MotivoDeFalla; mensaje: string } | null }
    | { estado: 'en-curso'; alcance: Alcance; desde: number };   // desde: Date.now() al iniciar
  export function normalizarEspacios(texto: string): string;
  export function normalizarRuta(ruta: string, prefijo: 'informe' | 'repositorio'): string | null;
  export function idDeHallazgo(h: Omit<Hallazgo, 'id' | 'explicacion'>): string;
  export function validarHallazgos(crudos: unknown, contexto: {
    informe: ReadonlyMap<string, string>;          // ruta relativa → texto con \n
    lineasDelRepo(archivo: string): number | null; // null si no existe
  }): { hallazgos: Hallazgo[]; descartados: number };
  export function compararCorridas(anterior: readonly Hallazgo[], actual: readonly Hallazgo[]): { nuevos: number; yaNoAparecen: number };
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
const INFORME = new Map([['Cap3.tex', 'La API\nescribe   en la base.\n\\section{Datos}\n']]);
const contexto = { informe: INFORME, lineasDelRepo: (a: string) => (a === 'backend/jobs.py' ? 120 : null) };
const crudo = (cambios: object = {}) => ({
  tipo: 'contradiccion', informe: { archivo: 'Cap3.tex', linea: 1, cita: 'La API escribe en la base' },
  repo: { archivo: 'backend/jobs.py', linea: 88 }, explicacion: 'Escribe el orquestador.', ...cambios,
});

it('acepta una cita que cruza un salto de línea y tiene espacios de más', () => {
  const r = validarHallazgos([crudo()], contexto);
  expect(r.descartados).toBe(0);
  expect(r.hallazgos[0]).toMatchObject({ tipo: 'contradiccion', informe: { archivo: 'Cap3.tex', cita: 'La API escribe en la base' } });
});
it('descarta una cita que no está en el archivo', () => {
  expect(validarHallazgos([crudo({ informe: { archivo: 'Cap3.tex', linea: 1, cita: 'la API lee' } })], contexto))
    .toEqual({ hallazgos: [], descartados: 1 });
});
it('descarta archivo del informe ausente, archivo del repo inexistente y línea fuera de rango', () => { /* tres crudos → descartados 3 */ });
it('descarta tipo inválido y lados faltantes', () => {
  // tipo 'otro'; contradiccion sin repo; no-lo-cuenta sin repo; sin-respaldo sin cita → descartados 4
});
it('sin-respaldo acepta repo ausente y no-lo-cuenta acepta cita ausente', () => { /* 2 aceptados, repo null y cita null */ });
it('normaliza rutas del agente', () => {
  expect(normalizarRuta('repositorio/backend/jobs.py', 'repositorio')).toBe('backend/jobs.py');
  expect(normalizarRuta('.\\backend\\jobs.py', 'repositorio')).toBe('backend/jobs.py');
  expect(normalizarRuta('informe/Cap3.tex', 'informe')).toBe('Cap3.tex');
  expect(normalizarRuta('../.env', 'repositorio')).toBeNull();
  expect(normalizarRuta('C:/x/y.py', 'repositorio')).toBeNull();
});
it('el id no cambia con los espacios de la cita ni con la línea', () => {
  const a = validarHallazgos([crudo()], contexto).hallazgos[0];
  const b = validarHallazgos([crudo({ informe: { archivo: 'Cap3.tex', linea: 7, cita: 'La  API escribe en\nla base' } })], contexto).hallazgos[0];
  expect(a.id).toBe(b.id);
});
it('compara corridas por id', () => {
  // anterior [x, y], actual [y, z] → { nuevos: 1, yaNoAparecen: 1 }
});
it('si lo crudo no es un arreglo, no hay hallazgos ni descartados', () => {
  expect(validarHallazgos({ a: 1 }, contexto)).toEqual({ hallazgos: [], descartados: 0 });
});
```

- [ ] **Step 2: Correr y ver que fallan.** `npx vitest run compartido/verificacion.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar** en `editor/compartido/verificacion.ts`. `normalizarEspacios`: `\s+` → un espacio, y `trim`. `normalizarRuta`: barras a `/`, quita `./` y el prefijo `<prefijo>/` iniciales; null si queda vacía, es absoluta (`/` inicial o `X:`) o tiene un segmento `..`. La cita vale si `normalizarEspacios(texto)` la contiene (`linea` es solo pista: se conserva tal cual si es entero positivo, si no `null`). La línea del repo vale si es entero entre 1 y `lineasDelRepo`. `explicacion` tiene que ser texto no vacío. `idDeHallazgo`: FNV-1a de 32 bits en hexadecimal (8 caracteres) sobre `tipo|archivoInforme|normalizarEspacios(cita ?? '')|archivoRepo ?? ''`. Sin módulos de Node: se usa también en el cliente. Dos hallazgos válidos con el mismo id cuentan una vez.

- [ ] **Step 4: Correr y ver que pasan.** Mismo comando → PASS.

- [ ] **Step 5: Commit** — `git add editor/compartido/verificacion*` · "Verificación: hallazgos, validación de citas y comparación"

---

### Task 2: Prompt de verificación

**Files:**
- Create: `editor/compartido/promptVerificacion.ts`
- Test: `editor/compartido/promptVerificacion.test.ts`

**Interfaces:**
- Consumes: `analizar` de `compartido/analizador.ts` (elementos `titulo` y `comentario`); `Ignorado` de la tarea 1.
- Produces:
  ```ts
  export function notasPorSeccion(texto: string): { titulo: string; notas: string[] }[];
  export function armarPromptDeVerificacion(o: {
    archivos: { ruta: string; texto: string }[]; rama: string; commit: string; ignorados: Ignorado[];
  }): string;
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
const TEXTO = '\\chapter{Solución}\n% Cómo quedó el sistema.\n\\section{Arquitectura general}\n% Un solo diagrama.\n%   Y un párrafo por pieza.\nTexto.\n% nota suelta\n\\section{Uso}\n';
it('junta las notas que siguen a cada título', () => {
  expect(notasPorSeccion(TEXTO)).toEqual([
    { titulo: 'Solución', notas: ['Cómo quedó el sistema.'] },
    { titulo: 'Arquitectura general', notas: ['Un solo diagrama.', 'Y un párrafo por pieza.', 'nota suelta'] },
  ]);   // "Uso" no tiene notas: no aparece
});
it('la prompt lista los archivos, la rama, las notas y los ignorados', () => {
  const p = armarPromptDeVerificacion({ archivos: [{ ruta: 'Cap3.tex', texto: TEXTO }], rama: 'main', commit: '583d2cc',
    ignorados: [{ id: 'a', tipo: 'no-lo-cuenta', archivoInforme: 'Cap3.tex', cita: null, archivoRepo: 'x.py', explicacion: 'Falta x.', fecha: '' }] });
  expect(p).toContain('- informe/Cap3.tex');
  expect(p).toContain('rama main, commit 583d2cc');
  expect(p).toContain('- Arquitectura general: Un solo diagrama. Y un párrafo por pieza. nota suelta');
  expect(p).toContain('- [no-lo-cuenta] Cap3.tex (repositorio/x.py): Falta x.');
  expect(p.trim().endsWith('Si no encontrás nada, devolvé [].')).toBe(true);
});
it('sin ignorados no lleva esa sección', () => { /* no contiene '## Ya ignorados' */ });
```

- [ ] **Step 2: Correr y ver que fallan.** `npx vitest run compartido/promptVerificacion.test.ts` → FAIL.

- [ ] **Step 3: Implementar.** Una nota es el texto de un comentario sin el `%` inicial ni los espacios; se omiten las vacías. Un ignorado con cita se escribe `- [tipo] archivo: «cita» — explicación`; sin cita, `- [tipo] archivo (repositorio/<archivoRepo>): explicación`. Copia exacta de la prompt (las llaves son los valores):

```
Sos un revisor técnico. Compará el informe de un proyecto de grado con el código de la aplicación que describe y devolvé solo los lugares donde no coinciden.

En la carpeta de trabajo hay dos carpetas:
- informe/: los archivos LaTeX a revisar. Solo los de la lista de abajo.
- repositorio/: el código de la aplicación, rama {rama}, commit {commit}.

Tipos de hallazgo:
- "contradiccion": el informe dice algo y el código hace otra cosa.
- "no-lo-cuenta": está en el código y la sección debería contarlo, según sus notas o su texto. Los detalles de programación van en los anexos: no reclames cada función.
- "sin-respaldo": el informe afirma algo que no aparece en el código.

## Archivos a revisar
{una línea "- informe/<ruta>" por archivo}

## Qué debería contar cada sección
Son las notas % que el equipo dejó bajo cada título.
{por archivo con notas: "### <ruta>" y una línea "- <titulo>: <notas unidas por espacio>" por sección}

## Ya ignorados
No vuelvas a reportar estos:
{una línea por ignorado}

## Reglas
- Citá el informe textualmente: copiá la frase tal como está en el archivo, con sus comandos LaTeX.
- Citá el repositorio con la ruta relativa a repositorio/ y el número de línea.
- No propongas texto nuevo para el informe: solo decí qué pasa.
- La explicación va en español, en una o dos oraciones.
- Solo leé y buscá: no modifiques nada.
- Devolvé únicamente un arreglo JSON, sin texto alrededor ni bloque de código, con esta forma:
[{"tipo": "contradiccion", "informe": {"archivo": "Cap3.tex", "linea": 14, "cita": "frase del informe"}, "repo": {"archivo": "backend/jobs.py", "linea": 88}, "explicacion": "qué no coincide"}]
- En "no-lo-cuenta", "informe" lleva solo "archivo" y la "linea" del título donde iría. En "sin-respaldo", "repo" puede faltar.
- Si no encontrás nada, devolvé [].
```

- [ ] **Step 4: Correr y ver que pasan.**
- [ ] **Step 5: Commit** — "Verificación: prompt con las notas de cada sección"

---

### Task 3: Lanzar el agente e interpretar su salida

**Files:**
- Create: `editor/servidor/agente.ts`
- Test: `editor/servidor/agente.test.ts`, `editor/pruebas/ayudas/agenteFalso.mjs`

**Interfaces:**
- Produces:
  ```ts
  export interface ProcesoAgente {
    terminado: Promise<{ codigo: number | null; stdout: string; stderr: string; noEncontrado: boolean }>;
    detener(): void;          // árbol de procesos; idempotente
  }
  export type LanzarAgente = (o: { cwd: string; prompt: string }) => ProcesoAgente;
  export function crearLanzadorAgente(comando?: string[]): LanzarAgente;   // por defecto ['claude']
  export const ARGUMENTOS_DEL_AGENTE: string[];
  export type SalidaInterpretada =
    | { tipo: 'ok'; crudos: unknown }
    | { tipo: 'sin-cli' } | { tipo: 'sin-sesion'; mensaje: string }
    | { tipo: 'ilegible'; crudo: string } | { tipo: 'otro'; mensaje: string };
  export function interpretarSalida(s: { codigo: number | null; stdout: string; stderr: string; noEncontrado: boolean }): SalidaInterpretada;
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
const envoltura = (result: string, is_error = false) => JSON.stringify({ type: 'result', subtype: 'success', is_error, result });
const salida = (stdout: string, codigo = 0, stderr = '') => ({ codigo, stdout, stderr, noEncontrado: false });

it('lee el arreglo del campo result', () => {
  expect(interpretarSalida(salida(envoltura('[{"tipo":"x"}]')))).toEqual({ tipo: 'ok', crudos: [{ tipo: 'x' }] });
});
it('tolera prosa alrededor y un bloque ```json', () => {
  expect(interpretarSalida(salida(envoltura('Listo:\n```json\n[]\n```\nEso es todo.')))).toEqual({ tipo: 'ok', crudos: [] });
});
it('sin arreglo es ilegible y conserva la salida cruda', () => {
  const s = salida(envoltura('No pude leer los archivos.'));
  expect(interpretarSalida(s)).toEqual({ tipo: 'ilegible', crudo: s.stdout });
});
it('stdout que no es JSON es ilegible', () => { /* salida('basura') → ilegible */ });
it('CLI ausente: proceso no encontrado, o cmd con código 9009', () => {
  expect(interpretarSalida({ codigo: null, stdout: '', stderr: '', noEncontrado: true })).toEqual({ tipo: 'sin-cli' });
  expect(interpretarSalida(salida('', 9009, "'claude' no se reconoce como un comando interno o externo"))).toEqual({ tipo: 'sin-cli' });
});
it('sesión no iniciada', () => {
  expect(interpretarSalida(salida(envoltura('Invalid API key · Please run /login', true), 1)).tipo).toBe('sin-sesion');
});
it('otro error con su mensaje', () => { /* is_error true con 'Overloaded' → { tipo: 'otro', mensaje: 'Overloaded' } */ });

it('el lanzador pasa la prompt por la entrada estándar y devuelve la salida', async () => {
  const lanzar = crearLanzadorAgente(['node', path.resolve(import.meta.dirname, '../pruebas/ayudas/agenteFalso.mjs')]);
  const r = await lanzar({ cwd: dirTemporal(), prompt: 'hola' }).terminado;
  expect(JSON.parse(r.stdout).result).toBe('eco:hola');
});
it('detener corta un agente que no termina', async () => {
  // AGENTE_FALSO=colgado → el script espera para siempre; detener() y `terminado` resuelve en menos de 5 s
});
```

`agenteFalso.mjs` lee toda la entrada estándar y, según `process.env.AGENTE_FALSO`: sin valor imprime `envoltura('eco:' + entrada)`; `colgado` no termina nunca; `fijo` imprime el contenido del archivo `process.env.AGENTE_FALSO_SALIDA`. Lo usan también las tareas 6 y 7.

- [ ] **Step 2: Correr y ver que fallan.** `npx vitest run servidor/agente.test.ts`

- [ ] **Step 3: Implementar.** `ARGUMENTOS_DEL_AGENTE = ['-p', '--output-format', 'json', '--allowedTools', 'Read,Grep,Glob', '--disallowedTools', 'Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch']`. En Windows se lanza `cmd /c <comando…> <ARGUMENTOS_DEL_AGENTE…>`; en otro sistema, el comando directo. Lo de prueba (`node …`) lleva los mismos argumentos, que el script ignora. `stdio: ['pipe', 'pipe', 'pipe']`, `windowsHide: true`. La prompt se escribe en stdin y se cierra. `detener` con `taskkill /PID <pid> /T /F` en Windows, como `languagetool.ts`. `interpretarSalida`: el arreglo es lo que va del primer `[` al último `]` de `result` (sacando los cercos ```` ``` ````), parseado; sin sesión cuando `is_error` y el mensaje coincide con `/login|log in|api key|not authenticated/i`.

- [ ] **Step 4: Correr y ver que pasan.**
- [ ] **Step 5: Commit** — "Verificación: lanzador del agente y lectura de su salida"

---

### Task 4: Fotos del informe y del repositorio

**Files:**
- Create: `editor/servidor/fotos.ts`
- Modify: `editor/servidor/proyecto.ts` (exportar `archivosDe`)
- Test: `editor/servidor/fotos.test.ts`, `editor/servidor/proyecto.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // proyecto.ts — la ruta y todo lo que incluye con \input/\include, recursivo, sin repetir, en orden de aparición.
  export function archivosDe(dirInforme: string, ruta: string): string[];
  // fotos.ts
  export async function fotografiarInforme(dirInforme: string, rutas: string[], destino: string): Promise<Map<string, string>>; // ruta → texto con \n
  export type ResultadoFotoRepo = { tipo: 'ok'; commit: string } | { tipo: 'error'; motivo: 'rama' | 'otro'; mensaje: string };
  export async function fotografiarRepositorio(repo: string, rama: string, destino: string): Promise<ResultadoFotoRepo>;
  export async function problemaDelRepositorio(repo: string | null, rama: string): Promise<string | null>;
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**

`proyecto.test.ts`: `archivosDe(fixture, 'Cap6.tex')` devuelve `['Cap6.tex', …sus incluidos]`; un archivo sin `\input` devuelve solo él; un `\input` comentado no cuenta (si el fixture no tiene anexos en carpeta, la prueba arma un informe temporal con `Anexos.tex` que incluye `Anexos/A.tex`).

`fotos.test.ts`, con un repo creado en la prueba (`git init -b main`, `user.name`/`user.email` locales, commit de `backend/app.py` y `.gitignore` con `.env`; después `.env` sin versionar, rama `otra` con un commit más y checkout de `otra`, y una modificación sin commitear de `backend/app.py`):

```ts
it('trae main tal como está commiteado, sin .env ni cambios locales', async () => {
  const r = await fotografiarRepositorio(repo, 'main', destino);
  expect(r).toEqual({ tipo: 'ok', commit: commitDeMain });          // hash completo
  expect(fs.readFileSync(path.join(destino, 'backend/app.py'), 'utf8')).toBe(contenidoEnMain);
  expect(fs.existsSync(path.join(destino, '.env'))).toBe(false);
});
it('no escribe nada en el repositorio', async () => {
  // `git status --porcelain` y el listado de .git/ (sin .git/index ni logs) iguales antes y después; no hay .git/worktrees
});
it('rama inexistente', async () => {
  expect(await fotografiarRepositorio(repo, 'nada', destino)).toMatchObject({ tipo: 'error', motivo: 'rama' });
});
it('la foto del informe copia las rutas pedidas, con subcarpetas', async () => { /* Map con textos normalizados a \n */ });
it('problemaDelRepositorio', async () => {
  expect(await problemaDelRepositorio(null, 'main')).toBe('Falta "repositorio" en config.json: la ruta de la aplicación a comparar.');
  expect(await problemaDelRepositorio(path.join(dir, 'no'), 'main')).toBe(`No existe la carpeta ${path.join(dir, 'no')}.`);
  expect(await problemaDelRepositorio(dirSinGit, 'main')).toBe(`${dirSinGit} no es un repositorio de Git.`);
  expect(await problemaDelRepositorio(repo, 'nada')).toBe(`No se encontró la rama nada en ${repo}.`);
  expect(await problemaDelRepositorio(repo, 'main')).toBeNull();
});
```

- [ ] **Step 2: Correr y ver que fallan.**

- [ ] **Step 3: Implementar.** Rama: `git -C <repo> rev-parse --verify --quiet refs/heads/<rama>^{commit}`. Foto: `git -C <repo> archive --format=zip -o <destino>.zip <commit>`, `tar -xf <destino>.zip -C <destino>` y borrar el zip. Los textos de la foto del informe se leen con `decodificar` de `archivos.ts`. `archivosDe` reutiliza `leerFuente` y `resolverIncluido` del mismo archivo.

- [ ] **Step 4: Correr y ver que pasan.**
- [ ] **Step 5: Commit** — "Verificación: fotos del informe y del repositorio sin tocar el repo"

---

### Task 5: Corridas, resueltos e ignorados en disco

**Files:**
- Create: `editor/servidor/verificaciones.ts`
- Test: `editor/servidor/verificaciones.test.ts`

**Interfaces:**
- Consumes: `Corrida`, `Hallazgo`, `Ignorado`, `compararCorridas` (tarea 1).
- Produces:
  ```ts
  export interface Verificaciones {
    guardar(c: Omit<Corrida, 'comparacion' | 'resueltos'>): Promise<Corrida>;   // calcula comparacion
    ultima(): Promise<Corrida | null>;
    marcarResuelto(id: string): Promise<void>;     // en la última corrida
    ignorados(): Promise<Ignorado[]>;
    ignorar(id: string): Promise<void>;            // toma el hallazgo de la última corrida
    recuperar(id: string): Promise<void>;
  }
  export class HallazgoDesconocido extends Error {}
  export function crearVerificaciones(dir: string): Verificaciones;
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('guarda con nombre AAAA-MM-DD-HHmm-<commit corto> y la devuelve como última', async () => {
  // fecha '2026-10-18T14:32:00' local, commit '583d2cc1…' → archivo '2026-10-18-1432-583d2cc.json'
});
it('dos corridas en el mismo minuto no se pisan', async () => { /* segunda: '…-583d2cc-2.json' */ });
it('compara con la anterior del mismo alcance y los mismos archivos', async () => {
  // capitulo [Cap3.tex] {x,y}; todo {…}; capitulo [Cap3.tex] {y,z} → comparacion { nuevos: 1, yaNoAparecen: 1 }
  // la primera de cada alcance → comparacion null
});
it('una corrida fallida no sirve de anterior', async () => {});
it('marcar resuelto persiste al releer', async () => { /* ultima().resueltos contiene el id; dos veces no lo repite */ });
it('ignorar guarda cita y explicación, y recuperar lo quita', async () => {});
it('ignorar o resolver un id que no está lanza HallazgoDesconocido', async () => {});
it('sin carpeta, ultima es null e ignorados es []', async () => {});
```

- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.** Crea la carpeta al guardar. Escritura atómica (temporal + `rename`) y en serie, como `guia.ts`. La última corrida es el `.json` de nombre mayor sin contar `ignorados.json`.
- [ ] **Step 4: Correr y ver que pasan.**
- [ ] **Step 5: Commit** — "Verificación: corridas, resueltos e ignorados en disco"

---

### Task 6: Verificador: una corrida de punta a punta

**Files:**
- Create: `editor/servidor/verificador.ts`
- Test: `editor/servidor/verificador.test.ts`

**Interfaces:**
- Consumes: tareas 1–5.
- Produces:
  ```ts
  export interface Verificador {
    estado(): Promise<EstadoVerificacion>;
    iniciar(alcance: Alcance, ruta: string | null): Promise<{ tipo: 'ok' } | { tipo: 'ocupado' } | { tipo: 'invalido'; mensaje: string }>;
    cancelar(): void;
    terminada(): Promise<void>;   // se resuelve cuando no hay corrida en curso (para pruebas y el cierre)
  }
  export function crearVerificador(o: {
    config: Config; verificaciones: Verificaciones; lanzar: LanzarAgente;
    rutasDelInforme: () => Promise<string[]>;     // para 'todo': capítulos del proyecto, sin el .bib
    dirTemporales?: string;                       // por defecto os.tmpdir()
    ahora?: () => number;
  }): Verificador;
  export const MENSAJES: Record<Exclude<MotivoDeFalla, 'rama' | 'otro'>, string>;
  ```

- [ ] **Step 1: Escribir las pruebas que fallan.** Con un informe temporal (fixture copiado), el repo de prueba de la tarea 4 (helper compartido en `pruebas/ayudas/repoDePrueba.ts`) y un `lanzar` falso hecho en la prueba que devuelve lo que se le indique y registra `{ cwd, prompt }`.

```ts
it('corrida exitosa: guarda los hallazgos válidos y cuenta los descartados', async () => {
  // lanzar devuelve envoltura de [un hallazgo válido sobre Cap3.tex y backend/app.py, uno con cita inventada]
  // iniciar('capitulo', 'Cap3.tex') → ok; await terminada(); ultima(): estado 'ok', hallazgos 1, descartados 1,
  // alcance 'capitulo', archivos ['Cap3.tex'], rama 'main', commit = commit de main
});
it('el agente trabaja en una carpeta con informe/ y repositorio/, y se borra al terminar', async () => {
  // dentro de lanzar: existen cwd/informe/Cap3.tex y cwd/repositorio/backend/app.py; después de terminada(): cwd no existe
});
it('la prompt lleva los ignorados de los archivos revisados', async () => {});
it('mientras corre, estado es en-curso y una segunda corrida es ocupado', async () => {
  // lanzar que no termina hasta que la prueba lo suelte → estado { estado: 'en-curso', alcance: 'capitulo' }; iniciar otra vez → { tipo: 'ocupado' }; lanzar llamado 1 vez
});
it('cancelar detiene el agente, borra la carpeta y no guarda corrida', async () => {
  // detener llamado; estado libre con error null; ultima() null
});
it('pasar el límite detiene el agente y deja el error limite', async () => {
  // config.limiteVerificacion.capitulo = 0.001 (minutos) → error { motivo: 'limite', mensaje: MENSAJES.limite con los minutos }
});
it('CLI ausente y sesión no iniciada dejan su mensaje y no guardan corrida', async () => {});
it('salida ilegible se guarda como corrida fallida con lo crudo', async () => {});
it('rama inexistente no lanza el agente', async () => {});
it('sin repositorio en la config, estado es deshabilitada con el motivo', async () => {});
it('al iniciar borra carpetas editor-verificacion-* que quedaron de otra vez', async () => {});
it('capítulo sin ruta o con una ruta que no está en el informe es invalido', async () => {});
```

- [ ] **Step 2: Correr y ver que fallan.**

- [ ] **Step 3: Implementar.** Carpeta de trabajo: `fs.mkdtemp(path.join(dirTemporales, 'editor-verificacion-'))`. Rutas: `'capitulo'` → `archivosDe(config.informe, ruta)`; `'todo'` → `rutasDelInforme()`. Pasos en orden: foto del repo (si falla, error `rama` u `otro` y no se lanza nada), foto del informe, ignorados, prompt, lanzar, esperar con `setTimeout(limite)` que llama a `detener`, interpretar, validar (`lineasDelRepo` cuenta líneas del archivo en `repositorio/`, null si no existe o sale de la carpeta), guardar. `finally`: borrar la carpeta (`fs.rm` recursivo con `maxRetries: 5`) y volver a libre. `iniciar` responde apenas la corrida arrancó; el resto sigue en segundo plano y no lanza excepciones (lo inesperado queda como error `otro`). Mensajes exactos:
  - `sin-cli`: "No se encontró Claude Code. Instalalo con `npm install -g @anthropic-ai/claude-code` y volvé a probar."
  - `sin-sesion`: "Claude Code no tiene una sesión iniciada. Abrí una terminal, corré `claude` una vez para entrar y volvé a probar."
  - `limite`: "La verificación se cortó a los {n} minutos. Si necesita más tiempo, subí limiteVerificacion en config.json."
  - `ilegible`: "La respuesta del agente no se pudo leer. La corrida quedó guardada como fallida en verificaciones/."
  - `rama`: el mensaje de `problemaDelRepositorio`. `otro`: "La verificación falló: {detalle}"

- [ ] **Step 4: Correr y ver que pasan.**
- [ ] **Step 5: Commit** — "Verificación: corrida completa con límite, cancelación y limpieza"

---

### Task 7: Configuración, rutas y cableado del servidor

**Files:**
- Modify: `editor/compartido/tipos.ts`, `editor/servidor/config.ts`, `editor/servidor/app.ts`, `editor/servidor/index.ts`, `.gitignore`
- Test: `editor/servidor/config.test.ts`, `editor/servidor/app.test.ts`

**Interfaces:**
- Produces: `Config` suma `repositorio: string | null; ramaRepositorio: string; limiteVerificacion: { capitulo: number; todo: number }; verificaciones: string` (absoluta; por defecto `'../verificaciones'`). `Dependencias` suma `verificador: Verificador; verificaciones: Verificaciones`. Rutas:
  - `GET /api/verificacion` → `{ estado: EstadoVerificacion; corrida: Corrida | null; ignorados: Ignorado[] }`
  - `POST /api/verificacion` `{ alcance: 'capitulo' | 'todo'; ruta?: string }` → 202 `{}` · 409 `{ mensaje: 'Ya hay una verificación en curso.' }` · 400 `{ mensaje }`
  - `POST /api/verificacion/cancelar` → `{}`
  - `POST /api/verificacion/resuelto` · `/ignorar` · `/recuperar` `{ id }` → `{}`; id que no está → 404 `{ mensaje: 'Ese hallazgo ya no está en la última corrida.' }`

- [ ] **Step 1: Escribir las pruebas que fallan.** `config.test.ts`: valores por defecto (`repositorio` null, `ramaRepositorio` 'main', límite `{ capitulo: 15, todo: 45 }`, `verificaciones` resuelta junto a `build`); `repositorio` se resuelve a absoluta; límite no positivo → error "config: limiteVerificacion necesita capitulo y todo, en minutos mayores que cero". `app.test.ts`: las seis rutas con un `Verificador` y `Verificaciones` falsos (alcance inválido → 400; ocupado → 409; id desconocido → 404; cuerpo sin id → 400).
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.** En `index.ts`: `crearVerificaciones(config.verificaciones)`, `crearVerificador({ …, lanzar: crearLanzadorAgente(), rutasDelInforme: async () => (await describirProyecto(…)).capitulos.map((c) => c.ruta) })`; en el intervalo de la vigía, `if ((await verificador.estado()).estado === 'en-curso') vigia.latido();` antes de `revisar()`; en `process.on('exit')`, `verificador.cancelar()`. `.gitignore`: agregar `/verificaciones/`.
- [ ] **Step 4: Correr la suite completa.** `npm test` → todo PASS (unos tres minutos).
- [ ] **Step 5: Commit** — "Verificación: configuración, rutas y cableado del servidor"

---

### Task 8: Lógica del cliente: ubicar citas, agrupar, textos

**Files:**
- Create: `editor/cliente/verificacion.ts`
- Modify: `editor/cliente/api.ts`
- Test: `editor/cliente/verificacion.test.ts`

**Interfaces:**
- Consumes: tipos de la tarea 1; rutas de la tarea 7.
- Produces:
  ```ts
  export function ubicarCita(texto: string, cita: string, lineaPista: number | null): { desde: number; hasta: number } | null;
  export const NOMBRE_DE_TIPO: Record<TipoDeHallazgo, string>;  // 'Contradicción' · 'El informe no lo cuenta' · 'Sin respaldo en el código'
  export function hallazgosVisibles(c: Corrida, ignorados: readonly Ignorado[]): Hallazgo[];
  export function agrupar(h: readonly Hallazgo[]): { tipo: TipoDeHallazgo; archivos: { archivo: string; hallazgos: Hallazgo[] }[] }[];
  export function encabezado(c: Corrida): string[];
  export function opcionesDeVerificacion(e: EstadoVerificacion, rutaAbierta: string | null, esCapitulo: boolean):
    { alcance: Alcance; texto: string; habilitada: boolean; ayuda?: string }[];
  // api.ts
  api.verificacion = { leer, iniciar(alcance, ruta), cancelar, resuelto(id), ignorar(id), recuperar(id) };
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('ubica una cita con otros espacios y saltos de línea', () => {
  expect(ubicarCita('Hola.\nLa API\n  escribe en la base.', 'La API escribe en la base', 2)).toEqual({ desde: 6, hasta: 30 });
});
it('si aparece dos veces, elige la más cercana a la línea pista', () => {});
it('cita que ya no está → null', () => {});
it('caracteres especiales de expresiones regulares en la cita', () => { /* 'f(x) = $a+b$ [1]' se encuentra literal */ });
it('oculta resueltos e ignorados', () => {});
it('agrupa en orden contradicción, sin respaldo, no lo cuenta, y por archivo', () => {});
it('encabezado', () => {
  // fecha 2026-10-18T14:32, 'capitulo', 'main', 'abcdef1234' → ['18/10 14:32 · capítulo · main abcdef1']
  // + comparacion { nuevos: 3, yaNoAparecen: 2 } → '3 nuevos · 2 ya no aparecen'
  // + descartados 2 → '2 hallazgos descartados por citas que no existen' (1 → '1 hallazgo descartado por una cita que no existe')
});
it('opciones del menú', () => {
  // libre + capítulo abierto → 'Verificar capítulo' y 'Verificar todo' habilitadas
  // abierto el .bib → 'Verificar capítulo' deshabilitada, ayuda 'Abrí un capítulo para verificarlo.'
  // en-curso → las dos deshabilitadas, ayuda 'Ya hay una verificación en curso.'
  // deshabilitada → las dos deshabilitadas, ayuda = motivo
});
```

- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.** `ubicarCita`: expresión con los trozos de la cita escapados y unidos por `\s+`; entre las coincidencias, la de línea más cercana a la pista (o la primera si no hay pista).
- [ ] **Step 4: Correr y ver que pasan.**
- [ ] **Step 5: Commit** — "Verificación: lógica del panel en el cliente"

---

### Task 9: Subrayado de las citas

**Files:**
- Create: `editor/cliente/subrayadoVerificacion.ts`
- Modify: `editor/cliente/estilos.css`
- Test: `editor/cliente/subrayadoVerificacion.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const fijarCitas: StateEffectType<{ desde: number; hasta: number; id: string }[]>;
  export function extensionSubrayadoVerificacion(o: { alElegir(id: string): void }): Extension;
  export function citasSubrayadas(estado: EditorState): { desde: number; hasta: number; id: string }[];
  ```

- [ ] **Step 1: Escribir las pruebas que fallan** (con `EditorState`, como las de `vista.test.ts`): fijar dos rangos y leerlos; un cambio antes del rango lo corre; borrar todo el texto citado lo quita; fijar `[]` limpia.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar** un `StateField<DecorationSet>` con `Decoration.mark({ class: 'cm-verificacion', attributes: { 'data-hallazgo': id } })`, mapeado por los cambios. Clic sobre la marca llama a `alElegir(id)` (para que el panel lo resalte). En `estilos.css`, `.cm-verificacion` con subrayado ondulado de un color distinto del de gramática (`text-decoration: underline wavy var(--verificacion)`, con la variable definida junto a las de gramática para tema claro y oscuro).
- [ ] **Step 4: Correr y ver que pasan.**
- [ ] **Step 5: Commit** — "Verificación: subrayado de las citas en el texto"

---

### Task 10: Panel, botón y guía

**Files:**
- Create: `editor/cliente/pantalla/panelVerificacion.ts`
- Modify: `editor/cliente/main.ts`, `editor/cliente/estilos.css`, `editor/INSTALACION.md`

**Interfaces:**
- Consumes: tareas 8 y 9.
- Produces: `crearPanelVerificacion(padre, o: { alElegir(h: Hallazgo): void; alResolver(id): void; alIgnorar(id): void; alRecuperar(id): void; alContar(n: number): void })` → `{ mostrar(datos: { estado; corrida; ignorados }, ubicado: (h: Hallazgo) => boolean): void; resaltar(id: string): void }`.

- [ ] **Step 1: Panel.** Encabezado con las líneas de `encabezado`; si `estado.error`, su mensaje arriba; si no hay corrida, "Todavía no hay verificaciones. Elegí Verificación ▾ para hacer la primera."; si la corrida falló, "La última verificación falló: la respuesta del agente no se pudo leer." Lista de `agrupar(hallazgosVisibles(…))`: por hallazgo, la cita (o "Sección: <archivo>" en no-lo-cuenta), el lugar del repo con botón "Copiar ruta" (copia `repositorio/<archivo>:<línea>` al portapapeles), la explicación, "la frase cambió" cuando `ubicado(h)` es falso, y los botones "Marcar resuelto" e "Ignorar". Al pie, "Ver ignorados (n)" despliega la lista con "Recuperar". Sin hallazgos visibles: "Sin diferencias en esta corrida."
- [ ] **Step 2: Cableado en `main.ts`.**
  - Tercera pestaña "Verificación" en `pestanas`, con su cantidad como Gramática ("Verificación (n)").
  - Botón "Verificación ▾" en `barra.zonaAcciones` (no en `zonaFormato`, que se deshabilita fuera de los `.tex`), con las opciones de `opcionesDeVerificacion`. Al elegir: `editor.guardarAhora()`; "Verificar todo" antes pregunta con `preguntar('Verificar todo el informe tarda bastante más que un capítulo.', [{ texto: 'Verificar todo', valor: true, principal: true }, { texto: 'Cancelar', valor: false }])`; después `api.verificacion.iniciar` y se muestra la pestaña.
  - En curso: el botón dice "Verificando… m:ss" (se actualiza cada segundo desde `estado.desde`) y aparece al lado "Cancelar". Se consulta `api.verificacion.leer()` cada 2 s mientras esté en curso, al abrir el editor y al volver a la pestaña (`actualizarTodo`). Al pasar a libre: "Verificación terminada: n hallazgos." o el mensaje de error, con `barra.avisar`.
  - Al abrir un archivo o recibir una corrida: ubicar con `ubicarCita` las citas de los hallazgos visibles de ese archivo y despachar `fijarCitas`. Clic en un hallazgo: abrir su archivo y `editor.irA(desde)` (o `irALinea` si no se ubicó).
  - Resuelto, Ignorar y Recuperar llaman a la API y vuelven a leer.
- [ ] **Step 3: Estilos** del panel siguiendo `.gramatica-*` (clases `.verificacion-*`).
- [ ] **Step 4: `INSTALACION.md`:** sección "Verificar el informe contra la aplicación": instalar el CLI (`npm install -g @anthropic-ai/claude-code`), entrar una vez con `claude`, las claves `repositorio`, `ramaRepositorio` y `limiteVerificacion` con un ejemplo para `C:/Users/Cristhian Rossi/Documents/GitHub/uy-social-topic-modeling`, qué lee el agente (solo la rama, sin `.env`, sin escribir) y dónde quedan las corridas.
- [ ] **Step 5: `npm test` y `npm run build`** → PASS y build sin errores.
- [ ] **Step 6: Prueba manual sin IA**, en 4327/4329 con `config.prueba.json` apuntando a `.entorno-prueba` y a un repo de prueba, y un comando falso: lanzar, ver "Verificando…", cancelar, y una corrida con hallazgos fijos (subrayado, clic, resuelto, ignorar, recuperar, "la frase cambió" tras editar la frase). Para el comando falso, `crearLanzadorAgente` lee `process.env.EDITOR_AGENTE` (comando separado por espacios) si está definida, como `EDITOR_ZOTERO`; agregarlo en `index.ts`.
- [ ] **Step 7: Prueba manual con el agente real** (la hace Cristhian, con el CLI instalado): "Verificar capítulo" sobre `Cap3_2 - Como.tex` contra el repo real, y revisar a mano que dos o tres citas y rutas sean ciertas. Anotar duración y si hubo descartados.
- [ ] **Step 8: Commit** — "Verificación: panel, botón y guía"
