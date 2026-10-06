import fs from 'node:fs';
import path from 'node:path';
import { git, type EntornoPrueba } from './entornoPrueba';

// Simula a otra persona editando en Overleaf: cambia un archivo en su clon y lo publica.
export async function cambioDelCompanero(e: EntornoPrueba, ruta: string, transformar: (texto: string) => string): Promise<void> {
  git(e.companero, 'pull', '--quiet', '--no-edit');
  const archivo = path.join(e.companero, ruta);
  fs.writeFileSync(archivo, transformar(fs.readFileSync(archivo, 'utf8')));
  git(e.companero, 'add', '-A');
  git(e.companero, 'commit', '--quiet', '-m', 'Update on Overleaf.');
  git(e.companero, 'push', '--quiet');
}

// npm run companero -- <ruta> <texto>: agrega un párrafo al final del archivo.
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [ruta, ...palabras] = process.argv.slice(2);
  if (!ruta || palabras.length === 0) {
    console.error('Uso: npm run companero -- <ruta> <texto>');
    process.exit(1);
  }
  const raiz = path.resolve(import.meta.dirname, '../../.entorno-prueba');
  const e: EntornoPrueba = {
    raiz,
    remoto: path.join(raiz, 'remoto.git'),
    informe: path.join(raiz, 'informe'),
    companero: path.join(raiz, 'companero'),
  };
  await cambioDelCompanero(e, ruta, (t) => `${t.replace(/\s*$/, '')}\r\n\r\n${palabras.join(' ')}\r\n`);
  console.log(`El compañero cambió ${ruta} y lo publicó en el remoto de prueba.`);
}
