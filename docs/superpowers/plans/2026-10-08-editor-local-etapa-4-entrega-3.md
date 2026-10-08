# Editor local del informe, etapa 4, entrega 3: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una tabla se vea como tabla y se edite escribiendo en sus celdas, con un menú para agregar, borrar y alinear filas y columnas, sin que el `.tex` cambie más que lo que el usuario tocó.

**Architecture:** Un modelo puro y compartido (`compartido/tabla.ts`) lee un `tabular`, lo clasifica (simple, solo lectura, no reconocida) y ofrece las operaciones como ediciones mínimas de texto. La vista reemplaza el `tabular` por un widget con una tabla HTML; cada acción del usuario vuelve a leer el documento vigente por (fila, columna) y despacha una sola transacción. El flotante `table` se trata como `figure`: armado oculto y epígrafe editable en el lugar.

**Tech Stack:** el de las entregas anteriores (TypeScript, Vite, Vitest en entorno `node`, CodeMirror 6, KaTeX). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-06-editor-local-etapa-4-design.md` (secciones 3, 7, 8, 9, 10 y 11). Leerla antes de empezar.

## Global Constraints

- **Invariante de fidelidad** (spec 3): dibujar no modifica el documento. Editar una celda cambia solo los caracteres de su contenido. Agregar o borrar filas y columnas cambia lo mínimo necesario y nada fuera del `tabular`.
- Todo `tabular` que el editor no entienda se sigue mostrando como código. Ante la duda, no reconocida.
- `Tesis/informe/` es de cinco personas: las pruebas automáticas y manuales nunca escriben ahí ni contactan a Overleaf. Usan `pruebas/fixtures/`, y `npm run entorno-prueba` para lo manual.
- Se parte de `main` y se trabaja en un worktree de Git aparte, no en `Tesis/editor/`, que es lo que abre el ícono. Si el editor de Cristhian corre (puertos 4317 y 4319) no se lo mata: las pruebas manuales usan 4327 y 4329, con `"corrector": false` en `config.prueba.json`.
- Dentro del worktree los comandos de shell van de a uno y simples (sin heredocs ni cadenas con `git`); los archivos se escriben con la herramienta de edición.
- Sin dependencias nuevas. Nunca modificar `prgrado.cls`.
- El contenido de una celda llega al DOM con `textContent`. El único HTML que se inserta es el de KaTeX (`dibujarFormula`, que ya usa `trust: false`).
- Interfaz en español rioplatense (voseo), sin mayúsculas de título, sin signos de exclamación. Los textos entre comillas de este plan son copia exacta.
- Identificadores en español. Posiciones (`desde`, `hasta`) sobre el texto con saltos normalizados a `\n`, `hasta` exclusivo.
- Las pruebas escriben el LaTeX con `String.raw` (`const R = String.raw;`), para no duplicar barras.
- TDD en cada tarea; un commit por tarea como mínimo. Al cerrar cada tarea: `npx vitest run --exclude servidor/git.test.ts` y `npx tsc --noEmit -p .`. La suite completa (`npx vitest run`, unos 3 minutos) en la tarea 8.
- Fuera de alcance (spec 11): pegar desde Excel, combinar celdas desde el editor, entrar a la tabla con las flechas, corrector dentro de las celdas.

## Review Focus

1. **Tablas que escribieron otros en Overleaf.** `@{}` en las columnas, `\multirow`, `\cline`, `\cmidrule`, `\\[2pt]`, comentarios, filas con celdas de más o de menos, la última fila sin `\\`, dos filas en una línea, rejilla con `\hline` en cada fila: nunca se dibujan mal ni se rompen al operar; lo que no se entiende queda como código. Pruebas en las tareas 1 y 3.
2. **Lo que se escribe en una celda.** `&`, `%`, `50%`, `\\`, una llave suelta, un `$` suelto, `\begin{…}`, `\hline`, `\multicolumn`, espacios a los lados, nada: después de aplicar, la tabla sigue siendo simple, con las mismas filas y columnas y con ese texto en esa celda; si no, no se aplica y se dice por qué. Pruebas en la tarea 2.
3. **El documento cambió debajo de una celda abierta.** El editor pasó a solo lectura (Traer, Enviar, conflicto), el archivo se recargó, o la tabla dejó de ser simple: la acción se resuelve contra el documento vigente y, si esa celda ya no existe o no se puede escribir, no se aplica nada. Pruebas en la tarea 6.
4. **Tablas en lugares raros.** Un `tabular` sin flotante; un flotante con dos `tabular`, con una imagen o con texto suelto; un `tabular` dentro de otro; el epígrafe arriba, abajo o ausente; `table*`: el armado solo se oculta cuando no esconde nada, y un `tabular` anidado no se dibuja. Pruebas en las tareas 4 y 5.
5. **Contenido que parece HTML.** Una celda con `<img onerror=…>` o `<b>` que vino de un compañero se muestra como texto. Prueba en la tarea 5 (las piezas son texto) y comprobación en el navegador en la tarea 8.

## Estructura de archivos

```
editor/
├── compartido/
│   ├── tabla.ts          (crear) leer y clasificar un tabular; operaciones como ediciones
│   ├── flotante.ts       (modificar) partesDeTabla, junto a partesDeFigura
│   └── tipos.ts          (modificar) recibe el tipo Edicion, que hoy está en cliente/comandos.ts
├── cliente/
│   ├── bloques/tabla.ts        (crear) decorador, widget y dibujo de las celdas
│   ├── bloques/edicionTabla.ts (crear) abrir una celda, teclas, aplicar al documento
│   ├── bloques/menuTabla.ts    (crear) menú por celda: filas, columnas, alineación
│   ├── bloques/figura.ts       (modificar) protegerEpigrafe vale también para tablas
│   ├── vista.ts, comandos.ts, estilos.css (modificar)
├── pruebas/fixtures/informe/Bloques.tex (modificar) suma una tabla con \multicolumn
└── INSTALACION.md        (modificar)
```

---

### Task 1: Leer y clasificar un `tabular`

**Files:**
- Create: `editor/compartido/tabla.ts`
- Test: `editor/compartido/tabla.test.ts`
- Modify: `editor/pruebas/fixtures/informe/Bloques.tex` y las pruebas que enumeran sus objetos

**Interfaces:**
- Consumes: `Rango` y el elemento `entorno` de `analizador.ts`. El `interior` de un `tabular` va desde justo después de `\begin{tabular}` (incluye la especificación de columnas) hasta el `\end{tabular}`.
- Produces:

```ts
export type Alineacion = 'l' | 'c' | 'r' | 'p';
export interface ColumnaDeTabla { alineacion: Alineacion; spec: Rango }   // spec: la letra, o `p{…}` entero
export interface CeldaDeTabla {
  contenido: Rango;                    // sin los espacios de los bordes; en \multicolumn, su tercer argumento
  ancho: number;                       // columnas que ocupa: 1 salvo en \multicolumn
  alineacion: Alineacion | null;       // solo en \multicolumn: la primera letra de su especificación
}
export interface FilaDeTabla {
  desde: number;                       // donde empieza su primera celda: tras el `\\` anterior y sus líneas
  separadores: number[];               // posición de cada `&`
  cierre: Rango | null;                // su `\\`; null en una última fila sin cerrar
  celdas: CeldaDeTabla[];
  lineaArriba: boolean;                // hay \hline, \toprule, \midrule o \bottomrule antes de la fila
}
export interface TablaLeida {
  clase: 'simple' | 'solo-lectura';
  columnas: ColumnaDeTabla[]; filas: FilaDeTabla[];
  lineaFinal: boolean;                 // hay una línea después de la última fila
}
export type Tabla = TablaLeida | { clase: 'no-reconocida' };
export function analizarTabla(texto: string, interior: Rango): Tabla;
```

Reglas:

- **Encabezado:** espacios, un `[…]` opcional, espacios y la especificación entre llaves balanceadas. Sus únicos caracteres válidos son `l`, `c`, `r`, `p{…}`, `|` y espacio; hace falta al menos una columna.
- **Cuerpo:** se recorre una vez llevando la profundidad de llaves; `\x` (barra y un carácter que no es letra) se saltea entero. A profundidad 0, `&` separa celdas y `\\` cierra la fila.
- **Líneas:** `\hline`, `\toprule`, `\midrule` y `\bottomrule` (sin letra pegada después) cuentan como línea solo al comienzo de una fila, antes de cualquier contenido; pueden repetirse. En otro lugar son contenido.
- **Última fila:** lo que sigue al último `\\`, sin líneas ni espacios, es una fila sin cerrar si queda algo; si no queda nada, no hay fila.
- **Celda vacía:** su `contenido` es un rango vacío. Si la celda termina en dos o más espacios o tabs seguidos, se ubica un carácter antes del final de la celda; si no, en el final. (Así, la fila ` &  \\` que deja "agregar fila" se llena como ` x & y \\`.)
- **No reconocida** si: el encabezado no cumple; hay un `%` sin barra; aparece `\begin{` o `\end{`; aparecen `\multirow`, `\cline` o `\cmidrule`; un `\\` va seguido de `[` o `*`; las llaves no balancean; no hay filas; alguna fila no suma tantas columnas como la especificación; o un `\multicolumn` no es todo el contenido de su celda o no tiene la forma `\multicolumn{n}{spec}{contenido}` con `n` entero positivo.
- **Solo lectura** si cumple todo y tiene al menos un `\multicolumn`. **Simple** si no tiene ninguno.
- Nunca lanza, con cualquier texto y cualquier rango dentro de él.

- [ ] **Step 1: Sumar al fixture `Bloques.tex`, después de la tabla que ya tiene y antes del `lstlisting`:**

```latex
\begin{table}[htbp]
  \centering
  \caption{Resultados por modelo}
  \label{tab:resultados}
  \begin{tabular}{lrr}
    \toprule
    Modelo & \multicolumn{2}{c}{Coherencia} \\
    \midrule
    LDA & 0.41 & 0.47 \\
    \bottomrule
  \end{tabular}
\end{table}
```

  Correr `npx vitest run --exclude servidor/git.test.ts` y corregir las pruebas que enumeran los objetos del fixture (`numeracion.test.ts` suma `['tabla', ['7.2']]`; las demás que aparezcan).

- [ ] **Step 2: Escribir las pruebas que fallan** en `tabla.test.ts`:

```ts
const R = String.raw;
const interiores = (t: string): Rango[] =>
  analizar(t).flatMap((e) => (e.tipo === 'entorno' && e.nombre === 'tabular' ? [e.interior] : []));
const leer = (t: string) => analizarTabla(t, interiores(t)[0]);
const leida = (t: string) => leer(t) as TablaLeida;
const celdas = (t: string) => leida(t).filas.map((f) => f.celdas.map((c) => t.slice(c.contenido.desde, c.contenido.hasta)));
// Un tabular con ese cuerpo y esa especificación de columnas.
const con = (cuerpo: string, spec = 'll') => `${R`\begin{tabular}`}{${spec}}\n${cuerpo}\n${R`\end{tabular}`}`;
const PLANTILLA = R`\begin{tabular}{ll}
    \toprule
    Sitio & Documentos \\
    \midrule
    Foro & 1200 \\
    \bottomrule
  \end{tabular}`;

it('la tabla de la plantilla es simple', () => {
  const t = leida(PLANTILLA);
  expect(t.clase).toBe('simple');
  expect(t.columnas.map((c) => [c.alineacion, PLANTILLA.slice(c.spec.desde, c.spec.hasta)])).toEqual([['l', 'l'], ['l', 'l']]);
  expect(celdas(PLANTILLA)).toEqual([['Sitio', 'Documentos'], ['Foro', '1200']]);
  expect(t.filas.map((f) => f.lineaArriba)).toEqual([true, true]);
  expect(t.lineaFinal).toBe(true);
  expect(t.filas.map((f) => PLANTILLA.slice(f.cierre!.desde, f.cierre!.hasta))).toEqual([R`\\`, R`\\`]);
  expect(t.filas[0].separadores.map((p) => PLANTILLA[p])).toEqual(['&']);
  expect(t.filas[0].celdas).toMatchObject([{ ancho: 1, alineacion: null }, { ancho: 1, alineacion: null }]);
});
it.each([
  ['|l|c|r|', ['l', 'c', 'r'], ['l', 'c', 'r']],
  ['l p{3cm} r', ['l', 'p', 'r'], ['l', 'p{3cm}', 'r']],
])('columnas {%s}', (spec, alineaciones, tramos) => {
  const f = con(R`a & b & c \\`, spec);
  expect(leida(f).columnas.map((c) => c.alineacion)).toEqual(alineaciones);
  expect(leida(f).columnas.map((c) => f.slice(c.spec.desde, c.spec.hasta))).toEqual(tramos);
});
it('acepta el argumento de posición', () => {
  expect(celdas(R`\begin{tabular}[t]{lc} a & b \\ \end{tabular}`)).toEqual([['a', 'b']]);
});
it('ni \\& ni un & entre llaves separan celdas, y \\% no es un comentario', () => {
  expect(celdas(con(R`R\&D & \mbox{a & b} \\`))).toEqual([[R`R\&D`, R`\mbox{a & b}`]]);
  expect(celdas(con(R`50\% & x \\`))).toEqual([[R`50\%`, 'x']]);
});
it('la última fila puede no cerrar', () => {
  const f = con(`${R`a & b \\`}\nc & d`);
  expect(celdas(f)).toEqual([['a', 'b'], ['c', 'd']]);
  expect(leida(f).filas[1].cierre).toBeNull();
  expect(leida(f).lineaFinal).toBe(false);
});
it('dos filas en una línea, y líneas repetidas', () => {
  const f = R`\begin{tabular}{ll} \hline\hline a & b \\ c & d \\ \hline \end{tabular}`;
  expect(celdas(f)).toEqual([['a', 'b'], ['c', 'd']]);
  expect(leida(f)).toMatchObject({ clase: 'simple', lineaFinal: true, filas: [{ lineaArriba: true }, { lineaArriba: false }] });
});
it('una celda vacía tiene contenido vacío, ubicado para llenarla sin perder el espaciado', () => {
  const f = con(R`     &  \\`);
  const y = f.indexOf('&');
  expect(leida(f).filas[0].celdas.map((c) => c.contenido)).toEqual([{ desde: y - 1, hasta: y - 1 }, { desde: y + 2, hasta: y + 2 }]);
  const pegada = con(R`a&&c \\`, 'lll');
  const z = pegada.indexOf('&&') + 1;
  expect(leida(pegada).filas[0].celdas[1].contenido).toEqual({ desde: z, hasta: z });
});
it.each([
  ['columnas con @{}', con(R`a & b \\`, '@{}ll@{}')],
  ['columna X', con(R`a & b \\`, 'lX')],
  ['columna con >{}', con(R`a & b \\`, R`>{\bfseries}ll`)],
  ['repetición de columnas', con(R`a & b \\`, '*{2}{c}')],
  ['sin especificación', `${R`\begin{tabular}`}\n${R`a & b \\`}\n${R`\end{tabular}`}`],
  ['sin columnas', con(R`a \\`, '|')],
  ['fila con celdas de menos', con(`${R`a & b \\`}\n${R`c \\`}`)],
  ['fila con celdas de más', con(R`a & b & c \\`)],
  ['\\multirow', con(R`\multirow{2}{*}{a} & b \\`)],
  ['\\cline', con(R`a & b \\ \cline{1-2}`)],
  ['\\cmidrule', con(`${R`a & b \\ \cmidrule{1-2}`}\n${R`c & d \\`}`)],
  ['\\\\ con espacio extra', con(R`a & b \\[2pt]`)],
  ['\\\\*', con(R`a & b \\*`)],
  ['comentario', con(R`a & b \\ % nota`)],
  ['otro entorno adentro', con(R`\begin{itemize}\item a\end{itemize} & b \\`)],
  ['un tabular adentro', R`\begin{tabular}{l}\begin{tabular}{l}x\end{tabular} \\ \end{tabular}`],
  ['llave de más', con(R`a } & b \\`)],
  ['llave sin cerrar', con(R`{a & b \\`)],
  ['sin filas', con(R`\hline`)],
  ['\\multicolumn que no es toda la celda', con(R`x \multicolumn{2}{c}{y} \\`)],
  ['\\multicolumn que no suma las columnas', con(R`\multicolumn{3}{c}{y} \\`)],
  ['\\multicolumn sin número', con(R`\multicolumn{dos}{c}{y} \\`)],
])('no reconocida: %s', (_nombre, fuente) => { expect(leer(fuente)).toEqual({ clase: 'no-reconocida' }); });

it('con \\multicolumn es de solo lectura y cada celda dice cuánto ocupa', () => {
  const f = con(`${R`\multicolumn{2}{|c|}{Total} \\`}\n${R`a & b \\`}`);
  expect(leida(f).clase).toBe('solo-lectura');
  expect(leida(f).filas[0].celdas).toMatchObject([{ ancho: 2, alineacion: 'c' }]);
  expect(celdas(f)).toEqual([['Total'], ['a', 'b']]);
});
it('las dos tablas del fixture', () => {
  const t = leerFixture('Bloques.tex');
  expect(interiores(t).map((i) => analizarTabla(t, i).clase)).toEqual(['simple', 'solo-lectura']);
});
it.each(['', '{', '{l', '{l}', '{l}\\\\', '{l} a & ', '[t', '{p{3cm}', '{l}}', '{l} \\multicolumn{', '{l} \\'])(
  'no falla con el interior %j', (interior) => {
    expect(() => analizarTabla(interior, { desde: 0, hasta: interior.length })).not.toThrow();
  });
```

- [ ] **Step 3: Correr y ver que fallan.** `npx vitest run compartido/tabla.test.ts`
- [ ] **Step 4: Implementar `analizarTabla` en `tabla.ts`.**
- [ ] **Step 5: Correr y ver que pasan**, y la suite rápida.
- [ ] **Step 6: Commit.** `git commit -m "Tablas: leer y clasificar un tabular"`

### Task 2: Editar una celda

**Files:**
- Modify: `editor/compartido/tabla.ts`, `editor/compartido/tipos.ts`, `editor/cliente/comandos.ts`
- Test: `editor/compartido/tabla.test.ts`

**Interfaces:**
- Consumes: `analizarTabla` (tarea 1).
- Produces: `Edicion` pasa a declararse en `compartido/tipos.ts` (después de `FinDeLinea`, con su comentario); `cliente/comandos.ts` la reexporta con `export type { Edicion } from '../compartido/tipos';` para no tocar a quienes la importan.
- Produces, en `tabla.ts`:

```ts
export const MOTIVOS = {
  llaves: 'Hay una llave sin cerrar o de más.',
  pesos: 'Hay un signo $ sin cerrar. Para escribir el signo, usá \\$.',
  rompe: 'Ese texto rompería la tabla. Para cosas así usá Ver código.',
  noEsta: 'La tabla cambió y esta celda ya no se puede editar acá.',
} as const;
export type ResultadoDeCelda = { tipo: 'ok'; edicion: Edicion } | { tipo: 'error'; motivo: string };
export function editarCelda(texto: string, interior: Rango, fila: number, columna: number, escrito: string): ResultadoDeCelda;
```

Reglas, en este orden:

1. Si el `tabular` no es simple o no tiene esa celda: `MOTIVOS.noEsta`.
2. Lo escrito se recorta en los bordes. Un `&` o un `%` precedido por una cantidad par de barras (cero incluido) se guarda como `\&` y `\%`.
3. Llaves sin barra que no balancean, o que cierran antes de abrir: `MOTIVOS.llaves`. Cantidad impar de `$` sin barra: `MOTIVOS.pesos`.
4. Si el resultado es igual al contenido actual: `{ tipo: 'ok', edicion }` con `cambios: []`.
5. Se arma el texto resultante y se vuelve a leer la tabla (el interior termina en `hasta` más la diferencia de largo). Tiene que seguir siendo simple, con la misma cantidad de filas y columnas, y el contenido de esa celda tiene que ser exactamente lo preparado. Si no: `MOTIVOS.rompe`.
6. La edición tiene un solo cambio, sobre `contenido` de la celda. En todas las operaciones de tablas `seleccion` es el cursor colapsado en `interior.desde`: la vista no la usa, maneja el foco por fila y columna.

- [ ] **Step 1: Escribir las pruebas que fallan:**

```ts
// Aplica los cambios de una edición, como el `aplicar` de comandos.test.ts.
function aplicar(texto: string, e: Edicion): string {
  let resultado = texto;
  for (const c of [...e.cambios].sort((a, b) => b.desde - a.desde)) resultado = resultado.slice(0, c.desde) + c.insertar + resultado.slice(c.hasta);
  return resultado;
}
const T = `x\n  ${PLANTILLA}\ny`;
// `replace` con función: un `$` en el reemplazo no se interpreta.
const cambiar = (de: string, a: string, t = T) => t.replace(de, () => a);
const editar = (t: string, fila: number, columna: number, escrito: string) => editarCelda(t, interiores(t)[0], fila, columna, escrito);
const editado = (t: string, fila: number, columna: number, escrito: string) => {
  const r = editar(t, fila, columna, escrito);
  if (r.tipo !== 'ok') throw new Error(r.motivo);
  return aplicar(t, r.edicion);
};

it('cambia solo el contenido de esa celda', () => {
  expect(editado(T, 0, 0, 'Página')).toBe(cambiar('Sitio', 'Página'));
  expect(editado(T, 1, 1, '1300')).toBe(cambiar('1200', '1300'));
  expect(editar(T, 0, 0, 'Página')).toMatchObject({ edicion: { cambios: [{ insertar: 'Página' }] } });
});
it('con el mismo texto no hay cambios', () => {
  expect(editar(T, 0, 1, ' Documentos ')).toMatchObject({ tipo: 'ok', edicion: { cambios: [] } });
});
it.each([
  ['R&D', R`R\&D`], [R`R\&D`, R`R\&D`], ['50%', R`50\%`], [R`50\%`, R`50\%`], ['  hola  ', 'hola'],
  [R`\textbf{a & b}`, R`\textbf{a \& b}`], [R`$k$ y \$5`, R`$k$ y \$5`], ['<b>x</b>', '<b>x</b>'],
])('escribir %j guarda %j', (escrito, guardado) => {
  expect(editado(T, 0, 0, escrito)).toBe(cambiar('Sitio', guardado));
});
it('vaciar una celda y volver a llenarla conserva el espaciado', () => {
  const vacia = editado(T, 1, 1, '');
  expect(vacia).toBe(cambiar(R`Foro & 1200 \\`, R`Foro &  \\`));
  expect(editado(vacia, 1, 1, '7')).toBe(cambiar(R`Foro & 1200 \\`, R`Foro & 7 \\`));
});
it.each([
  ['a } b', MOTIVOS.llaves], ['{a', MOTIVOS.llaves], ['}{', MOTIVOS.llaves], ['cuesta $5', MOTIVOS.pesos],
  [R`a \\ b`, MOTIVOS.rompe], [R`a \\& b`, MOTIVOS.rompe], [R`\begin{itemize}`, MOTIVOS.rompe],
  [R`\multicolumn{2}{c}{x}`, MOTIVOS.rompe], [R`\hline`, MOTIVOS.rompe], [R`\cline{1-2}`, MOTIVOS.rompe],
])('no aplica %j', (escrito, motivo) => { expect(editar(T, 0, 0, escrito)).toEqual({ tipo: 'error', motivo }); });
it('sobre una celda que no existe o una tabla que no es simple, no aplica', () => {
  expect(editar(T, 5, 0, 'x')).toEqual({ tipo: 'error', motivo: MOTIVOS.noEsta });
  expect(editar(T, 0, 2, 'x')).toEqual({ tipo: 'error', motivo: MOTIVOS.noEsta });
  const combinada = con(`${R`\multicolumn{2}{c}{Total} \\`}\n${R`a & b \\`}`);
  expect(editar(combinada, 1, 0, 'x')).toEqual({ tipo: 'error', motivo: MOTIVOS.noEsta });
});
```

- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Mover `Edicion` a `compartido/tipos.ts` e implementar `editarCelda`.**
- [ ] **Step 4: Correr y ver que pasan**, la suite rápida y `npx tsc --noEmit -p .`.
- [ ] **Step 5: Commit.** `git commit -m "Tablas: editar una celda sin tocar el resto"`

### Task 3: Filas, columnas y alineación

**Files:**
- Modify: `editor/compartido/tabla.ts`
- Test: `editor/compartido/tabla.test.ts`

**Interfaces:**
- Consumes: `analizarTabla`, `Edicion`.
- Produces (todas devuelven `null` si el `tabular` no es simple, si el índice no existe o si la operación no corresponde):

```ts
export function agregarFila(texto: string, interior: Rango, fila: number, lado: 'arriba' | 'abajo'): Edicion | null;
export function borrarFila(texto: string, interior: Rango, fila: number): Edicion | null;          // null si es la única
export function agregarColumna(texto: string, interior: Rango, columna: number, lado: 'izquierda' | 'derecha'): Edicion | null;
export function borrarColumna(texto: string, interior: Rango, columna: number): Edicion | null;    // null si es la única
export function alinearColumna(texto: string, interior: Rango, columna: number, alineacion: 'l' | 'c' | 'r'): Edicion | null;  // null en una columna p{…}
```

Definiciones para las filas. `I` es el primer carácter que no es espacio de la fila (una letra, un `&` o su `\\`). `F` es el final de su `\\` o, sin cierre, el final de su último contenido. La fila **está sola en sus líneas** si entre el comienzo de la línea de `I` e `I` hay solo espacios, y entre `F` y el fin de la línea de `F` (sin pasar de `interior.hasta`) hay solo espacios y líneas (`\hline`, `\toprule`, `\midrule`, `\bottomrule`); si esa línea sigue más allá de `interior.hasta`, no está sola.

- **`agregarFila`, sola en sus líneas:** la fila nueva es una copia de las líneas de la vecina con el contenido de cada celda vaciado y sin `\toprule`, `\midrule` ni `\bottomrule` (con los espacios que los preceden); un `\hline` en la misma línea se conserva, porque en una rejilla es de cada fila. Se inserta como líneas nuevas antes de la primera línea de la vecina o después de la última. Si la vecina no tiene `\\`, la nueva lo lleva igual (` \\` al final) y, al insertar abajo, a la vecina también se le agrega ` \\`.
- **`agregarFila`, en una línea compartida:** se copia el texto de la vecina entre `I` y `F`, vaciado; abajo se inserta en `F` precedido de un espacio, arriba en `I` seguido de un espacio.
- **`borrarFila`:** si está sola en sus líneas y después de `F` no hay `\toprule`, `\midrule` ni `\bottomrule`, se borran sus líneas enteras con su salto. Si no, se borra de `I` a `F` y los espacios o tabs que sigan en esa línea.
- **`agregarColumna`:** en cada fila se inserta ` & ` (espacio, `&`, espacio) al final del contenido de la celda de referencia (derecha) o al comienzo (izquierda). En la especificación, la columna nueva copia el tramo de la vecina (`l`, `p{3cm}`) junto con la tira de `|` y espacios que la separa del lado donde se inserta: a la derecha se inserta `tramo + tira` después de la tira que sigue a la vecina; a la izquierda, `tira + tramo` antes de la tira que la precede.
- **`borrarColumna`:** en cada fila, para la columna 0 se borra desde el comienzo de su contenido hasta su `&` y los espacios o tabs que sigan; para las demás, desde el `&` anterior hasta el `&` siguiente o, en la última, hasta el final de su contenido y los espacios o tabs que sigan. En la especificación se borra el tramo con la tira de `|` y espacios que lo sigue; en la última columna, con la tira que lo precede.
- **`alinearColumna`:** cambia la letra; con la misma letra, `cambios: []`.
- Cuando dos cambios caerían en el mismo punto se unen en uno: su orden no está definido.

- [ ] **Step 1: Escribir las pruebas que fallan:**

```ts
const REJILLA = R`\begin{tabular}{|l|c|}
\hline
a & b \\ \hline
c & d \\ \hline
\end{tabular}`;
const JUNTAS = R`\begin{tabular}{ll} a & b \\ c & d \\ \end{tabular}`;
const ABIERTA = con(`${R`a & b \\`}\nc & d`);
const MEDIA = con(`${R`a & b \\ \midrule`}\n${R`c & d \\`}`);
const VACIA = R`     &  \\`;   // la fila nueva bajo una fila con sangría de cuatro espacios
const op = (t: string, f: (texto: string, interior: Rango) => Edicion | null) => aplicar(t, f(t, interiores(t)[0])!);
const nulo = (t: string, f: (texto: string, interior: Rango) => Edicion | null) => f(t, interiores(t)[0]);

describe('agregarFila', () => {
  it('copia la sangría y el espaciado de la vecina, en una línea nueva', () => {
    const foro = `${R`    Foro & 1200 \\`}\n`;
    const sitio = `${R`    Sitio & Documentos \\`}\n`;
    expect(op(T, (t, i) => agregarFila(t, i, 1, 'abajo'))).toBe(cambiar(foro, `${foro}${VACIA}\n`));
    expect(op(T, (t, i) => agregarFila(t, i, 0, 'arriba'))).toBe(cambiar(sitio, `${VACIA}\n${sitio}`));
    expect(op(T, (t, i) => agregarFila(t, i, 0, 'abajo'))).toBe(cambiar(sitio, `${sitio}${VACIA}\n`));
  });
  it('en una rejilla la fila nueva lleva su \\hline; una línea de booktabs no se repite', () => {
    const a = `${R`a & b \\ \hline`}\n`;
    expect(op(REJILLA, (t, i) => agregarFila(t, i, 0, 'abajo'))).toBe(cambiar(a, `${a}${R` &  \\ \hline`}\n`, REJILLA));
    const m = `${R`a & b \\ \midrule`}\n`;
    expect(op(MEDIA, (t, i) => agregarFila(t, i, 0, 'abajo'))).toBe(cambiar(m, `${m}${R` &  \\`}\n`, MEDIA));
  });
  it('con varias filas en una línea, inserta en esa línea', () => {
    const esperado = R`\begin{tabular}{ll} a & b \\  &  \\ c & d \\ \end{tabular}`;
    expect(op(JUNTAS, (t, i) => agregarFila(t, i, 0, 'abajo'))).toBe(esperado);
    expect(op(JUNTAS, (t, i) => agregarFila(t, i, 1, 'arriba'))).toBe(esperado);
  });
  it('junto a una última fila sin cerrar, la nueva cierra', () => {
    expect(op(ABIERTA, (t, i) => agregarFila(t, i, 1, 'abajo'))).toBe(con(`${R`a & b \\`}\n${R`c & d \\`}\n${R` &  \\`}`));
    expect(op(ABIERTA, (t, i) => agregarFila(t, i, 1, 'arriba'))).toBe(con(`${R`a & b \\`}\n${R` &  \\`}\nc & d`));
  });
  it('la fila nueva queda vacía y se puede llenar', () => {
    const nueva = op(T, (t, i) => agregarFila(t, i, 1, 'abajo'));
    expect(celdas(nueva)).toEqual([['Sitio', 'Documentos'], ['Foro', '1200'], ['', '']]);
    expect(editado(editado(nueva, 2, 0, 'Blog'), 2, 1, '300')).toBe(cambiar(VACIA, R`    Blog & 300 \\`, nueva));
  });
});

describe('borrarFila', () => {
  it('quita su línea', () => {
    expect(op(T, (t, i) => borrarFila(t, i, 1))).toBe(cambiar(`${R`    Foro & 1200 \\`}\n`, ''));
    expect(op(REJILLA, (t, i) => borrarFila(t, i, 0))).toBe(cambiar(`${R`a & b \\ \hline`}\n`, '', REJILLA));
    expect(op(ABIERTA, (t, i) => borrarFila(t, i, 1))).toBe(con(R`a & b \\`));
  });
  it('una línea de booktabs en la misma línea se queda', () => {
    expect(op(MEDIA, (t, i) => borrarFila(t, i, 0))).toBe(con(`${R`\midrule`}\n${R`c & d \\`}`));
  });
  it('con varias filas en una línea, quita solo la suya', () => {
    expect(op(JUNTAS, (t, i) => borrarFila(t, i, 0))).toBe(R`\begin{tabular}{ll} c & d \\ \end{tabular}`);
  });
  it('la única fila no se borra', () => { expect(nulo(con(R`a & b \\`), (t, i) => borrarFila(t, i, 0))).toBeNull(); });
});

describe('agregarColumna', () => {
  const tres = (sitio: string, foro: string) =>
    cambiar(R`Foro & 1200 \\`, foro, cambiar(R`Sitio & Documentos \\`, sitio, cambiar('{ll}', '{lll}')));
  it('suma una letra a la especificación y una celda a cada fila', () => {
    expect(op(T, (t, i) => agregarColumna(t, i, 0, 'derecha'))).toBe(tres(R`Sitio &  & Documentos \\`, R`Foro &  & 1200 \\`));
    expect(op(T, (t, i) => agregarColumna(t, i, 1, 'izquierda'))).toBe(tres(R`Sitio &  & Documentos \\`, R`Foro &  & 1200 \\`));
    expect(op(T, (t, i) => agregarColumna(t, i, 0, 'izquierda'))).toBe(tres(R` & Sitio & Documentos \\`, R` & Foro & 1200 \\`));
    expect(op(T, (t, i) => agregarColumna(t, i, 1, 'derecha'))).toBe(tres(R`Sitio & Documentos &  \\`, R`Foro & 1200 &  \\`));
  });
  it.each([
    ['|l|c|', 0, 'derecha', '|l|l|c|'], ['|l|c|', 0, 'izquierda', '|l|l|c|'], ['|l|c|', 1, 'derecha', '|l|c|c|'],
    ['l c', 0, 'derecha', 'l l c'], ['l c', 1, 'izquierda', 'l c c'], ['l p{3cm}', 1, 'derecha', 'l p{3cm}p{3cm}'],
  ] as const)('{%s}, columna %i a la %s → {%s}', (spec, columna, lado, esperada) => {
    const nueva = op(con(R`a & b \\`, spec), (t, i) => agregarColumna(t, i, columna, lado));
    expect(nueva.slice(nueva.indexOf('{', 7) + 1, nueva.indexOf('\n') - 1)).toBe(esperada);
    expect(leida(nueva).columnas).toHaveLength(3);
  });
  it('la celda nueva se llena sin perder el espaciado', () => {
    const nueva = op(T, (t, i) => agregarColumna(t, i, 0, 'derecha'));
    expect(editado(nueva, 0, 1, 'x')).toBe(cambiar(R`Sitio &  & Documentos`, R`Sitio & x & Documentos`, nueva));
  });
});

describe('borrarColumna', () => {
  const una = (sitio: string, foro: string) =>
    cambiar(R`Foro & 1200 \\`, foro, cambiar(R`Sitio & Documentos \\`, sitio, cambiar('{ll}', '{l}')));
  it('quita su letra y su celda de cada fila', () => {
    expect(op(T, (t, i) => borrarColumna(t, i, 0))).toBe(una(R`Documentos \\`, R`1200 \\`));
    expect(op(T, (t, i) => borrarColumna(t, i, 1))).toBe(una(R`Sitio \\`, R`Foro \\`));
  });
  it.each([
    ['|l|c|', 0, '|c|', 'b'], ['|l|c|', 1, '|l|', 'a'],
  ] as const)('{%s} sin la columna %i → {%s}', (spec, columna, esperada, queda) => {
    expect(op(con(R`a & b \\`, spec), (t, i) => borrarColumna(t, i, columna))).toBe(con(`${queda} ${R`\\`}`, esperada));
  });
  it.each([
    [0, 'c r', R`b & c \\`], [1, 'l r', R`a & c \\`], [2, 'l c', R`a & b \\`],
  ] as const)('de tres columnas, sin la %i', (columna, spec, fila) => {
    expect(op(con(R`a & b & c \\`, 'l c r'), (t, i) => borrarColumna(t, i, columna))).toBe(con(fila, spec));
  });
  it('la única columna no se borra', () => { expect(nulo(con(R`a \\`, 'l'), (t, i) => borrarColumna(t, i, 0))).toBeNull(); });
});

describe('alinearColumna', () => {
  it('cambia una letra', () => {
    expect(op(T, (t, i) => alinearColumna(t, i, 1, 'r'))).toBe(cambiar('{ll}', '{lr}'));
    expect(nulo(T, (t, i) => alinearColumna(t, i, 0, 'l'))).toMatchObject({ cambios: [] });
    expect(nulo(con(R`a & b \\`, 'l p{3cm}'), (t, i) => alinearColumna(t, i, 1, 'c'))).toBeNull();
  });
});

it('ninguna operación toca nada fuera del tabular, y la tabla sigue siendo simple', () => {
  const afuera = (t: string) => { const i = interiores(t)[0]; return [t.slice(0, i.desde), t.slice(i.hasta)]; };
  const operaciones: ((texto: string, interior: Rango) => Edicion | null)[] = [
    (t, i) => agregarFila(t, i, 0, 'arriba'), (t, i) => agregarFila(t, i, 1, 'abajo'), (t, i) => borrarFila(t, i, 0),
    (t, i) => agregarColumna(t, i, 0, 'izquierda'), (t, i) => agregarColumna(t, i, 1, 'derecha'),
    (t, i) => borrarColumna(t, i, 0), (t, i) => borrarColumna(t, i, 1), (t, i) => alinearColumna(t, i, 0, 'c'),
  ];
  for (const base of [T, `x\n${REJILLA}\ny`, `x ${JUNTAS} y`, `x\n${ABIERTA}\ny`, `x\n${MEDIA}\ny`]) {
    for (const operacion of operaciones) {
      const nuevo = op(base, operacion);
      expect(afuera(nuevo)).toEqual(afuera(base));
      expect(leer(nuevo).clase).toBe('simple');
    }
  }
});
it('sobre una tabla que no es simple o un índice que no existe, null', () => {
  const combinada = con(`${R`\multicolumn{2}{c}{Total} \\`}\n${R`a & b \\`}`);
  expect(nulo(combinada, (t, i) => agregarFila(t, i, 0, 'abajo'))).toBeNull();
  expect(nulo(T, (t, i) => agregarFila(t, i, 9, 'abajo'))).toBeNull();
  expect(nulo(T, (t, i) => borrarColumna(t, i, 9))).toBeNull();
});
```

- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar las cinco operaciones.**
- [ ] **Step 4: Correr y ver que pasan**, y la suite rápida.
- [ ] **Step 5: Commit.** `git commit -m "Tablas: agregar, borrar y alinear filas y columnas"`

### Task 4: El flotante `table`

**Files:**
- Modify: `editor/compartido/flotante.ts`, `editor/cliente/bloques/figura.ts`
- Test: `editor/compartido/flotante.test.ts`, `editor/cliente/bloques/figura.test.ts`

**Interfaces:**
- Consumes: `analizarTabla`, `TablaLeida`.
- Produces, en `flotante.ts`:

```ts
export interface PartesDeTabla {
  tabular: Entorno; tabla: TablaLeida;
  epigrafe: Epigrafe | null;
  // Todo el rango del flotante menos el tabular y el contenido del epígrafe.
  ocultar: Rango[];
}
export function partesDeTabla(texto: string, flotante: Entorno, elementos: Elemento[]): PartesDeTabla | null;
```

  `null` salvo que el flotante tenga la forma de la plantilla: exactamente un `tabular`, que `analizarTabla` reconoce; a lo sumo un epígrafe, fuera del `tabular`; y fuera de esos dos, nada más que el armado que ya admite `partesDeFigura` (`\centering`, `\label{…}`, espacios, y el `[…]` de posición). Los elementos que están dentro del `tabular` no cuentan. El epígrafe puede ir antes o después. La lógica común con `partesDeFigura` se comparte.
- Produces: `protegerEpigrafe` (en `figura.ts`) protege también el epígrafe de un flotante `table` para el que `partesDeTabla` no es `null`.

- [ ] **Step 1: Escribir las pruebas que fallan.** En `flotante.test.ts`:

```ts
const FLOTANTE = R`\begin{table}[htbp]
  \centering
  \caption{Tamaño del corpus}
  \label{tab:corpus}
  \begin{tabular}{ll}
    Sitio & Documentos \\
  \end{tabular}
\end{table}`;
const partes = (t: string) => {
  const es = analizar(t);
  return partesDeTabla(t, es.find((e): e is Entorno => e.tipo === 'entorno' && e.nombre === 'table')!, es);
};

it('una tabla con la forma de la plantilla: tabular, epígrafe y armado para ocultar', () => {
  const p = partes(FLOTANTE)!;
  expect(FLOTANTE.slice(p.tabular.desde, p.tabular.hasta)).toBe(FLOTANTE.slice(FLOTANTE.indexOf(R`\begin{tabular}`), FLOTANTE.indexOf(R`\end{table}`) - 1));
  expect(p.tabla.clase).toBe('simple');
  expect(FLOTANTE.slice(p.epigrafe!.contenido.desde, p.epigrafe!.contenido.hasta)).toBe('Tamaño del corpus');
  expect(p.ocultar.map((r) => FLOTANTE.slice(r.desde, r.hasta))).toEqual([
    `${R`\begin{table}[htbp]`}\n  ${R`\centering`}\n  ${R`\caption{`}`, `}\n  ${R`\label{tab:corpus}`}\n  `, `\n${R`\end{table}`}`,
  ]);
});
it('el epígrafe puede ir debajo, o faltar', () => {
  const debajo = R`\begin{table}\begin{tabular}{l}a \\\end{tabular}\caption{Abajo}\end{table}`;
  expect(partes(debajo)!.ocultar.map((r) => debajo.slice(r.desde, r.hasta))).toEqual([R`\begin{table}`, R`\caption{`, R`}\end{table}`]);
  expect(partes(R`\begin{table*}\begin{tabular}{l}a \\\end{tabular}\end{table*}`)).toMatchObject({ epigrafe: null });
});
it.each([
  ['dos tabular', R`\begin{table}\begin{tabular}{l}a \\\end{tabular}\begin{tabular}{l}b \\\end{tabular}\end{table}`],
  ['ningún tabular', R`\begin{table}\caption{x}\end{table}`],
  ['una imagen', R`\begin{table}\includegraphics{a}\begin{tabular}{l}a \\\end{tabular}\end{table}`],
  ['texto suelto', R`\begin{table}Nota\begin{tabular}{l}a \\\end{tabular}\end{table}`],
  ['otro comando', R`\begin{table}\small\begin{tabular}{l}a \\\end{tabular}\end{table}`],
  ['un comentario', `${R`\begin{table}`}% nota\n${R`\begin{tabular}{l}a \\\end{tabular}\end{table}`}`],
  ['dos epígrafes', R`\begin{table}\caption{a}\caption{b}\begin{tabular}{l}a \\\end{tabular}\end{table}`],
  ['un tabular que no se reconoce', R`\begin{table}\begin{tabular}{@{}l}a \\\end{tabular}\end{table}`],
])('con %s no se dibuja', (_nombre, t) => { expect(partes(t)).toBeNull(); });
it('las tablas del fixture', () => {
  const t = leerFixture('Bloques.tex');
  const es = analizar(t);
  const flotantes = es.filter((e): e is Entorno => e.tipo === 'entorno' && e.nombre === 'table');
  expect(flotantes.map((f) => partesDeTabla(t, f, es)?.tabla.clase)).toEqual(['simple', 'solo-lectura']);
});
```

  En `figura.test.ts`, junto a las pruebas de `protegerEpigrafe` y con su misma ayuda: en un documento con `FLOTANTE`, un Retroceso al comienzo de "Tamaño del corpus" y un Suprimir al final no cambian el documento; un Retroceso en el medio sí.

- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar `partesDeTabla` y extender `protegerEpigrafe`.**
- [ ] **Step 4: Correr y ver que pasan**, y la suite rápida.
- [ ] **Step 5: Commit.** `git commit -m "Tablas: partes del flotante table y epígrafe protegido"`

### Task 5: La tabla dibujada

**Files:**
- Create: `editor/cliente/bloques/tabla.ts`
- Modify: `editor/cliente/vista.ts`, `editor/cliente/estilos.css`
- Test: `editor/cliente/bloques/tabla.test.ts`

**Interfaces:**
- Consumes: `analizarTabla`, `partesDeTabla`, `dibujarFormula` (`bloques/formula.ts`), `Pastilla`, `Decorador`, `el` (`pantalla/dom.ts`).
- Produces:

```ts
type Cita = Extract<Elemento, { tipo: 'cita' }>;
export type PiezaDeCelda =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'formato'; estilo: 'negrita' | 'cursiva' | 'mono'; piezas: PiezaDeCelda[] }
  | { tipo: 'formula'; fuente: string }
  | { tipo: 'cita'; texto: string };
// Lo que se ve de una celda: formato, fórmulas en línea y citas dibujados; lo demás, tal cual.
export function piezasDeCelda(texto: string, contenido: Rango, elementos: Elemento[], textoDeCita: (cita: Cita) => string): PiezaDeCelda[];
export const decorarTablas: Decorador;
```

- Produces, el DOM del widget, del que dependen las tareas 6 y 7:

```html
<span class="cm-tabla">                        <!-- solo lectura: class="cm-tabla cm-tabla-solo-lectura" -->
  <table class="cm-tabla-final">               <!-- la clase, solo si lineaFinal -->
    <tr class="cm-tabla-linea">                <!-- la clase, solo si lineaArriba -->
      <td data-fila="0" data-columna="0" colspan="1" style="text-align: left">…piezas…</td>
    </tr>
  </table>
  <button type="button" class="cm-ver-codigo">Ver código</button>
</span>
```

Reglas del decorador:

- Se dibuja cada `tabular` que `analizarTabla` reconoce y que no está dentro de otro `tabular`. El widget reemplaza exactamente el rango del `tabular` (de `\begin{tabular}` a `\end{tabular}`), con `Decoration.replace({ widget, reemplaza: true, cubre: true })`: así `vista.posAtDOM(nodo)` es el `desde` del `tabular`.
- El widget guarda `texto` (la fuente del `tabular`) y `clase` (`'cm-tabla'` o `'cm-tabla cm-tabla-solo-lectura'`); `eq` compara las dos. En `toDOM` vuelve a analizar su propia fuente: no depende de posiciones del documento.
- Para un flotante `table` con `partesDeTabla`: si la selección lo toca y no está toda dentro del contenido del epígrafe, se ve el código de todo el flotante. Si no: se ocultan los tramos de `ocultar`, la línea del flotante lleva `Decoration.line({ class: 'cm-linea-tabla' })`, y el epígrafe lleva el prefijo `Tabla 2.1: ` (o `Tabla: ` sin número; `Pastilla` con clase `cm-prefijo-epigrafe`) y la marca `cm-epigrafe`, igual que en `figura.ts`.
- Un `tabular` fuera de un flotante así se dibuja solo, sin ocultar nada, mientras la selección no lo toque.
- En `vista.ts`: `decorarTablas` se suma a `BLOQUES`; al final de `decorar`, toda decoración que cae entera dentro del rango de una decoración con `cubre: true` (y no es ella) se descarta, para que no queden reemplazos ni marcas debajo del widget.
- Celdas: alineación por columna (`l` y `p` a la izquierda, `c` al centro, `r` a la derecha; en `\multicolumn`, la suya) y `colSpan` con su `ancho`. Una celda vacía lleva un espacio duro para tener altura. La cita se dibuja con sus claves separadas por coma, como en `vista.ts` (ver "Al integrar").
- Piezas: el texto y la cita van con `textContent`; `formato` es un `span` con `cm-negrita`, `cm-cursiva` o `cm-mono`; `formula` usa `dibujarFormula(fuente, null, false)` y, si falla, un `span.cm-formula-error` con el texto `fórmula con error`. Solo cuentan como `formula` las matemáticas en línea; solo se anidan piezas dentro de `formato`.
- `ignoreEvent` devuelve `true` salvo para los eventos de arrastre (`/^drag|^drop$/`), como la imagen.
- "Ver código" pone la selección en `vista.posAtDOM(nodo)` y enfoca el editor. En una tabla de solo lectura, un clic en cualquier parte hace lo mismo, y la tabla lleva `title="Esta tabla tiene celdas combinadas: se edita desde el código. Clic para verlo."`.

Estilos (en `estilos.css`, después de los de figuras):

```css
#editor .cm-linea-tabla { text-align: center; }
#editor .cm-linea-tabla .cm-tabla { display: inline-block; width: 100%; }
#editor .cm-tabla { position: relative; display: inline-block; vertical-align: middle; text-indent: 0; }
#editor .cm-tabla table { margin: 4px auto; border-collapse: collapse; font-size: 0.95em; line-height: 1.4; }
#editor .cm-tabla td { position: relative; min-width: 3em; padding: 3px 10px; border: 1px dashed var(--borde); cursor: text; }
#editor .cm-tabla tr.cm-tabla-linea td { border-top: 1.5px solid var(--texto); }
#editor .cm-tabla table.cm-tabla-final tr:last-child td { border-bottom: 1.5px solid var(--texto); }
#editor .cm-tabla-solo-lectura td, #editor.solo-lectura .cm-tabla td { cursor: default; }
#editor .cm-tabla:hover .cm-ver-codigo { opacity: 1; }
```

- [ ] **Step 1: Escribir las pruebas que fallan** en `cliente/bloques/tabla.test.ts` (con `decos` y `ctxDePrueba`, como `figura.test.ts`):

```ts
const R = String.raw;
const TABULAR = R`\begin{tabular}{ll}
    \textbf{Sitio} & $k$ \\
    Foro & \cite{a,b} \\
  \end{tabular}`;
const T = `antes\n${R`\begin{table}[htbp]`}\n  ${R`\centering`}\n  ${R`\caption{Corpus}`}\n  ${R`\label{tab:c}`}\n  ${TABULAR}\n${R`\end{table}`}\ndespués`;
const DESDE = T.indexOf(R`\begin{tabular}`);
const HASTA = DESDE + TABULAR.length;
const EPIGRAFE = T.indexOf('Corpus');
const tablas = (t: string, cursor = 0) => decos(t, cursor, ctx).filter((x) => x.clase?.startsWith('cm-tabla'));

it('sin el cursor: el tabular es un widget, el armado se oculta y el epígrafe lleva su número', () => {
  const d = decos(T, 0, ctx);
  expect(d).toContainEqual({ desde: DESDE, hasta: HASTA, reemplaza: true, widget: TABULAR, clase: 'cm-tabla' });
  expect(d.filter((x) => x.reemplaza && !x.widget).map((x) => T.slice(x.desde, x.hasta))).toEqual([
    `${R`\begin{table}[htbp]`}\n  ${R`\centering`}\n  ${R`\caption{`}`, `}\n  ${R`\label{tab:c}`}\n  `, `\n${R`\end{table}`}`,
  ]);
  expect(d).toContainEqual(expect.objectContaining({ desde: EPIGRAFE, hasta: EPIGRAFE, widget: 'Tabla 2.1: ', clase: 'cm-prefijo-epigrafe' }));
  expect(d).toContainEqual(expect.objectContaining({ desde: EPIGRAFE, hasta: EPIGRAFE + 6, clase: 'cm-epigrafe' }));
  expect(d).toContainEqual(expect.objectContaining({ clase: 'cm-linea-tabla' }));
});
it('debajo del widget no queda ninguna otra decoración', () => {
  expect(decos(T, 0, ctx).filter((x) => x.desde >= DESDE && x.hasta <= HASTA)).toHaveLength(1);
});
it('con el cursor en el epígrafe la tabla sigue dibujada', () => {
  for (const pos of [EPIGRAFE, EPIGRAFE + 3, EPIGRAFE + 6]) expect(tablas(T, pos), `cursor en ${pos}`).toHaveLength(1);
});
it('con el cursor en el armado o en el tabular se ve todo el código', () => {
  for (const pos of [T.indexOf(R`\begin{table}`), T.indexOf(R`\centering`), T.indexOf(R`\label`), DESDE, DESDE + 30, HASTA, T.indexOf('\ndespués')]) {
    const d = decos(T, pos, ctx);
    expect(d.some((x) => x.clase?.startsWith('cm-tabla') || x.clase === 'cm-linea-tabla' || x.clase === 'cm-prefijo-epigrafe'), `cursor en ${pos}`).toBe(false);
  }
});
it('un tabular suelto se dibuja solo; con el cursor encima, no', () => {
  const suelto = `a\n${TABULAR}\nb`;
  expect(tablas(suelto)).toEqual([{ desde: 2, hasta: 2 + TABULAR.length, reemplaza: true, widget: TABULAR, clase: 'cm-tabla' }]);
  expect(decos(suelto, 0, ctx).some((x) => x.reemplaza && !x.widget)).toBe(false);
  expect(tablas(suelto, 5)).toEqual([]);
});
it('en un flotante que no tiene la forma de la plantilla, el tabular se dibuja y el armado queda a la vista', () => {
  const t = `${R`\begin{table}`}\nNota\n${TABULAR}\n${R`\end{table}`}\nfin`;
  expect(tablas(t, t.length).map((x) => x.clase)).toEqual(['cm-tabla']);
  expect(decos(t, t.length, ctx).some((x) => x.reemplaza && !x.widget)).toBe(false);
});
it('una tabla con \\multicolumn es de solo lectura; una que no se reconoce queda como código', () => {
  const combinada = R`\begin{tabular}{ll}\multicolumn{2}{c}{Total} \\ a & b \\\end{tabular}`;
  expect(tablas(`x\n${combinada}`).map((x) => x.clase)).toEqual(['cm-tabla cm-tabla-solo-lectura']);
  const rara = `x\n${R`\begin{table}\caption{C}\begin{tabular}{@{}l}a \\\end{tabular}\end{table}`}`;
  expect(decos(rara, 0, ctx).some((x) => x.clase?.startsWith('cm-tabla') || x.clase === 'cm-prefijo-epigrafe')).toBe(false);
});
it('un tabular dentro de otro no se dibuja', () => {
  expect(tablas(`x\n${R`\begin{tabular}{l}\begin{tabular}{l}a \\\end{tabular} \\\end{tabular}`}`)).toEqual([]);
});
it('las tablas del fixture', () => {
  const d = decos(leerFixture('Bloques.tex'), 0, ctxDePrueba({ numeroCapitulo: '7' }));
  expect(d.filter((x) => x.reemplaza && x.clase?.startsWith('cm-tabla')).map((x) => x.clase)).toEqual(['cm-tabla', 'cm-tabla cm-tabla-solo-lectura']);
  expect(d.filter((x) => x.widget?.startsWith('Tabla')).map((x) => x.widget)).toEqual(['Tabla 7.1: ', 'Tabla 7.2: ']);
});

describe('piezasDeCelda', () => {
  const piezas = (celda: string) => piezasDeCelda(celda, { desde: 0, hasta: celda.length }, analizar(celda), (c) => c.claves.join(', '));
  it('dibuja formato, fórmulas en línea y citas; lo demás queda tal cual', () => {
    expect(piezas(R`\textbf{Sitio} y $k$ \cite{a,b} \ref{x} 50\%`)).toEqual([
      { tipo: 'formato', estilo: 'negrita', piezas: [{ tipo: 'texto', texto: 'Sitio' }] },
      { tipo: 'texto', texto: ' y ' }, { tipo: 'formula', fuente: 'k' }, { tipo: 'texto', texto: ' ' },
      { tipo: 'cita', texto: 'a, b' }, { tipo: 'texto', texto: R` \ref{x} 50\%` },
    ]);
  });
  it('anida dentro del formato', () => {
    expect(piezas(R`\textit{a \(x\)}`)).toEqual([
      { tipo: 'formato', estilo: 'cursiva', piezas: [{ tipo: 'texto', texto: 'a ' }, { tipo: 'formula', fuente: 'x' }] },
    ]);
  });
  it('lo que parece HTML es texto', () => {
    expect(piezas('<img src=x onerror=alert(1)> <b>x</b>')).toEqual([{ tipo: 'texto', texto: '<img src=x onerror=alert(1)> <b>x</b>' }]);
  });
  it('una celda vacía no tiene piezas', () => { expect(piezas('')).toEqual([]); });
});
```

- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar `tabla.ts`, registrar el decorador y el descarte en `vista.ts`, y sumar los estilos.**
- [ ] **Step 4: Correr y ver que pasan**, la suite rápida y `npx tsc --noEmit -p .`.
- [ ] **Step 5: Commit.** `git commit -m "Tablas dibujadas, con su epígrafe y su número"`

### Task 6: Escribir en las celdas

**Files:**
- Create: `editor/cliente/bloques/edicionTabla.ts`
- Modify: `editor/cliente/bloques/tabla.ts`, `editor/cliente/estilos.css`
- Test: `editor/cliente/bloques/edicionTabla.test.ts`

**Interfaces:**
- Consumes: el DOM de la tarea 5; `analizarTabla`, `editarCelda`.
- Produces:

```ts
export interface Celda { fila: number; columna: number }
export type Operacion = (texto: string, interior: Rango) => Edicion | null;

// El tabular que empieza exactamente en `desde`, si es simple.
export function tablaEn(texto: string, desde: number): { interior: Rango; tabla: TablaLeida } | null;
// Los cambios de `operacion` como una transacción que se deshace de un solo paso. null si el editor
// está en solo lectura, si en `desde` ya no hay un tabular simple, o si la operación no cambia nada.
export function transaccionDeTabla(estado: EditorState, desde: number, operacion: Operacion): TransactionSpec | null;
// Celda a la que se pasa; null si se sale de la tabla.
export function celdaVecina(filas: number, columnas: number, celda: Celda, hacia: 'siguiente' | 'anterior' | 'abajo'): Celda | null;
// Dónde dejar el cursor al salir: justo después del tabular o, si lo rodea un flotante table, del flotante.
// null si ahí termina el archivo.
export function salidaDeTabla(texto: string, desde: number): number | null;
// Abre el campo de una celda de la tabla dibujada en `desde`. No hace nada si no se puede editar.
export function abrirCelda(vista: EditorView, desde: number, celda: Celda, seleccionarTodo: boolean): void;
// Aplica la celda abierta, si hay una. false si lo escrito no se pudo aplicar (la celda sigue abierta, en rojo).
export function confirmarCeldaAbierta(): boolean;
```

Reglas:

- `transaccionDeTabla`: `{ changes, annotations: isolateHistory.of('full'), userEvent: 'input' }`. `isolateHistory` viene de `@codemirror/commands`: sin él, dos celdas editadas seguidas se deshacen juntas.
- `celdaVecina`: `siguiente` avanza por la fila y pasa a la primera celda de la fila de abajo; `anterior`, al revés; `abajo` mantiene la columna.
- `abrirCelda` busca el nodo `.cm-tabla` de `vista.contentDOM` cuyo `vista.posAtDOM` es `desde`, y en él `td[data-fila][data-columna]`. No hace nada si `vista.state.readOnly`, si `tablaEn` da `null` o si no encuentra la celda. Hay una sola celda abierta a la vez (estado del módulo): abrir otra confirma primero la abierta y, si no se pudo, no abre.
- El campo es `input.cm-celda-campo` (`type="text"`, `aria-label="Celda"`), con el LaTeX del contenido de la celda leído del documento vigente, y el ancho que tenía la celda (mínimo `8ch`). Reemplaza a las piezas de la celda y toma el foco. Con `seleccionarTodo` se selecciona todo; si no, el cursor queda al final.
- En `tabla.ts`: un clic en un `td` de una tabla simple llama `abrirCelda(vista, vista.posAtDOM(nodo), celda, false)`.
- **Confirmar** (al perder el foco, con Tab, Shift+Tab o Enter): se llama `editarCelda` sobre el documento vigente. Error: la celda queda abierta con la clase `cm-celda-error`, el motivo en un `span.cm-celda-motivo` debajo del campo y `aria-invalid="true"`; el foco vuelve al campo y no se navega. Sin error: si hay cambios se despacha `transaccionDeTabla`; si no, la celda vuelve a mostrar sus piezas.
- **Teclas:** Tab → `siguiente`; Shift+Tab → `anterior`; Enter → `abajo`; después de confirmar se abre la vecina con `seleccionarTodo`. Si no hay vecina, o con Escape (que descarta lo escrito), se sale: si `salidaDeTabla` da una posición, se pone ahí la selección y se enfoca el editor; si da `null`, solo se saca el foco del campo.
- La celda se marca como cerrada antes de despachar: al redibujarse la tabla el campo viejo pierde el foco y no debe confirmar de nuevo.
- Si al confirmar el editor está en solo lectura, no se aplica y la celda se cierra.

Estilos:

```css
#editor .cm-celda-campo { font: inherit; color: inherit; box-sizing: border-box; padding: 1px 4px; border: 1px solid var(--acento); border-radius: 3px; background: var(--superficie); }
#editor .cm-celda-error .cm-celda-campo { border-color: var(--peligro); background: var(--peligro-fondo); }
#editor .cm-celda-motivo { display: block; max-width: 28ch; font: 12px/1.3 var(--interfaz); color: var(--peligro); text-align: left; white-space: normal; }
```

- [ ] **Step 1: Escribir las pruebas que fallan** (sin DOM: estado de CodeMirror y funciones puras):

```ts
const R = String.raw;
const TABULAR = R`\begin{tabular}{ll}
  Sitio & Documentos \\
  Foro & 1200 \\
\end{tabular}`;
const FLOTANTE = `${R`\begin{table}`}\n${R`\caption{C}`}\n${TABULAR}\n${R`\end{table}`}`;
const T = `antes\n${FLOTANTE}\ndespués`;
const DESDE = T.indexOf(R`\begin{tabular}`);
const estadoCon = (doc: string, soloLectura = false) =>
  EditorState.create({ doc, extensions: [history(), EditorState.readOnly.of(soloLectura)] });
const celda = (fila: number, columna: number, escrito: string): Operacion => (texto, interior) => {
  const r = editarCelda(texto, interior, fila, columna, escrito);
  return r.tipo === 'ok' ? r.edicion : null;
};

describe('transaccionDeTabla', () => {
  it('aplica la operación sobre el tabular que empieza ahí', () => {
    const estado = estadoCon(T);
    const nuevo = estado.update(transaccionDeTabla(estado, DESDE, celda(0, 0, 'Página'))!).state;
    expect(nuevo.doc.toString()).toBe(T.replace('Sitio', 'Página'));
  });
  it.each([
    ['el editor está en solo lectura', estadoCon(T, true), DESDE, celda(0, 0, 'x')],
    ['ahí no empieza un tabular', estadoCon(T), DESDE + 1, celda(0, 0, 'x')],
    ['el tabular dejó de ser simple', estadoCon(T.replace('{ll}', '{@{}ll}')), DESDE, celda(0, 0, 'x')],
    ['la celda ya no existe', estadoCon(T), DESDE, celda(7, 0, 'x')],
    ['la operación no cambia nada', estadoCon(T), DESDE, celda(0, 0, 'Sitio')],
  ])('null si %s', (_nombre, estado, desde, operacion) => {
    expect(transaccionDeTabla(estado, desde, operacion)).toBeNull();
  });
  it('dos celdas editadas seguidas se deshacen de a una', () => {
    const inicial = estadoCon(T);
    const uno = inicial.update(transaccionDeTabla(inicial, DESDE, celda(0, 0, 'Página'))!).state;
    const dos = uno.update(transaccionDeTabla(uno, DESDE, celda(0, 1, 'Visitas'))!).state;
    let deshecho = dos;
    undo({ state: dos, dispatch: (tr) => { deshecho = tr.state; } });
    expect(deshecho.doc.toString()).toBe(uno.doc.toString());
  });
});

it('tablaEn: solo un tabular simple que empieza justo ahí', () => {
  expect(tablaEn(T, DESDE)?.tabla.filas).toHaveLength(2);
  expect(tablaEn(T, DESDE - 1)).toBeNull();
  expect(tablaEn(T, 0)).toBeNull();
});

it.each([
  [{ fila: 0, columna: 0 }, 'siguiente', { fila: 0, columna: 1 }], [{ fila: 0, columna: 1 }, 'siguiente', { fila: 1, columna: 0 }],
  [{ fila: 1, columna: 1 }, 'siguiente', null], [{ fila: 1, columna: 0 }, 'anterior', { fila: 0, columna: 1 }],
  [{ fila: 0, columna: 0 }, 'anterior', null], [{ fila: 0, columna: 1 }, 'abajo', { fila: 1, columna: 1 }],
  [{ fila: 1, columna: 1 }, 'abajo', null],
] as const)('celdaVecina de %j hacia %s', (desde, hacia, esperada) => {
  expect(celdaVecina(2, 2, desde, hacia)).toEqual(esperada);
});

it('salidaDeTabla: después del flotante, o del tabular si está suelto', () => {
  expect(salidaDeTabla(T, DESDE)).toBe(T.indexOf('después'));
  const suelto = `a\n${TABULAR}\nb`;
  expect(salidaDeTabla(suelto, 2)).toBe(suelto.length - 1);
  expect(salidaDeTabla(`a\n${TABULAR}`, 2)).toBeNull();
});
```

- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar `edicionTabla.ts`, conectar el clic en `tabla.ts` y sumar los estilos.**
- [ ] **Step 4: Correr y ver que pasan**, la suite rápida y `npx tsc --noEmit -p .`.
- [ ] **Step 5: Probar en el navegador**, en el entorno de prueba (4327/4329), sobre `Bloques.tex`: un clic abre la celda y el campo conserva el foco; escribir y salir con un clic afuera cambia solo esa celda; Tab, Shift+Tab y Enter recorren la tabla; Escape descarta; `a } b` deja la celda en rojo con su motivo; `R&D` queda como `R\&D`; con el foco de nuevo en el editor, un Ctrl+Z deshace una celda entera; la tabla con `\multicolumn` no abre celdas y un clic muestra su código.
- [ ] **Step 6: Commit.** `git commit -m "Tablas: escribir en las celdas"`

### Task 7: Menú por celda

**Files:**
- Create: `editor/cliente/bloques/menuTabla.ts`
- Modify: `editor/cliente/bloques/tabla.ts`, `editor/cliente/estilos.css`
- Test: `editor/cliente/bloques/menuTabla.test.ts`

**Interfaces:**
- Consumes: las operaciones de la tarea 3; `Celda`, `Operacion`, `tablaEn`, `transaccionDeTabla`, `abrirCelda`, `confirmarCeldaAbierta` (tarea 6); `preguntar` y `el` (`pantalla/dom.ts`).
- Produces:

```ts
export type AccionDeTabla =
  | 'fila-arriba' | 'fila-abajo' | 'columna-izquierda' | 'columna-derecha'
  | 'borrar-fila' | 'borrar-columna' | 'alinear-l' | 'alinear-c' | 'alinear-r';
export interface OpcionDeCelda { accion: AccionDeTabla; texto: string; habilitada: boolean; ayuda?: string }
// Las nueve opciones, siempre en este orden.
export function opcionesDeCelda(tabla: TablaLeida, celda: Celda): OpcionDeCelda[];
export function operacionDe(accion: AccionDeTabla, celda: Celda): Operacion;
// La pregunta antes de borrar una fila o columna que tiene contenido; null si no hace falta preguntar.
export function preguntaAntesDe(texto: string, tabla: TablaLeida, accion: AccionDeTabla, celda: Celda): string | null;
// La celda que queda abierta después de la acción; null si ninguna.
export function celdaTras(accion: AccionDeTabla, celda: Celda): Celda | null;
// Muestra el menú de esa celda junto a `ancla`.
export function abrirMenuDeCelda(vista: EditorView, desde: number, celda: Celda, ancla: HTMLElement): void;
```

Textos, en orden: "Insertar fila arriba", "Insertar fila abajo", "Insertar columna a la izquierda", "Insertar columna a la derecha", "Borrar fila", "Borrar columna", "Alinear a la izquierda", "Centrar", "Alinear a la derecha".

Reglas:

- "Borrar fila" se deshabilita con una sola fila (`ayuda`: "Es la única fila."); "Borrar columna", con una sola columna ("Es la única columna."). Las tres de alinear se deshabilitan en una columna `p` ("Esta columna tiene ancho fijo: cambiala desde Ver código."); la que coincide con la alineación actual, también, sin ayuda.
- `preguntaAntesDe`: "¿Borrar esta fila? Tiene contenido." o "¿Borrar esta columna? Tiene contenido." si alguna de sus celdas no está vacía. Se pregunta con `preguntar`, opciones "Borrar" (`principal`) y "Cancelar" (`neutra`).
- `celdaTras`: `fila-arriba` y `columna-izquierda` → la misma celda (que ahora es la nueva); `fila-abajo` → la fila siguiente; `columna-derecha` → la columna siguiente; las demás → `null`.
- En `tabla.ts`: cada `td` de una tabla simple lleva un botón `button.cm-celda-menu` (`type="button"`, `aria-label="Opciones de la celda"`, `title="Filas y columnas"`, texto `⋯`), visible al pasar el cursor por la celda o con el foco adentro. Su `mousedown` hace `preventDefault`, para no sacar el foco del campo abierto. El clic en el botón y el clic derecho en la celda (`contextmenu`, con `preventDefault`) llaman `abrirMenuDeCelda`. El botón no se muestra con el editor en solo lectura.
- `abrirMenuDeCelda`: primero `confirmarCeldaAbierta()`; si da `false`, no abre. No abre si `vista.state.readOnly` o si `tablaEn` da `null`. El menú es un `div.menu-celda` con `role="menu"`, hijo de `document.body`, en posición fija bajo `ancla`; cada opción es un `button` con `role="menuitem"` (`disabled` y `title` con la ayuda cuando corresponde). El foco va a la primera opción habilitada. Se cierra con Escape, con un clic afuera, al elegir, y cuando la ventana pierde el foco o se desplaza.
- Al elegir: se pregunta si corresponde; se despacha `transaccionDeTabla(vista.state, desde, operacionDe(accion, celda))`; si `celdaTras` da una celda, se abre con `abrirCelda(vista, desde, celda, true)`.

Estilos:

```css
#editor .cm-celda-menu { position: absolute; top: 1px; right: 1px; padding: 0 4px; font: 12px/1.2 var(--interfaz); border-radius: 3px; opacity: 0; }
#editor .cm-tabla td:hover .cm-celda-menu, #editor .cm-tabla td:focus-within .cm-celda-menu { opacity: 1; }
#editor.solo-lectura .cm-celda-menu { display: none; }
.menu-celda { position: fixed; z-index: 30; display: flex; flex-direction: column; padding: 4px; background: var(--superficie); border: 1px solid var(--borde); border-radius: 6px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18); }
.menu-celda button { border: 0; text-align: left; padding: 4px 10px; }
```

- [ ] **Step 1: Escribir las pruebas que fallan:**

```ts
const R = String.raw;
const T = R`\begin{tabular}{lc}
  Sitio & Documentos \\
  Foro &  \\
\end{tabular}`;
const { interior, tabla } = tablaEn(T, 0)!;
const habilitadas = (t: TablaLeida, celda: Celda) => opcionesDeCelda(t, celda).filter((o) => o.habilitada).map((o) => o.accion);
const aplicar = (accion: AccionDeTabla, celda: Celda) => {
  const e = operacionDe(accion, celda)(T, interior)!;
  return [...e.cambios].sort((a, b) => b.desde - a.desde).reduce((t, c) => t.slice(0, c.desde) + c.insertar + t.slice(c.hasta), T);
};

it('las nueve opciones, en orden y con su texto', () => {
  expect(opcionesDeCelda(tabla, { fila: 0, columna: 0 }).map((o) => o.texto)).toEqual([
    'Insertar fila arriba', 'Insertar fila abajo', 'Insertar columna a la izquierda', 'Insertar columna a la derecha',
    'Borrar fila', 'Borrar columna', 'Alinear a la izquierda', 'Centrar', 'Alinear a la derecha',
  ]);
});
it('no ofrece la alineación que la columna ya tiene', () => {
  expect(habilitadas(tabla, { fila: 0, columna: 0 })).not.toContain('alinear-l');
  expect(habilitadas(tabla, { fila: 0, columna: 1 })).toEqual(expect.arrayContaining(['alinear-l', 'alinear-r']));
  expect(habilitadas(tabla, { fila: 0, columna: 1 })).not.toContain('alinear-c');
});
it('no deja borrar la única fila ni la única columna, ni alinear una columna de ancho fijo', () => {
  const unica = tablaEn(R`\begin{tabular}{p{3cm}} a \\\end{tabular}`, 0)!.tabla;
  const opciones = opcionesDeCelda(unica, { fila: 0, columna: 0 });
  expect(opciones.filter((o) => !o.habilitada).map((o) => [o.accion, o.ayuda])).toEqual([
    ['borrar-fila', 'Es la única fila.'], ['borrar-columna', 'Es la única columna.'],
    ['alinear-l', 'Esta columna tiene ancho fijo: cambiala desde Ver código.'],
    ['alinear-c', 'Esta columna tiene ancho fijo: cambiala desde Ver código.'],
    ['alinear-r', 'Esta columna tiene ancho fijo: cambiala desde Ver código.'],
  ]);
});
it('cada acción es su operación', () => {
  expect(aplicar('fila-abajo', { fila: 0, columna: 0 })).toBe(T.replace(`${R`Documentos \\`}\n`, () => `${R`Documentos \\`}\n${R`   &  \\`}\n`));
  expect(aplicar('borrar-fila', { fila: 1, columna: 0 })).toBe(T.replace(`${R`  Foro &  \\`}\n`, ''));
  expect(aplicar('columna-derecha', { fila: 0, columna: 1 })).toContain('{lcc}');
  expect(aplicar('borrar-columna', { fila: 0, columna: 1 })).toContain('{l}');
  expect(aplicar('alinear-r', { fila: 1, columna: 1 })).toContain('{lr}');
});
it('pregunta antes de borrar solo si hay contenido', () => {
  expect(preguntaAntesDe(T, tabla, 'borrar-fila', { fila: 0, columna: 0 })).toBe('¿Borrar esta fila? Tiene contenido.');
  expect(preguntaAntesDe(T, tabla, 'borrar-columna', { fila: 1, columna: 1 })).toBe('¿Borrar esta columna? Tiene contenido.');
  const vacia = R`\begin{tabular}{ll} a &  \\  &  \\ \end{tabular}`;
  const leida = tablaEn(vacia, 0)!.tabla;
  expect(preguntaAntesDe(vacia, leida, 'borrar-fila', { fila: 1, columna: 0 })).toBeNull();
  expect(preguntaAntesDe(vacia, leida, 'borrar-columna', { fila: 0, columna: 1 })).toBeNull();
  expect(preguntaAntesDe(T, tabla, 'fila-abajo', { fila: 0, columna: 0 })).toBeNull();
});
it.each([
  ['fila-arriba', { fila: 1, columna: 1 }], ['fila-abajo', { fila: 2, columna: 1 }], ['columna-izquierda', { fila: 1, columna: 1 }],
  ['columna-derecha', { fila: 1, columna: 2 }], ['borrar-fila', null], ['borrar-columna', null], ['alinear-c', null],
] as const)('después de %s queda abierta %j', (accion, esperada) => {
  expect(celdaTras(accion, { fila: 1, columna: 1 })).toEqual(esperada);
});
```

- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar `menuTabla.ts`, sumar el botón y el clic derecho en `tabla.ts`, y los estilos.**
- [ ] **Step 4: Correr y ver que pasan**, la suite rápida y `npx tsc --noEmit -p .`.
- [ ] **Step 5: Probar en el navegador:** el botón `⋯` aparece al pasar por una celda; cada una de las nueve opciones hace lo suyo y deja abierta la celda que corresponde; borrar una fila con contenido pregunta y "Cancelar" no cambia nada; el menú se cierra con Escape y con un clic afuera; con una celda abierta y a medio escribir, abrir el menú aplica primero lo escrito.
- [ ] **Step 6: Commit.** `git commit -m "Tablas: menú por celda para filas, columnas y alineación"`

### Task 8: Guía, comprobación manual y suite completa

**Files:**
- Modify: `editor/INSTALACION.md`

- [ ] **Step 1: Guía.** En la sección 5, después de **Figuras.**, sumar:

```markdown
**Tablas.** Una tabla se ve como tabla, con su epígrafe ("Tabla 2.1: …").

- Para insertar una: `/` → Tabla. Completá los campos y salí con las flechas:
  al sacar el cursor, queda dibujada.
- Para escribir en una celda, hacé clic sobre ella. `Tab` pasa a la celda
  siguiente, `Shift+Tab` a la anterior y `Enter` a la de abajo. `Escape`
  descarta lo que escribiste en esa celda.
- En cada celda, al pasar el cursor, aparece un botón `⋯` (también sirve el
  clic derecho): inserta o borra filas y columnas y cambia la alineación de
  la columna.
- En una celda podés usar negrita (`\textbf{…}`), fórmulas (`$k$`) y citas.
  Si escribís `&` o `%`, el editor los guarda como `\&` y `\%`, que es como
  los pide LaTeX.
- Si una celda se pone roja, lo que escribiste rompería la tabla (casi
  siempre, una llave o un `$` sin cerrar) y dice por qué. No se guarda hasta
  que lo corrijas o salgas con `Escape`.
- El epígrafe se escribe ahí mismo, como el de una figura.
- Una tabla con celdas combinadas (`\multicolumn`) se ve dibujada pero no se
  edita por celdas: un clic muestra su código. Una tabla armada de otra forma
  se ve como código, como siempre.
- *Ver código*, al pasar el cursor por la tabla, muestra su LaTeX.
```

  En la sección 6, el punto "Todavía no dibuja las tablas ni busca citas" pasa a: "**Todavía no busca citas.** Las citas se escriben con su clave." En el punto de la sección 5 que dice "Lo que el editor no sabe dibujar se ve como código", no cambia nada.

- [ ] **Step 2: Comprobación manual de la spec (sección 9), en el entorno de prueba.** `npm run entorno-prueba`, arrancar con `EDITOR_CONFIG=config.prueba.json` en 4327/4329, abrir `Bloques.tex`. Editar dos celdas, agregar una fila y una columna, borrar otra fila y otra columna, cambiar una alineación. Con `git diff` en el clon de prueba, comprobar línea por línea que solo cambió lo tocado. Compilar y comparar la tabla con el PDF. Insertar una tabla nueva con `/` → Tabla y editarla. Pegar en una celda `<img src=x onerror=alert(1)>` y comprobar que se ve como texto. Con el editor en solo lectura (durante un Traer), comprobar que las celdas no se abren.
- [ ] **Step 3: Suite completa.** `npx vitest run`, `npx tsc --noEmit -p .` y `npm run build`: todo en verde.
- [ ] **Step 4: Commit.** `git commit -m "Guía: tablas"`

---

## Al integrar

Esta entrega parte de `main`, que todavía no tiene la entrega 2 (citas). La que se integre segunda resuelve los cruces, que son chicos: la lista `BLOQUES` de `vista.ts`, el final de `estilos.css` y de `comandos.ts`, y los mismos párrafos de `INSTALACION.md` (el punto de la sección 6 desaparece cuando están las dos). Con las dos integradas, las citas dentro de una celda pasan a verse como autor y año: `decorarTablas` le pasa a `piezasDeCelda` el `textoDeCita` de `compartido/citas.ts` con `ctx.bibliografia`, y el widget suma a su `eq` ese texto ya resuelto, para redibujarse cuando se lee el `.bib`.
