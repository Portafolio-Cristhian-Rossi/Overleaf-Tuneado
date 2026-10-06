import fs from 'node:fs';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Segmento } from '../compartido/prosa';
import { segmentar } from '../compartido/prosa';
import { dirTemporal } from '../pruebas/ayudas/temporales';
import { crearCorrector, type Corrector, type Lanzar } from './languagetool';

// Un LanguageTool de mentira: responde lo que se le configure y anota lo que recibe.
let falso: Server | null;
let consultas: { language: string | null; disabledRules: string | null; data: any }[];
let respuesta: { status: number; matches: unknown[]; demoraMs: number };
const servidores: Server[] = [];

function escuchar(puerto = 0): Promise<number> {
  return new Promise((resolver) => {
    const s = http.createServer((req, res) => {
      if (req.url?.startsWith('/v2/languages')) { res.end(JSON.stringify([{ code: 'es', longCode: 'es' }])); return; }
      let cuerpo = '';
      req.on('data', (d) => { cuerpo += d; });
      req.on('end', () => {
        const p = new URLSearchParams(cuerpo);
        consultas.push({ language: p.get('language'), disabledRules: p.get('disabledRules'), data: JSON.parse(p.get('data') ?? 'null') });
        setTimeout(() => { res.statusCode = respuesta.status; res.end(JSON.stringify({ matches: respuesta.matches })); }, respuesta.demoraMs);
      });
    });
    servidores.push(s);
    falso = s;
    s.listen(puerto, '127.0.0.1', () => resolver((s.address() as AddressInfo).port));
  });
}

const coincidencia = (offset: number, length: number, regla: string, tipo: string, sugerencias: string[], mensaje = 'm') =>
  ({ offset, length, message: mensaje, replacements: sugerencias.map((value) => ({ value })), rule: { id: regla, issueType: tipo } });

let dirLt: string;
let diccionario: string[];
let lanzamientos: { comando: string; args: string[]; cwd: string }[];
let correctores: Corrector[];

function instalarFalso(): void {
  fs.mkdirSync(path.join(dirLt, 'LanguageTool-6.6'), { recursive: true });
  fs.writeFileSync(path.join(dirLt, 'LanguageTool-6.6', 'languagetool-server.jar'), '');
}

function corrector(puerto: number, lanzar: Lanzar, extra: Record<string, number> = {}): Corrector {
  const c = crearCorrector({
    dir: dirLt, puerto, diccionario: async () => diccionario, lanzar,
    intervaloMs: 20, esperaDeArranqueMs: 600, tiempoLimiteMs: 300, ...extra,
  });
  correctores.push(c);
  return c;
}

const noLanza: Lanzar = (comando, args, o) => {
  lanzamientos.push({ comando, args, cwd: o.cwd });
  return { alSalir: () => undefined, detener: () => undefined };
};

