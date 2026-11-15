import {
  formatDoodstreamUrl,
  isEarnvidsUrlOrServer,
  isStreamwishUrlOrServer,
} from './doodstreamUtils';
import { extractEarnvidsVideoId } from './earnvidsUtils';
import { getProxyUrl } from './proxy';
import { isEmbed69BotChallenge } from './embed69Utils';

export type PelisplusLaLanguageKey = 'lat' | 'cast' | 'sub';

export interface PelisplusLaOption {
  languageLabel: string;
  languageKey: PelisplusLaLanguageKey | null;
  serverName: string;
  rawUrl: string;
  formattedUrl: string;
}

export interface PelisplusLaParsedPage {
  title: string;
  options: PelisplusLaOption[];
  detectedLanguages: string[];
  detectedServers: string[];
}

export interface PelisplusLaServerGroup {
  server: string;
  title: string;
  lat: string[];
  cast: string[];
  sub: string[];
  other: { label: string; url: string }[];
}

export interface PelisplusLaEpisodeLink {
  season: number;
  episode: number;
  url: string;
  label?: string;
}

export interface PelisplusLaParsedSeries {
  title: string;
  seasons: number[];
  episodes: PelisplusLaEpisodeLink[];
}

export const PELISPLUS_LA_PRESET_SERVERS = [
  { value: 'all', label: 'Todos los servidores' },
  { value: 'voe', label: 'VOE (voesx)' },
  { value: 'streamwish', label: 'StreamWish' },
  { value: 'vidhide', label: 'Vidhide (smoothpre)' },
  { value: 'vidara', label: 'Vidara' },
  { value: 'filelions', label: 'Filelions' },
  { value: 'streamtape', label: 'Streamtape' },
  { value: 'uqload', label: 'Uqload (uqload.vc)' },
  { value: 'doodstream', label: 'Doodstream (playmogo)' },
] as const;

const PRESET_SERVER_VALUES = new Set<string>(
  PELISPLUS_LA_PRESET_SERVERS.map((srv) => srv.value.toLowerCase())
);

/**
 * Normalizes known server tab aliases (e.g. "voesx" -> "voe", "dofast" -> "doodstream") to match preset filters.
 */
export function normalizePelisplusLaServerFilter(serverName: string): string {
  const trimmed = serverName.trim();
  const low = trimmed.toLowerCase();
  if (low === 'voesx') return 'voe';
  if (low === 'dofast' || low === 'dood' || low === 'playmogo') return 'doodstream';
  return trimmed;
}

/**
 * Returns detected server names that are not already covered by preset server options.
 */
export function getExtraDetectedPelisplusLaServers(detectedServers: string[]): string[] {
  return detectedServers.filter(
    (srv) => !PRESET_SERVER_VALUES.has(normalizePelisplusLaServerFilter(srv).toLowerCase())
  );
}

/**
 * Checks whether a quick-filter pill for `serverName` corresponds to the active `targetServer`.
 */
export function isPelisplusLaServerFilterActive(targetServer: string, serverName: string): boolean {
  const current = targetServer.trim().toLowerCase();
  const normalized = normalizePelisplusLaServerFilter(serverName).toLowerCase();
  return current === serverName.trim().toLowerCase() || current === normalized;
}

export const PELISPLUS_LA_LANGUAGE_ROW_STYLES = [
  {
    key: 'lat' as const,
    badge: 'LAT',
    copyTitle: 'Copiar enlace Latino',
    copyToast: 'URL Latino copiada',
    rowHoverClass: 'hover:border-blue-300',
    badgeClass: 'text-blue-800 bg-blue-100',
    btnHoverClass: 'hover:text-blue-600 hover:bg-blue-50',
  },
  {
    key: 'cast' as const,
    badge: 'CAST',
    copyTitle: 'Copiar enlace Castellano',
    copyToast: 'URL Castellano copiada',
    rowHoverClass: 'hover:border-red-300',
    badgeClass: 'text-red-800 bg-red-100',
    btnHoverClass: 'hover:text-red-600 hover:bg-red-50',
  },
  {
    key: 'sub' as const,
    badge: 'SUB',
    copyTitle: 'Copiar enlace Subtitulado',
    copyToast: 'URL Subtitulado copiada',
    rowHoverClass: 'hover:border-green-300',
    badgeClass: 'text-green-800 bg-green-100',
    btnHoverClass: 'hover:text-green-600 hover:bg-green-50',
  },
];

