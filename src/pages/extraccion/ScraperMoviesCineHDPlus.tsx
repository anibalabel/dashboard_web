import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, AlertCircle, Terminal, Copy } from 'lucide-react';

interface ScrapedResult {
  lat?: string | null;
  cast?: string | null;
  sub?: string | null;
}

export default function ScraperMoviesCineHDPlus() {
  const [url, setUrl] = useState('');
  const [preferredServer, setPreferredServer] = useState<'supervideo' | 'doodstream'>('supervideo');

  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [results, setResults] = useState<ScrapedResult[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

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

      const finalResults: ScrapedResult[] = [];

      try {
        // 2. Búsqueda del Iframe del Reproductor Principal
        // Buscamos iframe con src que contenga verhdlink.cam/movie
        const iframe = doc.querySelector('iframe[src*="verhdlink.cam/movie"]');

        if (!iframe) {
          addLog(`No se encontró el iframe de verhdlink.cam en la página`, true);
          throw new Error('Iframe verhdlink no encontrado');
        }

        let iframeSrc = iframe.getAttribute('src') || '';
        // Normalizar URL del iframe
        if (iframeSrc.startsWith('//')) {
          iframeSrc = 'https:' + iframeSrc;
        } else if (!iframeSrc.startsWith('http')) {
          iframeSrc = new URL(iframeSrc, url).href;
        }

        addLog(`Iframe encontrado: ${iframeSrc}`);
        addLog(`Navegando al reproductor intermediario...`);

        // 3. Navegación al Reproductor Intermediario
        // Pasamos la URL original como referer para evitar 403 Forbidden
        const playerHtml = await fetchHTML(iframeSrc, url);
        const playerDoc = new DOMParser().parseFromString(playerHtml, 'text/html');

        let latUrl = null;
        let castUrl = null;
        let subUrl = null; // Aunque la instrucción solo menciona CAST y LAT, dejamos SUB por si acaso

        // 4. Extracción de Enlaces por Idioma
        // Buscamos listas <ul> con clases específicas para el idioma
        // _player-mirrors + castellano / latino

        const extractLinksFromContainer = (containerClass: string): string | null => {
          // Buscamos el contenedor del idioma específico
          // Puede ser una clase que contenga "_player-mirrors" y el idioma
          // O un selector más flexible
          const container = playerDoc.querySelector(`ul[class*="_player-mirrors"][class*="${containerClass}"]`) ||
            playerDoc.querySelector(`ul.${containerClass}`);

          if (!container) return null;

          // Dentro de la lista, buscamos <li> con data-link
          const items = Array.from(container.querySelectorAll('li[data-link]'));

          for (const item of items) {
            const serverName = (item.textContent || '').toLowerCase();
            let link = item.getAttribute('data-link');

            if (!link) continue;

            // 5. Filtrado de Servidores
            if (serverName.includes(preferredServer)) {
              if (link.startsWith('//')) {
                link = 'https:' + link;
              }
              return link;
            }
          }

          return null;
        };

        castUrl = extractLinksFromContainer('castellano');
        latUrl = extractLinksFromContainer('latino');
        // Intento extra para inglés/subtitulado si existiera esa convención
        subUrl = extractLinksFromContainer('ingles') || extractLinksFromContainer('subtitulado');

        if (latUrl || castUrl || subUrl) {
          finalResults.push({ lat: latUrl, cast: castUrl, sub: subUrl });
          addLog(`Éxito - LAT: ${!!latUrl}, CAST: ${!!castUrl}`);
        } else {
          addLog(`No se encontraron enlaces válidos (${preferredServer}) en el reproductor`, true);
        }

      } catch (err) {
        addLog(`Error al procesar la película: ${err instanceof Error ? err.message : 'Error desconocido'}`, true);
      }

      setResults(finalResults);
      addLog('Extracción finalizada exitosamente.');
    } catch (error) {
      addLog(`Error crítico: ${error instanceof Error ? error.message : 'No se pudo completar la extracción'}`, true);
    } finally {
      setIsScraping(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showNotification('URL copiada al portapapeles');
  };

  const copyAllLinks = (type: 'lat' | 'cast' | 'sub') => {
    const links = results
      .map(r => r[type])
      .filter(link => link)
      .join('\n');

    if (links) {
      navigator.clipboard.writeText(links);
      showNotification(`Todos los enlaces ${type.toUpperCase()} copiados`);
    } else {
      showNotification(`No hay enlaces ${type.toUpperCase()} disponibles`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 relative">
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2 rounded-md shadow-lg flex items-center gap-2 animate-fade-in-down">
          <Copy className="h-4 w-4" />
          <span>{notification}</span>
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
                  URL de la Película (CineHDPlus)
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Servidor a extraer
                </label>
                <select
                  value={preferredServer}
                  onChange={(e) => setPreferredServer(e.target.value as 'supervideo' | 'doodstream')}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2"
                >
                  <option value="supervideo">Supervideo</option>
                  <option value="doodstream">Doodstream</option>
                </select>
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
                    onClick={() => copyAllLinks('lat')}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors"
                    title="Copiar todos los Latinos"
                  >
                    Copiar LAT
                  </button>
                  <button
                    onClick={() => copyAllLinks('cast')}
                    className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 transition-colors"
                    title="Copiar todos los Castellanos"
                  >
                    Copiar CAST
                  </button>
                  <button
                    onClick={() => copyAllLinks('sub')}
                    className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200 transition-colors"
                    title="Copiar todos los Subtitulados"
                  >
                    Copiar SUB
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
                  <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h3 className="font-bold text-gray-800 mb-3 text-lg border-b border-gray-200 pb-2">
                      Enlaces de la Película
                    </h3>

                    <div className="space-y-2">
                      {res.lat && (
                        <div className="flex items-center justify-between gap-4 bg-white p-2 rounded border border-gray-100">
                          <span className="font-semibold text-xs text-blue-800 bg-blue-100 px-2 py-1 rounded w-16 text-center">LAT</span>
                          <a href={res.lat} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1" title={res.lat}>{res.lat}</a>
                          <button onClick={() => copyToClipboard(res.lat!)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      )}

                      {res.cast && (
                        <div className="flex items-center justify-between gap-4 bg-white p-2 rounded border border-gray-100">
                          <span className="font-semibold text-xs text-red-800 bg-red-100 px-2 py-1 rounded w-16 text-center">CAST</span>
                          <a href={res.cast} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1" title={res.cast}>{res.cast}</a>
                          <button onClick={() => copyToClipboard(res.cast!)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      )}

                      {res.sub && (
                        <div className="flex items-center justify-between gap-4 bg-white p-2 rounded border border-gray-100">
                          <span className="font-semibold text-xs text-green-800 bg-green-100 px-2 py-1 rounded w-16 text-center">SUB</span>
                          <a href={res.sub} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1" title={res.sub}>{res.sub}</a>
                          <button onClick={() => copyToClipboard(res.sub!)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                            <Copy className="h-4 w-4" />
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