# Editor local del informe, etapa 6: verificación contra el informe

Fecha: 2026-10-27
Estado: diseño aprobado por Cristhian en conversación; falta revisar este documento.
Continúa `2026-10-18-editor-local-etapa-5-design.md`.

## 1. Para qué

La etapa 5 compara el informe con el código. Esta etapa agrega una segunda
verificación que compara el informe consigo mismo:

- que cada capítulo siga el hilo de lo anterior (no dé por sabido algo que no
  se presentó, no salte sin conexión, no repita);
- que las partes del informe no se contradigan entre sí;
- que los términos se usen como los definen el Glosario y el marco teórico
  (hoy, el capítulo «Revisión de antecedentes»).

Sigue valiendo el invariante de fidelidad: nada de esta etapa escribe en
`informe/` ni en el repositorio de la aplicación.

## 2. Qué cambia en la pantalla

### Barra

El botón **Verificación ▾** se reemplaza por dos:

| Botón | Opciones | Necesita |
|---|---|---|
| **Contra código ▾** | Verificar capítulo · Verificar todo | `repositorio` en la configuración (como hoy) |
| **Contra informe ▾** | Verificar capítulo · Verificar todo | Nada más que el informe |

Hay una sola corrida a la vez, de cualquiera de los dos tipos. Mientras corre,
los dos botones quedan deshabilitados con su explicación; el botón de la que
corre muestra "Verificando… m:ss" y aparece **Cancelar**, como hoy. "Verificar
todo" avisa antes que tarda bastante más, en los dos.

### Panel lateral

La pestaña **Verificación** se reemplaza por dos: **Código (n)** e
**Informe (n)**, al lado de PDF y Gramática. Cada una muestra la última corrida
de su tipo, con lo mismo que hoy: encabezado, comparación con la anterior,
descartados, Marcar resuelto, Ignorar y su propia lista "Ver ignorados".
Correr una no cambia lo que muestra la otra.

### Viñetas de la pestaña Informe

En este orden, cada una con su color (distinto de los de Código y de Gramática):

| Tipo | Nombre en pantalla | Qué es | Citas |
|---|---|---|---|
| `se-contradice` | Se contradice | Dos partes del informe dicen cosas incompatibles | La del capítulo revisado y la del otro lugar |
| `definicion-distinta` | Definición distinta | Un término se usa con otro sentido del que le dan el Glosario o el marco teórico | El uso y la definición |
| `corta-el-hilo` | Corta el hilo | Da por sabido algo que no se presentó antes, salta sin conexión o repite lo ya dicho | El lugar y, si corresponde, el pasaje anterior |
| `sin-definir` | Sin definir | Un término o concepto central que no está en el Glosario ni en el marco teórico | Donde se usa |
| `sugerencia` | Sugerencia | Las de `npm run sugerencias` (etapa 5), que son de redacción | Como hoy |

Un hallazgo con dos citas las muestra a las dos. Clic en la primera abre su
archivo y salta a ella; clic en la segunda ("ver en Cap0 - Glosario.tex") abre
ese archivo y salta a la segunda. Las dos se subrayan con el color de la
verificación cuando su archivo está abierto. Si una cita ya no está en el
texto, ese lado dice "la frase cambió".

La pestaña Código queda como hoy, con Contradicción, Sin respaldo en el código
y El informe no lo cuenta. Las sugerencias dejan de aparecer ahí.

## 3. Alcance de una corrida contra el informe

- **Capítulo:** se revisa el archivo abierto y los que incluye con
  `\input`/`\include`, como en la etapa 5. El agente tiene todo el informe a la
  vista como contexto, pero solo reporta problemas cuya cita principal está en
  los archivos revisados.
- **Todo:** se revisan todos los capítulos, incluidos el Glosario y el marco
  teórico (así se detecta, por ejemplo, un término definido distinto en uno y
  otro).
- **"Antes"** es el orden en que `main.tex` incluye los capítulos. "Corta el
  hilo" solo mira hacia atrás; "Se contradice" puede citar cualquier capítulo.
- **Secciones que son solo notas `%`:** no se revisan, y lo que sus notas
  anuncian cuenta como ya presentado. Así "Corta el hilo" no salta por algo que
  el equipo planeó contar en una sección todavía sin escribir.

## 4. Glosario y marco teórico

- **Glosario:** el capítulo titulado exactamente "Glosario", como en la
  etapa 5 (`rutaDelGlosario`).
- **Marco teórico:** el primer capítulo cuyo título contiene "antecedentes" o
  "marco teórico", sin importar mayúsculas ni tildes. Hoy es
  `Cap2 - Antecedentes.tex` ("Revisión de antecedentes").
