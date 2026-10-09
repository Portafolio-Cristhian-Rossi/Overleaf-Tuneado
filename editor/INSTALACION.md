# Editor del informe: instalación y uso

## 1. Qué es y qué necesitás

Es una aplicación que corre en tu máquina y te deja escribir el informe sin
pelearte con LaTeX: los títulos, la negrita y las referencias se ven
formateados, hay un menú para insertar figuras, tablas y ecuaciones, y dos
botones para sincronizar con Overleaf.

Los archivos siguen siendo los `.tex` de siempre. El editor no los convierte a
ningún otro formato, así que tus compañeros pueden seguir editando en Overleaf.

Necesitás Windows 10 u 11, una cuenta de Overleaf con acceso al proyecto, y
tres programas: Git, Node y MiKTeX. Para el corrector de ortografía y gramática
hace falta además Java.

Las carpetas quedan así:

```
Tesis/
├── editor/     esta aplicación
├── informe/    el proyecto de Overleaf (lo clonás en el paso 3)
└── build/      el PDF y los temporales de LaTeX (se crea sola)
```

Todos los comandos de esta guía se ejecutan en PowerShell.

## 2. Requisitos

Para cada programa: primero comprobá si ya lo tenés; si el comando falla,
instalalo y abrí una terminal nueva antes de volver a comprobar.

**Git**

```bash
git --version
```

```bash
winget install --id Git.Git -e
```

**Node, versión 24 o posterior**

```bash
node --version
```

```bash
winget install --id OpenJS.NodeJS.LTS -e
```

**MiKTeX**, que genera el PDF

```bash
pdflatex --version
```

```bash
winget install --id MiKTeX.MiKTeX -e
```

Después de instalar MiKTeX, activá la descarga automática de paquetes. Sin
esto, la primera compilación se queda esperando una confirmación que nunca
vas a ver:

```bash
initexmf --set-config-value "[MPM]AutoInstall=1"
```

Sin MiKTeX el editor funciona igual para escribir y sincronizar; lo único que
no vas a tener es el PDF local.

**Java**, para el corrector de ortografía y gramática

```bash
java -version
```

```bash
winget install --id EclipseAdoptium.Temurin.21.JRE -e
```

Sin Java el editor funciona igual; lo único que no vas a tener es el corrector
propio, y en su lugar queda el del navegador.

**VS Code** es opcional. Sirve para resolver un conflicto cuando dos personas
cambiaron el mismo párrafo, y como plan B si el editor no arranca.

**Zotero** es opcional. Si guardás ahí los papers que leés, el editor los
ofrece al citar. Hay que permitírselo una sola vez: en Zotero, Editar →
Ajustes → Avanzado, tildá "Permitir que otras aplicaciones de este equipo se
comuniquen con Zotero". El editor solo lee tu biblioteca; nunca la modifica.
Sin Zotero el editor funciona igual: cita lo que ya esté en el archivo de
referencias del informe.

## 3. Conectar con Overleaf

1. En Overleaf, entrá a **Account Settings → Git Integration** y creá un token.
   Empieza con `olp_`. Copialo: Overleaf lo muestra una sola vez.
2. El identificador del proyecto es la parte final de su dirección:
   `https://www.overleaf.com/project/<id-del-proyecto>`.
3. Parado en la carpeta `Tesis`, cloná el proyecto:

```bash
git clone https://git@git.overleaf.com/<id-del-proyecto> informe
```

Cuando pida contraseña, pegá el token. Windows lo guarda y no lo vuelve a
pedir.

4. Decile a Git con qué nombre firmar tus cambios; es el que van a ver los
   demás en el historial de Overleaf. Parado en la carpeta `Tesis`:

```bash
git -C informe config user.name "Tu Nombre"
```

```bash
git -C informe config user.email "tu@correo.com"
```

Si te salteás este paso, el editor te lo recuerda al abrir.

**El token es una contraseña.** No lo pegues en chats, mails ni documentos. Si
se te escapó, borralo en la misma pantalla de Overleaf y creá otro.

**Si el clon falla con error 403**, Overleaf rechazó las credenciales. Las
causas habituales: se ingresó la contraseña de la cuenta en vez del token, el
token se copió incompleto o con un espacio, o ya fue borrado. Creá un token
nuevo y repetí el comando.

## 4. Instalar el editor

