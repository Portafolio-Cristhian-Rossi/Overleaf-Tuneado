import { describe, expect, it } from 'vitest';
import { decidir } from './autocorreccion';

const NO_EXISTE = 'MORFOLOGIK_RULE_ES';
const sinExcepciones = new Set<string>();
const aviso = (sugerencias: string[], regla = NO_EXISTE) => ({ regla, sugerencias });

// Las sugerencias de cada caso son las que devolvió LanguageTool 6.6 en la sonda del 2026-10-06.
describe('decidir', () => {
  describe('tilde faltante', () => {
    it.each([
      ['analisis', ['análisis', 'anaclisis', 'ana lisis'], 'análisis'],
      ['metodo', ['método', 'métodos', 'metido', 'Metodio', 'me todo'], 'método'],
      ['topico', ['tópico', 'típico', 'tóxico', 'trópico', 'tópicos'], 'tópico'],
      ['evaluacion', ['evaluación', 'evacuación', 'devaluación'], 'evaluación'],
      ['investigacion', ['investigación'], 'investigación'],
      ['Analisis', ['Análisis', 'Anaclisis'], 'Análisis'],
    ])('%s → %s', (palabra, sugerencias, esperado) => {
      expect(decidir(palabra, aviso(sugerencias), sinExcepciones)).toBe(esperado);
    });

    it('no elige si hay dos formas con tilde posibles', () => {
      expect(decidir('termino', aviso(['término', 'terminó']), sinExcepciones)).toBeNull();
    });
  });

  describe('letras invertidas', () => {
    it('una sola candidata: se corrige, también si además le falta la tilde', () => {
      expect(decidir('invesitgacion', aviso(['investigación']), sinExcepciones)).toBe('investigación');
      expect(decidir('trabjao', aviso(['trabajo', 'trabajó']), sinExcepciones)).toBe('trabajo');
    });

    it('dos candidatas: no se toca', () => {
      expect(decidir('modleo', aviso(['modelo', 'moldeo', 'modeló', 'moldeó']), sinExcepciones)).toBeNull();
    });

    it('en palabras cortas no se aplica', () => {
      expect(decidir('uan', aviso(['una', 'un', 'van']), sinExcepciones)).toBeNull();
    });
  });

  describe('doble mayúscula inicial', () => {
    it('ESta → Esta', () => {
      expect(decidir('ESta', aviso(['Esta', 'Está', 'Ésta', 'Este', 'Están']), sinExcepciones)).toBe('Esta');
    });

    it('no toca nombres con mayúsculas internas', () => {
      expect(decidir('IDs', aviso(['Idos', 'Ods']), sinExcepciones)).toBeNull();
    });
  });

  describe('lo que no es inequívoco no se toca', () => {
    it.each([
      ['introccion', ['introducción', 'instrucción', 'interacción', 'infracción']],
      ['conbinaciones', ['combinaciones', 'confinaciones', 'conminaciones', 'con binaciones']],
      ['topic', ['tópico', 'tópica', 'Tepic', 'topia']],
      ['Topic', ['Tópico', 'Tópica', 'Tepic', 'Topia']],
      ['embeddings', ['embestinos', 'envedija', 'envedijas']],
      ['BERTopic', ['Bertolín', 'Bertoni']],
      ['Biterm', ['Bíter']],
      ['Modeling', ['Modelan', 'Modélico', 'Modeliza']],
    ])('%s', (palabra, sugerencias) => {
      expect(decidir(palabra, aviso(sugerencias), sinExcepciones)).toBeNull();
    });
  });

  // Estas palabras existen sin tilde: el corrector las marca por el contexto, y puede equivocarse.
  describe('tildes que dependen del contexto', () => {
    it.each([
      ['calculo', ['cálculo'], 'DIACRITICS_04'],
      ['mas', ['más'], 'MAS'],
      ['mi', ['mí'], 'MI_TILDE'],
      ['sera', ['será'], 'SERA'],
      ['ultimo', ['último'], 'ULTIMO'],
      ['numero', ['número'], 'NUMERO'],
      ['pagina', ['página'], 'PAGINA'],
    ])('%s solo se subraya', (palabra, sugerencias, regla) => {
      expect(decidir(palabra, aviso(sugerencias, regla), sinExcepciones)).toBeNull();
    });
  });

  describe('palabras que nunca existen sin tilde', () => {
    it.each([
      ['tambien', ['también', 'cambien'], 'ES_SIMPLE_REPLACE_SIMPLE_TAMBIEN', 'también'],
      ['ademas', ['además'], 'ADEMAS', 'además'],
      ['Ademas', ['Además'], 'ADEMAS', 'Además'],
    ])('%s se corrige aunque la regla sea otra', (palabra, sugerencias, regla, esperado) => {
      expect(decidir(palabra, aviso(sugerencias, regla), sinExcepciones)).toBe(esperado);
    });

    it('si el corrector no propone esa forma, no se toca', () => {
      expect(decidir('tambien', aviso(['cambien'], 'OTRA'), sinExcepciones)).toBeNull();
    });
  });

  // Un informe técnico está lleno de términos en inglés y siglas. Ante la duda, no se tocan.
  describe('términos en inglés y siglas', () => {
    it.each([
      ['seed', ['sede', 'seda']],
      ['mean', ['mena', 'mean']],
      ['form', ['from', 'forma']],
      ['BERT', ['BRET', 'BEST']],
      ['IDs', ['Ids']],
      ['GPUs', ['Gpus']],
      ['BERTopic', ['Bertópic']],
      ['iPhone', ['iPhóne']],
      ['word2vec', ['wordvec']],
    ])('%s no se corrige', (palabra, sugerencias) => {
      expect(decidir(palabra, aviso(sugerencias), sinExcepciones)).toBeNull();
    });

    it('las letras invertidas solo se corrigen en palabras de seis letras o más', () => {
      expect(decidir('csaa', aviso(['casa']), sinExcepciones)).toBeNull();
      expect(decidir('modleos', aviso(['modelos']), sinExcepciones)).toBe('modelos');
    });

    it('la candidata por letras invertidas tiene que ser la primera sugerencia', () => {
      expect(decidir('trabjao', aviso(['trabado', 'trabajo']), sinExcepciones)).toBeNull();
      expect(decidir('trabjao', aviso(['trabajo', 'trabado']), sinExcepciones)).toBe('trabajo');
    });

    it('la doble mayúscula pide al menos dos minúsculas detrás', () => {
      expect(decidir('ESta', aviso(['Esta', 'Está']), sinExcepciones)).toBe('Esta');
      expect(decidir('ELa', aviso(['Ela']), sinExcepciones)).toBeNull();
    });
  });

  // Decidir "hay una única candidata" exige ver todas las sugerencias, no las primeras cinco.
  it('con dos candidatas de tilde no corrige, esté donde esté la segunda', () => {
    expect(decidir('termino', aviso(['término', 'a', 'b', 'c', 'd', 'terminó']), sinExcepciones)).toBeNull();
  });

  describe('límites', () => {
    it('sin aviso no hay nada que corregir', () => {
      expect(decidir('análisis', null, sinExcepciones)).toBeNull();
    });

    it('una palabra en excepciones no se toca, sin importar mayúsculas', () => {
      expect(decidir('analisis', aviso(['análisis']), new Set(['analisis']))).toBeNull();
      expect(decidir('Analisis', aviso(['Análisis']), new Set(['analisis']))).toBeNull();
    });

    it('nunca propone una sugerencia que parte la palabra en dos', () => {
      expect(decidir('metodo', aviso(['me todo']), sinExcepciones)).toBeNull();
    });

    it('nunca devuelve la misma palabra', () => {
      expect(decidir('método', aviso(['método']), sinExcepciones)).toBeNull();
    });
  });
});
