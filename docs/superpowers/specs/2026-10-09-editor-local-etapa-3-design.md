# Editor local del informe, etapa 3: prompts para IA

Fecha: 2026-10-09
Estado: diseño aprobado por Cristhian en conversación.
Continúa `2026-10-05-editor-local-informe-design.md` y reemplaza su sección 8.

## 1. Qué cambia respecto del diseño original

La sección 8 preveía que el servidor invocara el CLI de Claude Code y que el
editor mostrara la propuesta con una comparación palabra por palabra. Cristhian
pidió algo más simple: que el editor le deje una prompt armada y él se la pase
al modelo que quiera.

Entonces, en esta etapa:

- El editor **no llama a ninguna IA** ni recibe su respuesta.
- Arma una prompt y la copia al portapapeles. Cristhian la pega en un chat.
- Lo que el modelo devuelve lo pega él en el editor, como cualquier texto.

Sigue valiendo el invariante de fidelidad: ninguna acción de esta etapa escribe
en `informe/`.

## 2. Qué agrega

Un botón **IA ▾** en la barra, al lado de **Insertar ▾**, con cuatro opciones:

| Opción | Actúa sobre | Qué pide la prompt |
|---|---|---|
| Desarrollar notas | La selección | Convertir apuntes sueltos en prosa académica |
| Revisar estilo | La selección | Mejorar la redacción sin cambiar el contenido |
| Revisar consistencia | El archivo abierto entero | Una lista de problemas; no reescribe |
| Guía de estilo… | — | Abre la guía para editarla |

Las dos primeras están deshabilitadas, con su explicación, si no hay texto
seleccionado. Al elegir una acción la prompt queda copiada y la barra avisa
cuántas palabras tiene. La prompt no se muestra antes de copiar.

Para la vuelta no hay nada nuevo: la selección sigue marcada, así que pegar la
reemplaza, y `Ctrl+Z` lo deshace.

## 3. Qué lleva una prompt

En este orden:

1. **Tarea**, según la acción.
2. **Dónde va el texto**: los títulos que contienen el comienzo de la selección
   (capítulo, sección, subsección), con su número. En "Revisar consistencia",
   el capítulo.
3. **Guía de estilo**, completa. Incluye de qué trata el informe: por eso la
   prompt no necesita leer `main.tex`. Sus títulos se bajan dos niveles, para
   que no se confundan con los apartados de la prompt.
4. **Reglas**, fijas por acción.
5. **El texto**, entre dos líneas delimitadoras, tal cual está en el archivo.

Reglas de "Desarrollar notas" y "Revisar estilo":

- No inventar datos, cifras, resultados ni citas. Donde falte algo, escribir
  `[FALTA: qué falta]` en ese lugar.
- Conservar tal cual los comandos que ya están (`\cite`, `\ref`, `\label`,
  fórmulas, entornos). No agregar `\cite` ni `\ref` nuevos: el modelo no conoce
  las claves.
- No agregar títulos, paquetes ni comandos nuevos.
- Devolver el resultado en **un único bloque de código** con solo el LaTeX. Un
  chat dibuja lo que no está en un bloque de código, y al copiarlo se pierden
  barras y fórmulas.

"Revisar estilo" pide además, después del bloque, una lista corta de los
cambios que no sean triviales. "Revisar consistencia" pide solo una lista: cita
breve del lugar, qué pasa y cómo arreglarlo.

## 4. Guía de estilo

Archivo `editor/guia-estilo.md`, fuera de Git y fuera de `informe/`, como
`correccion.json`. Mientras no exista, vale un texto inicial que viene con el
editor: de qué trata el informe, primera persona del plural, tiempos verbales y
términos preferidos. Cristhian lo corrige desde "Guía de estilo…", que abre un
cuadro de texto con Guardar y Cancelar. Guardar la guía vacía vuelve al texto
inicial.

## 5. Unidades

**`compartido/prompt.ts`** — `armarPrompt({ accion, ubicacion, guia, texto })`
devuelve la prompt. Función pura; acá viven los textos de tarea y de reglas.
`GUIA_INICIAL` es el texto inicial de la guía.

**`servidor/guia.ts`** — `crearGuia(archivo)`: `leer()` devuelve el archivo o,
si no existe o está vacío, `GUIA_INICIAL`; `guardar(texto)` escribe a un
temporal y lo renombra. Rechaza lo que no sea texto o pase de 20 000
caracteres.

**`servidor/app.ts`** — `GET /api/ia/guia` → `{ texto }`;
`PUT /api/ia/guia` con `{ texto }` → `{}`, o 400 con su mensaje.

**`cliente/ia.ts`** — sin pantalla, para poder probarlo:
`ubicacionDe(titulos, posicion)` da la cadena de títulos que contiene una
posición; `prepararPrompt(...)` decide sobre qué texto actúa cada acción y
devuelve la prompt y su cantidad de palabras, o el motivo por el que no se
puede.

**`cliente/pantalla/editorDeGuia.ts`** — el cuadro de texto de la guía.

**`cliente/main.ts`** — el botón, que usa el menú flotante que ya existe.

## 6. Errores

- No se pudo leer la guía, o el navegador no dejó copiar: aviso de error en la
  barra; no se copia nada a medias.
- No se pudo guardar la guía: el cuadro queda abierto con lo escrito y muestra
  el motivo.
- Archivo que no es `.tex` (las referencias): el botón queda deshabilitado, como
  el resto de los controles de formato.

## 7. Pruebas

- `prompt.test.ts`: cada acción lleva su tarea, la ubicación, la guía y el texto
  sin tocar; las reglas de `[FALTA: …]` y del bloque de código están donde
  corresponde.
- `guia.test.ts`: sin archivo devuelve el texto inicial y no lo crea; guarda y
  relee; vacío vuelve al inicial; rechaza lo inválido.
- `app.test.ts`: las dos rutas.
- `ia.test.ts`: ubicación con títulos anidados; acciones sin selección; el texto
  de cada acción.
- En el navegador, contra el entorno de prueba: copiar cada prompt y leer el
  portapapeles; editar la guía y ver que la prompt siguiente la trae.

## 8. Fuera de alcance

Llamar a una IA, recibir o comparar su respuesta, pedido libre, generación de
tablas o ecuaciones, y una guía de estilo distinta por capítulo.