Parado en la carpeta `editor`:

```bash
npm install
```

```bash
npm run build
```

```bash
npm run acceso-directo
```

El último comando crea el ícono **Editor del informe** en el escritorio. Podés
anclarlo a la barra de tareas con clic derecho.

Para tener el corrector, un comando más. Descarga LanguageTool (unos 250 MB)
dentro de la carpeta `editor`; corre en tu máquina y tu texto no sale de ahí:

```bash
npm run instalar-corrector
```

## 5. Uso diario

**Abrir.** Doble clic en el ícono. El editor se abre en el navegador. Si ya
estaba abierto, se abre otra pestaña sobre el mismo editor. Se cierra solo a
los diez minutos de cerrar la última pestaña.

**Escribir.** A la izquierda están los capítulos y las secciones del capítulo
abierto. Lo que escribís se guarda solo; arriba a la derecha dice `Guardado`.

- Al poner el cursor sobre un título, una negrita o una referencia, se muestra
  su código LaTeX para que puedas tocarlo. Al salir, vuelve a verse formateado.
- `Ctrl+B` negrita, `Ctrl+I` cursiva. El selector de la barra convierte la
  línea en título o la devuelve a texto.
- El botón **Insertar** de la barra agrega una sección, lista, figura, tabla,
  ecuación, cita, bloque de código o referencia cruzada. Lo que necesita un
  renglón propio (una tabla, una ecuación) queda debajo de la línea donde
  está el cursor; una cita o una referencia, donde está el cursor. `Tab`
  salta al siguiente campo a completar. Si hace falta un paquete de LaTeX, el
  editor pregunta y lo agrega a `main.tex`.
- Sin sacar las manos del teclado: escribí `/` al principio de una línea y
  sale el mismo menú.
- Lo que el editor no sabe dibujar se ve como código, en gris. Podés editarlo
  igual.

**Ecuaciones.** Las fórmulas se ven dibujadas: las que van dentro del texto
(`$k$`) y las que van en un renglón aparte, con su número a la derecha.

- Para insertar una: **Insertar** → Ecuación. Para una fórmula corta dentro de un
  párrafo, escribila entre signos de pesos: `$a + b$`.
- Para cambiarla, poné el cursor encima: aparece su código LaTeX y, debajo, un
  recuadro que muestra cómo va quedando mientras escribís.
- Si el recuadro se pone rojo, la fórmula tiene algo que el editor no pudo
  dibujar, y dice qué. Casi siempre es una llave sin cerrar o un comando mal
  escrito. A veces es un comando válido que el editor no conoce: en ese caso
  el aviso dice que puede compilar igual, y lo confirmás con **Compilar**.

**Figuras.** Una figura se ve con su imagen y, debajo, su epígrafe
("Figura 2.1: …").

- Para insertar una: **Insertar** → Figura. Se abre una ventana con las imágenes que
  ya están en la carpeta `figs/` del informe. Elegí una, o usá
  *Elegir archivo…* para sumar una imagen de tu computadora.
- También podés arrastrar un archivo de imagen desde el Explorador de Windows
  y soltarlo sobre el texto: queda la figura armada en ese lugar.
- El epígrafe se escribe ahí mismo, como cualquier texto.
- Para cambiar la imagen de una figura, hacé clic sobre la imagen.
- Para ver o tocar el código de la figura, pasá el cursor por la imagen y usá
  *Ver código*.
- Se aceptan PNG, JPG y PDF, de hasta 20 MB. Un PDF no se dibuja en el editor:
  se ve un recuadro con su nombre, y aparece al compilar.
- El editor copia la imagen a `figs/` y le acomoda el nombre: sin espacios ni
  tildes (`Gráfico final.png` queda como `Grafico-final.png`). Si ya hay una
  con ese nombre, pregunta qué hacer; nunca reemplaza una imagen existente.
- Una imagen nueva viaja a Overleaf con el próximo **Enviar**, igual que el
  texto.
- Una figura armada de otra forma (por ejemplo, con dos imágenes) se ve como
  código y se edita así.

**Tablas.** Una tabla se ve como tabla, con su epígrafe ("Tabla 2.1: …").

- Para insertar una: botón **Insertar** → Tabla (o `/` → Tabla). Escribí el
  epígrafe y sacá el cursor con las flechas: queda dibujada.
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

