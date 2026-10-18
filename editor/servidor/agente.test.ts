import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dirTemporal } from '../pruebas/ayudas/temporales';
import { ARGUMENTOS_DEL_AGENTE, crearLanzadorAgente, interpretarSalida } from './agente';

const envoltura = (result: string, is_error = false) =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error, result });
const salida = (stdout: string, codigo: number | null = 0, stderr = '') =>
  ({ codigo, stdout, stderr, noEncontrado: false });

const FALSO = path.resolve(import.meta.dirname, '../pruebas/ayudas/agenteFalso.mjs');

describe('interpretarSalida', () => {
  it('lee el arreglo del campo result', () => {
    expect(interpretarSalida(salida(envoltura('[{"tipo":"x"}]')))).toEqual({ tipo: 'ok', crudos: [{ tipo: 'x' }] });
  });
  it('tolera prosa alrededor y un bloque ```json', () => {
    expect(interpretarSalida(salida(envoltura('Listo:\n```json\n[]\n```\nEso es todo.')))).toEqual({ tipo: 'ok', crudos: [] });
  });
  it('sin arreglo es ilegible y conserva la salida cruda', () => {
    const s = salida(envoltura('No pude leer los archivos.'));
    expect(interpretarSalida(s)).toEqual({ tipo: 'ilegible', crudo: s.stdout });
  });
  it('un arreglo que no se puede parsear es ilegible', () => {
    const s = salida(envoltura('[esto no es json]'));
    expect(interpretarSalida(s)).toEqual({ tipo: 'ilegible', crudo: s.stdout });
  });
  it('stdout que no es JSON es ilegible', () => {
    expect(interpretarSalida(salida('basura'))).toEqual({ tipo: 'ilegible', crudo: 'basura' });
  });
  it('stdout que no es JSON con código distinto de cero es otro, con el stderr', () => {
    expect(interpretarSalida(salida('', 2, ' falló algo \n'))).toEqual({ tipo: 'otro', mensaje: 'falló algo' });
    expect(interpretarSalida(salida('texto', 2, ''))).toEqual({ tipo: 'otro', mensaje: 'texto' });
    expect(interpretarSalida(salida('', 3, ''))).toEqual({ tipo: 'otro', mensaje: 'El agente terminó con código 3.' });
  });
  it('CLI ausente: proceso no encontrado, o cmd con código 9009', () => {
    expect(interpretarSalida({ codigo: null, stdout: '', stderr: '', noEncontrado: true })).toEqual({ tipo: 'sin-cli' });
    expect(interpretarSalida(salida('', 9009, "'claude' no se reconoce como un comando interno o externo"))).toEqual({ tipo: 'sin-cli' });
    expect(interpretarSalida(salida('', 1, "'claude' is not recognized as an internal or external command"))).toEqual({ tipo: 'sin-cli' });
  });
  it('sesión no iniciada', () => {
    const r = interpretarSalida(salida(envoltura('Invalid API key · Please run /login', true), 1));
    expect(r).toEqual({ tipo: 'sin-sesion', mensaje: 'Invalid API key · Please run /login' });
  });
  it('otro error con su mensaje', () => {
    expect(interpretarSalida(salida(envoltura('Overloaded', true), 1))).toEqual({ tipo: 'otro', mensaje: 'Overloaded' });
  });
  it('un error sin texto en result se informa con su subtype, si lo hay', () => {
    const conSubtype = JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true });
    expect(interpretarSalida(salida(conSubtype, 1))).toEqual({ tipo: 'otro', mensaje: 'El agente informó un error (error_max_turns).' });
    const vacio = JSON.stringify({ type: 'result', is_error: true, result: '  ' });
    expect(interpretarSalida(salida(vacio, 1))).toEqual({ tipo: 'otro', mensaje: 'El agente informó un error.' });
    const noTexto = JSON.stringify({ type: 'result', is_error: true, result: { a: 1 } });
    expect(interpretarSalida(salida(noTexto, 1))).toEqual({ tipo: 'otro', mensaje: 'El agente informó un error.' });
  });
  it('salta los corchetes de la prosa que no abren un arreglo JSON', () => {
    const texto = 'Revisé la frase con \\cite[p. 3] del capítulo:\n[{"tipo":"x"}]\nListo.';
    expect(interpretarSalida(salida(envoltura(texto)))).toEqual({ tipo: 'ok', crudos: [{ tipo: 'x' }] });
  });
  // Pasó con el agente real: explicó en prosa que no pudo leer y la prosa citaba `[]`.
  it('un [] dentro de la prosa no cuenta como "sin hallazgos"', () => {
    const s = salida(envoltura('No pude hacer la revisión. No devolví `[]` porque eso diría que coinciden.'));
    expect(interpretarSalida(s)).toEqual({ tipo: 'ilegible', crudo: s.stdout });
  });
  it('[] vale si es toda la respuesta', () => {
    expect(interpretarSalida(salida(envoltura('  []\n')))).toEqual({ tipo: 'ok', crudos: [] });
  });
  it('los permisos denegados al agente son un error, aunque haya devuelto un arreglo', () => {
    const stdout = JSON.stringify({ type: 'result', is_error: false, result: '[]', permission_denials: [{ tool_name: 'Read' }, { tool_name: 'Grep' }] });
    expect(interpretarSalida(salida(stdout))).toEqual({
      tipo: 'otro', mensaje: 'Claude Code no dejó leer al agente los archivos de la verificación (2 permisos denegados).',
    });
  });
});