- Si falta alguno, la prompt no lo nombra y "Definición distinta" y "Sin
  definir" se apoyan en el que haya. Si faltan los dos, esos dos tipos no se
  piden; el panel no muestra ningún aviso por eso.

## 5. Una corrida contra el informe, paso a paso

Igual que la etapa 5, salvo:

1. **Foto del informe:** se copian todos los capítulos del proyecto (sin el
   `.bib`) a `<carpeta temporal>/informe/`, no solo los revisados.
2. **Sin foto del repositorio:** no hay worktree ni rama ni commit.
3. **Prompt:** la de la sección 6.
4. **Agente:** el mismo lanzador, con la carpeta temporal como carpeta de
   trabajo y las herramientas `Read`, `Grep` y `Glob`.
5. **Límite:** el mismo `limiteVerificacion` (`capitulo` o `todo`).
6. **Validación, guardado y limpieza:** como en la etapa 5, con las reglas de
   la sección 8.

La corrida contra el código no cambia, salvo que guarda `contra: "codigo"`.

## 6. Qué lleva la prompt contra el informe

1. **Tarea:** revisar la coherencia interna del informe y devolver solo
   hallazgos con evidencia citada.
2. **Orden de los capítulos:** la lista en el orden de `main.tex`.
3. **Archivos a revisar:** la lista del alcance.
4. **Referencias:** qué archivo es el Glosario y cuál el marco teórico.
5. **Qué debería contar cada sección:** las notas `%` de cada título de todos
   los capítulos (no solo los revisados), con la regla de la sección 3 sobre
   las secciones que son solo notas.
6. **Ya ignorados:** los ignorados de tipos de Informe (sin las sugerencias)
   cuyo archivo está entre los revisados.
7. **Reglas:**
   - Citar textualmente las dos citas, tal como están en el archivo, con sus
     comandos LaTeX.
   - La cita principal tiene que estar en un archivo revisado.
   - No reclamar lo que es esperable de un borrador (secciones vacías, notas
     `%`, `\todo`), ni cuestiones de redacción o estilo: eso es de Gramática y
     de las sugerencias.
   - No proponer texto nuevo: solo decir qué pasa.
   - Explicación en español, en una o dos oraciones.
   - Devolver únicamente un arreglo JSON, sin texto alrededor; `[]` si no hay
     nada.

## 7. Formato de un hallazgo

Se agrega a `Hallazgo` un campo opcional `referencia`: el otro lugar del
informe.

```json
{
  "tipo": "definicion-distinta",
  "informe":    { "archivo": "Cap3_2 - Como.tex",   "linea": 120, "cita": "frase del capítulo" },
  "referencia": { "archivo": "Cap0 - Glosario.tex", "linea": 40,  "cita": "la definición" },
  "explicacion": "El glosario define X como …; acá se usa como …"
}
```

| Tipo | `informe.cita` | `referencia` |
|---|---|---|
| `se-contradice` | obligatoria | obligatoria |
| `definicion-distinta` | obligatoria | obligatoria |
| `corta-el-hilo` | obligatoria | opcional |
| `sin-definir` | obligatoria | no va (si viene, se descarta el hallazgo) |

En los hallazgos de Informe, `repo` es `null`; en los de Código, `referencia`
no está.

El `id` sigue siendo el hash de tipo + archivo del informe + cita normalizada +
otro archivo, donde "otro archivo" es el del repositorio en Código y el de
`referencia` en Informe (vacío si no hay). Los ids de las corridas de Código ya
guardadas no cambian.

### La corrida

`Corrida` agrega `contra: 'codigo' | 'informe'`.

- Al leer, una corrida sin `contra` es `'codigo'`, salvo que tenga `autor`
  (sugerencias), que es `'informe'`. `npm run sugerencias` guarda desde ahora
  `contra: 'informe'`.
- En las de Informe, `rama` y `commit` son `null`; el encabezado muestra
  "capítulo · contra el informe" o "todo el informe · contra el informe", la
  duración y el costo.
- Nombre del archivo: `<AAAA-MM-DD-HHmm>-informe.json` (con el mismo sufijo
  `-2`, `-3` dentro del minuto).
- La comparación con la anterior es contra la última corrida `ok` del mismo
  `contra`, alcance, archivos y autor.

### Ignorados

`ignorados.json` sigue siendo uno. `Ignorado` agrega `archivoReferencia`
(null si no hay). Cada pestaña muestra los ignorados de sus tipos; las
sugerencias van con Informe.

## 8. Validación

Un hallazgo de Informe se descarta si:

- el tipo no es uno de los cuatro de la sección 7 (en particular, si es uno de
  Código o `sugerencia`);