**Código.** `/` → Bloque de código inserta un recuadro donde escribís el
código tal cual. El corrector no lo revisa.

**Referencias a figuras y ecuaciones.** `/` → Referencia cruzada ofrece
también las figuras, tablas y ecuaciones del informe ("Figura 2.1",
"Ecuación 2.2"). En el texto se ve su número. Como con los títulos, ese número
es orientativo: el definitivo es el del PDF.

**Citas.** Una cita se ve como se va a leer: "(Cohen, 1963)". Si está en
rojo, su clave no está en el archivo de referencias del informe
(`referencias.bib`).

- Para citar, abrí el buscador: **Insertar** → Cita, o `Ctrl+K` donde quieras
  la cita.
  Escribí el autor, parte del título o el año, y apretá Enter.
- Hay dos formas, que elegís abajo en el buscador: "(Autor, año)" para una
  cita entre paréntesis, y "Autor (año)" cuando el autor es parte de la
  oración ("como muestra Cohen (1963)").
- Para citar varios trabajos juntos, tildá cada uno y apretá *Citar*.
- Para cambiar una cita, hacele clic: se abre el buscador con lo que ya tiene
  marcado.
- El buscador muestra las referencias del informe y, si Zotero está abierto,
  también tus papers de Zotero. Al elegir uno de Zotero, el editor agrega su
  ficha al final de `referencias.bib` y pone la cita. No hay que exportar
  nada a mano.
- Antes de escribir esa ficha en el archivo compartido, el editor le saca la
  ubicación del PDF en tu computadora, tus notas personales, el resumen y las
  palabras clave. Lo demás queda como está en Zotero.
- Si el paper ya estaba en `referencias.bib`, aunque lo haya cargado otra
  persona con otra clave, se usa esa ficha y no se duplica.
- La ficha nueva viaja a Overleaf con el próximo **Enviar**.
- Si Zotero está cerrado, el buscador lo avisa y sigue funcionando con las
  referencias del informe.
- *Agregar referencia…* sirve para lo que no tengas en Zotero: pegás la ficha
  en formato BibTeX (la que ofrecen Google Scholar o la página del artículo) y
  el editor la revisa antes de sumarla.

Dos avisos que pueden aparecer al agregar una referencia:

- **"Le falta la revista (journal)".** Pasa con tesis o informes guardados en
  Zotero como "artículo de revista". La bibliografía puede dar error al
  compilar. Se arregla en Zotero, cambiando el tipo del ítem (por ejemplo, a
  Tesis), y después corrigiendo o borrando esa ficha en `referencias.bib`.
- **"Trae una nota que se va a imprimir".** El texto de la nota va a aparecer
  en la bibliografía del informe. Si no lo querés, borrá la línea `note = …`
  de esa ficha en `referencias.bib`.

Dentro de una fórmula o de un bloque de código no se puede citar: el editor
lo avisa.

**Corrección.** Unos segundos después de abrir el editor, el corrector queda
listo y empieza a subrayar: rojo ondulado para ortografía, ámbar para
gramática.

- Al pasar el cursor por una palabra subrayada aparecen las sugerencias; un
  clic la reemplaza. *Agregar al diccionario* hace que no se vuelva a marcar:
  sirve para términos técnicos o en inglés.
- Al terminar de escribir una palabra, el editor corrige solo tres cosas, y
  solo cuando no hay duda: una tilde faltante en una palabra que sin tilde no
  existe (`analisis` → `análisis`), dos letras invertidas, y una doble
  mayúscula inicial (`ESta` → `Esta`). Lo corregido queda resaltado un
  momento. `Ctrl+Z` lo deshace; si deshacés la misma palabra dos veces, no la
  vuelve a tocar.
- Palabras como `mas`, `esta` o `calculo`, que existen con y sin tilde, nunca
  se corrigen solas: quedan subrayadas para que decidas.
- La pestaña **Gramática**, a la derecha, lista todos los avisos del capítulo;
  un clic en uno te lleva al lugar.
- Nunca se revisa ni se toca lo que no es prosa: fórmulas, código, comandos,
  claves de citas y etiquetas.

Tu diccionario queda en `editor/correccion.json`. No viaja a Overleaf.

El corrector ocupa unos 400 MB en disco y, mientras el editor está abierto,
hasta 1 GB de memoria.

