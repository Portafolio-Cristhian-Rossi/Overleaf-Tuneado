# Editor genérico y rama de proyecto: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `main` sea un editor genérico y que lo propio de la tesis viva en una rama `tesis` que solo agrega `proyecto/` y `.claude/`.

**Architecture:** La configuración se arma en capas (defaults ← `proyecto/config.json` ← `editor/config.json`). La guía, el diccionario y las reglas extra del verificador se leen de la carpeta del proyecto. Los textos de la tesis salen del código y pasan a archivos de la rama `tesis`. Una prueba guardia impide que vuelvan.

**Tech Stack:** Node 24, TypeScript, Express, Vitest, CodeMirror (cliente sin cambios).

**Spec:** `docs/superpowers/specs/2026-10-28-editor-generico-y-rama-de-proyecto-design.md`

## Global Constraints

- Código, comentarios, mensajes y documentación en español, como el resto del repo.
- La rama `tesis` solo agrega archivos que `main` no tiene; nunca modifica uno de `main`.
- `main` solo recibe merges de ramas `feature/…`; `tesis` recibe `main`, nunca al revés.
- Todo el trabajo de `main` va en la rama `feature/editor-generico`, en un worktree bajo `.claude/worktrees/`. El editor de Cristhian (puertos 4317/4319, carpeta `Tesis`) no se toca.
- En el worktree: `npm install` y un `editor/config.prueba.json` con `"corrector": false`, puertos 4327/4329.
- Límite de `proyecto/verificacion-codigo.md`: 20 000 caracteres.
- Defaults nuevos: `proyecto` = `../proyecto` (desde `editor/`), `glosario` = `"Glosario"`, `marcoTeorico` = `["antecedentes", "marco teórico"]`.
- Nada de tokens ni contraseñas en ningún archivo.
- Los commits siguen el estilo del repo: una frase en español, sin prefijo de tipo, con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Merge a `main`, push y cambio de rama en la carpeta `Tesis` los hace Cristhian.

## Review Focus

- Un `proyecto/config.json` o un `verificacion-codigo.md` guardado con el Bloc de notas (BOM UTF-8, CRLF) se lee igual que uno sin BOM. Lo prueban las tareas 1 y 4.
- Antes de pasarse a `tesis` no hay `proyecto/`: el editor arranca con los defaults, la guía es la genérica y el diccionario está vacío. Lo prueban las tareas 1 y 3.
- Guardar la primera palabra o la guía cuando `proyecto/` no existe crea la carpeta y no falla. Lo prueba la tarea 3.
- Las pruebas de `config` corren en un directorio temporal: el default `../proyecto` apuntaría a una carpeta compartida de `os.tmpdir()`. Las pruebas pasan `proyecto` explícito o crean el temporal anidado. Tarea 1.
- Un `verificacion-codigo.md` que solo tiene espacios o saltos cuenta como vacío y no agrega la sección. Tarea 4.

---

### Task 1: Configuración en capas

**Files:**
- Modify: `editor/servidor/config.ts`, `editor/compartido/tipos.ts:12-21`, `.gitignore`
- Create: `editor/config.ejemplo.json`
- Delete del control de Git: `editor/config.json` (`git rm --cached`; en el worktree se borra también el archivo)
- Test: `editor/servidor/config.test.ts`

**Interfaces:**
- Produces: `cargarConfig(dirEditor: string, archivo?: string): Config` con la misma firma. `Config` suma `proyecto: string` (absoluta), `glosario: string | null` y `marcoTeorico: string[] | null`.

