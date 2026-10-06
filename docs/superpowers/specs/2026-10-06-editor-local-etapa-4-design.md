# Editor local del informe, etapa 4: bloques visuales

Fecha: 2026-10-06
Estado: diseño aprobado por Cristhian en conversación, pendiente de revisión escrita.
Continúa `2026-10-05-editor-local-informe-design.md` (sección 9). Se construye
antes que la etapa 3 (IA), por decisión de Cristhian.

## 1. Propósito

Hoy el editor dibuja títulos, formato, listas, referencias y citas; todo lo
demás se ve como código LaTeX. Esta etapa hace que Cristhian pueda escribir y
leer ecuaciones, figuras, tablas y citas sin leer ese código, y que citar un
paper de su Zotero sea un solo paso.

Qué pidió, en sus palabras o por elección entre opciones:

- Va a usar seguido citas, figuras, tablas y ecuaciones. Bloques de código, poco.
- Tablas: escribir directo en las celdas, con botones para filas y columnas.
- Figuras: elegir entre las de `figs/` o elegir/arrastrar un archivo de la compu.
- Ecuaciones: escribir LaTeX con vista previa en vivo y aviso de error.
- Citas: buscar en `referencias.bib` y en su Zotero; pegar BibTeX como respaldo.

Éxito: Cristhian escribe una sección con una ecuación, una figura, una tabla y
tres citas sin abrir Overleaf ni VS Code; al Enviar, sus compañeros ven en el
historial solo lo que él agregó.

## 2. Hechos verificados (2026-10-06)

- El informe todavía no tiene ninguna ecuación, figura, tabla, bloque de código
  ni cita real. No hay contenido del equipo que condicione el diseño; los casos
  de prueba se escriben a mano en los fixtures.
- `prgrado.cls` carga `graphicx` y `apacite`. No carga `amsmath`, `booktabs` ni
  `listings`: las plantillas del menú "/" ya piden permiso para agregarlos.
- Las imágenes se referencian con la carpeta incluida (`figs/archivo.png`); no
  hay `\graphicspath`.
- `git.traer` hace `git add -A`: un archivo nuevo en `figs/` viaja a Overleaf
  con el próximo Enviar, sin cambios en la sincronización.
- `prosa.ts` ya trata matemática, `tabular` y entornos literales como no
  prosa, y el argumento de `\caption` como prosa. El corrector no cambia.
- `vista.ts` construye las decoraciones desde un `StateField`, que es lo que
  CodeMirror exige para decoraciones de bloque.
- KaTeX 0.19.0 (MIT, 4 MB) está en npm. Se empaqueta con Vite, con sus fuentes:
  funciona sin conexión.
- Zotero 9.0.6 está instalado, sin complementos. **No verificado:** durante el
  diseño Zotero no estuvo abierto en esta máquina, así que no se pudo probar su
  API local (puerto 23119). Ver 6.5.

## 3. Decisión central

Los bloques se dibujan en el lugar, con el mismo mecanismo que hoy usan los
títulos: decoraciones sobre el texto literal del `.tex`. Se descartó editar con
formularios que reescriben el bloque entero, porque cambiarían espacios y
saltos que el usuario no tocó.

El invariante de fidelidad sigue valiendo y se precisa para los bloques:

> Dibujar un bloque no modifica el documento. Una edición hecha a través de un
> bloque (una celda, un epígrafe, el archivo de una figura) cambia solo los
> caracteres de esa parte. Las operaciones que por naturaleza tocan más
> (agregar o borrar una columna) cambian lo mínimo necesario y nada fuera del
> `tabular`.

Todo bloque que el editor no entienda se sigue mostrando como código.

## 4. Entregas

Tres entregas, en este orden. Cada una es usable sola, tiene su rama, su
revisión independiente y se integra a `main` por separado.

| Entrega | Contenido | Sección |
|---|---|---|
| 1 | Ecuaciones, figuras, código, numeración de objetos | 5 |
| 2 | Citas: pastilla, buscador, Zotero, pegar BibTeX | 6 |
| 3 | Tablas con celdas editables | 7 |

## 5. Entrega 1: ecuaciones, figuras y código

### 5.1 Analizador

`compartido/analizador.ts` reconoce, además de lo actual:

- **Matemática en línea:** `$…$` y `\(…\)`. No cruza una línea en blanco. `\$`
  no abre ni cierra.
- **Matemática en bloque:** `\[…\]`, `$$…$$`, y los entornos `equation`,
  `equation*`, `align`, `align*`.
