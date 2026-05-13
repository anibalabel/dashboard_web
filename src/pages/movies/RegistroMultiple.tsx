import { useState, FormEvent } from 'react';
import { Search, Film, Loader2, CheckCircle, AlertCircle, RefreshCw, Copy } from 'lucide-react';
import {
  getPlusmovieMovie,
  getPlusmovieMovieByTitle,
  getPlusmovieMovieByVideosId,
  updatePlusmovieMovie,
  registerPlusmovieMovie,
  getDooplexMovie,
  registerDooplexMovie,
  getDocinesMovie,
  updateDocinesMovie,
  registerDocinesMovie
} from '../../services/api';
import {
  PlusmovieMovie,
  DooplexMovie,
  DocinesMovie
} from '../../types';
import { QUALITY_OPTIONS, SERVER_OPTIONS, HEADER_OPTIONS, LANG_OPTIONS, SOURCE_OPTIONS } from '../../lib/constants';

export default function RegistroMultiplePeliculas() {
  const [tmdbId, setTmdbId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  // Movies Data
  const [plusmovieData, setPlusmovieData] = useState<PlusmovieMovie | null>(null);
  const [plusmovieCandidates, setPlusmovieCandidates] = useState<PlusmovieMovie[]>([]);
  const [isUpdatingTmdb, setIsUpdatingTmdb] = useState<number | null>(null);
  const [isUpdatingDocines, setIsUpdatingDocines] = useState<number | null>(null);

  // Manual Search State
  const [manualVideosId, setManualVideosId] = useState('');
  const [isSearchingManual, setIsSearchingManual] = useState(false);

  const [dooplexData, setDooplexData] = useState<DooplexMovie | null>(null);
  const [docinesData, setDocinesData] = useState<DocinesMovie | null>(null);

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

  // Form Data - Global Language
  const handleGlobalLangChange = (newLang: string) => {
    setPlusmovieLang(newLang);
    setDooplexLang(newLang);
    setDocinesLang(newLang);
  };

  const handleGlobalHeaderChange = (newHeader: string) => {
    setPlusmovieHeader(newHeader);
    setDooplexHeader(newHeader);
    setDocinesHeader(newHeader);
    if (newHeader) setDooplexQuality(newHeader);
  };

  // Form Data - Plusmovie
  const [plusmovieLang, setPlusmovieLang] = useState('LAT');
  const [plusmovieHeader, setPlusmovieHeader] = useState('');
  
  // Form Data - Dooplex
  const [dooplexQuality, setDooplexQuality] = useState('1080P');
  const [dooplexHeader, setDooplexHeader] = useState('');
  const [dooplexLang, setDooplexLang] = useState('LAT');
  const [dooplexSource, setDooplexSource] = useState('embed');

  // Form Data - Docines
  const [docinesLang, setDocinesLang] = useState('LAT');
  const [docinesQuality, setDocinesQuality] = useState('1080P');
  const [docinesHeader, setDocinesHeader] = useState('');

  // Common Data
  const [urls, setUrls] = useState('');
  
  // Registration State
  const [isRegistering, setIsRegistering] = useState(false);
  const [progress, setProgress] = useState<{ total: number; current: number; logs: { msg: string, isError?: boolean }[] }>({
    total: 0,
    current: 0,
    logs: []
  });

  // Checkbox states for selective registration
  const [usePlusmovie, setUsePlusmovie] = useState(true);
  const [useDooplex, setUseDooplex] = useState(true);
  const [useDocines, setUseDocines] = useState(true);

  const handleUpdateTmdb = async (candidate: PlusmovieMovie) => {
    if (!tmdbId) return;
    setIsUpdatingTmdb(candidate.videos_id);
    
    // Prefer Dooplex name to ensure consistency if available
    const titleToUse = dooplexData ? dooplexData.title : candidate.title;
    
    try {
      await updatePlusmovieMovie({
        videos_id: candidate.videos_id,
        title: titleToUse,
        tmdbid: Number(tmdbId)
      });
      
      setPlusmovieData({ ...candidate, title: titleToUse, tmdbid: Number(tmdbId) });
      setPlusmovieCandidates([]);
      // Remove specific error message if present
      setError(prev => prev.replace('No se encontró la película en Plusmovie.', '').trim());
    } catch (err) {
      console.error(err);
      alert('Error al actualizar TMDB ID en Plusmovie');
    } finally {
      setIsUpdatingTmdb(null);
    }
  };

  const handleUpdateDocinesName = async (movie: DocinesMovie) => {
    if (!dooplexData) {
      alert('No se encontró información de Dooplex para usar como referencia.');
      return;
    }
    
    setIsUpdatingDocines(movie.id);
    
    try {
      await updateDocinesMovie({
        movies_id: movie.id,
        movie_name: dooplexData.title
      });
      
      setDocinesData({ ...movie, name: dooplexData.title });
    } catch (err) {
      console.error(err);
      alert('Error al actualizar el nombre en Docines');
    } finally {
      setIsUpdatingDocines(null);
    }
  };

  const handleManualIdSearch = async () => {
    if (!manualVideosId) return;
    setIsSearchingManual(true);
    setPlusmovieCandidates([]); // Clear previous candidates
    
    try {
      const res = await getPlusmovieMovieByVideosId(Number(manualVideosId));
      if (res.data && res.data.length > 0) {
        setPlusmovieCandidates(res.data);
        setError(prev => prev.replace('No se encontró la película en Plusmovie.', '').trim());
      } else {
        // Fallback: Si no lo encuentra por ID en movie_plusmovie.php, tal vez el endpoint no funciona igual, o es un error de tipado.
        alert('No se encontró ninguna película con ese Videos ID en Plusmovie.');
      }
    } catch (err) {
      console.error(err);
      alert('Error al buscar por Videos ID.');
    } finally {
      setIsSearchingManual(false);
    }
  };

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tmdbId) return;

    setIsSearching(true);
    setError('');
    setPlusmovieData(null);
    setDooplexData(null);
    setDocinesData(null);

    try {
      const [plusRes, doopRes, dociRes] = await Promise.allSettled([
        getPlusmovieMovie(tmdbId),
        getDooplexMovie(tmdbId),
        getDocinesMovie(tmdbId)
      ]);

      let foundPlusmovie: PlusmovieMovie | null = null;

      // Dooplex
      let dooplexTitle = '';
      if (doopRes.status === 'fulfilled' && doopRes.value.data && doopRes.value.data.length > 0) {
        setDooplexData(doopRes.value.data[0]);
        dooplexTitle = doopRes.value.data[0].title;
      }

      // Docines
      let docinesTitle = '';
      if (dociRes.status === 'fulfilled' && dociRes.value.data && dociRes.value.data.length > 0) {
        setDocinesData(dociRes.value.data[0]);
        docinesTitle = dociRes.value.data[0].name;
      }

      // Plusmovie
      if (plusRes.status === 'fulfilled' && plusRes.value.data && plusRes.value.data.length > 0) {
        foundPlusmovie = plusRes.value.data[0];
        setPlusmovieData(foundPlusmovie);
      } else {
        // Fallback: search by title if available
        const fallbackTitle = dooplexTitle || docinesTitle;
        let foundCandidate = false;
        
        if (fallbackTitle) {
          try {
            const candidatesRes = await getPlusmovieMovieByTitle(fallbackTitle);
            if (candidatesRes.data && candidatesRes.data.length > 0) {
              setPlusmovieCandidates(candidatesRes.data);
              foundCandidate = true;
            }
          } catch (err) {
            console.error("Error searching by title in Plusmovie", err);
          }
        }
        
        if (!foundCandidate) {
          setError(prev => prev ? `${prev} No se encontró la película en Plusmovie.` : 'No se encontró la película en Plusmovie.');
        }
      }

      if (
        !foundPlusmovie &&
        (doopRes.status === 'rejected' || (doopRes.status === 'fulfilled' && (!doopRes.value.data || doopRes.value.data.length === 0))) &&
        (dociRes.status === 'rejected' || (dociRes.status === 'fulfilled' && (!dociRes.value.data || dociRes.value.data.length === 0)))
      ) {
        setError('No se encontró la película en ninguna de las plataformas.');
      }

    } catch (err) {
      console.error(err);
      setError('Error al buscar la película.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleRegister = async () => {
    const urlList = urls.split('\n').map(u => u.trim()).filter(u => u);
    if (urlList.length === 0) {
      alert("Por favor ingresa al menos una URL.");
      return;
    }

    if (!plusmovieData && !dooplexData && !docinesData) {
      alert("No hay datos de película para registrar.");
      return;
    }

    setIsRegistering(true);
    setProgress({ total: urlList.length, current: 0, logs: [] });

    for (let i = 0; i < urlList.length; i++) {
      const currentUrl = urlList[i];
      const logPrefix = `[URL ${i + 1}]`;

      // Plusmovie Registration
      if (usePlusmovie && plusmovieData) {
        try {
          await registerPlusmovieMovie({
            videos_id: plusmovieData.videos_id,
            file_url: currentUrl,
            label: plusmovieHeader ? `${plusmovieLang} - ${plusmovieHeader}` : plusmovieLang
          });
          setProgress(prev => ({
            ...prev,
            logs: [{ msg: `${logPrefix} Plusmovie: Registrado correctamente.`, isError: false }, ...prev.logs]
          }));
        } catch {
          setProgress(prev => ({
            ...prev,
            logs: [{ msg: `${logPrefix} Plusmovie: Error al registrar.`, isError: true }, ...prev.logs]
          }));
        }
      }

      // Dooplex Registration
      if (useDooplex && dooplexData) {
        try {
          const sourceFlags = {
            embed: dooplexSource === 'embed' ? '1' : '0',
            youtubelink: dooplexSource === 'youtubelink' ? '1' : '0',
            hls: dooplexSource === 'hls' ? '1' : '0',
            supported_hosts: dooplexSource === 'supported_hosts' ? '1' : '0'
          };

          await registerDooplexMovie({
            movie_id: dooplexData.id,
            server: dooplexQuality,
            header: dooplexHeader,
            link: currentUrl,
            lang: dooplexLang,
            ...sourceFlags
          });
          setProgress(prev => ({
            ...prev,
            logs: [{ msg: `${logPrefix} Dooplex: Registrado correctamente.`, isError: false }, ...prev.logs]
          }));
        } catch {
          setProgress(prev => ({
            ...prev,
            logs: [{ msg: `${logPrefix} Dooplex: Error al registrar.`, isError: true }, ...prev.logs]
          }));
        }
      }

      // Docines Registration
      if (useDocines && docinesData) {
        try {
          await registerDocinesMovie({
            movie_id: docinesData.id,
            name: docinesHeader ? `${docinesLang} - ${docinesHeader}` : docinesLang,
            url: currentUrl,
            quality: docinesQuality
          });
          setProgress(prev => ({
            ...prev,
            logs: [{ msg: `${logPrefix} Docines: Registrado correctamente.`, isError: false }, ...prev.logs]
          }));
        } catch {
          setProgress(prev => ({
            ...prev,
            logs: [{ msg: `${logPrefix} Docines: Error al registrar.`, isError: true }, ...prev.logs]
          }));
        }
      }

      setProgress(prev => ({ ...prev, current: i + 1 }));
    }

    setIsRegistering(false);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-3">
        <Film className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Registro Múltiple de Películas</h1>
      </div>

      {/* Search Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        {/* Notification Toast */}
        {notification && (
          <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-md shadow-lg flex items-center gap-2 z-50">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <span className="text-sm">{notification}</span>
          </div>
        )}

        <form onSubmit={handleSearch} className="flex gap-4 items-end">
          <div className="flex-1">
            <label htmlFor="tmdbId" className="block text-sm font-medium text-gray-700 mb-1">
              TMDB ID de la Película
            </label>
            <input
              type="text"
              id="tmdbId"
              value={tmdbId}
              onChange={(e) => setTmdbId(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
              placeholder="Ej. 550"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            Buscar
          </button>
        </form>

        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        {!plusmovieData && plusmovieCandidates.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              No se encontró por ID, pero se encontraron coincidencias por título en Plusmovie:
            </h3>
            <div className="space-y-2">
              {plusmovieCandidates.map(candidate => (
                <div key={candidate.videos_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200">
                  <div>
                    <span className="font-medium text-gray-900 block">{candidate.title}</span>
                    <div className="text-xs text-gray-500 flex gap-2">
                      <span>ID: {candidate.videos_id}</span>
                      {candidate.tmdbid && <span>TMDB: {candidate.tmdbid}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateTmdb(candidate)}
                    disabled={isUpdatingTmdb === candidate.videos_id}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isUpdatingTmdb === candidate.videos_id ? 'Vinculando...' : 'Vincular TMDB'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!plusmovieData && (
          <div className="mt-6 border-t pt-4 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                ¿No aparece? Buscar manualmente en Plusmovie por ID
              </h3>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={manualVideosId}
                  onChange={(e) => setManualVideosId(e.target.value)}
                  placeholder="Videos ID (ej. 150)"
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleManualIdSearch}
                  disabled={isSearchingManual || !manualVideosId}
                  className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 text-sm font-medium"
                >
                  {isSearchingManual ? 'Buscando...' : 'Buscar ID'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings Grid */}
      {(plusmovieData || dooplexData || docinesData) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          {/* Plusmovie Card */}
          <div className={`bg-white rounded-lg shadow-sm border p-6 ${plusmovieData ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-200 opacity-70'}`}>
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h2 className="text-lg font-semibold text-gray-900">Plusmovie</h2>
              <input
                type="checkbox"
                checked={usePlusmovie}
                onChange={(e) => setUsePlusmovie(e.target.checked)}
                disabled={!plusmovieData}
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
            </div>
            
            {plusmovieData ? (
              <div className="space-y-4">
                <div className="text-sm">
                  <span className="text-gray-500 block">Título:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{plusmovieData.title}</span>
                    <button
                      type="button"
                      title="Copiar título"
                      onClick={() => copyToClipboard(plusmovieData.title)}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Actualizar TMDB y Título con los datos de Dooplex/Docines"
                      onClick={() => handleUpdateTmdb(plusmovieData)}
                      disabled={isUpdatingTmdb === plusmovieData.videos_id}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <RefreshCw className={`h-4 w-4 ${isUpdatingTmdb === plusmovieData.videos_id ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Header</label>
                  <select
                    value={plusmovieHeader}
                    onChange={(e) => handleGlobalHeaderChange(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                  >
                    {HEADER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Idioma (Label)</label>
                  <select
                    value={plusmovieLang}
                    onChange={(e) => handleGlobalLangChange(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                  >
                    {LANG_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">No encontrada</div>
            )}
          </div>

          {/* Dooplex Card */}
          <div className={`bg-white rounded-lg shadow-sm border p-6 ${dooplexData ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-200 opacity-70'}`}>
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h2 className="text-lg font-semibold text-gray-900">Dooplex</h2>
              <input
                type="checkbox"
                checked={useDooplex}
                onChange={(e) => setUseDooplex(e.target.checked)}
                disabled={!dooplexData}
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
            </div>

            {dooplexData ? (
              <div className="space-y-4">
                <div className="text-sm">
                  <span className="text-gray-500 block">Título:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{dooplexData.title}</span>
                    <button
                      type="button"
                      title="Copiar título"
                      onClick={() => copyToClipboard(dooplexData.title)}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Calidad</label>
                  <select
                    value={dooplexQuality}
                    onChange={(e) => setDooplexQuality(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                  >
                    {SERVER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Header</label>
                  <select
                    value={dooplexHeader}
                    onChange={(e) => handleGlobalHeaderChange(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                  >
                    {HEADER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
                  <select
                    value={dooplexLang}
                    onChange={(e) => handleGlobalLangChange(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                  >
                    {LANG_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                  <select
                    value={dooplexSource}
                    onChange={(e) => setDooplexSource(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                  >
                    {SOURCE_OPTIONS.map((opt) => (
                      <option key={opt.label} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">No encontrada</div>
            )}
          </div>

          {/* Docines Card */}
          <div className={`bg-white rounded-lg shadow-sm border p-6 ${docinesData ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-200 opacity-70'}`}>
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h2 className="text-lg font-semibold text-gray-900">Docines</h2>
              <input
                type="checkbox"
                checked={useDocines}
                onChange={(e) => setUseDocines(e.target.checked)}
                disabled={!docinesData}
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
            </div>

            {docinesData ? (
              <div className="space-y-4">
                <div className="text-sm">
                  <span className="text-gray-500 block">Título:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{docinesData.name}</span>
                    <button
                      type="button"
                      title="Copiar título"
                      onClick={() => copyToClipboard(docinesData.name)}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    {dooplexData && docinesData.name !== dooplexData.title && (
                      <button
                        type="button"
                        title="Actualizar título usando el de Dooplex"
                        onClick={() => handleUpdateDocinesName(docinesData)}
                        disabled={isUpdatingDocines === docinesData.id}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <RefreshCw className={`h-4 w-4 ${isUpdatingDocines === docinesData.id ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Calidad</label>
                    <select
                      value={docinesQuality}
                    onChange={(e) => setDocinesQuality(e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                    >
                      {QUALITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Header</label>
                    <select
                      value={docinesHeader}
                      onChange={(e) => handleGlobalHeaderChange(e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                    >
                      {HEADER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
                    <select
                      value={docinesLang}
                      onChange={(e) => handleGlobalLangChange(e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                    >
                      {LANG_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">No encontrada</div>
            )}
          </div>

        </div>
      )}

      {/* URLs and Action Section */}
      {(plusmovieData || dooplexData || docinesData) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">URLs de la Película</h2>
            <p className="text-sm text-gray-500 mb-2">Ingresa una URL por línea.</p>
            <textarea
              rows={8}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 font-mono text-sm"
              placeholder="https://example.com/movie.mp4&#10;https://mega.nz/..."
            ></textarea>

            <button
              onClick={handleRegister}
              disabled={isRegistering || !urls.trim() || (!usePlusmovie && !useDooplex && !useDocines)}
              className="w-full mt-4 bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
            >
              {isRegistering ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5" />
                  Iniciar Registro
                </>
              )}
            </button>
          </div>

          {/* Progress Log */}
          <div className="lg:col-span-1 bg-gray-50 rounded-lg border border-gray-200 p-4 h-full max-h-[500px] overflow-y-auto flex flex-col">
            <h3 className="font-medium text-gray-900 mb-2 flex justify-between sticky top-0 bg-gray-50 pb-2 border-b">
              <span>Progreso</span>
              <span>{progress.current} / {progress.total}</span>
            </h3>
            
            <div className="space-y-2 flex-1 overflow-y-auto">
              {progress.logs.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">Esperando inicio...</p>
              )}
              {progress.logs.map((log, idx) => (
                <div 
                  key={idx} 
                  className={`text-xs p-2 rounded border ${
                    log.isError 
                      ? 'bg-red-50 text-red-700 border-red-200' 
                      : 'bg-green-50 text-green-700 border-green-200'
                  }`}
                >
                  {log.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
