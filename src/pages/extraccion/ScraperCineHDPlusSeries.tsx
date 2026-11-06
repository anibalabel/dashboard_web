import { useState, useMemo, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, AlertCircle, Terminal, Copy, CheckCircle, Check, Layers } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDoodstreamUrl } from '@/lib/doodstreamUtils';
import { getProxyUrl } from '@/lib/proxy';

interface PlayLatinTvSource {
  id: string;
  name: string;
  url: string;
  version?: string;
  rank?: number;
}

interface PlayLatinTvEpisode {
  episode_number: number;
  title?: string;
  description?: string;
  sources?: PlayLatinTvSource[];
}

interface PlayLatinTvSeason {
  season_number: number;
  episodes?: PlayLatinTvEpisode[];
}

interface PlayLatinTvData {
  title?: string;
  backdrop?: string;
  version?: string;
  seasons?: PlayLatinTvSeason[];
}

interface PlayLatinTvResponse {
  ok?: boolean;
  type?: string;
  tv?: PlayLatinTvData;
}

interface ScrapedEpisodeResult {
  season: number;
  episode: number;
  url: string;
  serverName: string;
  lang: 'LAT' | 'CAST' | 'SUB';
  title?: string;
  description?: string;
  isError?: boolean;
}

function normalizeLangCode(rawVersion?: string, sourceId?: string): 'LAT' | 'CAST' | 'SUB' {
  const combined = `${rawVersion || ''} ${sourceId || ''}`.trim().toLowerCase();
  if (
    combined.includes('castellano') ||
    combined.includes('cast') ||
    combined.includes('españa') ||
    combined.includes('espana')
  ) {
    return 'CAST';
  }
  if (
    combined.includes('subtitulado') ||
    combined.includes('sub') ||
    combined.includes('vose') ||
    combined.includes('ingles')
  ) {
    return 'SUB';
  }
  return 'LAT';
}

function hasExplicitSourceLang(source: PlayLatinTvSource): boolean {
  if (source.version && source.version.trim() !== '') return true;
  const id = (source.id || '').toLowerCase();
  return (
    id.includes('latino') ||
    id.includes('castellano') ||
    id.includes('subtitulado') ||
    id.endsWith('-lat') ||
    id.endsWith('-cast') ||
    id.endsWith('-sub')
  );
}

function matchesServerFilter(source: PlayLatinTvSource, preferredServer: string): boolean {
  if (!preferredServer) return true;
  const pref = preferredServer.trim().toLowerCase();
  const name = (source.name || '').toLowerCase();
  const id = (source.id || '').toLowerCase();
  const link = (source.url || '').toLowerCase();

  if (pref === 'dropload' || pref === 'dr0pstream') {
    return (
      name.includes('dropload') ||
      name.includes('dr0pstream') ||
      name.includes('dropstream') ||
      id.includes('dropload') ||
      link.includes('dr0pstream') ||
      link.includes('dropload')
    );
  }
  if (pref === 'doodstream') {
    return (
      name.includes('dood') ||
      id.includes('dood') ||
      link.includes('dood') ||
      link.includes('dsvplay')
    );
  }
  if (pref === 'mixdrop') {
    return (
      name.includes('mixdrop') ||
      name.includes('mxdrop') ||
      id.includes('mixdrop') ||
      link.includes('mixdrop') ||
      link.includes('mxdrop')
    );
  }
  if (pref === 'earnvids' || pref === 'smoothpre') {
    return (
      name.includes('earnvids') ||
      name.includes('earnvid') ||
      name.includes('smoothpre') ||
      id.includes('earnvids') ||
      link.includes('earnvids') ||
      link.includes('smoothpre')
    );
  }

  return name === pref || name.includes(pref) || id.includes(pref) || link.includes(pref);
}

