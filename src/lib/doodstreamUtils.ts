import { formatStreamwishUrl, isStreamwishUrlOrServer } from './streamwishUtils';
import { formatEarnvidsUrl, isEarnvidsUrlOrServer } from './earnvidsUtils';
import { formatVidaraUrl, isVidaraUrlOrServer } from './vidaraUtils';

export {
  formatStreamwishUrl,
  isStreamwishUrlOrServer,
  formatEarnvidsUrl,
  isEarnvidsUrlOrServer,
  formatVidaraUrl,
  isVidaraUrlOrServer,
};

const KNOWN_FOREIGN_HOST_REGEX =
  /(?:^|\.)(?:vidsonic|rpmplay|p2pplay|ok\.ru|okru|streamtape|supervideo|mega\.nz|mega\.co|mail\.ru|mp4upload|lulustream|luluvdo|vidmoly|solidfiles|hxfile|player4me|audinifer|waaw|netu|zplayer|watchsb|sbplay|sbfast|streamlare|upnshare|upns|p2pstream|gumlet|burstcloud)(?:\.[a-z0-9-]+)*$/i;

function toParsableUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getHostname(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    return new URL(toParsableUrl(trimmed)).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function extractGenericVideoId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const embedHyphenMatch = trimmed.match(/\/embed-([a-zA-Z0-9_-]+)(?:\.html?)?/i);
  if (embedHyphenMatch?.[1]) {
    return embedHyphenMatch[1];
  }

  const routeMatch = trimmed.match(/(?:\/e\/|\/d\/|\/f\/|\/v\/|\/embed\/)([a-zA-Z0-9_-]+)/i);
  if (routeMatch?.[1]) {
    return routeMatch[1].replace(/\.html?$/i, '');
  }

  const queryMatch =
    trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i) || trimmed.match(/pass_md5\/([a-zA-Z0-9_-]+)/i);
  if (queryMatch?.[1]) {
    return queryMatch[1];
  }

  const htmlMatch = trimmed.match(/\/([a-zA-Z0-9_-]{4,})\.html?(?:[?#]|$)/i);
  if (htmlMatch?.[1]) {
    return htmlMatch[1];
  }

  try {
    const parsed = new URL(toParsableUrl(trimmed));
    const segments = parsed.pathname.split('/').filter((s) => s.trim().length > 0);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1].replace(/\.html?$/i, '');
      if (/^[a-zA-Z0-9_-]{4,}$/.test(lastSegment)) {
        return lastSegment;
      }
    }
  } catch {
    const lastSlashMatch = trimmed.match(/\/([a-zA-Z0-9_-]{4,})(?:\.html?)?(?:\?|#|$)/);
    if (lastSlashMatch?.[1]) {
      return lastSlashMatch[1].replace(/\.html?$/i, '');
    }
  }

  return null;
}

function formatStandardEmbed(
  url: string | null | undefined,
  serverName: string | undefined,
  matcher: (u?: string | null, s?: string) => boolean,
  targetPrefix: string,
  targetSuffix = ''
): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (!matcher(trimmed, serverName)) return trimmed;

  const videoId = extractGenericVideoId(trimmed);
  return videoId ? `${targetPrefix}${videoId}${targetSuffix}` : trimmed;
}

export function isVoeUrlOrServer(url?: string | null, serverName?: string): boolean {
  if (serverName && (/\bvoe(?:\.sx|sx)?\b/i.test(serverName) || /^voesx$/i.test(serverName.trim()))) {
    return true;
  }
  const host = getHostname(url);
  if (host) {
    return /(?:^|\.)(?:voe|voesx|voe-network)\.[a-z0-9-]+$/i.test(host);
  }
  return Boolean(url && /(?:^|\/\/)(?:[a-z0-9-]+\.)*(?:voe|voesx|voe-network)\.[a-z0-9-]+/i.test(url));
}

export function formatVoeUrl(url: string | null | undefined, serverName?: string): string {
  return formatStandardEmbed(url, serverName, isVoeUrlOrServer, 'https://voe.sx/e/');
}

export function isMixdropUrlOrServer(url?: string | null, serverName?: string): boolean {
  if (serverName && /(?:mixdrop|mxdrop)/i.test(serverName)) {
    return true;
  }
  const host = getHostname(url);
  if (host) {
    return /(?:^|\.)(?:mixdrop|mxdrop|mdy48tn97)\.[a-z0-9-]+$/i.test(host);
  }
  return Boolean(url && /(?:mixdrop|mxdrop|mdy48tn97)\.[a-z0-9-]+/i.test(url));
}

/**
 * Convierte y normaliza cualquier URL o servidor de MixDrop al formato:
 * https://mixdrop.ps/e/VIDEO_ID
 */
export function formatMixdropUrl(url: string | null | undefined, serverName?: string): string {
  return formatStandardEmbed(url, serverName, isMixdropUrlOrServer, 'https://mixdrop.ps/e/');
}

export function isDroploadUrlOrServer(url?: string | null, serverName?: string): boolean {
  if (serverName && /(?:dropload|dr0pstream|dropstream)/i.test(serverName)) {
    return true;
  }
  const host = getHostname(url);
  if (host) {
    return /(?:^|\.)(?:dropload|dr0pstream|dropstream)\.[a-z0-9-]+$/i.test(host);
  }
  return Boolean(url && /(?:dropload|dr0pstream|dropstream)\.[a-z0-9-]+/i.test(url));
}

/**
 * Convierte y normaliza cualquier URL o servidor de DropLoad / Dr0pstream al formato:
 * https://dr0pstream.com/e/VIDEO_ID
 */
export function formatDroploadUrl(url: string | null | undefined, serverName?: string): string {
  return formatStandardEmbed(url, serverName, isDroploadUrlOrServer, 'https://dr0pstream.com/e/');
}

export function isUqloadUrlOrServer(url?: string | null, serverName?: string): boolean {
  if (serverName && (/\buqload\b/i.test(serverName) || /^uq$/i.test(serverName.trim()))) {
    return true;
  }
  const host = getHostname(url);
  if (host) {
    return /(?:^|\.)uqload\.[a-z0-9-]+$/i.test(host);
  }
  return Boolean(url && /uqload\.[a-z0-9-]+/i.test(url));
}

/**
 * Normaliza enlaces de UQLoad a https://uqload.vc/embed-VIDEO_ID.html
 */
export function formatUqloadUrl(url: string | null | undefined, serverName?: string): string {
  return formatStandardEmbed(url, serverName, isUqloadUrlOrServer, 'https://uqload.vc/embed-', '.html');
}

export function isFilemoonByseUrlOrServer(url?: string | null, serverName?: string): boolean {
  if (serverName && /(?:filemoon|byse)/i.test(serverName)) {
    return true;
  }
  const host = getHostname(url);
  if (host) {
    return /(?:^|\.)(?:filemoon|byse[a-z0-9-]*|moonplayer|kerapoxy)\.[a-z0-9-]+$/i.test(host);
  }
  return Boolean(url && /(?:filemoon|byse[a-z0-9-]*)\.[a-z0-9-]+/i.test(url));
}

/**
 * Normaliza enlaces de FileMoon / Bysekoze a https://bysekoze.com/e/VIDEO_ID
 */
export function formatFilemoonByseUrl(url: string | null | undefined, serverName?: string): string {
  return formatStandardEmbed(url, serverName, isFilemoonByseUrlOrServer, 'https://bysekoze.com/e/');
}

export function isDoodstreamUrlOrServer(url?: string | null, serverName?: string): boolean {
  if (serverName && /(?:dood|dofast|playmogo)/i.test(serverName)) {
    return true;
  }
  const host = getHostname(url);
  if (host) {
    return /(?:^|\.)(?:dood(?:stream|s|cdn)?|d0o0d|doood(?:ster)?|ds2play|doply|playmogo|myvidstream)\.[a-z0-9-]+$/i.test(
      host
    );
  }
  return Boolean(
    url &&
      /(?:dood(?:stream|s|cdn)?|ds2play|d0o0d|doood(?:ster)?|doply|playmogo|myvidstream)\.[a-z0-9-]+/i.test(
        url
      )
  );
}

export function isYoutubeUrlOrServer(url?: string | null, serverName?: string): boolean {
  if (serverName && /(?:youtube|youtubelink|youtu\.be)/i.test(serverName)) {
    return true;
  }
  const host = getHostname(url);
  if (host) {
    return /(?:^|\.)(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/i.test(host);
  }
  return Boolean(url && /(?:youtube\.com|youtube-nocookie\.com|youtu\.be)/i.test(url));
}

export function extractYoutubeVideoId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(toParsableUrl(trimmed));
    const host = parsed.hostname.toLowerCase();
    const vParam = parsed.searchParams.get('v')?.trim();
    if (vParam && /^[a-zA-Z0-9_-]{6,20}$/.test(vParam)) {
      return vParam;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const candidate = segments[0];
      if (candidate && /^[a-zA-Z0-9_-]{6,20}$/.test(candidate)) {
        return candidate;
      }
    }

    if (
      segments.length >= 2 &&
      ['embed', 'shorts', 'live', 'v', 'e'].includes(segments[0].toLowerCase())
    ) {
      const candidate = segments[1];
      if (/^[a-zA-Z0-9_-]{6,20}$/.test(candidate)) {
        return candidate;
      }
    }
  } catch {
    const regexMatch =
      trimmed.match(/[?&]v=([a-zA-Z0-9_-]{6,20})/i) ||
      trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{6,20})/i) ||
      trimmed.match(/\/(?:embed|shorts|live|v|e)\/([a-zA-Z0-9_-]{6,20})/i);
    if (regexMatch?.[1]) {
      return regexMatch[1];
    }
  }

  return null;
}

