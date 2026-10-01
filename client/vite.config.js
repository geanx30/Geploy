import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ['vm-sistemas', 'localhost'],
    proxy: {
      '/api': {
        target: 'http://localhost:7070',
        changeOrigin: true,
      },
    },
  },
});
