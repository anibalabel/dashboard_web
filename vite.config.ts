import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

function devProxyPlugin(): Plugin {
  return {
    name: 'dev-proxy-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const parsedUrl = new URL(req.url || '', 'http://localhost');
        if (parsedUrl.pathname === '/proxy.php' || parsedUrl.pathname === '/proxy' || parsedUrl.pathname === '/api/proxy') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
          res.setHeader('Access-Control-Allow-Headers', '*');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }

          const targetUrl = parsedUrl.searchParams.get('url');
          const referer = parsedUrl.searchParams.get('referer');
          const resolveRedirect = parsedUrl.searchParams.get('resolve_redirect') === 'true';

          if (!targetUrl) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'No URL provided' }));
            return;
          }

          try {
            if (resolveRedirect) {
              const r = await fetch(targetUrl, {
                method: 'GET',
                redirect: 'follow',
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  ...(referer ? { Referer: referer } : (targetUrl.includes('embed69.org') ? { Referer: 'https://pelisplushd.bz/' } : {})),
                },
              });
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ finalUrl: r.url || targetUrl }));
              return;
            }

            const outgoingHeaders: Record<string, string> = {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
              'Cache-Control': 'no-cache',
              Pragma: 'no-cache',
            };

            if (req.method === 'POST') {
              outgoingHeaders['Accept'] = '*/*';
              outgoingHeaders['X-Requested-With'] = 'XMLHttpRequest';
              if (req.headers['content-type']) {
                outgoingHeaders['Content-Type'] = req.headers['content-type'] as string;
              }
            } else {
              outgoingHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
            }

            if (referer) {
              outgoingHeaders['Referer'] = referer;
            } else if (targetUrl.includes('embed69.org')) {
              outgoingHeaders['Referer'] = 'https://pelisplushd.bz/';
            }

            let body: Buffer | undefined = undefined;
            if (['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
              const chunks: Buffer[] = [];
              for await (const chunk of req) {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
              }
              if (chunks.length > 0) {
                body = Buffer.concat(chunks);
              }
            }

            const response = await fetch(targetUrl, {
              method: req.method,
              headers: outgoingHeaders,
              body,
              redirect: 'follow',
            });

            res.statusCode = response.status;
            res.setHeader('Content-Type', response.headers.get('content-type') || 'text/plain');
            const arrayBuffer = await response.arrayBuffer();
            res.end(Buffer.from(arrayBuffer));
          } catch (err: unknown) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            const message = err instanceof Error ? err.message : 'Proxy request failed';
            res.end(JSON.stringify({ error: message }));
          }
          return;
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    devProxyPlugin(),
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths()
  ],
})

