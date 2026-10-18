# Editor local del informe, etapa 5: verificador informe ↔ repositorio

Fecha: 2026-10-18
Estado: diseño aprobado por Cristhian en conversación; falta revisar este documento.
Continúa `2026-10-05-editor-local-informe-design.md`.

## 1. Para qué

El informe describe una aplicación que el equipo sigue desarrollando
(`uy-social-topic-modeling`: scrapers, base de datos, API, orquestadores,
frontend). El verificador busca dónde el informe y el código no coinciden:
la arquitectura, el modelo de datos, los pasos de preprocesamiento, los modelos
de tópicos y sus parámetros, las fuentes.

Hoy el capítulo de Solución está casi todo en notas `%`, así que al principio
lo más útil es saber qué del repositorio falta contar. Más adelante, encontrar
contradicciones.

Se descartó mostrar los comentarios de Overleaf: el puente Git no los trae.

## 2. Qué cambia respecto de la etapa 3

En la etapa 3 el editor no llamaba a ninguna IA. Esta etapa sí lanza un agente
(Claude Code, `claude -p`) con la cuenta de Cristhian, sin clave de API. Sigue
valiendo el invariante de fidelidad: nada de esta etapa escribe en `informe/`
ni en el repositorio de la aplicación.

## 3. Qué agrega

Un botón **Verificación ▾** en la barra, con:

| Opción | Revisa |
|---|---|
| Verificar capítulo | El archivo abierto y los que incluye con `\input`/`\include` |
| Verificar todo | Todos los archivos del proyecto; antes avisa que tarda bastante más |

Y una pestaña **Verificación** en el panel lateral, al lado de Gramática.

El botón queda deshabilitado, con su explicación, si falta `repositorio` en la
configuración o si ya hay una corrida en curso.

## 4. Configuración

En `editor/config.json`:

| Clave | Por defecto | Qué es |
|---|---|---|
| `repositorio` | sin valor | Ruta de `uy-social-topic-modeling` |
| `ramaRepositorio` | `"main"` | Rama contra la que se compara |
| `limiteVerificacion` | `{ "capitulo": 15, "todo": 45 }` | Minutos antes de cortar la corrida |

`cargarConfig` valida que `repositorio`, si está, sea una carpeta con Git, y
que la rama exista. Si no, el mensaje dice cuál de las dos cosas falla.

## 5. Una corrida, paso a paso

1. **Foto del informe.** El servidor copia los archivos a revisar a una carpeta
   temporal, tal como están en disco en ese momento. Si Cristhian sigue
   escribiendo mientras corre, no se mezcla.
2. **Foto del repositorio.** Resuelve el commit de `ramaRepositorio` y crea un
   `git worktree add --detach` en otra carpeta temporal. Solo trae archivos
   versionados: el `.env` (ignorado por Git) no está. La carpeta y la rama de
   Cristhian no se tocan.
3. **Prompt.** Arma la prompt (sección 6) y lanza `claude -p` con el worktree
   como carpeta de trabajo y la foto del informe agregada con `--add-dir`,
   salida `--output-format json` y herramientas limitadas a `Read`, `Grep` y
   `Glob`. Sin `Bash`, `Edit` ni `Write`.
4. **Progreso.** La barra muestra "Verificando…" con el tiempo transcurrido y un
   botón **Cancelar**. Cancelar o pasar el límite detiene el árbol de procesos
   (`taskkill /T` en Windows).
5. **Validación.** El servidor lee el JSON (sección 7) y descarta los hallazgos
   cuyas citas no existen (sección 8). Cuenta los descartados.
6. **Guardado.** Escribe `Tesis/verificaciones/<AAAA-MM-DD-HHmm>-<commit corto>.json`
   con la corrida completa y avisa a las pestañas abiertas.
7. **Limpieza.** Borra la foto del informe y quita el worktree
   (`git worktree remove --force`), también si la corrida falló o se canceló.

Mientras corre una verificación, el servidor no se apaga por falta de pestañas.
Si se cierra la pestaña, la corrida termina igual y queda guardada.

## 6. Qué lleva la prompt

1. **Tarea:** comparar el informe con el código y devolver solo hallazgos con
   evidencia en los dos lados (o en el repo, para "no lo cuenta").
2. **Qué revisar:** la lista de archivos de la foto del informe.
3. **Qué debería contar cada sección:** las notas `%` de cada título. Un
   hallazgo "el informe no lo cuenta" solo vale si la sección, por sus notas o
   su texto, debería contarlo. Los detalles de programación van en los anexos;
   no se reclama cada función.
4. **Ya ignorados:** los hallazgos de `ignorados.json` que tocan estos
   archivos, para no repetirlos.
5. **Reglas:**
   - Citar el informe textualmente, tal como está en el archivo.
   - Citar el repositorio con ruta relativa y línea.
   - No proponer texto nuevo para el informe: solo decir qué pasa.
   - Devolver únicamente el JSON, sin texto alrededor.

## 7. Formato de un hallazgo