export const PELISPLUS_LA_COPY_ALL_BUTTONS = [
  {
    type: 'lat' as const,
    label: 'Copiar LAT',
    copiedLabel: '¡LAT Copiados!',
    title: 'Copiar todos los enlaces Latinos',
    idleClass: 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-800',
  },
  {
    type: 'cast' as const,
    label: 'Copiar CAST',
    copiedLabel: '¡CAST Copiados!',
    title: 'Copiar todos los enlaces Castellanos',
    idleClass: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-800',
  },
  {
    type: 'sub' as const,
    label: 'Copiar SUB',
    copiedLabel: '¡SUB Copiados!',
    title: 'Copiar todos los enlaces Subtitulados',
    idleClass: 'bg-green-50 hover:bg-green-100 border-green-200 text-green-800',
  },
];

function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
}

function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHtmlAttributes(attrText: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!attrText) return attrs;

  const attrRegex = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrText)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = decodeHtmlEntities(val).trim();
  }
  return attrs;
}

function hasClass(classAttr: string | undefined, className: string): boolean {
  if (!classAttr) return false;
  return classAttr.split(/\s+/).some((cls) => cls.toLowerCase() === className.toLowerCase());
}

/**
 * Normalizes a PelisplusHD.la language label (e.g. "Español Latino", "Español", "Subtitulado")
 * into standard dashboard language keys ('lat' | 'cast' | 'sub').
 */
export function normalizePelisplusLaLanguage(label?: string | null): PelisplusLaLanguageKey | null {
  if (!label) return null;
  const normalized = label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!normalized) return null;

  // Check "latino" / "lat" before "espanol" so "Español Latino" maps to 'lat', not 'cast'
  if (normalized.includes('latino') || /\blat\b/.test(normalized)) {
    return 'lat';
  }

  if (
    normalized.includes('castellano') ||
    /\bcast\b/.test(normalized) ||
    normalized.includes('espana') ||
    normalized.includes('espanol') ||
    /\besp\b/.test(normalized)
  ) {
    return 'cast';
  }

  if (
    normalized.includes('subtitulad') ||
    /\bsub\b/.test(normalized) ||
    normalized.includes('vose') ||
    normalized.includes('ingles') ||
    normalized.includes('english')
  ) {
    return 'sub';
  }

  return null;
}

function resolveEmbedUrl(rawUrl: string, baseUrl?: string): string {
  const cleaned = rawUrl.replace(/`/g, '').trim();
  if (!cleaned || cleaned.startsWith('#') || /^javascript:/i.test(cleaned)) {
    return '';
  }

  if (cleaned.startsWith('//')) {
    return `https:${cleaned}`;
  }

  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }

  if (baseUrl) {
    try {
      return new URL(cleaned, baseUrl).href;
    } catch {
      // Fallback below
    }
  }

  if (cleaned.startsWith('/')) {
    return `https://pelisplushd.la${cleaned}`;
  }

  return cleaned;
}

