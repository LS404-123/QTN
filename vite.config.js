import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    open: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        hexapod: resolve(import.meta.dirname, '六足機械/modularized/index.html'),
        jumping: resolve(import.meta.dirname, '蹦跳機械/蹦跳機械.html'),
        doctor: resolve(import.meta.dirname, '六足機械/Doctor/doctor.html'),
      },
    },
  },
});
