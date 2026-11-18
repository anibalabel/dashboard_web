import { useState, FormEvent } from 'react';
import { Search, Film, Loader2, CheckCircle, AlertCircle, Copy, Check, Link as LinkIcon, Layers } from 'lucide-react';
import { copyToClipboard } from '../../lib/clipboard';
import { getDooplexMovie, registerDooplexMovie } from '../../services/api';
import { DooplexMovie } from '../../types';
import { SERVER_OPTIONS, HEADER_OPTIONS, LANG_OPTIONS, SOURCE_OPTIONS } from '../../lib/constants';
import {
  DooplexSourceType,
  inferSourceFromSelection,
  prepareRegistrationLink,
} from '../../lib/registrationUtils';
import { useSnackbarStore } from '../../store/snackbarStore';

export default function DooplexRMovie() {
  const { showSnackbar } = useSnackbarStore();

  const [tmdbId, setTmdbId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  // Movie Data
  const [dooplexData, setDooplexData] = useState<DooplexMovie | null>(null);

  // Form Data - Dooplex
  const [dooplexQuality, setDooplexQuality] = useState('Otros');
  const [dooplexHeader, setDooplexHeader] = useState('Otros');
  const [dooplexLang, setDooplexLang] = useState('LAT');
  const [dooplexSource, setDooplexSource] = useState('embed');

  // Common Data
  const [urls, setUrls] = useState('');

  // Registration State
  const [isRegistering, setIsRegistering] = useState(false);
  const [progress, setProgress] = useState<{ total: number; current: number; logs: { msg: string; isError?: boolean }[] }>({
    total: 0,
    current: 0,
    logs: []
  });

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyText = async (text: string, key: string, successMsg?: string) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      showSnackbar(successMsg || 'Copiado al portapapeles', 'success');
      setTimeout(() => {
        setCopiedKey(prev => (prev === key ? null : prev));
      }, 2000);
    } else {
      showSnackbar('Error al copiar al portapapeles', 'error');
    }
  };

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tmdbId.trim()) return;

    setIsSearching(true);
    setError('');
    setDooplexData(null);
    setProgress({ total: 0, current: 0, logs: [] });

    try {
      const res = await getDooplexMovie(tmdbId.trim());
      if (res.data && res.data.length > 0) {
        setDooplexData(res.data[0]);
      } else {
        setError('No se encontró la película en Dooplex.');
      }
    } catch (err) {
      console.error(err);
      setError('Error al buscar la película en Dooplex. Verifica el ID de TMDB.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleRegister = async () => {
    const urlList = urls
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.length > 0);

    if (urlList.length === 0) {
      showSnackbar('Por favor ingresa al menos una URL.', 'error');
      return;
    }

    if (!dooplexData) {
      showSnackbar('No hay película seleccionada para registrar.', 'error');
      return;
    }

    setIsRegistering(true);
    setProgress({ total: urlList.length, current: 0, logs: [] });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < urlList.length; i++) {
      const rawUrl = urlList[i];
      const prepared = prepareRegistrationLink({
        url: rawUrl,
        server: dooplexQuality,
        header: dooplexHeader,
        source: dooplexSource as DooplexSourceType,
      });
      const logPrefix = `[URL ${i + 1}/${urlList.length}]`;

      try {
        await registerDooplexMovie({
          movie_id: dooplexData.id,
          server: prepared.server,
          header: prepared.header,
          link: prepared.link,
          lang: dooplexLang,
          ...prepared.sourceFlags
        });

        successCount++;
        setProgress(prev => ({
          ...prev,
          current: i + 1,
          logs: [
            { msg: `${logPrefix} Registrado exitosamente: ${prepared.link.substring(0, 50)}...`, isError: false },
            ...prev.logs
          ]
        }));
      } catch {
        errorCount++;
        setProgress(prev => ({
          ...prev,
          current: i + 1,
          logs: [
            { msg: `${logPrefix} Error al registrar: ${prepared.link.substring(0, 50)}...`, isError: true },
            ...prev.logs
          ]
        }));
      }
    }

    setIsRegistering(false);
    if (errorCount === 0) {
      showSnackbar(`¡${successCount} enlaces registrados con éxito en Dooplex!`, 'success');
    } else {
      showSnackbar(`Registro completado: ${successCount} exitosos, ${errorCount} fallidos`, 'info');
    }
  };

  const lineCount = urls.split('\n').filter(l => l.trim()).length;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 rounded-xl">
            <Film className="h-7 w-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dooplex R-Movie</h1>
            <p className="text-sm text-gray-500">Registro masivo de enlaces y servidores para películas en Dooplex</p>
          </div>
        </div>
      </div>

      {/* Search Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label htmlFor="tmdbId" className="block text-sm font-medium text-gray-700 mb-1">
              TMDB ID de la Película
            </label>
            <div className="relative">
              <input
                type="text"
                id="tmdbId"
                value={tmdbId}
                onChange={(e) => setTmdbId(e.target.value)}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5 pl-3 text-sm"
                placeholder="Ejemplo: 550, 27205, 157336..."
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isSearching || !tmdbId.trim()}
            className="w-full sm:w-auto bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium transition-colors"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar en Dooplex
          </button>
        </form>

        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2.5 border border-red-200 text-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Main Content when movie found */}
      {dooplexData && (
        <div className="space-y-8">
          {/* Movie Details Card & Config Form */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Movie Info Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/40 rounded-xl shadow-sm border border-blue-200/80 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-blue-200/60 mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-800 bg-blue-100/80 px-2.5 py-1 rounded-md">
                    Película Dooplex
                  </span>
                  <span className="text-xs text-gray-500 font-mono">ID: #{dooplexData.id}</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 block uppercase tracking-wide">Título</label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-lg font-bold text-gray-900 leading-tight">{dooplexData.title}</span>
                      <button
                        type="button"
                        title="Copiar título"
                        onClick={() => handleCopyText(dooplexData.title, 'movie-title', 'Título copiado')}
                        className={`p-1.5 rounded-md transition-colors ${
                          copiedKey === 'movie-title'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'text-gray-400 hover:text-blue-600 hover:bg-blue-100/50'
                        }`}
                      >
                        {copiedKey === 'movie-title' ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 bg-white px-2.5 py-1 rounded-md border border-gray-200 text-gray-700 font-mono">
                      <strong>TMDB:</strong> {tmdbId}
                    </span>
                    <span className="inline-flex items-center gap-1 bg-white px-2.5 py-1 rounded-md border border-gray-200 text-gray-700 font-mono">
                      <strong>Dooplex ID:</strong> {dooplexData.id}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-blue-200/60 flex items-center gap-2 text-xs text-blue-700 font-medium">
                <CheckCircle className="h-4 w-4 text-blue-600" />
                <span>Película vinculada y lista para registro</span>
              </div>
            </div>

            {/* Configuration Settings */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-200 mb-4">
                <Layers className="h-5 w-5 text-gray-700" />
                <h2 className="text-base font-bold text-gray-900">Configuración de Servidor y Enlaces</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Calidad / Server */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    Calidad / Servidor
                  </label>
                  <select
                    value={dooplexQuality}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDooplexQuality(val);
                      setDooplexHeader(val);
                      setDooplexSource(inferSourceFromSelection(val));
                    }}
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5 text-sm"
                  >
                    {SERVER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Header */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    Header (Opcional)
                  </label>
                  <select
                    value={dooplexHeader}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDooplexHeader(val);
                      setDooplexQuality(val);
                      setDooplexSource(inferSourceFromSelection(val));
                    }}
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5 text-sm"
                  >
                    {HEADER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Idioma */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    Idioma
                  </label>
                  <select
                    value={dooplexLang}
                    onChange={(e) => setDooplexLang(e.target.value)}
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5 text-sm"
                  >
                    {LANG_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Source */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    Tipo de Fuente (Source)
                  </label>
                  <select
                    value={dooplexSource}
                    onChange={(e) => setDooplexSource(e.target.value)}
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5 text-sm"
                  >
                    {SOURCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* URLs Input and Execution Log */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* URLs Textarea */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-3">
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-5 w-5 text-gray-700" />
                    <h2 className="text-base font-bold text-gray-900">URLs a Registrar</h2>
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-700 font-semibold px-2.5 py-1 rounded-full">
                    {lineCount} {lineCount === 1 ? 'enlace' : 'enlaces'}
                  </span>
                </div>

                <p className="text-xs text-gray-500 mb-3">
                  Pega uno o varios enlaces directos (un enlace por línea). Se registrarán en Dooplex con la configuración elegida.
                </p>

                <textarea
                  rows={9}
                  value={urls}
                  onChange={(e) => setUrls(e.target.value)}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-3 font-mono text-xs sm:text-sm resize-y"
                  placeholder="https://vidara.so/v/xyz123&#10;https://bysekoze.com/e/abc456&#10;https://playmogo.com/e/..."
                  spellCheck="false"
                />
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleRegister}
                  disabled={isRegistering || lineCount === 0}
                  className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 font-semibold shadow-sm transition-colors"
                >
                  {isRegistering ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Registrando en Dooplex... ({progress.current}/{progress.total})
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      Iniciar Registro ({lineCount})
                    </>
                  )}
                </button>

                {urls.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUrls('')}
                    disabled={isRegistering}
                    className="px-4 py-3 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs font-medium transition-colors"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            {/* Progress & Log Console */}
            <div className="lg:col-span-1 bg-gray-50 rounded-xl border border-gray-200 p-5 flex flex-col h-[400px] lg:h-auto">
              <div className="flex justify-between items-center pb-3 border-b border-gray-200 mb-3">
                <span className="text-sm font-bold text-gray-800">Consola de Registro</span>
                <span className="text-xs font-mono font-semibold text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-200">
                  {progress.current} / {progress.total}
                </span>
              </div>

              {/* Progress bar */}
              {progress.total > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2 mb-3 overflow-hidden">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round((progress.current / progress.total) * 100)}%`
                    }}
                  />
                </div>
              )}

              {/* Logs List */}
              <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                {progress.logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-8">
                    <Film className="h-8 w-8 mb-2 stroke-[1.5]" />
                    <p className="text-xs">Esperando inicio de registro...</p>
                  </div>
                ) : (
                  progress.logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`text-xs p-2.5 rounded-lg border leading-snug font-mono break-all ${
                        log.isError
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {log.msg}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
