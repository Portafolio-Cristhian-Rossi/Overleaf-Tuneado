# Editor local de informes en LaTeX

Editor que corre en la máquina de cada integrante y sincroniza con un proyecto de Overleaf.
Conversar en español.

## Carpetas

- `editor/`: la aplicación (servidor Node + cliente con CodeMirror). La guía de uso e instalación
  es `editor/INSTALACION.md`; la de Claude, `editor/GUIA-CLAUDE.md`.
- `docs/superpowers/specs/` y `docs/superpowers/plans/`: las especificaciones y los planes de cada
  etapa del editor.
- `proyecto/`: lo propio de un proyecto (configuración del equipo, guía de estilo, diccionario,
  reglas extra del verificador). No existe en `main`: la agrega la rama del proyecto.
- `.claude/rules/`: reglas de Claude propias de un proyecto. Tampoco existen en `main`.
- `informe/`: **no está en este repositorio**. Es un clon Git del proyecto de Overleaf.
- `build/` y `verificaciones/`: el PDF, los temporales de LaTeX y las verificaciones. Se
  regeneran y Git los ignora.

## Ramas

- `main` es la herramienta genérica. Solo recibe merges de ramas `feature/…` creadas desde `main`.
- Cada proyecto tiene su rama (por ejemplo `tesis`). Recibe `main` y nunca al revés.
- La rama de un proyecto solo **agrega** archivos que `main` no tiene (`proyecto/`, `.claude/`).
  Nunca modifica uno que exista en `main`: así traer `main` no genera conflictos.
- Un arreglo al editor que aparece mientras se trabaja en un proyecto se hace en una
  `feature/…` desde `main`, y llega al proyecto cuando se trae `main`.
- Lo propio de un proyecto nunca va en el código, en este archivo ni en la documentación de
  `main`: va en `proyecto/` o en `.claude/rules/` de su rama. `editor/compartido/guardia.test.ts`
  falla si aparece en el código.

## Reglas sobre `informe/`

- Un `git push` desde `informe/` publica en el documento compartido del equipo. Confirmar con
  la persona antes de cualquier push, commit o edición de contenido ahí. Leer es libre.
- Nunca usar, pedir ni repetir tokens de Overleaf. Si Git pide credenciales, las ingresa la
  persona.
- Código, salidas de compilación y documentos de diseño van fuera de `informe/`.

## Cómo trabajar en el editor

- El ícono del escritorio ejecuta lo que hay en `editor/` (la rama en uso y su `dist/`
  compilado), no una copia aparte. Trabajar en un worktree deja intacto lo que la persona usa;
  integrar es a pedido suyo y exige `npm run build`.
- Si su editor está abierto (puertos 4317 y 4319), no detenerlo. Para probar, usar otros puertos
  con un `editor/config.prueba.json` (por ejemplo 4327 y 4329) y `EDITOR_CONFIG=config.prueba.json`.
- La configuración va en capas: valores por defecto, `proyecto/config.json` (del equipo) y
  `editor/config.json` (personal, ignorado por Git).
- Traer, Enviar y los conflictos se prueban contra un Overleaf simulado, nunca contra `informe/`:
  `npm run entorno-prueba` en `editor/` crea `editor/.entorno-prueba/`, y
  `npm run companero -- <archivo> <texto>` simula a otra persona.
- El servidor no se apaga a pedido: sale solo a los diez minutos sin pestañas. Si un cambio toca
  código del servidor, el editor abierto sigue con el viejo hasta que se reinicie: avisar.
- Suite: `npm test` en `editor/` (unos tres minutos; una prueba usa el LanguageTool real en el
  puerto 4391). En un worktree hay que correr `npm install`, y LanguageTool no está: poner
  `"corrector": false` en `config.prueba.json`.
- El código, los comentarios y los mensajes al usuario van en español. La lógica que se puede
  probar vive en módulos sin DOM (`cliente/*.ts`, `compartido/`); lo que arma la pantalla, en
  `cliente/pantalla/`.

## Particularidades de Windows

- MiKTeX está en `%LOCALAPPDATA%\Programs\MiKTeX\miktex\bin\x64`; una terminal vieja puede no
  tenerlo en el PATH.
- `java` es un lanzador: para detener LanguageTool hay que detener el árbol de procesos
  (`taskkill /T`).
- Detener `npm run servir` deja vivo el `node` hijo: buscarlo por su puerto de prueba (nunca el
  4317) y detener ese proceso.
