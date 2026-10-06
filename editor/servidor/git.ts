import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ErrorRed, EstadoGit, ResultadoEnviar, ResultadoTerminar, ResultadoTraer } from '../compartido/tipos';

export interface Git {
  // Descripción del problema que impide sincronizar, o null si está todo en orden.
  verificar(): Promise<string | null>;
  preparar(): Promise<void>;
  estado(): Promise<EstadoGit>;
  buscar(): Promise<{ tipo: 'ok' } | ErrorRed>;
  traer(): Promise<ResultadoTraer>;
  enviar(): Promise<ResultadoEnviar>;
  terminarCombinacion(): Promise<ResultadoTerminar>;
  cancelarCombinacion(): Promise<void>;
}

// Temporales de LaTeX: se ignoran solo en este clon, así nunca viajan a Overleaf.
const EXCLUSIONES = [
  '*.aux', '*.log', '*.out', '*.toc', '*.lof', '*.lot', '*.bbl', '*.blg',
  '*.fls', '*.fdb_latexmk', '*.synctex.gz', '/main.pdf',
];

const MARCA_DE_CONFLICTO = /^(<{7}|={7}|>{7})( |$)/m;
const ESTADO_LIMPIO: EstadoGit = { cambiosLocales: false, commitsSinEnviar: 0, commitsSinTraer: 0, combinacionEnCurso: false, archivosEnConflicto: [] };

interface Salida { codigo: number; stdout: string; stderr: string }

// Errores al hablar con Overleaf: credenciales, conexión, o un rechazo del servidor.
function clasificarRed(stderr: string): ErrorRed {
  let motivo: ErrorRed['motivo'] = 'otro';
  if (/Authentication failed|\b403\b|could not read Username|terminal prompts disabled/i.test(stderr)) motivo = 'autenticacion';
  else if (/Could not resolve host|Failed to connect|Could not connect|timed out|unable to access/i.test(stderr)) motivo = 'sin-conexion';
  return { tipo: 'error', motivo, mensaje: stderr.trim() };
}

// Fallas que no tienen que ver con Overleaf: el repositorio local no pudo completar un paso.
const errorLocal = (s: Salida): ErrorRed => ({ tipo: 'error', motivo: 'local', mensaje: (s.stderr || s.stdout).trim() });