- [ ] **Step 1: Escribir las pruebas que fallan** en `config.test.ts`. Un ayudante crea `raiz/editor/` y `raiz/proyecto/` dentro de un `dirTemporal()`, así el default `../proyecto` cae dentro del temporal.
  - `'proyecto/config.json se aplica debajo de editor/config.json'`: proyecto `{ principal: 'tesis.tex', puerto: 5000 }` y personal `{ puerto: 5001 }` dan `principal: 'tesis.tex'` y `puerto: 5001`.
  - `'las rutas de proyecto/config.json son relativas a proyecto/'`: `repositorio: '../../app'` da `path.resolve(raiz, 'proyecto', '../../app')`.
  - `'las rutas de editor/config.json siguen relativas a editor/'`: lo mismo para `repositorio` puesto en la config personal.
  - `'limiteVerificacion se combina por campo entre capas'`: `{ capitulo: 5 }` en proyecto y `{ todo: 50 }` en personal dan `{ capitulo: 5, todo: 50 }`.
  - `'proyecto: por defecto ../proyecto y se puede cambiar en la config personal'`.
  - `'rechaza la clave proyecto dentro de proyecto/config.json'`: `toThrow(/proyecto\/config\.json.*proyecto/)`.
  - `'glosario y marcoTeorico: defaults, null y valores'`: defaults `'Glosario'` y `['antecedentes', 'marco teórico']`; `null` se respeta; `glosario: 3` y `marcoTeorico: 'x'` lanzan `/glosario/` y `/marcoTeorico/`.
  - `'sin carpeta proyecto/ arranca con los defaults'`.
  - `'un proyecto/config.json inválido nombra el archivo'`: texto `{no` da `toThrow(/proyecto\/config\.json/)`.
  - `'lee archivos con BOM'`: `'﻿{"principal":"b.tex"}'` en las dos capas.
  - Las pruebas existentes que usan `dirCon` pasan `proyecto` apuntando a un subdirectorio inexistente del temporal.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run servidor/config.test.ts`
Expected: FAIL en las pruebas nuevas.

- [ ] **Step 3: Implementar.** En `cargarConfig`, leer primero la config personal para conocer `proyecto`; después leer `<proyecto>/config.json`. Las rutas (`informe`, `build`, `verificaciones`, `repositorio`) se resuelven dentro de cada capa, contra la carpeta de su archivo, antes de combinar. Los defaults se resuelven contra `dirEditor`. Un lector `leerJson(ruta, nombre)` quita el BOM y, si el JSON es inválido, lanza `config: <nombre> no es un JSON válido`. Las validaciones nuevas siguen el estilo de mensaje de las existentes (`config: glosario tiene que ser el título de un capítulo o null`). Sumar los tres campos a `Config` en `tipos.ts`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run servidor/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Config personal fuera de Git.** Crear `editor/config.ejemplo.json` con `{ "puerto": 4317, "puertoCorrector": 4319, "corrector": true, "compilarAlGuardar": false }`. Agregar `editor/config.json` al `.gitignore` y correr `git rm --cached editor/config.json`.

- [ ] **Step 6: Commit** — `Configuración en capas: proyecto/config.json debajo de la config personal`

### Task 2: Glosario y marco teórico configurables

**Files:**
- Modify: `editor/servidor/proyecto.ts:176-186`, `editor/servidor/index.ts:45-46`
- Test: `editor/servidor/proyecto.test.ts:232-270`

**Interfaces:**
- Consumes: `Config.glosario`, `Config.marcoTeorico` (tarea 1).
- Produces: `rutaDelGlosario(capitulos: Capitulo[], titulo: string | null): string | null` y `rutaDelMarcoTeorico(capitulos: Capitulo[], palabras: string[] | null): string | null`.

- [ ] **Step 1: Adaptar las pruebas existentes** pasando los defaults (`'Glosario'` y `['antecedentes', 'marco teórico']`), y sumar:
  - `rutaDelGlosario(caps, 'Términos')` encuentra el capítulo titulado `' TÉRMINOS '`.
  - `rutaDelGlosario(caps, null)` da `null` aunque haya un capítulo llamado «Glosario».
  - `rutaDelMarcoTeorico(caps, ['estado del arte'])` encuentra «Estado del Arte».
  - `rutaDelMarcoTeorico(caps, null)` da `null`.
- [ ] **Step 2: Correr** `npx vitest run servidor/proyecto.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar.** Las dos funciones comparan sin tildes ni mayúsculas, con el `sinTildes` que ya existe. Los comentarios dejan de nombrar archivos de la tesis. `index.ts` les pasa `config.glosario` y `config.marcoTeorico`.
- [ ] **Step 4: Correr** `npx vitest run servidor/proyecto.test.ts servidor/verificador.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `Glosario y marco teórico se eligen en la configuración`

### Task 3: Guía y diccionario en la carpeta del proyecto

**Files:**
- Modify: `editor/servidor/guia.ts`, `editor/servidor/diccionario.ts`, `editor/servidor/index.ts:50,69`
- Delete del control de Git: `editor/correccion.json` (`git rm`; su contenido se recupera de `main` en la tarea 7)
- Test: `editor/servidor/guia.test.ts`, `editor/servidor/diccionario.test.ts`

**Interfaces:**
- Consumes: `Config.proyecto` (tarea 1).
- Produces: `crearGuia(archivo)` y `crearDiccionario(archivo)` con la misma firma; `index.ts` les pasa `path.join(config.proyecto, 'guia-estilo.md')` y `path.join(config.proyecto, 'correccion.json')`.

- [ ] **Step 1: Pruebas que fallan**
  - `guia.test.ts`, `'guardar crea la carpeta si no existe'`: `crearGuia(path.join(dir, 'proyecto', 'guia-estilo.md')).guardar('x')`, y después `leer()` da `'x'`.
  - `diccionario.test.ts`, `'agregar una palabra crea la carpeta si no existe'`: lo mismo con `agregarPalabra('LDA')`.
- [ ] **Step 2: Correr** `npx vitest run servidor/guia.test.ts servidor/diccionario.test.ts`. Expected: FAIL con ENOENT.
- [ ] **Step 3: Implementar.** Agregar `fs.mkdir(path.dirname(archivo), { recursive: true })` antes de escribir el temporal, en los dos. Actualizar los comentarios ("vive en la carpeta del proyecto") y cambiar las rutas en `index.ts`.
- [ ] **Step 4: Correr** las mismas pruebas más `servidor/app.test.ts`. Expected: PASS.
- [ ] **Step 5:** `git rm editor/correccion.json`.
- [ ] **Step 6: Commit** — `La guía y el diccionario viven en la carpeta del proyecto`

### Task 4: Reglas del proyecto en la verificación contra el código

**Files:**
- Create: `editor/servidor/reglasDelProyecto.ts`, `editor/servidor/reglasDelProyecto.test.ts`
- Modify: `editor/compartido/promptVerificacion.ts:26-56`, `editor/servidor/verificador.ts:99-160`, `editor/servidor/index.ts`
- Test: `editor/compartido/promptVerificacion.test.ts`, `editor/servidor/verificador.test.ts`

**Interfaces:**
- Consumes: `Config.proyecto` (tarea 1).
- Produces:
  - `LARGO_MAXIMO_DE_REGLAS = 20000`.
  - `leerReglasDelProyecto(archivo: string): Promise<string | null>`: `null` si falta o solo tiene espacios; texto sin BOM y con `\n`; lanza `ReglasDemasiadoLargas` (extiende `Error`) con el mensaje `proyecto/verificacion-codigo.md es demasiado largo: admite hasta 20000 caracteres.`
  - `armarPromptDeVerificacion` suma la opción `reglas?: string | null`.
  - `crearVerificador` suma la opción `reglasDelProyecto?: () => Promise<string | null>`.

- [ ] **Step 1: Pruebas que fallan**
  - `reglasDelProyecto.test.ts`: falta → `null`; `'  \r\n'` → `null`; `'﻿a\r\nb'` → `'a\nb'`; 20 001 caracteres → rechaza con `ReglasDemasiadoLargas`.
  - `promptVerificacion.test.ts`:
    - Con `reglas: 'Regla X.'`, la prompt contiene `'## Reglas de este proyecto\nRegla X.'`, después de `'----- fin del glosario -----'` y antes de `'## Ya ignorados'`.
    - Sin `reglas`, no contiene `'Reglas de este proyecto'`.
    - Con glosario, no contiene `processing_orchestrator`, `Programación` ni `tópicos`, y sí contiene la regla genérica de "contradiccion" sobre definiciones que describen la aplicación.
  - `verificador.test.ts`:
    - Con `reglasDelProyecto: async () => 'Regla X.'`, el `prompt` que recibe `lanzar` contiene `'Regla X.'`.
    - Si `reglasDelProyecto` rechaza con `ReglasDemasiadoLargas`, el error de la corrida contra el código tiene `motivo: 'otro'` y su mensaje contiene `'demasiado largo'`.
- [ ] **Step 2: Correr** `npx vitest run servidor/reglasDelProyecto.test.ts compartido/promptVerificacion.test.ts servidor/verificador.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - `seccionDeGlosario` queda con tres viñetas genéricas (spec 6.2): términos del glosario para relacionar nombres; definición que describe la aplicación y el código contradice → "contradiccion" citando la definición; término central ausente → "no-lo-cuenta".
  - La sección de reglas se arma después del glosario.
  - `prepararCodigo` llama a `o.reglasDelProyecto?.()` en cada corrida y convierte `ReglasDemasiadoLargas` en `falla(e.message)`.
  - `index.ts` pasa `() => leerReglasDelProyecto(path.join(config.proyecto, 'verificacion-codigo.md'))`.