/**
 * Normaliza enlaces de YouTube a https://www.youtube.com/watch?v=VIDEO_ID
 */
export function formatYoutubeUrl(url: string | null | undefined, serverName?: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (!isYoutubeUrlOrServer(trimmed, serverName)) return trimmed;

  const videoId = extractYoutubeVideoId(trimmed) || (serverName ? extractGenericVideoId(trimmed) : null);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : trimmed;
}

const HOST_HANDLERS: Array<{
  matches: (u?: string | null, s?: string) => boolean;
  format: (u: string, s?: string) => string;
}> = [
  { matches: isYoutubeUrlOrServer, format: formatYoutubeUrl },
  { matches: isVidaraUrlOrServer, format: formatVidaraUrl },
  { matches: isStreamwishUrlOrServer, format: formatStreamwishUrl },
  { matches: isEarnvidsUrlOrServer, format: formatEarnvidsUrl },
  { matches: isVoeUrlOrServer, format: formatVoeUrl },
  { matches: isMixdropUrlOrServer, format: formatMixdropUrl },
  { matches: isDroploadUrlOrServer, format: formatDroploadUrl },
  { matches: isUqloadUrlOrServer, format: formatUqloadUrl },
  { matches: isFilemoonByseUrlOrServer, format: formatFilemoonByseUrl },
  {
    matches: isDoodstreamUrlOrServer,
    format: (u, s) => formatStandardEmbed(u, s, isDoodstreamUrlOrServer, 'https://playmogo.com/e/'),
  },
];

