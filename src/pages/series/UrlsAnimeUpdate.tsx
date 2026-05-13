import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Search } from 'lucide-react';
import { getDooplexAnime, getDooplexAnimeEpisodes, getDooplexAnimeSeasons, updateDooplexAnimeEpisode } from '../../services/api';
import { DooplexAnime, DooplexAnimeEpisode, DooplexAnimeSeason } from '../../types';

import { useSnackbarStore } from '../../store/snackbarStore';

export default function UrlsAnimeUpdate() {
  const { showSnackbar } = useSnackbarStore();
  const [tmdbId, setTmdbId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const [anime, setAnime] = useState<DooplexAnime | null>(null);
  const [seasons, setSeasons] = useState<DooplexAnimeSeason[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | ''>('');

  const [episodes, setEpisodes] = useState<DooplexAnimeEpisode[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [isUpdatingTmdbMetadata, setIsUpdatingTmdbMetadata] = useState(false);
  const [progress, setProgress] = useState<{ total: number; current: number; logs: { msg: string; isError?: boolean }[] }>({
    total: 0,
    current: 0,
    logs: []
  });

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tmdbId) return;

    setIsSearching(true);
    setError('');
    setAnime(null);
    setSeasons([]);
    setSelectedSeason('');
    setEpisodes([]);
    setIsLoadingEpisodes(false);
    setIsUpdatingTmdbMetadata(false);
    setProgress({ total: 0, current: 0, logs: [] });

    try {
      const res = await getDooplexAnime(tmdbId);
      if (!res.data || res.data.length === 0) {
        setError('No se encontró el anime en Dooplex.');
        return;
      }

      const foundAnime = res.data[0];
      setAnime(foundAnime);

      const seasonsRes = await getDooplexAnimeSeasons(foundAnime.id);
      const list = (seasonsRes.data || []).slice().sort((a, b) => a.season_number - b.season_number);
      setSeasons(list);
    } catch {
      setError('Error al buscar el anime. Verifica el ID de TMDB.');
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const fetchEpisodes = async () => {
      if (!selectedSeason) return;

      setIsLoadingEpisodes(true);
      setEpisodes([]);

      try {
        const epRes = await getDooplexAnimeEpisodes(Number(selectedSeason));
        const list = (epRes.data || []).slice().sort((a, b) => a.episode_number - b.episode_number);
        setEpisodes(list);
      } catch {
        setEpisodes([]);
      } finally {
        setIsLoadingEpisodes(false);
      }
    };

    fetchEpisodes();
  }, [selectedSeason]);

  const handleUpdateAnimeEpisodesMetadata = async () => {
    if (!tmdbId || !selectedSeason) return;

    const selectedSeasonObj = seasons.find((s) => Number(s.id) === Number(selectedSeason));
    if (!selectedSeasonObj) {
      showSnackbar(`No se encontró la temporada seleccionada en la lista de Anime. IDs disponibles: ${seasons.map(s => s.id).join(', ')}`, 'error');
      return;
    }

    setIsUpdatingTmdbMetadata(true);

    try {
      const options = {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Authorization:
            'Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxNTU5ZjFmMGE4ODZhYTdlOTNmMjJlMDljNDdiOWM5ZSIsIm5iZiI6MTU4MzcwMDU0Mi44NCwic3ViIjoiNWU2NTVhM2U0NTlhZDYwMDExNTkzYzcwIiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.ZOWuTVPOngZqSEgrSfBKN8AXpK77ADFwIvJibc3-ycI'
        }
      };

      const tmdbRes = await fetch(
        `https://api.themoviedb.org/3/tv/${tmdbId}/season/${selectedSeasonObj.season_number}?language=es-ES`,
        options
      );

      if (!tmdbRes.ok) {
        throw new Error('Error al obtener datos de TMDB');
      }

      const tmdbData = await tmdbRes.json();
      const tmdbEpisodes: Array<{ episode_number: number; name?: string; overview?: string; still_path?: string | null }> =
        tmdbData?.episodes || [];

      setProgress({ total: tmdbEpisodes.length, current: 0, logs: [] });

      let updatedCount = 0;
      for (let i = 0; i < tmdbEpisodes.length; i++) {
        const tmdbEp = tmdbEpisodes[i];
        const localEp = episodes.find((e) => Number(e.episode_number) === Number(tmdbEp.episode_number));

        if (!localEp) {
          setProgress((prev) => ({
            ...prev,
            current: i + 1,
            logs: [
              { msg: `[Anime] Episodio ${tmdbEp.episode_number} ignorado (no existe localmente).`, isError: false },
              ...prev.logs
            ]
          }));
          continue;
        }

        try {
          await updateDooplexAnimeEpisode({
            anime_episodes_id: localEp.id,
            name: tmdbEp.name || `Episodio ${tmdbEp.episode_number}`,
            overview: tmdbEp.overview || '',
            still_path: tmdbEp.still_path ? `http://image.tmdb.org/t/p/w500${tmdbEp.still_path}` : '',
            still_path_tv: tmdbEp.still_path ? `http://image.tmdb.org/t/p/original${tmdbEp.still_path}` : ''
          });

          updatedCount++;
          setProgress((prev) => ({
            ...prev,
            current: i + 1,
            logs: [{ msg: `[Anime] Episodio ${tmdbEp.episode_number} actualizado.`, isError: false }, ...prev.logs]
          }));
        } catch (err) {
          console.error(`Error actualizando episodio Anime ${localEp.episode_number}:`, err);
          setProgress((prev) => ({
            ...prev,
            current: i + 1,
            logs: [{ msg: `[Anime] Error al actualizar Episodio ${tmdbEp.episode_number}.`, isError: true }, ...prev.logs]
          }));
        }
      }

      const epRes = await getDooplexAnimeEpisodes(Number(selectedSeason));
      const list = (epRes.data || []).slice().sort((a, b) => a.episode_number - b.episode_number);
      setEpisodes(list);

      setProgress((prev) => ({
        ...prev,
        logs: [{ msg: `Se actualizaron exitosamente ${updatedCount} episodios.`, isError: false }, ...prev.logs]
      }));
    } catch (err) {
      console.error(err);
      setProgress((prev) => ({
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
        <RefreshCw className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Update Episodios Anime</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <form onSubmit={handleSearch} className="flex gap-4 items-end">
          <div className="flex-1">
            <label htmlFor="tmdbId" className="block text-sm font-medium text-gray-700 mb-1">
              TMDB ID del Anime
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
      </div>

      {anime && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{anime.name}</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seleccionar Temporada</label>
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
              >
                <option value="">Seleccione temporada...</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.season_number}: {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedSeason && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4 border-b pb-2">
                    <h3 className="text-lg font-semibold text-gray-900">Episodios</h3>
                    <button
                      type="button"
                      onClick={handleUpdateAnimeEpisodesMetadata}
                      disabled={isUpdatingTmdbMetadata || isLoadingEpisodes || episodes.length === 0}
                      className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
                    >
                      {isUpdatingTmdbMetadata ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Actualizar desde TMDB
                    </button>
                  </div>

                  {isLoadingEpisodes ? (
                    <div className="text-sm text-gray-500 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando episodios...
                    </div>
                  ) : episodes.length === 0 ? (
                    <div className="text-sm text-gray-500">No hay episodios disponibles para esta temporada.</div>
                  ) : (
                    <div className="space-y-2">
                      {episodes.map((ep) => (
                        <div key={ep.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">
                              {ep.episode_number}: {ep.name}
                            </div>
                            <div className="text-xs text-gray-500">ID: {ep.id}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                {(progress.total > 0 || isUpdatingTmdbMetadata) && (
                  <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-900 mb-2 flex justify-between">
                      <span>Progreso</span>
                      <span>
                        {progress.current} / {progress.total}
                      </span>
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
      )}
    </div>
  );
}
