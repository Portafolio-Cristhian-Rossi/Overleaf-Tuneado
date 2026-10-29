// Arma el texto que recibe el agente que revisa el informe contra sí mismo. Sin módulos de Node: se prueba solo.
import { notasPorSeccion } from './promptVerificacion';
import type { Ignorado } from './verificacion';

function lineaDeIgnorado(i: Ignorado): string {
  const cita = i.cita ? `«${i.cita}»` : '';
  const ver = i.archivoReferencia ? ` (ver ${i.archivoReferencia})` : '';
  return `- [${i.tipo}] ${i.archivoInforme}: ${cita}${ver} — ${i.explicacion}`;
}

// Cómo se nombran las referencias según cuáles haya: "el glosario", "el marco teórico" o los dos.
function nombres(glosario: boolean, marco: boolean): { cualquiera: string; ninguno: string } {
  if (glosario && marco) return { cualquiera: 'el glosario o el marco teórico', ninguno: 'el glosario ni en el marco teórico' };
  const uno = glosario ? 'el glosario' : 'el marco teórico';
  return { cualquiera: uno, ninguno: uno };
}

export function armarPromptDeVerificacionInforme(o: {
  capitulos: { ruta: string; texto: string }[];   // todos los de la foto, en el orden de main.tex
  revisados: string[];
  glosario: string | null;
  marcoTeorico: string | null;
  ignorados: Ignorado[];                           // ya filtrados por quien llama
}): string {
  const hayReferencias = o.glosario !== null || o.marcoTeorico !== null;
  const n = nombres(o.glosario !== null, o.marcoTeorico !== null);

  const tipos = [
    '- "se-contradice": dos partes del informe dicen cosas incompatibles. Lleva las dos citas.',
    hayReferencias && `- "definicion-distinta": un término se usa con otro sentido del que le da ${n.cualquiera}. La referencia es la definición.`,
    '- "corta-el-hilo": da por sabido algo que no se presentó antes, salta sin conexión con lo anterior o repite lo ya dicho. Si hay un pasaje anterior que lo explica, va como referencia.',
    hayReferencias && `- "sin-definir": usa un término o concepto central que no está en ${n.ninguno}. Lleva solo la cita donde se usa.`,
  ].filter(Boolean).join('\n');

  const orden = o.capitulos.map((c, i) => `${i + 1}. informe/${c.ruta}`).join('\n');
  const revisados = o.revisados.map((r) => `- informe/${r}`).join('\n');
  const referencias = hayReferencias
    ? `## Referencias\n${[
      o.glosario !== null && `- Glosario: informe/${o.glosario}`,
      o.marcoTeorico !== null && `- Marco teórico: informe/${o.marcoTeorico}`,
    ].filter(Boolean).join('\n')}\n\n`
    : '';
  const notas = o.capitulos
    .map((c) => ({ ruta: c.ruta, secciones: notasPorSeccion(c.texto) }))
    .filter((c) => c.secciones.length > 0)
    .map((c) => `### ${c.ruta}\n${c.secciones.map((s) => `- ${s.titulo}: ${s.notas.join(' ')}`).join('\n')}`)
    .join('\n\n');
  const ignorados = o.ignorados.length > 0
    ? `## Ya ignorados\nNo vuelvas a reportar estos:\n${o.ignorados.map(lineaDeIgnorado).join('\n')}\n\n`
    : '';

  return `Sos un revisor de informes. Revisá que el informe sea coherente consigo mismo y devolvé solo los problemas que encuentres, con las frases citadas.

En la carpeta de trabajo está informe/, con todos los archivos LaTeX del informe. Leé los que necesites.

Tipos de hallazgo:
${tipos}

## Orden de los capítulos
"Antes" quiere decir más arriba en esta lista. "corta-el-hilo" solo mira hacia atrás; "se-contradice" puede citar cualquier capítulo.
${orden}

## Archivos a revisar
La cita principal de cada hallazgo tiene que estar en uno de estos:
${revisados}

${referencias}## Qué debería contar cada sección
Son las notas % que el equipo dejó bajo cada título. Una sección que todavía es solo notas no se revisa, y lo que sus notas anuncian cuenta como ya presentado.
${notas}

${ignorados}## Reglas
- Citá textualmente: copiá cada frase tal como está en el archivo, con sus comandos LaTeX.
- No reclames lo que es normal en un borrador (secciones vacías, notas %, \\todo) ni cuestiones de redacción o estilo.
- No propongas texto nuevo para el informe: solo decí qué pasa.
- La explicación va en español, en una o dos oraciones.
- Solo leé y buscá: no modifiques nada.
- Devolvé únicamente un arreglo JSON, sin texto alrededor ni bloque de código, con esta forma:
[{"tipo": "se-contradice", "informe": {"archivo": "Cap3.tex", "linea": 14, "cita": "frase del capítulo revisado"}, "referencia": {"archivo": "Cap1.tex", "linea": 20, "cita": "frase del otro lugar"}, "explicacion": "qué no coincide"}]
${hayReferencias ? '- En "sin-definir" no va "referencia".\n' : ''}- Si no encontrás nada, devolvé [].
`;
}