- la cita principal no aparece normalizada en un archivo **revisado**;
- falta `referencia` donde es obligatoria, o viene en `sin-definir`;
- la cita de `referencia` no aparece normalizada en algún archivo de la foto;
- la `referencia` es la misma frase en el mismo lugar que la cita principal.

Al revés, la corrida contra el código descarta cualquier tipo de Informe. Los
descartados se cuentan como hoy. Hallazgos repetidos (mismo `id`) se fusionan
como hoy.

## 9. Estado y rutas del servidor

- `EstadoVerificacion`:
  - `deshabilitada` pasa a ser por tipo: Código puede estar deshabilitada (sin
    `repositorio`) y Informe no. El estado lleva
    `motivos: { codigo: string | null; informe: string | null }` en lugar de un
    único `motivo`.
  - `en-curso` agrega `contra`.
  - El error de la última corrida fallida dice de qué `contra` fue.
- `POST /api/verificacion` recibe `{ contra, alcance, ruta }`. Sin `contra`,
  responde 400.
- `GET /api/verificacion` devuelve `{ estado, corridas: { codigo, informe },
  ignorados }`.
- Resuelto e ignorar buscan el `id` en la última corrida de cada tipo.

## 10. Errores que el panel explica

Los mismos de la etapa 5, en la pestaña del tipo que falló. Uno nuevo:

| Situación | Mensaje |
|---|---|
| El informe no tiene capítulos que revisar | "El informe no tiene capítulos para verificar." |

"La rama no existe" y la falta de `repositorio` solo afectan a Código.

## 11. Dónde vive cada cosa

- `compartido/verificacion.ts`: tipos nuevos, `referencia`, `contra`, tipos
  por verificación, validación de los dos lados del informe, `id`, lectura de
  corridas viejas.
- `compartido/promptVerificacionInforme.ts`: la prompt de la sección 6. La de
  Código queda en `promptVerificacion.ts`; `notasPorSeccion` se comparte.
- `servidor/proyecto.ts`: `rutaDelMarcoTeorico`.
- `servidor/verificador.ts`: `iniciar(contra, alcance, ruta)`; la corrida de
  Informe no pide la foto del repositorio y fotografía todo el informe. El
  resto (límite, cancelación, guardado, limpieza) es el mismo código.
- `servidor/verificaciones.ts`: `ultima(contra)`, nombre de archivo de Informe,
  comparación por `contra`, `archivoReferencia` en ignorados.
- `servidor/sugerencias.ts`: guarda `contra: 'informe'`.
- `servidor/app.ts`: rutas de la sección 9.
- `cliente/verificacion.ts`: nombres y orden de tipos por pestaña, ubicación
  de las dos citas, opciones de cada botón, encabezado sin rama.
- `cliente/pantalla/panelVerificacion.ts`: un panel por tipo (la misma función
  creada dos veces) y el hallazgo con dos citas.
- `cliente/main.ts`: los dos botones y las dos pestañas.
- `cliente/estilos.css`: colores de las cuatro viñetas nuevas.
- `editor/INSTALACION.md`: la guía explica las dos verificaciones.

## 12. Pruebas

En `npm test`, sin CLI ni tokens, con el lanzador falso de la etapa 5.

- Validación de cada tipo de Informe: con y sin `referencia`; `referencia` en
  `sin-definir`; cita principal en un archivo no revisado; cita de
  `referencia` inventada; tipo de Código en una corrida de Informe y al revés.
- `id`: los de Código no cambian; los de Informe dependen del archivo de
  `referencia`.
- Corridas viejas sin `contra`, con y sin `autor`.
- `ultima(contra)`, comparación solo dentro del mismo `contra`, nombre
  `-informe.json`.
- Una sola corrida a la vez entre los dos tipos.
- La corrida de Informe funciona sin `repositorio` y no crea worktree; la foto
  tiene todos los capítulos.
- Prompt: orden de capítulos de `main.tex`, Glosario y marco teórico (y sin
  ellos), notas de todos los capítulos, ignorados filtrados.
- `rutaDelMarcoTeorico`: "Revisión de antecedentes", "Marco Teórico", sin
  ninguno.
- Cliente: agrupación y orden por pestaña, ubicación de las dos citas, "la
  frase cambió" en un lado solo, opciones de los dos botones según el estado.

Prueba manual: una corrida real de "Contra informe → Verificar capítulo" sobre
un capítulo corto (por ejemplo `Cap3_1 - Por.tex`), revisando a mano que las
dos citas existan y que los hallazgos tengan sentido.

## 13. Fuera de alcance

- Dos corridas a la vez.
- Verificar contra el informe tomando también el código (las dos cosas en una
  corrida).
- Proponer o escribir texto para el informe a partir de un hallazgo.
- Elegir a mano qué capítulo es el marco teórico desde la pantalla.