- **Entornos de bloque:** `figure`, `table`, `tabular`, `lstlisting`,
  `verbatim`, con el rango completo y el rango interior.
- **Partes de un flotante:** `\includegraphics[opciones]{ruta}` (rango y ruta),
  `\caption{…}` (rango y contenido).

Reglas que se mantienen: lo que no cierra no se reporta; dentro de matemática
y de entornos literales no se reportan otros elementos (un `\textbf` dentro de
una fórmula no es formato de prosa).

### 5.2 Numeración de objetos

`compartido/numeracion.ts` suma `numerarObjetos`: figuras, tablas y ecuaciones
numeradas llevan `capítulo.n`, contando dentro del archivo, cada clase por
separado. `equation*`, `align*` y `\[…\]` no cuentan; cada línea de `align`
sin `\nonumber`/`\notag` cuenta.

`servidor/proyecto.ts`: la etiqueta que está dentro de un objeto pasa a llevar
la clase y el número del objeto (`Etiqueta` suma
`clase: 'seccion' | 'figura' | 'tabla' | 'ecuacion'`). Hoy lleva número nulo.

En la vista, `\ref{…}` a un objeto muestra solo el número ("2.1"); a una
sección sigue mostrando número y título. El autocompletado de `\ref{` muestra
"Figura 2.1", "Tabla 2.3", "Ecuación 2.2".

El número es orientativo, igual que el de los títulos: la referencia es el PDF.

### 5.3 Vista

`cliente/vista.ts` queda como orquestador y cada clase de bloque pasa a su
archivo en `cliente/bloques/` (`ecuacion.ts`, `figura.ts`, `codigo.ts`; en las
entregas siguientes `cita.ts` y `tabla.ts`). Cada uno recibe los elementos del
analizador y el contexto, y devuelve decoraciones.

**Ecuaciones** (`bloques/ecuacion.ts`, con KaTeX):
- En línea, sin el cursor encima: la fórmula dibujada en lugar de su código.
- En bloque, sin el cursor encima: la fórmula centrada y, si es numerada, su
  número a la derecha.
- Con el cursor dentro: se ve el LaTeX y, debajo, la vista previa, que se
  actualiza con cada tecla.
- Antes de dibujar se quitan `\label{…}`, `\nonumber` y `\notag`, que KaTeX no
  usa.
- Si KaTeX no puede dibujarla, en lugar del dibujo se muestra el motivo en
  rojo, con la aclaración "puede compilar igual: el editor no conoce todos los
  comandos de LaTeX". El documento no se toca.
- KaTeX se usa con `trust: false`. Lo ya dibujado se guarda en una caché por
  texto de fórmula, acotada.

**Figuras** (`bloques/figura.ts`):
- Sin el cursor en su código: las líneas `\begin{figure}`, `\centering`,
  `\label` y `\end{figure}` no se ven; `\includegraphics` se reemplaza por la
  imagen; el epígrafe se ve debajo con el prefijo "Figura 2.1:".
- El epígrafe es texto del documento: se edita en el lugar y el corrector lo
  revisa. Tener el cursor dentro del epígrafe no hace aparecer el código.
- Clic en la imagen: abre el selector (5.4). Un botón "Ver código", visible al
  pasar el cursor, muestra el LaTeX de la figura.
- PNG y JPG se dibujan. Un PDF se muestra como recuadro con su nombre. Si el
  archivo no existe, recuadro rojo con la ruta.
- Un `\includegraphics` fuera de un `figure` se dibuja igual, sin epígrafe.

**Código** (`bloques/codigo.ts`): el interior de `lstlisting` y `verbatim` se
ve como recuadro monoespaciado y se edita directo; las líneas `\begin` y
`\end` quedan atenuadas. No se reemplaza nada.

### 5.4 Imágenes

Servidor, unidad nueva `servidor/imagenes.ts`, que usa la misma validación de
rutas que `archivos` (nada fuera de `informe/`, nada en `.git`):

- `GET /api/imagen?ruta=` — devuelve el archivo. Solo extensiones `.png`,
  `.jpg`, `.jpeg`, `.pdf`. Si la ruta no trae extensión, prueba en el orden de
  `pdflatex`.
- `GET /api/imagenes` — lista las imágenes de `figs/` (ruta y tamaño).
- `POST /api/imagenes?nombre=` — cuerpo binario, máximo 20 MB. Guarda en
  `figs/`. Valida extensión y nombre (sin separadores de ruta; los espacios se
  reemplazan por guiones, porque en LaTeX dan problemas). Si el nombre ya
  existe responde 409 sin escribir: nunca sobrescribe.

