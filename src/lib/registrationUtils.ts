import {
  formatDoodstreamUrl,
  isVidaraUrlOrServer,
  isYoutubeUrlOrServer,
} from './doodstreamUtils';

export const FILEMOON_BYSEKOZE_OPTION = 'FileMoon / Bysekoze';

export type DooplexSourceType = 'embed' | 'youtubelink' | 'hls' | 'supported_hosts';

export interface DooplexSourceFlags {
  embed: '1' | '0';
  youtubelink: '1' | '0';
  hls: '1' | '0';
  supported_hosts: '1' | '0';
}

/**
 * Normaliza nombres de servidor/header/calidad heredados o con alias
 * (ej. "Byse", "Byse.sx", "filemoon" -> "FileMoon / Bysekoze", "virda" -> "Vidara").
 */
export function normalizeServerLabel(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const low = trimmed.toLowerCase();
  if (/filemoon|byse/i.test(low)) {
    return FILEMOON_BYSEKOZE_OPTION;
  }
  if (/^(?:vidara|virda)$/i.test(low)) {
    return 'Vidara';
  }
  if (/^(?:youtube|youtu\.be|youtubelink)$/i.test(low)) {
    return 'YouTube';
  }
  if (/^(?:primeload|primeoad)$/i.test(low)) {
    return 'Primeload';
  }
  return trimmed;
}

/**
 * Deduce el Source inicial al cambiar el dropdown de Calidad / Header en los formularios.
 */
export function inferSourceFromSelection(serverOrHeader?: string | null): DooplexSourceType {
  if (!serverOrHeader) return 'embed';
  const trimmed = serverOrHeader.trim();
  if (isYoutubeUrlOrServer('', trimmed)) return 'youtubelink';
  if (isVidaraUrlOrServer('', trimmed)) return 'supported_hosts';
  if (/^hls$/i.test(trimmed)) return 'hls';
  return 'embed';
}

/**
 * Resuelve la columna Source final (`embed` | `youtubelink` | `hls` | `supported_hosts`)
 * garantizando que YouTube marque `youtubelink` y Vidara marque `supported_hosts`.
 */
