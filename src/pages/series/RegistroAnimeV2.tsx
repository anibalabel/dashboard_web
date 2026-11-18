import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Ban, CheckCircle, ListVideo, Loader2, PlayCircle, Plus, RotateCcw, Search, X } from 'lucide-react';
import {
  getDooplexAnime,
  getDooplexAnimeEpisodes,
  getDooplexAnimeSeasons,
  registerDooplexAnimeEpisodeVideo
} from '../../services/api';
import { DooplexAnime, DooplexAnimeEpisode, DooplexAnimeSeason } from '../../types';
import {
  buildDooplexSourceFlags,
  getDooplexSourceBadgeLabel,
  isV2LanguageExcluded,
  isV2ServerExcluded,
  parseBulkEpisodesV2Text,
  ParsedV2EpisodeGroup
} from '../../lib/registrationUtils';

const DEFAULT_EXCLUDED_SERVERS = ['doodstream', 'waaw', 'dsvplay'];
const STORAGE_KEY_EXCLUDED = 'dooplex_v2_excluded_servers';

const DEFAULT_EXCLUDED_LANGS: string[] = [];
const STORAGE_KEY_EXCLUDED_LANGS = 'dooplex_v2_excluded_langs';
const STANDARD_LANGS: { code: 'LAT' | 'CAST' | 'SUB'; label: string }[] = [
  { code: 'LAT', label: 'LAT (Latino)' },
  { code: 'CAST', label: 'CAST (Castellano)' },
  { code: 'SUB', label: 'SUB (Subtitulado)' }
];

