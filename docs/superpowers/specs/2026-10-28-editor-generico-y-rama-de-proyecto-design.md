# Editor genérico y rama de proyecto

Fecha: 2026-10-28
Estado: diseño aprobado por Cristhian en conversación; falta revisar este documento.

## 1. Para qué

Cristhian va a compartir el editor con sus dos compañeros de tesis, que también
usan Claude, y quiere reutilizarlo en proyectos futuros. Hoy el código, la
configuración, el `CLAUDE.md` y la guía tienen partes que solo valen para esta
tesis, y parte de lo que sabe su Claude vive en su memoria personal.

Objetivo: que `main` sea una herramienta genérica, que lo propio de la tesis
viva en una rama que solo agrega archivos, y que la documentación explique cómo
conectar Claude con el repositorio de la aplicación y con Overleaf.

Éxito:

- En `main` no queda nada propio de la tesis en el código, la configuración ni
  la documentación.
- Un compañero que clona el repositorio y se pasa a la rama `tesis` tiene el
  editor con el mismo comportamiento que tiene hoy Cristhian, y su Claude
  recibe las mismas reglas.
- Traer `main` a `tesis` nunca genera conflictos.
- Con `main` y una rama nueva, otro proyecto se arma sin tocar código.

## 2. Tres capas

| Capa | Dónde | Qué tiene | Quién la ve |
|---|---|---|---|
| Herramienta | `main` | El editor, la configuración por defecto, la documentación genérica, el `CLAUDE.md` genérico | Todos los proyectos |
| Proyecto | Rama del proyecto (hoy `tesis`) | `proyecto/` y `.claude/` con lo propio del proyecto | El equipo del proyecto |
| Persona | Cada máquina, fuera de Git | `editor/config.json` y la memoria de Claude de cada uno | Solo esa persona |

## 3. Ramas

- `main` solo recibe merges de ramas `feature/…`, creadas desde `main`.
- La rama de un proyecto (hoy `tesis`) recibe `main` y nunca al revés.
- La rama de un proyecto solo **agrega** archivos que `main` no tiene: nunca
  modifica uno que exista en `main`. Por eso traer `main` no genera
  conflictos.
- Un arreglo al editor descubierto mientras se trabaja en `tesis` se hace en
  una `feature/…` desde `main` y llega a `tesis` cuando se trae `main`.
- El ícono del escritorio ejecuta la rama activa: el equipo usa `tesis`.

Estas reglas van al `CLAUDE.md` de `main` (sección 7).

## 4. La carpeta `proyecto/`

Vive en la raíz, al lado de `editor/`. En `main` no existe; la agrega la rama
del proyecto. Todos sus archivos son opcionales: si falta uno, el editor usa su
valor por defecto.

| Archivo | Qué es | Si falta |
|---|---|---|
| `config.json` | Configuración compartida por el equipo (sección 5) | Valores por defecto |
| `verificacion-codigo.md` | Reglas extra para la verificación contra el código (sección 6.2) | La prompt va sin reglas extra |
| `guia-estilo.md` | Guía de estilo que acompaña a los pedidos del botón **IA** | Guía inicial genérica (sección 6.3) |
| `correccion.json` | Diccionario y excepciones de autocorrección | Diccionario vacío |
| `LEEME.md` | Lo que un integrante nuevo necesita saber del proyecto (sección 8.4) | No lo usa el editor |

La guía y el diccionario hoy viven en `editor/`. Pasan a `proyecto/` porque son
del equipo: cuando alguien agrega una palabra o edita la guía, el cambio se
comparte con un commit en la rama del proyecto. Si `proyecto/` no existe, el
editor la crea al guardar la primera palabra o la guía.

## 5. Configuración en capas

Cada clave se resuelve en este orden; gana la última que la define:

1. Los valores por defecto del código.
2. `proyecto/config.json`, compartido por el equipo.
3. `editor/config.json`, personal (o el archivo de `EDITOR_CONFIG`, como hoy).

Reglas:

- Cualquier clave puede ir en cualquiera de los dos archivos, salvo `proyecto` y
  `puerto`, que solo van en la personal (el lanzador lee el puerto de ahí; se
  agregó en la revisión final). La guía
  recomienda poner en `proyecto/config.json` lo del proyecto (`principal`,
  `repositorio`, `ramaRepositorio`, `limiteVerificacion`, `glosario`,
  `marcoTeorico`) y en `editor/config.json` lo de la máquina (`puerto`,
  `puertoCorrector`, `agente`, `corrector`, `compilarAlGuardar`).
