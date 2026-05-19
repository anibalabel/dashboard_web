import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, Copy, AlertCircle, Terminal, CheckCircle } from 'lucide-react';

interface EpisodeLink {
  season: number;
  episode: number;
  url: string;
}

interface ScrapedResult {
  season: number;
  episode: number;
  lat?: string | null;
  cast?: string | null;
  sub?: string | null;
}

const powCache = new Map<string, Uint8Array>();

async function sha256(str: string) {
  const buf = new TextEncoder().encode(str);
  const hash = await window.crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function solvePoW(challenge: string, difficulty: number, salt: string) {
  if (powCache.has(challenge)) return powCache.get(challenge);
  const prefix = '0'.repeat(difficulty);
  let nonce = 0;
  while (true) {
    const hash = await sha256(challenge + nonce);
    if (hash.startsWith(prefix)) {
      const keyHash = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(challenge + nonce + salt));
      const aesKey = new Uint8Array(keyHash);
      powCache.set(challenge, aesKey);
      return aesKey;
    }
    nonce++;
    if (nonce > 500000) return null;
  }
}

async function decryptAES(encryptedBase64: string, aesKey: Uint8Array) {
  try {
    const raw = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const iv = raw.slice(0, 16);
    const ciphertext = raw.slice(16);
    const key = await window.crypto.subtle.importKey('raw', aesKey.slice(0, 32), { name: 'AES-CBC' }, false, ['decrypt']);
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return encryptedBase64;
  }
}

