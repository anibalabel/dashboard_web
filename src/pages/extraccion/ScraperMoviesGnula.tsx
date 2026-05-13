import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, Copy, AlertCircle, Terminal, CheckCircle } from 'lucide-react';

interface ScrapedResult {
  lat?: string | null;
  cast?: string | null;
  sub?: string | null;
}

export default function ScraperMoviesGnula() {
  const [url, setUrl] = useState('');
  const [serverType, setServerType] = useState('bysevepoin'); // 'bysevepoin' or 'voe'
  
  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [results, setResults] = useState<ScrapedResult[]>([]);

  const addLog = (msg: string, isError = false) => {
    setLogs(prev => [...prev, { msg, isError }]);
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

    try {
      // 1. Lectura de la URL principal
      addLog(`Iniciando petición a: ${url}`);
      const html = await fetchHTML(url);
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const finalResults: ScrapedResult[] = [];

      // 2. Buscar div id="pembed" > iframe
      // Algunos sitios usan class="player-embed" y id="pembed"
      const iframe = doc.querySelector('#pembed iframe') || doc.querySelector('.player-embed iframe');
      if (!iframe) {
        addLog(`No se encontró contenedor #pembed o iframe en la página principal`, true);
        throw new Error('Iframe no encontrado');
      }

      let iframeSrc = iframe.getAttribute('src') || '';
      iframeSrc = iframeSrc.trim();
      
      if (!iframeSrc) {
        addLog(`El iframe no tiene src`, true);
        throw new Error('Iframe sin src');
      }

      if (iframeSrc.startsWith('//')) {
        iframeSrc = 'https:' + iframeSrc;
      } else if (!iframeSrc.startsWith('http')) {
        // Manejar rutas relativas
        try {
          iframeSrc = new URL(iframeSrc, url).href;
        } catch {
          addLog(`Error al construir URL absoluta del iframe: ${iframeSrc}`, true);
          throw new Error('Error en URL del iframe');
        }
      }

      addLog(`Obteniendo reproductor...`);
      const iframeHtml = await fetchHTML(iframeSrc);

      const extractAndDecode = (htmlStr: string, varName: string) => {
        const regex = new RegExp(`var\\s+${varName}\\s*=\\s*(\\[.*?\\]);`, 's');
        const match = htmlStr.match(regex);
        if (!match) return null;
        try {
            // Parsear el array de javascript de forma segura
            const arr = new Function(`return ${match[1]}`)();
          
          // El formato del array es: [["serverName", "url"], ...]
          const targetServerStr = serverType.toLowerCase();
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const videoItem = arr.find((item: any[]) => 
            Array.isArray(item) && 
            item.length >= 2 && 
            typeof item[0] === 'string' && 
            item[0].toLowerCase().includes(targetServerStr)
          );
          
          if (videoItem) {
            let finalUrl = videoItem[1]; // La URL está en la segunda posición
            // Limpiar comillas extras si existen en la cadena cruda
            finalUrl = finalUrl.trim().replace(/^`|`$/g, '').trim();
            
            const idMatch = finalUrl.match(/\?id=([^&]+)/);
            if (idMatch) {
              finalUrl = atob(decodeURIComponent(idMatch[1]));
            }
            return finalUrl;
          }
        } catch (err) {
          console.error(err);
        }
        return null;
      };

      // Lógica especial de detección de idioma para Películas
      let lat = extractAndDecode(iframeHtml, 'videosLatino');
      const cast = extractAndDecode(iframeHtml, 'videosCastellano');
      const original = extractAndDecode(iframeHtml, 'videosOriginal');
      const sub = extractAndDecode(iframeHtml, 'videosSubtitulado');

      // Determinamos el subtitulado real
      let finalSub = null;
      
      if (original && sub && original === sub) {
        // Caso 1: videosOriginal == videosSubtitulado -> Es Subtitulado
        finalSub = sub;
      } else if (sub) {
        // Si existe videosSubtitulado, lo usamos
        finalSub = sub;
      }

      // Si no hay latino explícito, pero videosOriginal es diferente de videosSubtitulado
      // entonces videosOriginal se considera Latino.
      if (!lat && original) {
        if (!sub || original !== sub) {
          lat = original;
        }
      }

      if (lat || cast || finalSub) {
        finalResults.push({ lat, cast, sub: finalSub });
        addLog(`Éxito - LAT: ${!!lat}, CAST: ${!!cast}, SUB: ${!!finalSub}`);
      } else {
        addLog(`No se encontraron videos (${serverType}) en la página`, true);
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

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showNotification('URL copiada al portapapeles');
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
        <h1 className="text-3xl font-bold text-gray-900">Extracción Movies Gnula</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Película (Gnula)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://gnula.nu/peliculas/..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Servidor a Extraer
                  </label>
                  <select
                    value={serverType}
                    onChange={(e) => setServerType(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  >
                    <option value="bysevepoin">Filemoon (bysevepoin)</option>
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2 flex justify-between items-center">
              <span>Resultados ({results.length})</span>
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