import path from 'node:path';
import { defineConfig } from 'vite';

const pagina = (nombre: string) => path.resolve(import.meta.dirname, 'cliente', nombre);

export default defineConfig({
  root: 'cliente',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Dos páginas: el editor y la ventana aparte del PDF.
    rolldownOptions: { input: { index: pagina('index.html'), pdf: pagina('pdf.html') } },
  },
  server: { proxy: { '/api': 'http://127.0.0.1:4317' } },
});
