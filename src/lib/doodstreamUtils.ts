/**
 * Convierte y normaliza cualquier URL o servidor de Doodstream al formato:
 * https://dood.to/e/VIDEO_ID
 */
export function formatDoodstreamUrl(url: string | null | undefined, serverName?: string): string {
  if (!url) return '';
  if (typeof url !== 'string') return '';

  const trimmed = url.trim();
  if (!trimmed) return '';

  const isDoodServer = serverName ? /dood/i.test(serverName) : false;
  const isDoodDomain = /(?:dood\.(?:to|so|la|ws|sh|watch|pm|li|re|cx|wf|yt|video)|doodstream\.(?:com|co|net|io)|ds2play\.com|doods\.pro|playmogo\.com|myvidstream\.net)/i.test(trimmed);

  if (!isDoodServer && !isDoodDomain) {
    return trimmed;
  }

  // 1. Patrones estándar: /e/VIDEO_ID, /d/VIDEO_ID, /f/VIDEO_ID
  const eMatch = trimmed.match(/(?:\/e\/|\/d\/|\/f\/)([a-zA-Z0-9_-]+)/i);
  if (eMatch && eMatch[1]) {
    return `https://dood.to/e/${eMatch[1]}`;
  }

  // 2. Parámetros de URL: ?id=VIDEO_ID o &id=VIDEO_ID o pass_md5/VIDEO_ID
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i) || trimmed.match(/pass_md5\/([a-zA-Z0-9_-]+)/i);
  if (queryMatch && queryMatch[1]) {
    return `https://dood.to/e/${queryMatch[1]}`;
  }

  // 3. Extracción de último segmento de ruta (ej: https://dood.to/abcdef1234 o ds2play.com/xxx)
  try {
    const fullUrl = trimmed.startsWith('//') ? 'https:' + trimmed : trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(fullUrl);
    const segments = parsed.pathname.split('/').filter(s => s.trim().length > 0);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      if (/^[a-zA-Z0-9_-]{4,}$/.test(lastSegment)) {
        return `https://dood.to/e/${lastSegment}`;
      }
    }
  } catch {
    const lastSlashMatch = trimmed.match(/\/([a-zA-Z0-9_-]{4,})(?:\?|#|$)/);
    if (lastSlashMatch && lastSlashMatch[1]) {
      return `https://dood.to/e/${lastSlashMatch[1]}`;
    }
  }

  // Si no se pudo extraer un ID más específico
  return trimmed;
}

/**
 * Normaliza campos opcionales lat, cast, sub o cualquier URL de resultado
 */
export function normalizeScrapedDoodstream<T extends { lat?: string | null; cast?: string | null; sub?: string | null; url?: string; finalSrc?: string | null; playUrl?: string; serverName?: string; server?: string }>(result: T): T {
  const server = result.serverName || result.server;
  return {
    ...result,
    ...(result.lat !== undefined ? { lat: result.lat ? formatDoodstreamUrl(result.lat, server) : result.lat } : {}),
    ...(result.cast !== undefined ? { cast: result.cast ? formatDoodstreamUrl(result.cast, server) : result.cast } : {}),
    ...(result.sub !== undefined ? { sub: result.sub ? formatDoodstreamUrl(result.sub, server) : result.sub } : {}),
    ...(result.url !== undefined ? { url: result.url ? formatDoodstreamUrl(result.url, server) : result.url } : {}),
    ...(result.finalSrc !== undefined ? { finalSrc: result.finalSrc ? formatDoodstreamUrl(result.finalSrc, server) : result.finalSrc } : {}),
    ...(result.playUrl !== undefined ? { playUrl: result.playUrl ? formatDoodstreamUrl(result.playUrl, server) : result.playUrl } : {})
  };
}
