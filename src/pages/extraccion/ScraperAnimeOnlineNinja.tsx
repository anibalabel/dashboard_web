import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, AlertCircle, Terminal, Copy, CheckCircle, Check } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDoodstreamUrl } from '@/lib/doodstreamUtils';
import { getProxyUrl } from '@/lib/proxy';

interface ScrapedResult {
  episodeName?: string;
  lat?: string | null;
  cast?: string | null;
  sub?: string | null;
  serverName: string;
}


interface EpisodeLink {
  name: string;
  url: string;
}

export default function ScraperAnimeOnlineNinja() {
  const [url, setUrl] = useState('');
  const [targetServer, setTargetServer] = useState('STREAMWISH');
  
  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [results, setResults] = useState<ScrapedResult[]>([]);

  const addLog = (msg: string, isError = false) => {
    setLogs(prev => [...prev, { msg, isError }]);
  };

  const fetchHTML = async (targetUrl: string, refererUrl?: string) => {
    const proxy = getProxyUrl(targetUrl, refererUrl ? { referer: refererUrl } : undefined);
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

    try {
      // 1. Lectura de la URL principal
      addLog(`Iniciando petición a: ${url}`);
      
      let html = '';
      html = await fetchHTML(url);
      
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch) {
        addLog(`TÍTULO DE LA PÁGINA: ${titleMatch[1]}`);
      }
      
      if (html.includes('cloudflare') || html.includes('Just a moment')) {
         addLog(`¡ALERTA! Posible bloqueo de Cloudflare detectado en AnimeOnlineNinja`);
      }
      
      const isDirectEpisode = url.includes('/episodio/');
      const episodesToProcess: EpisodeLink[] = [];
      
      if (isDirectEpisode) {
         episodesToProcess.push({ name: 'Episodio Único', url: url });
      } else {
         addLog(`Buscando enlaces de episodios en el HTML...`);
         const doc = new DOMParser().parseFromString(html, 'text/html');
         const links = Array.from(doc.querySelectorAll('a[href*="/episodio/"]'));
         
         const uniqueUrls = new Set<string>();
          links.forEach(a => {
             const href = a.getAttribute('href');
             if (href && !uniqueUrls.has(href)) {
                uniqueUrls.add(href);
                const fullUrl = href.startsWith('http') ? href : new URL(href, url).href;
                const epName = a.textContent?.trim() || href.split('/').filter(Boolean).pop() || 'Episodio';
                episodesToProcess.push({ name: epName, url: fullUrl });
             }
          });
         
         // AnimeOnline.Ninja a menudo muestra los episodios del más reciente al más antiguo.
         // Los invertimos para procesarlos en orden cronológico.
         episodesToProcess.reverse();
         addLog(`Se encontraron ${episodesToProcess.length} episodios válidos para procesar.`);
      }
      
      const finalResults: ScrapedResult[] = [];

      for (const ep of episodesToProcess) {
          if (!isDirectEpisode) {
              addLog(`Procesando ${ep.name}...`);
              html = await fetchHTML(ep.url);
          }

          try {
            // Buscar el iframe de saidochesto.top
            const iframeMatch = html.match(/<iframe[^>]+src=['"](https?:\/\/(?:www\.)?saidochesto\.top[^'"]+)['"]/i) || 
                                html.match(/['"](https?:\/\/(?:www\.)?saidochesto\.top[^'"]+)['"]/i);
            let embedUrl = '';
            
            if (iframeMatch) {
              embedUrl = iframeMatch[1];
            }

            if (!embedUrl) {
              addLog(`No se encontró iframe (saidochesto.top) en ${ep.name}`, true);
              continue;
            }

            addLog(`Obteniendo reproductor Saidochesto para ${ep.name}...`);
            
            // Petición al iframe
            const iframeHtml = await fetchHTML(embedUrl, ep.url);
            const doc = new DOMParser().parseFromString(iframeHtml, 'text/html');

            let latUrl = null;
            let castUrl = null;
            let subUrl = null;

            const matchesTargetServer = (spanText?: string | null) => {
              if (!spanText) return false;
              const s = spanText.trim().toUpperCase();
              const t = targetServer.trim().toUpperCase();
              if (s === t) return true;
              if (t === 'EARNVIDS' && (s.includes('EARN') || s.includes('SMOOTH'))) return true;
              if (t === 'STREAMWISH' && (s.includes('WISH') || s.includes('STREAMWISH'))) return true;
              return s.includes(t);
            };

            // Buscar contenedor Latino
            const latContainer = doc.querySelector('.OD_LAT');
            if (latContainer) {
                const servers = Array.from(latContainer.querySelectorAll('li'));
                for (const server of servers) {
                    const span = server.querySelector('span');
                    if (span && matchesTargetServer(span.textContent)) {
                        const onclick = server.getAttribute('onclick');
                        const match = onclick?.match(/go_to_player\(['"]([^'"]+)['"]\)/);
                        if (match) {
                            latUrl = match[1];
                            break;
                        }
                    }
                }
            }

            // Buscar contenedor Castellano (ES)
            const castContainer = doc.querySelector('.OD_ES');
            if (castContainer) {
                const servers = Array.from(castContainer.querySelectorAll('li'));
                for (const server of servers) {
                    const span = server.querySelector('span');
                    if (span && matchesTargetServer(span.textContent)) {
                        const onclick = server.getAttribute('onclick');
                        const match = onclick?.match(/go_to_player\(['"]([^'"]+)['"]\)/);
                        if (match) {
                            castUrl = match[1];
                            break;
                        }
                    }
                }
            }
            
            // Buscar contenedor Subtitulado (SUB)
            const subContainer = doc.querySelector('.OD_SUB') || doc.querySelector('.OD');
            if (subContainer && !latContainer?.contains(subContainer) && !castContainer?.contains(subContainer)) {
                 const servers = Array.from(subContainer.querySelectorAll('li'));
                 for (const server of servers) {
                     const span = server.querySelector('span');
                     if (span && matchesTargetServer(span.textContent)) {
                         const onclick = server.getAttribute('onclick');
                         const match = onclick?.match(/go_to_player\(['"]([^'"]+)['"]\)/);
                         if (match) {
                             subUrl = match[1];
                             break;
                         }
                     }
                 }
             }

            if (latUrl || castUrl || subUrl) {
              const formattedLat = formatDoodstreamUrl(latUrl, targetServer);
              const formattedCast = formatDoodstreamUrl(castUrl, targetServer);
              const formattedSub = formatDoodstreamUrl(subUrl, targetServer);
              finalResults.push({ episodeName: ep.name, lat: formattedLat, cast: formattedCast, sub: formattedSub, serverName: targetServer });
              addLog(`Éxito en ${ep.name} (${targetServer}) - LAT: ${!!formattedLat}, CAST: ${!!formattedCast}, SUB: ${!!formattedSub}`);
            } else {
              addLog(`No se encontraron videos válidos para '${targetServer}' en ${ep.name}`, true);
            }
          } catch (err) {
            addLog(`Error al procesar ${ep.name}: ${err instanceof Error ? err.message : 'Error desconocido'}`, true);
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
        <h1 className="text-3xl font-bold text-gray-900">Extracción AnimeOnline.Ninja</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Serie o Episodio (animeonline.ninja)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://ww3.animeonline.ninja/online/... o /episodio/..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Servidor a extraer
                </label>
                <select
                  value={targetServer}
                  onChange={(e) => setTargetServer(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 bg-white"
                >
                  <option value="STREAMWISH">Streamwish</option>
                  <option value="EARNVIDS">Earnvids</option>
                  <option value="UQLOAD">Uqload</option>
                  <option value="FILEMOON">Filemoon</option>
                  <option value="MP4UPLOAD">Mp4upload</option>
                  <option value="ZOPLAYER">ZOPlayer</option>
                </select>
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
                {results.map((res, idx) => (
                  <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
                      <h3 className="font-bold text-gray-800 text-base">
                        {res.episodeName || `Episodio ${idx + 1}`}
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
