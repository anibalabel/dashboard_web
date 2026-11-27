import type { IncomingMessage, ServerResponse } from 'node:http';

const PROXY_PATHS = new Set(['/proxy.php', '/proxy', '/api/proxy']);

export function isProxyPath(pathname: string): boolean {
  return PROXY_PATHS.has(pathname);
}

/**
 * Manejador HTTP compartido para /proxy.php, /proxy y /api/proxy
 * (usado tanto en desarrollo con Vite como en produccion en Node.js / Namecheap).
 */
export async function handleProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathnameOverride?: string
): Promise<boolean> {
  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = pathnameOverride || parsedUrl.pathname;

  if (!isProxyPath(pathname)) {
    return false;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  const targetUrl = parsedUrl.searchParams.get('url');
  const referer = parsedUrl.searchParams.get('referer');
  const resolveRedirect = parsedUrl.searchParams.get('resolve_redirect') === 'true';

  if (!targetUrl) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'No URL provided' }));
    return true;
  }

  try {
    if (resolveRedirect) {
      const r = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...(referer
            ? { Referer: referer }
            : targetUrl.includes('embed69.org')
              ? { Referer: 'https://pelisplushd.bz/' }
              : {}),
        },
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ finalUrl: r.url || targetUrl }));
      return true;
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
        outgoingHeaders['Content-Type'] = String(req.headers['content-type']);
      }
    } else {
      outgoingHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    }

    if (referer) {
      outgoingHeaders['Referer'] = referer;
    } else if (targetUrl.includes('embed69.org')) {
      outgoingHeaders['Referer'] = 'https://pelisplushd.bz/';
    }

    const customHeadersRaw = req.headers['x-proxy-headers'];
    if (typeof customHeadersRaw === 'string' && customHeadersRaw.trim()) {
      try {
        const parsedCustom = JSON.parse(customHeadersRaw);
        if (parsedCustom && typeof parsedCustom === 'object') {
          for (const [k, v] of Object.entries(parsedCustom)) {
            outgoingHeaders[k] = String(v);
          }
        }
      } catch {
        // ignore invalid JSON
      }
    }

    const customCookiesRaw = req.headers['x-proxy-cookies'];
    if (typeof customCookiesRaw === 'string' && customCookiesRaw.trim()) {
      outgoingHeaders['Cookie'] = customCookiesRaw;
    }

    let body: Buffer | undefined;
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
    res.setHeader('Content-Type', response.headers.get('content-type') || 'text/plain; charset=utf-8');
    const arrayBuffer = await response.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err: unknown) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const message = err instanceof Error ? err.message : 'Proxy request failed';
    res.end(JSON.stringify({ error: message }));
  }

  return true;
}
