import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, AlertCircle, Terminal, Copy } from 'lucide-react';

interface ScrapedResult {
  lat?: string | null;
  cast?: string | null;
  sub?: string | null;
}

export default function ScraperMoviesCinemitas() {
  const [url, setUrl] = useState('');
  
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

  const fetchGET = async (targetUrl: string, refererUrl: string) => {
    // Usar nuestro proxy PHP local que maneja headers correctamente
    const proxy = `/proxy.php?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(refererUrl)}`;
    try {
      const res = await fetch(proxy);
      if (!res.ok) throw new Error(`Error ${res.status} al conectar con el proxy local`);
      return await res.text();
    } catch (error) {
      console.error('Error en proxy local GET:', error);
      throw error;
    }
  };

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
      const html = await fetchGET(url, url);
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const finalResults: ScrapedResult[] = [];
      const baseUrl = new URL(url).origin;

      try {
        // 2. Extraer configuración AJAX tipo DooPlay/DT
        let playerApi = '';
        let adminAjaxUrl = '';
        let nonce = '';

        // Buscar en dtAjax = {...} primero (la forma más común en Dooplay moderno)
        const dtAjaxMatch = html.match(/dtAjax\s*=\s*(\{[\s\S]*?\})/i);
        if (dtAjaxMatch) {
          try {
             // Limpiar el JSON de posibles comas finales antes de parsear
             let jsonStr = dtAjaxMatch[1];
             jsonStr = jsonStr.replace(/,\s*}/g, '}');
             
             // Evaluar de forma segura ya que a veces el JSON en JS no tiene comillas en las keys
             const dtAjaxObj = new Function(`return ${jsonStr}`)();
             
             if (dtAjaxObj.player_api) playerApi = dtAjaxObj.player_api;
             if (dtAjaxObj.url) adminAjaxUrl = dtAjaxObj.url;
             if (dtAjaxObj.nonce) nonce = dtAjaxObj.nonce;
          } catch (err) {
             console.warn('Error parseando dtAjax:', err);
          }
        }

        // Si no se encontró en dtAjax, buscar en scripts base64
        if (!playerApi || !adminAjaxUrl) {
          const scripts = Array.from(doc.querySelectorAll('script[id*="dt"][id*="ajax"]'));
          for (const script of scripts) {
            const src = script.getAttribute('src') || '';
            if (src.includes('base64,')) {
              try {
                const base64Data = src.split('base64,')[1];
                const decoded = atob(base64Data);
                const apiMatch = decoded.match(/player_api"\s*:\s*"([^"]+)"/i);
                const ajaxMatch = decoded.match(/admin_ajax"\s*:\s*"([^"]+)"/i) || decoded.match(/url"\s*:\s*"([^"]+admin-ajax\.php[^"]*)"/i);
                const nonceMatch = decoded.match(/nonce"\s*:\s*"([^"]+)"/i);

                if (apiMatch && !playerApi) playerApi = apiMatch[1].replace(/\\/g, '');
                if (ajaxMatch && !adminAjaxUrl) adminAjaxUrl = ajaxMatch[1].replace(/\\/g, '');
                if (nonceMatch && !nonce) nonce = nonceMatch[1];
              } catch (e) {
                console.warn('Error decodificando script base64', e);
              }
            }
          }
        }

        // Si no se encontró en base64, buscar en el HTML general
        if (!adminAjaxUrl) {
          const ajaxMatch = html.match(/admin_ajax["']?\s*:\s*["']([^"']+)["']/i) || html.match(/url["']?\s*:\s*["']([^"']+admin-ajax\.php[^"']*)["']/i);
          if (ajaxMatch) adminAjaxUrl = ajaxMatch[1].replace(/\\/g, '');
        }
        if (!playerApi) {
          const apiMatch = html.match(/player_api["']?\s*:\s*["']([^"']+)["']/i);
          if (apiMatch) playerApi = apiMatch[1].replace(/\\/g, '');
        }
        if (!nonce) {
          const nonceMatch = html.match(/nonce["']?\s*:\s*["']([^"']+)["']/i);
          if (nonceMatch) nonce = nonceMatch[1];
        }

        // Normalizar adminAjaxUrl a absoluta si es relativa
        if (adminAjaxUrl && adminAjaxUrl.startsWith('/')) {
           adminAjaxUrl = `${baseUrl}${adminAjaxUrl}`;
        }

        addLog(`Configuración AJAX: api=${!!playerApi}, ajax=${!!adminAjaxUrl}, nonce=${!!nonce}`);

        // Fallback para admin_ajax si sigue vacio
        if (!adminAjaxUrl) {
          adminAjaxUrl = `${baseUrl}/wp-admin/admin-ajax.php`;
          addLog('Usando fallback para admin_ajax');
        }

        // 3. Extraer opciones de reproductor
        const options = Array.from(doc.querySelectorAll('li.dooplay_player_option, li[data-post]'));
        
        let latUrl = null;
        let castUrl = null;
        let subUrl = null;

        // Función auxiliar para extraer links uqload de texto (HTML o JSON aplanado)
        const extractUqload = (text: string): string | null => {
           // Si viene un objeto embed_url del JSON
           if (typeof text === 'string') {
              try {
                const json = JSON.parse(text);
                if (json.embed_url) {
                   text = json.embed_url;
                }
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              } catch (err) {
                // No es JSON, seguimos normal
              }
           }

           // Regex global para encontrar enlaces uqload
           const uqloadRegex = /https?:\/\/[^\s"']*uqload[^\s"']*/ig;
           const matches = text.match(uqloadRegex);
           
           if (matches && matches.length > 0) {
              // Limpiar escapes y comillas
              let cleanUrl = matches[0].replace(/\\/g, '').replace(/["']/g, '');
              if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
              return cleanUrl;
           }
           
           // Búsqueda en iframes/embeds
           const iframeMatch = text.match(/<iframe[^>]+src=["']([^"']*uqload[^"']*)["']/i) || 
                               text.match(/<embed[^>]+src=["']([^"']*uqload[^"']*)["']/i);
           if (iframeMatch) {
              let cleanUrl = iframeMatch[1].replace(/\\/g, '');
              if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
              return cleanUrl;
           }
           
           return null;
        };

        for (const opt of options) {
           const postId = opt.getAttribute('data-post');
           const nume = opt.getAttribute('data-nume');
           const type = opt.getAttribute('data-type');
           const label = (opt.textContent || '').toLowerCase();
           
           if (!postId || !nume || !type) continue;
           
           // Clasificar idioma
            let lang = 'UNK';
            if (label.includes('cast') || label.includes('castellano')) {
               lang = 'CAST';
            } else if (label.includes('lat') || label.includes('latino') || label.includes('esp')) {
               lang = 'LAT';
            } else if (label.includes('sub') || label.includes('en')) {
               lang = 'SUB';
            }

            let foundUrl: string | null = null;

            // 4. Pedir reproductor por AJAX
            
            // Vía A: player_api (GET)
            if (playerApi && !foundUrl) {
               try {
                  const apiTarget = playerApi.startsWith('http') ? playerApi : `${baseUrl}${playerApi.startsWith('/') ? '' : '/'}${playerApi}`;
                  const getUrl = `${apiTarget}?post=${postId}&nume=${nume}&type=${type}`;
                  addLog(`Intentando Vía A (GET): ${lang}`);
                  const getResponse = await fetchGET(getUrl, url);
                  foundUrl = extractUqload(getResponse);
               } catch (err) {
                  console.warn('Fallo Vía A (GET player_api):', err);
               }
            }

            // Vía B: admin-ajax (POST) con fallbacks de action
            if (!foundUrl && adminAjaxUrl) {
               const actions = ['doo_player_ajax', 'dooplay_player', 'dt_player_ajax'];
               
               for (const action of actions) {
                  if (foundUrl) break;
                  
                  addLog(`Intentando Vía B (POST - ${action}): ${lang}`);
                  const body = new URLSearchParams({
                     action: action,
                     post: postId,
                     nume: nume,
                     type: type
                  });
                  
                  if (nonce) {
                     body.append('nonce', nonce);
                     body.append('security', nonce);
                     body.append('_wpnonce', nonce);
                  }
  
                  try {
                     const postResponse = await fetchPOST(adminAjaxUrl, body, url);
                     // fetchPOST devuelve JSON si puede, lo convertimos a string para buscar
                     const responseStr = typeof postResponse === 'object' ? JSON.stringify(postResponse) : postResponse;
                     foundUrl = extractUqload(responseStr);
                  } catch (err) {
                     console.warn(`Fallo Vía B POST (${action}):`, err);
                  }
               }
            }

           // Asignar al idioma si encontramos URL y aún no tenemos una para ese idioma
           if (foundUrl) {
              if (lang === 'LAT' && !latUrl) latUrl = foundUrl;
              else if (lang === 'CAST' && !castUrl) castUrl = foundUrl;
              else if (lang === 'SUB' && !subUrl) subUrl = foundUrl;
           }
        }

        if (latUrl || castUrl || subUrl) {
          finalResults.push({ lat: latUrl, cast: castUrl, sub: subUrl });
          addLog(`Éxito - LAT: ${!!latUrl}, CAST: ${!!castUrl}, SUB: ${!!subUrl}`);
        } else {
          addLog(`No se encontraron videos Uqload en la página`, true);
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
        <PlayCircle className="h-8 w-8 text-indigo-600" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción Cinemitas (Movies)</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Película (Cinemitas)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://cinemitas.com/pelicula/..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isScraping || !url}
                className="w-full bg-indigo-600 text-white px-4 py-2.5 rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium mt-4"
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