- [ ] **Step 4: Correr** las mismas pruebas. Expected: PASS.
- [ ] **Step 5: Commit** — `Verificación: las reglas propias del proyecto salen de proyecto/verificacion-codigo.md`

### Task 5: Textos genéricos y guardia

**Files:**
- Modify: `editor/compartido/prompt.ts:19,88-…`, `editor/compartido/promptVerificacion.ts:56`, `editor/compartido/promptVerificacionInforme.ts:52`, y los comentarios que nombren la tesis en `cliente/`, `servidor/` y `compartido/`
- Create: `editor/pruebas/guardia.test.ts`
- Test: `editor/compartido/prompt.test.ts:90-95`

**Interfaces:**
- Produces: `GUIA_INICIAL` genérica; ningún texto de la tesis en el código. La tarea 7 recupera el texto viejo con `git show main:editor/compartido/prompt.ts`.

- [ ] **Step 1: Pruebas que fallan**
  - `guardia.test.ts`, `'el código no tiene nada propio de un proyecto'`: recorre `cliente/`, `servidor/` y `compartido/` (`.ts` y `.css`, sin `*.test.ts`) y falla listando archivo y palabra para cada coincidencia, sin distinguir mayúsculas, de `['uy-social', 'processing_orchestrator', 'tópico', 'UdelaR', 'proyecto de grado', 'Cristhian']`.
  - `prompt.test.ts`: `GUIA_INICIAL` tiene `'## De qué trata'`, `/primera persona del plural/i` y la regla de siglas, y no tiene `'tópicos'`.