export function resolveDooplexSource(
  url: string,
  headerOrServer?: string | null,
  selectedSource: DooplexSourceType = 'embed'
): DooplexSourceType {
  const hint = headerOrServer?.trim() || undefined;
  if (isYoutubeUrlOrServer(url) || (hint && isYoutubeUrlOrServer('', hint))) {
    return 'youtubelink';
  }
  if (isVidaraUrlOrServer(url) || (hint && isVidaraUrlOrServer('', hint))) {
    return 'supported_hosts';
  }
  if (/\.m3u8(?:$|\?|#)/i.test(url) || (hint && /^hls$/i.test(hint))) {
    return 'hls';
  }
  return selectedSource;
}

export function buildDooplexSourceFlags(source: DooplexSourceType): DooplexSourceFlags {
  return {
    embed: source === 'embed' ? '1' : '0',
    youtubelink: source === 'youtubelink' ? '1' : '0',
    hls: source === 'hls' ? '1' : '0',
    supported_hosts: source === 'supported_hosts' ? '1' : '0',
  };
}

export function isDuplicateRegisterResponse(
  response?: {
    duplicate?: boolean;
    skipped?: boolean;
    success?: boolean;
    message?: string;
    data?: unknown;
  } | null
): boolean {
  return Boolean(response?.duplicate || response?.skipped);
}

export function getDooplexSourceBadgeLabel(source: DooplexSourceType): string {
  if (source === 'supported_hosts') return 'SUPPORTED HOST';
  if (source === 'youtubelink') return 'YOUTUBE';
  if (source === 'hls') return 'HLS';
  return 'EMBED';
}

export function prepareRegistrationLink(params: {
  url: string;
  server?: string | null;
  header?: string | null;
  source?: DooplexSourceType;
}): {
  link: string;
  server: string;
  header: string;
  source: DooplexSourceType;
  sourceFlags: DooplexSourceFlags;
} {
  const normalizedServer = normalizeServerLabel(params.server);
  const normalizedHeader = normalizeServerLabel(params.header);
  const hint = normalizedHeader || normalizedServer || undefined;

  const formattedUrl = formatDoodstreamUrl(params.url, hint);
  const resolvedSource = resolveDooplexSource(
    formattedUrl,
    hint,
    params.source || 'embed'
  );

  return {
    link: formattedUrl,
    server: normalizedServer,
    header: normalizedHeader,
    source: resolvedSource,
    sourceFlags: buildDooplexSourceFlags(resolvedSource),
  };
}

// --- V2 Bulk Episode Parser helpers (RegistroDooplexV2 & RegistroAnimeV2) ---

export type V2ServerFormatMode = 'quality_and_header' | 'header_only' | 'quality_only';

export const STORAGE_KEY_V2_SERVER_FORMAT = 'dooplex_v2_server_format';

export const V2_SERVER_FORMAT_OPTIONS: { value: V2ServerFormatMode; label: string }[] = [
  { value: 'quality_and_header', label: 'Calidad + Servidor (ej. 1080p HD Vidara)' },
  { value: 'header_only', label: 'Igual que Header / Servidor (ej. Vidara)' },
  { value: 'quality_only', label: 'Solo Calidad del texto (ej. 1080p HD)' },
];

export function loadV2ServerFormat(): V2ServerFormatMode {
  try {
    const saved = typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY_V2_SERVER_FORMAT)
      : null;
    if (saved === 'quality_and_header' || saved === 'header_only' || saved === 'quality_only') {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'quality_and_header';
}

export function saveV2ServerFormat(mode: V2ServerFormatMode): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_V2_SERVER_FORMAT, mode);
    }
  } catch {
    // ignore storage errors
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Construye el valor final de la columna `server` en V2 según el modo elegido:
 * - `quality_and_header`: "1080p HD Vidara"
 * - `header_only`: "Vidara" (lo mismo que `header`)
 * - `quality_only`: "1080p HD"
 */
export function formatV2ServerValue(
  quality: string,
  header: string,
  mode: V2ServerFormatMode = 'quality_and_header'
): string {
  const cleanQuality = quality.trim();
  const cleanHeader = header.trim();

  if (mode === 'header_only') {
    return cleanHeader || cleanQuality;
  }
  if (mode === 'quality_only') {
    return cleanQuality || cleanHeader;
  }

  if (!cleanQuality) return cleanHeader;
  if (!cleanHeader) return cleanQuality;

  // Evita duplicar el servidor si [Calidad] ya lo incluye al final o completo (ej. [Vidara] + Vidara)
  const endsWithHeader = new RegExp(`(?:^|\\s)${escapeRegExp(cleanHeader)}$`, 'i').test(cleanQuality);
  return endsWithHeader ? cleanQuality : `${cleanQuality} ${cleanHeader}`;
}

export interface ParsedV2LinkItem {
  episodeNumber: number | null;
  server: string;
  lang: 'CAST' | 'LAT' | 'SUB';
  rawLang: string;
  header: string;
  link: string;
  source: DooplexSourceType;
}

export interface ParsedV2EpisodeGroup {
  episodeNumber: number | null;
  title: string;
  items: ParsedV2LinkItem[];
}

export interface ParseV2Result {
  groups: ParsedV2EpisodeGroup[];
  detectedServers: string[];
  detectedLangs: ('CAST' | 'LAT' | 'SUB')[];
  discardedCount: number;
}

export function mapV2Language(rawLang: string): 'CAST' | 'LAT' | 'SUB' {
  const normalized = rawLang.trim().toLowerCase();
  if (
    normalized.includes('españa') ||
    normalized.includes('espana') ||
    normalized.includes('castellano') ||
    normalized === 'cast'
  ) {
    return 'CAST';
  }
  if (normalized.includes('subtitulado') || normalized.includes('sub') || normalized.includes('vose')) {
    return 'SUB';
  }
  if (normalized.includes('latino') || normalized === 'lat') {
    return 'LAT';
  }
  return 'LAT';
}

export function isV2ServerExcluded(
  header: string,
  link: string,
  excludedServers: string[],
  rawHeader?: string,
  rawLink?: string
): boolean {
  const candidates = [header, link, rawHeader, rawLink]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => v.trim().toLowerCase());

  return excludedServers.some((ex) => {
    const keyword = ex.trim().toLowerCase();
    if (!keyword) return false;
    return candidates.some((c) => c === keyword || c.includes(keyword));
  });
}

