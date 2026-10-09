import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, AlertCircle, Terminal, Copy, Check, CheckCircle } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDoodstreamUrl } from '@/lib/doodstreamUtils';

type LangKey = 'lat' | 'cast' | 'sub';

interface EpisodeLink {
  season: number;
  episode: number;
  url: string;
}

interface ScrapedResult {
  season: number;
  episode: number;
  lat?: string | null;
  cast?: string | null;
  sub?: string | null;
}

interface SeasonSummary {
  season: number;
  declaredCountText: string;
  detectedEpisodes: number;
}

export default function ScraperGnula() {
  const [url, setUrl] = useState('');
  const [targetSeason, setTargetSeason] = useState('');
  const [limit, setLimit] = useState('');
  const [serverType, setServerType] = useState<'bysevepoin' | 'voe' | 'vidsonic' | 'rpmplay' | 'p2pplay' | 'okru'>('bysevepoin');
  
  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [results, setResults] = useState<ScrapedResult[]>([]);
  const [seasonSummaries, setSeasonSummaries] = useState<SeasonSummary[]>([]);

  const addLog = (msg: string, isError = false) => {
    setLogs(prev => [...prev, { msg, isError }]);
  };

  const extractLangKey = (value: unknown): LangKey | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.toLowerCase();
    if (normalized.includes('lat')) return 'lat';
    if (normalized.includes('cast')) return 'cast';
    if (normalized.includes('sub')) return 'sub';
    return null;
  };

  const decodePossibleRedirect = (value: string) => {
    const finalUrl = value.trim().replace(/^`|`$/g, '').trim();

    try {
      const parsed = new URL(finalUrl);
      const encodedId = parsed.searchParams.get('id');
      if (encodedId) {
        return atob(decodeURIComponent(encodedId));
      }
    } catch {
      // Mantener la URL original si no se puede parsear.
    }

    return finalUrl;
  };

  const getNormalizedServerUrl = (value: unknown) => {
    if (typeof value !== 'string') return null;

    let finalUrl = decodePossibleRedirect(value);
    if (finalUrl.startsWith('//')) {
      finalUrl = `https:${finalUrl}`;
    }

    try {
      const host = new URL(finalUrl).hostname.toLowerCase();
      const matchesServer = (() => {
        if (serverType === 'voe') return host.includes('voe');
        if (serverType === 'vidsonic') return host.includes('vidsonic');
        if (serverType === 'rpmplay') return host.includes('rpmplay');
        if (serverType === 'p2pplay') return host.includes('p2pplay');
        if (serverType === 'okru') return host === 'ok.ru' || host.endsWith('.ok.ru');
        return host.includes('bysevepoin') || host.includes('vidsonic');
      })();

      if (!matchesServer) return null;
      return finalUrl;
    } catch {
      return null;
    }
  };

  const extractEpisodeDataSource = (html: string) => {
    const patterns = [
      /var\s+_gnpv_ep_langs\s*=\s*(\[[\s\S]*?\])\s*;/,
      /var\s+_gnpv_ep_langs\s*=\s*(\{[\s\S]*?\})\s*;/
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  };

  const collectLanguageLinks = (input: unknown) => {
    const found: Record<LangKey, string[]> = { lat: [], cast: [], sub: [] };
    const seen = new Set<string>();

    const visit = (node: unknown, currentLang: LangKey | null = null, depth = 0) => {
      if (node == null || depth > 12) return;

      if (Array.isArray(node)) {
        node.forEach((item) => visit(item, currentLang, depth + 1));
        return;
      }

      if (typeof node !== 'object') return;

      const record = node as Record<string, unknown>;
      let inferredLang = currentLang;

      for (const candidate of [
        record.label,
        record.lang,
        record.language,
        record.name,
        record.title,
        record.type,
        record.idioma
      ]) {
        const detected = extractLangKey(candidate);
        if (detected) {
          inferredLang = detected;
          break;
        }
      }

      for (const [key, value] of Object.entries(record)) {
        const keyLang = extractLangKey(key) || inferredLang;
        const normalizedUrl = getNormalizedServerUrl(value);

        if (keyLang && normalizedUrl) {
          const dedupeKey = `${keyLang}:${normalizedUrl}`;
          if (!seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            found[keyLang].push(normalizedUrl);
          }
        }

        if (typeof value === 'object' && value !== null) {
          visit(value, keyLang, depth + 1);
        }
      }
    };

    visit(input);
    return found;
  };

  const fetchHTML = async (targetUrl: string) => {
    // Usar proxy local
    const proxy = `/proxy.php?url=${encodeURIComponent(targetUrl)}`;
    try {
      const res = await fetch(proxy);
      if (!res.ok) throw new Error(`Error ${res.status} al conectar con proxy local`);
      return await res.text();
    } catch (error) {
      console.error('Error en proxy local:', error);
      throw error;
    }
  };

  const handleScrape = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!url) return;

    setIsScraping(true);
    setLogs([]);
    setResults([]);
    setSeasonSummaries([]);

    try {
      // 1. Lectura de la URL principal
      addLog(`Iniciando petición a: ${url}`);
      const html = await fetchHTML(url);
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // 2. Búsqueda de los enlaces de los Episodios dentro del bloque nuevo de Gnula
      addLog('Buscando temporadas y episodios dentro de .gnpv-ep-eplist...');
      const seasonAccordions = Array.from(doc.querySelectorAll('.gnpv-ep-eplist .gnpv-season-accordion'));
      const epLinks: EpisodeLink[] = [];
      const detectedSummaries: SeasonSummary[] = [];

      if (seasonAccordions.length === 0) {
        addLog('No se encontró el contenedor .gnpv-ep-eplist con temporadas.', true);
      }

      seasonAccordions.forEach((seasonBlock) => {
        const seasonLabel = seasonBlock.querySelector('.gnpv-season-lbl')?.textContent?.trim() || '';
        const seasonCount = seasonBlock.querySelector('.gnpv-season-count')?.textContent?.trim() || '';
        const seasonMatch = seasonLabel.match(/temporada\s+(\d+)/i);
        const seasonNumber = seasonMatch ? parseInt(seasonMatch[1]) : 0;

        if (!seasonNumber) {
          addLog(`No se pudo detectar el número de temporada desde "${seasonLabel}"`, true);
          return;
        }

        addLog(`Temporada ${seasonNumber} detectada${seasonCount ? ` (${seasonCount})` : ''}.`);

        const episodeItems = Array.from(seasonBlock.querySelectorAll('.gnpv-season-body li a[href]'));
        detectedSummaries.push({
          season: seasonNumber,
          declaredCountText: seasonCount,
          detectedEpisodes: episodeItems.length
        });

        episodeItems.forEach((anchor) => {
          const href = anchor.getAttribute('href')?.trim() || '';
          const epNumText = anchor.querySelector('.epl-num')?.textContent?.trim() || '';
          const epTitleText = anchor.querySelector('.epl-title')?.textContent?.trim() || anchor.textContent || '';

          const episodeMatch =
            epNumText.match(/(\d+)\s*x\s*(\d+)/i) ||
            epTitleText.match(/(\d+)\s*x\s*(\d+)/i) ||
            href.match(/-(\d+)x(\d+)\/?$/i);

          const episodeNumber = episodeMatch ? parseInt(episodeMatch[2]) : 0;
          if (!href || !episodeNumber) {
            return;
          }

          try {
            const fullUrl = href.startsWith('http') ? href : new URL(href, url).href;
            if (!epLinks.some((ep) => ep.season === seasonNumber && ep.episode === episodeNumber)) {
              epLinks.push({ season: seasonNumber, episode: episodeNumber, url: fullUrl });
            }
          } catch {
            addLog(`No se pudo normalizar la URL del episodio ${seasonNumber}x${episodeNumber}`, true);
          }
        });
      });

      setSeasonSummaries(
        detectedSummaries
          .slice()
          .sort((a, b) => a.season - b.season)
      );

      // Filtrar y ordenar
      let filtered = epLinks;
      if (targetSeason) {
        filtered = filtered.filter(ep => ep.season === Number(targetSeason));
      }
      filtered.sort((a, b) => a.season === b.season ? a.episode - b.episode : a.season - b.season);
      if (limit) {
        filtered = filtered.slice(0, Number(limit));
      }

      addLog(`Se encontraron ${filtered.length} episodios válidos para procesar.`);

      // 3. & 4. & 5. Loop para obtener iframe y enlaces finales
      const finalResults: ScrapedResult[] = [];

      for (const ep of filtered) {
        addLog(`Procesando S${ep.season}xE${ep.episode}...`);
        try {
          const epHtml = await fetchHTML(ep.url);
          const dataSource = extractEpisodeDataSource(epHtml);
          if (!dataSource) {
            addLog(`No se encontró la variable _gnpv_ep_langs en S${ep.season}xE${ep.episode}`, true);
            continue;
          }

          addLog(`Encontrado _gnpv_ep_langs en S${ep.season}xE${ep.episode}. Parseando...`);

          let parsedData: unknown;
          try {
            parsedData = new Function(`return (${dataSource});`)();
          } catch (err) {
            console.error(err);
            addLog(`No se pudo parsear _gnpv_ep_langs en S${ep.season}xE${ep.episode}`, true);
            continue;
          }

          const extracted = collectLanguageLinks(parsedData);
          const lat = extracted.lat[0] ? formatDoodstreamUrl(extracted.lat[0], serverType) : null;
          const cast = extracted.cast[0] ? formatDoodstreamUrl(extracted.cast[0], serverType) : null;
          const sub = extracted.sub[0] ? formatDoodstreamUrl(extracted.sub[0], serverType) : null;

          if (lat || cast || sub) {
            finalResults.push({ season: ep.season, episode: ep.episode, lat, cast, sub });
            addLog(`Éxito S${ep.season}xE${ep.episode} - LAT: ${!!lat}, CAST: ${!!cast}, SUB: ${!!sub}`);
          } else {
            addLog(`No se encontraron videos (${serverType}) en _gnpv_ep_langs para S${ep.season}xE${ep.episode}`, true);
          }
        } catch (err) {
          addLog(`Error al procesar S${ep.season}xE${ep.episode}: ${err instanceof Error ? err.message : 'Error desconocido'}`, true);
        }
      }

      setResults(finalResults);
      addLog('Extracción finalizada exitosamente.');
    } catch (error) {
      addLog(`Error crítico: ${error instanceof Error ? error.message : 'No se pudo completar la extracción'}`, true);
    } finally {
      setIsScraping(false);
    }
  };

  const [notification, setNotification] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleCopy = async (text: string, key: string, successMsg?: string) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      showNotification(successMsg || 'URL copiada al portapapeles');
      setTimeout(() => {
        setCopiedKey(prev => (prev === key ? null : prev));
      }, 2000);
    } else {
      showNotification('Error al copiar al portapapeles');
    }
  };

  const copyAllLinks = async (type: 'all' | 'lat' | 'cast' | 'sub') => {
    let links = '';
    let label = '';

    if (type === 'all') {
      links = results
        .flatMap(r => [r.lat, r.cast, r.sub])
        .filter((l): l is string => Boolean(l && l.trim()))
        .join('\n');
      label = 'todos los enlaces';
    } else {
      links = results
        .map(r => r[type])
        .filter((l): l is string => Boolean(l && l.trim()))
        .join('\n');
      label = `enlaces ${type.toUpperCase()}`;
    }

    if (links) {
      await handleCopy(links, `all-${type}`, `Todos los ${label} copiados`);
    } else {
      showNotification(`No hay ${label} disponibles`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-md shadow-lg flex items-center gap-2 z-50">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <span className="text-sm">{notification}</span>
        </div>
      )}

      <div className="mb-8 flex items-center gap-3">
        <PlayCircle className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción Gnula</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Serie (Gnula)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://gnula.nu/series/..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temporada Específica
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={targetSeason}
                    onChange={(e) => setTargetSeason(e.target.value)}
                    placeholder="Opcional"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  />
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
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Servidor a Extraer
                  </label>
                  <select
                    value={serverType}
                    onChange={(e) => setServerType(e.target.value as 'bysevepoin' | 'voe' | 'vidsonic' | 'rpmplay' | 'p2pplay' | 'okru')}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  >
                    <option value="bysevepoin">Filemoon (bysevepoin)</option>
                    <option value="vidsonic">vidsonic.net</option>
                    <option value="rpmplay">dtpg.rpmplay.xyz</option>
                    <option value="p2pplay">gdtvid.p2pplay.pro</option>
                    <option value="okru">ok.ru</option>
                    <option value="voe">VOE (voe)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isScraping || !url}
                className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium mt-4"
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

        {/* Resultados */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Resultados ({results.length})
              </h2>
              {results.length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => copyAllLinks('all')}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-all shadow-sm ${
                      copiedKey === 'all-all'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                    title="Copiar todos los enlaces disponibles"
                  >
                    {copiedKey === 'all-all' ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>¡Copiados!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar Todos</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => copyAllLinks('lat')}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-all border ${
                      copiedKey === 'all-lat'
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                        : 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-800'
                    }`}
                    title="Copiar todos los enlaces Latinos"
                  >
                    {copiedKey === 'all-lat' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>¡LAT Copiados!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar LAT</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => copyAllLinks('cast')}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-all border ${
                      copiedKey === 'all-cast'
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                        : 'bg-red-50 hover:bg-red-100 border-red-200 text-red-800'
                    }`}
                    title="Copiar todos los enlaces Castellanos"
                  >
                    {copiedKey === 'all-cast' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>¡CAST Copiados!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar CAST</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => copyAllLinks('sub')}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-all border ${
                      copiedKey === 'all-sub'
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                        : 'bg-green-50 hover:bg-green-100 border-green-200 text-green-800'
                    }`}
                    title="Copiar todos los enlaces Subtitulados"
                  >
                    {copiedKey === 'all-sub' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>¡SUB Copiados!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar SUB</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {results.length === 0 && !isScraping && (
              <div className="flex flex-col items-center justify-center flex-1 min-h-[250px] text-gray-400">
                <AlertCircle className="h-12 w-12 mb-2 opacity-20" />
                <p>No hay resultados aún</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2 flex-1">
                {seasonSummaries.length > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-3">Temporadas detectadas</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {seasonSummaries.map((summary) => (
                        <div key={summary.season} className="bg-white border border-blue-100 rounded-md p-3">
                          <div className="text-sm font-semibold text-gray-900">Temporada {summary.season}</div>
                          <div className="text-xs text-gray-600 mt-1">
                            {summary.declaredCountText || 'Cantidad no indicada'}
                          </div>
                          <div className="text-xs text-blue-700 mt-1">
                            Episodios detectados: {summary.detectedEpisodes}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {results.map((res, idx) => (
                  <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
                      <h3 className="font-bold text-gray-800 text-base">
                        Temporada {res.season} - Episodio {res.episode}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          const epLinks = [res.lat, res.cast, res.sub].filter(Boolean).join('\n');
                          handleCopy(epLinks, `card-${idx}`, 'Enlaces del episodio copiados');
                        }}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                          copiedKey === `card-${idx}`
                            ? 'bg-emerald-100 text-emerald-800 font-medium'
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        }`}
                        title="Copiar todos los enlaces de este episodio"
                      >
                        {copiedKey === `card-${idx}` ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" />
                            <span>¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copiar Todo</span>
                          </>
                        )}
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      {res.lat && (
                        <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-gray-200 hover:border-blue-300 transition-colors">
                          <span className="font-semibold text-xs text-blue-800 bg-blue-100 px-2 py-1 rounded w-14 text-center shrink-0">LAT</span>
                          <a href={res.lat} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono" title={res.lat}>{res.lat}</a>
                          <button 
                            type="button"
                            onClick={() => handleCopy(res.lat!, `lat-${idx}`)} 
                            className={`p-1.5 rounded transition-all shrink-0 ${
                              copiedKey === `lat-${idx}`
                                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                                : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                            }`}
                            title="Copiar enlace Latino"
                          >
                            {copiedKey === `lat-${idx}` ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      )}
                      
                      {res.cast && (
                        <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-gray-200 hover:border-red-300 transition-colors">
                          <span className="font-semibold text-xs text-red-800 bg-red-100 px-2 py-1 rounded w-14 text-center shrink-0">CAST</span>
                          <a href={res.cast} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono" title={res.cast}>{res.cast}</a>
                          <button 
                            type="button"
                            onClick={() => handleCopy(res.cast!, `cast-${idx}`)} 
                            className={`p-1.5 rounded transition-all shrink-0 ${
                              copiedKey === `cast-${idx}`
                                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                                : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                            }`}
                            title="Copiar enlace Castellano"
                          >
                            {copiedKey === `cast-${idx}` ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      )}

                      {res.sub && (
                        <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-gray-200 hover:border-green-300 transition-colors">
                          <span className="font-semibold text-xs text-green-800 bg-green-100 px-2 py-1 rounded w-14 text-center shrink-0">SUB</span>
                          <a href={res.sub} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono" title={res.sub}>{res.sub}</a>
                          <button 
                            type="button"
                            onClick={() => handleCopy(res.sub!, `sub-${idx}`)} 
                            className={`p-1.5 rounded transition-all shrink-0 ${
                              copiedKey === `sub-${idx}`
                                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                                : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                            }`}
                            title="Copiar enlace Subtitulado"
                          >
                            {copiedKey === `sub-${idx}` ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
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
