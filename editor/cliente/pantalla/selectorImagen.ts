import { el } from './dom';

export interface OpcionesDeSelector {
  listar(): Promise<{ ruta: string; bytes: number }[]>;
  url(ruta: string): string;
  // Sube un archivo de la computadora; devuelve su ruta en el informe o null si no se subió.
  subir(archivo: File): Promise<string | null>;
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const nombreDe = (ruta: string) => ruta.replace(/^figs\//, '');
const tamano = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

// Diálogo para elegir una imagen de figs/ o sumar una desde la computadora.
// Devuelve la ruta tal como va en \includegraphics, o null si se cancela.
export function elegirImagen(o: OpcionesDeSelector): Promise<string | null> {
  return new Promise((resolver) => {
    const dialogo = el('dialog', { clase: 'dialogo selector-imagen', 'aria-label': 'Elegir imagen' });
    const cerrar = (ruta: string | null) => { dialogo.close(); dialogo.remove(); resolver(ruta); };

    const grilla = el('div', { clase: 'selector-grilla' });
    const aviso = el('p', { clase: 'selector-aviso' }, 'Leyendo figs/…');
    let imagenes: { ruta: string; bytes: number }[] = [];

    function mostrar(): void {
      const buscado = normalizar(filtro.value.trim());
      const visibles = imagenes.filter((i) => normalizar(nombreDe(i.ruta)).includes(buscado));
      grilla.replaceChildren(...visibles.map((i) => el('button', {
        type: 'button', clase: 'selector-imagen-opcion', title: `${i.ruta} (${tamano(i.bytes)})`, alClick: () => cerrar(i.ruta),
      },
      /\.pdf$/i.test(i.ruta)
        ? el('span', { clase: 'selector-miniatura selector-pdf' }, 'PDF')
        : el('img', { clase: 'selector-miniatura', src: o.url(i.ruta), alt: '', loading: 'lazy' }),
      el('span', { clase: 'selector-nombre' }, nombreDe(i.ruta)))));
      aviso.textContent = imagenes.length === 0 ? 'Todavía no hay imágenes en figs/.' : 'Ninguna imagen coincide con el filtro.';
      aviso.hidden = visibles.length > 0;
    }

    const filtro = el('input', { type: 'search', clase: 'selector-filtro', placeholder: 'Filtrar por nombre', 'aria-label': 'Filtrar por nombre', alInput: mostrar });

    const archivo = el('input', {
      type: 'file', accept: '.png,.jpg,.jpeg,.pdf', hidden: true,
      alChange: async () => {
        const elegido = archivo.files?.[0];
        archivo.value = '';
        if (!elegido) return;
        botonArchivo.disabled = true;
        const ruta = await o.subir(elegido);
        botonArchivo.disabled = false;
        if (ruta !== null) cerrar(ruta);
      },
    });
    const botonArchivo = el('button', { type: 'button', clase: 'principal', alClick: () => archivo.click() }, 'Elegir archivo…');

    dialogo.append(
      el('h2', { clase: 'selector-titulo' }, 'Elegir imagen'),
      filtro, grilla, aviso, archivo,
      el('div', { clase: 'dialogo-botones' }, botonArchivo, el('button', { type: 'button', alClick: () => cerrar(null) }, 'Cancelar')),
    );
    dialogo.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(null); });
    document.body.append(dialogo);
    dialogo.showModal();

    o.listar().then((lista) => { imagenes = lista; mostrar(); }, () => {
      aviso.textContent = 'No se pudo leer la carpeta figs/. Podés elegir un archivo de tu computadora.';
    });
  });
}
