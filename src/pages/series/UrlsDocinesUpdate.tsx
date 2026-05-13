import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Search } from 'lucide-react';
import {
  getDocinesEpisodes,
  getDocinesSeasons,
  getDocinesSeries,
  updateDocinesEpisodeMetadata
} from '../../services/api';
import { DocinesEpisode, DocinesSeason, DocinesSerie } from '../../types';

export default function UrlsDocinesUpdate() {
  const [tmdbId, setTmdbId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const [serie, setSerie] = useState<DocinesSerie | null>(null);
  const [seasons, setSeasons] = useState<DocinesSeason[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | ''>('');

  const [episodes, setEpisodes] = useState<DocinesEpisode[]>([]);
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
    setSerie(null);
    setSeasons([]);
    setSelectedSeason('');
    setEpisodes([]);
    setIsLoadingEpisodes(false);
    setIsUpdatingTmdbMetadata(false);
    setProgress({ total: 0, current: 0, logs: [] });

    try {
      const res = await getDocinesSeries(tmdbId);
      if (!res.data || res.data.length === 0) {
        setError('No se encontró la serie en Docines.');
        return;
      }

      const foundSerie = res.data[0];
      setSerie(foundSerie);

      const seasonsRes = await getDocinesSeasons(foundSerie.id);
      const list = (seasonsRes.data || []).slice().sort((a, b) => a.season_order - b.season_order);
      setSeasons(list);
    } catch {
      setError('Error al buscar la serie. Verifica el ID de TMDB.');
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
        const epRes = await getDocinesEpisodes(Number(selectedSeason));
        const episodesList = (epRes.data || []).slice().sort((a, b) => a.episoade_order - b.episoade_order);
        setEpisodes(episodesList);
      } catch {
        setEpisodes([]);
      } finally {
        setIsLoadingEpisodes(false);
      }
    };
    fetchEpisodes();
  }, [selectedSeason]);

  const handleUpdateDocinesEpisodesMetadata = async () => {
    if (!tmdbId || !selectedSeason) return;

    const selectedSeasonObj = seasons.find(s => s.id === Number(selectedSeason));
    if (!selectedSeasonObj) return;

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
        `https://api.themoviedb.org/3/tv/${tmdbId}/season/${selectedSeasonObj.season_order}?language=es-ES`,
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
        const localEp = episodes.find(e => e.episoade_order === tmdbEp.episode_number);

        if (!localEp) {
          setProgress(prev => ({
            ...prev,
            current: i + 1,
            logs: [
              { msg: `[Docines] Episodio ${tmdbEp.episode_number} ignorado (no existe localmente).`, isError: false },
              ...prev.logs
            ]
          }));
          continue;
        }

        const image = tmdbEp.still_path ? `https://www.themoviedb.org/t/p/original${tmdbEp.still_path}` : '';
        const title = tmdbEp.name || `Episodio ${tmdbEp.episode_number}`;
        const description = tmdbEp.overview || '';

        try {
          await updateDocinesEpisodeMetadata({
            web_series_episoade_id: localEp.id,
            Episoade_Name: title,
            episoade_image: image,
            episoade_description: description
          });

          updatedCount++;
          setProgress(prev => ({
            ...prev,
            current: i + 1,
            logs: [{ msg: `[Docines] Episodio ${tmdbEp.episode_number} actualizado.`, isError: false }, ...prev.logs]
          }));
        } catch (err) {
          console.error(`Error actualizando episodio Docines ${localEp.episoade_order}:`, err);
          setProgress(prev => ({
            ...prev,
            current: i + 1,
            logs: [{ msg: `[Docines] Error al actualizar Episodio ${tmdbEp.episode_number}.`, isError: true }, ...prev.logs]
          }));
        }
      }

      const epRes = await getDocinesEpisodes(Number(selectedSeason));
      const episodesList = (epRes.data || []).slice().sort((a, b) => a.episoade_order - b.episoade_order);
      setEpisodes(episodesList);

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
        <RefreshCw className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Actualización Episodios Docines</h1>
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
      </div>

      {serie && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{serie.name}</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seleccionar Temporada</label>
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
              >
                <option value="">Seleccione temporada...</option>
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>{s.season_order}: {s.Session_Name}</option>
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
                      onClick={handleUpdateDocinesEpisodesMetadata}
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
                      {episodes.map(ep => (
                        <div key={ep.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">
                              {ep.episoade_order}: {ep.Episoade_Name}
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
