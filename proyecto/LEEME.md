# Tesis: lo propio de este proyecto

Proyecto de grado *Análisis de tópicos en sitios con participación uruguaya* (Ingeniería en
Computación, UdelaR). Esta rama es `main` más esta carpeta y `.claude/`. La instalación general
está en `editor/INSTALACION.md`; cómo usar Claude, en `editor/GUIA-CLAUDE.md`.

## Lo que necesitás

| Qué | Dónde |
|---|---|
| El informe en Overleaf | `https://www.overleaf.com/project/6a233efea8d52f9e32794192` |
| Clon del informe (`INSTALACION.md`, sección 3) | `git clone https://git@git.overleaf.com/6a233efea8d52f9e32794192 informe` |
| Repositorio de la aplicación | `https://github.com/pachecus/uy-social-topic-modeling.git`, clonado al lado de la carpeta del repositorio |
| Bibliografía | Biblioteca de grupo de Zotero "Tesis2026-Cris,Pache,Nacho" |

Con el repositorio de la aplicación clonado al lado, las carpetas quedan así y no hace falta
configurar nada más:

```
GitHub/
├── Editor-Informe/                 este repositorio, en la rama tesis
└── uy-social-topic-modeling/
```

## Qué trae esta carpeta

- `config.json`: el repositorio de la aplicación (`../../uy-social-topic-modeling`) y su rama
  (`main`). El glosario es `Cap0 - Glosario.tex` y el marco teórico `Cap2 - Antecedentes.tex`:
  los reconocen los valores por defecto, así que no están configurados.
- `verificacion-codigo.md`: lo que el verificador contra el código sabe de esta tesis. Las
  definiciones de la sección Programación del glosario describen la aplicación y se comparan con
  el código; las de IA y de Texto son conceptos generales y no, salvo los modelos de tópicos.
- `guia-estilo.md` y `correccion.json`: la guía de estilo y el diccionario del equipo. Cuando los
  cambies, commitealos en esta rama (`INSTALACION.md`, sección 12).

## Reglas para Claude

`.claude/rules/tesis.md` le cuenta a Claude cómo redactar en el informe, cómo citar y cómo leer
Zotero. `.claude/settings.json` le suma `../uy-social-topic-modeling` como carpeta que puede
leer: la primera vez que abras Claude Code en la carpeta del repositorio, aceptá que confiás en
ella.
