# Editor del informe: instalación y uso

## 1. Qué es y qué necesitás

Es una aplicación que corre en tu máquina y te deja escribir el informe sin
pelearte con LaTeX: los títulos, la negrita y las referencias se ven
formateados, hay un menú para insertar figuras, tablas y ecuaciones, y dos
botones para sincronizar con Overleaf.

Los archivos siguen siendo los `.tex` de siempre. El editor no los convierte a
ningún otro formato, así que tus compañeros pueden seguir editando en Overleaf.

Necesitás Windows 10 u 11, una cuenta de Overleaf con acceso al proyecto, y
tres programas: Git, Node y MiKTeX.

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
- Escribí `/` al principio de una línea para insertar una sección, lista,
  figura, tabla, ecuación, cita, bloque de código o referencia cruzada. `Tab`
  salta al siguiente campo a completar. Si hace falta un paquete de LaTeX, el
  editor pregunta y lo agrega a `main.tex`.
- Lo que el editor no sabe dibujar se ve como código, en gris. Podés editarlo
  igual.

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
- **No corrige ortografía por su cuenta todavía.** Mientras tanto usa el
  corrector en español del navegador.

## 7. Opciones de `config.json`

| Opción | Valor inicial | Qué hace |
|---|---|---|
| `informe` | `../informe` | Carpeta del proyecto de Overleaf, relativa a `editor`. |
| `build` | `../build` | Carpeta donde se generan el PDF y los temporales. |
| `principal` | `main.tex` | Archivo principal del informe. |
| `puerto` | `4317` | Puerto local del editor. Cambialo solo si está ocupado. |
| `compilarAlGuardar` | `false` | Con `true`, compila el PDF cada vez que se guarda. |

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

**"El puerto 4317 está ocupado por otro programa".** Cambiá `puerto` en
`config.json` por otro número, por ejemplo `4318`.

**"Este archivo cambió por fuera del editor".** Alguien, u otro programa,
modificó el archivo mientras lo tenías abierto con cambios sin guardar. Elegí
qué versión conservar.

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
