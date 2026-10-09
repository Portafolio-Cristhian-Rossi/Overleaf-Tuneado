import { el } from './dom';

export interface OpcionesDeGuia {
  leer(): Promise<string>;
  guardar(texto: string): Promise<void>;
  // Con cambios sin guardar, cerrar pregunta antes: true si se descartan.
  confirmarDescarte(): Promise<boolean>;
}

// Cuadro para corregir la guía de estilo que acompaña a cada prompt. Devuelve true si se guardó.
export function editarGuia(o: OpcionesDeGuia): Promise<boolean> {
  return new Promise((resolver) => {
    const dialogo = el('dialog', { clase: 'dialogo editor-de-guia', 'aria-label': 'Guía de estilo' });
    const cerrar = (guardada: boolean) => { dialogo.close(); dialogo.remove(); resolver(guardada); };

    // Lo que hay guardado; null mientras no se pudo leer.
    let original: string | null = null;
    const campo = el('textarea', { clase: 'guia-campo', 'aria-label': 'Guía de estilo', spellcheck: 'true', disabled: true, placeholder: 'Leyendo la guía…' });
    const aviso = el('p', { clase: 'guia-aviso', role: 'alert', hidden: true });
    const botonGuardar = el('button', { type: 'button', clase: 'principal', disabled: true, alClick: () => { void guardar(); } }, 'Guardar');
    const botonCancelar = el('button', { type: 'button', alClick: () => { void cancelar(); } }, 'Cancelar');

    function avisar(mensaje: string | null): void {
      aviso.textContent = mensaje ?? '';
      aviso.hidden = mensaje === null;
    }

    async function guardar(): Promise<void> {
      botonGuardar.disabled = true;
      avisar(null);
      try {
        await o.guardar(campo.value);
      } catch (e) {
        // Lo escrito queda en el cuadro para volver a intentar.
        avisar(`No se pudo guardar la guía. ${(e as Error).message}`);
        botonGuardar.disabled = false;
        return;
      }
      cerrar(true);
    }

    let preguntando = false;
    async function cancelar(): Promise<void> {
      if (preguntando) return;
      if (original !== null && campo.value !== original) {
        preguntando = true;
        const descartar = await o.confirmarDescarte();
        preguntando = false;
        if (!descartar) {
          campo.focus();
          return;
        }
      }
      cerrar(false);
    }

    dialogo.append(
      el('h2', { clase: 'selector-titulo' }, 'Guía de estilo'),
      el('p', { clase: 'dialogo-detalle' }, 'Va completa en cada prompt: de qué trata el informe, cómo se escribe y qué términos usar. Se guarda en tu máquina, no viaja a Overleaf. Si la dejás vacía, vuelve la inicial.'),
      campo, aviso,
      el('div', { clase: 'dialogo-botones' }, botonGuardar, botonCancelar),
    );
    dialogo.addEventListener('cancel', (e) => { e.preventDefault(); void cancelar(); });
    document.body.append(dialogo);
    dialogo.showModal();

    o.leer().then((texto) => {
      original = texto;
      campo.value = texto;
      campo.disabled = false;
      campo.placeholder = '';
      botonGuardar.disabled = false;
      campo.focus();
      campo.setSelectionRange(0, 0);
      campo.scrollTop = 0;
    }, (e) => {
      campo.placeholder = '';
      avisar(`No se pudo leer la guía. ${(e as Error).message}`);
    });
  });
}