Cliente, `cliente/pantalla/selectorImagen.ts`:
- Miniaturas de `figs/` con filtro por nombre, y "Elegir archivo…".
- Elegir una imagen para una figura existente cambia solo la ruta dentro de
  `\includegraphics{…}`.
- Arrastrar un archivo de imagen al editor lo sube e inserta la plantilla de
  Figura completa en una línea propia, con el cursor en el epígrafe.
- Nombre repetido: pregunta entre usar la que ya está o guardar con otro
  nombre (`nombre-2.png`).

## 6. Entrega 2: citas

### 6.1 Lectura del `.bib`

`compartido/bib.ts`, puro: `analizarBib(texto)` devuelve las entradas (tipo,
clave, campos, rango en el archivo) y los problemas encontrados. Soporta
valores entre llaves, entre comillas y numéricos, llaves anidadas,
comentarios, `@comment` y `@string` (sin resolver las abreviaturas). Una
entrada mal formada se informa y no impide leer las demás.

Derivados para mostrar: autores en forma corta ("Cohen", "Susskind y
Hrabovsky", "Holleis et al." con tres o más), año, título, y los acentos
LaTeX comunes convertidos a su letra (`{\'a}` → `á`).

El cliente lee el `.bib` que informa `proyecto.bibliografia` y lo vuelve a leer
cuando el proyecto se recarga.

### 6.2 Pastilla

`cliente/bloques/cita.ts` reemplaza al dibujo actual (que muestra la clave):

| Comando | Se ve |
|---|---|
| `\cite{k}` | (Cohen, 1963) |
| `\citeA{k}` | Cohen (1963) |
| `\citeNP{k}` | Cohen, 1963 |
| `\citeauthor{k}` | Cohen |
| `\citeyear{k}` | (1963) |

Varias claves se separan con punto y coma. Los argumentos opcionales de
`apacite` se muestran en su lugar (`\cite<ver>[p.~5]{k}` → "(ver Cohen, 1963,
p. 5)"). Una clave que no está en el `.bib` se ve en rojo, con la clave. Es
orientativo: el formato final lo decide `apacite` en el PDF.

### 6.3 Buscador

`cliente/pantalla/buscadorCitas.ts`. Se abre con:
- menú "/" → Cita (deja de insertar `\cite{clave}` a completar a mano);
- Ctrl+K;
- clic sobre una cita ya puesta, para cambiarla.

Funcionamiento:
- Busca por autor, título, año o clave, sin distinguir tildes ni mayúsculas;
  todas las palabras escritas tienen que aparecer.
- Cada resultado muestra autores, año, título y origen: "en el informe" o
  "Zotero". Primero los del informe.
- Forma: parentética (`\cite`) o textual (`\citeA`), con un conmutador.
- Se pueden marcar varios resultados para una misma cita.
- Aceptar inserta en el cursor. Sobre una cita existente cambia solo el
  comando y las claves, y conserva sus argumentos opcionales.
- "Agregar referencia…" abre el pegado de BibTeX (6.6).

### 6.4 Zotero

`servidor/zotero.ts`: consulta la API local de Zotero en `127.0.0.1:23119`.
Pasa por el servidor del editor porque el navegador no puede llamar a Zotero
directamente. Solo lee: nunca escribe en la biblioteca de Zotero, y nada sale
de la máquina.

- `GET /api/zotero/estado` → `disponible` | `cerrado` | `sin-permiso`.
- `GET /api/zotero/buscar?q=` → ítems (título, autores, año, DOI, clave de
  ítem), sin adjuntos ni notas. Espera máxima 3 s.
- Al elegir un ítem de Zotero, el servidor pide su entrada en BibTeX y la
  agrega con la misma operación que el pegado (6.6).

Con Zotero `cerrado` o `sin-permiso`, el buscador lo dice en una línea (con
la instrucción para activar la opción en Ajustes → Avanzado) y trabaja solo
con el `.bib`.

### 6.5 Verificación previa de Zotero

La conexión con Zotero no pudo probarse durante el diseño. La primera tarea de
la entrega 2 es una sonda, con Zotero abierto por Cristhian, que comprueba:

1. que la API local responde en el puerto 23119 con la opción activada, y qué
   responde con la opción desactivada;
2. que se puede buscar por texto y qué campos devuelve;
3. que entrega un ítem en BibTeX, y qué clave genera.

Según el resultado:
- Todo funciona: se construye lo descrito en 6.4.
- No entrega BibTeX pero sí los datos: el editor arma la entrada a partir de
  los campos, con clave `apellidoAñoPalabra` (por ejemplo `cohen1963independence`).
- La API no responde: la entrega 2 sale sin Zotero, solo con pegar BibTeX, y
  se le avisa a Cristhian. En Zotero, clic derecho → Exportar ítem → BibTeX da
  el texto para pegar.

El resultado de la sonda se anota en esta especificación antes de seguir.

### 6.6 Agregar una referencia

`POST /api/referencias` `{ bibtex }`, en la misma cola en serie que guardar y
Git. El servidor:

1. Analiza lo pegado con `bib.ts`. Si no hay ninguna entrada válida, rechaza
   con el motivo (llaves sin cerrar, falta la clave, clave con espacios).
2. Compara con el `.bib` actual:
   - misma clave y mismo contenido: no agrega nada, devuelve esa clave;
   - mismo DOI, o mismo título y año, con otra clave: no agrega nada, devuelve
     la clave que ya existe y lo informa ("ya estaba cargada como …");
   - misma clave con otro contenido: no agrega nada y responde `clave-repetida`;
     el cliente pregunta entre usar la existente o agregar con clave nueva
     (`clave-2`).
3. Si corresponde agregar, escribe la entrada al final del archivo, separada
   por una línea en blanco, respetando el fin de línea del archivo.

Solo se agrega al final: nunca se reordena ni se reformatea lo existente. Si
el `.bib` no es reproducible byte a byte (`fiel: false`), se rechaza con la
misma explicación que ya da el editor para esos archivos.

Si el `.bib` está abierto en el editor, el cliente guarda antes de pedir y
recarga después. Se pueden pegar varias entradas a la vez.

## 7. Entrega 3: tablas

### 7.1 Modelo

`compartido/tabla.ts`, puro. `analizarTabla(texto, rango)` devuelve una de
tres cosas:

- **Simple:** columnas (alineación y rango de su especificación), filas, y por
  cada celda el rango exacto de su contenido sin los espacios de los bordes.
  Las líneas (`\hline`, `\toprule`, `\midrule`, `\bottomrule`) se registran
  entre filas.
- **Solo lectura:** tiene `\multicolumn` y por lo demás cumple lo anterior.
- **No reconocida:** cualquier otra cosa.

Una tabla es simple si: la especificación de columnas usa solo `l`, `c`, `r`,
`p{…}`, `|` y espacios; todas las filas tienen tantas celdas como columnas; no
hay `\multicolumn`, `\multirow`, `\cline`, `\cmidrule`, `\\[…]`, comentarios
`%` ni otro entorno adentro. `\&` no separa celdas; tampoco un `&` dentro de
llaves.

Operaciones, puras, que devuelven una `Edicion` (el tipo que ya usa
`comandos.ts`):

| Operación | Qué cambia en el texto |
|---|---|
| `editarCelda` | Solo el contenido de esa celda. Con el mismo texto, ningún cambio. |
| `agregarFila`, `borrarFila` | Una línea. La fila nueva copia la sangría y el espaciado de la vecina. |
| `agregarColumna`, `borrarColumna` | La especificación de columnas y una celda por fila. |
| `alinearColumna` | Una letra de la especificación. |

### 7.2 Vista

`cliente/bloques/tabla.ts`: un bloque que reemplaza al `tabular`.

- Simple: tabla HTML. Cada celda muestra su contenido dibujado (negrita,
  cursiva, monoespaciado, fórmula en línea, cita); lo demás, tal cual.
- Clic en una celda: pasa a ser un campo con el LaTeX de esa celda. Tab y
  Shift+Tab van a la celda siguiente y anterior; Enter, a la de abajo; Escape
  descarta lo escrito y sale.
- El cambio se aplica al documento al salir de la celda, como una sola
  edición: un Ctrl+Z deshace la celda entera.
- Al aplicar, un `&` o `%` sin barra se guarda como `\&` y `\%`. Si el texto
  tiene llaves o `$` sin cerrar, no se aplica: la celda queda en rojo con el
  motivo, porque rompería la tabla.
- Menú por celda: fila arriba, fila abajo, columna a la izquierda, columna a
  la derecha, borrar fila, borrar columna, alinear a izquierda, centro o
  derecha. Borrar pide confirmación si la fila o columna tiene contenido.
- "Ver código": muestra el LaTeX de la tabla hasta que el cursor sale de ella.
- Solo lectura: se dibuja con las celdas combinadas; un clic muestra el
  código.
- No reconocida: código, como hoy.
- Con el editor en solo lectura (durante Traer, Enviar o un conflicto), las
  celdas no se pueden editar.

El flotante `table` se trata como `figure`: sus líneas de armado no se ven,
y el epígrafe "Tabla 2.1: …" se edita en el lugar.

## 8. Errores

| Situación | Comportamiento |
|---|---|
| KaTeX no puede dibujar una fórmula | Motivo en rojo en lugar del dibujo; el texto no se toca. |
| Imagen inexistente o de tipo no soportado | Recuadro con la ruta y el motivo. |
| Falla la subida de una imagen | Aviso en la barra; no se inserta la figura. |
| Imagen de más de 20 MB | Se rechaza con el motivo; no se copia nada. |
| Zotero cerrado o sin la opción activada | El buscador lo dice y sigue con el `.bib`. |
| Zotero tarda más de 3 s | Se muestran los resultados del `.bib`; los de Zotero, cuando lleguen o nunca. |
| BibTeX pegado mal formado | Se muestra el motivo; el `.bib` no se toca. |
| El `.bib` cambió en disco mientras se agregaba | Se relee y se reintenta una vez; si vuelve a cambiar, se informa. |
| Entrada mal formada ya presente en el `.bib` | Se informa en el buscador; las demás se usan. |
| Una tabla deja de ser simple por una edición a mano | Pasa a verse como solo lectura o como código. |

Ningún error de esta etapa bloquea la escritura, el guardado ni la
sincronización.

## 9. Pruebas

Automáticas (Vitest), con TDD:

- **Analizador:** cada construcción nueva; `\$`; fórmula sin cerrar; fórmula
  que no cruza párrafo; comandos dentro de matemática que no se reportan;
  entornos anidados; todo lo que ya se probaba sigue pasando.
- **Numeración:** objetos por capítulo, variantes con asterisco, `align` con
  varias líneas, capítulo sin número.
- **Proyecto:** etiquetas de objetos con su clase y número.
- **Imágenes:** rutas fuera de `informe/`, extensión no permitida, nombre
  repetido, límite de tamaño, resolución sin extensión.
- **Bib:** los tres tipos de valor, llaves anidadas, entrada rota entre dos
  sanas, autores cortos, acentos.
- **Referencias:** los cuatro casos de 6.6; que agregar no cambie ningún byte
  anterior del archivo; CRLF y LF.
- **Zotero:** contra un servidor HTTP falso: disponible, cerrado, sin permiso,
  lento.
- **Tabla:** clasificación (simple, solo lectura, no reconocida); para cada
  operación, que el texto fuera de los rangos cambiados quede idéntico y que
  volver a analizar dé el modelo esperado; `editarCelda` con el mismo texto no
  produce cambios; escapado de `&` y `%`; rechazo de llaves sin cerrar.
- **Vista:** que las decoraciones de cada bloque aparezcan sin el cursor y
  desaparezcan con él, como en `vista.test.ts`.
- **Fidelidad:** la prueba existente sigue pasando con los fixtures nuevos.

Los fixtures (`pruebas/fixtures/informe/`) suman un capítulo con ecuaciones,
una figura, una tabla simple, una con `\multicolumn`, un bloque de código y
citas en las cinco formas.

Manual, en el entorno de prueba y nunca contra `informe/`, antes de integrar
cada entrega:

- Entrega 1: escribir una ecuación con error y corregirla; arrastrar una
  imagen; cambiarla desde el selector; compilar y comparar con el PDF; Enviar y
  comprobar en el remoto simulado que viajó la imagen y nada más.
- Entrega 2: citar un paper del `.bib`, uno de Zotero y uno pegado; comprobar
  el diff del `.bib`; compilar y ver la bibliografía.
- Entrega 3: editar celdas, agregar y borrar filas y columnas; comprobar el
  diff del `.tex` línea por línea; compilar.

## 10. Instalación y guía

- Dependencia nueva: `katex`.
- `INSTALACION.md` suma: cómo usar cada bloque, y la activación de la opción
  de Zotero.
- Sin opciones nuevas en `config.json`.

## 11. Fuera de alcance

Pegar tablas desde Excel; combinar celdas desde el editor; entrar a una tabla
con las flechas del teclado; corrector dentro de las celdas; comandos propios
(`\newcommand`) en la vista previa de ecuaciones; pegar capturas con Ctrl+V;
recortar o redimensionar imágenes; editar entradas del `.bib` con formulario;
actualizar el `.bib` cuando un ítem cambia en Zotero; borrar referencias sin
usar; buscar referencias por DOI en internet.
