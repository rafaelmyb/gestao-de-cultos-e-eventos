import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import eventsHandler from './api/events.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // Only the dev server receives these values; never inject them into the browser bundle.
  for (const key of ['SUPABASE_URL', 'SUPABASE_KEY']) {
    if (env[key]) process.env[key] = env[key];
  }
  return {
    server: { port: 3000, host: '127.0.0.1' },
    plugins: [react(), {
      name: 'local-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const pathname = req.url?.split('?')[0];
          const handler = pathname === '/api/events' ? eventsHandler : null;
          if (!handler) return next();
          Promise.resolve(handler(req, res)).catch(next);
        });
      },
    }],
    resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  };
});
