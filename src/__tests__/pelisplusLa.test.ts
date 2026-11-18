import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizePelisplusLaLanguage,
  parsePelisplusLaHtml,
  groupOptionsByServer,
  extractPelisplusLaTitle,
  parsePelisplusLaSeriesPage,
  detectPelisplusLaDirectEpisode,
  matchesPelisplusLaServer,
  getExtraDetectedPelisplusLaServers,
  normalizePelisplusLaServerFilter,
  isPelisplusLaServerFilterActive,
  formatPelisplusLaOptionUrl,
} from '../lib/pelisplusLaUtils';
import { DEFAULT_STREAMWISH_BASE, setStreamwishBaseUrl } from '../lib/streamwishUtils';

describe('PelisplusHD.la Utils - normalizePelisplusLaLanguage', () => {
  it('clasifica correctamente Español Latino, Español/Castellano y Subtitulado', () => {
    expect(normalizePelisplusLaLanguage('Español Latino')).toBe('lat');
    expect(normalizePelisplusLaLanguage('Latino')).toBe('lat');
    expect(normalizePelisplusLaLanguage('LAT')).toBe('lat');

    expect(normalizePelisplusLaLanguage('Español')).toBe('cast');
    expect(normalizePelisplusLaLanguage('Castellano')).toBe('cast');
    expect(normalizePelisplusLaLanguage('España')).toBe('cast');

    expect(normalizePelisplusLaLanguage('Subtitulado')).toBe('sub');
    expect(normalizePelisplusLaLanguage('Subtitulada')).toBe('sub');
    expect(normalizePelisplusLaLanguage('VOSE')).toBe('sub');
    expect(normalizePelisplusLaLanguage('Inglés')).toBe('sub');

    expect(normalizePelisplusLaLanguage('')).toBeNull();
    expect(normalizePelisplusLaLanguage('Desconocido')).toBeNull();
  });
});

