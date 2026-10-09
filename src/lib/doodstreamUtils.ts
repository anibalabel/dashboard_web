import { formatStreamwishUrl, isStreamwishUrlOrServer } from './streamwishUtils';
import { formatEarnvidsUrl, isEarnvidsUrlOrServer } from './earnvidsUtils';
export { formatStreamwishUrl, isStreamwishUrlOrServer, formatEarnvidsUrl, isEarnvidsUrlOrServer };

/**
 * Convierte y normaliza cualquier URL o servidor soportado (Doodstream, Streamwish, EarnVids/Smoothpre, MixDrop, DropLoad)
 * al formato predeterminado o configurado.
 */
export function formatDoodstreamUrl(url: string | null | undefined, serverName?: string): string {
  if (!url) return '';
  if (typeof url !== 'string') return '';

  const trimmed = url.trim();
  if (!trimmed) return '';

  // 1. Verificación y normalización de Streamwish (predeterminado: https://streamwish.fun/e/VIDEO_ID)
  const isStreamwish = isStreamwishUrlOrServer(trimmed, serverName);
  if (isStreamwish) {
    return formatStreamwishUrl(trimmed, serverName);
  }

  // 2. Verificación y normalización de EarnVids (predeterminado: https://smoothpre.com/v/VIDEO_ID)
  const isEarnvids = isEarnvidsUrlOrServer(trimmed, serverName);
  if (isEarnvids) {
    return formatEarnvidsUrl(trimmed, serverName);
  }

  // 3. Verificación y normalización de MixDrop
  const isMixdrop = (serverName && /mixdrop/i.test(serverName)) || /mixdrop\.[a-z0-9]+/i.test(trimmed);
  if (isMixdrop) {
    return formatMixdropUrl(trimmed, serverName);
  }

  // 3. Verificación y normalización de DropLoad / Dr0pstream
  const isDropload = (serverName && /(?:dropload|dr0pstream|dropstream)/i.test(serverName)) || /(?:dropload\.[a-z0-9]+|dr0pstream\.[a-z0-9]+|dropstream\.[a-z0-9]+)/i.test(trimmed);
  if (isDropload) {
    return formatDroploadUrl(trimmed, serverName);
  }

  // 4. Verificación y normalización de Doodstream
  const isDoodServer = serverName ? /dood/i.test(serverName) : false;
  const isDoodDomain = /(?:dood\.(?:to|so|la|ws|sh|watch|pm|li|re|cx|wf|yt|video)|doodstream\.(?:com|co|net|io)|ds2play\.com|doods\.pro|playmogo\.com|myvidstream\.net)/i.test(trimmed);

  if (!isDoodServer && !isDoodDomain) {
    return trimmed;
  }

  // Patrones estándar: /e/VIDEO_ID, /d/VIDEO_ID, /f/VIDEO_ID
  const eMatch = trimmed.match(/(?:\/e\/|\/d\/|\/f\/)([a-zA-Z0-9_-]+)/i);
  if (eMatch && eMatch[1]) {
    return `https://dood.to/e/${eMatch[1]}`;
  }

  // Parámetros de URL: ?id=VIDEO_ID o &id=VIDEO_ID o pass_md5/VIDEO_ID
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i) || trimmed.match(/pass_md5\/([a-zA-Z0-9_-]+)/i);
  if (queryMatch && queryMatch[1]) {
    return `https://dood.to/e/${queryMatch[1]}`;
  }

  // Extracción de último segmento de ruta (ej: https://dood.to/abcdef1234)
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

  return trimmed;
}

/**
 * Convierte y normaliza cualquier URL o servidor de MixDrop al formato:
 * https://mixdrop.ps/e/VIDEO_ID
 */
