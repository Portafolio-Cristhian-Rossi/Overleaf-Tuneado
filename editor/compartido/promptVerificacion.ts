// Arma el texto que recibe el agente verificador. Sin módulos de Node: se prueba solo.
import { analizar } from './analizador';
import type { Ignorado } from './verificacion';

export function notasPorSeccion(texto: string): { titulo: string; notas: string[] }[] {
  const secciones: { titulo: string; notas: string[] }[] = [];
  let actual: { titulo: string; notas: string[] } | null = null;
  const elementos = analizar(texto).sort((a, b) => a.desde - b.desde);
  for (const e of elementos) {
    if (e.tipo === 'titulo') {
      actual = { titulo: texto.slice(e.contenido.desde, e.contenido.hasta), notas: [] };
      secciones.push(actual);
    } else if (e.tipo === 'comentario' && actual) {
      const nota = texto.slice(e.desde, e.hasta).replace(/^%/, '').trim();
      if (nota) actual.notas.push(nota);
    }
  }
  return secciones.filter(s => s.notas.length > 0);
}

function lineaDeIgnorado(i: Ignorado): string {
  if (i.cita) return `- [${i.tipo}] ${i.archivoInforme}: «${i.cita}» — ${i.explicacion}`;
  return `- [${i.tipo}] ${i.archivoInforme} (repositorio/${i.archivoRepo}): ${i.explicacion}`;
}

export function armarPromptDeVerificacion(o: {
  archivos: { ruta: string; texto: string }[]; rama: string; commit: string; ignorados: Ignorado[];
}): string {
  const lista = o.archivos.map(a => `- informe/${a.ruta}`).join('\n');
  const notas = o.archivos
    .map(a => ({ ruta: a.ruta, secciones: notasPorSeccion(a.texto) }))
    .filter(a => a.secciones.length > 0)
    .map(a => `### ${a.ruta}\n${a.secciones.map(s => `- ${s.titulo}: ${s.notas.join(' ')}`).join('\n')}`)
    .join('\n\n');
  const ignorados = o.ignorados.length > 0
    ? `## Ya ignorados\nNo vuelvas a reportar estos:\n${o.ignorados.map(lineaDeIgnorado).join('\n')}\n\n`
    : '';
  return `Sos un revisor técnico. Compará el informe de un proyecto de grado con el código de la aplicación que describe y devolvé solo los lugares donde no coinciden.

En la carpeta de trabajo hay dos carpetas:
- informe/: los archivos LaTeX a revisar. Solo los de la lista de abajo.
- repositorio/: el código de la aplicación, rama ${o.rama}, commit ${o.commit}.

Tipos de hallazgo:
- "contradiccion": el informe dice algo y el código hace otra cosa.
- "no-lo-cuenta": está en el código y la sección debería contarlo, según sus notas o su texto. Los detalles de programación van en los anexos: no reclames cada función.
- "sin-respaldo": el informe afirma algo que no aparece en el código.

## Archivos a revisar
${lista}

## Qué debería contar cada sección
Son las notas % que el equipo dejó bajo cada título.
${notas}

${ignorados}## Reglas
- Citá el informe textualmente: copiá la frase tal como está en el archivo, con sus comandos LaTeX.
- Citá el repositorio con la ruta relativa a repositorio/ y el número de línea.
- No propongas texto nuevo para el informe: solo decí qué pasa.
- La explicación va en español, en una o dos oraciones.
- Solo leé y buscá: no modifiques nada.
- Devolvé únicamente un arreglo JSON, sin texto alrededor ni bloque de código, con esta forma:
[{"tipo": "contradiccion", "informe": {"archivo": "Cap3.tex", "linea": 14, "cita": "frase del informe"}, "repo": {"archivo": "backend/jobs.py", "linea": 88}, "explicacion": "qué no coincide"}]
- En "no-lo-cuenta", "informe" lleva solo "archivo" y la "linea" del título donde iría. En "sin-respaldo", "repo" puede faltar.
- Si en una misma sección faltan varias cosas del mismo archivo del repositorio, juntalas en un solo hallazgo "no-lo-cuenta".
- Si no encontrás nada, devolvé [].
`;
}
