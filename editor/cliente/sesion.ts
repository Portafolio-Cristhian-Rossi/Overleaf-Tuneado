import type { ArchivoLeido, FinDeLinea, ResultadoEscritura } from '../compartido/tipos';

// La sesión de edición de un archivo: cuándo se guarda, qué pasa si el disco cambió por fuera,
// y cuándo NO se debe escribir. No conoce el DOM ni CodeMirror: habla con el editor a través de
// `Documento`, para poder probar acá los caminos donde se puede perder trabajo.

export type EstadoGuardado = 'guardado' | 'guardando' | 'sin-guardar' | 'error';
export type Eleccion = 'recargar' | 'sobrescribir' | 'despues';

export interface Documento {
  texto(): string;
  // Muestra el contenido de un archivo recién abierto, o el mismo archivo releído del disco.
  // Lo cargado no debe poder deshacerse con Ctrl+Z.
  cargar(texto: string, o: { archivoNuevo: boolean; ruta: string }): void;
  soloLectura(si: boolean): void;
}

export interface ArchivosRemotos {
  leer(ruta: string): Promise<ArchivoLeido>;
  escribir(ruta: string, datos: {
    contenido: string; finDeLinea: FinDeLinea; bom: boolean; versionBase: string; forzar?: boolean;
  }, urgente?: boolean): Promise<ResultadoEscritura>;
}

export interface OpcionesSesion {
  alAbrir(ruta: string, archivo: ArchivoLeido): void;
  alCambiarEstado(e: EstadoGuardado, detalle?: string): void;
  preguntarConflicto(): Promise<Eleccion>;
  alDesaparecer(ruta: string): void;
  esperaDeGuardadoMs?: number;
  esperaDeReintentoMs?: number;
}

export interface Sesion {
  abrir(ruta: string): Promise<void>;
  // El usuario cambió el texto.
  alEditar(): void;
  guardarAhora(urgente?: boolean): Promise<void>;
  // Trae lo que haya en disco: en silencio si no hay ediciones pendientes, preguntando si las hay.
  recargar(): Promise<void>;
  // Antes de operar con Git: guarda lo pendiente y deja el documento en solo lectura.
  // Devuelve false si quedó algo sin guardar; en ese caso no hay que sincronizar.
  congelar(): Promise<boolean>;
  descongelar(): void;
  rutaAbierta(): string | null;
  hayCambiosSinGuardar(): boolean;
}