export function isV2LanguageExcluded(
  lang: 'CAST' | 'LAT' | 'SUB',
  rawLang: string,
  excludedLangs: string[]
): boolean {
  const normLang = lang.trim().toLowerCase();
  const normRaw = rawLang.trim().toLowerCase();
  return excludedLangs.some((ex) => {
    const keyword = ex.trim().toLowerCase();
    if (!keyword) return false;
    if (keyword === normLang || keyword === normRaw || normRaw.includes(keyword)) {
      return true;
    }
    if (
      (keyword === 'castellano' || keyword === 'español españa' || keyword === 'espana' || keyword === 'españa') &&
      lang === 'CAST'
    ) {
      return true;
    }
    if ((keyword === 'latino' || keyword === 'español latino') && lang === 'LAT') {
      return true;
    }
    if ((keyword === 'subtitulado' || keyword === 'vose') && lang === 'SUB') {
      return true;
    }
    return false;
  });
}

export function parseBulkEpisodesV2Text(
  rawText: string,
  skipDuplicates: boolean,
  excludedServers: string[],
  excludedLangs: string[],
  serverFormatMode: V2ServerFormatMode = 'quality_and_header'
): ParseV2Result {
  const lines = rawText.split(/\r?\n/);
  const groups: ParsedV2EpisodeGroup[] = [];
  const detectedServersSet = new Set<string>();
  const detectedLangsSet = new Set<'CAST' | 'LAT' | 'SUB'>();
  let currentGroup: ParsedV2EpisodeGroup | null = null;
  let discardedCount = 0;

  const episodeHeaderRegex = /^\s*EPISODIO\s+(\d+)(.*)$/i;
  const linkLineRegex =
    /^\s*(?:[•*-]\s*)?\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.+?)\s*->\s*((?:https?:)?\/\/\S+)/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const epMatch = line.match(episodeHeaderRegex);
    if (epMatch) {
      const epNum = Number(epMatch[1]);
      currentGroup = {
        episodeNumber: epNum,
        title: line,
        items: [],
      };
      groups.push(currentGroup);
      continue;
    }

    const linkMatch = line.match(linkLineRegex);
    if (linkMatch) {
      const server = normalizeServerLabel(linkMatch[1].trim());
      const rawLang = linkMatch[2].trim();
      const rawHeader = linkMatch[3].trim();
      const header = normalizeServerLabel(rawHeader);
      const rawLink = linkMatch[4].trim().startsWith('//')
        ? `https:${linkMatch[4].trim()}`
        : linkMatch[4].trim();

      const lang = mapV2Language(rawLang);
      const prepared = prepareRegistrationLink({
        url: rawLink,
        server,
        header,
        source: 'embed',
      });

      detectedServersSet.add(prepared.header);
      detectedLangsSet.add(lang);

      if (
        isV2ServerExcluded(prepared.header, prepared.link, excludedServers, rawHeader, rawLink) ||
        isV2LanguageExcluded(lang, rawLang, excludedLangs)
      ) {
        discardedCount++;
        continue;
      }

      if (!currentGroup) {
        currentGroup = {
          episodeNumber: null,
          title: 'Episodio Inicial Seleccionado',
          items: [],
        };
        groups.push(currentGroup);
      }

      if (skipDuplicates) {
        const exists = currentGroup.items.some(
          (item) =>
            item.link === prepared.link &&
            item.lang === lang &&
            item.header.toLowerCase() === prepared.header.toLowerCase()
        );
        if (exists) continue;
      }

      currentGroup.items.push({
        episodeNumber: currentGroup.episodeNumber,
        server: formatV2ServerValue(prepared.server, prepared.header, serverFormatMode),
        lang,
        rawLang,
        header: prepared.header,
        link: prepared.link,
        source: prepared.source,
      });
    }
  }

  return {
    groups: groups.filter((g) => g.items.length > 0),
    detectedServers: Array.from(detectedServersSet),
    detectedLangs: Array.from(detectedLangsSet),
    discardedCount,
  };
}
