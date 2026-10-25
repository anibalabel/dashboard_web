import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, AlertCircle, Terminal, Copy, CheckCircle, Check } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDoodstreamUrl } from '@/lib/doodstreamUtils';

interface ScrapedResult {
  episodeName?: string;
  url?: string;
  serverName: string;
}

interface EpisodeLink {
  name: string;
  url: string;
}

export default function ScraperLatinoytAnime() {
  const [url, setUrl] = useState('');
  const [targetServer, setTargetServer] = useState('TODOS');
  const [ultimateSubServer, setUltimateSubServer] = useState('TODOS');
  
  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [results, setResults] = useState<ScrapedResult[]>([]);

  const addLog = (msg: string, isError = false) => {
    setLogs(prev => [...prev, { msg, isError }]);
  };

  const fetchHTML = async (targetUrl: string, refererUrl?: string) => {
    let proxy = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
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

  const decodeBase64 = (str: string) => {
    try {
      return atob(str);
    } catch (e) {
      console.error('Error decoding base64:', e);
      return '';
    }
  };

  const extractIframeSrc = (html: string) => {
    const match = html.match(/src="([^"]+)"/i) || html.match(/src='([^']+)'/i);
    return match ? match[1] : '';
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

      // Detectar si es una página de serie o un episodio directo
      const isDirectEpisode = html.includes('class="mobius"');
      
      if (isDirectEpisode) {
        episodesToProcess.push({ name: 'Episodio Único', url: url });
      } else {
        addLog(`Buscando lista de episodios...`);
        const links = Array.from(doc.querySelectorAll('ul li a[href*="/anime/"]'));
        const uniqueUrls = new Set<string>();

        links.forEach(a => {
          const href = a.getAttribute('href');
          // Filtrar enlaces que parezcan episodios (suelen tener "-capitulo-")
          if (href && href.includes('-capitulo-') && !uniqueUrls.has(href)) {
            uniqueUrls.add(href);
            const fullUrl = href.startsWith('http') ? href : new URL(href, url).href;
            const epNum = a.querySelector('.epl-num')?.textContent?.trim() || '';
            const epTitle = a.querySelector('.epl-title')?.textContent?.trim() || '';
            const epName = epNum ? `Ep ${epNum}: ${epTitle}` : epTitle || 'Episodio';
            episodesToProcess.push({ name: epName, url: fullUrl });
          }
        });

        // Invertimos para procesar del primero al último
        episodesToProcess.reverse();
        addLog(`Se encontraron ${episodesToProcess.length} episodios válidos.`);
      }

      const finalResults: ScrapedResult[] = [];

      for (const ep of episodesToProcess) {
        addLog(`Procesando ${ep.name}...`);
        
        let epHtml = '';
        if (isDirectEpisode) {
          epHtml = html;
        } else {
          try {
            const res = await fetch(ep.url);
            if (res.ok) epHtml = await res.text();
            else throw new Error('Proxy fail');
          } catch {
            epHtml = await fetchHTML(ep.url);
          }
        }

        const epDoc = new DOMParser().parseFromString(epHtml, 'text/html');
        const options = Array.from(epDoc.querySelectorAll('select.mirror option'));
        
        let foundAny = false;
        for (const option of options) {
          const serverName = option.textContent?.trim() || '';
          const base64Value = (option as HTMLOptionElement).value;
          const serverNameLower = serverName.toLowerCase();
          
          const isComplexPlayer = (targetServer === 'Ultimate' && serverNameLower.includes('ultimate')) || 
                                  (targetServer === 'Player' && serverNameLower.includes('player'));

          if (isComplexPlayer) {
            if (!base64Value) continue;
            
            const decoded = decodeBase64(base64Value);
            const playerUrl = extractIframeSrc(decoded);
            
            if (playerUrl) {
              addLog(`  -> Accediendo a ${targetServer} Player...`);
              try {
                let playerHtml = await fetchHTML(playerUrl, ep.url);
                let tabsMatch = playerHtml.match(/const videoTabs = (\[.*?\]);/s);
                
                // Si no se encuentra videoTabs, buscar el botón "Aceptar" (landing page)
                if (!tabsMatch) {
                  const playerDoc = new DOMParser().parseFromString(playerHtml, 'text/html');
                  const acceptLink = playerDoc.querySelector('a[href*="contenedor.php"]');
                  
                  if (acceptLink) {
                    const nextUrl = acceptLink.getAttribute('href');
                    if (nextUrl) {
                      addLog(`    -> Siguiendo página de confirmación (Aceptar)...`);
                      const finalUrl = nextUrl.startsWith('http') ? nextUrl : new URL(nextUrl, playerUrl).href;
                      playerHtml = await fetchHTML(finalUrl, playerUrl);
                      tabsMatch = playerHtml.match(/const videoTabs = (\[.*?\]);/s);
                    }
                  }
                }

                if (tabsMatch) {
                  const tabs = JSON.parse(tabsMatch[1]);
                  const filteredTabs = ultimateSubServer === 'TODOS'
                    ? tabs.filter((t: any) => ['Moon', 'Alpha', 'OK', 'Your', 'Epsilon'].includes(t.tab_name))
                    : tabs.filter((t: any) => t.tab_name.toLowerCase() === ultimateSubServer.toLowerCase());

                  filteredTabs.forEach((tab: any) => {
                    const formattedUrl = formatDoodstreamUrl(tab.url, `${targetServer} - ${tab.tab_name}`);
                    finalResults.push({
                      episodeName: ep.name,
                      serverName: `${targetServer} - ${tab.tab_name}`,
                      url: formattedUrl
                    });
                    addLog(`    -> Extraído ${tab.tab_name}: ${formattedUrl}`);
                    foundAny = true;
                  });
                } else {
                  addLog(`  [!] No se pudo encontrar videoTabs (posible URL rota o cambio de estructura)`, true);
                }
              } catch (err) {
                addLog(`  [!] Error en ${targetServer} Player: ${err instanceof Error ? err.message : 'Error desconocido'}`, true);
              }
            }
            continue;
          }

          const isRequested = targetServer === 'TODOS' 
            ? ['mega', 'alpha', 'your', 'mail', 'ok', 'moon', 'dood'].some(s => serverNameLower.includes(s))
            : serverNameLower.includes(targetServer.toLowerCase());

          if (isRequested) {
            if (base64Value) {
              const decoded = decodeBase64(base64Value);
              const videoUrl = extractIframeSrc(decoded);
              
              if (videoUrl) {
                const formattedUrl = formatDoodstreamUrl(videoUrl, serverName);
                finalResults.push({
                  episodeName: ep.name,
                  serverName: serverName,
                  url: formattedUrl
                });
                addLog(`  -> Extraído ${serverName}: ${formattedUrl}`);
                foundAny = true;
              }
            }
          }
        }

        if (!foundAny) {
          addLog(`  [!] No se encontraron servidores solicitados para este episodio`, true);
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
        <PlayCircle className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción Latinoyt Anime</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Serie o Episodio (latinoyt.com)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://latinoyt.com/anime/..."
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
                  <option value="TODOS">Todos (Mega, Alpha, Your...)</option>
                  <option value="Mega">Mega</option>
                  <option value="Alpha">Alpha</option>
                  <option value="Your">Your</option>
                  <option value="Mail">Mail</option>
                  <option value="OK">OK</option>
                  <option value="Moon">Moon</option>
                  <option value="Player">Player</option>
                  <option value="Ultimate">Ultimate</option>
                </select>
              </div>

              {(targetServer === 'Ultimate' || targetServer === 'Player') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Filtrar Sub-Servidor ({targetServer})
                  </label>
                  <select
                    value={ultimateSubServer}
                    onChange={(e) => setUltimateSubServer(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 bg-white"
                  >
                    <option value="TODOS">Todos (Moon, Alpha, OK, Your, Epsilon)</option>
                    <option value="Moon">Moon</option>
                    <option value="Alpha">Alpha</option>
                    <option value="OK">OK</option>
                    <option value="Your">Your</option>
                    <option value="Epsilon">Epsilon</option>
                  </select>
                </div>
              )}

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

        <div className="lg:col-span-7">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full">
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
              <div className="flex flex-col items-center justify-center flex-1 min-h-[250px] text-gray-400">
                <AlertCircle className="h-12 w-12 mb-2 opacity-20" />
                <p>No hay resultados aún</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2">
                {/* Agrupar por episodio para mejor visualización */}
                {Array.from(new Set(results.map(r => r.episodeName))).map(epName => (
                  <div key={epName} className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
                      <h3 className="font-bold text-gray-800 text-base">
                        {epName}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          const epLinks = results.filter(r => r.episodeName === epName).map(r => r.url).filter(Boolean).join('\n');
                          handleCopy(epLinks, `card-${epName}`, 'Enlaces del episodio copiados');
                        }}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                          copiedKey === `card-${epName}`
                            ? 'bg-emerald-100 text-emerald-800 font-medium'
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        }`}
                        title="Copiar todos los enlaces de este episodio"
                      >
                        {copiedKey === `card-${epName}` ? (
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
                      {results.filter(r => r.episodeName === epName).map((res, idx) => {
                        const itemKey = `${epName}-${idx}`;
                        const isCopied = copiedKey === itemKey;
                        return (
                          <div key={idx} className="flex items-center justify-between gap-3 bg-white p-2.5 rounded border border-gray-200 hover:border-blue-300 transition-colors">
                            <span className="font-semibold text-xs text-blue-800 bg-blue-100 px-2 py-1 rounded w-16 text-center uppercase shrink-0">
                              {res.serverName}
                            </span>
                            <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono" title={res.url}>
                              {res.url}
                            </a>
                            <button 
                              type="button"
                              onClick={() => handleCopy(res.url!, itemKey)} 
                              className={`p-1.5 rounded transition-all shrink-0 ${
                                isCopied
                                  ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                                  : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                              }`}
                              title="Copiar enlace"
                            >
                              {isCopied ? (
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
