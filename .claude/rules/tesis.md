# Tesis: análisis de tópicos en sitios con participación uruguaya

Proyecto de grado de Ingeniería en Computación (Facultad de Ingeniería, UdelaR). Los datos del
proyecto (Overleaf, repositorio de la aplicación, Zotero) están en `proyecto/LEEME.md`.

## El informe

- `informe/` se comparte con tres integrantes y dos supervisores: un push lo ven todos.
- No modificar `informe/prgrado.cls` (plantilla de la facultad): los paquetes se agregan en
  `main.tex`. La clase no carga amsmath: usar `\mathrm`, `\mbox`, `\[ \]`.
- El repositorio de la aplicación que describe el informe es `../uy-social-topic-modeling`
  (carpeta hermana de este repositorio). Se lee libremente; no se modifica desde acá.
- Nunca leer, mostrar ni pedir el `.env` de la aplicación: tiene contraseñas y API keys. Para
  saber qué variables existen, usar `.env.example`. `.claude/settings.json` bloquea leer
  cualquier `.env`.

## Redactar en `informe/*.tex`

- **Estilo:** seguir `proyecto/guia-estilo.md` (primera persona del plural, oraciones cortas,
  "tópico", términos en inglés en cursiva).
- **Citas:** por defecto, solo claves que ya estén en `informe/referencias.bib`. Donde falte una
  obra, dejar visible `[FALTA: cita de Autor (año)]` (convención del editor) y pasarle la lista a
  quien pidió el texto. Si pide que las agregues: al `.bib` con la clave que daría Zotero
  (`apellido_palabra_año`), en orden por clave, con datos verificados (Crossref, ACL Anthology),
  y anotadas en la nota del encabezado del `.bib` como pendientes de cargar en Zotero.
- **Finales de línea:** los `.tex` están en CRLF y las herramientas de escritura dejan LF.
  Convertir después, sin dejar un CR suelto al final del archivo (Git lo trataría como binario).
  `sed -i` de Git Bash también deja LF.
- **Verificar** compilando con `-output-directory` fuera de `informe/` (pdflatex; bibtex con
  `BIBINPUTS` y `BSTINPUTS` apuntando a `informe/`; pdflatex dos veces).
- Quien escribe puede estar editando y commiteando desde el editor al mismo tiempo: releer el
  archivo justo antes de escribirlo.

## Zotero

- La bibliografía está en la biblioteca de grupo de Zotero "Tesis2026-Cris,Pache,Nacho"
  (id 6491700), no en "Mi biblioteca".
- Se lee por la API local de Zotero, solo GET y con Zotero abierto:
  `http://127.0.0.1:23119/api/groups/6491700/items/top?format=json` (o `format=bibtex`).
- `informe/referencias.bib` usa las claves de Zotero (`apellido_palabra_año`) porque el editor
  cita desde Zotero y reconoce una obra ya cargada por DOI o por título + año + primer apellido:
  si una entrada del `.bib` difiere de la ficha de Zotero en esos datos, citarla desde el editor
  agrega un duplicado.
- Colibri (colibri.udelar.edu.uy) bloquea las consultas automáticas con 403: para completar datos
  de tesis de la Udelar, leer la carátula del PDF local con `pdftotext`. Para artículos con DOI
  sirve `https://api.crossref.org/works/<doi>`.
