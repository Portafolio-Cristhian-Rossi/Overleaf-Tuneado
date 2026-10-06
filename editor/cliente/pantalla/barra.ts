import type { EstadoGuardado } from '../editor';
import { el } from './dom';

const TEXTOS: Record<EstadoGuardado, string> = {
  'guardado': 'Guardado',
  'guardando': 'Guardando…',
  'sin-guardar': 'Sin guardar',
  'error': 'No se pudo guardar',
};

const DURACION_DE_AVISO_MS = 6000;

export function crearBarra(padre: HTMLElement) {
  const titulo = el('span', { clase: 'barra-titulo' }, 'Editor del informe');
  const zonaFormato = el('div', { clase: 'barra-zona' });
  const guardado = el('span', { clase: 'guardado', role: 'status' });
  const zonaAcciones = el('div', { clase: 'barra-zona' });
  const aviso = el('div', { clase: 'aviso', role: 'status', hidden: true });
  padre.append(titulo, zonaFormato, el('span', { clase: 'barra-espacio' }), guardado, zonaAcciones);
  padre.after(aviso);

  let reloj: ReturnType<typeof setTimeout> | undefined;
  const ocultar = () => { aviso.hidden = true; };
  aviso.addEventListener('click', ocultar);

  return {
    zonaFormato,
    zonaAcciones,
    mostrarTitulo(texto: string) { titulo.textContent = texto; },
    mostrarGuardado(e: EstadoGuardado) {
      guardado.textContent = TEXTOS[e];
      guardado.dataset.estado = e;
    },
    // Los avisos informativos se van solos; los errores quedan hasta que se los cierra.
    avisar(texto: string, tipo: 'info' | 'error') {
      clearTimeout(reloj);
      aviso.textContent = texto;
      aviso.dataset.tipo = tipo;
      aviso.title = 'Clic para cerrar';
      aviso.hidden = false;
      if (tipo === 'info') reloj = setTimeout(ocultar, DURACION_DE_AVISO_MS);
    },
  };
}

export type Barra = ReturnType<typeof crearBarra>;
