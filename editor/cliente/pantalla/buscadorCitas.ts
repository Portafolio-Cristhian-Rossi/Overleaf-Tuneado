import { filtrarCandidatos, type Candidato } from '../../compartido/citas';
import type { FormaDeCita } from '../comandos';
import { el } from './dom';

type Avisar = (mensaje: string, tipo: 'info' | 'error') => void;

export interface OpcionesDeBuscador {
  // Las referencias del informe: ya están en memoria y se muestran enseguida.
  inicial: Candidato[];
  // Las mismas más las de Zotero, con el aviso que corresponda; puede tardar.
  completos(): Promise<{ lista: Candidato[]; aviso: string | null }>;
  formaInicial: FormaDeCita;
  // Claves ya citadas, cuando se cambia una cita existente.
  marcadas: string[];
  // Agrega al .bib lo pegado; devuelve las claves que quedaron disponibles o null. Los avisos van al diálogo.
  agregarPegado(bibtex: string, avisar: Avisar): Promise<string[] | null>;
}

const idDe = (c: Candidato) => (c.clave !== null ? `clave:${c.clave}` : `zotero:${c.zotero?.biblioteca}/${c.zotero?.item}`);

// Una clave citada que no está en el .bib se conserva: cambiar una cita no debe hacerla desaparecer.
function conLasQueFaltan(lista: Candidato[], claves: string[]): Candidato[] {
  const presentes = new Set(lista.map((c) => c.clave));
  const faltantes = claves.filter((clave) => !presentes.has(clave)).map((clave): Candidato => ({
    origen: 'informe', clave, zotero: null, autores: clave, anio: '', titulo: 'No está en el archivo de referencias.',
    detalle: 'falta', busqueda: clave.toLowerCase(),
  }));
  return [...faltantes, ...lista];
}

