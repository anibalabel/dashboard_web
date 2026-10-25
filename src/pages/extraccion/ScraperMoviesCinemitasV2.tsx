import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, AlertCircle, Terminal, Copy, Check, CheckCircle } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDoodstreamUrl } from '@/lib/doodstreamUtils';

interface ScrapedResult {
  lat?: { nume: string; title: string; src: string }[];
  cast?: { nume: string; title: string; src: string }[];
  sub?: { nume: string; title: string; src: string }[];
}

export default function ScraperMoviesCinemitasV2() {
  const [url, setUrl] = useState('');
  const [targetServer, setTargetServer] = useState('TODOS');
  
  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [results, setResults] = useState<ScrapedResult[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  const CINEMITAS_ADMIN_AJAX = 'https://cinemitas.org/wp-admin/admin-ajax.php';

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const addLog = (msg: string, isError = false) => {
    setLogs(prev => [...prev, { msg, isError }]);
  };

  const fetchGET = async (targetUrl: string, refererUrl: string) => {
    // Usar nuestro proxy PHP local que maneja headers correctamente
    const proxy = `/api/proxy?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(refererUrl)}`;
    try {
      const res = await fetch(proxy);
      if (!res.ok) throw new Error(`Error ${res.status} al conectar con el proxy local`);
      return await res.text();
    } catch (error) {
      console.error('Error en proxy local GET:', error);
      throw error;
    }
  };

  const fetchPOSTFormData = async (targetUrl: string, body: FormData, refererUrl: string) => {
    const proxy = `/api/proxy?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(refererUrl)}`;
    const res = await fetch(proxy, { method: 'POST', body });
    if (!res.ok) throw new Error(`Error ${res.status} al conectar con el proxy local`);

    const raw = await res.text();
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
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

      try {
        // 2. Extraer opciones de reproductor
        let options = Array.from(doc.querySelectorAll("li.dooplay_player_option[id^='player-option-']"));
        if (options.length === 0) {
          options = Array.from(doc.querySelectorAll('li.dooplay_player_option'));
        }

        addLog(`Opciones dooplay_player_option encontradas: ${options.length}`);
        for (const opt of options) {
          const id = opt.getAttribute('id') || '';
          const postId = opt.getAttribute('data-post') || '';
          const nume = opt.getAttribute('data-nume') || '';
          const type = opt.getAttribute('data-type') || '';
          const title = (opt.querySelector('span.title')?.textContent || '').trim();

          addLog(
            `<li id='${id}' class='dooplay_player_option' data-type='${type}' data-post='${postId}' data-nume='${nume}'><span class='title'>${title}</span></li>`
          );
        }
        
        const latLinks: { nume: string; title: string; src: string }[] = [];
        const castLinks: { nume: string; title: string; src: string }[] = [];
        const subLinks: { nume: string; title: string; src: string }[] = [];

        const responsePreview = (value: unknown) => {
          if (typeof value === 'string') return value.length > 800 ? `${value.slice(0, 800)}…` : value;
          try {
            const str = JSON.stringify(value);
            return str.length > 800 ? `${str.slice(0, 800)}…` : str;
          } catch {
            return String(value);
          }
        };

        const extractEmbedUrl = (value: unknown, depth = 0): string | null => {
          if (!value || depth > 5) return null;
          if (typeof value !== 'object') return null;

          if ('embed_url' in value) {
            const maybe = (value as { embed_url?: unknown }).embed_url;
            if (typeof maybe === 'string') {
              const iframeMatch = maybe.match(/<(?:iframe|embed)[^>]+src=["']([^"']+)["']/i);
              if (iframeMatch) return iframeMatch[1];
              return maybe;
            }
          }

          if ('data' in value) {
            const nested = extractEmbedUrl((value as { data?: unknown }).data, depth + 1);
            if (nested) return nested;
          }

          if (Array.isArray(value)) {
            for (const item of value) {
              const nested = extractEmbedUrl(item, depth + 1);
              if (nested) return nested;
            }
            return null;
          }

          for (const nestedValue of Object.values(value as Record<string, unknown>)) {
            const nested = extractEmbedUrl(nestedValue, depth + 1);
            if (nested) return nested;
          }

          return null;
        };

        for (const opt of options) {
           const id = opt.getAttribute('id') || '';
           const postId = opt.getAttribute('data-post');
           const nume = opt.getAttribute('data-nume');
           const type = opt.getAttribute('data-type');
           const rawTitle = (opt.querySelector('span.title')?.textContent || opt.textContent || '') as string;
           const title = rawTitle.trim();
           const label = title.toLowerCase();
           
           if (!postId || !nume || !type) continue;
           if (id === 'player-option-trailer' || nume === 'trailer') continue;
           
           // Clasificar idioma
            let lang = 'UNK';
            if (label.includes('cast') || label.includes('castellano')) {
               lang = 'CAST';
            } else if (label.includes('lat') || label.includes('latino') || label.includes('esp')) {
               lang = 'LAT';
            } else if (label.includes('sub') || label.includes('en')) {
               lang = 'SUB';
            }

            addLog(`POST admin-ajax: action=doo_player_ajax post=${postId} nume=${nume} type=movie (${lang})`);
            const form = new FormData();
            form.append('action', 'doo_player_ajax');
            form.append('post', postId);
            form.append('nume', nume);
            form.append('type', 'movie');

            let embedUrl: string | null = null;
            try {
              const response = await fetchPOSTFormData(CINEMITAS_ADMIN_AJAX, form, url);
              addLog(`Respuesta admin-ajax (nume=${nume}): ${responsePreview(response)}`);
              embedUrl = extractEmbedUrl(response);
            } catch (err) {
              addLog(`Fallo admin-ajax: ${err instanceof Error ? err.message : 'Error desconocido'}`, true);
            }

            if (!embedUrl) {
              addLog(`Sin embed_url (nume=${nume})`, true);
              continue;
            }

            embedUrl = embedUrl.replace(/\\/g, '').replace(/["'`]/g, '').trim();
            if (embedUrl.startsWith('//')) embedUrl = `https:${embedUrl}`;

            // Función auxiliar para verificar servidor
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

            if (targetServer !== 'TODOS') {
              const matchesTarget = matchServer(embedUrl, targetServer) || matchServer(title, targetServer);
              if (!matchesTarget) {
                addLog(`Descartado (no coincide con ${targetServer}): ${embedUrl}`);
                continue;
              }
            }

            const formattedSrc = formatDoodstreamUrl(embedUrl, targetServer || title);
            addLog(`URL final (nume=${nume}): ${formattedSrc}`);
            const item = { nume, title, src: formattedSrc };
            if (lang === 'LAT') {
              if (!latLinks.some(x => x.src === item.src)) latLinks.push(item);
            } else if (lang === 'CAST') {
              if (!castLinks.some(x => x.src === item.src)) castLinks.push(item);
            } else if (lang === 'SUB') {
              if (!subLinks.some(x => x.src === item.src)) subLinks.push(item);
            }
        }

        if (latLinks.length > 0 || castLinks.length > 0 || subLinks.length > 0) {
          finalResults.push({
            lat: latLinks.length > 0 ? latLinks : undefined,
            cast: castLinks.length > 0 ? castLinks : undefined,
            sub: subLinks.length > 0 ? subLinks : undefined,
          });
          addLog(`Éxito (${targetServer}) - LAT: ${latLinks.length > 0}, CAST: ${castLinks.length > 0}, SUB: ${subLinks.length > 0}`);
        } else {
          addLog(`No se encontraron enlaces válidos para '${targetServer}' en la página`, true);
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
        .flatMap(r => [...(r.lat || []), ...(r.cast || []), ...(r.sub || [])].map(x => x.src))
        .filter(Boolean)
        .join('\n');
      label = 'todos los enlaces';
    } else {
      links = results
        .flatMap(r => (r[type] || []).map(x => x.src))
        .filter(Boolean)
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
        <h1 className="text-3xl font-bold text-gray-900">Cinemitas Movies V2</h1>
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
                        Enlaces de la Película
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          const movieLinks = [...(res.lat || []), ...(res.cast || []), ...(res.sub || [])].map(x => x.src).filter(Boolean).join('\n');
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
                      {(res.lat || []).map((s, i) => (
                        <div key={`lat-${i}`} className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-gray-200 hover:border-blue-300 transition-colors">
                          <span className="font-semibold text-xs text-blue-800 bg-blue-100 px-2 py-1 rounded w-14 text-center shrink-0">LAT</span>
                          <span className="text-xs text-gray-500 w-16 text-right shrink-0">nume {s.nume}</span>
                          <a href={s.src} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono" title={s.src}>{s.src}</a>
                          <button 
                            type="button"
                            onClick={() => handleCopy(s.src, `lat-${idx}-${i}`)} 
                            className={`p-1.5 rounded transition-all shrink-0 ${
                              copiedKey === `lat-${idx}-${i}`
                                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                                : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                            }`}
                            title="Copiar enlace Latino"
                          >
                            {copiedKey === `lat-${idx}-${i}` ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      ))}
                      
                      {(res.cast || []).map((s, i) => (
                        <div key={`cast-${i}`} className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-gray-200 hover:border-red-300 transition-colors">
                          <span className="font-semibold text-xs text-red-800 bg-red-100 px-2 py-1 rounded w-14 text-center shrink-0">CAST</span>
                          <span className="text-xs text-gray-500 w-16 text-right shrink-0">nume {s.nume}</span>
                          <a href={s.src} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono" title={s.src}>{s.src}</a>
                          <button 
                            type="button"
                            onClick={() => handleCopy(s.src, `cast-${idx}-${i}`)} 
                            className={`p-1.5 rounded transition-all shrink-0 ${
                              copiedKey === `cast-${idx}-${i}`
                                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                                : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                            }`}
                            title="Copiar enlace Castellano"
                          >
                            {copiedKey === `cast-${idx}-${i}` ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      ))}

                      {(res.sub || []).map((s, i) => (
                        <div key={`sub-${i}`} className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-gray-200 hover:border-green-300 transition-colors">
                          <span className="font-semibold text-xs text-green-800 bg-green-100 px-2 py-1 rounded w-14 text-center shrink-0">SUB</span>
                          <span className="text-xs text-gray-500 w-16 text-right shrink-0">nume {s.nume}</span>
                          <a href={s.src} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono" title={s.src}>{s.src}</a>
                          <button 
                            type="button"
                            onClick={() => handleCopy(s.src, `sub-${idx}-${i}`)} 
                            className={`p-1.5 rounded transition-all shrink-0 ${
                              copiedKey === `sub-${idx}-${i}`
                                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                                : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                            }`}
                            title="Copiar enlace Subtitulado"
                          >
                            {copiedKey === `sub-${idx}-${i}` ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      ))}
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