export default function ScraperCineHDPlusSeries() {
  const [url, setUrl] = useState('');
  const [targetSeason, setTargetSeason] = useState<string>('1');
  const [preferredServer, setPreferredServer] = useState<string>('dropload');
  const [preferredLang, setPreferredLang] = useState<'LAT' | 'CAST' | 'SUB'>('LAT');
  const [limit, setLimit] = useState('');

  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [tvData, setTvData] = useState<PlayLatinTvData | null>(null);

  const [notification, setNotification] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const addLog = (msg: string, isError = false) => {
    setLogs((prev) => [...prev, { msg, isError }]);
  };

  const fetchHTML = async (targetUrl: string, refererUrl?: string) => {
    const proxy = getProxyUrl(targetUrl, refererUrl ? { referer: refererUrl } : undefined);
    const res = await fetch(proxy);
    if (!res.ok) throw new Error(`Error ${res.status} al conectar con proxy`);
    return await res.text();
  };

  const fetchEmbedLinksJSON = async (
    apiUrl: string,
    payload: { type: string; id: string; token: string },
    refererUrl: string
  ): Promise<PlayLatinTvResponse> => {
    const proxy = getProxyUrl(apiUrl, { referer: refererUrl });
    const res = await fetch(proxy, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: payload.type,
        id: payload.id,
        token: payload.token
      })
    });
    if (!res.ok) throw new Error(`Error ${res.status} en petición POST a embed-links`);
    return (await res.json()) as PlayLatinTvResponse;
  };

  // Temporadas disponibles en la respuesta de la serie
  const availableSeasons = useMemo(() => {
    if (!tvData?.seasons) return [];
    return [...tvData.seasons]
      .map((s) => ({
        seasonNumber: Number(s.season_number),
        episodeCount: (s.episodes || []).length
      }))
      .sort((a, b) => a.seasonNumber - b.seasonNumber);
  }, [tvData]);

  // Servidores detectados en la serie
  const detectedServers = useMemo(() => {
    if (!tvData?.seasons) return [];
    const set = new Set<string>();
    for (const s of tvData.seasons) {
      for (const ep of s.episodes || []) {
        for (const src of ep.sources || []) {
          if (src.name) set.add(src.name.trim());
        }
      }
    }
    return Array.from(set);
  }, [tvData]);

  // Idiomas detectados en la serie
  const detectedLangs = useMemo(() => {
    if (!tvData) return [] as ('LAT' | 'CAST' | 'SUB')[];
    const set = new Set<'LAT' | 'CAST' | 'SUB'>();
    const seriesDefaultLang = normalizeLangCode(tvData.version);

    for (const s of tvData.seasons || []) {
      for (const ep of s.episodes || []) {
        for (const src of ep.sources || []) {
          const code = hasExplicitSourceLang(src)
            ? normalizeLangCode(src.version, src.id)
            : seriesDefaultLang;
          set.add(code);
        }
      }
    }
    if (set.size === 0 && tvData.version) {
      set.add(seriesDefaultLang);
    }
    return Array.from(set);
  }, [tvData]);

  // Construir resultados filtrados por 1 temporada (o todas), 1 servidor y 1 idioma
  const results: ScrapedEpisodeResult[] = useMemo(() => {
    if (!tvData?.seasons || tvData.seasons.length === 0) return [];

    const seriesDefaultLang = normalizeLangCode(tvData.version);
    const hasMultipleLangsInSources = detectedLangs.length > 1;
    const finalResults: ScrapedEpisodeResult[] = [];

    const sortedSeasons = [...tvData.seasons].sort(
      (a, b) => Number(a.season_number) - Number(b.season_number)
    );

    for (const seasonObj of sortedSeasons) {
      const sNum = Number(seasonObj.season_number);
      if (targetSeason && targetSeason !== 'all' && sNum !== Number(targetSeason)) {
        continue;
      }

      const rawEps = [...(seasonObj.episodes || [])].sort(
        (a, b) => Number(a.episode_number) - Number(b.episode_number)
      );

      if (rawEps.length === 0) continue;

      const maxEp = Number(rawEps[rawEps.length - 1].episode_number);

      for (let epNum = 1; epNum <= maxEp; epNum++) {
        const epObj = rawEps.find((e) => Number(e.episode_number) === epNum);
        if (!epObj) {
          finalResults.push({
            season: sNum,
            episode: epNum,
            url: '--ERROR-- / Episodio Faltante',
            serverName: preferredServer,
            lang: preferredLang,
            title: 'Episodio Faltante',
            isError: true
          });
          continue;
        }

        const sources = epObj.sources || [];
        // Buscar la fuente que coincida con el servidor e idioma seleccionados
        const matchedSource = sources.find((src) => {
          if (!src.url) return false;
          if (!matchesServerFilter(src, preferredServer)) return false;

          const srcLang = hasExplicitSourceLang(src)
            ? normalizeLangCode(src.version, src.id)
            : seriesDefaultLang;

          // Si la serie tiene fuentes con múltiples idiomas o el usuario filtra por idioma disponible
          if (hasMultipleLangsInSources || detectedLangs.includes(preferredLang)) {
            return srcLang === preferredLang;
          }
          return true;
        });

        if (matchedSource) {
          const srcLang = hasExplicitSourceLang(matchedSource)
            ? normalizeLangCode(matchedSource.version, matchedSource.id)
            : seriesDefaultLang;
          const cleanUrl = formatDoodstreamUrl(
            matchedSource.url.startsWith('//') ? `https:${matchedSource.url}` : matchedSource.url,
            matchedSource.name || ''
          );
          finalResults.push({
            season: sNum,
            episode: epNum,
            url: cleanUrl,
            serverName: matchedSource.name || preferredServer,
            lang: srcLang,
            title: epObj.title || `Episodio ${epNum}`,
            description: epObj.description,
            isError: false
          });
        } else {
          finalResults.push({
            season: sNum,
            episode: epNum,
            url: `--ERROR-- / Sin enlace (${preferredServer} • ${preferredLang})`,
            serverName: preferredServer,
            lang: preferredLang,
            title: epObj.title || `Episodio ${epNum}`,
            description: epObj.description,
            isError: true
          });
        }
      }
    }

    if (limit && Number(limit) > 0) {
      return finalResults.slice(0, Number(limit));
    }
    return finalResults;
  }, [tvData, targetSeason, preferredServer, preferredLang, limit, detectedLangs]);

  const validBatchLinks = useMemo(
    () => results.filter((r) => !r.isError && Boolean(r.url)).map((r) => r.url),
    [results]
  );

  const handleScrape = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsScraping(true);
    setLogs([]);
    setTvData(null);

    try {
      const targetUrl = url.trim();
      let iframeSrc = '';
      let extractedSeriesId = '';

      if (/playlatinsrc\.co\/(?:custom\/)?serial\//i.test(targetUrl)) {
        iframeSrc = targetUrl;
        const m = targetUrl.match(/playlatinsrc\.co\/(?:custom\/)?serial\/([a-zA-Z0-9_-]+)/i);
        if (m?.[1]) extractedSeriesId = m[1];
        addLog(`URL directa de PlayLatinSRC detectada: ${iframeSrc}`);
      } else {
        // 1. Lectura de la URL principal de CineHDPlus
        addLog(`Iniciando petición a: ${targetUrl}`);
        const html = await fetchHTML(targetUrl);
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // 2. Búsqueda de <iframe id="serial_iframe"> o <iframe id="movie_iframe">
        const serialIframe =
          doc.querySelector('iframe#serial_iframe') ||
          doc.querySelector('iframe#movie_iframe') ||
          doc.querySelector('iframe[src*="playlatinsrc.co/serial/"]') ||
          doc.querySelector('iframe[src*="playlatinsrc.co/"]');

        const rawIframeSrc = serialIframe?.getAttribute('src')?.trim() || '';

        if (rawIframeSrc && rawIframeSrc.includes('playlatinsrc.co')) {
          iframeSrc = rawIframeSrc.startsWith('//')
            ? `https:${rawIframeSrc}`
            : rawIframeSrc.startsWith('http')
            ? rawIframeSrc
            : new URL(rawIframeSrc, targetUrl).href;
        } else {
          // En el HTML crudo, CineHDPlus asigna serial_iframe.src por script:
          // var imdb = 'tt32874331'; return 'https://playlatinsrc.co/serial/' + imdb;
          const directPlayLatinMatch = html.match(
            /https?:\/\/playlatinsrc\.co\/(?:serial|movie)\/([a-zA-Z0-9_-]+)/i
          );
          const scriptImdbMatch = html.match(/var\s+imdb\s*=\s*['"]([a-zA-Z0-9_-]+)['"]/i);
          const imdbLinkMatch = html.match(/imdb\.com\/title\/(tt\d+)/i);

          if (directPlayLatinMatch?.[1] && directPlayLatinMatch[1] !== "'") {
            extractedSeriesId = directPlayLatinMatch[1];
            iframeSrc = `https://playlatinsrc.co/serial/${extractedSeriesId}`;
          } else if (scriptImdbMatch?.[1]) {
            extractedSeriesId = scriptImdbMatch[1];
            iframeSrc = `https://playlatinsrc.co/serial/${extractedSeriesId}`;
          } else if (imdbLinkMatch?.[1]) {
            extractedSeriesId = imdbLinkMatch[1];
            iframeSrc = `https://playlatinsrc.co/serial/${extractedSeriesId}`;
          }
        }

        if (!iframeSrc) {
          addLog('No se encontró el iframe de PlayLatinSRC ni el ID de IMDb en la página.', true);
          throw new Error('Iframe serial_iframe (playlatinsrc.co) no encontrado');
        }

        if (!extractedSeriesId) {
          const idFromSrc = iframeSrc.match(
            /playlatinsrc\.co\/(?:custom\/)?(?:serial|movie)\/([a-zA-Z0-9_-]+)/i
          );
          if (idFromSrc?.[1]) extractedSeriesId = idFromSrc[1];
        }

        addLog(`Iframe de serie detectado: ${iframeSrc}`);
      }

      // 3. Obtener HTML de playlatinsrc.co/serial/{id} para extraer el token dinámico
      addLog(`Obteniendo token desde: ${iframeSrc}`);
      const playerHtml = await fetchHTML(iframeSrc, targetUrl);

      const payloadMatch = playerHtml.match(
        /\{\s*type\s*:\s*['"]tv['"]\s*,\s*id\s*:\s*['"]([^'"]+)['"]\s*,\s*token\s*:\s*['"]([^'"]+)['"]\s*\}/i
      );
      const tokenMatch = playerHtml.match(/token\s*:\s*['"]([^'"]+)['"]/i);

      const finalType = 'tv';
      const finalToken = payloadMatch?.[2] || tokenMatch?.[1] || '';
      let tokenDecodedId = '';
      if (finalToken.includes('.')) {
        try {
          const parts = atob(finalToken.split('.')[0]).split('|');
          if (parts[1]) tokenDecodedId = parts[1];
        } catch {
          // ignore
        }
      }
      const finalId = payloadMatch?.[1] || tokenDecodedId || extractedSeriesId;

      if (!finalId || !finalToken) {
        addLog('No se pudo extraer el token o ID desde el reproductor de PlayLatinSRC.', true);
        throw new Error('Token de PlayLatinSRC no encontrado');
      }

      const embedOrigin = new URL(iframeSrc).origin;
      const apiEndpoint = `${embedOrigin}/api/embed-links`;

      addLog(`Enviando POST a ${apiEndpoint} (type: "${finalType}", id: "${finalId}")...`);

      // 4. Petición POST a https://playlatinsrc.co/api/embed-links
      const apiData = await fetchEmbedLinksJSON(
        apiEndpoint,
        {
          type: finalType,
          id: finalId,
          token: finalToken
        },
        iframeSrc
      );

      if (!apiData || !apiData.ok || !apiData.tv) {
        addLog('La respuesta de /api/embed-links no contiene datos de serie (tv) válidos.', true);
        throw new Error('Respuesta inválida de /api/embed-links');
      }

      const tv = apiData.tv;
      setTvData(tv);

      // Ajustar idioma detectado de la serie automáticamente
      const detectedSeriesLang = normalizeLangCode(tv.version);
      setPreferredLang(detectedSeriesLang);

      // Si la temporada seleccionada no existe en la serie, seleccionar la primera disponible
      const seasonsList = (tv.seasons || []).map((s) => Number(s.season_number)).sort((a, b) => a - b);
      if (seasonsList.length > 0) {
        if (!targetSeason || (targetSeason !== 'all' && !seasonsList.includes(Number(targetSeason)))) {
          setTargetSeason(String(seasonsList[0]));
        }
      }

      const totalEpisodesCount = (tv.seasons || []).reduce(
        (acc, s) => acc + (s.episodes?.length || 0),
        0
      );

      addLog(
        `Serie: "${tv.title || finalId}" | Idioma base: ${detectedSeriesLang} | Temporadas: ${
          seasonsList.join(', ') || '0'
        } (${totalEpisodesCount} episodios en total).`
      );
      addLog('Extracción finalizada exitosamente.');
    } catch (error) {
      addLog(
        `Error crítico: ${error instanceof Error ? error.message : 'No se pudo completar la extracción'}`,
        true
      );
    } finally {
      setIsScraping(false);
    }
  };

  const handleCopy = async (text: string, key: string, successMsg?: string) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      showNotification(successMsg || 'URL copiada al portapapeles');
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    } else {
      showNotification('Error al copiar al portapapeles');
    }
  };

  const copyBatchLinks = async () => {
    if (validBatchLinks.length === 0) {
      showNotification('No hay enlaces válidos en este lote para copiar');
      return;
    }

    const linksText = validBatchLinks.join('\n');
    const seasonLabel = targetSeason === 'all' ? 'Todas las Temp.' : `Temp. ${targetSeason}`;
    await handleCopy(
      linksText,
      'batch-all',
      `Lote copiado: ${validBatchLinks.length} enlaces (${seasonLabel} • ${preferredServer} • ${preferredLang})`
    );
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2.5 z-50 border border-gray-700">
          <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{notification}</span>
        </div>
      )}

      <div className="mb-8 flex items-center gap-3">
        <PlayCircle className="h-8 w-8 text-green-600" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción CineHDPlus (Series)</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario y Selección de Lote */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">
              Configuración y Filtro de Lote
            </h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Serie (CineHDPlus o PlayLatinSRC)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://cinehdplus.work/peliculas/21216-en-el-barro-ver-online-hd.html"
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temporada a recoger
                  </label>
                  {availableSeasons.length > 0 ? (
                    <select
                      value={targetSeason}
                      onChange={(e) => setTargetSeason(e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2 bg-white"
                    >
                      {availableSeasons.map((s) => (
                        <option key={s.seasonNumber} value={String(s.seasonNumber)}>
                          Temporada {s.seasonNumber} ({s.episodeCount} eps)
                        </option>
                      ))}
                      <option value="all">Todas las temporadas</option>
                    </select>
                  ) : (
                    <input
                      type="number"
                      min="1"
                      value={targetSeason === 'all' ? '' : targetSeason}
                      onChange={(e) => setTargetSeason(e.target.value || '1')}
                      placeholder="Ej. 1"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Idioma del Lote
                  </label>
                  <select
                    value={preferredLang}
                    onChange={(e) => setPreferredLang(e.target.value as 'LAT' | 'CAST' | 'SUB')}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2 bg-white"
                  >
                    <option value="LAT">Latino (LAT)</option>
                    <option value="CAST">Castellano (CAST)</option>
                    <option value="SUB">Subtitulado (SUB)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Servidor del Lote
                  </label>
                  <select
                    value={preferredServer}
                    onChange={(e) => setPreferredServer(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2 bg-white"
                  >
                    <option value="dropload">DropLoad (dropload.io)</option>
                    <option value="doodstream">Doodstream (doodstream.com)</option>
                    <option value="mixdrop">MixDrop (mixdrop.ag)</option>
                    <option value="supervideo">Supervideo</option>
                    <option value="streamwish">StreamWish</option>
                    <option value="voe">VOE</option>
                    <option value="earnvids">EarnVids</option>
                    <option value="streamtape">Streamtape</option>
                    <option value="uqload">Uqload</option>
                    {detectedServers.map((srv) => {
                      const low = srv.toLowerCase();
                      if (low.includes('dropload') || low.includes('dood') || low.includes('mixdrop')) {
                        return null;
                      }
                      return (
                        <option key={srv} value={srv}>
                          {srv} (Detectado)
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Límite de Episodios
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="Opcional"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isScraping || !url}
                className="w-full bg-green-600 text-white px-4 py-2.5 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium mt-4 transition-colors"
              >
                {isScraping ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Extrayendo...
                  </>
                ) : (
                  <>
                    <Search className="h-5 w-5" />
                    Iniciar Extracción
                  </>
                )}
              </button>
            </form>

            {/* Selectores Rápidos post-extracción (1 Temporada • 1 Servidor • 1 Idioma) */}
            {tvData && (
              <div className="mt-5 pt-4 border-t border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-green-600" />
                    Selección Rápida de Lote
                  </span>
                  {tvData.title && (
                    <span className="text-xs font-semibold text-gray-700 truncate max-w-[180px]">
                      {tvData.title}
                    </span>
                  )}
                </div>

                {/* Temporadas detectadas */}
                {availableSeasons.length > 0 && (
                  <div>
                    <span className="block text-xs text-gray-500 mb-1">Temporada:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {availableSeasons.map((s) => (
                        <button
                          key={s.seasonNumber}
                          type="button"
                          onClick={() => setTargetSeason(String(s.seasonNumber))}
                          className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                            targetSeason === String(s.seasonNumber)
                              ? 'bg-green-600 text-white border-green-600'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          T{s.seasonNumber} ({s.episodeCount})
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Servidores detectados */}
                {detectedServers.length > 0 && (
                  <div>
                    <span className="block text-xs text-gray-500 mb-1">Servidor:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {detectedServers.map((srv) => {
                        const isSelected = matchesServerFilter(
                          { id: srv, name: srv, url: '' },
                          preferredServer
                        );
                        return (
                          <button
                            key={srv}
                            type="button"
                            onClick={() => {
                              const low = srv.toLowerCase();
                              if (low.includes('dropload')) setPreferredServer('dropload');
                              else if (low.includes('dood')) setPreferredServer('doodstream');
                              else if (low.includes('mixdrop')) setPreferredServer('mixdrop');
                              else setPreferredServer(srv);
                            }}
                            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            {srv}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Idiomas */}
                <div>
                  <span className="block text-xs text-gray-500 mb-1">Idioma:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(['LAT', 'CAST', 'SUB'] as const).map((langCode) => {
                      const isAvailable = detectedLangs.includes(langCode);
                      const isSelected = preferredLang === langCode;
                      return (
                        <button
                          key={langCode}
                          type="button"
                          onClick={() => setPreferredLang(langCode)}
                          className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors flex items-center gap-1 ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          <span>{langCode}</span>
                          {isAvailable && (
                            <span
                              className={`text-[10px] px-1 rounded ${
                                isSelected ? 'bg-blue-800 text-white' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              disponible
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Consola de Logs */}
          <div className="bg-gray-900 rounded-lg shadow-sm border border-gray-800 p-4 h-64 flex flex-col">
            <div className="flex items-center gap-2 mb-2 text-gray-400 border-b border-gray-800 pb-2">
              <Terminal className="h-4 w-4" />
              <h3 className="text-sm font-medium uppercase tracking-wider">Terminal de Proceso</h3>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1 pr-2 custom-scrollbar">
              {logs.length === 0 && <span className="text-gray-600">Esperando para iniciar...</span>}
              {logs.map((log, i) => (
                <div key={i} className={`${log.isError ? 'text-red-400' : 'text-green-400'} flex gap-2`}>
                  <span className="opacity-50 select-none">&gt;</span>
                  <span className="break-all">{log.msg}</span>
                </div>
              ))}
              {isScraping && (
                <div className="text-blue-400 flex gap-2 animate-pulse">
                  <span className="opacity-50">&gt;</span>
                  <span>Procesando_</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resultados del Lote */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b pb-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Resultados ({validBatchLinks.length} / {results.length} episodios)
                </h2>
                {tvData && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Lote activo:{' '}
                    <span className="font-semibold text-gray-700">
                      {targetSeason === 'all' ? 'Todas las Temporadas' : `Temporada ${targetSeason}`}
                    </span>{' '}
                    &bull; <span className="font-semibold text-indigo-700">{preferredServer}</span> &bull;{' '}
                    <span className="font-semibold text-blue-700">{preferredLang}</span>
                  </p>
                )}
              </div>

              {results.length > 0 && (
                <button
                  type="button"
                  onClick={copyBatchLinks}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-md transition-all shadow-sm ${
                    copiedKey === 'batch-all'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                  title="Copiar todos los enlaces del lote seleccionado (1 temporada, 1 servidor, 1 idioma)"
                >
                  {copiedKey === 'batch-all' ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>¡Lote Copiado ({validBatchLinks.length})!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>
                        Copiar Lote ({targetSeason === 'all' ? 'Todo' : `T${targetSeason}`} &bull;{' '}
                        {preferredServer} &bull; {preferredLang})
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>

            {results.length === 0 && !isScraping && (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <AlertCircle className="h-12 w-12 mb-2 opacity-20" />
                <p>No hay resultados aún</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-3 overflow-y-auto max-h-[600px] pr-2">
                {results.map((res, idx) => (
                  <div
                    key={`${res.season}-${res.episode}-${idx}`}
                    className={`bg-gray-50 border rounded-lg p-3.5 shadow-sm ${
                      res.isError ? 'border-red-200 bg-red-50/60' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2 border-b border-gray-200/80 pb-1.5">
                      <h3 className="font-bold text-gray-800 text-sm sm:text-base">
                        Temporada {res.season} - Episodio {res.episode}
                        {res.title && (
                          <span className="ml-2 text-xs sm:text-sm font-normal text-gray-600">
                            ({res.title})
                          </span>
                        )}
                      </h3>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                          {res.lang}
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                          {res.serverName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-white p-2 rounded border border-gray-200">
                      <span className="text-xs font-bold px-2 py-1 bg-emerald-100 text-emerald-800 rounded w-16 text-center shrink-0">
                        S{res.season}E{res.episode}
                      </span>
                      {res.isError ? (
                        <span className="text-xs sm:text-sm text-red-600 font-mono truncate flex-1">
                          {res.url}
                        </span>
                      ) : (
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono"
                          title={res.url}
                        >
                          {res.url}
                        </a>
                      )}
                      {!res.isError && (
                        <button
                          type="button"
                          onClick={() => handleCopy(res.url, `ep-${idx}`)}
                          className={`p-1.5 rounded transition-all shrink-0 ${
                            copiedKey === `ep-${idx}`
                              ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                              : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                          }`}
                          title="Copiar URL del episodio"
                        >
                          {copiedKey === `ep-${idx}` ? (
                            <Check className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
