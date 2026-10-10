# Tesis: editor local del informe

Proyecto de grado de Cristhian. Conversar en español, con mensajes cortos y concretos sobre qué
tiene que hacer él.

## Carpetas

- `editor/`: la aplicación (servidor Node + cliente con CodeMirror). Es lo que vive en este
  repositorio. La guía de uso e instalación es `editor/INSTALACION.md`.
- `docs/superpowers/specs/`: las especificaciones de cada etapa del editor.
- `informe/`: **no está en este repositorio**. Es un clon Git del proyecto de Overleaf que
  Cristhian comparte con dos compañeros y dos supervisores.
- `build/`: el PDF y los temporales de LaTeX. Se regenera.

## Reglas sobre `informe/`

- Un `git push` desde `informe/` publica en el documento compartido del equipo. Confirmar con
  Cristhian antes de cualquier push, commit o edición de contenido ahí. Leer es libre.
- Nunca usar, pedir ni repetir tokens de Overleaf. Si Git pide credenciales, las ingresa él.
- No modificar `prgrado.cls` (plantilla de la facultad): los paquetes se agregan en `main.tex`.
- Código, salidas de compilación y documentos de diseño van fuera de `informe/`.

## Cómo trabajar en el editor

- El ícono del escritorio ejecuta lo que hay en `editor/` (la rama en uso y su `dist/`
  compilado), no una copia aparte. Trabajar en un worktree deja intacto lo que Cristhian usa;
  integrar a `main` es a pedido suyo y exige `npm run build`.
- Si su editor está abierto (puertos 4317 y 4319), no detenerlo. Para probar, usar otros puertos
  con un `editor/config.prueba.json` (por ejemplo 4327 y 4329) y `EDITOR_CONFIG=config.prueba.json`.
- Traer, Enviar y los conflictos se prueban contra un Overleaf simulado, nunca contra `informe/`:
  `npm run entorno-prueba` en `editor/` crea `editor/.entorno-prueba/`, y
  `npm run companero -- <archivo> <texto>` simula a otra persona.
- El servidor no se apaga a pedido: sale solo a los diez minutos sin pestañas. Si un cambio toca
  código del servidor, el editor abierto sigue con el viejo hasta que se reinicie: avisarle.
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
