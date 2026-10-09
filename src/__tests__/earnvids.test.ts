import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeEarnvidsBase,
  extractEarnvidsVideoId,
  formatEarnvidsUrl,
  isEarnvidsUrlOrServer,
  DEFAULT_EARNVIDS_BASE,
  setEarnvidsBaseUrl,
  getEarnvidsBaseUrl
} from '../lib/earnvidsUtils';
import { formatDoodstreamUrl, normalizeScrapedUrl } from '../lib/doodstreamUtils';

describe('EarnVids Utils - normalizeEarnvidsBase', () => {
  it('agrega protocolo https y /v/ si solo se especifica el dominio', () => {
    expect(normalizeEarnvidsBase('smoothpre.com')).toBe('https://smoothpre.com/v/');
    expect(normalizeEarnvidsBase('earnvids.com')).toBe('https://earnvids.com/v/');
    expect(normalizeEarnvidsBase('https://smoothpre.com')).toBe('https://smoothpre.com/v/');
  });

  it('respeta /v/ o /e/ si ya está incluido', () => {
    expect(normalizeEarnvidsBase('https://smoothpre.com/v')).toBe('https://smoothpre.com/v/');
    expect(normalizeEarnvidsBase('https://smoothpre.com/v/')).toBe('https://smoothpre.com/v/');
    expect(normalizeEarnvidsBase('https://smoothpre.com/e/')).toBe('https://smoothpre.com/e/');
  });

  it('devuelve valor por defecto si está vacío', () => {
    expect(normalizeEarnvidsBase('')).toBe(DEFAULT_EARNVIDS_BASE);
    expect(normalizeEarnvidsBase('   ')).toBe(DEFAULT_EARNVIDS_BASE);
  });
});

describe('EarnVids Utils - isEarnvidsUrlOrServer', () => {
  it('detecta por nombre de servidor', () => {
    expect(isEarnvidsUrlOrServer('https://example.com/test', 'earnvids')).toBe(true);
    expect(isEarnvidsUrlOrServer('https://example.com/test', 'EarnVids')).toBe(true);
    expect(isEarnvidsUrlOrServer('https://example.com/test', 'EARNVIDS')).toBe(true);
    expect(isEarnvidsUrlOrServer('https://example.com/test', 'smoothpre')).toBe(true);
    expect(isEarnvidsUrlOrServer('https://example.com/test', 'earnvid')).toBe(true);
  });

  it('detecta por dominio en la URL', () => {
    expect(isEarnvidsUrlOrServer('https://smoothpre.com/v/3r0ttf5nvn5w')).toBe(true);
    expect(isEarnvidsUrlOrServer('https://earnvids.com/v/3r0ttf5nvn5w')).toBe(true);
    expect(isEarnvidsUrlOrServer('https://earnvids.com/d/3r0ttf5nvn5w')).toBe(true);
    expect(isEarnvidsUrlOrServer('https://earnvids.com/e/3r0ttf5nvn5w')).toBe(true);
    expect(isEarnvidsUrlOrServer('https://earnvid.net/v/3r0ttf5nvn5w')).toBe(true);
  });

  it('no detecta otros servidores como Doodstream, Streamwish o Mixdrop', () => {
    expect(isEarnvidsUrlOrServer('https://dood.to/e/3r0ttf5nvn5w', 'doodstream')).toBe(false);
    expect(isEarnvidsUrlOrServer('https://streamwish.fun/e/3r0ttf5nvn5w', 'streamwish')).toBe(false);
    expect(isEarnvidsUrlOrServer('https://mixdrop.ps/e/3r0ttf5nvn5w', 'mixdrop')).toBe(false);
  });
});