describe('crearLanzadorAgente', () => {
  it('limita las herramientas del agente a lectura y sin servidores MCP', () => {
    expect(ARGUMENTOS_DEL_AGENTE).toEqual([
      '-p', '--output-format', 'json', '--tools', 'Read,Grep,Glob',
      '--disallowedTools', 'Bash,PowerShell,Edit,Write,NotebookEdit,WebFetch,WebSearch',
      '--permission-mode', 'default', '--strict-mcp-config',
    ]);
  });
  it('el lanzador pasa la prompt por la entrada estándar y devuelve la salida', async () => {
    const lanzar = crearLanzadorAgente(['node', FALSO]);
    const r = await lanzar({ cwd: dirTemporal(), prompt: 'hola' }).terminado;
    expect(r.noEncontrado).toBe(false);
    expect(JSON.parse(r.stdout).result).toBe('eco:hola');
  });
  // El claude.exe de la extensión de VS Code está bajo "C:\Users\Cristhian Rossi\...": un .exe con
  // ruta absoluta se lanza directo, sin cmd, para que los espacios no partan la ruta.
  it('un .exe con ruta absoluta y espacios se lanza directo', async () => {
    // En esta máquina Node está en "C:\Program Files\nodejs\node.exe".
    const r = await crearLanzadorAgente([process.execPath, FALSO])({ cwd: dirTemporal(), prompt: 'hola' }).terminado;
    expect(JSON.parse(r.stdout).result).toBe('eco:hola');
  });
  it('un .exe con ruta absoluta que no existe es CLI ausente', async () => {
    const lanzar = crearLanzadorAgente([path.join(dirTemporal(), 'no está', 'claude.exe')]);
    expect(interpretarSalida(await lanzar({ cwd: dirTemporal(), prompt: 'hola' }).terminado)).toEqual({ tipo: 'sin-cli' });
  });
  it('un comando inexistente se informa como CLI ausente', async () => {
    const lanzar = crearLanzadorAgente(['comando-que-no-existe-xyz']);
    const r = await lanzar({ cwd: dirTemporal(), prompt: 'hola' }).terminado;
    expect(interpretarSalida(r)).toEqual({ tipo: 'sin-cli' });
  });
  it('detener corta un agente que no termina, y es idempotente', async () => {
    process.env.AGENTE_FALSO = 'colgado';
    try {
      const lanzar = crearLanzadorAgente(['node', FALSO]);
      const p = lanzar({ cwd: dirTemporal(), prompt: 'hola' });
      await new Promise((r) => setTimeout(r, 500));
      const t0 = Date.now();
      p.detener();
      await p.terminado;
      expect(Date.now() - t0).toBeLessThan(5000);
      expect(() => p.detener()).not.toThrow();
    } finally {
      delete process.env.AGENTE_FALSO;
    }
  }, 15000);
});
