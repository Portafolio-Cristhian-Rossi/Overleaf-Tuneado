# Editor local del informe, etapa 2: corrección

Fecha: 2026-10-06
Estado: diseño aprobado por Cristhian en conversación; incluye el plan de implementación.
Continúa `2026-10-05-editor-local-informe-design.md` (sección 7).

## 1. Qué agrega

1. Autocorrección al terminar una palabra, solo en casos inequívocos.
2. Subrayado de ortografía y gramática en español, con sugerencias.
3. Pestaña "Gramática" en el panel derecho con los avisos del capítulo.
4. Diccionario personal.

Sigue valiendo el invariante de fidelidad: la corrección solo cambia el texto
cuando el usuario acepta una sugerencia, o en los tres casos de autocorrección.

## 2. Hechos verificados (sonda del 2026-10-06)

- LanguageTool 6.6 en `editor/languagetool/LanguageTool-6.6/` (391 MB, fuera de
  Git). Java 26 instalado; 16 GB de memoria.
- Con el `TEMP` de este usuario, Java no puede abrir su servidor HTTP
  ("Unable to establish loopback connection"). Arranca bien con
  `-Djdk.net.unixdomain.tmpdir=<editor>/languagetool/tmp`.
- Arranque en unos 5 s; la primera consulta tarda 3 s (precalentar); después,
  un párrafo tarda entre 25 y 150 ms. Un capítulo entero de una vez puede
  tardar varios segundos: se revisa por párrafo y con caché.
- El API acepta texto anotado (`data`): se le marca qué es LaTeX y qué es
  prosa, y devuelve posiciones sobre el texto original.
- Una palabra que no existe llega con la regla `MORFOLOGIK_RULE_ES`. Las
  tildes que dependen del contexto (`mas`, `mi`, `calculo`, `sera`) llegan con
  otras reglas: son heurísticas sobre palabras válidas.
- Las siglas en mayúsculas no se marcan. Los términos en inglés sí, con
  sugerencias absurdas (`Topic` → `Tópico`).

## 3. Arquitectura

```
Navegador                         Servidor Node                 Java
 corrección (CodeMirror lint) ──► /api/correccion/* ──► LanguageTool :4319
 autocorrección                   prosa → texto anotado         (solo localhost)
 panel Gramática                  caché por párrafo
                                  correccion.json (diccionario, excepciones)
```

- El servidor Node lanza LanguageTool como proceso hijo al arrancar, oculto,
  con `-Xmx1g`, y lo termina al salir. Si el puerto ya responde como
  LanguageTool (quedó huérfano de una sesión anterior), lo reutiliza.
- Si falta Java, falta la carpeta o no arranca, el corrector queda
  `no-disponible` con su motivo y el editor funciona como en la etapa 1, con
  el corrector del navegador. Con el corrector listo, el del navegador se apaga.
- Nada de esto escribe en `informe/`.

## 4. Unidades

**`compartido/prosa.ts`** — `segmentar(texto): Segmento[]`, con
`Segmento = { tipo: 'texto' | 'marca'; fuente: string; como?: string }`.
Invariante: concatenar `fuente` reproduce el texto. Es `marca` todo lo que no
es prosa: comentarios, preámbulo, comandos y sus argumentos no textuales
(`\ref`, `\cite…`, `\label`, `\includegraphics`, `\begin`/`\end`, `\input`,
`\url`), matemática (`$…$`, `\(…\)`, `\[…\]`, `equation`, `align`), y el
contenido de `verbatim`, `lstlisting`, `minted` y `tabular`. El argumento de
los comandos de formato y de título, de `\caption`, `\footnote` y de comandos
desconocidos sí es texto. `como` indica por qué reemplazarlo al revisar:
`~` → espacio, salto de línea simple → espacio, `\ref` → `1`, cita entre
paréntesis → `(Autor, 2020)`, cita textual → `Autor (2020)`, matemática en
línea → `X`, escapes (`\%`, `\&`, `\_`) → su carácter.
`parrafos(texto): Rango[]` separa por líneas en blanco.

**`compartido/autocorreccion.ts`** — función pura
`decidir(palabra, aviso | null, excepciones): string | null`. Solo actúa si el
aviso es `MORFOLOGIK_RULE_ES`, cubre exactamente la palabra y esta no está en
excepciones. Ignora sugerencias con espacios. Tres clases, en orden:
1. *Tilde:* entre las sugerencias, las que sin tildes son iguales a la palabra
   sin tildes. Si hay exactamente una, es esa.
2. *Letras invertidas* (palabra de 4 letras o más): sugerencias que son la
   palabra con dos letras vecinas intercambiadas. Primero comparando tal cual;
   si no hay ninguna, comparando sin tildes. Exactamente una, o nada.
3. *Doble mayúscula inicial* (`ESta`): la forma `Esta`, si está entre las
   sugerencias.
Además, una lista corta de palabras que nunca existen sin tilde y que
LanguageTool informa con reglas propias (`tambien`, `ademas`, `segun`,
`despues`, `aqui`, `asi`, `alli`, `ahi`, `jamas`, `quizas`, `traves`,
`detras`, `atras`): se corrigen si el aviso, de cualquier regla, propone esa
forma con tilde.

