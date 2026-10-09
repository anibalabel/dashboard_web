import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, AlertCircle, Terminal, Copy, CheckCircle, Check } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDoodstreamUrl } from '@/lib/doodstreamUtils';

interface ScrapedResult {
  lat?: string | null;
  cast?: string | null;
  sub?: string | null;
}

export default function ScraperMoviesPelisplus() {
  const [url, setUrl] = useState('');
  const [targetServer, setTargetServer] = useState('voe'); // Default a voe
  
  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [results, setResults] = useState<ScrapedResult[]>([]);

  const addLog = (msg: string, isError = false) => {
    setLogs(prev => [...prev, { msg, isError }]);
  };

  const fetchHTML = async (targetUrl: string, refererUrl?: string) => {
    // Para depuración: Intentar fetch directo primero, si falla por CORS, usar proxy
    try {
      if (!refererUrl) { // Solo para la URL principal, no para embed69 que siempre necesita proxy por referer
        const directRes = await fetch(targetUrl);
        if (directRes.ok) {
          console.log("Fetch directo exitoso");
          return await directRes.text();
        }
      }
    } catch {
      console.log("Fetch directo falló por CORS u otro error, usando proxy...");
    }

    // Usar proxy local como fallback o cuando se necesita referer
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

  const resolveRedirect = async (targetUrl: string) => {
    try {
      const res = await fetch(`/proxy.php?url=${encodeURIComponent(targetUrl)}&resolve_redirect=true`);
      if (!res.ok) return targetUrl;
      const data = await res.json();
      return data.finalUrl || targetUrl;
    } catch {
      return targetUrl;
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
      
      const finalResults: ScrapedResult[] = [];

      try {
          // Loggear una parte del HTML para ver qué está devolviendo realmente el proxy
          addLog(`Tamaño del HTML descargado: ${html.length} caracteres`);
          
          // DEPURACIÓN: Mostrar el título de la página descargada
          const titleMatch = html.match(/<title>(.*?)<\/title>/i);
          if (titleMatch) {
            addLog(`TÍTULO DE LA PÁGINA: ${titleMatch[1]}`);
          }
          
          // DEPURACIÓN: Si es Cloudflare, suele tener un body o script específico
          if (html.includes('cloudflare') || html.includes('Just a moment')) {
             addLog(`¡ALERTA! Posible bloqueo de Cloudflare detectado`);
          }

          // Normalizar el HTML eliminando saltos de línea y tabulaciones múltiples para facilitar la búsqueda
          const normalizedHtml = html.replace(/\s+/g, ' ');

          // DEPURACIÓN EXTREMA: Buscar cualquier script que contenga la palabra video
          const scriptMatch = normalizedHtml.match(/<script[^>]*>(.*?var video.*?)<\/script>/i);
          if (scriptMatch) {
            addLog(`SCRIPT ENCONTRADO: ${scriptMatch[1].substring(0, 150)}...`);
          } else {
            addLog(`No se encontró ningún <script> que contenga 'var video'`);
          }

          // DEPURACIÓN EXTREMA: Buscar cualquier iframe
          const allIframes = html.match(/<iframe[^>]+src=['"]([^'"]+)['"][^>]*>/gi);
          if (allIframes) {
            allIframes.forEach((iframe, i) => {
               const srcMatch = iframe.match(/src=['"]([^'"]+)['"]/i);
               if (srcMatch) addLog(`IFRAME [${i}] src: ${srcMatch[1]}`);
            });
          } else {
            addLog(`No se encontraron iframes en el HTML`);
          }

          // Log para depuración: buscar exactamente cómo viene escrito video[1]
          const rawVideoLine = normalizedHtml.match(/video\[1\][^;]+;/i);
          if (rawVideoLine) {
            addLog(`Línea video[1]: ${rawVideoLine[0].substring(0, 100)}`);
          } else {
            addLog(`La variable "video[1]" NO existe en el HTML descargado`);
          }

          if (targetServer === 'uqload') {
            addLog(`Buscando enlace de redirección xupalace para Uqload...`);
            const uqlinkMatch = normalizedHtml.match(/(https?:\/\/xupalace\.org\/uqlink\.php\?id=[a-zA-Z0-9]+)/i);
            
            if (!uqlinkMatch) {
              addLog(`No se encontró enlace de redirección xupalace en la película`, true);
              throw new Error('Enlace de redirección no encontrado');
            }
            
            const uqlinkUrl = uqlinkMatch[1];
            addLog(`Redirección de Uqload encontrada: ${uqlinkUrl}. Descargando iframe...`);
            
            const uqHtml = await fetchHTML(uqlinkUrl, url);
            
            let uqloadEmbedUrl = '';
            const iframeMatch = uqHtml.match(/<iframe[^>]+src=['"]([^'"]*uqload[^'"]*)['"]/i);
            if (iframeMatch) {
              uqloadEmbedUrl = iframeMatch[1];
            } else {
              const directMatch = uqHtml.match(/(https?:\/\/uqload\.[a-z]+\/embed-[a-zA-Z0-9._-]+\.html)/i);
              if (directMatch) {
                uqloadEmbedUrl = directMatch[1];
              }
            }
            
            if (uqloadEmbedUrl) {
              if (uqloadEmbedUrl.startsWith('//')) {
                uqloadEmbedUrl = 'https:' + uqloadEmbedUrl;
              }
              const formattedUrl = formatDoodstreamUrl(uqloadEmbedUrl, targetServer);
              finalResults.push({ lat: formattedUrl });
              addLog(`Éxito (uqload) - LAT: ${formattedUrl}`);
            } else {
              addLog(`No se encontró el iframe de Uqload en la redirección`, true);
              throw new Error('Iframe de Uqload no encontrado');
            }
            
            setResults(finalResults);
            addLog('Extracción finalizada exitosamente.');
            setIsScraping(false);
            return;
          }

          // Buscar la variable JavaScript que contiene el iframe de embed69
          // Intento 1: Regex exacta del PHP original que dices que funciona
          const phpRegexMatch = normalizedHtml.match(/video\[1\]\s*=\s*['"]([^'"]+)['"]/i);
          let embedUrl = '';
          
          if (phpRegexMatch) {
            embedUrl = phpRegexMatch[1];
          }

          // Intento 2: Buscar cualquier texto dentro de video[1] = '...' que contenga embed69
          if (!embedUrl) {
            const embed69Match = normalizedHtml.match(/video\[1\]\s*=\s*[^;]*?(https?:\/\/embed69[^'"`\s;]+)/i);
            if (embed69Match) {
              embedUrl = embed69Match[1];
            }
          }

          // Intento 3: Acepta comillas simples, dobles, backticks o la variable inicio concatenada
          if (!embedUrl) {
            const videoMatch = normalizedHtml.match(/video\[1\]\s*=\s*(?:['"`]([^'"`]+)['"`]|inicio\s*\+\s*['"`]([^'"`]+)['"`]|['"`][^'"`]+['"`]\s*\+\s*['"`]([^'"`]+)['"`])/i);
            if (videoMatch) {
              embedUrl = videoMatch[1] || videoMatch[2] || videoMatch[3] || '';
            }
          }

          if (!embedUrl) {
            // Intento secundario más permisivo (busca URLs directas de embed69 dentro de video[1])
            const fallbackMatch = normalizedHtml.match(/video\[1\]\s*=\s*[^;]*?(https?:\/\/embed69[^\s'"`]+)/i) || 
                                  normalizedHtml.match(/video\[1\]\s*=\s*[^;]*?(\/f\/[^\s'"`]+)/i) ||
                                  normalizedHtml.match(/video\[1\]\s*=\s*[^;]*?(\/v\/[^\s'"`]+)/i);
            if (fallbackMatch) {
              embedUrl = fallbackMatch[1];
            }
          }
          
          // Intento 3.5: A veces hay espacios, saltos de línea o tabulaciones extrañas entre video[1] y el valor
          if (!embedUrl) {
             const looseMatch = normalizedHtml.match(/video\[1\]\s*=\s*['"`]\s*([^'"`]+)\s*['"`]/i);
             if (looseMatch) {
               embedUrl = looseMatch[1].trim();
             }
          }
          
          // Tercer intento: A veces está en un iframe directamente en el HTML y no en la variable video[1]
          if (!embedUrl) {
            const iframeMatch = normalizedHtml.match(/<iframe[^>]+src=['"]([^'"]*embed69[^'"]*)['"]/i) ||
                                normalizedHtml.match(/<iframe[^>]+src=['"]([^'"]*\/f\/[^'"]*)['"]/i) ||
                                normalizedHtml.match(/<iframe[^>]+src=['"]([^'"]*\/v\/[^'"]*)['"]/i);
            if (iframeMatch) {
              embedUrl = iframeMatch[1];
            }
          }
          
          // Intento 3.5: Usar DOM Parser para buscar el iframe directamente (mucho más confiable para HTML malformado)
          if (!embedUrl) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const iframe = doc.querySelector('.video-html iframe, #video-content iframe, iframe[src*="embed69"]');
            if (iframe) {
              const src = iframe.getAttribute('src');
              if (src) embedUrl = src;
            }
          }
          
          // Intento 4: Búsqueda cruda de cualquier URL de embed69 en el HTML (muy permisivo)
          if (!embedUrl) {
             const rawMatch = normalizedHtml.match(/(https?:\/\/embed69[^'"`\s<>]+)/i) || 
                              normalizedHtml.match(/['"`](\/f\/[^'"`\s<>]+)['"`]/i);
             if (rawMatch) {
                embedUrl = rawMatch[1];
             }
          }

        if (!embedUrl) {
          addLog(`No se encontró iframe de embed69 en la página`, true);
          throw new Error('Iframe no encontrado');
        }

        // Limpiar si trae comillas invertidas por error
        embedUrl = embedUrl.replace(/`/g, '').trim();

        // Si el embedUrl empieza con / (relativo), probablemente falta el dominio de embed69
        if (embedUrl.startsWith('/f/') || embedUrl.startsWith('/v/')) {
          embedUrl = 'https://embed69.org' + embedUrl;
        } else if (embedUrl.startsWith('//')) {
          embedUrl = 'https:' + embedUrl;
        }

        addLog(`Obteniendo reproductor Embed69...`);
        
        // Petición al iframe de embed69 (necesita referer de pelisplus para evitar 403 Forbidden)
        const iframeHtml = await fetchHTML(embedUrl, url);

        // Buscar el JSON de data (puede estar en let dataLink = o let sortedEmbeds =)
        const dataMatch = iframeHtml.match(/let\s+dataLink\s*=\s*(\[.*?\]);/s) || 
                          iframeHtml.match(/let\s+sortedEmbeds\s*=\s*(\[.*?\]);/s) ||
                          iframeHtml.match(/(?:const\s+data|var\s+dataLink)\s*=\s*(\[.*?\]);/s);

        if (!dataMatch) {
          addLog(`No se encontraron datos JSON en Embed69`, true);
          throw new Error('Datos JSON no encontrados en Embed69');
        }

        const parsedData = new Function(`return ${dataMatch[1]}`)();

        let latUrl = null;
        let castUrl = null;
        let subUrl = null;

        // El formato de dataLink es: [{ file_id: X, video_language: "ESP", sortedEmbeds: [{servername: "voe", link: "JWT"}, ...] }]
        // Iteramos sobre los objetos principales de idioma
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const langGroup of parsedData) {
           const langName = String(langGroup.video_language || langGroup.lang || '').toUpperCase();
           const embeds = langGroup.sortedEmbeds || [];

           // Buscamos un enlace válido dentro de este idioma que coincida con el servidor seleccionado
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           for (const server of embeds) {
             if (!server.link) continue;
             
             // Filtrar por el servidor seleccionado (case insensitive)
             if (String(server.servername).toLowerCase() !== targetServer.toLowerCase()) continue;
             
             try {
                // Decodificar JWT token
                const parts = server.link.split('.');
                if (parts.length === 3) {
                   // Fix base64 padding issues
                   const base64Url = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                   const pad = base64Url.length % 4;
                   const padded = pad ? base64Url + '='.repeat(4 - pad) : base64Url;
                   
                   const payload = JSON.parse(atob(padded));
                   if (payload.link) {
                      let cleanUrl = payload.link.replace(/`/g, '').trim();
                      
                      // Resolve Streamwish redirects
                      if (String(server.servername).toLowerCase() === 'streamwish') {
                          addLog(`Resolviendo redirección de Streamwish...`);
                          cleanUrl = await resolveRedirect(cleanUrl);
                      }
                      
                      cleanUrl = formatDoodstreamUrl(cleanUrl, targetServer || server.servername);
                      
                      // Clasificar por idioma basado en video_language
                      if (langName === 'LAT' || langName === 'LATINO') {
                        if (!latUrl) latUrl = cleanUrl;
                      } else if (langName === 'ESP' || langName === 'CASTELLANO') {
                        if (!castUrl) castUrl = cleanUrl;
                      } else if (langName === 'SUB' || langName === 'SUBTITULADO') {
                        if (!subUrl) subUrl = cleanUrl;
                      } else {
                        // Fallback si no identificamos
                        if (!latUrl) latUrl = cleanUrl;
                      }
                   }
                }
             } catch (e) {
                console.error("Error decodificando token", e);
             }
           }
        }

        if (latUrl || castUrl || subUrl) {
          finalResults.push({ lat: latUrl, cast: castUrl, sub: subUrl });
          addLog(`Éxito (${targetServer}) - LAT: ${!!latUrl}, CAST: ${!!castUrl}, SUB: ${!!subUrl}`);
        } else {
          addLog(`No se encontraron videos válidos para el servidor '${targetServer}'`, true);
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
        <PlayCircle className="h-8 w-8 text-red-600" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción PelisplusHD (Movies)</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Película (PelisplusHD.bz)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://pelisplushd.bz/pelicula/..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 border p-2"
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
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 border p-2 bg-white"
                >
                  <option value="voe">Voe</option>
                  <option value="filemoon">Filemoon</option>
                  <option value="streamwish">Streamwish</option>
                  <option value="vidhide">Vidhide</option>
                  <option value="uqload">Uqload</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isScraping || !url}
                className="w-full bg-red-600 text-white px-4 py-2.5 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium mt-4"
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
                        Enlaces de la Película
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
                        title="Copiar todos los enlaces de esta película"
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
