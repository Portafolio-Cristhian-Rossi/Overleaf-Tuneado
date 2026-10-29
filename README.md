# Editor local de informes en LaTeX

Un editor que corre en tu máquina para escribir un informe en LaTeX que vive en Overleaf. Los
títulos, la negrita y las referencias se ven formateados; hay menús para insertar figuras,
tablas, ecuaciones y citas de Zotero; un corrector de ortografía y gramática; y dos botones para
sincronizar con Overleaf. Además, puede pedirle a Claude que compare el informe con el código de
la aplicación que describe y consigo mismo.

Los archivos siguen siendo los `.tex` de siempre: el resto del equipo puede seguir en Overleaf.
Funciona en Windows 10 y 11.

## Por dónde empezar

| Querés… | Leé |
|---|---|
| Instalarlo y usarlo | [`editor/INSTALACION.md`](editor/INSTALACION.md) |
| Conectarlo con Claude, con el código de la aplicación y con Overleaf | [`editor/GUIA-CLAUDE.md`](editor/GUIA-CLAUDE.md) |
| Saber qué es propio de tu proyecto | `proyecto/LEEME.md`, en la rama de tu proyecto |

## Ramas

`main` es la herramienta, sin nada de ningún proyecto. Cada proyecto tiene su rama, que es
`main` más dos carpetas: `proyecto/` y `.claude/`. Para usar el editor, pasate a la rama de tu
proyecto. Las mejoras del editor se hacen en `main` (por medio de ramas `feature/…`) y cada
proyecto las trae a su rama; nunca al revés.

## Armar un proyecto nuevo

1. Creá la rama desde `main`:

```bash
git checkout -b <nombre-del-proyecto> main
```

2. Agregá los archivos del proyecto. Todos son opcionales: si falta uno, el editor usa su valor
   por defecto.

| Archivo | Qué es |
|---|---|
| `proyecto/config.json` | Configuración del equipo: `principal`, `repositorio`, `ramaRepositorio`, `glosario`, `marcoTeorico`, `limiteVerificacion` (`editor/INSTALACION.md`, sección 8). Rutas relativas a `proyecto/`. |
| `proyecto/verificacion-codigo.md` | Reglas extra para la verificación contra el código. |
| `proyecto/guia-estilo.md` | Guía de estilo para los pedidos del botón **IA**. El editor la crea al guardarla. |
| `proyecto/correccion.json` | Diccionario del equipo. El editor lo crea al agregar la primera palabra. |
| `proyecto/LEEME.md` | Lo que un integrante nuevo necesita saber: el proyecto de Overleaf, el repositorio de la aplicación, a quién preguntar. |
| `.claude/rules/<proyecto>.md` | Reglas para las sesiones de Claude en este proyecto. |
| `.claude/settings.json` | Por ejemplo, el repositorio de la aplicación como carpeta adicional. |

3. Commiteá y subí la rama. No modifiques ningún archivo que exista en `main`: lo que haga falta
   cambiar en el editor va en una `feature/…` desde `main`.
