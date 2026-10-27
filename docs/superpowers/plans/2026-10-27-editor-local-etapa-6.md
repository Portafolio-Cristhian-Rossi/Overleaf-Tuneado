# Editor local del informe, etapa 6: verificación contra el informe. Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el editor tenga dos verificaciones, «Contra código» (la de la etapa 5) y «Contra informe» (coherencia interna del informe contra lo anterior, el Glosario y el marco teórico), cada una con su botón, su pestaña y sus viñetas.

**Architecture:** Se generaliza el verificador de la etapa 5 con `contra: 'codigo' | 'informe'`. La corrida contra el informe usa el mismo lanzador, límite, cancelación, validación y guardado, pero no fotografía el repositorio: fotografía todo el informe y le pasa al agente otra prompt. Los hallazgos de Informe pueden llevar una segunda cita del informe (`referencia`). El cliente muestra la última corrida de cada tipo en su pestaña.

**Tech Stack:** el de las etapas anteriores (TypeScript, Node 24, Express 5, Vite, Vitest, CodeMirror 6). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-27-editor-local-etapa-6-design.md`, que continúa `2026-10-18-editor-local-etapa-5-design.md`. Leer las dos antes de empezar. El plan de la etapa 5 (`docs/superpowers/plans/2026-10-18-editor-local-etapa-5.md`) explica las piezas que acá se reutilizan.

## Desvíos respecto de la spec (decididos al planear)

1. **`EstadoVerificacion` pierde la variante `deshabilitada`.** `libre` lleva `motivos: Record<Contra, string | null>`: así Código puede estar deshabilitada mientras Informe está libre, que es lo que pide la spec en la sección 9.
2. **Las corridas de sugerencias conservan `rama: ''` y `commit: 'sugerencias'`.** Solo se les agrega `contra: 'informe'`. Su nombre de archivo no cambia.
3. **La foto contra el informe** es la unión, sin repetir y en orden, de `archivosDe(informe, r)` para cada ruta de `rutasDelInforme()`. Incluye `main.tex` ("Portada y resumen") y los anexos incluidos desde otro archivo.

## Global Constraints

- **Invariante de fidelidad:** nada de esta etapa escribe en `informe/` ni en el repositorio de la aplicación.
- Las pruebas nunca leen ni escriben en `Tesis/informe/`: usan `pruebas/fixtures/informe`, directorios temporales y `pruebas/ayudas/repoDePrueba.ts`.
- `npm test` no lanza el CLI real ni gasta tokens: el lanzador se inyecta (`lanzadorFalso` en `servidor/verificador.test.ts`).
- **Se trabaja en un worktree aparte, rama `etapa-6`** (skill `superpowers:using-git-worktrees`). Ahí: `npm install` en `editor/`, y un `editor/config.prueba.json` con puertos 4327 y 4329 y `"corrector": false`. Nunca se toca el editor de Cristhian (4317 y 4319). Integrar a `main` es a pedido suyo y exige `npm run build`.
- Interfaz en español rioplatense (voseo), sin mayúsculas de título ni signos de exclamación. Los textos entre comillas de este plan son copia exacta.
- Identificadores y comentarios en español. La lógica que se puede probar vive sin DOM (`compartido/`, `cliente/*.ts`); lo que arma la pantalla, en `cliente/pantalla/`.
- Los ids de los hallazgos de Código ya guardados no cambian.
- TDD en cada tarea. Al menos un commit por tarea, en español, terminado en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Durante la tarea se corre `npx vitest run <archivo>`.
- `npx tsc --noEmit -p .` hoy pasa limpio. Entre las tareas 1 y 7 puede fallar en archivos que todavía no se adaptaron (los dueños son tareas posteriores). Al terminar la tarea 7 tiene que volver a pasar limpio.
- Los heredocs largos de bash fallan en esta máquina: scripts auxiliares como archivo.

## Review Focus

1. **El agente cita la definición del glosario como cita principal.** En una corrida de capítulo sobre `Cap3.tex`, un `definicion-distinta` cuya cita principal está en el glosario y la referencia en `Cap3.tex` (los lados al revés) se descarta, no se muestra apuntando al glosario. Prueba en la tarea 1 («descarta la cita principal fuera de los revisados…»).
2. **Corridas guardadas antes de esta etapa.** Un `verificaciones/` con corridas de Código sin `contra`, una de sugerencias sin `contra` y un `ignorados.json` sin `archivoReferencia`: la pestaña Código muestra la de Código, Informe muestra la de sugerencias y nada falla. Pruebas en las tareas 1 y 3.
3. **Correr Informe y después Código.** La pestaña Informe sigue mostrando su corrida, y la comparación «n nuevos» de cada una se hace solo contra la anterior de su tipo. Prueba en la tarea 3.
4. **Sin `repositorio` en la configuración.** «Contra código» queda deshabilitado con su motivo y «Contra informe» funciona. Pruebas en las tareas 4 y 6.
5. **La referencia en otro archivo.** Un hallazgo cuya cita principal está en `Cap3.tex` y la referencia en el glosario: con `Cap3.tex` abierto se subraya solo la primera; al abrir el glosario se subraya la segunda; si la segunda cambió, solo ese lado dice «la frase cambió». Prueba en la tarea 6.

## Estructura de archivos

```
editor/
├── compartido/
│   ├── verificacion.ts                (modificar) Contra, tipos de Informe, referencia, validación, contraDe
│   └── promptVerificacionInforme.ts   (crear) prompt contra el informe
├── servidor/
│   ├── proyecto.ts                    (modificar) rutaDelMarcoTeorico
│   ├── verificaciones.ts              (modificar) última por tipo, nombre, comparación, archivoReferencia
│   ├── sugerencias.ts                 (modificar) contra 'informe' y mensaje
│   ├── verificador.ts                 (modificar) iniciar(contra, …), corrida contra el informe, estado
│   ├── app.ts, index.ts               (modificar) rutas y cableado
├── cliente/
│   ├── verificacion.ts                (modificar) tipos por pestaña, dos citas, opciones por botón
│   ├── subrayadoVerificacion.ts       (modificar) lado de la cita
│   ├── pantalla/panelVerificacion.ts  (modificar) un panel por tipo, hallazgo con dos citas
│   ├── api.ts, main.ts, estilos.css   (modificar)
├── INSTALACION.md                     (modificar)
```

---

### Task 1: Tipos de Informe, referencia y validación

**Files:**
- Modify: `editor/compartido/verificacion.ts`
- Test: `editor/compartido/verificacion.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Contra = 'codigo' | 'informe';
  export type TipoDeCodigo = 'contradiccion' | 'no-lo-cuenta' | 'sin-respaldo';
  export type TipoDeInforme = 'se-contradice' | 'definicion-distinta' | 'corta-el-hilo' | 'sin-definir';
  export type TipoDeHallazgo = TipoDeCodigo | TipoDeInforme | 'sugerencia';
  export interface CitaDelInforme { archivo: string; linea: number | null; cita: string }
  // Hallazgo agrega:  referencia?: CitaDelInforme   (solo en tipos de Informe; ausente si no hay)
  // Corrida agrega:   contra: Contra; y pasa a  rama: string | null; commit: string | null
  // Ignorado agrega:  archivoReferencia?: string | null   (opcional: los viejos no lo tienen)
  export interface ErrorDeVerificacion { contra: Contra; motivo: MotivoDeFalla; mensaje: string }
  export type EstadoVerificacion =
    | { estado: 'libre'; motivos: Record<Contra, string | null>; error: ErrorDeVerificacion | null }
    | { estado: 'en-curso'; contra: Contra; alcance: Alcance; desde: number };
  export const TIPOS_DEL_AGENTE: Record<Contra, readonly TipoDeHallazgo[]>;
  //   codigo: ['contradiccion', 'no-lo-cuenta', 'sin-respaldo']
  //   informe: ['se-contradice', 'definicion-distinta', 'corta-el-hilo', 'sin-definir']
  export const TIPOS_DE_PESTANA: Record<Contra, readonly TipoDeHallazgo[]>;   // también es el orden en pantalla
  //   codigo: ['contradiccion', 'sin-respaldo', 'no-lo-cuenta']
  //   informe: ['se-contradice', 'definicion-distinta', 'corta-el-hilo', 'sin-definir', 'sugerencia']
  export function contraDeTipo(t: TipoDeHallazgo): Contra;
  // Las corridas guardadas antes de esta etapa no tienen contra: las de sugerencias (con autor) son de Informe.
  export function contraDe(c: { contra?: Contra; autor?: string }): Contra;
  export function validarHallazgos(crudos: unknown, contexto: {
    informe: ReadonlyMap<string, string>;
    lineasDelRepo(archivo: string): number | null;
    revisados?: readonly string[];   // si está, la cita principal tiene que estar en uno de estos
  }, tipos?: readonly TipoDeHallazgo[]): { hallazgos: Hallazgo[]; descartados: number };   // tipos por defecto: TIPOS_DEL_AGENTE.codigo
  // idDeHallazgo: el "otro archivo" pasa a ser  h.repo?.archivo ?? h.referencia?.archivo ?? ''
  ```

- [ ] **Step 1: Fijar el id actual de un hallazgo de Código**

Antes de tocar el código, calcular con el `idDeHallazgo` de hoy el id de
`{ tipo: 'contradiccion', informe: { archivo: 'Cap3.tex', linea: 3, cita: 'la API escribe en la base' }, repo: { archivo: 'backend/app.py', linea: 2 } }`
(por ejemplo con `npx tsx -e`) y escribirlo como literal en la prueba del paso 2.

- [ ] **Step 2: Escribir las pruebas que fallan**

En `describe('validarHallazgos')`, con un contexto cuyo `informe` tiene `Cap1.tex`, `Cap3.tex` y `Glosario.tex`, `revisados: ['Cap3.tex']`, `lineasDelRepo: () => null` y `tipos = TIPOS_DEL_AGENTE.informe`:

- `it('acepta se-contradice con las dos citas y la referencia en otro archivo')`: guarda `referencia: { archivo: 'Cap1.tex', linea, cita }` normalizada y `repo: null`.
- `it('descarta se-contradice y definicion-distinta sin referencia')`.
- `it('corta-el-hilo acepta con y sin referencia')`: sin referencia, el hallazgo no tiene la clave `referencia` (`expect('referencia' in h).toBe(false)`).
- `it('descarta sin-definir con referencia')`.
- `it('descarta la cita principal fuera de los revisados, pero acepta la referencia en cualquier archivo de la foto')`: principal en `Glosario.tex` → descartado; principal en `Cap3.tex` y referencia en `Glosario.tex` → aceptado.
- `it('descarta una referencia inventada, sin cita o igual a la cita principal')`: igual quiere decir mismo archivo y misma cita normalizada.
- `it('descarta los tipos de Código y sugerencia en una corrida de Informe, y los de Informe en una de Código')`.
- `it('normaliza la ruta de la referencia y conserva su línea solo si es un entero positivo')`.

En `describe('idDeHallazgo')`:
- `it('los ids de Código no cambian')`: el literal del paso 1.
- `it('en Informe cambia con el archivo de la referencia')`.

Nuevo `describe('contraDe')`:
- `it('usa contra si está; si no, autor → informe y sin autor → codigo')`.

Nuevo `describe('contraDeTipo')`:
- `it('sugerencia y los cuatro de Informe son informe; los otros, codigo')`.

Las pruebas existentes que usan `TIPOS_DEL_AGENTE` como arreglo pasan a `TIPOS_DEL_AGENTE.codigo`.

- [ ] **Step 3: Correr y ver que fallan**

Run: `npx vitest run compartido/verificacion.test.ts`
Expected: FAIL (`TIPOS_DEL_AGENTE.informe` indefinido, `contraDe` no exportada).

- [ ] **Step 4: Implementar en `compartido/verificacion.ts`**

En `validarUno`:
- La cita principal es obligatoria salvo en `no-lo-cuenta` (como hoy).
- Si `contexto.revisados` está, el archivo principal tiene que estar en él.
- Para los tipos de Informe, `repo` es `null` y se valida `referencia`: obligatoria en `se-contradice` y `definicion-distinta`, opcional en `corta-el-hilo`, prohibida en `sin-definir`. Cuando está, se valida igual que el lado principal (ruta normalizada con prefijo `'informe'`, archivo presente en `contexto.informe`, cita no vacía que aparece normalizada) y sin `revisados`.
- En tipos de Código, una `referencia` que venga se ignora.

Actualizar el comentario de `TipoDeHallazgo` y el de `Hallazgo`.

- [ ] **Step 5: Correr y ver que pasan**

Run: `npx vitest run compartido/verificacion.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add editor/compartido/verificacion.ts editor/compartido/verificacion.test.ts
git commit -m "Verificación contra el informe: tipos, referencia y validación"
```

---

### Task 2: La prompt contra el informe

**Files:**
- Create: `editor/compartido/promptVerificacionInforme.ts`
- Test: `editor/compartido/promptVerificacionInforme.test.ts`

**Interfaces:**
- Consumes: `notasPorSeccion(texto)` de `compartido/promptVerificacion.ts`; `Ignorado` de la tarea 1.
- Produces:
  ```ts
  export function armarPromptDeVerificacionInforme(o: {
    capitulos: { ruta: string; texto: string }[];   // todos los de la foto, en el orden de main.tex
    revisados: string[];
    glosario: string | null;
    marcoTeorico: string | null;
    ignorados: Ignorado[];                           // ya filtrados por quien llama
  }): string;
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**

- `it('numera los capítulos en orden y lista los revisados')`: contiene `'1. informe/main.tex'` y `'2. informe/Cap1.tex'`, y bajo `## Archivos a revisar`, `'- informe/Cap3.tex'`.
- `it('nombra el glosario y el marco teórico')`: contiene `'- Glosario: informe/Glosario.tex'` y `'- Marco teórico: informe/Cap2.tex'`.
- `it('sin glosario ni marco teórico no pide definicion-distinta ni sin-definir')`: no contiene `'"definicion-distinta"'` ni `'"sin-definir"'`, sí `'"se-contradice"'` y `'"corta-el-hilo"'`.
- `it('con uno solo, nombra solo ese')`.
- `it('lleva las notas de todos los capítulos, no solo de los revisados')`.
- `it('escribe los ignorados con y sin referencia')`: `'- [se-contradice] Cap3.tex: «frase» (ver Cap1.tex) — No coincide.'` y `'- [sin-definir] Cap3.tex: «término» — Falta.'`.
- `it('sin ignorados no lleva esa sección')`.
- `it('termina pidiendo el JSON')`: `p.trim().endsWith('Si no encontrás nada, devolvé [].')`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run compartido/promptVerificacionInforme.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `armarPromptDeVerificacionInforme`**

Texto exacto. Las líneas entre `[[ ]]` se incluyen solo si se cumple la condición. Las notas usan el mismo formato `### ruta` / `- Título: notas` que la prompt de Código.

```
Sos un revisor de un proyecto de grado. Revisá que el informe sea coherente consigo mismo y devolvé solo los problemas que encuentres, con las frases citadas.

En la carpeta de trabajo está informe/, con todos los archivos LaTeX del informe. Leé los que necesites.

Tipos de hallazgo:
- "se-contradice": dos partes del informe dicen cosas incompatibles. Lleva las dos citas.
[[glosario o marco]]- "definicion-distinta": un término se usa con otro sentido del que le da [[el glosario / el marco teórico / el glosario o el marco teórico]]. La referencia es la definición.
- "corta-el-hilo": da por sabido algo que no se presentó antes, salta sin conexión con lo anterior o repite lo ya dicho. Si hay un pasaje anterior que lo explica, va como referencia.
[[glosario o marco]]- "sin-definir": usa un término o concepto central que no está en [[el glosario / el marco teórico / el glosario ni en el marco teórico]]. Lleva solo la cita donde se usa.

## Orden de los capítulos
"Antes" quiere decir más arriba en esta lista. "corta-el-hilo" solo mira hacia atrás; "se-contradice" puede citar cualquier capítulo.
1. informe/<ruta>
…

## Archivos a revisar
La cita principal de cada hallazgo tiene que estar en uno de estos:
- informe/<ruta>
…

[[glosario o marco]]## Referencias
[[glosario]]- Glosario: informe/<ruta>
[[marco]]- Marco teórico: informe/<ruta>

## Qué debería contar cada sección
Son las notas % que el equipo dejó bajo cada título. Una sección que todavía es solo notas no se revisa, y lo que sus notas anuncian cuenta como ya presentado.
<notas>

[[ignorados]]## Ya ignorados
No vuelvas a reportar estos:
<líneas>

## Reglas
- Citá textualmente: copiá cada frase tal como está en el archivo, con sus comandos LaTeX.
- No reclames lo que es normal en un borrador (secciones vacías, notas %, \todo) ni cuestiones de redacción o estilo.
- No propongas texto nuevo para el informe: solo decí qué pasa.
- La explicación va en español, en una o dos oraciones.
- Solo leé y buscá: no modifiques nada.
- Devolvé únicamente un arreglo JSON, sin texto alrededor ni bloque de código, con esta forma:
[{"tipo": "se-contradice", "informe": {"archivo": "Cap3.tex", "linea": 14, "cita": "frase del capítulo revisado"}, "referencia": {"archivo": "Cap1.tex", "linea": 20, "cita": "frase del otro lugar"}, "explicacion": "qué no coincide"}]
- En "sin-definir" no va "referencia".
- Si no encontrás nada, devolvé [].
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run compartido/promptVerificacionInforme.test.ts compartido/promptVerificacion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor/compartido/promptVerificacionInforme.ts editor/compartido/promptVerificacionInforme.test.ts
git commit -m "Verificación contra el informe: prompt"
```

---

### Task 3: Corridas guardadas por tipo

**Files:**
- Modify: `editor/servidor/verificaciones.ts`, `editor/servidor/sugerencias.ts`
- Test: `editor/servidor/verificaciones.test.ts`, `editor/servidor/sugerencias.test.ts`

**Interfaces:**
- Consumes: `Contra`, `contraDe`, `Corrida` de la tarea 1.
- Produces:
  ```ts
  export interface Verificaciones {
    guardar(c: Omit<Corrida, 'comparacion' | 'resueltos'>): Promise<Corrida>;
    ultima(contra: Contra): Promise<Corrida | null>;   // la corrida devuelta siempre trae contra
    marcarResuelto(id: string): Promise<void>;         // busca en la última de cada tipo
    ignorados(): Promise<Ignorado[]>;
    ignorar(id: string): Promise<void>;                // ídem; guarda archivoReferencia
    recuperar(id: string): Promise<void>;
  }
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**

Las existentes pasan a guardar `contra: 'codigo'` y a llamar `ultima('codigo')`.

- `it('una corrida de Informe se llama AAAA-MM-DD-HHmm-informe.json')` (con `commit: null`).
- `it('ultima devuelve la última de cada tipo')`: Código a las 10:00 e Informe a las 10:05 → `ultima('codigo')` es la de las 10:00.
- `it('compara solo con la anterior del mismo tipo')`: Código, Informe y Código con los mismos archivos y alcance → la tercera compara contra la primera.
- `it('lee corridas viejas sin contra: con autor son de Informe y sin autor de Código')`: escribir los JSON a mano en la carpeta.
- `it('resolver e ignorar encuentran el hallazgo en la última de Informe')`.
- `it('ignorar guarda archivoReferencia, o null si no hay')`.

En `sugerencias.test.ts`:
- `it('la corrida de sugerencias es de Informe')`: `corrida.contra === 'informe'`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run servidor/verificaciones.test.ts servidor/sugerencias.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- `corridas()` completa `contra` con `contraDe` al leer.
- `nombreBase` usa `'informe'` cuando `commit` es `null`.
- `guardar` agrega `contraDe(c) === contraDe(corrida)` a la condición de la anterior.
- `marcarResuelto` e `ignorar` buscan el id en la última de cada tipo y escriben el archivo de esa corrida.
- `sugerencias.ts` guarda `contra: 'informe'`, y su mensaje final pasa a «Recargá la pestaña del editor para verlas en la pestaña Informe.».

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run servidor/verificaciones.test.ts servidor/sugerencias.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor/servidor/verificaciones.ts editor/servidor/verificaciones.test.ts editor/servidor/sugerencias.ts editor/servidor/sugerencias.test.ts
git commit -m "Verificación contra el informe: corridas guardadas por tipo"
```

---

### Task 4: El verificador corre contra el informe

**Files:**
- Modify: `editor/servidor/verificador.ts`, `editor/servidor/proyecto.ts`, `editor/servidor/index.ts`
- Test: `editor/servidor/verificador.test.ts`, `editor/servidor/proyecto.test.ts`

**Interfaces:**
- Consumes: tareas 1, 2 y 3; `archivosDe`, `fotografiarInforme`, `problemaDelRepositorio`.
- Produces:
  ```ts
  // proyecto.ts. Primer capítulo cuyo título, en minúsculas y sin tildes, contiene "antecedentes" o "marco teorico".
  export function rutaDelMarcoTeorico(capitulos: Capitulo[]): string | null;

  // verificador.ts
  export interface Verificador {
    estado(): Promise<EstadoVerificacion>;
    iniciar(contra: Contra, alcance: Alcance, ruta: string | null):
      Promise<{ tipo: 'ok' } | { tipo: 'ocupado' } | { tipo: 'invalido'; mensaje: string }>;
    cancelar(): void; cerrar(): void; terminada(): Promise<void>;
  }
  // crearVerificador agrega la opción  rutaDelMarcoTeorico?: () => Promise<string | null>
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**

En `proyecto.test.ts`, `describe('rutaDelMarcoTeorico')`:
- `it('reconoce "Revisión de antecedentes" y "Marco Teórico", y null si no hay')`.

En `verificador.test.ts` (las existentes pasan a `iniciar('codigo', …)` y a los estados nuevos):
- `it('contra el informe: guarda los hallazgos válidos con contra informe, sin rama ni commit')`: con un `responder` que devuelve un `se-contradice` válido (cita en `Cap3.tex`, referencia en `Cap2.tex`) y uno con la cita principal en un archivo no revisado. Se verifica `contra: 'informe'`, `rama: null`, `commit: null`, `archivos: ['Cap3.tex']`, un hallazgo y un descartado.
- `it('contra el informe funciona sin repositorio y no fotografía el repositorio')`: con `config.repositorio = null`, la carpeta de trabajo que recibe el lanzador tiene `informe/` y no `repositorio/`.
- `it('contra el informe la foto tiene todos los capítulos aunque se revise uno')`.
- `it('la prompt contra el informe lleva el glosario y el marco teórico')`: con `rutaDelGlosario` y `rutaDelMarcoTeorico` inyectadas.
- `it('a la prompt contra el informe le llegan solo los ignorados de Informe de los archivos revisados')`.
- `it('una sola corrida a la vez entre los dos tipos')`: con Código colgado, `iniciar('informe', …)` devuelve `{ tipo: 'ocupado' }`.
- `it('el estado dice el motivo de Código y deja Informe libre')`: sin repositorio, `{ estado: 'libre', motivos: { codigo: <mensaje de problemaDelRepositorio>, informe: null }, error: null }`.
- `it('en curso dice contra qué corre')`.
- `it('contra el informe, todo sin capítulos responde "El informe no tiene capítulos para verificar."')`.
- `it('el error de una corrida fallida dice de qué tipo fue')`: límite vencido contra el informe → `error.contra === 'informe'`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run servidor/verificador.test.ts servidor/proyecto.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `correr` se separa la preparación, que depende de `contra`, del resto, que es común (lanzar, límite, interpretar, validar, guardar, limpiar). Cada preparación devuelve:

```ts
{ prompt: string; textos: Map<string, string>; revisados: string[];
  lineasDelRepo(a: string): number | null; tipos: readonly TipoDeHallazgo[];
  rama: string | null; commit: string | null }
```

- **Código:** lo de hoy. Pasa `revisados` a `validarHallazgos` solo en Informe; en Código queda sin `revisados`, como hoy.
- **Informe:** la foto según el desvío 3. Los revisados son `archivosDe(ruta)` (capítulo) o la foto entera (todo). Los ignorados son los de tipo `TIPOS_DEL_AGENTE.informe` cuyo `archivoInforme` está entre los revisados. Además, `lineasDelRepo: () => null`, `rama` y `commit` en `null`.

`iniciar` mira `problemaDelRepositorio` solo para Código. `index.ts` pasa `rutaDelMarcoTeorico` igual que hoy `rutaDelGlosario`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run servidor/verificador.test.ts servidor/proyecto.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor/servidor/verificador.ts editor/servidor/verificador.test.ts editor/servidor/proyecto.ts editor/servidor/proyecto.test.ts editor/servidor/index.ts
git commit -m "Verificación contra el informe: corrida en el servidor"
```

---

### Task 5: Rutas y API

**Files:**
- Modify: `editor/servidor/app.ts`, `editor/cliente/api.ts`
- Test: `editor/servidor/app.test.ts`

**Interfaces:**
- Consumes: `Verificador.iniciar(contra, alcance, ruta)` (tarea 4), `Verificaciones.ultima(contra)` (tarea 3).
- Produces:
  ```ts
  // GET /api/verificacion
  { estado: EstadoVerificacion; corridas: Record<Contra, Corrida | null>; ignorados: Ignorado[] }
  // POST /api/verificacion  { contra, alcance, ruta? }  → 202 | 400 | 409
  // api.ts
  api.verificacion.leer(): Promise<{ estado; corridas: Record<Contra, Corrida | null>; ignorados: Ignorado[] }>;
  api.verificacion.iniciar(contra: Contra, alcance: Alcance, ruta: string | null): Promise<void>;
  ```

- [ ] **Step 1: Adaptar y agregar las pruebas de `app.test.ts`**

- `it('GET devuelve la última corrida de cada tipo')`: el doble de `verificaciones.ultima` responde según el argumento.
- `it('POST pasa contra al verificador')`: `toHaveBeenCalledWith('informe', 'capitulo', 'Cap4.tex')`.
- `it('POST sin contra o con otro valor responde 400')`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run servidor/app.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar las rutas y `api.ts`**

El comentario de las rutas pasa a decir que hay dos verificaciones y que ninguna escribe en el informe ni en el repositorio.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run servidor/app.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor/servidor/app.ts editor/servidor/app.test.ts editor/cliente/api.ts
git commit -m "Verificación contra el informe: rutas y API"
```

---

### Task 6: Lógica del cliente por pestaña

**Files:**
- Modify: `editor/cliente/verificacion.ts`, `editor/cliente/subrayadoVerificacion.ts`
- Test: `editor/cliente/verificacion.test.ts`, `editor/cliente/subrayadoVerificacion.test.ts`

**Interfaces:**
- Consumes: tarea 1 (`TIPOS_DE_PESTANA`, `contraDeTipo`, `Contra`) y la forma de `GET` de la tarea 5.
- Produces:
  ```ts
  export type Lado = 'informe' | 'referencia';
  export const NOMBRE_DE_TIPO: Record<TipoDeHallazgo, string>;
  // agrega 'se-contradice': 'Se contradice', 'definicion-distinta': 'Definición distinta',
  //        'corta-el-hilo': 'Corta el hilo', 'sin-definir': 'Sin definir'
  export function agrupar(h: readonly Hallazgo[], contra: Contra): { tipo; archivos }[];   // orden de TIPOS_DE_PESTANA[contra]
  export function ignoradosDe(ignorados: readonly Ignorado[], contra: Contra): Ignorado[];
  export function ubicarEnArchivo(texto: string, ruta: string | null, hallazgos: readonly Hallazgo[]):
    { citas: { desde: number; hasta: number; id: string; lado: Lado }[]; ubicado(h: Hallazgo, lado?: Lado): boolean };
  export function encabezado(c: Corrida): string[];
  export function opcionesDeVerificacion(e: EstadoVerificacion, contra: Contra, rutaAbierta: string | null, esCapitulo: boolean):
    { alcance: Alcance; texto: string; habilitada: boolean; ayuda?: string }[];
  export function mensajesDelPanel(e: EstadoVerificacion, contra: Contra, c: Corrida | null): string[];
  export function avisoAlTerminar(anterior: EstadoVerificacion | null,
    actual: { estado: EstadoVerificacion; corridas: Record<Contra, Corrida | null>; ignorados: readonly Ignorado[] }):
    { texto: string; tipo: 'info' | 'error' } | null;
  // subrayadoVerificacion.ts: CitaSubrayada pasa a { desde; hasta; id; lado: Lado } (atributo data-lado)
  ```

- [ ] **Step 1: Escribir y adaptar las pruebas**

- `agrupar`: `it('en Informe agrupa en orden se contradice, definición distinta, corta el hilo, sin definir, sugerencia')` y `it('en Código no muestra sugerencias')`.
- `ignoradosDe`: `it('separa los ignorados por pestaña; las sugerencias van con Informe')`.
- `ubicarEnArchivo`:
  - `it('subraya la referencia cuando su archivo es el abierto')`;
  - `it('la frase cambió es por lado')`: con la referencia ausente del texto abierto, `ubicado(h, 'referencia')` es `false` y `ubicado(h)` es `true` (la principal está en otro archivo).
- `encabezado`: `it('una corrida contra el informe dice el alcance y "contra el informe", sin rama')`, con primera línea `'27/10 10:05 · capítulo · contra el informe'` y la segunda `'Tardó 1:05 · costó US$ 0,40'`.
- `opcionesDeVerificacion`:
  - `it('con motivo de Código, Código queda deshabilitada y Informe libre')`;
  - `it('en curso deshabilita los dos botones con "Ya hay una verificación en curso."')`.
- `mensajesDelPanel`:
  - `it('sin corrida, cada pestaña dice su botón')`: `'Todavía no hay verificaciones contra el código. Elegí Contra código ▾ para hacer la primera.'` y `'Todavía no hay verificaciones contra el informe. Elegí Contra informe ▾ para hacer la primera.'`;
  - `it('el error se muestra solo en la pestaña de su tipo')`.
- `avisoAlTerminar`: `it('avisa con la corrida del tipo que estaba en curso')`.
- `subrayadoVerificacion.test.ts`: `it('citasSubrayadas devuelve el lado de cada cita')`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run cliente/verificacion.test.ts cliente/subrayadoVerificacion.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `encabezado`, la línea de rama se reemplaza por «contra el informe» cuando `contraDe(c) === 'informe'` y no hay `autor`; las sugerencias siguen como hoy. En `avisoAlTerminar`, la corrida que se mira es `actual.corridas[anterior.contra]`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run cliente/verificacion.test.ts cliente/subrayadoVerificacion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor/cliente/verificacion.ts editor/cliente/verificacion.test.ts editor/cliente/subrayadoVerificacion.ts editor/cliente/subrayadoVerificacion.test.ts
git commit -m "Verificación contra el informe: lógica del panel por pestaña"
```

---

### Task 7: Pantalla, estilos y guía

**Files:**
- Modify: `editor/cliente/pantalla/panelVerificacion.ts`, `editor/cliente/main.ts`, `editor/cliente/estilos.css`, `editor/INSTALACION.md`

**Interfaces:**
- Consumes: tareas 5 y 6.
- Produces:
  ```ts
  export function crearPanelVerificacion(padre: HTMLElement, o: {
    contra: Contra;
    alElegir(h: Hallazgo, lado: Lado): void;
    alResolver(id: string): void; alIgnorar(id: string): void; alRecuperar(id: string): void;
    alContar(cantidad: number): void;
  }): { mostrar(datos: { estado: EstadoVerificacion; corrida: Corrida | null; ignorados: Ignorado[] }, ubicado: (h: Hallazgo, lado?: Lado) => boolean): void; resaltar(id: string): void };
  ```

- [ ] **Step 1: Panel**

`mostrar` usa `agrupar(visibles, o.contra)` y `mensajesDelPanel(estado, o.contra, corrida)`. Recibe los ignorados ya filtrados por `main.ts` con `ignoradosDe`. Un hallazgo con `referencia` agrega, debajo de la cita principal, un botón con `ver en <archivo>` y `«<cita>»` que llama a `alElegir(h, 'referencia')`, con «la frase cambió» si `!ubicado(h, 'referencia')`.

- [ ] **Step 2: `main.ts`**

- **Botones:**
  - `Contra código ▾`, con title «Comparar el informe con el código de la aplicación».
  - `Contra informe ▾`, con title «Revisar que el informe sea coherente consigo mismo».

  Cada uno abre su menú con `opcionesDeVerificacion(estado, contra, …)`. `verificar(contra, alcance)` pregunta antes de «todo» con el mismo texto de hoy. Mientras corre, el botón de la corrida muestra `Verificando… m:ss` y el otro conserva su texto. Un solo `Cancelar`.
- **Pestañas:** `Código` e `Informe` reemplazan a `Verificación` (índices 2 y 3), cada una con su `(n)`, y cada una con su panel y su zona.
- **Subrayado:** `mostrarVerificacion` junta los visibles de las dos corridas para `ubicarEnArchivo` y `fijarCitas`, y le pasa a cada panel su corrida y sus ignorados.
- **Clic en un subrayado:** resalta el hallazgo en el panel de `contraDeTipo` de su tipo, si esa pestaña está a la vista.
- **Ir a un hallazgo:** `irAHallazgo(h, lado)` abre `h.informe.archivo` o `h.referencia.archivo`, salta a la cita subrayada de ese id y ese lado o, si no está, a su línea.
- **Al iniciar** una corrida se muestra la pestaña de su tipo.

- [ ] **Step 3: Estilos**

Cuatro colores nuevos, como variables en `:root` y en el bloque oscuro, junto a `--verificacion`:

| Variable | Claro | Oscuro |
|---|---|---|
| `--se-contradice` | `#a3324f` | `#f0a3b6` |
| `--definicion-distinta` | `#1f6f8b` | `#8fcde3` |
| `--corta-el-hilo` | `#8a5a00` | `#e6c27a` |
| `--sin-definir` | `#3f6b2a` | `#a9d69a` |

Con ellas, `.verificacion-tipo.<tipo> { color: var(--<tipo>); }`. La segunda cita usa las clases de la primera y `.verificacion-referencia { font-size: 13px; }` para el «ver en …».

- [ ] **Step 4: Guía**

En `INSTALACION.md`, la sección de Verificación pasa a explicar:
- los dos botones y las dos pestañas;
- las cuatro viñetas de Informe, con una línea cada una sacada de la tabla de la sección 2 de la spec;
- que Informe no necesita `repositorio`;
- que las sugerencias ahora se ven en la pestaña Informe;
- que las secciones que son solo notas `%` no se revisan.

Las menciones a «la pestaña Verificación» pasan a «Código» o «Informe», según corresponda.

- [ ] **Step 5: Tipos y suite**

Run: `npx tsc --noEmit -p .` → sin errores.
Run: `npm test` → todo pasa (en el worktree, sin LanguageTool: la prueba que lo usa queda salteada como en la etapa 5).

- [ ] **Step 6: Prueba en pantalla con el agente falso**

Con `config.prueba.json` (4327, 4329, `"corrector": false`), `npm run entorno-prueba`, `npm run build` y:

```bash
EDITOR_CONFIG=config.prueba.json EDITOR_AGENTE="node pruebas/ayudas/agenteFalso.mjs" AGENTE_FALSO=fijo AGENTE_FALSO_SALIDA=<json con un hallazgo de cada tipo de Informe sobre el informe de prueba> npm run servir
```

Comprobar en el navegador del panel (http://localhost:4327):
- los dos botones y sus menús;
- la pestaña Informe con las cuatro viñetas y sus colores, en claro y en oscuro;
- clic en la cita y en «ver en …», que abren el archivo correcto y saltan a la frase;
- Resuelto, Ignorar y Recuperar;
- que la pestaña Código no cambia.

Después, detener el `node` hijo por su puerto 4327, nunca el 4317.

- [ ] **Step 7: Commit**

```bash
git add editor/cliente/pantalla/panelVerificacion.ts editor/cliente/main.ts editor/cliente/estilos.css editor/INSTALACION.md
git commit -m "Verificación contra el informe: botones, pestañas y guía"
```

---

### Task 8: Prueba real

- [ ] **Step 1: Una corrida real**

Con el editor de prueba (4327) apuntando a una copia de `Tesis/informe/` (no al informe mismo: `npm run entorno-prueba` copia el fixture; para esta prueba se copia el informe real a `.entorno-prueba/informe` sin su `.git`) y `agente` de `config.json` en `config.prueba.json`, correr «Contra informe → Verificar capítulo» sobre `Cap3_1 - Por.tex`.

- [ ] **Step 2: Revisar a mano**

Comprobar que las dos citas de cada hallazgo existen en los archivos y que los hallazgos tienen sentido. Anotar en la guía, si hace falta, cuánto tardó y cuánto costó. Si la prompt produce ruido (por ejemplo, reclama redacción), ajustar sus reglas en `promptVerificacionInforme.ts` con su prueba, y commitear.

- [ ] **Step 3: Avisar a Cristhian**

La rama `etapa-6` está lista para integrar. Integrar a `main` es a pedido suyo, con `npm run build`. Como cambia código del servidor, su editor abierto sigue con el viejo hasta que se reinicie.
