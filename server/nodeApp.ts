import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFiles } from './env';
import { handleApiRequest } from './apiPlugin';
import { handleProxyRequest } from './proxyHandler';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive',
};

export interface NodeAppOptions {
  distDir?: string;
  basePath?: string;
}

function normalizeBasePath(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '/') return '';
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, '');
}

export function stripBasePath(pathname: string, basePath: string): string {
  if (!basePath) return pathname;
  if (pathname === basePath) return '/';
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || '/';
  }
  return pathname;
}

function sendStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  stat: fs.Stats,
  isAsset: boolean
): void {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', stat.size);

  if (ext === '.apk') {
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
  }

  if (isAsset) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (ext === '.html' || ext === '.json') {
    res.setHeader('Cache-Control', 'no-cache');
  }

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Error al leer el archivo estático' }));
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

export function createNodeAppHandler(options: NodeAppOptions = {}) {
  loadEnvFiles([process.cwd()]);

  const distDir = path.resolve(options.distDir || process.env.DIST_DIR || path.join(process.cwd(), 'dist'));
  const basePath = normalizeBasePath(
    options.basePath ?? process.env.APP_BASE_PATH ?? process.env.PASSENGER_BASE_URI
  );

  return async function requestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = stripBasePath(parsedUrl.pathname, basePath);

    if (pathname === '/health' || pathname === '/api/health') {
      const hasDist = fs.existsSync(path.join(distDir, 'index.html'));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, status: 'up', distAvailable: hasDist }));
      return;
    }

    if (await handleProxyRequest(req, res, pathname)) {
      return;
    }

    if (await handleApiRequest(req, res, { staticDir: distDir, pathnameOverride: pathname })) {
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
      return;
    }

    let decodedPath = '/';
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    const relativePath = decodedPath.replace(/^\/+/, '');
    const candidatePath = path.resolve(distDir, relativePath || 'index.html');
    const distPrefix = distDir.endsWith(path.sep) ? distDir : `${distDir}${path.sep}`;

    if (candidatePath !== distDir && !candidatePath.startsWith(distPrefix)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(candidatePath)) {
      const stat = fs.statSync(candidatePath);
      if (stat.isFile()) {
        sendStaticFile(req, res, candidatePath, stat, decodedPath.startsWith('/assets/'));
        return;
      }
      if (stat.isDirectory()) {
        const nestedIndex = path.join(candidatePath, 'index.html');
        if (fs.existsSync(nestedIndex)) {
          const nestedStat = fs.statSync(nestedIndex);
          if (nestedStat.isFile()) {
            sendStaticFile(req, res, nestedIndex, nestedStat, false);
            return;
          }
        }
      }
    }

    // No hacer fallback HTML para rutas .php o archivos estaticos inexistentes (.js, .css, .apk, .json, etc.)
    const hasExtension = path.posix.basename(decodedPath).includes('.');
    if (hasExtension || decodedPath.startsWith('/assets/')) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Archivo o endpoint no encontrado' }));
      return;
    }

    const indexPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        '<!doctype html><html><body><h1>Falta subir la carpeta dist/</h1><p>Compila localmente con <code>npm run build</code> y sube <code>dist/</code> junto a <code>server.cjs</code>.</p></body></html>'
      );
      return;
    }

    const indexStat = fs.statSync(indexPath);
    sendStaticFile(req, res, indexPath, indexStat, false);
  };
}

export function createNodeAppServer(options: NodeAppOptions = {}): http.Server {
  const handler = createNodeAppHandler(options);
  return http.createServer((req, res) => {
    void handler(req, res).catch((err: unknown) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const message = err instanceof Error ? err.message : 'Internal server error';
        res.end(JSON.stringify({ error: message }));
      } else {
        res.destroy();
      }
    });
  });
}