function getUrlHostname(targetUrl: string): string {
  try {
    const normalized = targetUrl.startsWith('//')
      ? `https:${targetUrl}`
      : /^https?:\/\//i.test(targetUrl)
        ? targetUrl
        : `https://${targetUrl}`;
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function replaceUrlHost(targetUrl: string, newHost: string): string {
  try {
    const normalized = targetUrl.startsWith('//')
      ? `https:${targetUrl}`
      : /^https?:\/\//i.test(targetUrl)
        ? targetUrl
        : `https://${targetUrl}`;
    const parsed = new URL(normalized);
    parsed.protocol = 'https:';
    parsed.host = newHost;
    return parsed.toString();
  } catch {
    return targetUrl.replace(/^(?:https?:)?\/\/[^/]+/i, `https://${newHost}`);
  }
}

/**
 * Formats an extracted PelisplusHD.la option URL:
 * - Uqload links are rewritten to https://uqload.vc
 * - Doodstream links are normalized to https://playmogo.com/e/VIDEO_ID
 * - Vidhide links are normalized to https://smoothpre.com/v/VIDEO_ID
 * - Other servers keep standard formatDoodstreamUrl normalization
 */
export function formatPelisplusLaOptionUrl(rawUrl: string, serverName?: string): string {
  const formatted = formatDoodstreamUrl(rawUrl, serverName);
  if (!formatted) return '';

  const hostname = getUrlHostname(rawUrl) || getUrlHostname(formatted);
  const isUqload =
    Boolean(serverName && /uqload/i.test(serverName)) ||
    /(?:^|\.)uqload\.[a-z0-9-]+$/i.test(hostname);
  if (isUqload) {
    return replaceUrlHost(formatted, 'uqload.vc');
  }

  const isVidhide =
    Boolean(serverName && /vidhide/i.test(serverName)) ||
    /(?:^|\.)vidhide[a-z0-9-]*\.[a-z0-9-]+$/i.test(hostname);
  if (isVidhide) {
    const videoId = extractEarnvidsVideoId(rawUrl);
    return videoId ? `https://smoothpre.com/v/${videoId}` : replaceUrlHost(formatted, 'smoothpre.com');
  }

  const isDoodstream =
    !isStreamwishUrlOrServer(rawUrl, serverName) &&
    !isEarnvidsUrlOrServer(rawUrl, serverName) &&
    (Boolean(serverName && /(?:dood|dofast)/i.test(serverName)) ||
      /(?:^|\.)(?:dood(?:stream|s|cdn)?|d0o0d|doood(?:ster)?|ds2play|doply|playmogo|myvidstream)\.[a-z0-9-]+$/i.test(
        hostname
      ));
  if (isDoodstream) {
    // Normalize path to /e/VIDEO_ID first, then swap dood.to/legacy hosts to playmogo.com
    const doodNormalized = formatDoodstreamUrl(rawUrl, 'doodstream');
    return replaceUrlHost(doodNormalized, 'playmogo.com');
  }

  return formatted;
}

function inferServerName(rawLabel: string, embedUrl: string): string {
  const label = stripHtmlTags(rawLabel);
  if (label && !/^option\s*\d+$/i.test(label) && !/^opci[oó]n\s*\d+$/i.test(label)) {
    return label.toLowerCase();
  }

  try {
    const hostname = new URL(embedUrl).hostname.toLowerCase().replace(/^www\./, '');
    if (/(?:streamwish|embedwish|wishembed|awish|mwish|swishsrv|filelions)/.test(hostname)) {
      return 'streamwish';
    }
    if (/vidhide/.test(hostname)) return 'vidhide';
    if (/vidara/.test(hostname)) return 'vidara';
    if (/uqload/.test(hostname)) return 'uqload';
    if (/(?:dood|ds2play|playmogo|d0o0d|doood|myvidstream)/.test(hostname)) return 'doodstream';
    if (/(?:earnvids|earnvid|smoothpre)/.test(hostname)) return 'earnvids';
    if (/mixdrop/.test(hostname)) return 'mixdrop';
    if (/voe/.test(hostname)) return 'voe';
    return hostname;
  } catch {
    return label || 'servidor';
  }
}

export function extractPelisplusLaTitle(html: string): string {
  if (!html) return '';

  const h1Regex = /<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi;
  let fallbackH1 = '';
  let match: RegExpExecArray | null;

  while ((match = h1Regex.exec(html)) !== null) {
    const attrs = parseHtmlAttributes(match[1]);
    const text = stripHtmlTags(match[2]);
    if (!text) continue;

    if (hasClass(attrs.class, 'm-b-5')) {
      return text;
    }

    if (!/^pelisplus(?:hd)?$/i.test(text) && !fallbackH1) {
      fallbackH1 = text;
    }
  }

  if (fallbackH1) return fallbackH1;

  const metaRegex = /<meta\b([^>]*)>/gi;
  while ((match = metaRegex.exec(html)) !== null) {
    const attrs = parseHtmlAttributes(match[1]);
    if (attrs.property?.toLowerCase() === 'og:title' && attrs.content) {
      return attrs.content.trim();
    }
  }

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    return stripHtmlTags(titleMatch[1])
      .replace(/^Ver\s+/i, '')
      .replace(/\s+Online.*$/i, '')
      .trim();
  }

  return '';
}

/**
 * Checks if an extracted option matches the selected server filter.
 */
export function matchesPelisplusLaServer(option: PelisplusLaOption, targetServer: string): boolean {
  if (!targetServer || targetServer === 'all') return true;
  const target = targetServer.trim().toLowerCase();
  const srv = option.serverName.toLowerCase();
  const raw = option.rawUrl.toLowerCase();
  const formatted = option.formattedUrl.toLowerCase();

  if (target === 'streamwish') {
    return (
      srv.includes('streamwish') ||
      srv.includes('wish') ||
      /(?:streamwish|embedwish|wishembed|awish|mwish|swishsrv|filelions)/.test(raw) ||
      /(?:streamwish|embedwish|wishembed|awish|mwish|swishsrv|filelions)/.test(formatted)
    );
  }

  if (target === 'vidhide') {
    return srv.includes('vidhide') || raw.includes('vidhide') || formatted.includes('vidhide');
  }

  if (target === 'vidara') {
    return srv.includes('vidara') || raw.includes('vidara') || formatted.includes('vidara');
  }

  if (target === 'voe' || target === 'voesx') {
    return srv.includes('voe') || raw.includes('voe') || formatted.includes('voe');
  }

  if (target === 'filelions') {
    return srv.includes('filelions') || raw.includes('filelions') || formatted.includes('filelions');
  }

  if (target === 'streamtape') {
    return srv.includes('streamtape') || raw.includes('streamtape') || formatted.includes('streamtape');
  }

  if (target === 'netu' || target === 'waaw') {
    return srv.includes('netu') || srv.includes('waaw') || raw.includes('waaw') || raw.includes('netu');
  }

  if (target === 'earnvids' || target === 'smoothpre') {
    return (
      srv.includes('earnvids') ||
      srv.includes('smoothpre') ||
      /(?:earnvids|earnvid|smoothpre)/.test(raw) ||
      /(?:earnvids|earnvid|smoothpre)/.test(formatted)
    );
  }

  if (target === 'uqload') {
    return srv.includes('uqload') || raw.includes('uqload') || formatted.includes('uqload');
  }

  if (target === 'dofast' || target === 'doodstream' || target === 'dood' || target === 'playmogo') {
    return (
      srv.includes('dofast') ||
      srv.includes('dood') ||
      srv.includes('playmogo') ||
      /(?:dood|ds2play|d0o0d|doood|playmogo|myvidstream)/.test(raw) ||
      /(?:dood|ds2play|d0o0d|doood|playmogo|myvidstream)/.test(formatted)
    );
  }

  return srv.includes(target) || raw.includes(target) || formatted.includes(target);
}

/**
 * Extracts languages and embed URLs from PelisplusHD.la `<div class="player">` HTML.
 */
export function parsePelisplusLaHtml(html: string, pageUrl?: string): PelisplusLaParsedPage {
  const title = extractPelisplusLaTitle(html);
  const options: PelisplusLaOption[] = [];
  const seen = new Set<string>();

  if (!html) {
    return { title, options, detectedLanguages: [], detectedServers: [] };
  }

  // Collect language tabs (<a class="divseason" title="...">) for fallback when data-name is absent
  let firstSeasonLabel = '';
  let activeSeasonLabel = '';
  const seasonRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = seasonRegex.exec(html)) !== null) {
    const attrs = parseHtmlAttributes(match[1]);
    if (!hasClass(attrs.class, 'divseason')) continue;

    const label = (attrs.title || stripHtmlTags(match[2])).trim();
    if (!label) continue;

    if (!firstSeasonLabel) firstSeasonLabel = label;
    if (hasClass(attrs.class, 'active') && !activeSeasonLabel) {
      activeSeasonLabel = label;
    }
  }

  // Collect episode link map from <div id="link_url"><span lid="1" url="..."></span>...</div>
  const linkUrlMap = new Map<string, string>();
  const linkUrlBlock =
    html.match(/<div\b[^>]*id=["']link_url["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || html;
  const spanRegex = /<span\b([^>]*)>/gi;
  let spanMatch: RegExpExecArray | null;
  while ((spanMatch = spanRegex.exec(linkUrlBlock)) !== null) {
    const spanAttrs = parseHtmlAttributes(spanMatch[1]);
    const lid = (spanAttrs.lid || '').trim();
    const rawSpanUrl = resolveEmbedUrl(spanAttrs.url || spanAttrs['data-url'] || '', pageUrl);
    if (lid && rawSpanUrl && !linkUrlMap.has(lid)) {
      linkUrlMap.set(lid, rawSpanUrl);
    }
  }

  const addParsedOption = (languageLabel: string, anchorText: string, rawUrl: string) => {
    const cleanLang = languageLabel.trim();
    const languageKey = normalizePelisplusLaLanguage(cleanLang);
    const serverName = inferServerName(anchorText, rawUrl);
    const formattedUrl = formatPelisplusLaOptionUrl(rawUrl, serverName);
    if (!formattedUrl) return;

    const dedupeKey = `${languageKey ?? cleanLang.toLowerCase()}|${serverName}|${formattedUrl}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    options.push({
      languageLabel: cleanLang,
      languageKey,
      serverName,
      rawUrl,
      formattedUrl,
    });
  };

  // Extract options from:
  // 1) Movie format: <li class="playurl" data-url="..." data-name="..."><a>server</a></li>
  // 2) Episode format: <li data-id="1"><a>server</a></li> + <span lid="1" url="...">
  const liRegex = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
  while ((match = liRegex.exec(html)) !== null) {
    const liAttrs = parseHtmlAttributes(match[1]);
    const dataId = (liAttrs['data-id'] || '').trim();
    const isPlayUrlItem = hasClass(liAttrs.class, 'playurl') || Boolean(liAttrs['data-url']);
    const mappedUrl = dataId ? linkUrlMap.get(dataId) || '' : '';

    if (!isPlayUrlItem && !mappedUrl) continue;

    const innerHtml = match[2];
    const anchorMatch = innerHtml.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    const anchorAttrs = anchorMatch ? parseHtmlAttributes(anchorMatch[1]) : {};
    const anchorText = anchorMatch ? anchorMatch[2] : innerHtml;

    const rawCandidate =
      liAttrs['data-url'] ||
      liAttrs['data-src'] ||
      anchorAttrs['data-url'] ||
      mappedUrl ||
      (anchorAttrs.href && !anchorAttrs.href.startsWith('#') ? anchorAttrs.href : '');

    const rawUrl = resolveEmbedUrl(rawCandidate, pageUrl);
    if (!rawUrl) continue;

    const languageLabel =
      liAttrs['data-name'] || anchorAttrs['data-name'] || activeSeasonLabel || firstSeasonLabel;
    addParsedOption(languageLabel, anchorText, rawUrl);
  }

  // Fallback 1: if <span lid url> items exist without matching <li> tabs
  if (options.length === 0 && linkUrlMap.size > 0) {
    for (const rawUrl of linkUrlMap.values()) {
      addParsedOption(activeSeasonLabel || firstSeasonLabel || '', '', rawUrl);
    }
  }

  // Fallback 2: if still empty, inspect #video-content / .video-html iframe
  if (options.length === 0) {
    const playerIframeBlock =
      html.match(/<div\b[^>]*(?:id=["']video-content["']|class=["'][^"']*\bvideo-html\b[^"']*["'])[^>]*>([\s\S]*?)<\/div>/i)?.[1] ||
      '';
    const iframeMatch = playerIframeBlock.match(/<iframe\b([^>]*)>/i);
    if (iframeMatch) {
      const iframeAttrs = parseHtmlAttributes(iframeMatch[1]);
      const rawUrl = resolveEmbedUrl(iframeAttrs.src || '', pageUrl);
      if (rawUrl) {
        addParsedOption(activeSeasonLabel || firstSeasonLabel || '', '', rawUrl);
      }
    }
  }

  const detectedLanguages = Array.from(
    new Set(options.map((opt) => opt.languageLabel).filter(Boolean))
  );
  const detectedServers = Array.from(
    new Set(options.map((opt) => opt.serverName).filter(Boolean))
  );

  return {
    title,
    options,
    detectedLanguages,
    detectedServers,
  };
}

/**
 * Groups parsed options by server for display and one-click language copying.
 */
export function groupOptionsByServer(
  options: PelisplusLaOption[],
  title: string,
  targetServer = 'all'
): PelisplusLaServerGroup[] {
  const byServer = new Map<string, PelisplusLaServerGroup>();

  for (const opt of options) {
    if (!matchesPelisplusLaServer(opt, targetServer)) continue;

    const serverKey = opt.serverName || 'servidor';
    const existing = byServer.get(serverKey) || {
      server: serverKey,
      title,
      lat: [],
      cast: [],
      sub: [],
      other: [],
    };

    if (opt.languageKey === 'lat') {
      if (!existing.lat.includes(opt.formattedUrl)) existing.lat.push(opt.formattedUrl);
    } else if (opt.languageKey === 'cast') {
      if (!existing.cast.includes(opt.formattedUrl)) existing.cast.push(opt.formattedUrl);
    } else if (opt.languageKey === 'sub') {
      if (!existing.sub.includes(opt.formattedUrl)) existing.sub.push(opt.formattedUrl);
    } else {
      const label = opt.languageLabel || 'OTRO';
      if (!existing.other.some((o) => o.url === opt.formattedUrl && o.label === label)) {
        existing.other.push({ label, url: opt.formattedUrl });
      }
    }

    byServer.set(serverKey, existing);
  }

  return Array.from(byServer.values()).filter(
    (g) => g.lat.length > 0 || g.cast.length > 0 || g.sub.length > 0 || g.other.length > 0
  );
}

/**
 * Detects if a URL points directly to a specific PelisplusHD.la episode.
 */
export function detectPelisplusLaDirectEpisode(targetUrl: string): PelisplusLaEpisodeLink | null {
  const clean = targetUrl.split('#')[0].trim();
  if (!clean) return null;

  const match =
    clean.match(/\/temporada\/(\d+)\/(?:capitulo|episodio)\/(\d+)(?:\/|$|\?)/i) ||
    clean.match(/-temporada-(\d+)-(?:capitulo|episodio)-(\d+)(?:\/|$|\?)/i) ||
    clean.match(/\/(?:capitulo|episodio)\/(\d+)\/(\d+)(?:\/|$|\?)/i) ||
    clean.match(/-(\d+)x(\d+)(?:\/|$|\?)/i);

  if (!match) return null;
  const season = parseInt(match[1], 10);
  const episode = parseInt(match[2], 10);
  if (!Number.isFinite(season) || !Number.isFinite(episode) || season <= 0 || episode <= 0) {
    return null;
  }

  return { season, episode, url: clean };
}

/**
 * Extracts series title, seasons, and episode links from a PelisplusHD.la series/anime page.
 */
export function parsePelisplusLaSeriesPage(
  html: string,
  seriesUrl?: string
): PelisplusLaParsedSeries {
  const title = extractPelisplusLaTitle(html);
  const episodes: PelisplusLaEpisodeLink[] = [];
  const seen = new Set<string>();

  if (!html) {
    return { title, seasons: [], episodes: [] };
  }

  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const attrs = parseHtmlAttributes(match[1]);
    const href = (attrs.href || '').trim();
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) continue;

    const fullUrl = resolveEmbedUrl(href, seriesUrl);
    if (!fullUrl) continue;

    const label = stripHtmlTags(match[2]);
    let season = 0;
    let episode = 0;

    const urlMatch =
      fullUrl.match(/\/temporada\/(\d+)\/(?:capitulo|episodio)\/(\d+)(?:\/|$|\?)/i) ||
      fullUrl.match(/-temporada-(\d+)-(?:capitulo|episodio)-(\d+)(?:\/|$|\?)/i) ||
      fullUrl.match(/\/(?:capitulo|episodio)\/(\d+)\/(\d+)(?:\/|$|\?)/i) ||
      fullUrl.match(/-(\d+)x(\d+)(?:\/|$|\?)/i);

    if (urlMatch) {
      season = parseInt(urlMatch[1], 10);
      episode = parseInt(urlMatch[2], 10);
    } else if (/\/(?:serie|anime|dorama|capitulo|episodio)\//i.test(fullUrl)) {
      const textMatch = label.match(/(\d+)\s*x\s*(\d+)/i);
      if (textMatch) {
        season = parseInt(textMatch[1], 10);
        episode = parseInt(textMatch[2], 10);
      }
    }

    if (season > 0 && episode > 0) {
      const key = `${season}x${episode}`;
      if (seen.has(key)) continue;
      seen.add(key);

      episodes.push({
        season,
        episode,
        url: fullUrl,
        label: label || undefined,
      });
    }
  }

  episodes.sort((a, b) => (a.season === b.season ? a.episode - b.episode : a.season - b.season));
  const seasons = Array.from(new Set(episodes.map((ep) => ep.season))).sort((a, b) => a - b);

  return {
    title,
    seasons,
    episodes,
  };
}

/**
 * Fetches a PelisplusHD.la page through the configured proxy and checks for bot/Cloudflare challenges.
 */
export async function fetchPelisplusLaHtml(
  targetUrl: string,
  refererUrl?: string,
  signal?: AbortSignal
): Promise<string> {
  const proxy = getProxyUrl(targetUrl, { referer: refererUrl || targetUrl });
  const res = await fetch(proxy, { signal });
  const text = await res.text();

  if (!res.ok) {
    let errDetail = `Error ${res.status} al conectar con proxy`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed?.error) errDetail = `${errDetail}: ${parsed.error}`;
    } catch {
      // Keep status message
    }
    throw new Error(errDetail);
  }

  if (isEmbed69BotChallenge(text)) {
    throw new Error('Se detectó una página anti-bot (Anubis) en la respuesta.');
  }

  if (text.includes('Just a moment') && text.includes('cloudflare')) {
    throw new Error('Posible bloqueo de Cloudflare detectado en la respuesta.');
  }

  return text;
}