**`servidor/languagetool.ts`** — ciclo de vida del proceso y
`revisar(parrafo): Promise<Aviso[]>`: segmenta, consulta con texto anotado,
filtra las palabras del diccionario personal, guarda en una caché por texto de
párrafo (se vacía al cambiar el diccionario). `Aviso = { desde, hasta, tipo:
'ortografia' | 'gramatica' | 'estilo'; regla; mensaje; sugerencias }`, con
posiciones relativas al párrafo. Reglas desactivadas: `WHITESPACE_RULE`.

**`servidor/diccionario.ts`** — lee y escribe `editor/correccion.json`
(`{ palabras: string[]; excepciones: string[] }`), creando el archivo al
primer uso. Escritura atómica.

**Rutas** — `GET /api/correccion/estado`; `POST /api/correccion/revisar`
`{ parrafos: string[] }` → `Aviso[][]`; `POST /api/correccion/palabra`
`{ palabra }` (agrega al diccionario); `POST /api/correccion/excepcion`
`{ palabra }`.

**`cliente/correccion.ts`** — extensión de CodeMirror sobre `@codemirror/lint`:
- Fuente de avisos: parte el documento en párrafos, pide al servidor los que
  cambiaron (caché local por texto), 750 ms después de la última tecla.
- Subrayado rojo para ortografía, ámbar para gramática y estilo. Al pasar el
  cursor: mensaje, sugerencias como botones, "Agregar al diccionario" en
  ortografía.
- Autocorrección: al tipear un separador después de una palabra en un tramo
  de prosa, revisa ese párrafo y aplica `decidir`. Antes de reemplazar
  comprueba que la palabra siga ahí. Lo corregido queda marcado 2 s.
- Aprendizaje: si un Ctrl+Z deshace una autocorrección, cuenta; a la segunda
  vez de la misma palabra, la agrega a excepciones.
- Solo en archivos `.tex`, y nunca con el editor en solo lectura.

**`cliente/pantalla/panelGramatica.ts`** — pestañas "PDF" y "Gramática" en el
panel derecho. La lista muestra cada aviso con su texto y mensaje; un clic
lleva al lugar. Con el corrector no disponible, explica el motivo.

**Instalación** — `npm run instalar-corrector` descarga y descomprime
LanguageTool; `INSTALACION.md` suma el requisito de Java y la sección de
corrección. Opciones nuevas en `config.json`: `corrector` (true),
`puertoCorrector` (4319).

## 5. Errores

| Situación | Comportamiento |
|---|---|
| Java o LanguageTool ausentes | Corrector no disponible; el panel dice cómo instalarlo. Sin subrayados propios; vuelve el corrector del navegador. |
| LanguageTool se cae | El servidor lo relanza hasta tres veces; después, no disponible. |
| Una consulta falla o tarda más de 10 s | Ese párrafo queda sin avisos; se reintenta con la próxima edición. Nunca bloquea la escritura ni el guardado. |
| La palabra cambió antes de llegar la respuesta | No se autocorrige. |

## 6. Pruebas

Automáticas: invariante de `segmentar` sobre todos los fixtures y casos por
construcción; `decidir` con las respuestas reales de la sonda (`analisis`,
`metodo`, `invesitgacion`, `trabjao`, `modleo`, `ESta`, `topic`, `calculo`,
`embeddings`, `tambien`); cliente de LanguageTool contra un servidor HTTP
falso (anotación enviada, mapeo de posiciones, caché, filtro de diccionario,
tiempos de espera) y arranque con un `spawn` falso; diccionario; rutas;
partición en párrafos y detección de palabra terminada. Una prueba de
integración con el LanguageTool real, que se saltea si no está instalado.

Manual, en el entorno de prueba: los tres casos de autocorrección y su
Ctrl+Z; que no toque matemática, código ni claves; subrayados y sugerencias;
diccionario; panel; arranque con y sin LanguageTool; que el guardado y
Traer/Enviar sigan igual.

## 7. Plan de implementación

Rama `etapa-2`. TDD en cada tarea, un commit por tarea, revisión
independiente de toda la rama al final.

1. `compartido/prosa.ts` y pruebas.
2. `compartido/autocorreccion.ts` y pruebas.
3. `servidor/diccionario.ts` y pruebas.
4. `servidor/languagetool.ts` y pruebas (servidor falso, `spawn` falso,
   integración opcional).
5. Rutas en `app.ts`, arranque en `index.ts`, configuración, y pruebas.
6. `cliente/correccion.ts`: avisos, autocorrección y aprendizaje, con pruebas
   de sus partes puras; estilos.
7. `cliente/pantalla/panelGramatica.ts` y pestañas del panel.
8. `npm run instalar-corrector`, `INSTALACION.md`, verificación manual.

## 8. Fuera de alcance

Revisión de estilo con IA (etapa 3), otros idiomas, reglas configurables por
el usuario, corrección dentro de tablas.
