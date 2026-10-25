import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, AlertCircle, Terminal, Copy, Check, CheckCircle } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDoodstreamUrl } from '@/lib/doodstreamUtils';
import { getProxyUrl } from '@/lib/proxy';

type AllowedHost = 'voe.sx' | 'bysevepoin.com' | 'vidsonic.net' | 'dtpg.rpmplay.xyz' | 'gdtvid.p2pplay.pro' | 'ok.ru';

type ScrapedServer = {
  title: string;
  src: string;
  host: AllowedHost;
};

interface ScrapedResult {
  lat?: ScrapedServer[];
  cast?: ScrapedServer[];
  sub?: ScrapedServer[];
}

export default function ScraperMoviesGnulaV2() {
  const [url, setUrl] = useState('');
  const [serverType, setServerType] = useState<'all' | AllowedHost>('all');

  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [results, setResults] = useState<ScrapedResult[]>([]);

  const addLog = (msg: string, isError = false) => {
    setLogs(prev => [...prev, { msg, isError }]);
  };

  const fetchHTML = async (targetUrl: string) => {
    const proxy = getProxyUrl(targetUrl);
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
      const html = await fetchHTML(url);
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const allowedHosts: AllowedHost[] = ['voe.sx', 'bysevepoin.com', 'vidsonic.net', 'dtpg.rpmplay.xyz', 'gdtvid.p2pplay.pro', 'ok.ru'];

      const scripts = Array.from(doc.querySelectorAll('script'));
      let gdArraySource: string | null = null;

      for (const s of scripts) {
        const txt = s.textContent || '';
        if (!txt.includes('var _gd')) continue;
        const m = txt.match(/var\s+_gd\s*=\s*(\[[\s\S]*?\])\s*;/);
        if (m?.[1]) {
          gdArraySource = m[1];
          break;
        }
      }

      if (!gdArraySource) {
        const m = html.match(/var\s+_gd\s*=\s*(\[[\s\S]*?\])\s*;/);
        if (m?.[1]) gdArraySource = m[1];
      }

      if (!gdArraySource) {
        addLog('No se encontró la variable _gd en scripts de la página.', true);
        throw new Error('_gd no encontrado');
      }

      addLog('Encontrado script con _gd. Parseando...');

      let gd: unknown;
      try {
        gd = new Function(`return (${gdArraySource});`)();
      } catch (err) {
        addLog('No se pudo parsear el contenido de _gd.', true);
        throw err;
      }

      if (!Array.isArray(gd)) {
        addLog('El contenido de _gd no es un array válido.', true);
        throw new Error('_gd inválido');
      }

      const extractLangKey = (label: unknown): 'lat' | 'cast' | 'sub' | null => {
        if (typeof label !== 'string') return null;
        const t = label.toLowerCase();
        if (t.includes('lat')) return 'lat';
        if (t.includes('cast')) return 'cast';
        if (t.includes('sub')) return 'sub';
        return null;
      };

      const parseServer = (server: unknown): ScrapedServer | null => {
        if (server === null || typeof server !== 'object') return null;
        const s = server as { title?: unknown; src?: unknown };
        if (typeof s.title !== 'string' || typeof s.src !== 'string') return null;
        let host: string;
        try {
          const rawHost = new URL(s.src).hostname.toLowerCase();
          if (rawHost === 'ok.ru' || rawHost.endsWith('.ok.ru')) host = 'ok.ru';
          else if (rawHost === 'vidsonic.net' || rawHost.endsWith('.vidsonic.net')) host = 'vidsonic.net';
          else host = rawHost;
        } catch {
          return null;
        }
        if (!allowedHosts.includes(host as AllowedHost)) return null;
        if (serverType !== 'all' && host !== serverType) return null;
        return { title: s.title, src: formatDoodstreamUrl(s.src, s.title || host), host: host as AllowedHost };
      };

      const acc: ScrapedResult = {};

      for (const entry of gd) {
        if (entry === null || typeof entry !== 'object') continue;
        const e = entry as { label?: unknown; servers?: unknown };
        const key = extractLangKey(e.label);
        if (!key) continue;
        if (!Array.isArray(e.servers)) continue;

        const filtered = e.servers.map(parseServer).filter(Boolean) as ScrapedServer[];
        if (filtered.length === 0) continue;

        const existing = (acc[key] || []) as ScrapedServer[];
        acc[key] = [...existing, ...filtered];
      }

      if ((acc.lat?.length || 0) + (acc.cast?.length || 0) + (acc.sub?.length || 0) === 0) {
        addLog('No se encontraron enlaces de servidores permitidos en _gd.', true);
        setResults([]);
        return;
      }

      setResults([acc]);
      addLog(
        `Éxito - LAT: ${acc.lat?.length || 0}, CAST: ${acc.cast?.length || 0}, SUB: ${acc.sub?.length || 0}`
      );
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
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {notification && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-md shadow-lg flex items-center gap-2 z-50">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <span className="text-sm">{notification}</span>
        </div>
      )}

      <div className="mb-8 flex items-center gap-3">
        <PlayCircle className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción Movies Gnula V2</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL de la Película (Gnula)</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Servidor</label>
                  <select
                    value={serverType}
                    onChange={(e) => setServerType(e.target.value as 'all' | AllowedHost)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  >
                    <option value="all">Todos (permitidos)</option>
                    <option value="vidsonic.net">vidsonic.net</option>
                    <option value="dtpg.rpmplay.xyz">dtpg.rpmplay.xyz</option>
                    <option value="gdtvid.p2pplay.pro">gdtvid.p2pplay.pro</option>
                    <option value="ok.ru">ok.ru</option>
                    <option value="bysevepoin.com">bysevepoin.com</option>
                    <option value="voe.sx">voe.sx</option>
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
                      <h3 className="font-bold text-gray-800 text-base">Enlaces de la Película</h3>
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
                          <span className="text-xs text-gray-500 max-w-[100px] truncate shrink-0">{s.host}</span>
                          <a href={s.src} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono" title={s.src}>
                            {s.src}
                          </a>
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
                          <span className="text-xs text-gray-500 max-w-[100px] truncate shrink-0">{s.host}</span>
                          <a href={s.src} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono" title={s.src}>
                            {s.src}
                          </a>
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
                          <span className="text-xs text-gray-500 max-w-[100px] truncate shrink-0">{s.host}</span>
                          <a href={s.src} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono" title={s.src}>
                            {s.src}
                          </a>
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
