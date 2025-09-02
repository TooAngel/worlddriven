import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  root: './src/public',
  publicDir: '../../static',

  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './src/public/js/script.jsx',
      },
    },
  },

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
