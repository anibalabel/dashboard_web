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
