import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],

  build: {
    outDir: './dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/public/js/script.jsx'),
        dashboard: resolve(__dirname, 'static/dashboard.html'),
      },
    },
  },

  publicDir: './static',

  server: {
    host: '0.0.0.0',
    middlewareMode: true,
  },

  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
      generateScopedName: '[path]___[name]__[local]___[hash:base64:5]',
    },
  },
});