- [ ] **Step 2: Correr** `npx vitest run pruebas/guardia.test.ts compartido/prompt.test.ts`. Expected: FAIL; la guardia lista `prompt.ts` y `promptVerificacion*.ts`.
- [ ] **Step 3: Implementar.**
  - `PRESENTACION = 'Estoy escribiendo un informe en LaTeX y en español. Necesito tu ayuda con una parte.'`
  - `GUIA_INICIAL`:
    - "De qué trata": un renglón que pide contarlo en dos o tres oraciones.
    - "Voz" y "Tiempos verbales": tal como están, con ejemplos neutros en vez de LDA.
    - "Términos": solo siglas y términos en inglés en cursiva.
  - Las dos prompts de verificación dicen "el informe" en vez de "un proyecto de grado".
  - Generalizar los comentarios que encuentre la guardia.
- [ ] **Step 4: Correr la suite entera** `npm test`. Expected: PASS. Ajustar las aserciones de `app.test.ts` y `guia.test.ts` que comparan con `GUIA_INICIAL` solo si fallan por el texto.
- [ ] **Step 5: Commit** — `Textos genéricos en las prompts y prueba que lo cuida`

### Task 6: Documentación de `main`

**Files:**
- Modify: `CLAUDE.md`, `editor/INSTALACION.md`
- Create: `README.md`, `editor/GUIA-CLAUDE.md`

**Interfaces:**
- Consumes: claves y archivos de las tareas 1 a 4; resultado del paso 1 (lo que acepta Claude Code).

- [ ] **Step 1: Comprobar Claude Code.** En un directorio temporal, crear `.claude/rules/prueba.md` con la frase «la palabra clave es tilo» y correr `claude -p "¿Cuál es la palabra clave?"`. Repetir con `.claude/settings.json` = `{ "permissions": { "additionalDirectories": ["../otra"] } }` y un `../otra/dato.txt`: pedirle que lea `../otra/dato.txt` en modo no interactivo, sin permisos extra. Anotar el resultado. Si falla, usar la alternativa del spec 7 en las tareas 6 y 7: un `@import` o una indicación en la guía para `/add-dir`.
- [ ] **Step 2: `CLAUDE.md` genérico** según el spec, sección 7. Conservar "Cómo trabajar en el editor" y "Particularidades de Windows". Sumar "Ramas" con las reglas del spec, sección 3, y "Lo propio de un proyecto" (va en `proyecto/` y `.claude/` de su rama). Sacar "Proyecto de grado de Cristhian", `prgrado.cls` y las preferencias personales.
- [ ] **Step 3: `README.md`** según el spec, sección 8.1, con la tabla de archivos de `proyecto/` del spec, sección 4.
- [ ] **Step 4: `editor/GUIA-CLAUDE.md`** con las 8 partes del spec, sección 8.3. La preparación de Claude se mueve desde la sección 6 de `INSTALACION.md`.
- [ ] **Step 5: `INSTALACION.md`** según el spec, sección 8.2. Correr `grep -niE "uy-social|cristhian|portafolio|tópico|prgrado" editor/INSTALACION.md editor/GUIA-CLAUDE.md README.md CLAUDE.md`. Expected: sin resultados.
- [ ] **Step 6: Commit** — `Documentación genérica: README, guía de Claude y CLAUDE.md sin datos de un proyecto`

