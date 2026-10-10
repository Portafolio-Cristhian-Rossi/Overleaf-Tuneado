import { api, mantenerVivoAlServidor } from './api';
import { abrirCanal, crearCompilacion } from './compilacion';
import { crearPanelPdf } from './pantalla/panelPdf';

// La ventana del PDF, para tenerlo en otra pantalla. Compilar se lo pide al editor, que guarda
// antes; un clic en un problema lleva el editor a esa línea.
const canal = abrirCanal();
const panel = crearPanelPdf(document.getElementById('pdf') as HTMLElement, {
  alCompilar: () => { void compilacion.compilar(); },
  alElegirProblema: (ruta, linea) => canal.enviar({ tipo: 'ir-a', ruta, linea }),
});
const compilacion = crearCompilacion({ canal, pantalla: panel, compilar: api.compilar });

window.addEventListener('pagehide', () => compilacion.soltar());
mantenerVivoAlServidor();
canal.enviar({ tipo: 'hola' });
