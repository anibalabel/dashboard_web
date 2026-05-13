import { useState, useEffect, FormEvent } from 'react';
import { Search, PlayCircle, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import {
  getDooplexSeries,
  getDooplexSeasons,
  getDooplexEpisodes,
  getPlusmovieSeries,
  getPlusmovieSeasons,
  getPlusmovieSeriesByTitle,
  getPlusmovieSeriesByVideosId,
  updatePlusmovieSerie,
  updateDooplexEpisode,
  getPlusmovieEpisodes,
  updatePlusmovieEpisode
} from '../../services/api';
import {
  DooplexSerie,
  DooplexSeason,
  DooplexEpisode,
  PlusmovieSerie,
  PlusmovieSeason,
  PlusmovieEpisode
} from '../../types';

export default function RegistroDobleUpdate() {
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
  const [plusmovieEpisodes, setPlusmovieEpisodes] = useState<PlusmovieEpisode[]>([]);
  const [isUpdatingTmdbMetadata, setIsUpdatingTmdbMetadata] = useState(false);

  // Update State
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
          setDooplexEpisodes(res.data || []);
        } catch {
          console.error("Error fetching episodes");
        }
      }
    };
    fetchEpisodes();
  }, [selectedDooplexSeason]);

  useEffect(() => {
    const fetchPlusmovieEpisodes = async () => {
      if (selectedPlusmovieSeason) {
        try {
          const res = await getPlusmovieEpisodes(Number(selectedPlusmovieSeason));
          setPlusmovieEpisodes(res.data || []);
        } catch {
          console.error("Error fetching plusmovie episodes");
        }
      }
    };
    fetchPlusmovieEpisodes();
  }, [selectedPlusmovieSeason]);

  const handleUpdateDooplexEpisodesMetadata = async () => {
    if (!tmdbId || !selectedDooplexSeason) {
      alert(`Falta información: tmdbId=${tmdbId}, selectedDooplexSeason=${selectedDooplexSeason}`);
      return;
    }

    // Find the season number from the selected season ID
    const selectedSeasonObj = dooplexSeasons.find(s => Number(s.id) === Number(selectedDooplexSeason));
    
    if (!selectedSeasonObj) {
      alert(`No se encontró la temporada seleccionada en la lista de Dooplex. IDs disponibles: ${dooplexSeasons.map(s => s.id).join(', ')}`);
      return;
    }

    setIsUpdatingTmdbMetadata(true);

    try {
      // 1. Fetch metadata from TMDB using the Bearer token authorization
      const options = {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxNTU5ZjFmMGE4ODZhYTdlOTNmMjJlMDljNDdiOWM5ZSIsIm5iZiI6MTU4MzcwMDU0Mi44NCwic3ViIjoiNWU2NTVhM2U0NTlhZDYwMDExNTkzYzcwIiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.ZOWuTVPOngZqSEgrSfBKN8AXpK77ADFwIvJibc3-ycI'
        }
      };

      const tmdbRes = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${selectedSeasonObj.season_number}?language=es-ES`, options);

      if (!tmdbRes.ok) {
        throw new Error('Error al obtener datos de TMDB');
      }

      const tmdbData = await tmdbRes.json();

      // 2. Map and update Dooplex and Plusmovie episodes
      let updatedCount = 0;
      setProgress({ total: tmdbData.episodes.length, current: 0, logs: [] });

      for (let i = 0; i < tmdbData.episodes.length; i++) {
        const tmdbEp = tmdbData.episodes[i];

        // 2.1 Update Dooplex episode
        const localEp = dooplexEpisodes.find(e => Number(e.episode_number) === Number(tmdbEp.episode_number));
        if (localEp) {
          try {
            await updateDooplexEpisode({
              episodes_id: localEp.id,
              name: tmdbEp.name || `Episodio ${tmdbEp.episode_number}`,
              overview: tmdbEp.overview || '',
              still_path: tmdbEp.still_path ? `http://image.tmdb.org/t/p/w500${tmdbEp.still_path}` : '',
              still_path_tv: tmdbEp.still_path ? `http://image.tmdb.org/t/p/original${tmdbEp.still_path}` : ''
            });
            updatedCount++;
            setProgress(prev => ({
              ...prev,
              current: i + 1,
              logs: [{ msg: `[Dooplex] Episodio ${tmdbEp.episode_number} actualizado correctamente.`, isError: false }, ...prev.logs]
            }));
          } catch (err) {
            console.error(`Error actualizando episodio Dooplex ${localEp.episode_number}:`, err);
            setProgress(prev => ({
              ...prev,
              current: i + 1,
              logs: [{ msg: `[Dooplex] Error al actualizar Episodio ${tmdbEp.episode_number}.`, isError: true }, ...prev.logs]
            }));
          }
        } else {
          setProgress(prev => ({
            ...prev,
            current: i + 1,
            logs: [{ msg: `[Dooplex] Episodio ${tmdbEp.episode_number} ignorado (no existe localmente).`, isError: false }, ...prev.logs]
          }));
        }

        // 2.2 Update Plusmovie episode (Only the title)
        if (selectedPlusmovieSeason) {
          // Plusmovie uses 'order' which typically corresponds to the episode number
          const pmEp = plusmovieEpisodes.find(e => Number(e.order) === Number(tmdbEp.episode_number));
          if (pmEp) {
            try {
              // Formatting name as "1 - Piloto (Editado)"
              const pmTitle = `${tmdbEp.episode_number} - ${tmdbEp.name || `Episodio ${tmdbEp.episode_number}`}`;
              await updatePlusmovieEpisode({
                episodes_id: pmEp.episodes_id,
                episodes_name: pmTitle,
                // Keep existing URL and order
                file_url: pmEp.file_url,
                order: pmEp.order
              });
              setProgress(prev => ({
                ...prev,
                logs: [{ msg: `[Plusmovie] Episodio ${tmdbEp.episode_number} título actualizado.`, isError: false }, ...prev.logs]
              }));
            } catch (err) {
              console.error(`Error actualizando episodio Plusmovie ${pmEp.order}:`, err);
              setProgress(prev => ({
                ...prev,
                logs: [{ msg: `[Plusmovie] Error al actualizar título del Episodio ${tmdbEp.episode_number}.`, isError: true }, ...prev.logs]
              }));
            }
          } else {
            setProgress(prev => ({
              ...prev,
              logs: [{ msg: `[Plusmovie] Episodio ${tmdbEp.episode_number} ignorado (no existe en Plusmovie).`, isError: false }, ...prev.logs]
            }));
          }
        }
      }

      // 3. Refresh episodes list to show new names
      const resDooplex = await getDooplexEpisodes(Number(selectedDooplexSeason));
      setDooplexEpisodes(resDooplex.data || []);

      if (selectedPlusmovieSeason) {
        const resPlusmovie = await getPlusmovieEpisodes(Number(selectedPlusmovieSeason));
        setPlusmovieEpisodes(resPlusmovie.data || []);
      }

      setProgress(prev => ({
        ...prev,
        logs: [{ msg: `Se actualizaron exitosamente ${updatedCount} episodios.`, isError: false }, ...prev.logs]
      }));

    } catch (err) {
      console.error(err);
      setProgress(prev => ({
        ...prev,
        logs: [{ msg: `Hubo un error al actualizar los metadatos desde TMDB.`, isError: true }, ...prev.logs]
      }));
    } finally {
      setIsUpdatingTmdbMetadata(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-3">
        <PlayCircle className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Registro Doble y Actualización</h1>
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
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-gray-700">Temporada Dooplex</label>
                  </div>
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

              </div>
            </div>
          </div>

          {/* Right Column: Submit and Progress */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Actualizar Episodios</h2>

            <div className="flex-1 flex flex-col">
              <p className="text-sm text-gray-500 mt-2 mb-4">
                Se sincronizarán los títulos, descripciones e imágenes de todos los episodios de la temporada seleccionada de Dooplex utilizando la información de TMDB.
              </p>

              <button
                type="button"
                onClick={handleUpdateDooplexEpisodesMetadata}
                disabled={isUpdatingTmdbMetadata || !selectedDooplexSeason}
                className="w-full mt-4 bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
              >
                {isUpdatingTmdbMetadata ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Actualizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-5 w-5" />
                    Actualizar Info TMDB
                  </>
                )}
              </button>
            </div>

            {(progress.total > 0 || progress.logs.length > 0 || isUpdatingTmdbMetadata) && (
              <div className="mt-6 bg-gray-50 rounded-lg border border-gray-200 p-4">
                <h3 className="font-medium text-gray-900 mb-2 flex justify-between">
                  <span>Progreso</span>
                  <span>{progress.current} / {progress.total}</span>
                </h3>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }}
                  ></div>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto text-sm">
                  {progress.logs.map((log, idx) => (
                    <div key={idx} className={log.isError ? 'text-red-600' : 'text-green-600'}>
                      {log.msg}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
