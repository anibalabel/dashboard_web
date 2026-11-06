import { useState, useMemo, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, AlertCircle, Terminal, Copy, Check, CheckCircle } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDoodstreamUrl } from '@/lib/doodstreamUtils';
import { getProxyUrl } from '@/lib/proxy';

interface PlayLatinMovieSource {
  id: string;
  name: string;
  url: string;
  version?: string;
  embed?: boolean;
  kind?: string;
  rank?: number;
}

interface PlayLatinMovieResponse {
  ok?: boolean;
  type?: string;
  sources?: PlayLatinMovieSource[];
}

interface ScrapedResult {
  title?: string;
  server?: string;
  lat?: string | null;
  cast?: string | null;
  sub?: string | null;
}

function normalizeLangVersion(version?: string, sourceId?: string): 'lat' | 'cast' | 'sub' | null {
  const v = (version || '').trim().toLowerCase();
  const id = (sourceId || '').trim().toLowerCase();
  const combined = `${v} ${id}`;

  if (combined.includes('latino') || combined.includes('lat')) return 'lat';
  if (combined.includes('castellano') || combined.includes('cast') || combined.includes('españa') || combined.includes('espana')) return 'cast';
  if (combined.includes('subtitulado') || combined.includes('sub') || combined.includes('vose') || combined.includes('ingles')) return 'sub';
  return null;
}

function matchesPreferredServer(source: PlayLatinMovieSource, preferredServer: string): boolean {
  if (!preferredServer || preferredServer === 'all') return true;
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

  return name.includes(pref) || id.includes(pref) || link.includes(pref);
}