/**
 * Convierte y normaliza cualquier URL o servidor soportado al formato canónico establecido
 * tanto para extracción/scraping como para registro/edición.
 */
export function formatDoodstreamUrl(url: string | null | undefined, serverName?: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // 1. Detectar por dominio explícito en la URL primero (evita falsos positivos por serverName genérico)
  for (const handler of HOST_HANDLERS) {
    if (handler.matches(trimmed, undefined)) {
      return handler.format(trimmed, serverName);
    }
  }

  // 2. Si el dominio no es de otro host conocido, detectar por serverName / header
  const host = getHostname(trimmed);
  if (serverName && (!host || !KNOWN_FOREIGN_HOST_REGEX.test(host))) {
    for (const handler of HOST_HANDLERS) {
      if (handler.matches(trimmed, serverName)) {
        return handler.format(trimmed, serverName);
      }
    }
  }

  return trimmed;
}

/**
 * Normaliza cualquier URL detectando automáticamente el servidor soportado.
 */
export function normalizeScrapedUrl(url: string | null | undefined, serverName?: string): string {
  return formatDoodstreamUrl(url, serverName);
}

/**
 * Normaliza campos opcionales lat, cast, sub o cualquier URL de resultado
 */
export function normalizeScrapedDoodstream<
  T extends {
    lat?: string | null;
    cast?: string | null;
    sub?: string | null;
    url?: string;
    finalSrc?: string | null;
    playUrl?: string;
    serverName?: string;
    server?: string;
  },
>(result: T): T {
  const server = result.serverName || result.server;
  return {
    ...result,
    ...(result.lat !== undefined ? { lat: result.lat ? normalizeScrapedUrl(result.lat, server) : result.lat } : {}),
    ...(result.cast !== undefined ? { cast: result.cast ? normalizeScrapedUrl(result.cast, server) : result.cast } : {}),
    ...(result.sub !== undefined ? { sub: result.sub ? normalizeScrapedUrl(result.sub, server) : result.sub } : {}),
    ...(result.url !== undefined ? { url: result.url ? normalizeScrapedUrl(result.url, server) : result.url } : {}),
    ...(result.finalSrc !== undefined ? { finalSrc: result.finalSrc ? normalizeScrapedUrl(result.finalSrc, server) : result.finalSrc } : {}),
    ...(result.playUrl !== undefined ? { playUrl: result.playUrl ? normalizeScrapedUrl(result.playUrl, server) : result.playUrl } : {}),
  };
}