export function formatMixdropUrl(url: string | null | undefined, serverName?: string): string {
  if (!url) return '';
  if (typeof url !== 'string') return '';

  const trimmed = url.trim();
  if (!trimmed) return '';

  const isMixdropServer = serverName ? /mixdrop/i.test(serverName) : false;
  const isMixdropDomain = /mixdrop\.[a-z0-9]+/i.test(trimmed);

  if (!isMixdropServer && !isMixdropDomain) {
    return trimmed;
  }

  // 1. Patrones /e/VIDEO_ID o /f/VIDEO_ID o /d/VIDEO_ID
  const eMatch = trimmed.match(/(?:\/e\/|\/f\/|\/d\/|\/embed\/)([a-zA-Z0-9_-]+)/i);
  if (eMatch && eMatch[1]) {
    return `https://mixdrop.ps/e/${eMatch[1]}`;
  }

  // 2. Extracción de último segmento
  try {
    const fullUrl = trimmed.startsWith('//') ? 'https:' + trimmed : trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(fullUrl);
    const segments = parsed.pathname.split('/').filter(s => s.trim().length > 0);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      if (/^[a-zA-Z0-9_-]{4,}$/.test(lastSegment)) {
        return `https://mixdrop.ps/e/${lastSegment}`;
      }
    }
  } catch {
    const lastSlashMatch = trimmed.match(/\/([a-zA-Z0-9_-]{4,})(?:\?|#|$)/);
    if (lastSlashMatch && lastSlashMatch[1]) {
      return `https://mixdrop.ps/e/${lastSlashMatch[1]}`;
    }
  }

  return trimmed;
}

/**
 * Convierte y normaliza cualquier URL o servidor de DropLoad / Dr0pstream al formato:
 * https://dr0pstream.com/e/VIDEO_ID
 */
export function formatDroploadUrl(url: string | null | undefined, serverName?: string): string {
  if (!url) return '';
  if (typeof url !== 'string') return '';

  const trimmed = url.trim();
  if (!trimmed) return '';

  const isDroploadServer = serverName ? /(?:dropload|dr0pstream|dropstream)/i.test(serverName) : false;
  const isDroploadDomain = /(?:dropload\.[a-z0-9]+|dr0pstream\.[a-z0-9]+|dropstream\.[a-z0-9]+)/i.test(trimmed);

  if (!isDroploadServer && !isDroploadDomain) {
    return trimmed;
  }

  // 1. Patrones /e/VIDEO_ID o /d/VIDEO_ID o /f/VIDEO_ID
  const eMatch = trimmed.match(/(?:\/e\/|\/d\/|\/f\/|\/embed\/)([a-zA-Z0-9_-]+)/i);
  if (eMatch && eMatch[1]) {
    return `https://dr0pstream.com/e/${eMatch[1]}`;
  }

  // 2. Extracción de último segmento
  try {
    const fullUrl = trimmed.startsWith('//') ? 'https:' + trimmed : trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(fullUrl);
    const segments = parsed.pathname.split('/').filter(s => s.trim().length > 0);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      if (/^[a-zA-Z0-9_-]{4,}$/.test(lastSegment)) {
        return `https://dr0pstream.com/e/${lastSegment}`;
      }
    }
  } catch {
    const lastSlashMatch = trimmed.match(/\/([a-zA-Z0-9_-]{4,})(?:\?|#|$)/);
    if (lastSlashMatch && lastSlashMatch[1]) {
      return `https://dr0pstream.com/e/${lastSlashMatch[1]}`;
    }
  }

  return trimmed;
}

/**
 * Normaliza cualquier URL detectando automáticamente Streamwish, Doodstream, MixDrop o DropLoad
 */
export function normalizeScrapedUrl(url: string | null | undefined, serverName?: string): string {
  return formatDoodstreamUrl(url, serverName);
}

/**
 * Normaliza campos opcionales lat, cast, sub o cualquier URL de resultado
 */
export function normalizeScrapedDoodstream<T extends { lat?: string | null; cast?: string | null; sub?: string | null; url?: string; finalSrc?: string | null; playUrl?: string; serverName?: string; server?: string }>(result: T): T {
  const server = result.serverName || result.server;
  return {
    ...result,
    ...(result.lat !== undefined ? { lat: result.lat ? normalizeScrapedUrl(result.lat, server) : result.lat } : {}),
    ...(result.cast !== undefined ? { cast: result.cast ? normalizeScrapedUrl(result.cast, server) : result.cast } : {}),
    ...(result.sub !== undefined ? { sub: result.sub ? normalizeScrapedUrl(result.sub, server) : result.sub } : {}),
    ...(result.url !== undefined ? { url: result.url ? normalizeScrapedUrl(result.url, server) : result.url } : {}),
    ...(result.finalSrc !== undefined ? { finalSrc: result.finalSrc ? normalizeScrapedUrl(result.finalSrc, server) : result.finalSrc } : {}),
    ...(result.playUrl !== undefined ? { playUrl: result.playUrl ? normalizeScrapedUrl(result.playUrl, server) : result.playUrl } : {})
  };
}
