// Agente de mentira para las pruebas: lee la prompt de la entrada estándar e ignora los argumentos.
import fs from 'node:fs';

const envoltura = (result, is_error = false) =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error, result });

let entrada = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (t) => { entrada += t; });
process.stdin.on('end', () => {
  const modo = process.env.AGENTE_FALSO;
  if (modo === 'colgado') {
    setInterval(() => {}, 1000);
  } else if (modo === 'fijo') {
    process.stdout.write(fs.readFileSync(process.env.AGENTE_FALSO_SALIDA, 'utf8'));
  } else {
    process.stdout.write(envoltura('eco:' + entrada));
  }
});