export function crearSesion(doc: Documento, api: ArchivosRemotos, o: OpcionesSesion): Sesion {
  const esperaDeGuardado = o.esperaDeGuardadoMs ?? 1000;
  const esperaDeReintento = o.esperaDeReintentoMs ?? 5000;

  let ruta: string | null = null;
  let finDeLinea: FinDeLinea = '\n';
  let bom = false;
  let version = '';
  let sucio = false;
  let guardando = false;
  let detenido = false;      // el archivo ya no existe: no se guarda más
  let protegido = false;     // el archivo no se puede reproducir con fidelidad: nunca se escribe
  let congelada = false;     // hay una operación de Git en curso o un conflicto sin resolver
  let reloj: ReturnType<typeof setTimeout> | undefined;

  // Guardar, recargar y abrir van de a uno: cada paso parte del estado que dejó el anterior.
  let cola: Promise<unknown> = Promise.resolve();
  function enSerie<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = cola.then(tarea, tarea);
    cola = resultado.catch(() => undefined);
    return resultado;
  }

  const aplicarSoloLectura = () => doc.soloLectura(congelada || detenido || protegido);

  function programar(ms: number): void {
    clearTimeout(reloj);
    reloj = setTimeout(() => { void guardarAhora(); }, ms);
  }

  function tomarDatos(archivo: ArchivoLeido): void {
    finDeLinea = archivo.finDeLinea;
    bom = archivo.bom;
    version = archivo.version;
    protegido = !archivo.fiel;
  }

  function cargarDelDisco(archivo: ArchivoLeido): void {
    clearTimeout(reloj);
    tomarDatos(archivo);
    sucio = false;
    doc.cargar(archivo.contenido, { archivoNuevo: false, ruta: ruta! });
    aplicarSoloLectura();
    o.alCambiarEstado('guardado');
  }

  function desaparecio(): void {
    clearTimeout(reloj);
    detenido = true;
    sucio = false;
    aplicarSoloLectura();
    o.alCambiarEstado('error');
    if (ruta) o.alDesaparecer(ruta);
  }

  // `aunCongelada` solo lo usa congelar(), para el último guardado antes de operar con Git.
  async function guardar(urgente: boolean, aunCongelada = false): Promise<void> {
    if (!ruta || !sucio || detenido || protegido || (congelada && !aunCongelada)) return;
    const rutaGuardada = ruta;
    const datos = () => ({ contenido: doc.texto(), finDeLinea, bom, versionBase: version });
    sucio = false;
    guardando = true;
    o.alCambiarEstado('guardando');
    try {
      let r = await api.escribir(rutaGuardada, datos(), urgente);
      if (r.tipo === 'cambio-en-disco') {
        const eleccion = await o.preguntarConflicto();
        if (eleccion === 'recargar') return cargarDelDisco(r.actual);
        if (eleccion === 'despues') {
          // Nada se escribe ni se descarta. Se vuelve a preguntar con la próxima edición.
          sucio = true;
          o.alCambiarEstado('sin-guardar');
          return;
        }
        r = await api.escribir(rutaGuardada, { ...datos(), forzar: true });
      }
      if (r.tipo === 'desaparecido') return desaparecio();
      if (r.tipo === 'ok') version = r.version;
      o.alCambiarEstado(sucio ? 'sin-guardar' : 'guardado');
    } catch (e) {
      sucio = true;
      o.alCambiarEstado('error', (e as Error).message);
      if (!congelada) programar(esperaDeReintento);
    } finally {
      guardando = false;
    }
  }

  function guardarAhora(urgente = false): Promise<void> {
    clearTimeout(reloj);
    return enSerie(() => guardar(urgente));
  }

  return {
    abrir: (nueva) => enSerie(async () => {
      await guardar(false);
      if (sucio && !detenido && !protegido) {
        throw new Error('No se pudo guardar este archivo, así que no se abrió el otro: tus cambios siguen acá. Probá de nuevo en unos segundos.');
      }
      const archivo = await api.leer(nueva);
      clearTimeout(reloj);
      ruta = nueva;
      detenido = false;
      sucio = false;
      tomarDatos(archivo);
      doc.cargar(archivo.contenido, { archivoNuevo: true, ruta: nueva });
      aplicarSoloLectura();
      o.alAbrir(nueva, archivo);
      o.alCambiarEstado('guardado');
    }),

    alEditar() {
      if (detenido || protegido) return;
      sucio = true;
      o.alCambiarEstado('sin-guardar');
      if (!congelada) programar(esperaDeGuardado);
    },

    guardarAhora,

    recargar: () => enSerie(async () => {
      if (!ruta || detenido) return;
      let archivo: ArchivoLeido;
      try {
        archivo = await api.leer(ruta);
      } catch (e) {
        if ((e as { estado?: number }).estado === 404) desaparecio();
        return;
      }
      if (archivo.version === version) return;
      if (!sucio) return cargarDelDisco(archivo);

      const eleccion = await o.preguntarConflicto();
      if (eleccion === 'recargar') return cargarDelDisco(archivo);
      if (eleccion === 'sobrescribir') {
        version = archivo.version;   // se conserva lo del editor: este guardado pisa el disco
        await guardar(false, true);
      }
    }),

    async congelar() {
      congelada = true;
      aplicarSoloLectura();
      clearTimeout(reloj);
      await enSerie(() => guardar(false, true));
      return !sucio;
    },

    descongelar() {
      congelada = false;
      aplicarSoloLectura();
      if (sucio) programar(esperaDeGuardado);
    },

    rutaAbierta: () => ruta,
    hayCambiosSinGuardar: () => sucio || guardando,
  };
}