function marcaDeTiempo(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function crearGit(dirInforme: string): Git {
  const raiz = path.resolve(dirInforme);
  const entorno = {
    ...process.env,
    // Sin diálogos de credenciales: si falta el token, la operación falla y se informa.
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
    // Si informe/ no es un repositorio, Git no debe usar el de la carpeta que lo contiene.
    GIT_CEILING_DIRECTORIES: path.dirname(raiz),
  };

  // quotePath=false: los nombres con tildes salen tal cual, no como "Introducci\303\263n.tex".
  const git = (...args: string[]): Promise<Salida> =>
    new Promise((resolver) => {
      execFile('git', ['-c', 'core.quotePath=false', ...args],
        { cwd: raiz, env: entorno, timeout: 60000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const codigo = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
          resolver({ codigo, stdout, stderr: stderr || (error && codigo !== 0 ? error.message : '') });
        });
    });

  // Las operaciones van de a una: un fetch periódico no debe cruzarse con un Traer en curso.
  let cola: Promise<unknown> = Promise.resolve();
  function enSerie<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = cola.then(tarea, tarea);
    cola = resultado.catch(() => undefined);
    return resultado;
  }

  const lineas = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
  const rama = async () => (await git('rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim();
  const enCombinacion = async () => (await git('rev-parse', '-q', '--verify', 'MERGE_HEAD')).codigo === 0;
  const enConflicto = async () => lineas((await git('diff', '--name-only', '--diff-filter=U')).stdout);

  // informe/ tiene que ser la raíz de su propio repositorio, no una carpeta dentro de otro.
  // (Se pregunta por el prefijo y no se comparan rutas: en Windows una misma carpeta puede
  // escribirse de varias formas, por ejemplo con nombres cortos como CRISTH~1.)
  async function esClonPropio(): Promise<boolean> {
    const r = await git('rev-parse', '--show-prefix');
    return r.codigo === 0 && r.stdout.trim() === '';
  }

  const noEsClon = (): ErrorRed => ({
    tipo: 'error', motivo: 'local',
    mensaje: `La carpeta ${raiz} no es un clon del proyecto de Overleaf. Seguí la sección 3 de INSTALACION.md.`,
  });

  // Por contenido y no con `git status`: Git da por modificado un archivo cuyo tamaño
  // cambió aunque, ya normalizados los fines de línea, sea idéntico al del índice.
  const hayCambios = async () =>
    (await git('diff', '--quiet', 'HEAD')).codigo !== 0 ||
    (await git('ls-files', '--others', '--exclude-standard')).stdout.trim() !== '';

  async function verificar(): Promise<string | null> {
    if (!(await esClonPropio())) return noEsClon().mensaje;
    const nombre = (await git('config', 'user.name')).stdout.trim();
    const correo = (await git('config', 'user.email')).stdout.trim();
    if (!nombre || !correo) {
      return 'Git no sabe con qué nombre firmar tus cambios. En una terminal, dentro de la carpeta informe, ejecutá: '
        + 'git config user.name "Tu Nombre" y después git config user.email "tu@correo".';
    }
    return null;
  }

  async function estado(): Promise<EstadoGit> {
    if (!(await esClonPropio())) return ESTADO_LIMPIO;
    const cuenta = await git('rev-list', '--left-right', '--count', `HEAD...origin/${await rama()}`);
    const [sinEnviar, sinTraer] = cuenta.codigo === 0 ? cuenta.stdout.trim().split(/\s+/).map(Number) : [0, 0];
    return {
      cambiosLocales: await hayCambios(),
      commitsSinEnviar: sinEnviar,
      commitsSinTraer: sinTraer,
      combinacionEnCurso: await enCombinacion(),
      archivosEnConflicto: await enConflicto(),
    };
  }

  async function buscar(): Promise<{ tipo: 'ok' } | ErrorRed> {
    if (!(await esClonPropio())) return noEsClon();
    const r = await git('fetch', 'origin');
    return r.codigo === 0 ? { tipo: 'ok' } : clasificarRed(r.stderr);
  }

  async function traer(): Promise<ResultadoTraer> {
    if (!(await esClonPropio())) return noEsClon();
    if (await enCombinacion()) return { tipo: 'conflicto', archivos: await enConflicto() };

    const registro = await git('add', '-A');
    if (registro.codigo !== 0) return errorLocal(registro);
    if ((await git('diff', '--cached', '--quiet')).codigo !== 0) {
      const commit = await git('commit', '-m', `Edición desde el editor local, ${marcaDeTiempo()}`);
      if (commit.codigo !== 0) return errorLocal(commit);
    }

    const busqueda = await git('fetch', 'origin');
    if (busqueda.codigo !== 0) return clasificarRed(busqueda.stderr);

    const antes = (await git('rev-parse', 'HEAD')).stdout.trim();
    const combinacion = await git('merge', '--no-edit', `origin/${await rama()}`);
    if (combinacion.codigo !== 0) {
      const archivos = await enConflicto();
      return archivos.length > 0 ? { tipo: 'conflicto', archivos } : errorLocal(combinacion);
    }
    const cambiados = await git('diff', '--name-only', antes, 'HEAD');
    return { tipo: 'ok', archivosCambiados: lineas(cambiados.stdout) };
  }

  async function enviar(): Promise<ResultadoEnviar> {
    for (let intento = 0; ; intento++) {
      const traido = await traer();
      if (traido.tipo !== 'ok') return traido;

      const actual = await rama();
      const pendientes = await git('rev-list', '--count', `origin/${actual}..HEAD`);
      if (pendientes.codigo !== 0) return errorLocal(pendientes);
      if (pendientes.stdout.trim() === '0') return { tipo: 'ok', enviado: false };

      const envio = await git('push', 'origin', actual);
      if (envio.codigo === 0) return { tipo: 'ok', enviado: true };

      // Alguien publicó entre nuestro traer y nuestro push: se reintenta una vez.
      const noEsAvanceRapido = /non-fast-forward|fetch first|\[rejected\]/i.test(envio.stderr);
      if (noEsAvanceRapido && intento === 0) continue;

      const error = clasificarRed(envio.stderr);
      return error.motivo === 'otro' ? { tipo: 'rechazado', mensaje: error.mensaje } : error;
    }
  }

  async function terminarCombinacion(): Promise<ResultadoTerminar> {
    if (!(await enCombinacion())) return { tipo: 'ok' };

    const conMarcas: string[] = [];
    for (const archivo of await enConflicto()) {
      // Un archivo que ya no está fue resuelto borrándolo; cualquier otra falla de lectura se informa.
      const texto = await fs.readFile(path.join(raiz, archivo), 'utf8').catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') return '';
        throw new Error(`No se pudo leer ${archivo} para comprobar el conflicto: ${e.message}`);
      });
      if (MARCA_DE_CONFLICTO.test(texto.replace(/\r\n/g, '\n'))) conMarcas.push(archivo);
    }
    if (conMarcas.length > 0) return { tipo: 'quedan-marcas', archivos: conMarcas };

    const registro = await git('add', '-A');
    if (registro.codigo !== 0) throw new Error(`Git no pudo registrar la resolución: ${errorLocal(registro).mensaje}`);

    // Red de seguridad: Git mismo revisa que no vaya a quedar ninguna marca en lo registrado.
    const revision = await git('diff', '--cached', '--check');
    const olvidadas = [...new Set(lineas(revision.stdout).flatMap((l) => l.match(/^(.+?):\d+: leftover conflict marker/)?.[1] ?? []))];
    if (olvidadas.length > 0) return { tipo: 'quedan-marcas', archivos: olvidadas };

    const commit = await git('commit', '--no-edit');
    if (commit.codigo !== 0) throw new Error(`Git no pudo cerrar la combinación: ${errorLocal(commit).mensaje}`);
    return { tipo: 'ok' };
  }

  async function cancelarCombinacion(): Promise<void> {
    if (!(await enCombinacion())) return;
    const r = await git('merge', '--abort');
    if (r.codigo !== 0) throw new Error(`Git no pudo cancelar la combinación: ${errorLocal(r).mensaje}`);
  }

  async function preparar(): Promise<void> {
    if (!(await esClonPropio())) throw new Error(noEsClon().mensaje);
    const ubicacion = (await git('rev-parse', '--git-path', 'info/exclude')).stdout.trim();
    const archivo = path.resolve(raiz, ubicacion);
    const actual = await fs.readFile(archivo, 'utf8').catch(() => '');
    const presentes = new Set(actual.split(/\r?\n/));
    const faltantes = EXCLUSIONES.filter((p) => !presentes.has(p));
    if (faltantes.length === 0) return;
    await fs.mkdir(path.dirname(archivo), { recursive: true });
    const separador = actual === '' || actual.endsWith('\n') ? '' : '\n';
    await fs.writeFile(archivo, `${actual}${separador}${faltantes.join('\n')}\n`);
  }

  return {
    verificar: () => enSerie(verificar),
    preparar: () => enSerie(preparar),
    estado: () => enSerie(estado),
    buscar: () => enSerie(buscar),
    traer: () => enSerie(traer),
    enviar: () => enSerie(enviar),
    terminarCombinacion: () => enSerie(terminarCombinacion),
    cancelarCombinacion: () => enSerie(cancelarCombinacion),
  };
}