- Una ruta relativa se resuelve desde la carpeta del archivo que la define. En
  `proyecto/config.json`, `"repositorio": "../../uy-social-topic-modeling"` es
  la carpeta hermana de `Tesis`.
- `limiteVerificacion` se combina por campo, como hoy: se puede definir
  `capitulo` en una capa y `todo` en otra.
- Clave nueva solo personal: `proyecto`, la carpeta del proyecto, por defecto
  `../proyecto` desde `editor/`. Sirve para las pruebas y para quien quiera
  ubicarla en otro lado. Si aparece en `proyecto/config.json`, es un error.
- Claves nuevas del proyecto:
  - `glosario`: título del capítulo que es el glosario. Por defecto
    `"Glosario"`. Se compara sin mayúsculas ni tildes. `null` lo desactiva.
  - `marcoTeorico`: lista de palabras; es marco teórico el primer capítulo
    cuyo título contiene alguna. Por defecto `["antecedentes", "marco
    teórico"]`. Se compara sin mayúsculas ni tildes. `null` lo desactiva.
- Los defaults reproducen el comportamiento de hoy: la tesis no necesita
  definir `glosario` ni `marcoTeorico`.
- Un `proyecto/config.json` que no es JSON válido, o una clave con un valor
  inválido, frena el arranque con un mensaje que nombra el archivo y la clave,
  como hoy con `editor/config.json`.
- `editor/config.json` deja de versionarse y entra al `.gitignore`. Se versiona
  `editor/config.ejemplo.json` con las claves personales comentadas en la guía.
- El lanzador (`abrir.ps1`) sigue leyendo el puerto solo de `editor/config.json`
  o de `EDITOR_CONFIG`: el puerto es de la máquina.

## 6. Cambios en el código

### 6.1 Configuración y detección de capítulos

- `servidor/config.ts`: carga las tres capas, resuelve rutas por archivo y
  valida `proyecto`, `glosario` y `marcoTeorico`. `Config` gana `proyecto`,
  `glosario` y `marcoTeorico`.
- `servidor/proyecto.ts`: `rutaDelGlosario` y `rutaDelMarcoTeorico` reciben el
  título y las palabras de la configuración en vez de tenerlos escritos. Los
  comentarios dejan de nombrar archivos de la tesis.
- `servidor/index.ts`: el diccionario y la guía se leen y guardan en
  `config.proyecto`.

### 6.2 Prompts de verificación

- La sección del glosario en `compartido/promptVerificacion.ts` queda genérica:
  - Explicá con los términos del glosario y usalos para relacionar los nombres
    del código con los del informe.
  - Si una definición del glosario describe la aplicación y el código la
    contradice, es "contradiccion" y se cita la definición.
  - Si un término es central en el código y no está en el glosario, es
    "no-lo-cuenta" (igual que hoy).
- Sale de la prompt y pasa a `proyecto/verificacion-codigo.md` de `tesis`: el
  ejemplo de `processing_orchestrator`, qué secciones del glosario describen la
  aplicación (Programación) y cuáles son conceptos generales (IA, Texto), y la
  excepción de los modelos de tópicos.
- Si `proyecto/verificacion-codigo.md` existe y no está vacío, su texto entra a
  la prompt contra el código como `## Reglas de este proyecto`, después del
  glosario y antes de los ignorados. Se lee al empezar cada corrida, así que un
  cambio no necesita reiniciar el editor.
- Con más de 20 000 caracteres, la corrida no arranca y el panel dice que
  `proyecto/verificacion-codigo.md` es demasiado largo.
- La verificación contra el informe no gana reglas de proyecto: hoy no hay nada
  propio de la tesis en esa prompt.
- Las dos prompts dejan de decir "proyecto de grado": dicen "el informe".

### 6.3 Pedidos del botón IA

- `PRESENTACION` en `compartido/prompt.ts` deja de nombrar la carrera: queda en
  que el informe se escribe en LaTeX y en español. De qué trata el informe lo
  cuenta la guía de estilo.
