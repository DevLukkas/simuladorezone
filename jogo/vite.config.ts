import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// so quando o dev server esta exposto por um tunel https (cloudflared) o HMR
// precisa apontar para wss://<host>:443; em localhost isso quebra o socket
// (o navegador tenta ws://localhost:443 e nada atende ali)
const porTunel = process.env.TUNEL === '1';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022' },
  // em dev o cliente esta em 5173 e o servidor em 8787; o proxy mantem tudo numa
  // origem so. Em producao o proprio servidor serve o dist/, entao o cliente pede
  // sempre /api relativo, sem endereco escrito em lugar nenhum (e sem CORS)
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
    host: true,
    allowedHosts: ['.trycloudflare.com'],
    ...(porTunel ? { hmr: { protocol: 'wss', clientPort: 443 } } : {}),
  },
});
