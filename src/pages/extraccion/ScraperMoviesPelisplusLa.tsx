import { useState, useMemo, FormEvent } from 'react';
import {
  Search,
  Loader2,
  PlayCircle,
  AlertCircle,
  Terminal,
  Copy,
  Check,
  CheckCircle,
  Layers,
} from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import {
  PELISPLUS_LA_COPY_ALL_BUTTONS,
  PELISPLUS_LA_LANGUAGE_ROW_STYLES,
  PELISPLUS_LA_PRESET_SERVERS,
  PelisplusLaOption,
  PelisplusLaServerGroup,
  fetchPelisplusLaHtml,
  getExtraDetectedPelisplusLaServers,
  groupOptionsByServer,
  isPelisplusLaServerFilterActive,
  normalizePelisplusLaServerFilter,
  parsePelisplusLaHtml,
} from '@/lib/pelisplusLaUtils';

function collectGroupUrls(group: PelisplusLaServerGroup): string[] {
  return [
    ...group.lat,
    ...group.cast,
    ...group.sub,
    ...group.other.map((o) => o.url),
  ].filter(Boolean);
}

export default function ScraperMoviesPelisplusLa() {
  const [url, setUrl] = useState('');
  const [targetServer, setTargetServer] = useState('all');

  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [options, setOptions] = useState<PelisplusLaOption[]>([]);
  const [movieTitle, setMovieTitle] = useState('');
  const [detectedServers, setDetectedServers] = useState<string[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const addLog = (msg: string, isError = false) => {
    setLogs((prev) => [...prev, { msg, isError }]);
  };

  const results: PelisplusLaServerGroup[] = useMemo(() => {
    return groupOptionsByServer(options, movieTitle, targetServer);
  }, [options, movieTitle, targetServer]);

  const extraDetectedServers = useMemo(
    () => getExtraDetectedPelisplusLaServers(detectedServers),
    [detectedServers]
  );

  const serverOptionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const opt of options) {
      if (!opt.serverName) continue;
      counts.set(opt.serverName, (counts.get(opt.serverName) || 0) + 1);
    }
    return counts;
  }, [options]);

  const hasCustomSelectedServer = useMemo(() => {
    const current = targetServer.trim().toLowerCase();
    if (!current || current === 'all') return false;
    const inPresets = PELISPLUS_LA_PRESET_SERVERS.some((s) => s.value.toLowerCase() === current);
    const inExtra = extraDetectedServers.some((s) => s.toLowerCase() === current);
    return !inPresets && !inExtra;
  }, [targetServer, extraDetectedServers]);

  const handleScrape = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const targetUrl = url.trim();
    if (!targetUrl) return;

    setIsScraping(true);
    setLogs([]);
    setOptions([]);
    setMovieTitle('');
    setDetectedServers([]);

    try {
      addLog(`Iniciando petición a: ${targetUrl}`);
      const html = await fetchPelisplusLaHtml(targetUrl);
      addLog(`HTML descargado: ${html.length} caracteres`);

      const parsed = parsePelisplusLaHtml(html, targetUrl);
      if (parsed.title) {
        setMovieTitle(parsed.title);
        addLog(`Película detectada: ${parsed.title}`);
      }

      if (parsed.detectedLanguages.length > 0) {
        addLog(`Idiomas encontrados: ${parsed.detectedLanguages.join(', ')}`);
      }

      if (parsed.detectedServers.length > 0) {
        addLog(
          `Servidores detectados (${parsed.detectedServers.length}): ${parsed.detectedServers.join(', ')}`
        );
      }

      if (parsed.options.length === 0) {
        addLog('No se encontraron enlaces en el reproductor (<div class="player"> / #link_url).', true);
        throw new Error('No se encontraron enlaces en el reproductor');
      }

      addLog(`Opciones extraídas en el reproductor: ${parsed.options.length}`);
      for (const opt of parsed.options) {
        const langTag = opt.languageKey ? opt.languageKey.toUpperCase() : opt.languageLabel || 'OTRO';
        addLog(`[${langTag}] ${opt.serverName} -> ${opt.formattedUrl}`);
      }

      setOptions(parsed.options);
      setDetectedServers(parsed.detectedServers);

      const grouped = groupOptionsByServer(parsed.options, parsed.title, targetServer);
      if (grouped.length === 0) {
        addLog(`Ningún enlace coincide con el servidor seleccionado ('${targetServer}').`, true);
      } else {
        addLog('Extracción finalizada exitosamente.');
      }
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

  const copyAllLinks = async (type: 'all' | 'lat' | 'cast' | 'sub') => {
    let links = '';
    let label = '';

    if (type === 'all') {
      links = results.flatMap(collectGroupUrls).join('\n');
      label = 'todos los enlaces';
    } else {
      links = results
        .flatMap((r) => r[type])
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
        <h1 className="text-3xl font-bold text-gray-900">Extracción PelisplusHD.la (Movies)</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Película (PelisplusHD.la)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://pelisplushd.la/pelicula/insecta"
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

              <button
                type="submit"
                disabled={isScraping || !url.trim()}
                className="w-full bg-red-600 text-white px-4 py-2.5 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium mt-4 transition-colors"
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

            {/* Filtros Rápidos post-extracción */}
            {options.length > 0 && detectedServers.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-red-600" />
                    Filtro Rápido
                  </span>
                  {movieTitle && (
                    <span className="text-xs font-semibold text-gray-700 truncate max-w-[190px]">
                      {movieTitle}
                    </span>
                  )}
                </div>

                <div>
                  <span className="block text-xs text-gray-500 mb-1">
                    Servidores detectados ({detectedServers.length}):
                  </span>
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
                      Todos ({options.length})
                    </button>
                    {detectedServers.map((srv) => {
                      const normalizedTarget = normalizePelisplusLaServerFilter(srv);
                      const isActive = isPelisplusLaServerFilterActive(targetServer, srv);
                      const count = serverOptionCounts.get(srv) || 0;
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
                          {srv} ({count})
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

        {/* Resultados */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Resultados ({results.length} {results.length === 1 ? 'servidor' : 'servidores'})
                </h2>
                {targetServer === 'all' && detectedServers.length > 1 && results.length > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Tip: selecciona un servidor en Filtro Rápido para filtrar los enlaces.
                  </p>
                )}
              </div>
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

            {results.length === 0 && !isScraping && (
              <div className="flex flex-col items-center justify-center flex-1 min-h-[250px] text-gray-400 text-center px-4">
                <AlertCircle className="h-12 w-12 mb-2 opacity-20" />
                {options.length > 0 ? (
                  <>
                    <p className="text-gray-500">
                      Ningún enlace coincide con el servidor &quot;{targetServer}&quot;.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTargetServer('all')}
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

            {results.length > 0 && (
              <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2 flex-1">
                {results.map((res, idx) => (
                  <div key={res.server} className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
                      <h3 className="font-bold text-gray-800 text-base flex flex-wrap items-center gap-2">
                        <span>Enlaces de la Película</span>
                        <span className="text-xs font-semibold bg-red-100 text-red-800 px-2 py-0.5 rounded uppercase">
                          {res.server}
                        </span>
                        {res.title && (
                          <span className="text-sm font-normal text-gray-600 truncate max-w-xs">
                            ({res.title})
                          </span>
                        )}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          const movieLinks = collectGroupUrls(res).join('\n');
                          handleCopy(movieLinks, `card-${idx}`, 'Enlaces de la película copiados');
                        }}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                          copiedKey === `card-${idx}`
                            ? 'bg-emerald-100 text-emerald-800 font-medium'
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        }`}
                        title="Copiar todos los enlaces de este servidor"
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
                      {PELISPLUS_LA_LANGUAGE_ROW_STYLES.map((lang) =>
                        res[lang.key].map((linkUrl, linkIdx) => {
                          const keyId = `${lang.key}-${idx}-${linkIdx}`;
                          return (
                            <div
                              key={keyId}
                              className={`flex items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-gray-200 ${lang.rowHoverClass} transition-colors`}
                            >
                              <span
                                className={`font-semibold text-xs ${lang.badgeClass} px-2 py-1 rounded w-14 text-center shrink-0`}
                              >
                                {lang.badge}
                              </span>
                              <a
                                href={linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono"
                                title={linkUrl}
                              >
                                {linkUrl}
                              </a>
                              <button
                                type="button"
                                onClick={() => handleCopy(linkUrl, keyId, lang.copyToast)}
                                className={`p-1.5 rounded transition-all shrink-0 ${
                                  copiedKey === keyId
                                    ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                                    : `text-gray-500 ${lang.btnHoverClass}`
                                }`}
                                title={lang.copyTitle}
                              >
                                {copiedKey === keyId ? (
                                  <Check className="h-4 w-4 text-emerald-600" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          );
                        })
                      )}

                      {res.other.map((extra, extraIdx) => {
                        const keyId = `other-${idx}-${extraIdx}`;
                        return (
                          <div
                            key={keyId}
                            className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-gray-200 hover:border-gray-300 transition-colors"
                          >
                            <span
                              className="font-semibold text-xs text-gray-800 bg-gray-100 px-2 py-1 rounded max-w-28 truncate text-center shrink-0"
                              title={extra.label}
                            >
                              {extra.label}
                            </span>
                            <a
                              href={extra.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono"
                              title={extra.url}
                            >
                              {extra.url}
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCopy(extra.url, keyId, 'URL copiada al portapapeles')}
                              className={`p-1.5 rounded transition-all shrink-0 ${
                                copiedKey === keyId
                                  ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                              }`}
                              title="Copiar enlace"
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
