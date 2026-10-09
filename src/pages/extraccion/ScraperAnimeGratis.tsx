import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, AlertCircle, Terminal, Copy, CheckCircle, Check } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDoodstreamUrl } from '@/lib/doodstreamUtils';

interface ScrapedResult {
  episodeName?: string;
  url?: string;
  serverName: string;
  language: string;
}

interface EpisodeLink {
  name: string;
  url: string;
}

export default function ScraperAnimeGratis() {
  const [url, setUrl] = useState('');
  const [targetLang, setTargetLang] = useState('TODOS');
  const [targetServer, setTargetServer] = useState('TODOS');
  
  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [results, setResults] = useState<ScrapedResult[]>([]);

  const addLog = (msg: string, isError = false) => {
    setLogs(prev => [...prev, { msg, isError }]);
  };

  const fetchHTML = async (targetUrl: string, refererUrl?: string) => {
    let proxy = `/proxy.php?url=${encodeURIComponent(targetUrl)}`;
    if (refererUrl) {
      proxy += `&referer=${encodeURIComponent(refererUrl)}`;
    }
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
      addLog(`Iniciando petición a: ${url}`);
      
      let html = '';
      try {
        const directRes = await fetch(url);
        if (directRes.ok) {
           html = await directRes.text();
           addLog(`Fetch directo exitoso`);
        } else {
           throw new Error('Direct fetch failed');
        }
      } catch {
        addLog(`Usando proxy para evadir CORS...`);
        html = await fetchHTML(url);
      }
      
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch) {
        addLog(`TÍTULO DE LA PÁGINA: ${titleMatch[1]}`);
      }
      
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const episodesToProcess: EpisodeLink[] = [];

      addLog(`Buscando lista de episodios...`);
      const episodeGrid = doc.getElementById('episodes-grid');
      if (episodeGrid) {
        const links = Array.from(episodeGrid.querySelectorAll('a[href*="/episodio-"]'));
        const uniqueUrls = new Set<string>();

        links.forEach(a => {
          const href = a.getAttribute('href');
          if (href && !uniqueUrls.has(href)) {
            uniqueUrls.add(href);
            const fullUrl = href.startsWith('http') ? href : new URL(href, url).href;
            const epNum = a.getAttribute('data-episode') || '';
            const epName = epNum ? `Episodio ${epNum}` : a.textContent?.trim() || 'Episodio';
            episodesToProcess.push({ name: epName, url: fullUrl });
          }
        });
      }

      if (episodesToProcess.length === 0) {
        // Intentar una búsqueda más genérica si falló el id
        const links = Array.from(doc.querySelectorAll('a[href*="/episodio-"]'));
        links.forEach(a => {
          const href = a.getAttribute('href');
          if (href) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, url).href;
            if (!episodesToProcess.find(e => e.url === fullUrl)) {
              episodesToProcess.push({ name: a.textContent?.trim() || 'Episodio', url: fullUrl });
            }
          }
        });
      }

      addLog(`Se encontraron ${episodesToProcess.length} episodios válidos.`);

      const finalResults: ScrapedResult[] = [];

      for (const ep of episodesToProcess) {
        addLog(`Procesando ${ep.name}...`);
        
        let epHtml = '';
        try {
          const res = await fetch(ep.url);
          if (res.ok) epHtml = await res.text();
          else throw new Error('Proxy fail');
        } catch {
          epHtml = await fetchHTML(ep.url);
        }

        const epDoc = new DOMParser().parseFromString(epHtml, 'text/html');
        const serverButtons = Array.from(epDoc.querySelectorAll('button.server-btn'));
        
        let foundAny = false;
        for (const btn of serverButtons) {
          const serverName = btn.getAttribute('data-server') || '';
          const videoUrl = btn.getAttribute('data-url') || '';
          const lang = btn.getAttribute('data-lang-group') || '';

          const langMatches = targetLang === 'TODOS' || lang.toLowerCase() === targetLang.toLowerCase();
          const serverMatches = targetServer === 'TODOS' || serverName.toUpperCase() === targetServer.toUpperCase();

          if (langMatches && serverMatches && videoUrl) {
            const formattedUrl = formatDoodstreamUrl(videoUrl, serverName);
            finalResults.push({
              episodeName: ep.name,
              serverName: serverName,
              url: formattedUrl,
              language: lang
            });
            addLog(`  -> [${lang.toUpperCase()}] ${serverName}: ${formattedUrl}`);
            foundAny = true;
          }
        }

        if (!foundAny) {
          addLog(`  [!] No se encontraron servidores con los filtros aplicados`, true);
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

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {notification && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-md shadow-lg flex items-center gap-2 z-50">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <span className="text-sm">{notification}</span>
        </div>
      )}

      <div className="mb-8 flex items-center gap-3">
        <PlayCircle className="h-8 w-8 text-indigo-600" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción AnimeGratis.net</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL del Anime (animegratis.net)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://animegratis.net/anime/..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Idioma
                  </label>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2 bg-white"
                  >
                    <option value="TODOS">Todos</option>
                    <option value="lat">Latino</option>
                    <option value="cast">Castellano</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Servidor
                  </label>
                  <select
                    value={targetServer}
                    onChange={(e) => setTargetServer(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2 bg-white"
                  >
                    <option value="TODOS">Todos</option>
                    <option value="EARNVIDS">EarnVids</option>
                    <option value="DOODSTREAM">Doodstream</option>
                    <option value="MEGA">Mega</option>
                    <option value="STREAMTAPE">Streamtape</option>
                    <option value="STREAMWISH">Streamwish</option>
                    <option value="VOE">Voe</option>
                    <option value="MAILRU">Mailru</option>
                    <option value="HLS">HLS</option>
                    <option value="BYSE">Byse</option>
                    <option value="UQLOAD">Uqload</option>
                    <option value="UPNSHARE">Upnshare</option>
                    <option value="MP4UPLOAD">Mp4upload</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isScraping || !url}
                className="w-full bg-indigo-600 text-white px-4 py-2.5 rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium mt-4 transition-colors shadow-sm"
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

          <div className="bg-slate-900 rounded-lg shadow-sm border border-slate-800 p-4 h-64 flex flex-col">
            <div className="flex items-center gap-2 mb-2 text-slate-400 border-b border-slate-800 pb-2">
              <Terminal className="h-4 w-4" />
              <h3 className="text-sm font-medium uppercase tracking-wider">Console</h3>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-1 pr-2 custom-scrollbar">
              {logs.length === 0 && <span className="text-slate-600">Waiting for start...</span>}
              {logs.map((log, i) => (
                <div key={i} className={`${log.isError ? 'text-rose-400' : 'text-emerald-400'} flex gap-2`}>
                  <span className="opacity-50 select-none tracking-tighter">[{new Date().toLocaleTimeString([], {hour12: false})}]</span>
                  <span className="break-all">{log.msg}</span>
                </div>
              ))}
              {isScraping && (
                <div className="text-sky-400 flex gap-2 animate-pulse">
                  <span className="opacity-50 select-none tracking-tighter">[{new Date().toLocaleTimeString([], {hour12: false})}]</span>
                  <span>Processing_</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full flex flex-col">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2 flex justify-between items-center">
              <span>Resultados ({results.length})</span>
              {results.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const allLinks = results.map(r => r.url).filter(Boolean).join('\n');
                    handleCopy(allLinks, 'all', 'Todos los enlaces copiados');
                  }}
                  className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-all border ${
                    copiedKey === 'all'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-100'
                  }`}
                >
                  {copiedKey === 'all' ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>¡Copiados!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar Todo</span>
                    </>
                  )}
                </button>
              )}
            </h2>

            {results.length === 0 && !isScraping && (
              <div className="flex flex-col items-center justify-center flex-1 text-gray-400 py-12">
                <AlertCircle className="h-12 w-12 mb-2 opacity-20" />
                <p>No hay resultados aún</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                {Array.from(new Set(results.map(r => r.episodeName))).map(epName => (
                  <div key={epName} className="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-3 text-base border-b border-slate-200 pb-2">
                      {epName}
                    </h3>
                    <div className="space-y-2">
                      {results.filter(r => r.episodeName === epName).map((res, idx) => {
                        const itemKey = `${epName}-${idx}`;
                        const isCopied = copiedKey === itemKey;
                        return (
                          <div key={idx} className="flex items-center justify-between gap-4 bg-white p-2 rounded-md border border-slate-100 group hover:border-indigo-200 transition-colors shadow-sm">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded uppercase ${
                                res.language === 'lat' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                              }`}>
                                {res.language}
                              </span>
                              <span className="font-semibold text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase">
                                {res.serverName}
                              </span>
                              <a 
                                href={res.url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline truncate"
                                title={res.url}
                              >
                                {res.url}
                              </a>
                            </div>
                            <button 
                              type="button"
                              onClick={() => handleCopy(res.url!, itemKey)} 
                              className={`p-1.5 rounded-md transition-all ${
                                isCopied
                                  ? 'text-emerald-600 bg-emerald-50 opacity-100 ring-1 ring-emerald-300'
                                  : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100'
                              }`}
                              title="Copiar URL"
                            >
                              {isCopied ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
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
