import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, Copy, AlertCircle, Terminal, Check, CheckCircle } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDoodstreamUrl } from '@/lib/doodstreamUtils';
import { getProxyUrl } from '@/lib/proxy';

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

export default function ScraperCinemitasSeries() {
  const [url, setUrl] = useState('');
  const [targetServer, setTargetServer] = useState('TODOS');
  const [targetSeason, setTargetSeason] = useState('');
  const [limit, setLimit] = useState('');
  
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
    // Usar nuestro proxy PHP que maneja headers correctamente
    const proxy = getProxyUrl(targetUrl, { referer: refererUrl });
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
    // Usar nuestro proxy PHP para peticiones POST complejas
    const proxy = getProxyUrl(targetUrl, { referer: refererUrl });
    
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
      const baseUrl = new URL(url).origin;

      // 2. Búsqueda de los enlaces de los Episodios
      addLog('Buscando enlaces de episodios en el HTML...');
      const links = Array.from(doc.querySelectorAll('a[href*="episodio"], a[href*="capitulo"], a[href*="episode"]'));
      const epLinks: EpisodeLink[] = [];

      links.forEach(a => {
        const href = a.getAttribute('href') || '';
        const text = a.textContent || '';
        let s = 0, e = 0;

        // Validaciones Regex (Cinemitas suele usar formato "1x02" en el texto o URL)
        const textMatch = text.match(/(\d+)\s*x\s*(\d+)/i);
        const urlMatch = href.match(/-(\d+)x(\d+)/i);
        
        if (urlMatch) {
          s = parseInt(urlMatch[1]);
          e = parseInt(urlMatch[2]);
        } else if (textMatch) {
          s = parseInt(textMatch[1]);
          e = parseInt(textMatch[2]);
        }

        if (s > 0 && e > 0) {
          const fullUrl = href.startsWith('http') ? href : new URL(href, url).href;
          if (!epLinks.some(ep => ep.season === s && ep.episode === e)) {
            epLinks.push({ season: s, episode: e, url: fullUrl });
          }
        }
      });

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
          const epHtml = await fetchGET(ep.url, url);
          const epDoc = new DOMParser().parseFromString(epHtml, 'text/html');
          
          // 2. Extraer configuración AJAX tipo DooPlay/DT
          let playerApi = '';
          let adminAjaxUrl = '';
          let nonce = '';

          // Buscar en dtAjax = {...} primero (la forma más común en Dooplay moderno)
          const dtAjaxMatch = epHtml.match(/dtAjax\s*=\s*(\{[\s\S]*?\})/i);
          if (dtAjaxMatch) {
             try {
                let jsonStr = dtAjaxMatch[1];
                jsonStr = jsonStr.replace(/,\s*}/g, '}');
                const dtAjaxObj = new Function(`return ${jsonStr}`)();
                
                if (dtAjaxObj.player_api) playerApi = dtAjaxObj.player_api;
                if (dtAjaxObj.url) adminAjaxUrl = dtAjaxObj.url;
                if (dtAjaxObj.nonce) nonce = dtAjaxObj.nonce;
             } catch (err) {
                console.warn(`Error parseando dtAjax en S${ep.season}xE${ep.episode}:`, err);
             }
           }

          // Si no se encontró en dtAjax, buscar en scripts base64
          if (!playerApi || !adminAjaxUrl) {
            const scripts = Array.from(epDoc.querySelectorAll('script[id*="dt"][id*="ajax"]'));
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
                  console.warn(`Error decodificando script base64 en S${ep.season}xE${ep.episode}`, e);
                }
              }
            }
          }

          // Si no se encontró en base64, buscar en el HTML general
          if (!adminAjaxUrl) {
            const ajaxMatch = epHtml.match(/admin_ajax["']?\s*:\s*["']([^"']+)["']/i) || epHtml.match(/url["']?\s*:\s*["']([^"']+admin-ajax\.php[^"']*)["']/i);
            if (ajaxMatch) adminAjaxUrl = ajaxMatch[1].replace(/\\/g, '');
          }
          if (!playerApi) {
            const apiMatch = epHtml.match(/player_api["']?\s*:\s*["']([^"']+)["']/i);
            if (apiMatch) playerApi = apiMatch[1].replace(/\\/g, '');
          }
          if (!nonce) {
            const nonceMatch = epHtml.match(/nonce["']?\s*:\s*["']([^"']+)["']/i);
            if (nonceMatch) nonce = nonceMatch[1];
          }

          // Normalizar adminAjaxUrl a absoluta si es relativa
          if (adminAjaxUrl && adminAjaxUrl.startsWith('/')) {
             adminAjaxUrl = `${baseUrl}${adminAjaxUrl}`;
          }

          // Fallback para admin_ajax si sigue vacio
          if (!adminAjaxUrl) {
            adminAjaxUrl = `${baseUrl}/wp-admin/admin-ajax.php`;
          }

          // Extraer opciones de video (Dooplay theme)
          const options = Array.from(epDoc.querySelectorAll('li.dooplay_player_option, li[data-post]'));
          
          let latUrl = null;
          let castUrl = null;
          let subUrl = null;

          // Función auxiliar para verificar si una URL coincide con el servidor objetivo
          const matchServer = (urlOrText: string, target: string): boolean => {
             if (!urlOrText) return false;
             if (target === 'TODOS') return true;
             const lower = urlOrText.toLowerCase();
             if (target === 'uqload') return lower.includes('uqload');
             if (target === 'vidara') return lower.includes('vidara');
             if (target === 'byse') return lower.includes('bysezoxexe') || lower.includes('byse');
             if (target === 'audinifer') return lower.includes('audinifer');
             if (target === 'earnvids' || target === 'smoothpre') return lower.includes('earnvids') || lower.includes('earnvid') || lower.includes('smoothpre');
             return lower.includes(target.toLowerCase());
          };

          // Función auxiliar para extraer links de video (Uqload, Vidara, Bysezoxexe, Audinifer, EarnVids)
          const extractVideoUrl = (text: string, serverFilter = targetServer): string | null => {
             if (!text) return null;
             if (typeof text === 'string') {
                try {
                  const json = JSON.parse(text);
                  if (json.embed_url) {
                     text = typeof json.embed_url === 'string' ? json.embed_url : JSON.stringify(json.embed_url);
                  }
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (err) {
                   // Ignorar error de parseo JSON
                }
             }

             // 1. Búsqueda en iframes/embeds
             const iframeMatch = text.match(/<(?:iframe|embed)[^>]+src=["']([^"']+)["']/i);
             if (iframeMatch) {
                let cleanUrl = iframeMatch[1].replace(/\\/g, '').replace(/["']/g, '').trim();
                if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
                if (serverFilter === 'TODOS') {
                   if (/(?:uqload|vidara|bysezoxexe|audinifer|earnvids|smoothpre)/i.test(cleanUrl) || /^https?:\/\//i.test(cleanUrl)) {
                      return cleanUrl;
                   }
                } else if (matchServer(cleanUrl, serverFilter)) {
                   return cleanUrl;
                }
             }

             // 2. Regex según servidor
             let regex: RegExp;
             if (serverFilter === 'uqload') {
                regex = /https?:\/\/[^\s"'<>]*uqload[^\s"'<>]*/gi;
             } else if (serverFilter === 'vidara') {
                regex = /https?:\/\/[^\s"'<>]*vidara[^\s"'<>]*/gi;
             } else if (serverFilter === 'byse') {
                regex = /https?:\/\/[^\s"'<>]*(?:bysezoxexe|byse)[^\s"'<>]*/gi;
             } else if (serverFilter === 'audinifer') {
                regex = /https?:\/\/[^\s"'<>]*audinifer[^\s"'<>]*/gi;
             } else if (serverFilter === 'earnvids' || serverFilter === 'smoothpre') {
                regex = /https?:\/\/[^\s"'<>]*(?:earnvids|smoothpre)[^\s"'<>]*/gi;
             } else {
                regex = /https?:\/\/[^\s"'<>]*(?:uqload|vidara|bysezoxexe|audinifer|earnvids|smoothpre)[^\s"'<>]*/gi;
             }

             const matches = text.match(regex);
             if (matches && matches.length > 0) {
                let cleanUrl = matches[0].replace(/\\/g, '').replace(/["']/g, '').trim();
                if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
                return cleanUrl;
             }

             // 3. Comprobación si el texto limpio es directamente la URL
             const trimmed = text.replace(/\\/g, '').replace(/["']/g, '').trim();
             if (serverFilter === 'TODOS') {
                if (/^(?:https?:)?\/\/[^\s"'<>]*(?:uqload|vidara|bysezoxexe|audinifer|earnvids|smoothpre)/i.test(trimmed)) {
                   return trimmed.startsWith('//') ? 'https:' + trimmed : trimmed;
                }
             } else {
                if (matchServer(trimmed, serverFilter) && /^(?:https?:)?\/\//i.test(trimmed)) {
                   return trimmed.startsWith('//') ? 'https:' + trimmed : trimmed;
                }
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

             // Vía A: player_api (GET)
             if (playerApi && !foundUrl) {
                try {
                   const apiTarget = playerApi.startsWith('http') ? playerApi : `${baseUrl}${playerApi.startsWith('/') ? '' : '/'}${playerApi}`;
                   const getUrl = `${apiTarget}?post=${postId}&nume=${nume}&type=${type}`;
                   const getResponse = await fetchGET(getUrl, ep.url);
                   foundUrl = extractVideoUrl(getResponse);
                } catch (err) {
                   console.warn(`Fallo Vía A en S${ep.season}xE${ep.episode}:`, err);
                }
             }

             // Vía B: admin-ajax (POST) con fallbacks de action
             if (!foundUrl && adminAjaxUrl) {
                const actions = ['doo_player_ajax', 'dooplay_player', 'dt_player_ajax'];
                
                for (const action of actions) {
                   if (foundUrl) break;
                   
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
                      const postResponse = await fetchPOST(adminAjaxUrl, body, ep.url);
                      const responseStr = typeof postResponse === 'object' ? JSON.stringify(postResponse) : postResponse;
                      foundUrl = extractVideoUrl(responseStr);
                   } catch (err) {
                      console.warn(`Fallo Vía B POST (${action}) en S${ep.season}xE${ep.episode}:`, err);
                   }
                }
             }

             if (foundUrl) {
                const formatted = formatDoodstreamUrl(foundUrl, targetServer);
                if (lang === 'LAT' && !latUrl) latUrl = formatted;
                else if (lang === 'CAST' && !castUrl) castUrl = formatted;
                else if (lang === 'SUB' && !subUrl) subUrl = formatted;
             }
          }

          if (latUrl || castUrl || subUrl) {
            finalResults.push({ season: ep.season, episode: ep.episode, lat: latUrl, cast: castUrl, sub: subUrl });
            addLog(`Éxito S${ep.season}xE${ep.episode} (${targetServer}) - LAT: ${!!latUrl}, CAST: ${!!castUrl}, SUB: ${!!subUrl}`);
          } else {
            addLog(`No se encontraron videos válidos para '${targetServer}' en S${ep.season}xE${ep.episode}`, true);
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

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 relative">
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2.5 border border-gray-700 animate-fade-in-down">
          <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{notification}</span>
        </div>
      )}
      <div className="mb-8 flex items-center gap-3">
        <PlayCircle className="h-8 w-8 text-indigo-600" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción Cinemitas (Series)</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Serie (Cinemitas)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://cinemitas.com/serie/..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Servidor a Buscar
                </label>
                <select
                  value={targetServer}
                  onChange={(e) => setTargetServer(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2 bg-white text-gray-800"
                >
                  <option value="TODOS">Todos los Servidores (Auto)</option>
                  <option value="earnvids">EarnVids (smoothpre.com)</option>
                  <option value="uqload">Uqload</option>
                  <option value="vidara">Vidara (vidara.so)</option>
                  <option value="byse">Byse (bysezoxexe.com)</option>
                  <option value="audinifer">Audinifer (audinifer.com)</option>
                </select>
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
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2"
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
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2"
                  />
                </div>
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
                        Temporada {res.season} - Episodio {res.episode}
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