export default function ScraperPelisplusSeries() {
  const [url, setUrl] = useState('');
  const [targetSeason, setTargetSeason] = useState('');
  const [limit, setLimit] = useState('');
  const [targetServer, setTargetServer] = useState('voe'); // Default a voe
  
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
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // 2. Búsqueda de los enlaces de los Episodios
      addLog('Buscando enlaces de episodios en el HTML...');
      
      const epLinks: EpisodeLink[] = [];
      
      // Validar si la URL ingresada es directamente la de un episodio
      const isDirectEpisode = url.match(/-(\d+)x(\d+)(?:\/|$)/i) || url.match(/\/temporada\/(\d+)\/capitulo\/(\d+)(?:\/|$)/i) || url.match(/-temporada-(\d+)-episodio-(\d+)(?:\/|$)/i);
      
      if (isDirectEpisode) {
        // Es un enlace directo a un episodio
        const s = parseInt(isDirectEpisode[1]);
        const e = parseInt(isDirectEpisode[2]);
        epLinks.push({ season: s, episode: e, url: url });
        addLog(`Se detectó URL directa de episodio: S${s}xE${e}`);
      } else {
        // En Pelisplus las temporadas suelen estar en div.tab-pane o similares
        // y los episodios en enlaces con href=/episodio/... o /serie/nombre/temporada/1/capitulo/1
        // También puede ser simplemente href="/episodio/..."
        const links = Array.from(doc.querySelectorAll('a[href*="/episodio/"], a[href*="/capitulo/"]'));

        if (links.length === 0) {
          // Intentar otra estrategia si no encuentra los enlaces con los selectores anteriores
          // A veces los enlaces están en li a dentro de ul con clase episodes
          const allLinks = Array.from(doc.querySelectorAll('a'));
          allLinks.forEach(a => {
            const href = a.getAttribute('href') || '';
            if (href.includes('/episodio/') || href.includes('/capitulo/')) {
              links.push(a);
            }
          });
        }

        links.forEach(a => {
          const href = a.getAttribute('href') || '';
          if (!href) return;
          
          const fullUrl = href.startsWith('http') ? href : new URL(href, url).href;
          
          // Formato 1: termina en -1x1 o similar (ej. /episodio/serie-1x1)
          const match1 = fullUrl.match(/-(\d+)x(\d+)(?:\/|$)/i);
          // Formato 2: /temporada/1/capitulo/1
          const match2 = fullUrl.match(/\/temporada\/(\d+)\/capitulo\/(\d+)(?:\/|$)/i);
          // Formato 3: /episodio/pluribus-temporada-1-episodio-1
          const match3 = fullUrl.match(/-temporada-(\d+)-episodio-(\d+)(?:\/|$)/i);
          
          let s = 0, e = 0;
          
          if (match1) {
            s = parseInt(match1[1]);
            e = parseInt(match1[2]);
          } else if (match2) {
            s = parseInt(match2[1]);
            e = parseInt(match2[2]);
          } else if (match3) {
            s = parseInt(match3[1]);
            e = parseInt(match3[2]);
          }
          
          if (s > 0 && e > 0) {
            if (!epLinks.some(ep => ep.season === s && ep.episode === e)) {
              epLinks.push({ season: s, episode: e, url: fullUrl });
            }
          }
        });
      }

      // Filtrar y ordenar
      let filtered = epLinks;
      if (targetSeason) {
        filtered = filtered.filter(ep => ep.season === Number(targetSeason));
      }
      filtered.sort((a, b) => a.season === b.season ? a.episode - b.episode : a.season - b.season);
      if (limit) {
        filtered = filtered.slice(0, Number(limit));
      }

      addLog(`Se encontraron ${filtered.length} episodios válidos para procesar.`);

      // 3. & 4. & 5. Loop para obtener iframe y enlaces finales
      const finalResults: ScrapedResult[] = [];

      for (const ep of filtered) {
        addLog(`Procesando S${ep.season}xE${ep.episode}...`);
        try {
          const epHtml = await fetchHTML(ep.url);
          
          // Normalizar el HTML eliminando saltos de línea y tabulaciones múltiples para facilitar la búsqueda
          const normalizedHtml = epHtml.replace(/\s+/g, ' ');

          // Log para depuración
          const rawVideoLine = normalizedHtml.match(/video\[1\][^;]+;/i);
          if (rawVideoLine) {
            addLog(`S${ep.season}xE${ep.episode} crudo: ${rawVideoLine[0].substring(0, 100)}...`);
          }

          // Buscar la variable JavaScript que contiene el iframe de embed69
          // Intento 1: Regex exacta del PHP original
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

            // Intento 3.5: Usar DOM Parser para buscar el iframe directamente
            if (!embedUrl) {
              const doc = new DOMParser().parseFromString(epHtml, 'text/html');
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
            addLog(`No se encontró iframe de embed69 en S${ep.season}xE${ep.episode}`, true);
            continue;
          }

          // Limpiar si trae comillas invertidas por error
          embedUrl = embedUrl.replace(/`/g, '').trim();

          // Si el embedUrl empieza con / (relativo), probablemente falta el dominio de embed69
          if (embedUrl.startsWith('/f/') || embedUrl.startsWith('/v/')) {
            embedUrl = 'https://embed69.org' + embedUrl;
          } else if (embedUrl.startsWith('//')) {
            embedUrl = 'https:' + embedUrl;
          }

          addLog(`Obteniendo reproductor Embed69 para S${ep.season}xE${ep.episode}...`);
          
          // Petición al iframe de embed69 (necesita referer de pelisplus para evitar 403 Forbidden)
          const iframeHtml = await fetchHTML(embedUrl, ep.url);

          // Buscar el JSON de data (puede estar en let dataLink = o let sortedEmbeds =)
          const dataMatch = iframeHtml.match(/let\s+dataLink\s*=\s*(\[.*?\]);/s) || 
                            iframeHtml.match(/let\s+sortedEmbeds\s*=\s*(\[.*?\]);/s) ||
                            iframeHtml.match(/(?:const\s+data|var\s+dataLink)\s*=\s*(\[.*?\]);/s);

          if (!dataMatch) {
            addLog(`No se encontraron datos JSON en Embed69 S${ep.season}xE${ep.episode}`, true);
            continue;
          }

          const parsedData = new Function(`return ${dataMatch[1]}`)();

          addLog(`Verificando encriptación PoW + AES para S${ep.season}xE${ep.episode}...`);
          const powChallengeMatch = iframeHtml.match(/POW_CHALLENGE\s*=\s*['"]([^'"]+)['"]/);
          const powDifficultyMatch = iframeHtml.match(/POW_DIFFICULTY\s*=\s*(\d+)/);
          const powSaltMatch = iframeHtml.match(/POW_SALT\s*=\s*['"]([^'"]+)['"]/);

          let aesKey: Uint8Array | null = null;
          if (powChallengeMatch && powDifficultyMatch && powSaltMatch) {
              aesKey = await solvePoW(powChallengeMatch[1], parseInt(powDifficultyMatch[1]), powSaltMatch[1]);
          } else {
              // Fallback to hardcoded from first implementation if not found (just in case)
              aesKey = await solvePoW('8147cce513624b7c73b28c9b7166d9df', 3, '6d07665b9850a0db');
          }

          if (aesKey) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const langGroup of parsedData) {
              if (langGroup.sortedEmbeds) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const embed of langGroup.sortedEmbeds) {
                  if (embed.link) embed.link = await decryptAES(embed.link, aesKey);
                }
              }
              if (langGroup.downloadEmbeds) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const embed of langGroup.downloadEmbeds) {
                  if (embed.link) embed.link = await decryptAES(embed.link, aesKey);
                }
              }
            }
          }

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
                  let cleanUrl: string | null = null;
                  const serverName = String(server.servername).toLowerCase();
                  const linkValue = server.link;

                  // 1. Check for JWT
                  const parts = linkValue.split('.');
                  if (parts.length === 3) {
                     try {
                       const base64Url = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                       const pad = base64Url.length % 4;
                       const padded = pad ? base64Url + '='.repeat(4 - pad) : base64Url;
                       const payload = JSON.parse(atob(padded));
                       if (payload.link) {
                         cleanUrl = payload.link.replace(/`/g, '').trim();
                       }
                     } catch (e) { /* Not a valid JWT, proceed to other checks */ }
                  }

                  // 2. If not a JWT, check if it's already a full URL or a direct ID for known hosts
                  if (!cleanUrl) {
                    if (linkValue.startsWith('http')) {
                        cleanUrl = linkValue;
                    } else if (serverName === 'voe') {
                        cleanUrl = `https://voe.sx/e/${linkValue}`;
                    } else if (serverName === 'filemoon') {
                        cleanUrl = `https://filemoon.sx/e/${linkValue}`;
                    }
                  }
                  
                  // 3. If still no URL, try decoding as Base64 (for servers like streamwish, vidhide)
                  if (!cleanUrl) {
                      try {
                          const decoded = atob(linkValue);
                          if (decoded.startsWith('http')) {
                              cleanUrl = decoded;
                          }
                      } catch (e) { /* Not Base64 */ }
                  }

                  if (cleanUrl) {
                        if (serverName === 'streamwish') {
                            addLog(`Resolviendo redirección de Streamwish...`);
                            cleanUrl = await resolveRedirect(cleanUrl);
                        }
                        
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
               } catch (e) {
                  console.error("Error procesando el enlace", e);
                  addLog(`Error al procesar enlace para ${server.servername}: ${e instanceof Error ? e.message : 'Error desconocido'}`);
               }
             }
          }

          if (latUrl || castUrl || subUrl) {
            finalResults.push({ season: ep.season, episode: ep.episode, lat: latUrl, cast: castUrl, sub: subUrl });
            addLog(`Éxito S${ep.season}xE${ep.episode} (${targetServer}) - LAT: ${!!latUrl}, CAST: ${!!castUrl}, SUB: ${!!subUrl}`);
          } else {
            addLog(`No se encontraron videos válidos para el servidor '${targetServer}' en S${ep.season}xE${ep.episode}`, true);
          }
        } catch (err) {
          addLog(`Error al procesar S${ep.season}xE${ep.episode}: ${err instanceof Error ? err.message : 'Error desconocido'}`, true);
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

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
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
        <h1 className="text-3xl font-bold text-gray-900">Extracción PelisplusHD (Series)</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Serie (PelisplusHD.bz)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://pelisplushd.bz/serie/..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 border p-2"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                  </select>
                </div>
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
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
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
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  />
                </div>
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
                      Temporada {res.season} - Episodio {res.episode}
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