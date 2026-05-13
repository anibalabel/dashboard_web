import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, Copy, AlertCircle, Terminal, CheckCircle } from 'lucide-react';

type AllowedHost = 'voe.sx' | 'bysevepoin.com' | 'vidsonic.net';

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
      addLog(`Iniciando petición a: ${url}`);
      const html = await fetchHTML(url);
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const allowedHosts: AllowedHost[] = ['voe.sx', 'bysevepoin.com', 'vidsonic.net'];

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
          host = new URL(s.src).hostname;
        } catch {
          return null;
        }
        if (!allowedHosts.includes(host as AllowedHost)) return null;
        if (serverType !== 'all' && host !== serverType) return null;
        return { title: s.title, src: s.src, host: host as AllowedHost };
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
                    <h3 className="font-bold text-gray-800 mb-3 text-lg border-b border-gray-200 pb-2">Enlaces de la Película</h3>

                    <div className="space-y-2">
                      {(res.lat || []).map((s, i) => (
                        <div key={`lat-${i}`} className="flex items-center justify-between gap-4 bg-white p-2 rounded border border-gray-100">
                          <span className="font-semibold text-xs text-blue-800 bg-blue-100 px-2 py-1 rounded w-16 text-center">LAT</span>
                          <a href={s.src} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline break-all flex-1" title={s.src}>
                            {s.src}
                          </a>
                          <button
                            onClick={() => copyToClipboard(s.src)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      ))}

                      {(res.cast || []).map((s, i) => (
                        <div key={`cast-${i}`} className="flex items-center justify-between gap-4 bg-white p-2 rounded border border-gray-100">
                          <span className="font-semibold text-xs text-red-800 bg-red-100 px-2 py-1 rounded w-16 text-center">CAST</span>
                          <a href={s.src} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline break-all flex-1" title={s.src}>
                            {s.src}
                          </a>
                          <button
                            onClick={() => copyToClipboard(s.src)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      ))}

                      {(res.sub || []).map((s, i) => (
                        <div key={`sub-${i}`} className="flex items-center justify-between gap-4 bg-white p-2 rounded border border-gray-100">
                          <span className="font-semibold text-xs text-green-800 bg-green-100 px-2 py-1 rounded w-16 text-center">SUB</span>
                          <a href={s.src} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline break-all flex-1" title={s.src}>
                            {s.src}
                          </a>
                          <button
                            onClick={() => copyToClipboard(s.src)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Copy className="h-4 w-4" />
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