describe('EarnVids Utils - extractEarnvidsVideoId', () => {
  it('extrae ID de rutas /v/, /e/, /d/, /f/, /embed/', () => {
    expect(extractEarnvidsVideoId('https://smoothpre.com/v/3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
    expect(extractEarnvidsVideoId('https://earnvids.com/e/3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
    expect(extractEarnvidsVideoId('https://earnvids.com/d/3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
    expect(extractEarnvidsVideoId('https://earnvids.com/f/3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
    expect(extractEarnvidsVideoId('https://smoothpre.com/embed/3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
    expect(extractEarnvidsVideoId('https://smoothpre.com/embed-3r0ttf5nvn5w.html')).toBe('3r0ttf5nvn5w');
  });

  it('extrae ID con .html al final', () => {
    expect(extractEarnvidsVideoId('https://smoothpre.com/3r0ttf5nvn5w.html')).toBe('3r0ttf5nvn5w');
    expect(extractEarnvidsVideoId('https://earnvids.com/v/3r0ttf5nvn5w.html')).toBe('3r0ttf5nvn5w');
  });

  it('extrae ID de URLs simples con ID directo', () => {
    expect(extractEarnvidsVideoId('https://smoothpre.com/3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
    expect(extractEarnvidsVideoId('https://earnvids.com/3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
  });

  it('extrae ID con query strings o fragments', () => {
    expect(extractEarnvidsVideoId('https://smoothpre.com/v/3r0ttf5nvn5w?foo=bar#baz')).toBe('3r0ttf5nvn5w');
    expect(extractEarnvidsVideoId('https://smoothpre.com/?id=3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
  });
});

describe('EarnVids Formatting & doodstreamUtils Integration', () => {
  beforeEach(async () => {
    await setEarnvidsBaseUrl(DEFAULT_EARNVIDS_BASE, false);
  });

  it('formatea al formato predeterminado https://smoothpre.com/v/VIDEO_ID', () => {
    const input = 'https://earnvids.com/d/3r0ttf5nvn5w';
    const formatted = formatEarnvidsUrl(input);
    expect(formatted).toBe('https://smoothpre.com/v/3r0ttf5nvn5w');
  });

  it('formatea enlaces de earnvids.com/v/, earnvids.com/e/, earnvids.com/3r0ttf5nvn5w.html', () => {
    expect(formatEarnvidsUrl('https://earnvids.com/v/3r0ttf5nvn5w')).toBe('https://smoothpre.com/v/3r0ttf5nvn5w');
    expect(formatEarnvidsUrl('https://earnvids.com/e/3r0ttf5nvn5w')).toBe('https://smoothpre.com/v/3r0ttf5nvn5w');
    expect(formatEarnvidsUrl('https://earnvids.com/3r0ttf5nvn5w.html')).toBe('https://smoothpre.com/v/3r0ttf5nvn5w');
    expect(formatEarnvidsUrl('https://smoothpre.com/e/3r0ttf5nvn5w')).toBe('https://smoothpre.com/v/3r0ttf5nvn5w');
  });

  it('formatea mediante formatDoodstreamUrl y normalizeScrapedUrl', () => {
    const input = 'https://earnvids.com/d/3r0ttf5nvn5w';
    expect(formatDoodstreamUrl(input)).toBe('https://smoothpre.com/v/3r0ttf5nvn5w');
    expect(normalizeScrapedUrl(input)).toBe('https://smoothpre.com/v/3r0ttf5nvn5w');
  });

  it('formatea cuando se pasa serverName EarnVids', () => {
    const input = 'https://some-unrecognized-domain.com/v/3r0ttf5nvn5w';
    const formatted = formatDoodstreamUrl(input, 'EarnVids');
    expect(formatted).toBe('https://smoothpre.com/v/3r0ttf5nvn5w');
  });

  it('mantiene la compatibilidad con Streamwish, Doodstream, Mixdrop y Dropload', () => {
    expect(formatDoodstreamUrl('https://streamwish.to/e/3r0ttf5nvn5w')).toBe('https://streamwish.fun/e/3r0ttf5nvn5w');
    expect(formatDoodstreamUrl('https://doodstream.com/d/abc123456')).toBe('https://dood.to/e/abc123456');
    expect(formatDoodstreamUrl('https://mixdrop.co/f/mix123456')).toBe('https://mixdrop.ps/e/mix123456');
    expect(formatDoodstreamUrl('https://dropload.io/d/drop123456')).toBe('https://dr0pstream.com/e/drop123456');
  });
});
