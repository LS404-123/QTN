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
        main: resolve(__dirname, 'index.html'),
        hexapod: resolve(__dirname, '六足機械/modularized/index.html'),
        jumping: resolve(__dirname, '蹦跳機械/蹦跳機械.html'),
      },
    },
  },
});
