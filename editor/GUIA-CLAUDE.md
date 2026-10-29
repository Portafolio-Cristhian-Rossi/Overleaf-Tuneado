# Usar Claude con el informe

Esta guía explica cómo conectar Claude con el informe, con el código de la
aplicación que el informe describe y con Overleaf. Supone que ya instalaste el
editor (`INSTALACION.md`, secciones 2 a 4).

## 1. Dos formas de usar Claude

- **Los botones de verificación del editor.** *Contra código* y *Contra
  informe* lanzan a Claude Code con una tarea fija y muestran lo que encontró
  en el panel derecho, con las frases subrayadas (`INSTALACION.md`, sección 6).
  No hace falta escribirle nada.
- **Una sesión propia de Claude Code** abierta en la carpeta del repositorio.
  Le pedís lo que quieras: que compare una sección con el código, que te
  explique qué cambió en Overleaf, que revise la redacción de un capítulo. Lee
  sola las reglas del proyecto (sección 4).

Las dos usan tu cuenta de Claude.

## 2. Instalar Claude Code y entrar

Elegí una de estas tres:

- **El CLI.** En PowerShell:

```bash
npm install -g @anthropic-ai/claude-code
```

  Después corré `claude`, seguí los pasos para entrar con tu cuenta y cerralo
  con `/exit`.

- **La extensión de VS Code.** Instalá *Claude Code* desde las extensiones y
  entrá con tu cuenta. Para los botones del editor, poné en
  `editor/config.json` la ruta del `claude.exe` que trae la extensión, con
  barras `/`:

```json
{
  "agente": "C:/Users/<tu-usuario>/.vscode/extensions/anthropic.claude-code-<versión>-win32-x64/resources/native-binary/claude.exe"
}
```

  El número de versión de esa carpeta cambia cuando se actualiza la extensión.
  Si la verificación dice que no encuentra Claude Code, buscá la carpeta nueva
  en `.vscode/extensions` y corregí la ruta.

- **La app de escritorio de Claude**, pestaña *Code*. Sirve para la sesión
  propia. Para los botones del editor hace falta además el CLI o la extensión.

## 3. Dónde poner cada carpeta

```
GitHub/
├── Editor-Informe/          este repositorio, en la rama del proyecto
│   ├── editor/
│   ├── proyecto/            config.json, reglas, guía y diccionario del equipo
│   ├── informe/             el clon de Overleaf
│   └── .claude/             reglas del proyecto para Claude (si las hay)
└── <aplicacion>/            el repositorio de la aplicación que describe el informe
```

Cloná el repositorio de la aplicación al lado de la carpeta del repositorio,
no adentro. Así la ruta de `repositorio` que trae `proyecto/config.json`
(`../../<aplicacion>`) te sirve sin cambiarla. Si lo tenés en otro lado, poné
tu ruta en `editor/config.json` (`INSTALACION.md`, sección 8).

## 4. Abrir una sesión

Abrí Claude Code en la carpeta del repositorio, no en `editor/` ni en
`informe/`:

- CLI: parado en la carpeta del repositorio, `claude`.
- VS Code: abrí la carpeta del repositorio y el panel de Claude Code.
- App de escritorio: elegí la carpeta del repositorio al crear la sesión.

Al empezar, Claude lee solo:

- `CLAUDE.md`: cómo está armado el repositorio, las reglas de ramas y lo que
  nunca se hace en `informe/`.
- `.claude/rules/`: las reglas de tu proyecto, si la rama las trae.
- `.claude/settings.json`: si la rama lo trae, suele sumar el repositorio de
  la aplicación como carpeta que Claude puede leer.

La primera vez, Claude Code te pregunta si confiás en la carpeta. Aceptá:
hasta que lo hagas, no usa las carpetas adicionales de `.claude/settings.json`.
Si la rama no las configura, o tu repositorio de la aplicación está en otro
lado, sumalo en la sesión:

```
/add-dir ../<aplicacion>
```

## 5. Comparar contra el código

Con el botón **Contra código** del editor tenés la revisión completa, con los
hallazgos en el panel. El agente lee una copia de la rama configurada, sin lo
que no commiteaste, y solo puede leer (`INSTALACION.md`, sección 6).

En una sesión propia podés hacer preguntas puntuales. Por ejemplo:

- *"Leé la sección de arquitectura de `informe/` y decime qué no coincide con
  el código de la aplicación."*
- *"¿Dónde está implementado lo que describe el segundo párrafo de esta
  sección?"*
- *"¿Qué servicios tiene la aplicación que el informe no menciona?"*

En la sesión, Claude lee el repositorio de la aplicación tal como está en tu
disco, con lo que no commiteaste. Antes de preguntar, hacé `git pull` en esa
carpeta.

## 6. Comparar contra Overleaf

`informe/` es un clon Git del proyecto de Overleaf. Antes de pedirle algo a
Claude, apretá **Traer** en el editor: así trabaja sobre lo último del equipo.

Claude puede leer el historial y las diferencias de `informe/`. Por ejemplo:

- *"¿Qué cambiaron mis compañeros en `informe/` en la última semana?"*
- *"Compará el capítulo 3 con cómo estaba antes del último Traer."*

Claude no hace commit ni push en `informe/` sin que se lo confirmes: un push
publica en el documento que ve todo el equipo. Para mandar tus cambios a
Overleaf, usá el botón **Enviar** del editor.

## 7. Lo que no se hace

- No le pegues a Claude tu token de Overleaf, ni lo pongas en ningún archivo.
  Si Git pide credenciales, las ingresás vos en la terminal.
- No le pidas a Claude que haga push en `informe/`: usá **Enviar**.
- No guardes contraseñas ni claves en `proyecto/` ni en `.claude/`: esas
  carpetas se comparten con el equipo por GitHub.

## 8. Costo y privacidad

- Todo lo que Claude lee (el informe, el código y tus mensajes) viaja a Claude
  con tu cuenta, como cualquier uso de Claude Code.
- El agente de los botones no lee el `.env` ni nada de lo que Git ignora en el
  repositorio de la aplicación. En una sesión propia, Claude puede leer lo que
  haya en tus carpetas. Si la aplicación tiene secretos en un `.env`, la rama
  del proyecto debería bloquearlo en `.claude/settings.json`; esta regla impide
  leer cualquier `.env`, en cualquier carpeta:

```json
{ "permissions": { "deny": ["Read(//**/.env)"] } }
```
- Como referencia, verificar un capítulo de unas quince páginas con el botón
  tardó unos dos minutos y costó alrededor de US$ 0,50. El panel muestra cuánto
  costó cada verificación.
