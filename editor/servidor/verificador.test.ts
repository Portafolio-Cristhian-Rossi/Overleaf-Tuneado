import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearRepoDePrueba, type RepoDePrueba } from '../pruebas/ayudas/repoDePrueba';
import { copiarFixture, dirTemporal } from '../pruebas/ayudas/temporales';
import type { LanzarAgente, SalidaDelAgente } from './agente';
import { crearVerificaciones, type Verificaciones } from './verificaciones';
import { crearVerificador, MENSAJES, type ConfigVerificador } from './verificador';

const CITA_CAP3 = '\\section{Serie de pasos}';
const CITA_CAP2 = '\\chapter{Revision de antecedentes}';

const envoltura = (hallazgos: unknown): SalidaDelAgente => ({
  codigo: 0,
  stdout: JSON.stringify({ type: 'result', is_error: false, result: JSON.stringify(hallazgos) }),
  stderr: '',
  noEncontrado: false,
});

const contradiccion = (archivo: string, cita: string, explicacion = 'El código hace otra cosa.') => ({
  tipo: 'contradiccion',
  informe: { archivo, linea: 3, cita },
  repo: { archivo: 'backend/app.py', linea: 2 },
  explicacion,
});

const DETENIDO: SalidaDelAgente = { codigo: null, stdout: '', stderr: '', noEncontrado: false };

// Lanzador falso: registra cada llamada y devuelve lo que diga `responder`. Si `responder`
// devuelve una promesa que no se resuelve, el agente sigue "corriendo" hasta que lo detengan.
function lanzadorFalso(responder: (o: { cwd: string; prompt: string }) => SalidaDelAgente | Promise<SalidaDelAgente>) {
  const llamadas: { cwd: string; prompt: string }[] = [];
  let detenciones = 0;
  let avisarLlamado: () => void = () => {};
  const llamado = new Promise<void>((r) => { avisarLlamado = r; });
  const lanzar: LanzarAgente = (o) => {
    llamadas.push(o);
    let soltar: (s: SalidaDelAgente) => void = () => {};
    const detenido = new Promise<SalidaDelAgente>((r) => { soltar = r; });
    const terminado = Promise.race([Promise.resolve().then(() => responder(o)), detenido]);
    avisarLlamado();
    return { terminado, detener() { detenciones++; soltar(DETENIDO); } };
  };
  return { lanzar, llamadas, llamado, detenciones: () => detenciones };
}

const nunca = () => new Promise<SalidaDelAgente>(() => {});

let dir: string;
let informe: string;
let temporales: string;
let datos: RepoDePrueba;
let verificaciones: Verificaciones;
let config: ConfigVerificador;
let reloj: number;

beforeEach(() => {
  dir = dirTemporal();
  informe = path.join(dir, 'informe');
  copiarFixture(informe);
  datos = crearRepoDePrueba(dir);
  temporales = path.join(dir, 'temporales');
  fs.mkdirSync(temporales);
  verificaciones = crearVerificaciones(path.join(dir, 'verificaciones'));
  config = { informe, repositorio: datos.repo, ramaRepositorio: 'main', limiteVerificacion: { capitulo: 15, todo: 45 } };
  reloj = 1_000;
});

function verificador(lanzar: LanzarAgente, rutasDelInforme: () => Promise<string[]> = async () => ['Cap2.tex', 'Cap3.tex']) {
  return crearVerificador({ config, verificaciones, lanzar, rutasDelInforme, dirTemporales: temporales, ahora: () => reloj });
}

