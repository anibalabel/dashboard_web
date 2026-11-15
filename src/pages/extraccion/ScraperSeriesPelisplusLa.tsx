import { useState, useMemo, useRef, FormEvent } from 'react';
import {
  Search,
  Loader2,
  PlayCircle,
  AlertCircle,
  Terminal,
  Copy,
  Check,
  CheckCircle,
  Square,
  Layers,
} from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import {
  PELISPLUS_LA_COPY_ALL_BUTTONS,
  PELISPLUS_LA_LANGUAGE_ROW_STYLES,
  PELISPLUS_LA_PRESET_SERVERS,
  PelisplusLaEpisodeLink,
  PelisplusLaOption,
  detectPelisplusLaDirectEpisode,
  fetchPelisplusLaHtml,
  getExtraDetectedPelisplusLaServers,
  isPelisplusLaServerFilterActive,
  matchesPelisplusLaServer,
  normalizePelisplusLaServerFilter,
  parsePelisplusLaHtml,
  parsePelisplusLaSeriesPage,
} from '@/lib/pelisplusLaUtils';

interface ScrapedEpisodeEntry {
  season: number;
  episode: number;
  url: string;
  options: PelisplusLaOption[];
}

const LANG_STYLE_BY_KEY = Object.fromEntries(
  PELISPLUS_LA_LANGUAGE_ROW_STYLES.map((item) => [item.key, item])
);

function getOptionRowStyle(opt: PelisplusLaOption) {
  if (opt.languageKey && LANG_STYLE_BY_KEY[opt.languageKey]) {
    return LANG_STYLE_BY_KEY[opt.languageKey];
  }
  return {
    badge: opt.languageLabel || 'OTRO',
    copyTitle: 'Copiar enlace',
    copyToast: 'URL copiada al portapapeles',
    rowHoverClass: 'hover:border-gray-300',
    badgeClass: 'text-gray-800 bg-gray-100',
    btnHoverClass: 'hover:text-gray-700 hover:bg-gray-100',
  };
}

