export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Intercept proxy requests (/api/proxy, /proxy, /proxy.php)
    if (
      url.pathname === '/api/proxy' ||
      url.pathname === '/proxy' ||
      url.pathname === '/proxy.php'
    ) {
      return handleProxy(request);
    }

    // Serve static assets and SPA routes using Cloudflare Pages Assets binding
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};

async function handleProxy(request) {
  // CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const reqUrl = new URL(request.url);
  const targetUrl = reqUrl.searchParams.get('url');
  const referer = reqUrl.searchParams.get('referer');
  const resolveRedirect = reqUrl.searchParams.get('resolve_redirect') === 'true';

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'No URL provided' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Resolve redirect (e.g. Streamwish)
  if (resolveRedirect) {
    try {
      const redirectHeaders = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: '*/*',
      };
      if (referer) {
        redirectHeaders['Referer'] = referer;
      } else if (targetUrl.includes('embed69.org')) {
        redirectHeaders['Referer'] = 'https://pelisplushd.bz/';
      }

      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: redirectHeaders,
        redirect: 'follow',
      });

      const finalUrl = res.url || targetUrl;
      return new Response(JSON.stringify({ finalUrl }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ finalUrl: targetUrl, error: err?.message || 'Redirect resolution failed' }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  }

  // Prepare outgoing headers
  const outgoingHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };

  if (request.method === 'POST') {
    outgoingHeaders['Accept'] = '*/*';
    outgoingHeaders['X-Requested-With'] = 'XMLHttpRequest';
    const ct = request.headers.get('content-type');
    if (ct) {
      outgoingHeaders['Content-Type'] = ct;
    }
  } else {
    outgoingHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  }

  if (referer) {
    outgoingHeaders['Referer'] = referer;
  } else if (targetUrl.includes('embed69.org')) {
    outgoingHeaders['Referer'] = 'https://pelisplushd.bz/';
  }

  let body = undefined;
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    try {
      const buffer = await request.arrayBuffer();
      if (buffer && buffer.byteLength > 0) {
        body = buffer;
      }
    } catch {
      body = undefined;
    }
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: outgoingHeaders,
      body,
      redirect: 'follow',
    });

    const responseBody = await upstream.arrayBuffer();
    const contentType = upstream.headers.get('content-type') || 'text/plain';

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    responseHeaders.set('Content-Type', contentType);

    return new Response(responseBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Error fetching URL' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