describe('verificador', () => {
  it('corrida exitosa: guarda los hallazgos válidos y cuenta los descartados', async () => {
    const falso = lanzadorFalso(() => {
      reloj = 5_000;
      return envoltura([contradiccion('Cap3.tex', CITA_CAP3), contradiccion('Cap3.tex', 'una frase que no está')]);
    });
    const v = verificador(falso.lanzar);
    expect(await v.iniciar('capitulo', 'Cap3.tex')).toEqual({ tipo: 'ok' });
    await v.terminada();

    const ultima = await verificaciones.ultima();
    expect(ultima).toMatchObject({
      estado: 'ok', alcance: 'capitulo', archivos: ['Cap3.tex'], rama: 'main', commit: datos.commitDeMain,
      descartados: 1, crudo: null, fecha: new Date(1_000).toISOString(), duracionMs: 4_000,
    });
    expect(ultima!.hallazgos).toHaveLength(1);
    expect(ultima!.hallazgos[0]).toMatchObject({ informe: { archivo: 'Cap3.tex', cita: CITA_CAP3 }, repo: { archivo: 'backend/app.py', linea: 2 } });
    expect(await v.estado()).toEqual({ estado: 'libre', error: null });
  });

  it('se descartan las líneas fuera de rango y los archivos del repo que no existen', async () => {
    const enRepo = (archivo: string, linea: number) => ({ ...contradiccion('Cap3.tex', CITA_CAP3), repo: { archivo, linea } });
    const v = verificador(lanzadorFalso(() => envoltura([
      enRepo('backend/app.py', 3), enRepo('backend/no-existe.py', 1), enRepo('backend', 1), enRepo('.env', 1),
    ])).lanzar);
    await v.iniciar('capitulo', 'Cap3.tex');
    await v.terminada();
    expect(await verificaciones.ultima()).toMatchObject({ estado: 'ok', hallazgos: [], descartados: 4 });
  });

  it('el agente trabaja en una carpeta con informe/ y repositorio/, y se borra al terminar', async () => {
    const vistos: Record<string, boolean> = {};
    const falso = lanzadorFalso(({ cwd }) => {
      vistos.informe = fs.existsSync(path.join(cwd, 'informe', 'Cap3.tex'));
      vistos.repo = fs.existsSync(path.join(cwd, 'repositorio', 'backend', 'app.py'));
      vistos.env = fs.existsSync(path.join(cwd, 'repositorio', '.env'));
      vistos.otroCapitulo = fs.existsSync(path.join(cwd, 'informe', 'Cap2.tex'));
      return envoltura([]);
    });
    const v = verificador(falso.lanzar);
    await v.iniciar('capitulo', 'Cap3.tex');
    await v.terminada();

    const { cwd } = falso.llamadas[0]!;
    expect(path.dirname(cwd)).toBe(temporales);
    expect(path.basename(cwd)).toMatch(/^editor-verificacion-/);
    expect(vistos).toEqual({ informe: true, repo: true, env: false, otroCapitulo: false });
    expect(fs.existsSync(cwd)).toBe(false);
    expect(fs.readdirSync(temporales)).toEqual([]);
  });

  it('la prompt lleva los ignorados de los archivos revisados', async () => {
    const primera = verificador(lanzadorFalso(() => envoltura([
      contradiccion('Cap2.tex', CITA_CAP2, 'Explicación del capítulo dos.'),
      contradiccion('Cap3.tex', CITA_CAP3, 'Explicación del capítulo tres.'),
    ])).lanzar);
    await primera.iniciar('todo', null);
    await primera.terminada();
    for (const h of (await verificaciones.ultima())!.hallazgos) await verificaciones.ignorar(h.id);

    const falso = lanzadorFalso(() => envoltura([]));
    const v = verificador(falso.lanzar);
    await v.iniciar('capitulo', 'Cap3.tex');
    await v.terminada();
    const { prompt } = falso.llamadas[0]!;
    expect(prompt).toContain('informe/Cap3.tex');
    expect(prompt).toContain(`commit ${datos.commitDeMain}`);
    expect(prompt).toContain('Explicación del capítulo tres.');
    expect(prompt).not.toContain('Explicación del capítulo dos.');
  });

  it('mientras corre, estado es en-curso y una segunda corrida es ocupado', async () => {
    let soltar: (s: SalidaDelAgente) => void = () => {};
    const falso = lanzadorFalso(() => new Promise<SalidaDelAgente>((r) => { soltar = r; }));
    const v = verificador(falso.lanzar);
    expect(await v.iniciar('capitulo', 'Cap3.tex')).toEqual({ tipo: 'ok' });
    expect(await v.estado()).toEqual({ estado: 'en-curso', alcance: 'capitulo', desde: 1_000 });
    await falso.llamado;
    expect(await v.iniciar('todo', null)).toEqual({ tipo: 'ocupado' });
    expect(await v.estado()).toEqual({ estado: 'en-curso', alcance: 'capitulo', desde: 1_000 });

    soltar(envoltura([]));
    await v.terminada();
    expect(falso.llamadas).toHaveLength(1);
    expect(await v.estado()).toEqual({ estado: 'libre', error: null });
  });

  it('dos iniciar al mismo tiempo lanzan una sola corrida', async () => {
    const falso = lanzadorFalso(() => envoltura([]));
    const v = verificador(falso.lanzar);
    const respuestas = await Promise.all([v.iniciar('capitulo', 'Cap3.tex'), v.iniciar('capitulo', 'Cap3.tex')]);
    await v.terminada();
    expect(respuestas.map((r) => r.tipo).sort()).toEqual(['ocupado', 'ok']);
    expect(falso.llamadas).toHaveLength(1);
  });

  it('cancelar detiene el agente, borra la carpeta y no guarda corrida', async () => {
    const falso = lanzadorFalso(nunca);
    const v = verificador(falso.lanzar);
    await v.iniciar('capitulo', 'Cap3.tex');
    await falso.llamado;
    v.cancelar();
    await v.terminada();

    expect(falso.detenciones()).toBe(1);
    expect(await v.estado()).toEqual({ estado: 'libre', error: null });
    expect(await verificaciones.ultima()).toBeNull();
    expect(fs.existsSync(falso.llamadas[0]!.cwd)).toBe(false);
  });

  it('cancelar antes de que arranque el agente no lo lanza', async () => {
    const falso = lanzadorFalso(() => envoltura([]));
    const v = verificador(falso.lanzar);
    await v.iniciar('capitulo', 'Cap3.tex');
    v.cancelar();
    await v.terminada();

    expect(falso.llamadas).toHaveLength(0);
    expect(await v.estado()).toEqual({ estado: 'libre', error: null });
    expect(await verificaciones.ultima()).toBeNull();
    expect(fs.readdirSync(temporales)).toEqual([]);
  });

  it('pasar el límite detiene el agente y deja el error limite', async () => {
    config.limiteVerificacion.capitulo = 0.001;
    const falso = lanzadorFalso(nunca);
    const v = verificador(falso.lanzar);
    await v.iniciar('capitulo', 'Cap3.tex');
    await v.terminada();

    expect(falso.detenciones()).toBe(1);
    expect(MENSAJES.limite.replace('{n}', '0.001')).toBe(
      'La verificación se cortó a los 0.001 minutos. Si necesita más tiempo, subí limiteVerificacion en config.json.');
    expect(await v.estado()).toEqual({ estado: 'libre', error: { motivo: 'limite', mensaje: MENSAJES.limite.replace('{n}', '0.001') } });
    expect(await verificaciones.ultima()).toBeNull();
    expect(fs.readdirSync(temporales)).toEqual([]);
  });

  it('el límite de todo el informe sale de limiteVerificacion.todo, sin decimales de más', async () => {
    config.limiteVerificacion.todo = 0.0005;
    const v = verificador(lanzadorFalso(nunca).lanzar);
    await v.iniciar('todo', null);
    await v.terminada();
    expect(await v.estado()).toEqual({ estado: 'libre', error: { motivo: 'limite', mensaje: MENSAJES.limite.replace('{n}', '0.0005') } });
  });

  it('CLI ausente y sesión no iniciada dejan su mensaje y no guardan corrida', async () => {
    const sinCli = verificador(lanzadorFalso(() => ({ codigo: null, stdout: '', stderr: '', noEncontrado: true })).lanzar);
    await sinCli.iniciar('capitulo', 'Cap3.tex');
    await sinCli.terminada();
    expect(await sinCli.estado()).toEqual({ estado: 'libre', error: { motivo: 'sin-cli', mensaje: MENSAJES['sin-cli'] } });
    expect(MENSAJES['sin-cli']).toBe('No se encontró Claude Code. Instalalo con `npm install -g @anthropic-ai/claude-code` y volvé a probar.');

    const sinSesion = verificador(lanzadorFalso(() => ({
      codigo: 1, stdout: JSON.stringify({ is_error: true, result: 'Invalid API key · Please run /login' }), stderr: '', noEncontrado: false,
    })).lanzar);
    await sinSesion.iniciar('capitulo', 'Cap3.tex');
    await sinSesion.terminada();
    expect(await sinSesion.estado()).toEqual({ estado: 'libre', error: { motivo: 'sin-sesion', mensaje: MENSAJES['sin-sesion'] } });
    expect(MENSAJES['sin-sesion']).toBe('Claude Code no tiene una sesión iniciada. Abrí una terminal, corré `claude` una vez para entrar y volvé a probar.');

    expect(await verificaciones.ultima()).toBeNull();
    expect(fs.readdirSync(temporales)).toEqual([]);
  });

  it('otro error del agente deja su detalle, y una corrida nueva borra el error anterior', async () => {
    let respuesta: SalidaDelAgente = { codigo: 1, stdout: '', stderr: 'algo salió mal\n', noEncontrado: false };
    const v = verificador(lanzadorFalso(() => respuesta).lanzar);
    await v.iniciar('capitulo', 'Cap3.tex');
    await v.terminada();
    expect(await v.estado()).toEqual({ estado: 'libre', error: { motivo: 'otro', mensaje: 'La verificación falló: algo salió mal' } });
    expect(await verificaciones.ultima()).toBeNull();

    respuesta = envoltura([]);
    await v.iniciar('capitulo', 'Cap3.tex');
    expect(await v.estado()).toMatchObject({ estado: 'en-curso' });
    await v.terminada();
    expect(await v.estado()).toEqual({ estado: 'libre', error: null });
  });

  it('una excepción en un paso queda como error otro, limpia y vuelve a libre', async () => {
    const falso = lanzadorFalso(() => envoltura([]));
    const v = verificador(falso.lanzar, async () => ['Cap3.tex', 'NoExiste.tex']);
    expect(await v.iniciar('todo', null)).toEqual({ tipo: 'ok' });
    await v.terminada();

    const estado = await v.estado();
    expect(estado).toMatchObject({ estado: 'libre', error: { motivo: 'otro' } });
    if (estado.estado === 'libre') expect(estado.error!.mensaje).toMatch(/^La verificación falló: .*NoExiste\.tex/);
    expect(falso.llamadas).toHaveLength(0);
    expect(fs.readdirSync(temporales)).toEqual([]);
  });

  it('salida ilegible se guarda como corrida fallida con lo crudo', async () => {
    const v = verificador(lanzadorFalso(() => ({ codigo: 0, stdout: 'esto no es json', stderr: '', noEncontrado: false })).lanzar);
    await v.iniciar('capitulo', 'Cap3.tex');
    await v.terminada();

    expect(await verificaciones.ultima()).toMatchObject({
      estado: 'fallida', crudo: 'esto no es json', hallazgos: [], descartados: 0, archivos: ['Cap3.tex'], commit: datos.commitDeMain,
    });
    expect(await v.estado()).toEqual({ estado: 'libre', error: { motivo: 'ilegible', mensaje: MENSAJES.ilegible } });
    expect(MENSAJES.ilegible).toBe('La respuesta del agente no se pudo leer. La corrida quedó guardada como fallida en verificaciones/.');
  });

  it('rama inexistente no lanza el agente', async () => {
    const falso = lanzadorFalso(() => envoltura([]));
    config.ramaRepositorio = 'no-existe';
    const v = verificador(falso.lanzar);
    const motivo = `No se encontró la rama no-existe en ${datos.repo}.`;
    expect(await v.estado()).toEqual({ estado: 'deshabilitada', motivo });
    expect(await v.iniciar('capitulo', 'Cap3.tex')).toEqual({ tipo: 'invalido', mensaje: motivo });
    expect(falso.llamadas).toHaveLength(0);
  });

  it('la rama que desaparece durante la corrida deja el error rama', async () => {
    const falso = lanzadorFalso(() => envoltura([]));
    const v = verificador(falso.lanzar, async () => {
      execFileSync('git', ['-C', datos.repo, 'branch', '-q', '-D', 'main']);
      return ['Cap3.tex'];
    });
    await v.iniciar('todo', null);
    await v.terminada();
    // Se vuelve a crear para que estado() no la vea deshabilitada y muestre el error.
    execFileSync('git', ['-C', datos.repo, 'branch', '-q', 'main', datos.commitDeMain]);
    expect(await v.estado()).toEqual({ estado: 'libre', error: { motivo: 'rama', mensaje: `No se encontró la rama main en ${datos.repo}.` } });
    expect(falso.llamadas).toHaveLength(0);
  });

  it('sin repositorio en la config, estado es deshabilitada con el motivo', async () => {
    config.repositorio = null;
    const falso = lanzadorFalso(() => envoltura([]));
    const v = verificador(falso.lanzar);
    const motivo = 'Falta "repositorio" en config.json: la ruta de la aplicación a comparar.';
    expect(await v.estado()).toEqual({ estado: 'deshabilitada', motivo });
    expect(await v.iniciar('todo', null)).toEqual({ tipo: 'invalido', mensaje: motivo });
    expect(falso.llamadas).toHaveLength(0);
  });

  it('al iniciar borra carpetas editor-verificacion-* viejas y deja las de una corrida que puede seguir', async () => {
    reloj = Date.now();
    const viejo = path.join(temporales, 'editor-verificacion-viejo');
    fs.mkdirSync(path.join(viejo, 'repositorio'), { recursive: true });
    fs.writeFileSync(path.join(viejo, 'repositorio', 'a.py'), 'x\n');
    // Más vieja que limiteVerificacion.todo (45) más diez minutos.
    const hace56Minutos = new Date(reloj - 56 * 60_000);
    fs.utimesSync(viejo, hace56Minutos, hace56Minutos);
    const reciente = path.join(temporales, 'editor-verificacion-reciente');
    fs.mkdirSync(reciente);
    const hace54Minutos = new Date(reloj - 54 * 60_000);
    fs.utimesSync(reciente, hace54Minutos, hace54Minutos);
    fs.mkdirSync(path.join(temporales, 'otra-cosa'));

    const v = verificador(lanzadorFalso(() => envoltura([])).lanzar);
    await v.iniciar('capitulo', 'Cap3.tex');
    await v.terminada();
    expect(fs.readdirSync(temporales).sort()).toEqual(['editor-verificacion-reciente', 'otra-cosa']);
  });

  it('un límite enorme no corta la corrida enseguida', async () => {
    config.limiteVerificacion.capitulo = 60_000;
    let soltar: (s: SalidaDelAgente) => void = () => {};
    const falso = lanzadorFalso(() => new Promise<SalidaDelAgente>((r) => { soltar = r; }));
    const v = verificador(falso.lanzar);
    await v.iniciar('capitulo', 'Cap3.tex');
    await falso.llamado;
    await new Promise((r) => setTimeout(r, 50));
    expect(falso.detenciones()).toBe(0);
    soltar(envoltura([]));
    await v.terminada();
    expect(await v.estado()).toEqual({ estado: 'libre', error: null });
  });

  it('capítulo sin ruta o con una ruta que no está en el informe es invalido', async () => {
    const falso = lanzadorFalso(() => envoltura([]));
    const v = verificador(falso.lanzar);
    for (const ruta of [null, 'NoExiste.tex', '../afuera.tex', 'figs']) {
      expect(await v.iniciar('capitulo', ruta)).toMatchObject({ tipo: 'invalido' });
    }
    expect(falso.llamadas).toHaveLength(0);
    expect(await v.estado()).toEqual({ estado: 'libre', error: null });
  });
});
