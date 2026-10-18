import { describe, expect, it } from 'vitest';
import { armarPromptDeVerificacion, notasPorSeccion } from './promptVerificacion';
import type { Ignorado } from './verificacion';

const TEXTO = '\\chapter{Solución}\n% Cómo quedó el sistema.\n\\section{Arquitectura general}\n% Un solo diagrama.\n%   Y un párrafo por pieza.\nTexto.\n% nota suelta\n\\section{Uso}\n';

const ignorado = (o: Partial<Ignorado>): Ignorado => ({
  id: 'a', tipo: 'no-lo-cuenta', archivoInforme: 'Cap3.tex', cita: null, archivoRepo: 'x.py', explicacion: 'Falta x.', fecha: '', ...o,
});

describe('notasPorSeccion', () => {
  it('junta las notas que siguen a cada título', () => {
    expect(notasPorSeccion(TEXTO)).toEqual([
      { titulo: 'Solución', notas: ['Cómo quedó el sistema.'] },
      { titulo: 'Arquitectura general', notas: ['Un solo diagrama.', 'Y un párrafo por pieza.', 'nota suelta'] },
    ]);
  });

  it('omite los comentarios vacíos y los anteriores al primer título', () => {
    expect(notasPorSeccion('% antes\n\\section{A}\n%\n% \n% nota\n')).toEqual([{ titulo: 'A', notas: ['nota'] }]);
  });
});

describe('armarPromptDeVerificacion', () => {
  const base = { archivos: [{ ruta: 'Cap3.tex', texto: TEXTO }], rama: 'main', commit: '583d2cc' };

  it('lista los archivos, la rama, las notas y los ignorados', () => {
    const p = armarPromptDeVerificacion({ ...base, ignorados: [ignorado({})] });
    expect(p).toContain('- informe/Cap3.tex');
    expect(p).toContain('rama main, commit 583d2cc');
    expect(p).toContain('### Cap3.tex');
    expect(p).toContain('- Arquitectura general: Un solo diagrama. Y un párrafo por pieza. nota suelta');
    expect(p).toContain('## Ya ignorados');
    expect(p).toContain('- [no-lo-cuenta] Cap3.tex (repositorio/x.py): Falta x.');
    expect(p).toContain('- Si en una misma sección faltan varias cosas del mismo archivo del repositorio, juntalas en un solo hallazgo "no-lo-cuenta".\n- Si no encontrás nada, devolvé [].');
    expect(p.trim().endsWith('Si no encontrás nada, devolvé [].')).toBe(true);
  });

  it('escribe el ignorado con cita', () => {
    const p = armarPromptDeVerificacion({ ...base, ignorados: [ignorado({ tipo: 'contradiccion', cita: 'frase', explicacion: 'No coincide.' })] });
    expect(p).toContain('- [contradiccion] Cap3.tex: «frase» — No coincide.');
  });

  it('sin ignorados no lleva esa sección', () => {
    expect(armarPromptDeVerificacion({ ...base, ignorados: [] })).not.toContain('## Ya ignorados');
  });

  it('no abre sección para un archivo sin notas', () => {
    const p = armarPromptDeVerificacion({ ...base, archivos: [{ ruta: 'Vacio.tex', texto: '\\section{A}\n' }], ignorados: [] });
    expect(p).toContain('- informe/Vacio.tex');
    expect(p).not.toContain('### Vacio.tex');
  });
});
