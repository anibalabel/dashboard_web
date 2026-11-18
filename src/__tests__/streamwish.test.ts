import { describe, it, expect, beforeEach } from 'vitest';
import { 
  normalizeStreamwishBase, 
  extractStreamwishVideoId, 
  formatStreamwishUrl, 
  isStreamwishUrlOrServer,
  DEFAULT_STREAMWISH_BASE,
  setStreamwishBaseUrl,
  getStreamwishBaseUrl
} from '../lib/streamwishUtils';
import { formatDoodstreamUrl, normalizeScrapedUrl } from '../lib/doodstreamUtils';

describe('Streamwish Utils - normalizeStreamwishBase', () => {
  it('agrega protocolo https y /e/ si solo se especifica el dominio', () => {
    expect(normalizeStreamwishBase('streamwish.fun')).toBe('https://streamwish.fun/e/');
    expect(normalizeStreamwishBase('streamwish.to')).toBe('https://streamwish.to/e/');
    expect(normalizeStreamwishBase('https://embedwish.com')).toBe('https://embedwish.com/e/');
  });

  it('respeta /e/ si ya está incluido', () => {
    expect(normalizeStreamwishBase('https://streamwish.fun/e')).toBe('https://streamwish.fun/e/');
    expect(normalizeStreamwishBase('https://streamwish.fun/e/')).toBe('https://streamwish.fun/e/');
  });

  it('devuelve valor por defecto si está vacío', () => {
    expect(normalizeStreamwishBase('')).toBe(DEFAULT_STREAMWISH_BASE);
    expect(normalizeStreamwishBase('   ')).toBe(DEFAULT_STREAMWISH_BASE);
  });
});

describe('Streamwish Utils - isStreamwishUrlOrServer', () => {
  it('detecta por nombre de servidor', () => {
    expect(isStreamwishUrlOrServer('https://example.com/test', 'streamwish')).toBe(true);
    expect(isStreamwishUrlOrServer('https://example.com/test', 'StreamWish')).toBe(true);
    expect(isStreamwishUrlOrServer('https://example.com/test', 'STREAMWISH')).toBe(true);
    expect(isStreamwishUrlOrServer('https://example.com/test', 'embedwish')).toBe(true);
    expect(isStreamwishUrlOrServer('https://example.com/test', 'wishembed')).toBe(true);
    expect(isStreamwishUrlOrServer('https://example.com/test', 'StreaWhist')).toBe(true);
  });

  it('detecta por dominio en la URL', () => {
    expect(isStreamwishUrlOrServer('https://streamwish.fun/e/3r0ttf5nvn5w')).toBe(true);
    expect(isStreamwishUrlOrServer('https://streamwish.to/e/3r0ttf5nvn5w')).toBe(true);
    expect(isStreamwishUrlOrServer('https://embedwish.com/f/3r0ttf5nvn5w')).toBe(true);
    expect(isStreamwishUrlOrServer('https://wishembed.pro/3r0ttf5nvn5w.html')).toBe(true);
    expect(isStreamwishUrlOrServer('https://awish.pro/e/3r0ttf5nvn5w')).toBe(true);
    expect(isStreamwishUrlOrServer('https://swishsrv.com/e/3r0ttf5nvn5w')).toBe(true);
    expect(isStreamwishUrlOrServer('https://hgcloud.to/e/3r0ttf5nvn5w')).toBe(true);
  });

  it('no detecta otros servidores como Doodstream o Mixdrop', () => {
    expect(isStreamwishUrlOrServer('https://dood.to/e/3r0ttf5nvn5w', 'doodstream')).toBe(false);
    expect(isStreamwishUrlOrServer('https://mixdrop.ps/e/3r0ttf5nvn5w', 'mixdrop')).toBe(false);
  });
});

describe('Streamwish Utils - extractStreamwishVideoId', () => {
  it('extrae ID de rutas /e/, /f/, /d/, /v/', () => {
    expect(extractStreamwishVideoId('https://streamwish.fun/e/3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
    expect(extractStreamwishVideoId('https://streamwish.to/f/3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
    expect(extractStreamwishVideoId('https://embedwish.com/d/3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
    expect(extractStreamwishVideoId('https://wishembed.pro/v/3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
  });

  it('extrae ID con .html al final', () => {
    expect(extractStreamwishVideoId('https://streamwish.to/3r0ttf5nvn5w.html')).toBe('3r0ttf5nvn5w');
    expect(extractStreamwishVideoId('https://streamwish.to/e/3r0ttf5nvn5w.html')).toBe('3r0ttf5nvn5w');
  });

  it('extrae ID de URLs simples con ID directo', () => {
    expect(extractStreamwishVideoId('https://streamwish.fun/3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
  });

  it('extrae ID con query strings o fragments', () => {
    expect(extractStreamwishVideoId('https://streamwish.fun/e/3r0ttf5nvn5w?foo=bar#baz')).toBe('3r0ttf5nvn5w');
    expect(extractStreamwishVideoId('https://streamwish.to/?id=3r0ttf5nvn5w')).toBe('3r0ttf5nvn5w');
  });
});

describe('Streamwish Formatting & doodstreamUtils Integration', () => {
  beforeEach(async () => {
    await setStreamwishBaseUrl(DEFAULT_STREAMWISH_BASE, false);
  });

  it('formatea al formato predeterminado https://streamwish.fun/e/VIDEO_ID', () => {
    const input = 'https://streamwish.to/e/3r0ttf5nvn5w';
    const formatted = formatStreamwishUrl(input);
    expect(formatted).toBe('https://streamwish.fun/e/3r0ttf5nvn5w');
  });

  it('formatea mediante formatDoodstreamUrl y normalizeScrapedUrl', () => {
    const input = 'https://embedwish.com/3r0ttf5nvn5w.html';
    expect(formatDoodstreamUrl(input)).toBe('https://streamwish.fun/e/3r0ttf5nvn5w');
    expect(normalizeScrapedUrl(input)).toBe('https://streamwish.fun/e/3r0ttf5nvn5w');
  });

  it('formatea cuando se pasa serverName Streamwish', () => {
    const input = 'https://some-unrecognized-domain.com/e/3r0ttf5nvn5w';
    const formatted = formatDoodstreamUrl(input, 'Streamwish');
    expect(formatted).toBe('https://streamwish.fun/e/3r0ttf5nvn5w');
  });

  it('respeta dominio configurado personalizado', async () => {
    await setStreamwishBaseUrl('https://streamwish.top/e/', false);
    expect(getStreamwishBaseUrl()).toBe('https://streamwish.top/e/');

    const input = 'https://streamwish.to/e/3r0ttf5nvn5w';
    expect(formatStreamwishUrl(input)).toBe('https://streamwish.top/e/3r0ttf5nvn5w');
    expect(formatDoodstreamUrl(input)).toBe('https://streamwish.top/e/3r0ttf5nvn5w');
  });

  it('mantiene la compatibilidad con Doodstream, Mixdrop y Dropload sin afectarlos', () => {
    expect(formatDoodstreamUrl('https://doodstream.com/d/abc123456')).toBe('https://playmogo.com/e/abc123456');
    expect(formatDoodstreamUrl('https://mixdrop.co/f/mix123456')).toBe('https://mixdrop.ps/e/mix123456');
    expect(formatDoodstreamUrl('https://dropload.io/d/drop123456')).toBe('https://dr0pstream.com/e/drop123456');
  });
});
