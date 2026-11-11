import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const apiTarget=process.env.API_TARGET||'http://127.0.0.1:3001';
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? process.env.PAGES_BASE_PATH || '/hepai-repair/' : '/',
  define: { 'import.meta.env.VITE_STATIC_DEMO': JSON.stringify(mode === 'pages' ? 'true' : 'false') },
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true,
    fs: { strict: true, deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/server/**', '**/data/**', '**/tests/**'] },
    proxy: {
    '/socket.io': { target: apiTarget, ws: true },
    '/api': apiTarget
  } }
}));
