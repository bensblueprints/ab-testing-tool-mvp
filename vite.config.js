import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'client',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: 6353,
    proxy: {
      '/api': 'http://localhost:5353',
      '/sp.js': 'http://localhost:5353',
      '/collect': 'http://localhost:5353'
    }
  }
});
