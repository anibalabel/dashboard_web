import { describe, it, expect, beforeEach } from 'vitest';
import { formatDoodstreamUrl, normalizeScrapedUrl } from '../lib/doodstreamUtils';
import { HEADER_OPTIONS, SERVER_OPTIONS } from '../lib/constants';
import { DEFAULT_EARNVIDS_BASE, setEarnvidsBaseUrl } from '../lib/earnvidsUtils';
import { DEFAULT_STREAMWISH_BASE, setStreamwishBaseUrl } from '../lib/streamwishUtils';
import {
  buildDooplexSourceFlags,
  FILEMOON_BYSEKOZE_OPTION,
  getDooplexSourceBadgeLabel,
  inferSourceFromSelection,
  normalizeServerLabel,
  parseBulkEpisodesV2Text,
  prepareRegistrationLink
} from '../lib/registrationUtils';

describe('Canonical Server Link Normalization (All 9 Required Servers)', () => {
  beforeEach(async () => {
    await setStreamwishBaseUrl(DEFAULT_STREAMWISH_BASE, false);
    await setEarnvidsBaseUrl(DEFAULT_EARNVIDS_BASE, false);
  });

  it('normaliza Vidara -> https://vidara.so/v/VIDEO_ID', () => {
    expect(formatDoodstreamUrl('https://vidara.to/e/4Y2q4yZDtxGWw')).toBe('https://vidara.so/v/4Y2q4yZDtxGWw');
    expect(formatDoodstreamUrl('https://vidara.so/d/vr123456.html')).toBe('https://vidara.so/v/vr123456');
    expect(formatDoodstreamUrl('https://mirror.example.com/v/virda999', 'virda')).toBe('https://vidara.so/v/virda999');
    expect(normalizeScrapedUrl('https://vidara.to/e/test01')).toBe('https://vidara.so/v/test01');
  });

  it('normaliza VidHide / EarnVids -> https://smoothpre.com/v/VIDEO_ID', () => {
    expect(formatDoodstreamUrl('https://vidhidepro.com/e/vh12345')).toBe('https://smoothpre.com/v/vh12345');
    expect(formatDoodstreamUrl('https://earnvids.com/d/ev67890')).toBe('https://smoothpre.com/v/ev67890');
    expect(formatDoodstreamUrl('https://dhtpre.com/embed/dh11223')).toBe('https://smoothpre.com/v/dh11223');
    expect(formatDoodstreamUrl('https://peytonepre.com/v/py44556')).toBe('https://smoothpre.com/v/py44556');
  });

  it('normaliza StreamWish -> https://streamwish.fun/e/VIDEO_ID', () => {
    expect(formatDoodstreamUrl('https://streamwish.to/f/sw12345')).toBe('https://streamwish.fun/e/sw12345');
    expect(formatDoodstreamUrl('https://hgcloud.to/v/hg67890')).toBe('https://streamwish.fun/e/hg67890');
    expect(formatDoodstreamUrl('https://custom.domain/e/st999', 'StreaWhist')).toBe('https://streamwish.fun/e/st999');
  });

  it('normaliza VOE -> https://voe.sx/e/VIDEO_ID', () => {
    expect(formatDoodstreamUrl('https://voe.sx/d/voe12345')).toBe('https://voe.sx/e/voe12345');
    expect(formatDoodstreamUrl('https://voesx.com/voe67890')).toBe('https://voe.sx/e/voe67890');
    expect(formatDoodstreamUrl('https://aleatory-mirror.com/e/voe999', 'VOE')).toBe('https://voe.sx/e/voe999');
  });

  it('normaliza MixDrop -> https://mixdrop.ps/e/VIDEO_ID', () => {
    expect(formatDoodstreamUrl('https://mixdrop.co/f/mx12345')).toBe('https://mixdrop.ps/e/mx12345');
    expect(formatDoodstreamUrl('https://mxdrop.to/d/mx67890')).toBe('https://mixdrop.ps/e/mx67890');
  });

  it('normaliza UQLoad -> https://uqload.vc/embed-VIDEO_ID.html', () => {
    expect(formatDoodstreamUrl('https://uqload.io/abc12345.html')).toBe('https://uqload.vc/embed-abc12345.html');
    expect(formatDoodstreamUrl('https://uqload.to/e/xyz98765')).toBe('https://uqload.vc/embed-xyz98765.html');
    expect(formatDoodstreamUrl('https://uqload.net/embed-def54321.html')).toBe('https://uqload.vc/embed-def54321.html');
  });

  it('normaliza DoodStream -> https://playmogo.com/e/VIDEO_ID', () => {
    expect(formatDoodstreamUrl('https://dood.to/d/dd12345')).toBe('https://playmogo.com/e/dd12345');
    expect(formatDoodstreamUrl('https://ds2play.com/f/dd67890')).toBe('https://playmogo.com/e/dd67890');
    expect(formatDoodstreamUrl('https://doodstream.com/e/dd11223')).toBe('https://playmogo.com/e/dd11223');
    expect(formatDoodstreamUrl('https://playmogo.com/d/dd44556')).toBe('https://playmogo.com/e/dd44556');
  });

  it('normaliza FileMoon / Bysekoze -> https://bysekoze.com/e/VIDEO_ID', () => {
    expect(formatDoodstreamUrl('https://filemoon.sx/d/fm12345')).toBe('https://bysekoze.com/e/fm12345');
    expect(formatDoodstreamUrl('https://bysesukior.com/v/bs67890')).toBe('https://bysekoze.com/e/bs67890');
    expect(formatDoodstreamUrl('https://bysevepoin.com/e/bv11223')).toBe('https://bysekoze.com/e/bv11223');
    expect(formatDoodstreamUrl('https://byseqekaho.com/e/6wbosve3hlry', 'FileMoon / Bysekoze')).toBe(
      'https://bysekoze.com/e/6wbosve3hlry'
    );
  });

  it('normaliza YouTube -> https://www.youtube.com/watch?v=VIDEO_ID', () => {
    expect(formatDoodstreamUrl('https://youtu.be/dQw4w9WgXcQ?si=test')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
    expect(formatDoodstreamUrl('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
    expect(formatDoodstreamUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
    expect(formatDoodstreamUrl('https://m.youtube.com/watch?time_continue=5&v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
  });

  it('no sobrescribe hosts ajenos conocidos aunque serverName sugiera otro servidor', () => {
    expect(formatDoodstreamUrl('https://vidsonic.net/e/vs12345', 'bysevepoin')).toBe(
      'https://vidsonic.net/e/vs12345'
    );
    expect(formatDoodstreamUrl('https://ok.ru/videoembed/987654', 'voe')).toBe(
      'https://ok.ru/videoembed/987654'
    );
    expect(formatDoodstreamUrl('https://mega.nz/embed/abc!def', 'streamwish')).toBe(
      'https://mega.nz/embed/abc!def'
    );
  });
});

describe('Constants & Registration Helpers (FileMoon / Bysekoze, YouTube, Vidara)', () => {
  it('reemplaza Byse/Byse.sx por FileMoon / Bysekoze e incluye YouTube y Vidara en Header y Calidad', () => {
    expect(SERVER_OPTIONS.some((o) => o.value === FILEMOON_BYSEKOZE_OPTION && o.label === FILEMOON_BYSEKOZE_OPTION)).toBe(true);
    expect(HEADER_OPTIONS.some((o) => o.value === FILEMOON_BYSEKOZE_OPTION && o.label === FILEMOON_BYSEKOZE_OPTION)).toBe(true);

    expect(SERVER_OPTIONS.some((o) => o.value === 'YouTube')).toBe(true);
    expect(HEADER_OPTIONS.some((o) => o.value === 'YouTube')).toBe(true);

    expect(SERVER_OPTIONS.some((o) => o.value === 'Vidara')).toBe(true);
    expect(HEADER_OPTIONS.some((o) => o.value === 'Vidara')).toBe(true);

    expect(SERVER_OPTIONS.some((o) => /^byse(?:\.sx)?$/i.test(o.value) || /^byse$/i.test(o.label))).toBe(false);
    expect(HEADER_OPTIONS.some((o) => /^byse(?:\.sx)?$/i.test(o.value) || /^byse$/i.test(o.label))).toBe(false);
  });

  it('normaliza etiquetas heredadas de servidor y deduce source correctamente', () => {
    expect(normalizeServerLabel('Byse')).toBe('FileMoon / Bysekoze');
    expect(normalizeServerLabel('Byse.sx')).toBe('FileMoon / Bysekoze');
    expect(normalizeServerLabel('filemoon')).toBe('FileMoon / Bysekoze');
    expect(normalizeServerLabel('virda')).toBe('Vidara');
    expect(normalizeServerLabel('youtube')).toBe('YouTube');
    expect(normalizeServerLabel('1080P')).toBe('1080P');

    expect(inferSourceFromSelection('YouTube')).toBe('youtubelink');
    expect(inferSourceFromSelection('Vidara')).toBe('supported_hosts');
    expect(inferSourceFromSelection('virda')).toBe('supported_hosts');
    expect(inferSourceFromSelection('FileMoon / Bysekoze')).toBe('embed');
  });

  it('prepareRegistrationLink asigna URLs canónicas y banderas de base de datos (youtubelink / supported_hosts)', () => {
    const yt = prepareRegistrationLink({
      url: 'https://youtu.be/dQw4w9WgXcQ',
      server: 'YouTube',
      header: 'YouTube',
      source: 'embed'
    });
    expect(yt.link).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(yt.source).toBe('youtubelink');
    expect(yt.sourceFlags).toEqual({ embed: '0', youtubelink: '1', hls: '0', supported_hosts: '0' });

    const vidara = prepareRegistrationLink({
      url: 'https://vidara.to/e/vr42abc',
      server: 'virda',
      header: 'virda',
      source: 'embed'
    });
    expect(vidara.server).toBe('Vidara');
    expect(vidara.header).toBe('Vidara');
    expect(vidara.link).toBe('https://vidara.so/v/vr42abc');
    expect(vidara.source).toBe('supported_hosts');
    expect(vidara.sourceFlags).toEqual({ embed: '0', youtubelink: '0', hls: '0', supported_hosts: '1' });

    const byse = prepareRegistrationLink({
      url: 'https://bysesukior.com/e/bs999',
      server: 'Byse.sx',
      header: 'Byse',
      source: 'embed'
    });
    expect(byse.server).toBe('FileMoon / Bysekoze');
    expect(byse.header).toBe('FileMoon / Bysekoze');
    expect(byse.link).toBe('https://bysekoze.com/e/bs999');
    expect(byse.sourceFlags).toEqual({ embed: '1', youtubelink: '0', hls: '0', supported_hosts: '0' });

    expect(buildDooplexSourceFlags('hls')).toEqual({ embed: '0', youtubelink: '0', hls: '1', supported_hosts: '0' });
    expect(getDooplexSourceBadgeLabel('youtubelink')).toBe('YOUTUBE');
    expect(getDooplexSourceBadgeLabel('supported_hosts')).toBe('SUPPORTED HOST');
    expect(getDooplexSourceBadgeLabel('hls')).toBe('HLS');
    expect(getDooplexSourceBadgeLabel('embed')).toBe('EMBED');
  });

  it('parseBulkEpisodesV2Text normaliza FileMoon/Bysekoze, YouTube y los 9 servidores en bloque', () => {
    const raw = `
EPISODIO 1 [T1·E1] - Inicio
  • [1080p HD] [Latino] virda -> https://vidara.to/e/vr111
  • [1080p HD] [Español España] YouTube -> https://youtu.be/abc123XYZ00
  • [1080p HD] [Subtitulado] Byse.sx -> https://bysesukior.com/d/bs222
  • [1080p HD] [Latino] UQLoad -> https://uqload.io/uq333.html
  • [1080p HD] [Latino] MixDrop -> https://mixdrop.co/f/mx444
  • [1080p HD] [Latino] VidHide -> https://vidhidepro.com/e/vh555
  • [1080p HD] [Latino] StreamWish -> https://streamwish.to/e/sw666
  • [1080p HD] [Latino] VOE -> https://voe.sx/d/vo777
  • [1080p HD] [Latino] DoodStream -> https://dood.to/d/dd888
`;

    const parsed = parseBulkEpisodesV2Text(raw, true, [], []);
    expect(parsed.groups).toHaveLength(1);
    const items = parsed.groups[0].items;
    expect(items).toHaveLength(9);

    expect(items[0]).toMatchObject({ header: 'Vidara', link: 'https://vidara.so/v/vr111', source: 'supported_hosts', lang: 'LAT' });
    expect(items[1]).toMatchObject({ header: 'YouTube', link: 'https://www.youtube.com/watch?v=abc123XYZ00', source: 'youtubelink', lang: 'CAST' });
    expect(items[2]).toMatchObject({ header: 'FileMoon / Bysekoze', link: 'https://bysekoze.com/e/bs222', source: 'embed', lang: 'SUB' });
    expect(items[3]).toMatchObject({ link: 'https://uqload.vc/embed-uq333.html' });
    expect(items[4]).toMatchObject({ link: 'https://mixdrop.ps/e/mx444' });
    expect(items[5]).toMatchObject({ link: 'https://smoothpre.com/v/vh555' });
    expect(items[6]).toMatchObject({ link: 'https://streamwish.fun/e/sw666' });
    expect(items[7]).toMatchObject({ link: 'https://voe.sx/e/vo777' });
    expect(items[8]).toMatchObject({ link: 'https://playmogo.com/e/dd888' });
  });
});