// Diálogo para elegir qué citar y cómo. Devuelve lo elegido, en el orden en que se marcó, o null si se cancela.
export function buscarCita(o: OpcionesDeBuscador): Promise<{ forma: FormaDeCita; elegidos: Candidato[] } | null> {
  return new Promise((resolver) => {
    const dialogo = el('dialog', { clase: 'dialogo buscador-citas', 'aria-label': 'Citar' });
    const cerrar = (resultado: { forma: FormaDeCita; elegidos: Candidato[] } | null) => { dialogo.close(); dialogo.remove(); resolver(resultado); };

    let lista = conLasQueFaltan(o.inicial, o.marcadas);
    let visibles: Candidato[] = [];
    let marcados = o.marcadas.map((clave) => `clave:${clave}`);
    let resaltado = 0;
    let forma = o.formaInicial;

    const resultados = el('div', { clase: 'buscador-lista', role: 'listbox', 'aria-label': 'Referencias' });
    const sinResultados = el('p', { clase: 'buscador-vacio', hidden: true }, 'Ninguna referencia coincide. Probá con otra palabra, o usá "Agregar referencia…".');
    const aviso = el('p', { clase: 'buscador-aviso', role: 'status' }, 'Buscando en Zotero…');
    const mostrarAviso = (texto: string | null, tipo: 'info' | 'error' = 'info') => {
      aviso.textContent = texto ?? '';
      aviso.hidden = texto === null;
      aviso.dataset.tipo = tipo;
    };

    function elegidos(): Candidato[] {
      const porId = new Map(lista.map((c) => [idDe(c), c]));
      const delOrden = marcados.flatMap((id) => porId.get(id) ?? []);
      return delOrden.length > 0 || visibles.length === 0 ? delOrden : [visibles[Math.min(resaltado, visibles.length - 1)]];
    }

    function alternar(c: Candidato): void {
      const id = idDe(c);
      marcados = marcados.includes(id) ? marcados.filter((otro) => otro !== id) : [...marcados, id];
      mostrar();
    }

    function mostrar(): void {
      visibles = filtrarCandidatos(lista, filtro.value);
      resaltado = Math.max(0, Math.min(resaltado, visibles.length - 1));
      resultados.replaceChildren(...visibles.map((c, n) => {
        const casilla = el('input', { type: 'checkbox', checked: marcados.includes(idDe(c)), alChange: () => alternar(c) });
        return el('label', { clase: n === resaltado ? 'buscador-opcion resaltada' : 'buscador-opcion', role: 'option' },
          casilla,
          el('span', { clase: 'buscador-texto' },
            el('strong', {}, c.anio ? `${c.autores} (${c.anio})` : c.autores),
            el('span', { clase: 'buscador-titulo' }, c.titulo)),
          el('span', { clase: c.origen === 'zotero' ? 'buscador-detalle de-zotero' : 'buscador-detalle' }, c.origen === 'zotero' ? `Zotero · ${c.detalle}` : c.detalle));
      }));
      sinResultados.hidden = visibles.length > 0;
      botonCitar.disabled = elegidos().length === 0;
      botonCitar.textContent = marcados.length > 1 ? `Citar (${marcados.length})` : 'Citar';
      resultados.querySelector('.resaltada')?.scrollIntoView({ block: 'nearest' });
    }

    const filtro = el('input', {
      type: 'search', clase: 'buscador-filtro', placeholder: 'Buscar por autor, título o año', 'aria-label': 'Buscar por autor, título o año',
      alInput: () => { resaltado = 0; mostrar(); },
      alKeydown: (evento: KeyboardEvent) => {
        if (evento.key !== 'ArrowDown' && evento.key !== 'ArrowUp') return;
        evento.preventDefault();
        resaltado = Math.max(0, Math.min(resaltado + (evento.key === 'ArrowDown' ? 1 : -1), visibles.length - 1));
        mostrar();
      },
    });

    const opcionDeForma = (valor: FormaDeCita, texto: string) => el('label', { clase: 'buscador-forma' },
      el('input', { type: 'radio', name: 'forma-de-cita', checked: forma === valor, alChange: () => { forma = valor; } }), texto);
    const formas = el('div', { clase: 'buscador-formas', role: 'radiogroup', 'aria-label': 'Forma de la cita' },
      opcionDeForma('parentetica', '(Autor, año)'), opcionDeForma('textual', 'Autor (año)'));

    const aceptar = () => {
      const lo = elegidos();
      if (lo.length > 0) cerrar({ forma, elegidos: lo });
    };
    const botonCitar = el('button', { type: 'button', clase: 'principal', alClick: aceptar }, 'Citar');

    // Segunda vista: pegar una referencia en BibTeX.
    const pegado = el('textarea', { clase: 'buscador-pegado', rows: 10, placeholder: 'Pegá acá la referencia en formato BibTeX', 'aria-label': 'Referencia en formato BibTeX' });
    const botonAgregar = el('button', {
      type: 'button', clase: 'principal',
      alClick: async () => {
        botonAgregar.disabled = true;
        mostrarAviso(null);
        const claves = await o.agregarPegado(pegado.value, mostrarAviso);
        botonAgregar.disabled = false;
        if (claves === null) return;
        // El .bib cambió: se vuelve a armar la lista y lo agregado queda marcado.
        const avisoDeLoAgregado = aviso.hidden ? null : aviso.textContent;
        const nuevos = await o.completos().catch(() => null);
        if (nuevos) lista = conLasQueFaltan(nuevos.lista, o.marcadas);
        marcados = [...new Set([...marcados, ...claves.map((clave) => `clave:${clave}`)])];
        pegado.value = '';
        filtro.value = '';
        verLista(true);
        if (avisoDeLoAgregado === null) mostrarAviso(nuevos?.aviso ?? null);
      },
    }, 'Agregar');

    const vistaLista = el('div', { clase: 'buscador-vista' }, filtro, resultados, sinResultados, formas);
    const vistaPegar = el('div', { clase: 'buscador-vista', hidden: true }, pegado);
    const botonesLista = el('div', { clase: 'dialogo-botones' },
      el('button', { type: 'button', alClick: () => verLista(false) }, 'Agregar referencia…'),
      el('span', { clase: 'barra-espacio' }),
      el('button', { type: 'button', alClick: () => cerrar(null) }, 'Cancelar'),
      botonCitar);
    const botonesPegar = el('div', { clase: 'dialogo-botones', hidden: true },
      el('button', { type: 'button', alClick: () => verLista(true) }, 'Volver'),
      el('span', { clase: 'barra-espacio' }),
      botonAgregar);

    function verLista(si: boolean): void {
      vistaLista.hidden = !si;
      botonesLista.hidden = !si;
      vistaPegar.hidden = si;
      botonesPegar.hidden = si;
      if (si) { mostrar(); filtro.focus(); } else pegado.focus();
    }

    dialogo.append(el('h2', { clase: 'selector-titulo' }, 'Citar'), vistaLista, vistaPegar, aviso, botonesLista, botonesPegar);
    dialogo.addEventListener('cancel', (evento) => { evento.preventDefault(); cerrar(null); });
    dialogo.addEventListener('keydown', (evento) => {
      const destino = evento.target as HTMLElement;
      if (evento.key !== 'Enter' || vistaLista.hidden || destino.tagName === 'BUTTON') return;
      evento.preventDefault();
      aceptar();
    });
    document.body.append(dialogo);
    dialogo.showModal();
    mostrar();
    filtro.focus();

    o.completos().then((r) => {
      lista = conLasQueFaltan(r.lista, o.marcadas);
      mostrarAviso(r.aviso);
      mostrar();
    }, () => mostrarAviso('No se pudo consultar Zotero: se muestran solo las referencias del informe.'));
  });
}