```json
{
  "tipo": "contradiccion | no-lo-cuenta | sin-respaldo",
  "informe": { "archivo": "Cap3_2 - Como.tex", "linea": 14, "cita": "la API escribe en la base" },
  "repo": { "archivo": "backend/orquestador/jobs.py", "linea": 88 },
  "explicacion": "Quien escribe en la base es el orquestador, no la API."
}
```

- `contradiccion`: el informe dice algo y el código hace otra cosa. Lleva los dos lados.
- `no-lo-cuenta`: está en el código y la sección debería contarlo. `informe`
  lleva solo `archivo` (la sección donde iría); `repo` es obligatorio.
- `sin-respaldo`: el informe afirma algo que no aparece en el código. `repo` es opcional.

La corrida guardada agrega: fecha, alcance, archivos revisados, rama, commit,
duración, cantidad de descartados y la lista de hallazgos, cada uno con su `id`.

El `id` es un hash de `tipo` + archivo del informe + cita normalizada (espacios
colapsados) + archivo del repo. Sirve para comparar corridas y para lo ignorado.

## 8. Validación de citas

Un hallazgo se descarta si:

- el archivo del informe no está en la foto, o la cita normalizada no aparece
  en él (se busca en todo el archivo; la línea es solo una pista);
- el archivo del repo no existe en el worktree, o la línea está fuera de rango;
- el tipo no es uno de los tres, o le falta un lado obligatorio.

Si el JSON no se puede leer, la corrida se guarda como fallida con la salida
cruda, para poder ver qué pasó.

## 9. Panel Verificación

- **Encabezado:** fecha, alcance, rama y commit, y la diferencia con la corrida
  anterior del mismo alcance ("3 nuevos · 2 ya no aparecen"). Si hubo
  descartados, lo dice ("2 hallazgos descartados por citas que no existen").
- **Lista** agrupada por tipo y, dentro, por archivo del informe. Cada
  hallazgo muestra la cita, el lugar del repo con un botón para copiar la ruta,
  y la explicación.
- **Clic** en un hallazgo: abre el archivo del informe y salta a la cita.
- **Subrayado:** las citas se ubican buscándolas en el texto actual, con un
  color distinto del de gramática. Si la cita ya no está, el hallazgo dice
  "la frase cambió" y no subraya nada.
- **Resuelto:** lo oculta en esta corrida; se anota en el archivo de la
  corrida, así que sigue oculto al recargar. Si una corrida posterior lo vuelve
  a encontrar, aparece de nuevo.
- **Ignorar:** lo guarda en `verificaciones/ignorados.json` (con su cita y
  explicación) y no se muestra más. "Ver ignorados" permite recuperarlo.
- Al abrir el editor, el panel muestra la última corrida guardada.

## 10. Errores que el panel explica

| Situación | Mensaje |
|---|---|
| `claude` no está instalado | Cómo instalar el CLI de Claude Code |
| No inició sesión | Que abra una terminal y corra `claude` una vez para entrar |
| La rama no existe | Qué rama se buscó y en qué carpeta |
| Se pasó del límite | Cuánto duró y la opción de subir `limiteVerificacion` |
| JSON ilegible | Que la corrida quedó guardada como fallida |

## 11. Dónde vive cada cosa

- `compartido/verificacion.ts`: tipos, `id`, normalización, validación de
  hallazgos y comparación entre corridas. Sin DOM ni disco.
- `servidor/verificador.ts`: fotos, worktree, prompt, lanzamiento del agente,
  límite, cancelación, guardado y limpieza. El lanzador se recibe como
  parámetro, para poder reemplazarlo en las pruebas.
- `servidor/app.ts`: rutas para lanzar, cancelar, leer la última corrida e
  marcar resueltos e ignorar o recuperar hallazgos.
- `cliente/verificacion.ts`: ubicación de citas en el texto y qué hallazgos
  mostrar. Sin DOM.
- `cliente/pantalla/panelVerificacion.ts`: el panel.
- `.gitignore` del repositorio del editor: agrega `/verificaciones/`.

## 12. Pruebas

En `npm test`, sin CLI ni tokens: el lanzador real se reemplaza por un script
que devuelve un JSON fijo (o que tarda, o que falla).

- Validación: cita exacta, cita con otros espacios, cita inventada, archivo del
  repo inexistente, línea fuera de rango, tipo inválido, lado faltante.
- `id` estable ante cambios de espacios; comparación entre corridas.
- Ubicación de citas en un texto editado; cita que desapareció.
- Ignorados: guardar, filtrar y recuperar.
- Worktree contra un repositorio de prueba: se crea en el commit de la rama, no
  trae archivos ignorados y se borra tras éxito, falla y cancelación.
- Errores: CLI ausente, JSON roto, límite superado, cancelación, una sola
  corrida a la vez.
- Configuración: `repositorio` ausente, inválido, rama inexistente.

Prueba manual: una corrida real de "Verificar capítulo" sobre un capítulo corto,
revisando a mano que las citas y las rutas sean ciertas.

## 13. Fuera de alcance

- Comentarios de Overleaf.
- Proponer o escribir texto para el informe a partir de un hallazgo.
- Abrir el archivo del repositorio en otro editor.
- Elegir la rama en cada corrida.
