import { handleProxyRequest } from './_proxyHandler';

export async function onRequest(context: {
  request: Request;
  next: () => Promise<Response>;
}): Promise<Response> {
  const url = new URL(context.request.url);

  // Intercept proxy requests (/proxy.php, /proxy, /api/proxy)
  if (
    url.pathname === '/proxy.php' ||
    url.pathname === '/proxy' ||
    url.pathname === '/api/proxy'
  ) {
    return handleProxyRequest(context.request);
  }

  return context.next();
}