describe('PelisplusHD.la Utils - parsePelisplusLaHtml', () => {
  beforeEach(async () => {
    await setStreamwishBaseUrl(DEFAULT_STREAMWISH_BASE, false);
  });

  it('extrae título, idioma y servidores del HTML de PelisplusHD.la (caso insecta)', () => {
    const html = `
      <html>
        <head><title>Ver Insecta (2026) Online Latino HD - Pelisplus</title></head>
        <body>
          <h1>Pelisplus</h1>
          <h1 class="m-b-5"> Insecta</h1>
          <div class="player">
            <a class="divseason active" title="Español Latino">
              <img src="/static/img/latino.svg?" alt="Español Latino" class="_15ltj_0"> Español Latino
            </a>
            <div class="VideoPlayer Bglg">
              <ul class="TbVideoNv nav nav-tabs" role="tablist">
                <li role="presentation" data-url="https://streamwish.to/e/80whngibhku3" data-name="Español Latino" class="playurl" style="display:none"> <a href="#option1">streamwish</a> </li>
                <li role="presentation" data-url="https://vidhidepro.com/v/byi2e6efgtz0" data-name="Español Latino" class="playurl" style="display:none"> <a href="#option2">vidhide</a> </li>
                <li role="presentation" data-url="https://vidara.to/e/4Y2q4yZDtxGWw" data-name="Español Latino" class="playurl" style="display:none"> <a href="#option3">vidara</a> </li>
              </ul>
            </div>
            <div class="video">
              <div id="video-content" class="video-html">
                <iframe src="" width="100%" height="100%" frameborder="0" allowfullscreen=""></iframe>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const parsed = parsePelisplusLaHtml(html, 'https://pelisplushd.la/pelicula/insecta');

    expect(parsed.title).toBe('Insecta');
    expect(parsed.detectedLanguages).toEqual(['Español Latino']);
    expect(parsed.detectedServers).toEqual(['streamwish', 'vidhide', 'vidara']);
    expect(parsed.options).toHaveLength(3);

    expect(parsed.options[0]).toEqual({
      languageLabel: 'Español Latino',
      languageKey: 'lat',
      serverName: 'streamwish',
      rawUrl: 'https://streamwish.to/e/80whngibhku3',
      formattedUrl: 'https://streamwish.fun/e/80whngibhku3',
    });

    expect(parsed.options[1]).toEqual({
      languageLabel: 'Español Latino',
      languageKey: 'lat',
      serverName: 'vidhide',
      rawUrl: 'https://vidhidepro.com/v/byi2e6efgtz0',
      formattedUrl: 'https://smoothpre.com/v/byi2e6efgtz0',
    });

    expect(parsed.options[2]).toEqual({
      languageLabel: 'Español Latino',
      languageKey: 'lat',
      serverName: 'vidara',
      rawUrl: 'https://vidara.to/e/4Y2q4yZDtxGWw',
      formattedUrl: 'https://vidara.so/v/4Y2q4yZDtxGWw',
    });
  });

  it('extrae y agrupa correctamente películas con múltiples idiomas (LAT, CAST, SUB)', () => {
    const html = `
      <h1 class="m-b-5">Película Multi</h1>
      <div class="player">
        <a class="divseason" title="Español Latino">Español Latino</a>
        <a class="divseason" title="Subtitulado">Subtitulado</a>
        <a class="divseason" title="Español">Español</a>
        <div class="VideoPlayer Bglg">
          <ul class="TbVideoNv nav nav-tabs" role="tablist">
            <li data-url="https://streamwish.to/e/lat111" data-name="Español Latino" class="playurl"><a href="#option1">streamwish</a></li>
            <li data-url="https://vidhidepro.com/v/lat222" data-name="Español Latino" class="playurl"><a href="#option2">vidhide</a></li>
            <li data-url="https://vidara.to/e/lat333" data-name="Español Latino" class="playurl"><a href="#option3">vidara</a></li>
            <li data-url="https://streamwish.to/e/sub111" data-name="Subtitulado" class="playurl"><a href="#option1">streamwish</a></li>
            <li data-url="https://vidhidepro.com/v/sub222" data-name="Subtitulado" class="playurl"><a href="#option2">vidhide</a></li>
            <li data-url="https://streamwish.to/e/cast111" data-name="Español" class="playurl"><a href="#option1">streamwish</a></li>
          </ul>
        </div>
      </div>
    `;

    const parsed = parsePelisplusLaHtml(html);
    const allGroups = groupOptionsByServer(parsed.options, parsed.title, 'all');

    expect(allGroups).toHaveLength(3);
    expect(allGroups[0]).toEqual({
      server: 'streamwish',
      title: 'Película Multi',
      lat: ['https://streamwish.fun/e/lat111'],
      cast: ['https://streamwish.fun/e/cast111'],
      sub: ['https://streamwish.fun/e/sub111'],
      other: [],
    });
    expect(allGroups[1]).toEqual({
      server: 'vidhide',
      title: 'Película Multi',
      lat: ['https://smoothpre.com/v/lat222'],
      cast: [],
      sub: ['https://smoothpre.com/v/sub222'],
      other: [],
    });
    expect(allGroups[2]).toEqual({
      server: 'vidara',
      title: 'Película Multi',
      lat: ['https://vidara.so/v/lat333'],
      cast: [],
      sub: [],
      other: [],
    });

    const onlyVidhide = groupOptionsByServer(parsed.options, parsed.title, 'vidhide');
    expect(onlyVidhide).toHaveLength(1);
    expect(onlyVidhide[0].server).toBe('vidhide');
    expect(onlyVidhide[0].lat).toEqual(['https://smoothpre.com/v/lat222']);
    expect(onlyVidhide[0].sub).toEqual(['https://smoothpre.com/v/sub222']);
  });

  it('usa fallback de .divseason y #video-content iframe cuando falta data-name o li.playurl', () => {
    const htmlWithMissingDataName = `
      <div class="player">
        <a class="divseason active" title="Subtitulado">Subtitulado</a>
        <ul class="TbVideoNv nav nav-tabs">
          <li class="playurl" data-url="//vidara.to/e/abc123"><a href="#option1">vidara</a></li>
        </ul>
      </div>
    `;
    const parsed1 = parsePelisplusLaHtml(htmlWithMissingDataName);
    expect(parsed1.options).toHaveLength(1);
    expect(parsed1.options[0].languageKey).toBe('sub');
    expect(parsed1.options[0].formattedUrl).toBe('https://vidara.so/v/abc123');

    const htmlIframeOnly = `
      <div class="player">
        <a class="divseason active" title="Español">Español</a>
        <div class="video">
          <div id="video-content" class="video-html">
            <iframe src="https://vidhidepro.com/v/xyz789" allowfullscreen></iframe>
          </div>
        </div>
      </div>
    `;
    const parsed2 = parsePelisplusLaHtml(htmlIframeOnly);
    expect(parsed2.options).toHaveLength(1);
    expect(parsed2.options[0].languageKey).toBe('cast');
    expect(parsed2.options[0].serverName).toBe('vidhide');
    expect(parsed2.options[0].formattedUrl).toBe('https://smoothpre.com/v/xyz789');
  });

  it('extrae el título desde <title> si no hay <h1> útil', () => {
    const html = `<html><head><title>Ver Matrix (1999) Online Latino HD - Pelisplus</title></head><body><h1>Pelisplus</h1></body></html>`;
    expect(extractPelisplusLaTitle(html)).toBe('Matrix (1999)');
  });

  it('extrae opciones de episodio con formato li[data-id] + #link_url span[lid][url]', () => {
    const epHtml = `
      <h1 class="m-b-5"> Nos conocimos en Estambul: Temporada 1, Capitulo 1 - Episode 1</h1>
      <div class="player">
        <a class="divseason"><img src="/static/img/latino.svg?" alt="Misterio" class="_15ltj_0"> Español Latino</a>
        <div class="VideoPlayer Bglg">
          <ul class="TbVideoNv nav nav-tabs" role="tablist">
            <li role="presentation" data-id="1" class=""> <a href="#option1">voesx</a> </li>
            <li role="presentation" data-id="2" class=""> <a href="#option2">streamwish</a> </li>
            <li role="presentation" data-id="3" class=""> <a href="#option3">vidhide</a> </li>
            <li role="presentation" data-id="4" class=""> <a href="#option4">vidara</a> </li>
          </ul>
        </div>
        <div class="video">
          <div id="video-content" class="video-html">
            <!-- <iframe src="https://voe.sx/e/bdeomotlcbf5"></iframe> -->
          </div>
        </div>
      </div>
      <div id="link_url">
        <span lid="1" url="https://voe.sx/e/bdeomotlcbf5"></span>
        <span lid="2" url="https://streamwish.to/e/fz152tqxw5eu"></span>
        <span lid="3" url="https://vidhidepro.com/v/6ln458z1trpu"></span>
        <span lid="4" url="https://vidara.to/e/hk3n29s0gTbL9"></span>
      </div>
    `;

    const parsed = parsePelisplusLaHtml(
      epHtml,
      'https://pelisplushd.la/serie/nos-conocimos-en-estambul/temporada/1/capitulo/1'
    );

    expect(parsed.detectedLanguages).toEqual(['Español Latino']);
    expect(parsed.detectedServers).toEqual(['voesx', 'streamwish', 'vidhide', 'vidara']);
    expect(parsed.options).toHaveLength(4);
    expect(parsed.options[0]).toEqual({
      languageLabel: 'Español Latino',
      languageKey: 'lat',
      serverName: 'voesx',
      rawUrl: 'https://voe.sx/e/bdeomotlcbf5',
      formattedUrl: 'https://voe.sx/e/bdeomotlcbf5',
    });
    expect(parsed.options[1].formattedUrl).toBe('https://streamwish.fun/e/fz152tqxw5eu');
    expect(parsed.options[2].formattedUrl).toBe('https://smoothpre.com/v/6ln458z1trpu');
    expect(parsed.options[3].formattedUrl).toBe('https://vidara.so/v/hk3n29s0gTbL9');

    expect(matchesPelisplusLaServer(parsed.options[0], 'voe')).toBe(true);
    expect(matchesPelisplusLaServer(parsed.options[1], 'voe')).toBe(false);
    expect(matchesPelisplusLaServer(parsed.options[1], 'streamwish')).toBe(true);
  });
});

describe('PelisplusHD.la Utils - Series & Episodios', () => {
  it('detecta temporadas y episodios desde la página de serie', () => {
    const seriesHtml = `
      <h1 class="m-b-5"> Nos conocimos en Estambul</h1>
      <h1>Pelisplus</h1>
      <ul class="TbVideoNv nav nav-tabs">
        <li class="presentation"><a href=" #pills-vertical-1">TEMPORADA 1</a></li>
        <li class="presentation"><a href=" #pills-vertical-2">TEMPORADA 2</a></li>
      </ul>
      <div class="tab-content">
        <div id="pills-vertical-2">
          <a href="/serie/nos-conocimos-en-estambul/temporada/2/capitulo/2" class="btn btn-primary">Nos conocimos en Estambul 2x2</a>
          <a href="/serie/nos-conocimos-en-estambul/temporada/2/capitulo/1" class="btn btn-primary">Nos conocimos en Estambul 2x1</a>
        </div>
        <div id="pills-vertical-1">
          <a href="/serie/nos-conocimos-en-estambul/temporada/1/capitulo/1" class="btn btn-primary">Nos conocimos en Estambul 1x1</a>
          <a href="/serie/nos-conocimos-en-estambul/temporada/1/capitulo/2" class="btn btn-primary">Nos conocimos en Estambul 1x2</a>
          <a href="/serie/nos-conocimos-en-estambul/temporada/1/capitulo/1" class="btn btn-primary">Duplicado</a>
        </div>
      </div>
    `;

    const parsed = parsePelisplusLaSeriesPage(
      seriesHtml,
      'https://pelisplushd.la/serie/nos-conocimos-en-estambul'
    );

    expect(parsed.title).toBe('Nos conocimos en Estambul');
    expect(parsed.seasons).toEqual([1, 2]);
    expect(parsed.episodes).toEqual([
      {
        season: 1,
        episode: 1,
        url: 'https://pelisplushd.la/serie/nos-conocimos-en-estambul/temporada/1/capitulo/1',
        label: 'Nos conocimos en Estambul 1x1',
      },
      {
        season: 1,
        episode: 2,
        url: 'https://pelisplushd.la/serie/nos-conocimos-en-estambul/temporada/1/capitulo/2',
        label: 'Nos conocimos en Estambul 1x2',
      },
      {
        season: 2,
        episode: 1,
        url: 'https://pelisplushd.la/serie/nos-conocimos-en-estambul/temporada/2/capitulo/1',
        label: 'Nos conocimos en Estambul 2x1',
      },
      {
        season: 2,
        episode: 2,
        url: 'https://pelisplushd.la/serie/nos-conocimos-en-estambul/temporada/2/capitulo/2',
        label: 'Nos conocimos en Estambul 2x2',
      },
    ]);
  });

  it('detecta URL directa de episodio y descarta URLs de serie raíz', () => {
    expect(
      detectPelisplusLaDirectEpisode('https://pelisplushd.la/serie/nos-conocimos-en-estambul')
    ).toBeNull();

    expect(
      detectPelisplusLaDirectEpisode(
        'https://pelisplushd.la/serie/nos-conocimos-en-estambul/temporada/2/capitulo/4'
      )
    ).toEqual({
      season: 2,
      episode: 4,
      url: 'https://pelisplushd.la/serie/nos-conocimos-en-estambul/temporada/2/capitulo/4',
    });
  });

  it('extrae y filtra servidores diversos en películas con #link_url y helpers de servidores detectados', () => {
    const movieLinkUrlHtml = `
      <h1 class="m-b-5">Moonfall</h1>
      <div class="player">
        <a class="divseason"><img src="/static/img/latino.svg?" alt="Doramas" class="_15ltj_0"> Español Latino</a>
        <div class="VideoPlayer Bglg">
          <ul class="TbVideoNv nav nav-tabs" role="tablist">
            <li role="presentation" data-id="1"><a href="#option1">DoFast</a></li>
            <li role="presentation" data-id="2"><a href="#option2">STLARE</a></li>
            <li role="presentation" data-id="3"><a href="#option3">Waaw</a></li>
            <li role="presentation" data-id="4"><a href="#option4">SBFast</a></li>
            <li role="presentation" data-id="5"><a href="#option5">V2</a></li>
            <li role="presentation" data-id="6"><a href="#option6">Streamtape</a></li>
            <li role="presentation" data-id="7"><a href="#option7">Voe</a></li>
            <li role="presentation" data-id="8"><a href="#option8">Waaw</a></li>
          </ul>
        </div>
      </div>
      <div id="link_url">
        <span lid="1" url="https://doodstream.com/e/ari29z9p5d8x"></span>
        <span lid="2" url="https://streamlare.com/e/eZEvMDNL4bBlNoKy"></span>
        <span lid="3" url="https://waaw.to/f/PJnFPVA13OHc"></span>
        <span lid="4" url="https://watchsb.com/e/u0un26v4hams"></span>
        <span lid="5" url="https://v2.zplayer.live/embed/ckf12pws0ixb"></span>
        <span lid="6" url="https://streamtape.com/e/j4RPjowlPZSz0rv"></span>
        <span lid="7" url="https://voe.sx/e/irfl5j0i3st6"></span>
        <span lid="8" url="https://waaw.to/f/uxwWm0yH17lR"></span>
      </div>
    `;

    const parsed = parsePelisplusLaHtml(movieLinkUrlHtml, 'https://pelisplushd.la/pelicula/moonfall');
    expect(parsed.options).toHaveLength(8);
    expect(parsed.detectedLanguages).toEqual(['Español Latino']);
    expect(parsed.detectedServers).toEqual([
      'dofast',
      'stlare',
      'waaw',
      'sbfast',
      'v2',
      'streamtape',
      'voe',
    ]);

    expect(parsed.options[0].formattedUrl).toBe('https://playmogo.com/e/ari29z9p5d8x');
    expect(matchesPelisplusLaServer(parsed.options[0], 'doodstream')).toBe(true);
    expect(matchesPelisplusLaServer(parsed.options[0], 'dofast')).toBe(true);
    expect(matchesPelisplusLaServer(parsed.options[0], 'playmogo')).toBe(true);
    expect(matchesPelisplusLaServer(parsed.options[4], 'v2')).toBe(true);
    expect(matchesPelisplusLaServer(parsed.options[2], 'netu')).toBe(true);

    expect(normalizePelisplusLaServerFilter('voesx')).toBe('voe');
    expect(normalizePelisplusLaServerFilter('dofast')).toBe('doodstream');
    expect(normalizePelisplusLaServerFilter('waaw')).toBe('waaw');
    expect(
      getExtraDetectedPelisplusLaServers(['voesx', 'streamwish', 'uqload', 'dofast', 'waaw', 'v2'])
    ).toEqual(['waaw', 'v2']);
    expect(isPelisplusLaServerFilterActive('voe', 'voesx')).toBe(true);
    expect(isPelisplusLaServerFilterActive('doodstream', 'dofast')).toBe(true);
    expect(isPelisplusLaServerFilterActive('waaw', 'waaw')).toBe(true);
    expect(isPelisplusLaServerFilterActive('waaw', 'voesx')).toBe(false);
  });

  it('cambia dominio de Uqload a https://uqload.vc, Doodstream a https://playmogo.com, Vidhide a https://smoothpre.com y Vidara a https://vidara.so/v/VIDEO_ID en pelisplushd.la', () => {
    expect(
      formatPelisplusLaOptionUrl('https://uqload.io/embed-xbsidtff7mme.html', 'uqload')
    ).toBe('https://uqload.vc/embed-xbsidtff7mme.html');
    expect(formatPelisplusLaOptionUrl('http://www.uqload.is/abc12345.html')).toBe(
      'https://uqload.vc/embed-abc12345.html'
    );
    expect(formatPelisplusLaOptionUrl('https://doodstream.com/e/ari29z9p5d8x', 'DoFast')).toBe(
      'https://playmogo.com/e/ari29z9p5d8x'
    );
    expect(formatPelisplusLaOptionUrl('https://dood.to/d/xyz98765', 'doodstream')).toBe(
      'https://playmogo.com/e/xyz98765'
    );
    expect(formatPelisplusLaOptionUrl('https://ds2play.com/e/qwe45678')).toBe(
      'https://playmogo.com/e/qwe45678'
    );
    expect(formatPelisplusLaOptionUrl('https://vidhidepro.com/v/byi2e6efgtz0', 'vidhide')).toBe(
      'https://smoothpre.com/v/byi2e6efgtz0'
    );
    expect(formatPelisplusLaOptionUrl('https://vidhidefast.com/e/vh123456')).toBe(
      'https://smoothpre.com/v/vh123456'
    );
    expect(formatPelisplusLaOptionUrl('https://vidhide.com/embed-vh789012.html')).toBe(
      'https://smoothpre.com/v/vh789012'
    );
    expect(formatPelisplusLaOptionUrl('https://vidara.to/e/4Y2q4yZDtxGWw', 'vidara')).toBe(
      'https://vidara.so/v/4Y2q4yZDtxGWw'
    );
    expect(formatPelisplusLaOptionUrl('https://vidara.so/e/vr123456')).toBe(
      'https://vidara.so/v/vr123456'
    );
    expect(formatPelisplusLaOptionUrl('https://vidara.to/v/vr789012')).toBe(
      'https://vidara.so/v/vr789012'
    );

    const html = `
      <div class="player">
        <a class="divseason active" title="Español Latino">Español Latino</a>
        <ul class="TbVideoNv nav nav-tabs">
          <li class="playurl" data-url="https://uqload.to/embed-test111.html" data-name="Español Latino"><a href="#option1">Uqload</a></li>
          <li class="playurl" data-url="https://dood.so/e/test222" data-name="Español Latino"><a href="#option2">Doodstream</a></li>
          <li class="playurl" data-url="https://vidhidepro.com/v/test333" data-name="Español Latino"><a href="#option3">vidhide</a></li>
          <li class="playurl" data-url="https://vidara.to/e/test444" data-name="Español Latino"><a href="#option4">vidara</a></li>
        </ul>
      </div>
    `;

    const parsed = parsePelisplusLaHtml(html);
    expect(parsed.options).toHaveLength(4);
    expect(parsed.options[0].serverName).toBe('uqload');
    expect(parsed.options[0].formattedUrl).toBe('https://uqload.vc/embed-test111.html');
    expect(matchesPelisplusLaServer(parsed.options[0], 'uqload')).toBe(true);
    expect(parsed.options[1].serverName).toBe('doodstream');
    expect(parsed.options[1].formattedUrl).toBe('https://playmogo.com/e/test222');
    expect(matchesPelisplusLaServer(parsed.options[1], 'doodstream')).toBe(true);
    expect(parsed.options[2].serverName).toBe('vidhide');
    expect(parsed.options[2].formattedUrl).toBe('https://smoothpre.com/v/test333');
    expect(matchesPelisplusLaServer(parsed.options[2], 'vidhide')).toBe(true);
    expect(parsed.options[3].serverName).toBe('vidara');
    expect(parsed.options[3].formattedUrl).toBe('https://vidara.so/v/test444');
    expect(matchesPelisplusLaServer(parsed.options[3], 'vidara')).toBe(true);
  });
});
