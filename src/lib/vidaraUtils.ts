export const DEFAULT_VIDARA_API_KEY = '72986748feba04250dd69f366cb4ed0125c6f6323f27bd2aa0b77ce5acde10f7';
export const DEFAULT_VIDARA_WATCH_BASE = 'https://vidara.so/v/';
export const DEFAULT_VIDARA_EMBED_BASE = 'https://vidara.so/e/';
export const DEFAULT_VIDARA_BASE = DEFAULT_VIDARA_WATCH_BASE;

export interface ParsedVidaraItem {
  id: string;
  rawLine: string;
  url: string;
  title: string;
  isValid: boolean;
  skipReason?: string;
}

/**
 * Parsea el texto introducido en lotes, soportando formatos como:
 * - https://url.com/video = mi-titulo
 * - https://url.com/video\t=\tmi-titulo
 * - https://url.com/video\tmi-titulo
 * - https://url.com/video | mi-titulo
 * - https://url.com/video
 * 
 * Ignora automáticamente líneas que no tengan una URL válida (como comentarios o líneas con "FALTA...").
 */
export function parseVidaraBatchInput(input: string): {
  items: ParsedVidaraItem[];
  validItems: ParsedVidaraItem[];
  validCount: number;
  skippedCount: number;
} {
  if (!input || !input.trim()) {
    return { items: [], validItems: [], validCount: 0, skippedCount: 0 };
  }

  const lines = input.split(/\r?\n/);
  const items: ParsedVidaraItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      continue;
    }

    let urlCandidate = '';
    let titleCandidate = '';

    if (trimmed.includes('=')) {
      const parts = trimmed.split('=');
      urlCandidate = parts[0].trim();
      titleCandidate = parts.slice(1).join('=').trim();
    } else if (trimmed.includes('\t')) {
      const parts = trimmed.split('\t').map((p) => p.trim()).filter(Boolean);
      urlCandidate = parts[0] || '';
      titleCandidate = parts.slice(1).join(' ') || '';
    } else if (trimmed.includes('|')) {
      const parts = trimmed.split('|');
      urlCandidate = parts[0].trim();
      titleCandidate = parts.slice(1).join('|').trim();
    } else {
      urlCandidate = trimmed;
      titleCandidate = '';
    }

    // Limpiar comentarios o notas finales en el título
    titleCandidate = titleCandidate
      .replace(/['"]\s*(?:esta no hay que|ignorar|comentario|nota|skip).*['"]$/i, '')
      .replace(/\/\/.+$/, '')
      .replace(/#.+$/, '')
      .trim();

    // Eliminar comillas externas
    titleCandidate = titleCandidate.replace(/^["']|["']$/g, '').trim();
    urlCandidate = urlCandidate.replace(/^["']|["']$/g, '').trim();

    // Validar si la URL empieza por http:// o https://
    const isHttpUrl = /^https?:\/\//i.test(urlCandidate) || /^\/\//i.test(urlCandidate);

    if (isHttpUrl) {
      items.push({
        id: `item-${i}-${Math.random().toString(36).substring(2, 7)}`,
        rawLine,
        url: urlCandidate,
        title: titleCandidate,
        isValid: true,
      });
    } else {
      items.push({
        id: `item-${i}-${Math.random().toString(36).substring(2, 7)}`,
        rawLine,
        url: urlCandidate,
        title: titleCandidate,
        isValid: false,
        skipReason: 'Línea omitida: no contiene una URL válida (http/https)',
      });
    }
  }

  const validItems = items.filter((item) => item.isValid);

  return {
    items,
    validItems,
    validCount: validItems.length,
    skippedCount: items.length - validItems.length,
  };
}

/**
 * Obtiene la URL completa de Vidara para un filecode (por defecto: https://vidara.so/v/VIDEO_ID)
 */
export function getVidaraUrl(filecode: string, type: 'watch' | 'embed' = 'watch'): string {
  if (!filecode) return '';
  const cleanCode = filecode.trim();
  if (type === 'embed') {
    return `${DEFAULT_VIDARA_EMBED_BASE}${cleanCode}`;
  }
  return `${DEFAULT_VIDARA_WATCH_BASE}${cleanCode}`;
}

/**
 * Comprueba si un servidor o URL corresponde a Vidara (incluyendo alias comunes como "virda").
 */
export function isVidaraUrlOrServer(url?: string | null, serverName?: string): boolean {
  if (serverName && /(?:vidara|virda)/i.test(serverName)) {
    return true;
  }

  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  try {
    const fullUrl = trimmed.startsWith('//')
      ? `https:${trimmed}`
      : /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
    const host = new URL(fullUrl).hostname.toLowerCase();
    return /(?:^|\.)vidara\.[a-z0-9-]+$/i.test(host);
  } catch {
    return /(?:^|\/\/)(?:[a-z0-9-]+\.)*vidara\.[a-z0-9-]+/i.test(trimmed);
  }
}

/**
 * Extrae el VIDEO_ID de un enlace de Vidara.
 */
export function extractVidaraVideoId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const embedHyphenMatch = trimmed.match(/\/embed-([a-zA-Z0-9_-]+)(?:\.html?)?/i);
  if (embedHyphenMatch?.[1]) {
    return embedHyphenMatch[1];
  }

  const routeMatch = trimmed.match(/(?:\/v\/|\/e\/|\/d\/|\/f\/|\/embed\/)([a-zA-Z0-9_-]+)/i);
  if (routeMatch?.[1]) {
    return routeMatch[1].replace(/\.html?$/i, '');
  }

  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (queryMatch?.[1]) {
    return queryMatch[1];
  }

  const htmlMatch = trimmed.match(/\/([a-zA-Z0-9_-]{4,})\.html?(?:[?#]|$)/i);
  if (htmlMatch?.[1]) {
    return htmlMatch[1];
  }

  try {
    const fullUrl = trimmed.startsWith('//')
      ? `https:${trimmed}`
      : /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
    const parsed = new URL(fullUrl);
    const segments = parsed.pathname.split('/').filter((s) => s.trim().length > 0);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1].replace(/\.html?$/i, '');
      if (/^[a-zA-Z0-9_-]{4,}$/.test(lastSegment)) {
        return lastSegment;
      }
    }
  } catch {
    const lastSlashMatch = trimmed.match(/\/([a-zA-Z0-9_-]{4,})(?:\.html?)?(?:\?|#|$)/i);
    if (lastSlashMatch?.[1]) {
      return lastSlashMatch[1].replace(/\.html?$/i, '');
    }
  }

  return null;
}

/**
 * Normaliza cualquier enlace o servidor de Vidara al formato canónico:
 * https://vidara.so/v/VIDEO_ID
 */
export function formatVidaraUrl(url: string | null | undefined, serverName?: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  if (!isVidaraUrlOrServer(trimmed, serverName)) {
    return trimmed;
  }

  const videoId = extractVidaraVideoId(trimmed);
  return videoId ? getVidaraUrl(videoId, 'watch') : trimmed;
}
