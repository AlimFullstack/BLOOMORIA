import { defineConfig } from 'vite';

export default defineConfig({
  base: '/BLOOMORIA/',
  server: {
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