**IA.** El editor no usa ninguna IA por su cuenta: te arma el pedido (la
*prompt*) y lo copia, para que lo pegues en el chat del modelo que uses. El
botón **IA** de la barra tiene tres pedidos:

- *Desarrollar notas*: seleccioná tus apuntes sueltos y pide convertirlos en
  párrafos del informe.
- *Revisar estilo*: seleccioná un texto ya escrito y pide mejorar la redacción
  sin cambiar lo que dice.
- *Revisar consistencia*: no hace falta seleccionar nada. Manda el capítulo
  abierto y pide una lista de problemas: un término usado de dos formas,
  siglas sin definir, texto de la plantilla que quedó.

Cómo se usa:

1. Elegí el pedido. La barra avisa `Prompt copiada`.
2. Pegala en el chat del modelo (`Ctrl+V`) y enviala.
3. La respuesta viene en un recuadro de código: copialo con su botón y pegalo
   en el editor. Tu selección sigue marcada, así que el pegado la reemplaza.
   Si no te gusta, `Ctrl+Z`.

Tres cosas a tener en cuenta:

- Donde al modelo le falte un dato, una cifra o una cita, va a escribir
  `[FALTA: …]` en vez de inventarlo. Buscá esas marcas y completalas vos.
- Igual, leé lo que devuelve antes de dejarlo: puede afirmar algo que tus
  notas no decían.
- Lo que pegás en un chat sale de tu máquina. El editor no envía nada solo.

Cada pedido lleva la **guía de estilo**: de qué trata el informe, en qué
persona se escribe y qué términos usar. Viene con una inicial; corregila en
**IA** → *Guía de estilo…*. Queda en `editor/guia-estilo.md` y no viaja a
Overleaf.

**Traer.** Baja lo que cambiaron los demás en Overleaf y lo combina con lo
tuyo. Cuando hay algo nuevo, la barra avisa `Hay cambios nuevos en Overleaf`.

**Enviar.** Trae primero y después sube tus cambios. Un punto junto al botón
indica que tenés cambios sin enviar.

**Compilar.** Genera el PDF y lo muestra a la derecha. Si hay errores, aparecen
listados debajo; al hacer clic en uno, el editor va a la línea. La primera
compilación tarda varios minutos porque MiKTeX descarga paquetes.

**La costumbre que evita problemas:** Traer al sentarte a escribir y Enviar al
terminar.

## 6. Qué no hace

- **No es en tiempo real.** Los demás ven tus cambios recién cuando apretás
  Enviar, y vos los de ellos cuando apretás Traer.
- **No muestra los comentarios ni el control de cambios de Overleaf.** Eso se
  sigue leyendo en la web de Overleaf.
- **No revisa el estilo ni la redacción por su cuenta.** Marca errores de
  ortografía y gramática. Para la redacción, el botón **IA** te arma el pedido
  y lo pegás vos en un modelo; el editor no recibe la respuesta.
- **No modifica Zotero ni mantiene las fichas al día.** Si corregís un paper
  en Zotero después de haberlo citado, la ficha que ya está en
  `referencias.bib` no cambia sola.

## 7. Opciones de `config.json`

| Opción | Valor inicial | Qué hace |
|---|---|---|
| `informe` | `../informe` | Carpeta del proyecto de Overleaf, relativa a `editor`. |
| `build` | `../build` | Carpeta donde se generan el PDF y los temporales. |
| `principal` | `main.tex` | Archivo principal del informe. |
| `puerto` | `4317` | Puerto local del editor. Cambialo solo si está ocupado. |
| `compilarAlGuardar` | `false` | Con `true`, compila el PDF cada vez que se guarda. |
| `corrector` | `true` | Con `false`, no se usa el corrector propio. |
| `puertoCorrector` | `4319` | Puerto local del corrector. Cambialo solo si está ocupado. |

Después de cambiar una opción, cerrá las pestañas del editor, esperá a que se
cierre (o reiniciá la máquina) y volvé a abrirlo.

## 8. Problemas frecuentes

**"Git no pudo autenticarse con Overleaf".** El token venció o fue borrado.
Creá uno nuevo en Overleaf, abrí una terminal en la carpeta `informe`, ejecutá
`git pull` y pegá el token cuando lo pida.

