import type { Rango } from '../compartido/analizador';
import type { ProblemaBib } from '../compartido/bib';
import type { Candidato } from '../compartido/citas';
import type { EstadoZotero, ResultadoAgregar } from '../compartido/tipos';
import { cambiarCita, citaEn, insertarCita, puedeCitarse, type Edicion, type FormaDeCita } from './comandos';
import type { preguntar } from './pantalla/dom';

type AlRepetir = 'preguntar' | 'renombrar';

// Lo que hace falta para convertir lo elegido en el buscador en claves del .bib.
export interface Citador {
  agregar(bibtex: string, alRepetir?: AlRepetir): Promise<ResultadoAgregar>;
  citarDeZotero(biblioteca: string, item: string, alRepetir?: AlRepetir): Promise<ResultadoAgregar>;
  preguntar: typeof preguntar;
  avisar(mensaje: string, tipo: 'info' | 'error'): void;
  // Antes de que el servidor toque el .bib: guarda lo pendiente. false si no se pudo.
  antesDeAgregar(): Promise<boolean>;
  // Después: recarga el .bib si está abierto, y la bibliografía.
  despuesDeAgregar(): Promise<void>;
}

const AVISO_DE_ZOTERO: Record<Exclude<EstadoZotero, 'disponible'>, string> = {
  cerrado: 'Zotero está cerrado: se muestran solo las referencias del informe.',
  'sin-permiso': 'Zotero no permite la conexión. Activá "Permitir que otras aplicaciones de este equipo se comuniquen con Zotero" en Ajustes → Avanzado.',
  'sin-respuesta': 'Zotero no respondió a tiempo: se muestran solo las referencias del informe.',
};

// Lo que el buscador tiene que decirle a quien cita, una cosa por línea; null si no hay nada.
// `archivo` es el .bib del informe, o null si no declara ninguno.
export function avisoDelBuscador(estado: EstadoZotero, problemas: ProblemaBib[], archivo: string | null): string | null {
  const lineas = [
    ...(estado === 'disponible' ? [] : [AVISO_DE_ZOTERO[estado]]),
    ...(archivo === null ? ['El informe no tiene un archivo de referencias: no hay dónde agregar las que elijas.'] : []),
    ...problemas.map((p) => `${archivo}, línea ${p.linea}: ${p.mensaje}`),
  ];
  return lineas.length > 0 ? lineas.join('\n') : null;
}

export type Colocacion = { tipo: 'ok'; edicion: Edicion } | { tipo: 'no'; mensaje: string };

// Entre abrir el buscador y poner la cita pasan un guardado, Zotero y quizás una pregunta: el
// texto pudo cambiar. La cita se coloca sobre el texto de ese momento, o no se coloca.
// `enCita`: la cita que se estaba cambiando (dónde estaba y qué claves tenía), o null si es nueva.
export function colocarCita(p: {
  texto: string; seleccion: Rango; enCita: { posicion: number; claves: string[] } | null; forma: FormaDeCita; claves: string[];
}): Colocacion {
  if (p.enCita) {
    const actual = citaEn(p.texto, p.enCita.posicion);
    const esLaMisma = actual !== null && actual.claves.length === p.enCita.claves.length
      && actual.claves.every((clave, n) => clave === p.enCita!.claves[n]);
    const edicion = esLaMisma ? cambiarCita(p.texto, p.enCita.posicion, p.forma, p.claves) : null;
    return edicion
      ? { tipo: 'ok', edicion }
      : { tipo: 'no', mensaje: 'La cita no se cambió: el texto cambió mientras se buscaba. Hacele clic de nuevo para cambiarla.' };
  }
  // La cita va después de lo seleccionado: abrir el buscador con texto marcado no lo borra.
  const donde = { desde: p.seleccion.hasta, hasta: p.seleccion.hasta };
  if (p.claves.length > 0 && !puedeCitarse(p.texto, donde.desde)) {
    return { tipo: 'no', mensaje: 'La cita no se insertó: el cursor quedó donde no se puede citar. Volvé a abrir el buscador para ponerla.' };
  }
  return { tipo: 'ok', edicion: insertarCita(p.texto, donde, p.forma, p.claves) };
}

