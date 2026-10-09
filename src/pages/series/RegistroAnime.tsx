import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, PlayCircle, Search } from 'lucide-react';
import { getDooplexAnime, getDooplexAnimeEpisodes, getDooplexAnimeSeasons, registerDooplexAnimeEpisodeVideo } from '../../services/api';
import { DooplexAnime, DooplexAnimeEpisode, DooplexAnimeSeason } from '../../types';
import { HEADER_OPTIONS, LANG_OPTIONS, SERVER_OPTIONS, SOURCE_OPTIONS } from '../../lib/constants';

export default function RegistroAnime() {
  const [tmdbId, setTmdbId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const [anime, setAnime] = useState<DooplexAnime | null>(null);
  const [seasons, setSeasons] = useState<DooplexAnimeSeason[]>([]);
  const [episodes, setEpisodes] = useState<DooplexAnimeEpisode[]>([]);

  const [selectedSeasonId, setSelectedSeasonId] = useState<number | ''>('');
  const [selectedStartEpisodeId, setSelectedStartEpisodeId] = useState<number | ''>('');

  const [urls, setUrls] = useState('');
  const [server, setServer] = useState('Otros');
  const [header, setHeader] = useState('Otros');
  const [lang, setLang] = useState('LAT');
  const [source, setSource] = useState('embed');

  const [isRegistering, setIsRegistering] = useState(false);
  const [progress, setProgress] = useState<{
    total: number;
    current: number;
    logs: { msg: string; isError?: boolean }[];
  }>({ total: 0, current: 0, logs: [] });

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tmdbId) return;

    setIsSearching(true);
    setError('');
    setAnime(null);
    setSeasons([]);
    setEpisodes([]);
    setSelectedSeasonId('');
    setSelectedStartEpisodeId('');

    try {
      const res = await getDooplexAnime(tmdbId);
      if (!res.data || res.data.length === 0) {
        setError('No se encontró el anime en Dooplex.');
        return;
      }

      const foundAnime = res.data[0];
      setAnime(foundAnime);

      const seasonsRes = await getDooplexAnimeSeasons(foundAnime.id);
      setSeasons(seasonsRes.data || []);
    } catch {
      setError('Error al buscar el anime. Verifica el ID de TMDB.');
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const fetchEpisodes = async () => {
      if (!selectedSeasonId) {
        setEpisodes([]);
        setSelectedStartEpisodeId('');
        return;
      }

      try {
        const res = await getDooplexAnimeEpisodes(Number(selectedSeasonId));
        const normalizedEpisodes = (res.data || [])
          .map((ep) => ({
            ...ep,
            id: Number(ep.id),
            episode_number: Number(ep.episode_number)
          }))
          .sort((a, b) => a.episode_number - b.episode_number);

        setEpisodes(normalizedEpisodes);
        setSelectedStartEpisodeId(normalizedEpisodes.length > 0 ? normalizedEpisodes[0].id : '');
      } catch {
        setEpisodes([]);
        setSelectedStartEpisodeId('');
      }
    };

    fetchEpisodes();
  }, [selectedSeasonId]);

  const handleRegister = async () => {
    if (!selectedStartEpisodeId || !urls.trim()) {
      alert('Por favor completa todos los campos y agrega al menos una URL.');
      return;
    }

    const urlList = urls
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u);

    if (urlList.length === 0) return;

    setIsRegistering(true);
    setProgress({ total: urlList.length, current: 0, logs: [] });

    const startIndex = episodes.findIndex((ep) => ep.id === Number(selectedStartEpisodeId));
    if (episodes.length === 0) {
      setProgress((prev) => ({
        ...prev,
        logs: [{ msg: 'Error: no hay episodios cargados para la temporada seleccionada.', isError: true }, ...prev.logs]
      }));
      setIsRegistering(false);
      return;
    }

    if (startIndex < 0) {
      setProgress((prev) => ({
        ...prev,
        logs: [{ msg: 'Error: el episodio inicial seleccionado no se encontró en la lista de episodios cargada. Vuelve a seleccionar la temporada/episodio.', isError: true }, ...prev.logs]
      }));
      setIsRegistering(false);
      return;
    }

    const availableFromStart = episodes.length - startIndex;
    if (availableFromStart < urlList.length) {
      setProgress((prev) => ({
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
      const currentEpisode = episodes[currentIndex];

      if (!currentEpisode) {
        setProgress((prev) => ({
          ...prev,
          logs: [
            { msg: `Aviso: No hay suficientes episodios en la temporada. Se detuvo en la URL ${i + 1}.`, isError: true },
            ...prev.logs
          ]
        }));
        break;
      }

      try {
        const sourceFlags = {
          embed: source === 'embed' ? '1' : '0',
          youtubelink: source === 'youtubelink' ? '1' : '0',
          hls: source === 'hls' ? '1' : '0',
          supported_hosts: source === 'supported_hosts' ? '1' : '0'
        };

        await registerDooplexAnimeEpisodeVideo({
          anime_episode_id: currentEpisode.id,
          server,
          header,
          link: currentUrl,
          lang,
          ...sourceFlags
        });

        setProgress((prev) => ({
          ...prev,
          logs: [{ msg: `[Anime] Episodio ${currentEpisode.episode_number} registrado.`, isError: false }, ...prev.logs]
        }));
      } catch {
        setProgress((prev) => ({
          ...prev,
          logs: [{ msg: `[Anime] Error al registrar Episodio ${currentEpisode.episode_number}.`, isError: true }, ...prev.logs]
        }));
      }

      currentIndex++;
      setProgress((prev) => ({ ...prev, current: i + 1 }));
    }

    setIsRegistering(false);
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-3">
        <PlayCircle className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Registro Anime</h1>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Datos del Anime</h2>

              <div className="mb-6">
                <span className="block text-sm text-gray-500">Dooplex</span>
                <span className="font-medium">{anime.name}</span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temporada</label>
                  <select
                    value={selectedSeasonId}
                    onChange={(e) => setSelectedSeasonId(e.target.value ? Number(e.target.value) : '')}
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Episodio Inicial</label>
                  <select
                    value={selectedStartEpisodeId}
                    onChange={(e) => setSelectedStartEpisodeId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    disabled={!selectedSeasonId}
                  >
                    <option value="">Seleccione episodio...</option>
                    {episodes.map((ep) => (
                      <option key={ep.id} value={ep.id}>
                        {ep.episode_number}: {ep.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Calidad</label>
                    <select
                      value={server}
                      onChange={(e) => {
                        const val = e.target.value;
                        setServer(val);
                        setHeader(val);
                      }}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    >
                      {SERVER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Header</label>
                    <select
                      value={header}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHeader(val);
                        setServer(val);
                      }}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    >
                      {HEADER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
                    <select
                      value={lang}
                      onChange={(e) => setLang(e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    >
                      {LANG_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    >
                      {SOURCE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">URLs a Registrar</h2>
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
                disabled={isRegistering || !selectedStartEpisodeId || !selectedSeasonId || !urls.trim()}
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

            {(progress.total > 0 || isRegistering) && (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                <h3 className="font-medium text-gray-900 mb-2 flex justify-between">
                  <span>Progreso</span>
                  <span className="text-sm text-gray-500">
                    {progress.current}/{progress.total}
                  </span>
                </h3>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{
                      width: progress.total === 0 ? '0%' : `${Math.round((progress.current / progress.total) * 100)}%`
                    }}
                  ></div>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2">
                  {progress.logs.map((l, idx) => (
                    <div
                      key={idx}
                      className={`text-sm p-2 rounded-md flex items-center gap-2 ${
                        l.isError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                      }`}
                    >
                      {l.isError ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                      <span>{l.msg}</span>
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
