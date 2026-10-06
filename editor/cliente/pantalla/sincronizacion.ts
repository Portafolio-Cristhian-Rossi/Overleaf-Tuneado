import { api } from '../api';
import type { ControlEditor } from '../editor';
import { avisoDeEnviar, avisoDeTraer, type Aviso } from '../mensajes';
import type { Barra } from './barra';
import { el } from './dom';

const INTERVALO_DE_REVISION_MS = 30 * 1000;

export function crearSincronizacion(barra: Barra, o: {
  editor: ControlEditor;
  alActualizar(): Promise<void>;                 // recargar proyecto y archivo abierto
  alConflicto(archivos: string[]): void;
}): { revisar(): Promise<void> } {
  const novedad = el('span', { clase: 'novedad', role: 'status' });
  const traer = el('button', { type: 'button', alClick: () => { void operar('traer'); } }, 'Traer');
  const enviar = el('button', { type: 'button', alClick: () => { void operar('enviar'); } }, 'Enviar');
  barra.zonaAcciones.append(novedad, traer, enviar);

  let enCurso = false;

  async function operar(cual: 'traer' | 'enviar'): Promise<void> {
    if (enCurso) return;
    enCurso = true;
    traer.disabled = enviar.disabled = true;
    novedad.textContent = cual === 'traer' ? 'Trayendo…' : 'Enviando…';
    try {
      await o.editor.guardarAhora();
      let aviso: Aviso | null;
      let conflicto: string[] | null = null;
      if (cual === 'traer') {
        const r = await api.traer();
        aviso = avisoDeTraer(r);
        if (r.tipo === 'conflicto') conflicto = r.archivos;
      } else {
        const r = await api.enviar();
        aviso = avisoDeEnviar(r);
        if (r.tipo === 'conflicto') conflicto = r.archivos;
      }
      if (aviso) barra.avisar(aviso.texto, aviso.tipo);
      // Enviar trae primero: lo traído ya está en disco aunque el envío haya fallado después.
      if (conflicto) o.alConflicto(conflicto);
      else await o.alActualizar();
    } catch (e) {
      barra.avisar((e as Error).message, 'error');
    } finally {
      enCurso = false;
      traer.disabled = enviar.disabled = false;
      novedad.textContent = '';
      await revisar();
    }
  }

  async function revisar(): Promise<void> {
    if (enCurso) return;
    try {
      const estado = await api.estadoGit();
      // Durante un conflicto lo nuevo ya está a medio traer: el aviso solo confundiría.
      novedad.textContent = estado.commitsSinTraer > 0 && !estado.combinacionEnCurso ? 'Hay cambios nuevos en Overleaf' : '';
      const pendiente = estado.cambiosLocales || estado.commitsSinEnviar > 0;
      enviar.classList.toggle('pendiente', pendiente);
      enviar.title = pendiente ? 'Tenés cambios sin enviar' : '';
      if (estado.combinacionEnCurso) o.alConflicto(estado.archivosEnConflicto);
    } catch {
      // El servidor no responde: el guardado ya lo informa en la barra.
    }
  }

  setInterval(() => { void revisar(); }, INTERVALO_DE_REVISION_MS);
  return { revisar };
}