const NO_SE_GUARDO = 'No se pudo guardar referencias.bib. Probá de nuevo.';
const NO_SE_PUDO = 'No se pudo agregar la referencia. Probá de nuevo.';

// Lleva la cuenta de un pedido de agregado, que puede necesitar varias idas al servidor.
function crearTanda(c: Citador) {
  const advertencias: string[] = [];
  let seAgrego = false;

  return {
    // Las claves que quedaron disponibles (agregadas o que ya estaban), o null si se canceló o falló.
    async pedir(enviar: (alRepetir?: AlRepetir) => Promise<ResultadoAgregar>): Promise<string[] | null> {
      let r = await enviar();
      const anotar = (resultado: ResultadoAgregar) => {
        if (resultado.tipo !== 'ok') return;
        for (const referencia of resultado.referencias) {
          if (referencia.tipo === 'clave-repetida') continue;
          if (referencia.tipo === 'agregada') seAgrego = true;
          // También las de lo que ya estaba: ahí va el "ya estaba cargada como…".
          for (const advertencia of referencia.advertencias) if (!advertencias.includes(advertencia)) advertencias.push(advertencia);
        }
      };
      anotar(r);

      const repetidas = r.tipo === 'ok' ? r.referencias.flatMap((x) => (x.tipo === 'clave-repetida' ? [x] : [])) : [];
      for (const repetida of repetidas) {
        const acepta = await c.preguntar(`En el informe ya hay otra referencia con la clave ${repetida.clave}.`, [
          { texto: `Agregar como ${repetida.sugerida}`, valor: true },
          { texto: 'Cancelar', valor: false, neutra: true },
        ]);
        if (!acepta) return null;
      }
      // Lo que ya entró en el primer pedido vuelve como "ya estaba"; lo repetido, con su clave nueva.
      if (repetidas.length > 0) {
        r = await enviar('renombrar');
        anotar(r);
      }

      if (r.tipo === 'invalido') {
        c.avisar(r.mensaje, 'error');
        return null;
      }
      return r.referencias.flatMap((x) => (x.tipo === 'clave-repetida' ? [] : [x.clave]));
    },

    // Aunque se haya cancelado a mitad de camino: lo que entró al .bib hay que mostrarlo.
    async cerrar(): Promise<void> {
      if (seAgrego) await c.despuesDeAgregar();
      // Como error para que no se vaya solo: son cosas que conviene leer antes de compilar.
      if (advertencias.length > 0) c.avisar(advertencias.join('\n'), 'error');
    },
  };
}

// Convierte lo elegido en claves del .bib, agregando lo que falte. null si se canceló o algo falló.
export async function resolverClaves(elegidos: Candidato[], c: Citador): Promise<string[] | null> {
  if (elegidos.some((e) => e.clave === null) && !(await c.antesDeAgregar())) {
    c.avisar(NO_SE_GUARDO, 'error');
    return null;
  }
  const tanda = crearTanda(c);
  const claves: string[] = [];
  try {
    for (const elegido of elegidos) {
      if (elegido.clave !== null) {
        claves.push(elegido.clave);
      } else if (elegido.zotero) {
        const { biblioteca, item } = elegido.zotero;
        const nuevas = await tanda.pedir((alRepetir) => c.citarDeZotero(biblioteca, item, alRepetir));
        if (nuevas === null) return null;
        claves.push(...nuevas);
      }
    }
    return [...new Set(claves)];
  } catch {
    c.avisar(NO_SE_PUDO, 'error');
    return null;
  } finally {
    await tanda.cerrar();
  }
}

// Agrega lo pegado; devuelve las claves que quedaron disponibles (agregadas o que ya estaban), o null.
export async function agregarPegado(bibtex: string, c: Citador): Promise<string[] | null> {
  if (!(await c.antesDeAgregar())) {
    c.avisar(NO_SE_GUARDO, 'error');
    return null;
  }
  const tanda = crearTanda(c);
  try {
    return await tanda.pedir((alRepetir) => c.agregar(bibtex, alRepetir));
  } catch {
    c.avisar(NO_SE_PUDO, 'error');
    return null;
  } finally {
    await tanda.cerrar();
  }
}
