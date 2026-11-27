import { defineConfig, type Connect, type Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { integratedApiPlugin } from './server/apiPlugin';
import { handleProxyRequest } from './server/proxyHandler';

function devProxyPlugin(): Plugin {
  const attachProxy = (middlewares: Connect.Server) => {
    middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
      const handled = await handleProxyRequest(req, res);
      if (!handled) {
        next();
      }
    });
  };

  return {
    name: 'dev-proxy-plugin',
    configureServer(server) {
      attachProxy(server.middlewares);
    },
    configurePreviewServer(server) {
      attachProxy(server.middlewares);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    integratedApiPlugin(),
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

