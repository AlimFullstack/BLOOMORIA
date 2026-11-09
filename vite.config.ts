import { defineConfig } from 'vite';

export default defineConfig({
  base: '/BLOOMORIA/',
  server: {
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Separate the only large dependency (Phaser) for long-term browser caching across
        // app deploys. This does not reduce total JS transfer/parse; initial mobile load cost
        // remains dominated by Phaser. No chunkSizeWarningLimit override (warning kept honest).
        manualChunks(id): string | undefined {
          if (id.includes('node_modules/phaser')) return 'phaser';
          return undefined;
        },
      },
    },
  },
});