export default function ScraperSeriesPelisplusLa() {
  const [url, setUrl] = useState('');
  const [targetSeason, setTargetSeason] = useState('');
  const [limit, setLimit] = useState('');
  const [targetServer, setTargetServer] = useState('all');

  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [seriesTitle, setSeriesTitle] = useState('');
  const [scrapedEpisodes, setScrapedEpisodes] = useState<ScrapedEpisodeEntry[]>([]);
  const [detectedServers, setDetectedServers] = useState<string[]>([]);
  const [quickSeasonFilter, setQuickSeasonFilter] = useState<'all' | number>('all');

  const [notification, setNotification] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const addLog = (msg: string, isError = false) => {
    setLogs((prev) => [...prev, { msg, isError }]);
  };

  const extraDetectedServers = useMemo(
    () => getExtraDetectedPelisplusLaServers(detectedServers),
    [detectedServers]
  );

  const hasCustomSelectedServer = useMemo(() => {
    const current = targetServer.trim().toLowerCase();
    if (!current || current === 'all') return false;
    const inPresets = PELISPLUS_LA_PRESET_SERVERS.some((s) => s.value.toLowerCase() === current);
    const inExtra = extraDetectedServers.some((s) => s.toLowerCase() === current);
    return !inPresets && !inExtra;
  }, [targetServer, extraDetectedServers]);

  const availableSeasons = useMemo(() => {
    const counts = new Map<number, number>();
    for (const ep of scrapedEpisodes) {
      counts.set(ep.season, (counts.get(ep.season) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([season, count]) => ({ season, count }));
  }, [scrapedEpisodes]);

  const filteredResults = useMemo(() => {
    return scrapedEpisodes
      .filter((ep) => quickSeasonFilter === 'all' || ep.season === quickSeasonFilter)
      .map((ep) => ({
        ...ep,
        options: ep.options.filter((opt) => matchesPelisplusLaServer(opt, targetServer)),
      }))
      .filter((ep) => ep.options.length > 0);
  }, [scrapedEpisodes, quickSeasonFilter, targetServer]);

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleScrape = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanUrl = url.split('#')[0].trim();
    if (!cleanUrl) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsScraping(true);
    setLogs([]);
    setSeriesTitle('');
    setScrapedEpisodes([]);
    setDetectedServers([]);
    setQuickSeasonFilter('all');

    try {
      addLog(`Iniciando petición a: ${cleanUrl}`);
      let epLinks: PelisplusLaEpisodeLink[] = [];
      let detectedTitle = '';

      const directEp = detectPelisplusLaDirectEpisode(cleanUrl);
      if (directEp) {
        epLinks = [directEp];
        addLog(`URL directa de episodio detectada: S${directEp.season}xE${directEp.episode}`);
      } else {
        const seriesHtml = await fetchPelisplusLaHtml(cleanUrl, cleanUrl, controller.signal);
        addLog(`HTML principal descargado: ${seriesHtml.length} caracteres`);

        const parsedSeries = parsePelisplusLaSeriesPage(seriesHtml, cleanUrl);
        detectedTitle = parsedSeries.title;
        epLinks = parsedSeries.episodes;

        if (detectedTitle) {
          setSeriesTitle(detectedTitle);
          addLog(`Serie detectada: ${detectedTitle}`);
        }

        if (parsedSeries.seasons.length > 0) {
          addLog(
            `Temporadas encontradas: ${parsedSeries.seasons.join(', ')} (${epLinks.length} episodios en total)`
          );
        }
      }

      if (epLinks.length === 0) {
        addLog('No se encontraron episodios en la página de la serie.', true);
        throw new Error('No se encontraron episodios');
      }

      let queue = epLinks;
      if (targetSeason.trim()) {
        const seasonNum = Number(targetSeason);
        queue = queue.filter((ep) => ep.season === seasonNum);
        addLog(`Filtrado por Temporada ${seasonNum}: ${queue.length} episodios.`);
      }

      if (limit.trim()) {
        const limitNum = Number(limit);
        if (limitNum > 0) {
          queue = queue.slice(0, limitNum);
          addLog(`Límite aplicado: ${queue.length} episodios.`);
        }
      }

      if (queue.length === 0) {
        addLog('No hay episodios para procesar con los filtros seleccionados.', true);
        return;
      }

      addLog(`Procesando ${queue.length} episodios...`);
      const serverSet = new Set<string>();

      for (let i = 0; i < queue.length; i++) {
        if (controller.signal.aborted) break;

        const ep = queue[i];
        addLog(`[${i + 1}/${queue.length}] Procesando S${ep.season}xE${ep.episode}...`);

        try {
          const epHtml = await fetchPelisplusLaHtml(ep.url, cleanUrl, controller.signal);
          const parsedEp = parsePelisplusLaHtml(epHtml, ep.url);

          if (!detectedTitle && parsedEp.title) {
            detectedTitle = parsedEp.title.split(':')[0].trim();
            setSeriesTitle(detectedTitle);
          }

          if (parsedEp.options.length === 0) {
            addLog(`S${ep.season}xE${ep.episode}: no se encontraron enlaces en el reproductor.`, true);
            continue;
          }

          for (const srv of parsedEp.detectedServers) {
            serverSet.add(srv);
          }
          setDetectedServers(Array.from(serverSet));

          const entry: ScrapedEpisodeEntry = {
            season: ep.season,
            episode: ep.episode,
            url: ep.url,
            options: parsedEp.options,
          };
          setScrapedEpisodes((prev) => [...prev, entry]);

          const matchedCount = parsedEp.options.filter((opt) =>
            matchesPelisplusLaServer(opt, targetServer)
          ).length;
          addLog(
            `S${ep.season}xE${ep.episode}: ${parsedEp.options.length} opciones (${parsedEp.detectedServers.join(', ')})${
              targetServer !== 'all' ? ` | ${matchedCount} coinciden con ${targetServer}` : ''
            }`
          );
        } catch (epErr) {
          if (controller.signal.aborted) break;
          addLog(
            `Error en S${ep.season}xE${ep.episode}: ${
              epErr instanceof Error ? epErr.message : 'Error desconocido'
            }`,
            true
          );
        }

        if (i < queue.length - 1 && !controller.signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      if (controller.signal.aborted) {
        addLog('Extracción detenida por el usuario (se conservan los episodios ya extraídos).');
      } else {
        addLog('Extracción finalizada exitosamente.');
      }
    } catch (error) {
      if (controller.signal.aborted) {
        addLog('Extracción detenida por el usuario.');
      } else {
        addLog(
          `Error crítico: ${error instanceof Error ? error.message : 'No se pudo completar la extracción'}`,
          true
        );
      }
    } finally {
      abortControllerRef.current = null;
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

  const copyAllLinks = async (type: 'all' | 'lat' | 'cast' | 'sub') => {
    let links = '';
    let label = '';

    if (type === 'all') {
      links = filteredResults
        .flatMap((ep) => ep.options.map((opt) => opt.formattedUrl))
        .filter(Boolean)
        .join('\n');
      label = 'todos los enlaces';
    } else {
      links = filteredResults
        .flatMap((ep) =>
          ep.options.filter((opt) => opt.languageKey === type).map((opt) => opt.formattedUrl)
        )
        .filter(Boolean)
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
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 relative">
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2.5 border border-gray-700 animate-fade-in-down">
          <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{notification}</span>
        </div>
      )}

      <div className="mb-8 flex items-center gap-3">
        <PlayCircle className="h-8 w-8 text-red-600" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción PelisplusHD.la (Series)</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario y filtros */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Serie o Episodio (PelisplusHD.la)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://pelisplushd.la/serie/nos-conocimos-en-estambul"
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 border p-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Servidor a extraer / filtrar
                </label>
                <select
                  value={targetServer}
                  onChange={(e) => setTargetServer(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 border p-2 bg-white text-gray-800"
                >
                  {PELISPLUS_LA_PRESET_SERVERS.map((srv) => (
                    <option key={srv.value} value={srv.value}>
                      {srv.label}
                    </option>
                  ))}
                  {extraDetectedServers.map((srv) => (
                    <option key={srv} value={srv}>
                      {srv} (Detectado)
                    </option>
                  ))}
                  {hasCustomSelectedServer && (
                    <option key={targetServer} value={targetServer}>
                      {targetServer}
                    </option>
                  )}
                </select>
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
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 border p-2"
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
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 border p-2"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  type="submit"
                  disabled={isScraping || !url.trim()}
                  className="flex-1 bg-red-600 text-white px-4 py-2.5 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium transition-colors"
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
                {isScraping && (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="bg-gray-800 text-white px-4 py-2.5 rounded-md hover:bg-gray-900 flex items-center justify-center gap-1.5 font-medium transition-colors"
                    title="Detener extracción"
                  >
                    <Square className="h-4 w-4 fill-current" />
                    Detener
                  </button>
                )}
              </div>
            </form>

            {/* Filtros Rápidos post-extracción */}
            {scrapedEpisodes.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-red-600" />
                    Filtro Rápido
                  </span>
                  {seriesTitle && (
                    <span className="text-xs font-semibold text-gray-700 truncate max-w-[190px]">
                      {seriesTitle}
                    </span>
                  )}
                </div>

                {availableSeasons.length > 1 && (
                  <div>
                    <span className="block text-xs text-gray-500 mb-1">Temporada:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setQuickSeasonFilter('all')}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          quickSeasonFilter === 'all'
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        Todas ({scrapedEpisodes.length})
                      </button>
                      {availableSeasons.map((s) => (
                        <button
                          key={s.season}
                          type="button"
                          onClick={() => setQuickSeasonFilter(s.season)}
                          className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                            quickSeasonFilter === s.season
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          T{s.season} ({s.count})
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {detectedServers.length > 0 && (
                  <div>
                    <span className="block text-xs text-gray-500 mb-1">Servidor:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTargetServer('all')}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          targetServer === 'all'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        Todos
                      </button>
                      {detectedServers.map((srv) => {
                        const normalizedTarget = normalizePelisplusLaServerFilter(srv);
                        const isActive = isPelisplusLaServerFilterActive(targetServer, srv);
                        return (
                          <button
                            key={srv}
                            type="button"
                            onClick={() => setTargetServer(normalizedTarget)}
                            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                              isActive
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

        {/* Resultados */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Resultados ({filteredResults.length} episodios)
                </h2>
                {targetServer === 'all' && detectedServers.length > 1 && filteredResults.length > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Tip: selecciona un servidor en Filtro Rápido para copiar 1 enlace por episodio.
                  </p>
                )}
              </div>
              {filteredResults.length > 0 && (
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

                  {PELISPLUS_LA_COPY_ALL_BUTTONS.map((btn) => (
                    <button
                      key={btn.type}
                      type="button"
                      onClick={() => copyAllLinks(btn.type)}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-all border ${
                        copiedKey === `all-${btn.type}`
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                          : btn.idleClass
                      }`}
                      title={btn.title}
                    >
                      {copiedKey === `all-${btn.type}` ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{btn.copiedLabel}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>{btn.label}</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {filteredResults.length === 0 && !isScraping && (
              <div className="flex flex-col items-center justify-center flex-1 min-h-[250px] text-gray-400 text-center px-4">
                <AlertCircle className="h-12 w-12 mb-2 opacity-20" />
                {scrapedEpisodes.length > 0 ? (
                  <>
                    <p className="text-gray-500">
                      Ningún episodio coincide con los filtros actuales.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetServer('all');
                        setQuickSeasonFilter('all');
                      }}
                      className="mt-3 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded transition-colors"
                    >
                      Mostrar todos los servidores detectados ({detectedServers.length})
                    </button>
                  </>
                ) : (
                  <p>No hay resultados aún</p>
                )}
              </div>
            )}

            {filteredResults.length > 0 && (
              <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2 flex-1">
                {filteredResults.map((ep, idx) => (
                  <div
                    key={`${ep.season}x${ep.episode}`}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
                      <h3 className="font-bold text-gray-800 text-base">
                        Temporada {ep.season} - Episodio {ep.episode}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          const epLinks = ep.options.map((o) => o.formattedUrl).filter(Boolean).join('\n');
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
                      {ep.options.map((opt, optIdx) => {
                        const style = getOptionRowStyle(opt);
                        const keyId = `ep-${idx}-${optIdx}`;
                        return (
                          <div
                            key={keyId}
                            className={`flex items-center justify-between gap-2.5 bg-white p-2.5 rounded-md border border-gray-200 ${style.rowHoverClass} transition-colors`}
                          >
                            <span
                              className={`font-semibold text-xs ${style.badgeClass} px-2 py-1 rounded w-14 text-center shrink-0 truncate`}
                              title={opt.languageLabel || style.badge}
                            >
                              {style.badge}
                            </span>
                            <span className="text-[11px] font-semibold uppercase bg-gray-100 text-gray-700 px-2 py-1 rounded shrink-0">
                              {opt.serverName}
                            </span>
                            <a
                              href={opt.formattedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono"
                              title={opt.formattedUrl}
                            >
                              {opt.formattedUrl}
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCopy(opt.formattedUrl, keyId, style.copyToast)}
                              className={`p-1.5 rounded transition-all shrink-0 ${
                                copiedKey === keyId
                                  ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                                  : `text-gray-500 ${style.btnHoverClass}`
                              }`}
                              title={style.copyTitle}
                            >
                              {copiedKey === keyId ? (
                                <Check className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        );
                      })}
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