export default function RegistroAnimeV2() {
  const [tmdbId, setTmdbId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const [anime, setAnime] = useState<DooplexAnime | null>(null);
  const [seasons, setSeasons] = useState<DooplexAnimeSeason[]>([]);
  const [episodes, setEpisodes] = useState<DooplexAnimeEpisode[]>([]);

  const [selectedSeasonId, setSelectedSeasonId] = useState<number | ''>('');
  const [selectedStartEpisodeId, setSelectedStartEpisodeId] = useState<number | ''>('');

  const [urls, setUrls] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Excluded Servers State (shared in localStorage)
  const [excludedServers, setExcludedServers] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_EXCLUDED);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_EXCLUDED_SERVERS;
  });
  const [newExcludedInput, setNewExcludedInput] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_EXCLUDED, JSON.stringify(excludedServers));
    } catch {
      // ignore storage errors
    }
  }, [excludedServers]);

  const handleAddExcludedServer = () => {
    if (!newExcludedInput.trim()) return;
    const parts = newExcludedInput
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    setExcludedServers((prev) => {
      const existingLower = new Set(prev.map((p) => p.toLowerCase()));
      const additions = parts.filter((p) => !existingLower.has(p));
      return [...prev, ...additions];
    });
    setNewExcludedInput('');
  };

  const handleRemoveExcludedServer = (serverToRemove: string) => {
    setExcludedServers((prev) =>
      prev.filter((s) => s.toLowerCase() !== serverToRemove.toLowerCase())
    );
  };

  const handleToggleServerFromDetected = (serverName: string) => {
    const lower = serverName.trim().toLowerCase();
    const isCurrentlyExcluded = excludedServers.some((s) => {
      const k = s.trim().toLowerCase();
      return k === lower || lower.includes(k);
    });

    if (isCurrentlyExcluded) {
      setExcludedServers((prev) =>
        prev.filter((s) => {
          const k = s.trim().toLowerCase();
          return !(k === lower || lower.includes(k));
        })
      );
    } else {
      setExcludedServers((prev) => [...prev, serverName.trim().toLowerCase()]);
    }
  };

  const handleResetExcludedServers = () => {
    setExcludedServers(DEFAULT_EXCLUDED_SERVERS);
  };

  // Excluded Languages State (shared in localStorage)
  const [excludedLangs, setExcludedLangs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_EXCLUDED_LANGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_EXCLUDED_LANGS;
  });
  const [newExcludedLangInput, setNewExcludedLangInput] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_EXCLUDED_LANGS, JSON.stringify(excludedLangs));
    } catch {
      // ignore storage errors
    }
  }, [excludedLangs]);

  const handleAddExcludedLang = () => {
    if (!newExcludedLangInput.trim()) return;
    const parts = newExcludedLangInput
      .split(',')
      .map((l) => l.trim().toUpperCase())
      .filter(Boolean);

    setExcludedLangs((prev) => {
      const existingUpper = new Set(prev.map((p) => p.toUpperCase()));
      const additions = parts.filter((p) => !existingUpper.has(p));
      return [...prev, ...additions];
    });
    setNewExcludedLangInput('');
  };

  const handleRemoveExcludedLang = (langToRemove: string) => {
    setExcludedLangs((prev) =>
      prev.filter((l) => l.toLowerCase() !== langToRemove.toLowerCase())
    );
  };

  const handleToggleLang = (langCode: 'CAST' | 'LAT' | 'SUB') => {
    const isCurrentlyExcluded = isV2LanguageExcluded(langCode, langCode, excludedLangs);

    if (isCurrentlyExcluded) {
      setExcludedLangs((prev) =>
        prev.filter((ex) => !isV2LanguageExcluded(langCode, langCode, [ex]))
      );
    } else {
      setExcludedLangs((prev) => [...prev, langCode]);
    }
  };

  const handleResetExcludedLangs = () => {
    setExcludedLangs(DEFAULT_EXCLUDED_LANGS);
  };

  const [isRegistering, setIsRegistering] = useState(false);
  const [progress, setProgress] = useState<{
    total: number;
    current: number;
    logs: { msg: string; isError?: boolean }[];
  }>({ total: 0, current: 0, logs: [] });

  const { groups: parsedGroups, detectedServers, detectedLangs, discardedCount } = useMemo(
    () => parseBulkEpisodesV2Text(urls, skipDuplicates, excludedServers, excludedLangs),
    [urls, skipDuplicates, excludedServers, excludedLangs]
  );

  const totalParsedLinks = useMemo(
    () => parsedGroups.reduce((acc, g) => acc + g.items.length, 0),
    [parsedGroups]
  );

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

  const resolveAnimeEpisode = (
    group: ParsedV2EpisodeGroup,
    groupIndex: number,
    startIndex: number
  ): DooplexAnimeEpisode | undefined => {
    if (group.episodeNumber !== null) {
      const byNumber = episodes.find((ep) => ep.episode_number === group.episodeNumber);
      if (byNumber) return byNumber;
    }
    if (startIndex >= 0) {
      return episodes[startIndex + groupIndex];
    }
    return undefined;
  };

  const handleRegister = async () => {
    if (!selectedSeasonId || !urls.trim()) {
      alert('Por favor selecciona una temporada y pega el texto con los episodios.');
      return;
    }

    if (parsedGroups.length === 0 || totalParsedLinks === 0) {
      alert('No hay enlaces válidos para registrar (verifica el formato o los servidores descartados).');
      return;
    }

    if (episodes.length === 0) {
      setProgress({
        total: 0,
        current: 0,
        logs: [{ msg: 'Error: no hay episodios cargados para la temporada seleccionada.', isError: true }]
      });
      return;
    }

    const startIndex = selectedStartEpisodeId
      ? episodes.findIndex((ep) => ep.id === Number(selectedStartEpisodeId))
      : 0;

    setIsRegistering(true);
    setProgress({ total: totalParsedLinks, current: 0, logs: [] });

    let completed = 0;

    for (let gIdx = 0; gIdx < parsedGroups.length; gIdx++) {
      const group = parsedGroups[gIdx];
      const targetEpisode = resolveAnimeEpisode(group, gIdx, startIndex >= 0 ? startIndex : 0);

      if (!targetEpisode) {
        setProgress((prev) => ({
          ...prev,
          logs: [
            {
              msg: `Aviso: No se encontró el episodio en Anime Dooplex para "${group.title}". Se omitieron ${group.items.length} enlaces.`,
              isError: true
            },
            ...prev.logs
          ]
        }));
        completed += group.items.length;
        setProgress((prev) => ({ ...prev, current: completed }));
        continue;
      }

      for (const item of group.items) {
        const sourceFlags = buildDooplexSourceFlags(item.source);

        try {
          await registerDooplexAnimeEpisodeVideo({
            anime_episode_id: targetEpisode.id,
            server: item.server,
            header: item.header,
            link: item.link,
            lang: item.lang,
            ...sourceFlags
          });

          setProgress((prev) => ({
            ...prev,
            logs: [
              {
                msg: `[Anime Ep ${targetEpisode.episode_number}] OK -> [${item.server}] [${item.lang}] ${item.header} (${getDooplexSourceBadgeLabel(item.source)})`,
                isError: false
              },
              ...prev.logs
            ]
          }));
        } catch {
          setProgress((prev) => ({
            ...prev,
            logs: [
              {
                msg: `[Anime Ep ${targetEpisode.episode_number}] Error -> [${item.server}] [${item.lang}] ${item.header}: ${item.link}`,
                isError: true
              },
              ...prev.logs
            ]
          }));
        }

        completed++;
        setProgress((prev) => ({ ...prev, current: completed }));
      }
    }

    setIsRegistering(false);
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-3">
        <PlayCircle className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Registro Anime V2</h1>
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
                <span className="block text-xs text-gray-400 mt-0.5">ID: {anime.id}</span>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Episodio Inicial (Respaldo si no hay encabezado EPISODIO X)
                  </label>
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
              </div>
            </div>

            {/* Excluded Servers Management Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-3 border-b pb-2">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Ban className="h-4 w-4 text-red-600" />
                  Servidores Descartados
                </h2>
                <button
                  type="button"
                  onClick={handleResetExcludedServers}
                  title="Restaurar por defecto (doodstream, waaw, dsvplay)"
                  className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Por defecto
                </button>
              </div>

              <p className="text-xs text-gray-500 mb-3">
                Los enlaces de estos servidores se ignorarán automáticamente al pegar el texto.
              </p>

              {/* Active Excluded Tags */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {excludedServers.length === 0 && (
                  <span className="text-xs text-gray-400 italic">No hay servidores descartados</span>
                )}
                {excludedServers.map((srv) => (
                  <span
                    key={srv}
                    className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full text-xs font-medium"
                  >
                    {srv}
                    <button
                      type="button"
                      onClick={() => handleRemoveExcludedServer(srv)}
                      className="hover:bg-red-200/60 rounded-full p-0.5 text-red-600"
                      title={`Permitir ${srv}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Add new server to discard */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newExcludedInput}
                  onChange={(e) => setNewExcludedInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddExcludedServer();
                    }
                  }}
                  placeholder="Agregar servidor a descartar (ej. netu, streamtape)..."
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddExcludedServer}
                  disabled={!newExcludedInput.trim()}
                  className="bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-1 text-xs font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Descartar
                </button>
              </div>

              {/* Quick Toggle from Detected Servers in Current Text */}
              {detectedServers.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <span className="block text-xs font-medium text-gray-700 mb-2">
                    Servidores detectados en el texto (clic para descartar / activar):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {detectedServers.map((srv) => {
                      const isEx = isV2ServerExcluded(srv, '', excludedServers);
                      return (
                        <button
                          key={srv}
                          type="button"
                          onClick={() => handleToggleServerFromDetected(srv)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors flex items-center gap-1 ${
                            isEx
                              ? 'bg-red-50 text-red-700 border-red-200 line-through opacity-80 hover:bg-red-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          {isEx ? <Ban className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                          {srv}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Excluded Languages Section */}
              <div className="mt-5 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Ban className="h-4 w-4 text-red-600" />
                    Idiomas Descartados
                  </h3>
                  <button
                    type="button"
                    onClick={handleResetExcludedLangs}
                    title="Restaurar idiomas (permitir todos)"
                    className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Por defecto
                  </button>
                </div>

                <p className="text-xs text-gray-500 mb-3">
                  Haz clic en un idioma para descartarlo o activarlo, o agrégalo manualmente.
                </p>

                {/* Quick Toggle Buttons for Standard Languages */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {STANDARD_LANGS.map(({ code, label }) => {
                    const isEx = isV2LanguageExcluded(code, code, excludedLangs);
                    const isDetected = detectedLangs.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => handleToggleLang(code)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors flex items-center gap-1 ${
                          isEx
                            ? 'bg-red-50 text-red-700 border-red-200 line-through opacity-80 hover:bg-red-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {isEx ? <Ban className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                        {label}
                        {isDetected && (
                          <span className="ml-0.5 text-[10px] px-1 py-0.2 rounded bg-white/80 text-gray-700 font-semibold">
                            detectado
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Active Excluded Language Tags */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {excludedLangs.length === 0 && (
                    <span className="text-xs text-gray-400 italic">No hay idiomas descartados</span>
                  )}
                  {excludedLangs.map((langItem) => (
                    <span
                      key={langItem}
                      className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full text-xs font-medium"
                    >
                      {langItem}
                      <button
                        type="button"
                        onClick={() => handleRemoveExcludedLang(langItem)}
                        className="hover:bg-red-200/60 rounded-full p-0.5 text-red-600"
                        title={`Permitir ${langItem}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>

                {/* Add new language to discard */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newExcludedLangInput}
                    onChange={(e) => setNewExcludedLangInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddExcludedLang();
                      }
                    }}
                    placeholder="Agregar idioma a descartar (ej. CAST, LAT, SUB)..."
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddExcludedLang}
                    disabled={!newExcludedLangInput.trim()}
                    className="bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-1 text-xs font-medium"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Descartar
                  </button>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span className="text-xs font-medium text-gray-700">
                    Omitir enlaces duplicados dentro del mismo episodio
                  </span>
                </label>
              </div>
            </div>

            {(parsedGroups.length > 0 || discardedCount > 0) && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b pb-2">
                  <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <ListVideo className="h-4 w-4 text-blue-600" />
                    Vista Previa Detectada
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2.5 py-1 rounded-full">
                      {parsedGroups.length} ep. / {totalParsedLinks} activos
                    </span>
                    {discardedCount > 0 && (
                      <span className="text-xs bg-red-50 text-red-700 font-semibold px-2.5 py-1 rounded-full">
                        {discardedCount} descartados
                      </span>
                    )}
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                  {parsedGroups.map((group, idx) => {
                    const startIndex = selectedStartEpisodeId
                      ? episodes.findIndex((ep) => ep.id === Number(selectedStartEpisodeId))
                      : 0;
                    const matchedEp = resolveAnimeEpisode(group, idx, startIndex >= 0 ? startIndex : 0);

                    return (
                      <div key={idx} className="bg-gray-50 rounded-md p-3 border border-gray-200 text-xs">
                        <div className="flex items-center justify-between font-semibold text-gray-800 mb-1.5">
                          <span>{group.title}</span>
                          {matchedEp ? (
                            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              &rarr; Anime Ep. {matchedEp.episode_number}
                            </span>
                          ) : (
                            <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                              Seleccione temporada
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          {group.items.map((item, i) => (
                            <div
                              key={i}
                              className="flex flex-wrap items-center gap-1.5 text-gray-600 font-mono text-[11px] bg-white px-2 py-1 rounded border border-gray-100"
                            >
                              <span className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded font-semibold">
                                {item.server}
                              </span>
                              <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
                                {item.lang}
                              </span>
                              <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-semibold">
                                {item.header}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded font-semibold ${
                                  item.source === 'supported_hosts'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : item.source === 'youtubelink'
                                    ? 'bg-red-50 text-red-700'
                                    : item.source === 'hls'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {getDooplexSourceBadgeLabel(item.source)}
                              </span>
                              <span className="truncate flex-1 text-gray-400">{item.link}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4 border-b pb-2">
                <h2 className="text-lg font-semibold text-gray-900">URLs de Episodios</h2>
                {totalParsedLinks > 0 && (
                  <span className="text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                    {totalParsedLinks} URLs listas
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-2">
                Pega el bloque completo con los episodios (<code className="text-xs">EPISODIO 1...</code> y sus líneas{' '}
                <code className="text-xs">• [1080p HD] [Idioma] Servidor -&gt; URL</code>).
              </p>
              <textarea
                rows={14}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 font-mono text-xs"
                placeholder={`--------------------------------------------------------------------\nEPISODIO 1 [T1·E1] - Capítulo 1\n--------------------------------------------------------------------\n  • [1080p HD] [Español España] Voe -> https://voe.sx/e/bjvd6oxwbz4k\n  • [1080p HD] [Subtitulado] FileMoon / Bysekoze -> https://bysekoze.com/e/6wbosve3hlry`}
              ></textarea>

              <button
                onClick={handleRegister}
                disabled={isRegistering || !selectedSeasonId || totalParsedLinks === 0}
                className="w-full mt-4 bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Registrando ({progress.current}/{progress.total})...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Iniciar Registro Masivo ({totalParsedLinks} enlaces)
                  </>
                )}
              </button>
            </div>

            {(progress.total > 0 || isRegistering) && (
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
                    style={{
                      width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`
                    }}
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