### Task 7: Rama `tesis`

**Files (todos nuevos, en la rama `tesis` creada desde la punta de `feature/editor-generico`):**
- `proyecto/config.json`, `proyecto/verificacion-codigo.md`, `proyecto/guia-estilo.md`, `proyecto/correccion.json`, `proyecto/LEEME.md`, `.claude/rules/tesis.md`, `.claude/settings.json`

**Interfaces:**
- Consumes: claves de la tarea 1 y archivos de las tareas 3 y 4. El resultado del paso 1 de la tarea 6 decide el formato de `.claude/`.

- [ ] **Step 1:** Crear la rama `tesis` desde la punta de la feature, en un segundo worktree.
- [ ] **Step 2: `proyecto/config.json`** = `{ "repositorio": "../../uy-social-topic-modeling", "ramaRepositorio": "main" }`.
- [ ] **Step 3: Contenido de la tesis.**
  - `guia-estilo.md`: el `GUIA_INICIAL` de `git show main:editor/compartido/prompt.ts`, sin la plantilla `String.raw`.
  - `correccion.json`: el `editor/correccion.json` de la carpeta `Tesis` en ese momento. Solo se lee, no se toca.
  - `verificacion-codigo.md`: las viñetas que salieron de la prompt (spec 6.2), con el ejemplo de `processing_orchestrator`.
- [ ] **Step 4: Reglas de Claude.**
  - `.claude/rules/tesis.md`: lo propio de la tesis del `CLAUDE.md` viejo (informe compartido con dos compañeros y dos supervisores, `prgrado.cls`) más el contenido de las memorias `zotero-biblioteca-del-grupo.md` y `redactar-en-el-informe.md`.
  - `.claude/settings.json`: `additionalDirectories` con `../uy-social-topic-modeling`, en el formato que haya funcionado en la tarea 6.
- [ ] **Step 5: `proyecto/LEEME.md`** según el spec, sección 8.4.
- [ ] **Step 6: Comprobar que solo agrega.** Correr `git diff --name-status feature/editor-generico tesis`. Expected: solo líneas `A`.
- [ ] **Step 7: Commit** — `Tesis: configuración, guía, diccionario y reglas del proyecto`

### Task 8: Verificación final

- [ ] **Step 1:** `npm test` en el worktree de la feature. Expected: todo PASS.
- [ ] **Step 2: Entorno de prueba.** En el worktree de `tesis`, `npm run entorno-prueba` y `npm run servir` con `EDITOR_CONFIG=config.prueba.json` en 4327. Comprobar:
  - La guía muestra la de la tesis.
  - Una palabra del diccionario de la tesis no se marca.
  - En la feature, sin `proyecto/`, el editor arranca y la guía es la genérica.
- [ ] **Step 3: Prompt con reglas.** Con `agente` apuntando a un script falso que guarda la prompt recibida, una verificación contra el código lleva `## Reglas de este proyecto`. Detener el `node` del puerto 4327 al terminar.
- [ ] **Step 4: Revisión final** de toda la rama, por un revisor nuevo.
- [ ] **Step 5: Entregar a Cristhian** los comandos de la migración (spec, sección 9, pasos 3 y 4):
  - merge de la feature a `main`;
  - `git checkout tesis` en `Tesis`;
  - `npm run build`;
  - reiniciar el editor;
  - push de las dos ramas.

  Ofrecer borrar las dos memorias que quedaron duplicadas y guardar en su memoria la preferencia que sale del `CLAUDE.md` ("mensajes cortos y concretos").
