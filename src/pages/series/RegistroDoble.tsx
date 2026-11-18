import { useState, useEffect, FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, PlayCircle, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import {
  getDooplexSeries,
  getDooplexSeasons,
  getDooplexEpisodes,
  getPlusmovieSeries,
  getPlusmovieSeasons,
  getPlusmovieSeriesByTitle,
  getPlusmovieSeriesByVideosId,
  updatePlusmovieSerie,
  registerDooplexLink,
  registerPlusmovieEpisode
} from '../../services/api';
import {
  DooplexSerie,
  DooplexSeason,
  DooplexEpisode,
  PlusmovieSerie,
  PlusmovieSeason
} from '../../types';
import { SERVER_OPTIONS, HEADER_OPTIONS, LANG_OPTIONS, SOURCE_OPTIONS } from '../../lib/constants';
import { formatDoodstreamUrl } from '../../lib/doodstreamUtils';
import {
  DooplexSourceType,
  inferSourceFromSelection,
  prepareRegistrationLink
} from '../../lib/registrationUtils';

export default function RegistroDoble() {
  const location = useLocation();
  const isPlusmovieOnly = new URLSearchParams(location.search).get('mode') === 'plusmovie';
  const [tmdbId, setTmdbId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  // Series Data
  const [dooplexSeries, setDooplexSeries] = useState<DooplexSerie | null>(null);
  const [plusmovieSeries, setPlusmovieSeries] = useState<PlusmovieSerie | null>(null);
  const [plusmovieCandidates, setPlusmovieCandidates] = useState<PlusmovieSerie[]>([]);
  const [isUpdatingTmdb, setIsUpdatingTmdb] = useState<number | null>(null);
  
  // Manual Search State
  const [manualVideosId, setManualVideosId] = useState('');
  const [isSearchingManual, setIsSearchingManual] = useState(false);

  // Seasons Data
  const [dooplexSeasons, setDooplexSeasons] = useState<DooplexSeason[]>([]);
  const [plusmovieSeasons, setPlusmovieSeasons] = useState<PlusmovieSeason[]>([]);
  
  // Selected Seasons
  const [selectedDooplexSeason, setSelectedDooplexSeason] = useState<number | ''>('');
  const [selectedPlusmovieSeason, setSelectedPlusmovieSeason] = useState<number | ''>('');

  // Episodes Data
  const [dooplexEpisodes, setDooplexEpisodes] = useState<DooplexEpisode[]>([]);
  const [selectedStartEpisodeId, setSelectedStartEpisodeId] = useState<number | ''>('');

  // Form Data
  const [urls, setUrls] = useState('');
  const [dooplexQuality, setDooplexQuality] = useState('Otros');
  const [dooplexHeader, setDooplexHeader] = useState('Otros');
  const [dooplexLang, setDooplexLang] = useState('CAST');
  const [dooplexSource, setDooplexSource] = useState('embed');

  // Registration State
  const [isRegistering, setIsRegistering] = useState(false);
  const [progress, setProgress] = useState<{ total: number; current: number; logs: { msg: string, isError?: boolean }[] }>({
    total: 0,
    current: 0,
    logs: []
  });

  const handleUpdateTmdb = async (candidate: PlusmovieSerie) => {
    if (!tmdbId) return;
    setIsUpdatingTmdb(candidate.videos_id);
    
    // Prefer Dooplex name to ensure consistency
    const titleToUse = dooplexSeries ? dooplexSeries.name : candidate.title;
    
    try {
      await updatePlusmovieSerie({
        videos_id: candidate.videos_id,
        title: titleToUse,
        tmdbid: Number(tmdbId)
      });
      
      setPlusmovieSeries({ ...candidate, title: titleToUse, tmdbid: Number(tmdbId) });
      setPlusmovieCandidates([]);
      // Remove specific error message if present
      setError(prev => prev.replace('No se encontró la serie en Plusmovie.', '').trim());
      
      const seasonsRes = await getPlusmovieSeasons(candidate.videos_id);
      setPlusmovieSeasons(seasonsRes.data || []);
    } catch (err) {
      console.error(err);
      alert('Error al actualizar TMDB ID en Plusmovie');
    } finally {
      setIsUpdatingTmdb(null);
    }
  };

  const handleManualIdSearch = async () => {
    if (!manualVideosId) return;
    setIsSearchingManual(true);
    setPlusmovieCandidates([]); // Clear previous candidates
    
    try {
      const res = await getPlusmovieSeriesByVideosId(Number(manualVideosId));
      if (res.data && res.data.length > 0) {
        setPlusmovieCandidates(res.data);
        setError(prev => prev.replace('No se encontró la serie en Plusmovie.', '').trim());
      } else {
        alert('No se encontró ninguna serie con ese Videos ID en Plusmovie.');
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
    setDooplexSeries(null);
    setPlusmovieSeries(null);
    setPlusmovieCandidates([]);
    setDooplexSeasons([]);
    setPlusmovieSeasons([]);
    setDooplexEpisodes([]);
    setSelectedDooplexSeason('');
    setSelectedPlusmovieSeason('');
    setSelectedStartEpisodeId('');
    setManualVideosId('');

    try {
      const [dooplexRes, plusmovieRes] = await Promise.all([
        getDooplexSeries(tmdbId),
        getPlusmovieSeries(tmdbId)
      ]);

      if (dooplexRes.data && dooplexRes.data.length > 0) {
        const serie = dooplexRes.data[0];
        setDooplexSeries(serie);
        const seasonsRes = await getDooplexSeasons(serie.id);
        setDooplexSeasons(seasonsRes.data || []);
      } else {
        setError('No se encontró la serie en Dooplex.');
      }

      if (plusmovieRes.data && plusmovieRes.data.length > 0) {
        const serie = plusmovieRes.data[0];
        setPlusmovieSeries(serie);
        const seasonsRes = await getPlusmovieSeasons(serie.videos_id);
        setPlusmovieSeasons(seasonsRes.data || []);
      } else {
        // Fallback: Search by title if Dooplex found a name
        let foundCandidate = false;
        if (dooplexRes.data && dooplexRes.data.length > 0) {
          const dooplexName = dooplexRes.data[0].name;
          try {
            const candidatesRes = await getPlusmovieSeriesByTitle(dooplexName);
            if (candidatesRes.data && candidatesRes.data.length > 0) {
              setPlusmovieCandidates(candidatesRes.data);
              foundCandidate = true;
            }
          } catch (err) {
            console.error("Error searching by title in Plusmovie", err);
          }
        }
        
        if (!foundCandidate) {
          setError(prev => prev ? `${prev} No se encontró la serie en Plusmovie.` : 'No se encontró la serie en Plusmovie.');
        }
      }
    } catch {
      setError('Error al buscar la serie. Verifica el ID de TMDB.');
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const fetchEpisodes = async () => {
      if (selectedDooplexSeason) {
        try {
          const res = await getDooplexEpisodes(Number(selectedDooplexSeason));
          const normalizedEpisodes = (res.data || [])
            .map((ep) => ({
              ...ep,
              id: Number(ep.id),
              season_id: Number(ep.season_id),
              episode_number: Number(ep.episode_number)
            }))
            .sort((a, b) => a.episode_number - b.episode_number);

          setDooplexEpisodes(normalizedEpisodes);
          if (normalizedEpisodes.length > 0) {
            setSelectedStartEpisodeId(normalizedEpisodes[0].id);
          } else {
            setSelectedStartEpisodeId('');
          }
        } catch {
          console.error("Error fetching episodes");
        }
      }
    };
    fetchEpisodes();
  }, [selectedDooplexSeason]);

  const handleRegister = async () => {
    if (!selectedStartEpisodeId || !selectedPlusmovieSeason || !plusmovieSeries || !urls.trim()) {
      alert("Por favor completa todos los campos y agrega al menos una URL.");
      return;
    }

    const urlList = urls.split('\n').map(u => u.trim()).filter(u => u);
    if (urlList.length === 0) return;

    setIsRegistering(true);
    setProgress({ total: urlList.length, current: 0, logs: [] });

    const startIndex = dooplexEpisodes.findIndex(ep => ep.id === Number(selectedStartEpisodeId));
    if (dooplexEpisodes.length === 0) {
      setProgress(prev => ({
        ...prev,
        logs: [{ msg: 'Error: no hay episodios cargados para la temporada de Dooplex seleccionada.', isError: true }, ...prev.logs]
      }));
      setIsRegistering(false);
      return;
    }

    if (startIndex < 0) {
      setProgress(prev => ({
        ...prev,
        logs: [{ msg: 'Error: el episodio inicial seleccionado no se encontró en la lista de episodios cargada. Vuelve a seleccionar la temporada/episodio.', isError: true }, ...prev.logs]
      }));
      setIsRegistering(false);
      return;
    }

    const availableFromStart = dooplexEpisodes.length - startIndex;
    if (availableFromStart < urlList.length) {
      setProgress(prev => ({
        ...prev,
        logs: [
          {
            msg: `Aviso: solo hay ${availableFromStart} episodios disponibles desde el episodio inicial seleccionado. Se intentarán registrar ${availableFromStart} de ${urlList.length} URLs.`,
            isError: true
          },
          ...prev.logs
        ]
      }));
    }

    let currentIndex = startIndex;

    for (let i = 0; i < urlList.length; i++) {
      const currentUrl = urlList[i];
      const currentEpisode = dooplexEpisodes[currentIndex];

      if (!currentEpisode) {
        setProgress(prev => ({
          ...prev,
          logs: [{ msg: `Aviso: No hay suficientes episodios en la temporada para todas las URLs. Se detuvo en la URL ${i + 1}.`, isError: true }, ...prev.logs]
        }));
        break;
      }

      if (!isPlusmovieOnly) {
        try {
          const prepared = prepareRegistrationLink({
            url: currentUrl,
            server: dooplexQuality,
            header: dooplexHeader,
            source: dooplexSource as DooplexSourceType
          });

          await registerDooplexLink({
            episode_id: currentEpisode.id,
            server: prepared.server,
            header: prepared.header,
            link: prepared.link,
            lang: dooplexLang,
            ...prepared.sourceFlags
          });
          setProgress(prev => ({
            ...prev,
            logs: [{ msg: `[Dooplex] Episodio ${currentEpisode.episode_number} registrado.`, isError: false }, ...prev.logs]
          }));
        } catch {
          setProgress(prev => ({
            ...prev,
            logs: [{ msg: `[Dooplex] Error al registrar Episodio ${currentEpisode.episode_number}.`, isError: true }, ...prev.logs]
          }));
        }
      }

      // Plusmovie Registration
      try {
        const normalizedPlusUrl = formatDoodstreamUrl(currentUrl, isPlusmovieOnly ? undefined : dooplexHeader);
        await registerPlusmovieEpisode({
          videos_id: plusmovieSeries.videos_id,
          seasons_id: Number(selectedPlusmovieSeason),
          episodes_name: `${currentEpisode.episode_number} - ${currentEpisode.name?.trim() || `Episodio ${currentEpisode.episode_number}`}`,
          file_source: "embed",
          source_type: "link",
          file_url: normalizedPlusUrl,
          order: currentEpisode.episode_number
        });
        setProgress(prev => ({
          ...prev,
          logs: [{ msg: `[Plusmovie] Episodio ${currentEpisode.episode_number} registrado.`, isError: false }, ...prev.logs]
        }));
      } catch {
        setProgress(prev => ({
          ...prev,
          logs: [{ msg: `[Plusmovie] Error al registrar Episodio ${currentEpisode.episode_number}.`, isError: true }, ...prev.logs]
        }));
      }

      currentIndex++;
      setProgress(prev => ({ ...prev, current: i + 1 }));
    }

    setIsRegistering(false);
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-3">
        <PlayCircle className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">
          {isPlusmovieOnly ? 'Registro Series Plusmovie' : 'Registro Dual (Dooplex + Plusmovie)'}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <form onSubmit={handleSearch} className="flex gap-4 items-end">
          <div className="flex-1">
            <label htmlFor="tmdbId" className="block text-sm font-medium text-gray-700 mb-1">
              TMDB ID de la Serie
            </label>
            <input
              type="text"
              id="tmdbId"
              value={tmdbId}
              onChange={(e) => setTmdbId(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
              placeholder="Ej. 1399"
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

        {!plusmovieSeries && plusmovieCandidates.length > 0 && (
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
        {!plusmovieSeries && (
          <div className="mt-6 border-t pt-4">
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
        )}
      </div>

      {(dooplexSeries || plusmovieSeries) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Selection */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Datos de la Serie</h2>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <span className="block text-sm text-gray-500">Dooplex</span>
                  <span className="font-medium">{dooplexSeries ? dooplexSeries.name : 'No encontrada'}</span>
                  {dooplexSeries && (
                    <span className="block text-xs text-gray-400 mt-0.5">ID: {dooplexSeries.id}</span>
                  )}
                </div>
                <div>
                  <span className="block text-sm text-gray-500">Plusmovie</span>
                  <span className="font-medium">{plusmovieSeries ? plusmovieSeries.title : 'No encontrada'}</span>
                  {plusmovieSeries && (
                    <span className="block text-xs text-gray-400 mt-0.5">Videos ID: {plusmovieSeries.videos_id}</span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temporada Dooplex</label>
                  <select
                    value={selectedDooplexSeason}
                    onChange={(e) => setSelectedDooplexSeason(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  >
                    <option value="">Seleccione temporada...</option>
                    {dooplexSeasons.map(s => (
                      <option key={s.id} value={s.id}>{s.season_number}: {s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temporada Plusmovie</label>
                  <select
                    value={selectedPlusmovieSeason}
                    onChange={(e) => setSelectedPlusmovieSeason(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  >
                    <option value="">Seleccione temporada...</option>
                    {plusmovieSeasons.map(s => (
                      <option key={s.seasons_id} value={s.seasons_id}>{s.order}: {s.seasons_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Episodio Inicial (Dooplex)</label>
                  <select
                    value={selectedStartEpisodeId}
                    onChange={(e) => setSelectedStartEpisodeId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    disabled={!selectedDooplexSeason}
                  >
                    <option value="">Seleccione episodio...</option>
                    {dooplexEpisodes.map(e => (
                      <option key={e.id} value={e.id}>{e.episode_number}: {e.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {!isPlusmovieOnly && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Metadatos Dooplex</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Calidad (Server)</label>
                    <select
                      value={dooplexQuality}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDooplexQuality(val);
                        setDooplexHeader(val);
                        setDooplexSource(inferSourceFromSelection(val));
                      }}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
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
                      onChange={(e) => {
                        const val = e.target.value;
                        setDooplexHeader(val);
                        setDooplexQuality(val);
                        setDooplexSource(inferSourceFromSelection(val));
                      }}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    >
                      {HEADER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Idioma (Lang)</label>
                    <select
                      value={dooplexLang}
                      onChange={(e) => setDooplexLang(e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
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
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    >
                      {SOURCE_OPTIONS.map((opt) => (
                        <option key={opt.label} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: URLs and Progress */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">URLs de Episodios</h2>
              <p className="text-sm text-gray-500 mb-2">Ingresa una URL por línea. El registro comenzará desde el episodio seleccionado.</p>
              <textarea
                rows={8}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 font-mono text-sm"
                placeholder="https://example.com/ep1.mp4&#10;https://example.com/ep2.mp4"
              ></textarea>

              <button
                onClick={handleRegister}
                disabled={isRegistering || !selectedStartEpisodeId || !selectedPlusmovieSeason || !urls.trim()}
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
                    Iniciar Registro Masivo
                  </>
                )}
              </button>
            </div>

            {/* Progress Viewer */}
            {(progress.total > 0 || isRegistering) && (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                <h3 className="font-medium text-gray-900 mb-2 flex justify-between">
                  <span>Progreso</span>
                  <span>{progress.current} / {progress.total}</span>
                </h3>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  ></div>
                </div>
                <div className="bg-black rounded-md p-3 h-48 overflow-y-auto font-mono text-xs">
                  {progress.logs.map((log, i) => (
                    <div key={i} className={`mb-1 ${log.isError ? 'text-red-400' : 'text-green-400'}`}>
                      {log.msg}
                    </div>
                  ))}
                  {progress.logs.length === 0 && <div className="text-gray-500">Esperando inicio...</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