export default function ScraperMoviesCineHDPlus() {
  const [url, setUrl] = useState('');
  const [preferredServer, setPreferredServer] = useState<string>('dropload');

  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [rawSources, setRawSources] = useState<PlayLatinMovieSource[]>([]);
  const [movieTitle, setMovieTitle] = useState<string>('');
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
  ): Promise<PlayLatinMovieResponse> => {
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
    return (await res.json()) as PlayLatinMovieResponse;
  };

  const detectedServers = useMemo(() => {
    const set = new Set<string>();
    for (const s of rawSources) {
      if (s.name) set.add(s.name.trim());
    }
    return Array.from(set);
  }, [rawSources]);

  const results: ScrapedResult[] = useMemo(() => {
    if (rawSources.length === 0) return [];

    if (preferredServer === 'all') {
      // Agrupar por servidor (name)
      const byServer = new Map<string, ScrapedResult>();
      for (const src of rawSources) {
        if (!src.url) continue;
        const srvName = (src.name || 'Servidor').trim();
        const langKey = normalizeLangVersion(src.version, src.id);
        if (!langKey) continue;

        const cleanLink = formatDoodstreamUrl(
          src.url.startsWith('//') ? `https:${src.url}` : src.url,
          srvName
        );

        const existing = byServer.get(srvName) || {
          title: movieTitle,
          server: srvName,
          lat: null,
          cast: null,
          sub: null
        };

        if (!existing[langKey]) {
          existing[langKey] = cleanLink;
        }
        byServer.set(srvName, existing);
      }
      return Array.from(byServer.values()).filter((r) => Boolean(r.lat || r.cast || r.sub));
    }

    let latUrl: string | null = null;
    let castUrl: string | null = null;
    let subUrl: string | null = null;
    let matchedServerLabel = preferredServer;

    for (const src of rawSources) {
      if (!src.url) continue;
      if (!matchesPreferredServer(src, preferredServer)) continue;

      const langKey = normalizeLangVersion(src.version, src.id);
      if (!langKey) continue;

      const cleanLink = formatDoodstreamUrl(
        src.url.startsWith('//') ? `https:${src.url}` : src.url,
        src.name || ''
      );
      if (src.name) matchedServerLabel = src.name;

      if (langKey === 'lat' && !latUrl) latUrl = cleanLink;
      if (langKey === 'cast' && !castUrl) castUrl = cleanLink;
      if (langKey === 'sub' && !subUrl) subUrl = cleanLink;
    }

    if (!latUrl && !castUrl && !subUrl) return [];

    return [
      {
        title: movieTitle,
        server: matchedServerLabel,
        lat: latUrl,
        cast: castUrl,
        sub: subUrl
      }
    ];
  }, [rawSources, preferredServer, movieTitle]);

  const handleScrape = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsScraping(true);
    setLogs([]);
    setRawSources([]);
    setMovieTitle('');

    try {
      const targetUrl = url.trim();
      let iframeSrc = '';
      let extractedMovieId = '';
      let extractedTitle = '';

      if (/playlatinsrc\.co\/(?:custom\/)?movie\//i.test(targetUrl)) {
        iframeSrc = targetUrl;
        const m = targetUrl.match(/playlatinsrc\.co\/(?:custom\/)?movie\/([a-zA-Z0-9_-]+)/i);
        if (m?.[1]) extractedMovieId = m[1];
        addLog(`URL directa de PlayLatinSRC detectada: ${iframeSrc}`);
      } else {
        // 1. Lectura de la URL principal de CineHDPlus
        addLog(`Iniciando petición a: ${targetUrl}`);
        const html = await fetchHTML(targetUrl);
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const titleElem =
          doc.querySelector('h1.entry-title') ||
          doc.querySelector('.data h1') ||
          doc.querySelector('h1[itemprop="name"]') ||
          doc.querySelector('h1') ||
          doc.querySelector('meta[property="og:title"]');

        extractedTitle = titleElem
          ? titleElem.tagName === 'META'
            ? (titleElem as HTMLMetaElement).content
            : titleElem.textContent?.trim() || ''
          : '';

        // 2. Búsqueda de <iframe id="movie_iframe" src="https://playlatinsrc.co/movie/tt...">
        const movieIframe =
          doc.querySelector('iframe#movie_iframe') ||
          doc.querySelector('iframe[src*="playlatinsrc.co/movie/"]');

        const rawIframeSrc = movieIframe?.getAttribute('src')?.trim() || '';

        if (rawIframeSrc && rawIframeSrc.includes('playlatinsrc.co')) {
          iframeSrc = rawIframeSrc.startsWith('//')
            ? `https:${rawIframeSrc}`
            : rawIframeSrc.startsWith('http')
            ? rawIframeSrc
            : new URL(rawIframeSrc, targetUrl).href;
        } else {
          // En el HTML crudo, CineHDPlus asigna movie_iframe.src por script:
          // var imdb = 'tt34385135'; iframe.src = 'https://playlatinsrc.co/movie/' + imdb;
          const directPlayLatinMatch = html.match(/https?:\/\/playlatinsrc\.co\/movie\/([a-zA-Z0-9_-]+)/i);
          const scriptImdbMatch = html.match(/var\s+imdb\s*=\s*['"]([a-zA-Z0-9_-]+)['"]/i);
          const imdbLinkMatch = html.match(/imdb\.com\/title\/(tt\d+)/i);

          if (directPlayLatinMatch?.[1] && directPlayLatinMatch[1] !== "'") {
            extractedMovieId = directPlayLatinMatch[1];
            iframeSrc = `https://playlatinsrc.co/movie/${extractedMovieId}`;
          } else if (scriptImdbMatch?.[1]) {
            extractedMovieId = scriptImdbMatch[1];
            iframeSrc = `https://playlatinsrc.co/movie/${extractedMovieId}`;
          } else if (imdbLinkMatch?.[1]) {
            extractedMovieId = imdbLinkMatch[1];
            iframeSrc = `https://playlatinsrc.co/movie/${extractedMovieId}`;
          }
        }

        if (!iframeSrc) {
          addLog('No se encontró #movie_iframe ni el ID de PlayLatinSRC en la página.', true);
          throw new Error('Iframe movie_iframe (playlatinsrc.co) no encontrado');
        }

        if (!extractedMovieId) {
          const idFromSrc = iframeSrc.match(/playlatinsrc\.co\/(?:custom\/)?movie\/([a-zA-Z0-9_-]+)/i);
          if (idFromSrc?.[1]) extractedMovieId = idFromSrc[1];
        }

        addLog(`Iframe detectado: ${iframeSrc}`);
      }

      setMovieTitle(extractedTitle);

      // 3. Obtener HTML de playlatinsrc.co/movie/{id} para extraer el token dinámico
      addLog(`Obteniendo token desde: ${iframeSrc}`);
      const playerHtml = await fetchHTML(iframeSrc, targetUrl);

      const payloadMatch = playerHtml.match(
        /\{\s*type\s*:\s*['"]movie['"]\s*,\s*id\s*:\s*['"]([^'"]+)['"]\s*,\s*token\s*:\s*['"]([^'"]+)['"]\s*\}/i
      );
      const tokenMatch = playerHtml.match(/token\s*:\s*['"]([^'"]+)['"]/i);

      const finalType = 'movie';
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
      const finalId = payloadMatch?.[1] || tokenDecodedId || extractedMovieId;

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

      if (!apiData || !apiData.ok || !Array.isArray(apiData.sources)) {
        addLog('La respuesta de /api/embed-links no contiene fuentes válidas.', true);
        throw new Error('Respuesta inválida de /api/embed-links');
      }

      const validSources = apiData.sources.filter((s) => Boolean(s && s.url));
      setRawSources(validSources);

      const serversSummary = Array.from(new Set(validSources.map((s) => `${s.name} (${s.version || 'N/A'})`))).join(', ');
      addLog(`Se recibieron ${validSources.length} fuentes: ${serversSummary}`);
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
    const success = await copyToClipboard(text);
    if (success) {
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
      links = results
        .flatMap((r) => [r.lat, r.cast, r.sub])
        .filter((l): l is string => Boolean(l && l.trim()))
        .join('\n');
      label = 'todos los enlaces';
    } else {
      links = results
        .map((r) => r[type])
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
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 relative">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2.5 border border-gray-700 animate-fade-in-down">
          <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{notification}</span>
        </div>
      )}

      <div className="mb-8 flex items-center gap-3">
        <PlayCircle className="h-8 w-8 text-green-600" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción CineHDPlus (Movies)</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Película (CineHDPlus o PlayLatinSRC)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://cinehdplus.work/peliculas/25667-colony-ver-online-hd.html"
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Servidor a extraer
                </label>
                <select
                  value={preferredServer}
                  onChange={(e) => setPreferredServer(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2"
                >
                  <option value="dropload">DropLoad (dropload.io / dr0pstream.com)</option>
                  <option value="doodstream">Doodstream (doodstream.com)</option>
                  <option value="mixdrop">MixDrop (mixdrop.ag / mxdrop.to)</option>
                  <option value="all">Todos los servidores</option>
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
                {results.map((res, idx) => (
                  <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
                      <h3 className="font-bold text-gray-800 text-base flex flex-wrap items-center gap-2">
                        <span>🎬 Enlaces de la Película</span>
                        {res.server && (
                          <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                            {res.server}
                          </span>
                        )}
                        {res.title && (
                          <span className="text-sm font-normal text-gray-600 truncate max-w-xs">({res.title})</span>
                        )}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          const movieLinks = [res.lat, res.cast, res.sub].filter(Boolean).join('\n');
                          handleCopy(movieLinks, `card-${idx}`, 'Enlaces de la película copiados');
                        }}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                          copiedKey === `card-${idx}`
                            ? 'bg-emerald-100 text-emerald-800 font-medium'
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        }`}
                        title="Copiar todos los enlaces de esta tarjeta"
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
                          <span className="font-semibold text-xs text-blue-800 bg-blue-100 px-2 py-1 rounded w-14 text-center shrink-0">
                            LAT
                          </span>
                          <a
                            href={res.lat}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono"
                            title={res.lat}
                          >
                            {res.lat}
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopy(res.lat!, `lat-${idx}`, 'URL Latino copiada')}
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
                          <span className="font-semibold text-xs text-red-800 bg-red-100 px-2 py-1 rounded w-14 text-center shrink-0">
                            CAST
                          </span>
                          <a
                            href={res.cast}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono"
                            title={res.cast}
                          >
                            {res.cast}
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopy(res.cast!, `cast-${idx}`, 'URL Castellano copiada')}
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
                          <span className="font-semibold text-xs text-green-800 bg-green-100 px-2 py-1 rounded w-14 text-center shrink-0">
                            SUB
                          </span>
                          <a
                            href={res.sub}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono"
                            title={res.sub}
                          >
                            {res.sub}
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopy(res.sub!, `sub-${idx}`, 'URL Subtitulado copiada')}
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
