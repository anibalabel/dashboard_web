import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, AlertCircle, Terminal, Copy, CheckCircle } from 'lucide-react';

interface ScrapedResult {
  season: number;
  episode: number;
  url: string; // El enlace final o data-link
  title?: string;
  isError?: boolean;
}

export default function ScraperCineHDPlusSeries() {
  const [url, setUrl] = useState('');
  const [targetSeason, setTargetSeason] = useState('');
  const [limit, setLimit] = useState('');
  
  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [results, setResults] = useState<ScrapedResult[]>([]);

  const addLog = (msg: string, isError = false) => {
    setLogs(prev => [...prev, { msg, isError }]);
  };

  const fetchHTML = async (targetUrl: string, refererUrl?: string) => {
    // Usar proxy local
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fetchPOST = async (targetUrl: string, body: URLSearchParams, refererUrl: string) => {
    // Usar nuestro proxy PHP local para peticiones POST complejas
    const proxy = `/proxy.php?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(refererUrl)}`;
    
    try {
      const res = await fetch(proxy, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString()
      });
      if (!res.ok) throw new Error(`Error ${res.status} al conectar con el proxy local`);
      return await res.json(); // Cinemitas ajax suele devolver JSON
    } catch (error) {
      console.error('Error en proxy local POST:', error);
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
      const html = await fetchHTML(url);
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // 2. Búsqueda de Episodios en el DOM
      addLog('Buscando enlaces de episodios en el HTML...');
      
      // Buscamos <li> que contengan <a> con data-link, data-num, data-title
      const listItems = Array.from(doc.querySelectorAll('li a[data-link][data-num][data-title]'));
      
      const allEpisodes: ScrapedResult[] = [];

      listItems.forEach(a => {
        const link = a.getAttribute('data-link') || '';
        const num = a.getAttribute('data-num') || '';
        const title = a.getAttribute('data-title') || '';
        
        // Regex para validar formato Temporada x Episodio (ej. 1x1, 1 x 02)
        const match = num.match(/^\s*(\d+)\s*x\s*(\d+)\s*$/i);
        
        if (match) {
          const s = parseInt(match[1]);
          const e = parseInt(match[2]);
          
          if (!allEpisodes.some(ep => ep.season === s && ep.episode === e)) {
            allEpisodes.push({ season: s, episode: e, url: link, title });
          }
        }
      });

      // 3. Procesamiento y Clasificación
      // Agrupamos por temporada
      const episodesBySeason: Record<number, ScrapedResult[]> = {};
      
      allEpisodes.forEach(ep => {
        if (!episodesBySeason[ep.season]) {
          episodesBySeason[ep.season] = [];
        }
        episodesBySeason[ep.season].push(ep);
      });

      // 4. Ordenamiento y Relleno de Huecos (Gaps)
      const finalResults: ScrapedResult[] = [];
      const seasons = Object.keys(episodesBySeason).map(Number).sort((a, b) => a - b);

      seasons.forEach(season => {
        // Filtrar por temporada si se especificó
        if (targetSeason && season !== Number(targetSeason)) return;

        const seasonEps = episodesBySeason[season];
        // Ordenar episodios dentro de la temporada
        seasonEps.sort((a, b) => a.episode - b.episode);

        // Rellenar huecos
        const filledSeasonEps: ScrapedResult[] = [];
        if (seasonEps.length > 0) {
          const maxEp = seasonEps[seasonEps.length - 1].episode;
          // Empezamos desde el episodio 1 hasta el último encontrado
          for (let i = 1; i <= maxEp; i++) {
             const existing = seasonEps.find(ep => ep.episode === i);
             if (existing) {
               filledSeasonEps.push(existing);
             } else {
               // Hueco encontrado, insertar episodio ficticio de error
               filledSeasonEps.push({
                 season: season,
                 episode: i,
                 url: '--ERROR-- / Not Found',
                 title: 'Episodio Faltante',
                 isError: true
               });
               addLog(`Hueco detectado: Falta S${season}xE${i}`, true);
             }
          }
        }
        
        finalResults.push(...filledSeasonEps);
      });

      // Aplicar límite global si existe
      let resultsToShow = finalResults;
      if (limit) {
        resultsToShow = resultsToShow.slice(0, Number(limit));
      }

      addLog(`Se procesaron ${resultsToShow.length} episodios.`);
      setResults(resultsToShow);
      addLog('Extracción finalizada exitosamente.');

    } catch (error) {
      addLog(`Error crítico: ${error instanceof Error ? error.message : 'No se pudo completar la extracción'}`, true);
    } finally {
      setIsScraping(false);
    }
  };

  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showNotification('URL copiada al portapapeles');
  };

  const copyAllLinks = () => {
    const links = results
      .map(r => r.url)
      .join('\n');
    
    if (links) {
      navigator.clipboard.writeText(links);
      showNotification(`Todos los enlaces copiados`);
    } else {
      showNotification(`No hay enlaces disponibles`);
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
        <PlayCircle className="h-8 w-8 text-green-600" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción CineHDPlus (Series)</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Serie (CineHDPlus)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://cinehdplus.gratis/peliculas/..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2"
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
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2"
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
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isScraping || !url}
                className="w-full bg-green-600 text-white px-4 py-2.5 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium mt-4"
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2 flex justify-between items-center">
              <span>Resultados ({results.length})</span>
              {results.length > 0 && (
                <div className="flex gap-2">
                  <button 
                    onClick={() => copyAllLinks()}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors"
                    title="Copiar todos los enlaces"
                  >
                    Copiar Todos
                  </button>
                </div>
              )}
            </h2>

            {results.length === 0 && !isScraping && (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <AlertCircle className="h-12 w-12 mb-2 opacity-20" />
                <p>No hay resultados aún</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2">
                {results.map((res, idx) => (
                  <div key={idx} className={`bg-gray-50 border border-gray-200 rounded-lg p-4 ${res.isError ? 'border-red-200 bg-red-50' : ''}`}>
                    <h3 className="font-bold text-gray-800 mb-3 text-lg border-b border-gray-200 pb-2">
                      Temporada {res.season} - Episodio {res.episode}
                      {res.title && <span className="ml-2 text-sm font-normal text-gray-600">({res.title})</span>}
                    </h3>
                    
                    <div className="space-y-2">
                      {/* Enlace Único */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-700 rounded w-16 text-center">
                          LINK
                        </span>
                        <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1" title={res.url}>{res.url}</a>
                        <button onClick={() => copyToClipboard(res.url)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
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