- `GUIA_INICIAL` pasa a ser genérica: una sección "De qué trata" que pide
  completarla, y las reglas de voz, tiempos verbales, siglas y términos en
  inglés que valen para cualquier informe académico en español. Los términos de
  la tesis (tópico, PLN, LDA, BERTopic, BTM) y la descripción de la tesis van a
  `proyecto/guia-estilo.md` de `tesis`, con el texto completo de la guía
  inicial de hoy.

### 6.4 Guardia

Una prueba nueva recorre los archivos de `cliente/`, `servidor/` y
`compartido/`, sin las pruebas, y falla si alguno contiene una palabra propia
de la tesis: `uy-social`, `processing_orchestrator`, `tópico`, `UdelaR`,
`proyecto de grado`, `Cristhian`. Las fixtures de `pruebas/` quedan afuera: son
datos de prueba.

## 7. Claude

### `CLAUDE.md` de `main` (genérico)

Reemplaza al actual. Mantiene lo que vale para cualquier proyecto: qué es el
editor, las carpetas, cómo trabajar en el editor (worktrees, puertos de prueba,
entorno de prueba, suite) y las particularidades de Windows. Agrega:

- las reglas de ramas de la sección 3;
- que lo propio de un proyecto va en `proyecto/` y `.claude/` de su rama, nunca
  en el código ni en un archivo que exista en `main`;
- reglas genéricas sobre `informe/`: un push publica en el documento
  compartido, se confirma antes de cualquier commit, push o edición; nunca
  usar, pedir ni repetir tokens de Overleaf; código y salidas fuera de
  `informe/`.

Saca lo personal: "Proyecto de grado de Cristhian" y "mensajes cortos sobre qué
tiene que hacer él".

### `.claude/` de `tesis`

- `.claude/rules/tesis.md`: el informe se comparte con dos compañeros y dos
  supervisores; no modificar `prgrado.cls` (los paquetes van en `main.tex`);
  dónde está el repositorio de la aplicación; la biblioteca de Zotero del grupo
  y cómo redactar en el informe (guía de estilo, citas solo del `.bib` con
  `[FALTA: …]`, CRLF), que hoy viven en la memoria de Cristhian.
- `.claude/settings.json`: suma el repositorio de la aplicación como carpeta
  adicional, para que una sesión abierta en `Tesis` pueda leerlo sin pasos
  extra.

Dos cosas a confirmar al implementar, antes de escribir esos archivos: que la
versión de Claude Code en uso carga `.claude/rules/` sola, y que
`additionalDirectories` acepta una ruta relativa. Si alguna no se cumple, el
plan dice la alternativa (por ejemplo, un `@import` desde un archivo nuevo, o
una indicación en la guía para sumar la carpeta a mano).

### Lo personal

Las preferencias de Cristhian ("mensajes cortos y concretos") pasan a su
memoria de Claude, que ya es personal. Cuando `.claude/rules/tesis.md` exista,
sus dos memorias sobre Zotero y redacción quedan duplicadas: se borran con su
OK.

## 8. Documentación

### 8.1 `README.md` de la raíz (nuevo, `main`)

Qué es el editor, en un párrafo; cómo están organizadas las ramas; a dónde ir
para instalarlo (`editor/INSTALACION.md`), para conectar Claude
(`editor/GUIA-CLAUDE.md`) y para armar un proyecto nuevo: crear la rama desde
`main` y agregar `proyecto/` y `.claude/`, con la lista de archivos de la
sección 4.

### 8.2 `editor/INSTALACION.md` (genérica)

- Sin rutas, URLs ni nombres de la tesis. Donde hoy dice
  `uy-social-topic-modeling`, dice "el repositorio de la aplicación"; la URL de
  GitHub pasa a `<url-del-repositorio>`.
- Un paso nuevo después de clonar: pasarse a la rama del proyecto.
- La sección 6 deja la preparación de Claude en `GUIA-CLAUDE.md` y explica el
  glosario de forma genérica, con un párrafo sobre
  `proyecto/verificacion-codigo.md`.
- La sección 8 explica las capas y suma `proyecto`, `glosario` y
  `marcoTeorico` a la tabla.
- La sección 12 explica que la guía y el diccionario viajan con commits en la
  rama del proyecto, y que la configuración personal no viaja.

### 8.3 `editor/GUIA-CLAUDE.md` (nueva, `main`)