**"No hay conexión con Overleaf".** No hay internet o Overleaf no responde. Tus
cambios están guardados en tu máquina; apretá Enviar cuando vuelva la conexión.

**"Vos y otra persona cambiaron el mismo párrafo".** Git no pudo combinar los
cambios solo. Tenés tres salidas:

- *Resolver en VS Code*: abre la carpeta; en el archivo marcado elegís qué
  versión queda, guardás, y volvés al editor a apretar *Ya lo resolví*.
- *Ya lo resolví*: termina la combinación. Si quedó alguna marca
  (`<<<<<<<`, `=======`, `>>>>>>>`) te dice en qué archivo.
- *Cancelar la combinación*: vuelve todo a como estaba antes de Traer. Tu
  texto queda intacto y lo de la otra persona sigue en Overleaf.

**La compilación tarda mucho o "tardó demasiado y se canceló".** La primera vez
MiKTeX descarga paquetes. Probá de nuevo. Si se repite, comprobá que ejecutaste
el comando `initexmf` de la sección 2.

**"Para ver el PDF hace falta instalar MiKTeX".** Falta MiKTeX o se instaló con
el editor abierto. Instalalo, cerrá las pestañas del editor, esperá diez
minutos o reiniciá la máquina, y volvé a abrirlo.

**La pestaña Gramática dice "LanguageTool no está instalado".** Ejecutá
`npm run instalar-corrector` en la carpeta `editor` y volvé a abrir el editor.

**Dice "No se encontró Java".** Instalalo con el comando de la sección 2 y
reiniciá la máquina.

**Dice "El corrector no pudo iniciar".** Cerrá las pestañas del editor, esperá
a que se cierre y abrilo de nuevo. Si se repite, puede que el puerto 4319 esté
ocupado: cambiá `puertoCorrector` en `config.json`.

**El corrector marca una palabra que está bien.** Pasá el cursor por encima y
elegí *Agregar al diccionario*.

**"El puerto 4317 está ocupado por otro programa".** Cambiá `puerto` en
`config.json` por otro número, por ejemplo `4318`.

**"Este archivo cambió por fuera del editor".** Alguien, u otro programa,
modificó el archivo mientras lo tenías abierto con cambios sin guardar. Elegí
qué versión conservar, o *Decidir después* para mirar con calma: mientras
tanto no se guarda ni se pierde nada.

**"No se pudo conectar con el editor" o "No se pudo guardar".** El programa
del editor se cerró o no responde. No cierres la pestaña: tu texto sigue ahí.
Abrí el editor de nuevo desde el ícono del escritorio; la pestaña anterior
reintenta sola cada pocos segundos y guarda lo pendiente.

**"Git no pudo completar la operación en tu máquina".** El problema no es de
Overleaf sino del repositorio local. El mensaje que sigue dice cuál. Los más
comunes: falta configurar el nombre (paso 4 de la sección 3) u otro programa
está usando la carpeta `informe`; en ese caso cerralo y probá de nuevo.

**"La carpeta … no es un clon del proyecto de Overleaf".** La carpeta
`informe` no existe o se copió a mano en vez de clonarse. Repetí la sección 3.

**"Se abre en solo lectura para no dañarlo".** El archivo no está en UTF-8 o
mezcla tipos de fin de línea, algo que pasa con archivos `.bib` exportados por
algunos programas. Abrilo en VS Code, guardalo como UTF-8 y volvé a abrirlo en
el editor.

**"Este archivo ya no existe en el informe".** Otra persona lo borró o lo
renombró. Copiá tu texto con el botón y abrí el capítulo que corresponda.

**El ícono no hace nada o aparece "El editor no está instalado".** Repetí los
tres comandos de la sección 4.

## 9. Si el editor no arranca

No quedás trabado: los archivos del informe son `.tex` comunes. Abrí la carpeta
`informe` en VS Code, editá ahí, y sincronizá desde una terminal en esa
carpeta:

```bash
git pull
```

```bash
git add -A
```

```bash
git commit -m "Cambios en el informe"
```

```bash
git push
```

## 10. Después de actualizar el editor

Si recibiste una versión nueva de la carpeta `editor`, parado en ella:

```bash
npm install
```

```bash
npm run build
```

Los cambios se ven la próxima vez que el editor arranque: cerrá sus pestañas y
esperá diez minutos a que se cierre solo, o reiniciá la máquina.