beforeEach(() => {
  consultas = []; respuesta = { status: 200, matches: [], demoraMs: 0 };
  dirLt = path.join(dirTemporal(), 'languagetool');
  diccionario = []; lanzamientos = []; correctores = []; falso = null;
});
afterEach(async () => {
  for (const c of correctores) c.detener();
  for (const s of servidores.splice(0)) { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
});

describe('revisar', () => {
  let c: Corrector;
  const segmentos: Segmento[] = segmentar('El \\textbf{analisis} de~textos\nsigue.');
  // posiciones en el original:   0123 4567890 12345678 9...
  beforeEach(async () => {
    const puerto = await escuchar();
    c = corrector(puerto, noLanza);
    await c.iniciar();
    consultas = [];
  });

  it('envía el texto anotado: prosa como texto, LaTeX como marca, saltos simples como espacios', async () => {
    await c.revisar(segmentos);
    expect(consultas).toHaveLength(1);
    expect(consultas[0].language).toBe('es');
    expect(consultas[0].disabledRules).toContain('WHITESPACE_RULE');
    expect(consultas[0].data).toEqual({ annotation: [
      { text: 'El ' }, { markup: '\\textbf' }, { markup: '{' }, { text: 'analisis' }, { markup: '}' },
      { text: ' de' }, { markup: '~', interpretAs: ' ' }, { text: 'textos sigue.' },
    ] });
  });

  it('convierte las coincidencias en avisos con posiciones sobre el original', async () => {
    respuesta.matches = [
      coincidencia(11, 8, 'MORFOLOGIK_RULE_ES', 'misspelling', ['análisis', 'anaclisis', 'a', 'b', 'c', 'd', 'e'], 'Posible error ortográfico'),
      coincidencia(0, 2, 'AGREEMENT_DET_NOUN', 'inconsistency', ['La']),
      coincidencia(21, 2, 'ES_ESTILO', 'style', []),
    ];
    expect(await c.revisar(segmentos)).toEqual([
      { desde: 11, hasta: 19, tipo: 'ortografia', regla: 'MORFOLOGIK_RULE_ES', mensaje: 'Posible error ortográfico', sugerencias: ['análisis', 'anaclisis', 'a', 'b', 'c', 'd', 'e'] },
      { desde: 0, hasta: 2, tipo: 'gramatica', regla: 'AGREEMENT_DET_NOUN', mensaje: 'm', sugerencias: ['La'] },
      { desde: 21, hasta: 23, tipo: 'estilo', regla: 'ES_ESTILO', mensaje: 'm', sugerencias: [] },
    ]);
  });

  // La sugerencia se calculó sobre el texto sin LaTeX: aplicarla sobre un tramo que incluye
  // comandos o llaves los borraría.
  it('un aviso que cruza LaTeX conserva el mensaje pero no ofrece sugerencias', async () => {
    respuesta.matches = [
      coincidencia(0, 19, 'CONCORDANCIA', 'grammar', ['La análisis']),       // "El \textbf{analisis" cruza la llave
      coincidencia(11, 8, 'MORFOLOGIK_RULE_ES', 'misspelling', ['análisis']), // dentro de un solo tramo de prosa
      coincidencia(20, 10, 'OTRA', 'grammar', ['de los textos']),            // " de~textos" cruza la tilde de espacio
    ];
    expect((await c.revisar(segmentos))!.map((a) => [a.desde, a.sugerencias])).toEqual([
      [0, []], [11, ['análisis']], [20, []],
    ]);
  });

  it('revisarVarios devuelve null para el párrafo cuya consulta falló y avisos para los demás', async () => {
    respuesta.matches = [coincidencia(0, 2, 'R', 'grammar', [])];
    const bueno = segmentar('Uno bueno.');
    expect(await c.revisarVarios([bueno])).toEqual([[expect.objectContaining({ desde: 0 })]]);
    respuesta.status = 500;
    expect(await c.revisarVarios([bueno, segmentar('Otro que falla.'), segmentar('\\label{x}')])).toEqual([
      [expect.objectContaining({ desde: 0 })], null, [],
    ]);
  });

  it('revisarVarios no manda más de cuatro consultas a la vez', async () => {
    respuesta.demoraMs = 40;
    let enVuelo = 0;
    let maximo = 0;
    falso!.on('request', (_req, res) => { enVuelo++; maximo = Math.max(maximo, enVuelo); res.on('finish', () => { enVuelo--; }); });
    await c.revisarVarios(Array.from({ length: 12 }, (_, i) => segmentar(`Párrafo número ${i}.`)));
    expect(consultas).toHaveLength(12);
    expect(maximo).toBeLessThanOrEqual(4);
  });

  it('no marca las palabras del diccionario personal, sin importar mayúsculas', async () => {
    const texto = 'Usamos BERTopic y Embeddings mal';
    respuesta.matches = [
      coincidencia(7, 8, 'MORFOLOGIK_RULE_ES', 'misspelling', ['Bertolín']),
      coincidencia(18, 10, 'MORFOLOGIK_RULE_ES', 'misspelling', ['x']),
      coincidencia(29, 3, 'MORFOLOGIK_RULE_ES', 'misspelling', ['mal']),
      coincidencia(7, 8, 'OTRA_REGLA', 'grammar', []),
    ];
    diccionario = ['BERTopic', 'embeddings'];
    expect((await c.revisar(segmentar(texto))).map((a) => [a.desde, a.regla])).toEqual([[29, 'MORFOLOGIK_RULE_ES'], [7, 'OTRA_REGLA']]);
  });

  it('recuerda lo ya revisado y lo olvida cuando cambia el diccionario', async () => {
    await c.revisar(segmentos);
    await c.revisar(segmentar('El \\textbf{analisis} de~textos\nsigue.'));
    expect(consultas).toHaveLength(1);
    c.olvidarCache();
    await c.revisar(segmentos);
    expect(consultas).toHaveLength(2);
  });

  it('si la consulta falla devuelve sin avisos y la próxima vez reintenta', async () => {
    respuesta.status = 500;
    expect(await c.revisar(segmentos)).toEqual([]);
    respuesta.status = 200;
    respuesta.matches = [coincidencia(0, 2, 'R', 'grammar', [])];
    expect(await c.revisar(segmentos)).toHaveLength(1);
  });

  it('si la consulta tarda demasiado devuelve sin avisos, sin colgarse', async () => {
    respuesta.demoraMs = 1000;
    const inicio = Date.now();
    expect(await c.revisar(segmentos)).toEqual([]);
    expect(Date.now() - inicio).toBeLessThan(800);
  });

  it('un párrafo sin prosa no se consulta', async () => {
    expect(await c.revisar(segmentar('\\label{x}'))).toEqual([]);
    expect(consultas).toEqual([]);
  });
});

describe('arranque', () => {
  it('sin iniciar está apagado y revisar no consulta nada', async () => {
    const c = corrector(1, noLanza);
    expect(c.estado()).toEqual({ estado: 'apagado' });
    expect(await c.revisar(segmentar('Hola mundo'))).toEqual([]);
  });

  it('si en el puerto ya responde un LanguageTool, lo reutiliza sin lanzar otro', async () => {
    const puerto = await escuchar();
    const c = corrector(puerto, noLanza);
    await c.iniciar();
    expect(c.estado()).toEqual({ estado: 'listo' });
    expect(lanzamientos).toEqual([]);
  });

  it('sin LanguageTool instalado queda no disponible y dice cómo instalarlo', async () => {
    const c = corrector(1, noLanza);
    await c.iniciar();
    expect(c.estado()).toMatchObject({ estado: 'no-disponible', motivo: expect.stringMatching(/npm run instalar-corrector/) });
    expect(lanzamientos).toEqual([]);
  });

  it('lanza Java con memoria acotada y carpeta temporal propia, y queda listo cuando responde', async () => {
    instalarFalso();
    const puerto = await escuchar();
    await new Promise((r) => falso!.close(r));          // el puerto queda libre hasta que "arranque"
    const lanzar: Lanzar = (comando, args, o) => {
      lanzamientos.push({ comando, args, cwd: o.cwd });
      setTimeout(() => { void escuchar(puerto); }, 80);
      return { alSalir: () => undefined, detener: () => undefined };
    };
    const c = corrector(puerto, lanzar);
    const arranque = c.iniciar();
    expect(c.estado()).toEqual({ estado: 'iniciando' });
    await arranque;
    expect(c.estado()).toEqual({ estado: 'listo' });
    expect(lanzamientos).toEqual([{
      comando: 'java',
      cwd: path.join(dirLt, 'LanguageTool-6.6'),
      args: ['-Xmx1g', `-Djdk.net.unixdomain.tmpdir=${path.join(dirLt, 'tmp')}`, '-cp', 'languagetool-server.jar',
        'org.languagetool.server.HTTPServer', '--port', String(puerto)],
    }]);
    expect(fs.existsSync(path.join(dirLt, 'tmp'))).toBe(true);
  });

  it('sin Java queda no disponible y lo dice', async () => {
    instalarFalso();
    const lanzar: Lanzar = (comando, args, o) => {
      lanzamientos.push({ comando, args, cwd: o.cwd });
      return { alSalir: (f) => { setTimeout(() => f('no-encontrado'), 10); }, detener: () => undefined };
    };
    const c = corrector(1, lanzar);
    await c.iniciar();
    expect(c.estado()).toMatchObject({ estado: 'no-disponible', motivo: expect.stringMatching(/Java/) });
    expect(lanzamientos).toHaveLength(1);
  });

  it('si el proceso se cae al arrancar reintenta hasta tres veces y se rinde', async () => {
    instalarFalso();
    const lanzar: Lanzar = (comando, args, o) => {
      lanzamientos.push({ comando, args, cwd: o.cwd });
      return { alSalir: (f) => { setTimeout(() => f('termino'), 10); }, detener: () => undefined };
    };
    const c = corrector(1, lanzar);
    await c.iniciar();
    expect(lanzamientos).toHaveLength(3);
    expect(c.estado()).toMatchObject({ estado: 'no-disponible' });
  });

  it('si nunca responde, deja de esperar y queda no disponible', async () => {
    instalarFalso();
    const c = corrector(1, noLanza, { esperaDeArranqueMs: 150 });
    await c.iniciar();
    expect(c.estado()).toMatchObject({ estado: 'no-disponible' });
  });

  // Java puede morir después de haber arrancado bien (memoria, antivirus, suspensión).
  it('si el proceso se cae después de arrancar, lo relanza y vuelve a quedar listo', async () => {
    instalarFalso();
    const puerto = await escuchar();
    await new Promise((r) => falso!.close(r));
    const caidas: (() => void)[] = [];
    const lanzar: Lanzar = (comando, args, o) => {
      lanzamientos.push({ comando, args, cwd: o.cwd });
      setTimeout(() => { void escuchar(puerto); }, 30);
      return { alSalir: (f) => { caidas[lanzamientos.length - 1] = () => f('termino'); }, detener: () => undefined };
    };
    const c = corrector(puerto, lanzar);
    await c.iniciar();
    expect(c.estado()).toEqual({ estado: 'listo' });

    for (const s of servidores.splice(0)) { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
    caidas[0]();
    expect(c.estado()).toEqual({ estado: 'iniciando' });
    for (let i = 0; i < 100 && c.estado().estado !== 'listo'; i++) await new Promise((r) => setTimeout(r, 20));
    expect(c.estado()).toEqual({ estado: 'listo' });
    expect(lanzamientos).toHaveLength(2);
  });

  it('si se cae una y otra vez, deja de relanzarlo y queda no disponible', async () => {
    instalarFalso();
    const puerto = await escuchar();
    await new Promise((r) => falso!.close(r));
    const caidas: (() => void)[] = [];
    const lanzar: Lanzar = (comando, args, o) => {
      lanzamientos.push({ comando, args, cwd: o.cwd });
      setTimeout(() => { void escuchar(puerto); }, 20);
      return { alSalir: (f) => { caidas[lanzamientos.length - 1] = () => f('termino'); }, detener: () => undefined };
    };
    const c = corrector(puerto, lanzar);
    await c.iniciar();
    for (let n = 0; n < 4 && c.estado().estado !== 'no-disponible'; n++) {
      for (const s of servidores.splice(0)) { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
      caidas[n]();
      for (let i = 0; i < 100 && c.estado().estado === 'iniciando'; i++) await new Promise((r) => setTimeout(r, 20));
    }
    expect(c.estado()).toMatchObject({ estado: 'no-disponible' });
    expect(lanzamientos.length).toBeLessThanOrEqual(4);
  });

  it('detener termina el proceso que lanzó', async () => {
    instalarFalso();
    const puerto = await escuchar();
    await new Promise((r) => falso!.close(r));
    let detenido = 0;
    const lanzar: Lanzar = () => {
      setTimeout(() => { void escuchar(puerto); }, 30);
      return { alSalir: () => undefined, detener: () => { detenido++; } };
    };
    const c = corrector(puerto, lanzar);
    await c.iniciar();
    c.detener();
    expect(detenido).toBe(1);
    expect(c.estado()).toEqual({ estado: 'apagado' });
  });
});

// Con el LanguageTool real, si está instalado: comprueba lo que el servidor falso solo supone.
const DIR_REAL = path.resolve(import.meta.dirname, '../languagetool');
const instalado = fs.existsSync(DIR_REAL) && fs.readdirSync(DIR_REAL).some((n) => n.startsWith('LanguageTool-'));

describe.skipIf(!instalado)('con el LanguageTool real', () => {
  it('las posiciones que devuelve caen sobre la palabra en el texto original', async () => {
    // Tiempos holgados: junto con el resto de la suite la máquina está cargada.
    const c = crearCorrector({ dir: DIR_REAL, puerto: 4391, diccionario: async () => ['BERTopic'], tiempoLimiteMs: 60000 });
    correctores.push(c);
    await c.iniciar();
    expect(c.estado()).toEqual({ estado: 'listo' });
    const texto = 'Los resultado del \\textbf{analisis} con BERTopic,\nsegún~\\cite{Perez2020}, usan un 50\\% de $x^2$.';
    const avisos = await c.revisar(segmentar(texto));
    const palabras = avisos.map((a) => [texto.slice(a.desde, a.hasta), a.tipo, a.sugerencias[0]]);
    expect(palabras).toContainEqual(['analisis', 'ortografia', 'análisis']);
    expect(palabras.some(([p]) => p === 'BERTopic')).toBe(false);
    expect(palabras.some(([p, tipo]) => p === 'Los resultado' && tipo === 'gramatica')).toBe(true);
    expect(avisos.every((a) => !/[\\{}~$%]/.test(texto.slice(a.desde, a.hasta)))).toBe(true);

    // Al detenerlo no tiene que quedar ningún proceso de Java escuchando.
    c.detener();
    let sigueVivo = true;
    for (let i = 0; i < 20 && sigueVivo; i++) {
      await new Promise((r) => setTimeout(r, 250));
      sigueVivo = await fetch('http://127.0.0.1:4391/v2/languages', { signal: AbortSignal.timeout(500) }).then(() => true, () => false);
    }
    expect(sigueVivo).toBe(false);
  }, 90000);
});