1. **Dos formas de usar Claude con el informe**: los botones de verificación
   del editor y una sesión propia de Claude Code abierta en la carpeta del
   proyecto.
2. **Instalar y entrar**: el CLI, la extensión de VS Code o la app de
   escritorio, y la clave `agente` para usar el `claude.exe` de la extensión.
3. **Dónde poner cada carpeta**: el proyecto (`editor/`, `proyecto/`,
   `informe/`) y, al lado, el repositorio de la aplicación; qué ruta va en
   `repositorio`.
4. **Abrir una sesión**: en la carpeta del proyecto; qué lee Claude solo
   (`CLAUDE.md`, `.claude/rules/`, `.claude/settings.json`) y cómo sumar a
   mano el repositorio de la aplicación si no está configurado.
5. **Comparar contra el código**: el botón (y lo que lee el agente) o un pedido
   en la sesión, con ejemplos.
6. **Comparar contra Overleaf**: `informe/` es un clon; **Traer** antes de
   pedirle algo; Claude puede leer el historial y las diferencias de
   `informe/`, pero nunca hace commit ni push sin que lo confirmes.
7. **Lo que no se hace**: pegar tokens de Overleaf, dejar que Claude haga push.
8. **Costo y privacidad**: lo que se lee viaja a Claude con tu cuenta; el
   costo de referencia de una verificación.

### 8.4 `proyecto/LEEME.md` (`tesis`)

Los datos propios de la tesis: el proyecto de Overleaf, el repositorio de la
aplicación y dónde clonarlo, el grupo de Zotero, los capítulos que son glosario
y marco teórico, y qué dicen las reglas de `verificacion-codigo.md`. Sin
tokens ni contraseñas.

## 9. Migración

1. **Rama `feature/editor-generico`** desde `main`, en un worktree: todo lo de
   las secciones 5 a 8 que va en `main`. Saca `editor/config.json` y
   `editor/correccion.json` del control de Git y agrega `editor/config.json` al
   `.gitignore`.
2. **Rama `tesis`** desde la punta de esa feature: un solo commit que agrega
   `proyecto/` y `.claude/`. El diccionario se copia de `editor/correccion.json`
   al final, para no perder palabras agregadas mientras tanto.
3. **Cristhian**, en la carpeta `Tesis`: merge de la feature a `main`, cambio a
   la rama `tesis`, `npm run build` en `editor/` y reinicio del editor. Al
   integrar, Git borra `editor/config.json` y `editor/correccion.json` de la
   carpeta: no se pierde nada, porque su contenido ya está en `proyecto/` de
   `tesis`. Si para entonces el `editor/config.json` local tiene algo más que
   lo de hoy, se respalda antes.
4. **Cristhian**: push de `main` y `tesis`, y agregar a sus compañeros como
   colaboradores del repositorio de GitHub.

## 10. Pruebas

- `config`: orden de las capas; rutas relativas a cada archivo; `proyecto`
  solo personal; `glosario` y `marcoTeorico` (valores, `null`, inválidos);
  carpeta `proyecto/` inexistente; `proyecto/config.json` inválido.
- `proyecto`: glosario y marco teórico con títulos configurados, sin tildes ni
  mayúsculas, y desactivados.
- Prompts: la genérica no tiene nada de la tesis; las reglas del proyecto
  entran en su lugar cuando el archivo existe; no entran si falta o está
  vacío; más de 20 000 caracteres frena la corrida con su mensaje.
- Guía y diccionario: se leen y guardan en `proyecto/`; la guía inicial es la
  genérica; `proyecto/` se crea al guardar.
- La guardia de la sección 6.4.
- La suite completa en el worktree, con `"corrector": false`.
- A mano, en el entorno de prueba (puertos 4327 y 4329): el editor arranca sin
  `proyecto/`; con el `proyecto/` de la tesis, una verificación contra el
  código lleva las reglas del proyecto en la prompt.

## 11. Fuera de alcance

- Convertir el repositorio en plantilla de GitHub.
- Traducir el editor a otro idioma: sigue en español.
- Usar varios proyectos a la vez desde un mismo editor.
- Cambiar las fixtures de `pruebas/` o las specs y los planes anteriores de
  `docs/`.
- Reglas de proyecto para la verificación contra el informe.
