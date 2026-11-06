import { useState, useEffect, useMemo, FormEvent } from 'react';
import { Search, PlayCircle, Loader2, CheckCircle, AlertCircle, ListVideo, Ban, Plus, X, RotateCcw } from 'lucide-react';
import {
  getDooplexSeries,
  getDooplexSeasons,
  getDooplexEpisodes,
  registerDooplexLink
} from '../../services/api';
import {
  DooplexSerie,
  DooplexSeason,
  DooplexEpisode
} from '../../types';

const DEFAULT_EXCLUDED_SERVERS = ['doodstream', 'waaw', 'dsvplay'];
const STORAGE_KEY_EXCLUDED = 'dooplex_v2_excluded_servers';

const DEFAULT_EXCLUDED_LANGS: string[] = [];
const STORAGE_KEY_EXCLUDED_LANGS = 'dooplex_v2_excluded_langs';
const STANDARD_LANGS: { code: 'LAT' | 'CAST' | 'SUB'; label: string }[] = [
  { code: 'LAT', label: 'LAT (Latino)' },
  { code: 'CAST', label: 'CAST (Castellano)' },
  { code: 'SUB', label: 'SUB (Subtitulado)' }
];

interface ParsedLinkItem {
  episodeNumber: number | null;
  server: string; // Calidad (Server), ej: "1080p HD"
  lang: 'CAST' | 'LAT' | 'SUB';
  rawLang: string;
  header: string; // Ej: "Voe", "filemoon", "vidmoly", "Vidara"
  link: string;
  source: 'embed' | 'supported_hosts';
}

interface ParsedEpisodeGroup {
  episodeNumber: number | null;
  title: string;
  items: ParsedLinkItem[];
}

interface ParseResult {
  groups: ParsedEpisodeGroup[];
  detectedServers: string[];
  detectedLangs: ('CAST' | 'LAT' | 'SUB')[];
  discardedCount: number;
}

function mapLanguage(rawLang: string): 'CAST' | 'LAT' | 'SUB' {
  const normalized = rawLang.trim().toLowerCase();
  if (
    normalized.includes('españa') ||
    normalized.includes('espana') ||
    normalized.includes('castellano') ||
    normalized === 'cast'
  ) {
    return 'CAST';
  }
  if (normalized.includes('subtitulado') || normalized.includes('sub') || normalized.includes('vose')) {
    return 'SUB';
  }
  if (normalized.includes('latino') || normalized === 'lat') {
    return 'LAT';
  }
  return 'LAT';
}

function mapSource(header: string, link: string): 'embed' | 'supported_hosts' {
  const h = header.trim().toLowerCase();
  const l = link.trim().toLowerCase();
  if (h.includes('vidara') || h.includes('virda') || l.includes('vidara')) {
    return 'supported_hosts';
  }
  return 'embed';
}

function isServerExcluded(header: string, link: string, excludedServers: string[]): boolean {
  const h = header.trim().toLowerCase();
  const l = link.trim().toLowerCase();
  return excludedServers.some((ex) => {
    const keyword = ex.trim().toLowerCase();
    if (!keyword) return false;
    return h === keyword || h.includes(keyword) || l.includes(keyword);
  });
}

function isLanguageExcluded(lang: 'CAST' | 'LAT' | 'SUB', rawLang: string, excludedLangs: string[]): boolean {
  const normLang = lang.trim().toLowerCase();
  const normRaw = rawLang.trim().toLowerCase();
  return excludedLangs.some((ex) => {
    const keyword = ex.trim().toLowerCase();
    if (!keyword) return false;
    if (keyword === normLang || keyword === normRaw || normRaw.includes(keyword)) {
      return true;
    }
    if (
      (keyword === 'castellano' || keyword === 'español españa' || keyword === 'espana' || keyword === 'españa') &&
      lang === 'CAST'
    ) {
      return true;
    }
    if ((keyword === 'latino' || keyword === 'español latino') && lang === 'LAT') {
      return true;
    }
    if ((keyword === 'subtitulado' || keyword === 'vose') && lang === 'SUB') {
      return true;
    }
    return false;
  });
}

function parseEpisodesText(
  rawText: string,
  skipDuplicates: boolean,
  excludedServers: string[],
  excludedLangs: string[]
): ParseResult {
  const lines = rawText.split(/\r?\n/);
  const groups: ParsedEpisodeGroup[] = [];
  const detectedServersSet = new Set<string>();
  const detectedLangsSet = new Set<'CAST' | 'LAT' | 'SUB'>();
  let currentGroup: ParsedEpisodeGroup | null = null;
  let discardedCount = 0;

  const episodeHeaderRegex = /^\s*EPISODIO\s+(\d+)(.*)$/i;
  const linkLineRegex = /^\s*(?:[•*-]\s*)?\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.+?)\s*->\s*(https?:\/\/\S+)/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const epMatch = line.match(episodeHeaderRegex);
    if (epMatch) {
      const epNum = Number(epMatch[1]);
      currentGroup = {
        episodeNumber: epNum,
        title: line,
        items: []
      };
      groups.push(currentGroup);
      continue;
    }

    const linkMatch = line.match(linkLineRegex);
    if (linkMatch) {
      const server = linkMatch[1].trim();
      const rawLang = linkMatch[2].trim();
      const header = linkMatch[3].trim();
      const link = linkMatch[4].trim();
      const lang = mapLanguage(rawLang);
      const source = mapSource(header, link);

      detectedServersSet.add(header);
      detectedLangsSet.add(lang);

      if (
        isServerExcluded(header, link, excludedServers) ||
        isLanguageExcluded(lang, rawLang, excludedLangs)
      ) {
        discardedCount++;
        continue;
      }

      if (!currentGroup) {
        currentGroup = {
          episodeNumber: null,
          title: 'Episodio Inicial Seleccionado',
          items: []
        };
        groups.push(currentGroup);
      }

      if (skipDuplicates) {
        const exists = currentGroup.items.some(
          (item) =>
            item.link === link &&
            item.lang === lang &&
            item.header.toLowerCase() === header.toLowerCase()
        );
        if (exists) continue;
      }

      currentGroup.items.push({
        episodeNumber: currentGroup.episodeNumber,
        server,
        lang,
        rawLang,
        header,
        link,
        source
      });
    }
  }

  return {
    groups: groups.filter((g) => g.items.length > 0),
    detectedServers: Array.from(detectedServersSet),
    detectedLangs: Array.from(detectedLangsSet),
    discardedCount
  };
}

export default function RegistroDooplexV2() {
  const [tmdbId, setTmdbId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  // Series Data
  const [dooplexSeries, setDooplexSeries] = useState<DooplexSerie | null>(null);

  // Seasons Data
  const [dooplexSeasons, setDooplexSeasons] = useState<DooplexSeason[]>([]);

  // Selected Seasons
  const [selectedDooplexSeason, setSelectedDooplexSeason] = useState<number | ''>('');

  // Episodes Data
  const [dooplexEpisodes, setDooplexEpisodes] = useState<DooplexEpisode[]>([]);
  const [selectedStartEpisodeId, setSelectedStartEpisodeId] = useState<number | ''>('');

  // Form Data
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
    const isCurrentlyExcluded = isLanguageExcluded(langCode, langCode, excludedLangs);

    if (isCurrentlyExcluded) {
      setExcludedLangs((prev) =>
        prev.filter((ex) => !isLanguageExcluded(langCode, langCode, [ex]))
      );
    } else {
      setExcludedLangs((prev) => [...prev, langCode]);
    }
  };

  const handleResetExcludedLangs = () => {
    setExcludedLangs(DEFAULT_EXCLUDED_LANGS);
  };

  // Registration State
  const [isRegistering, setIsRegistering] = useState(false);
  const [progress, setProgress] = useState<{
    total: number;
    current: number;
    logs: { msg: string; isError?: boolean }[];
  }>({
    total: 0,
    current: 0,
    logs: []
  });

  const { groups: parsedGroups, detectedServers, detectedLangs, discardedCount } = useMemo(
    () => parseEpisodesText(urls, skipDuplicates, excludedServers, excludedLangs),
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
    setDooplexSeries(null);
    setDooplexSeasons([]);
    setDooplexEpisodes([]);
    setSelectedDooplexSeason('');
    setSelectedStartEpisodeId('');

    try {
      const dooplexRes = await getDooplexSeries(tmdbId);

      if (dooplexRes.data && dooplexRes.data.length > 0) {
        const serie = dooplexRes.data[0];
        setDooplexSeries(serie);
        const seasonsRes = await getDooplexSeasons(serie.id);
        setDooplexSeasons(seasonsRes.data || []);
      } else {
        setError('No se encontró la serie en Dooplex.');
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
          console.error('Error fetching episodes');
        }
      }
    };
    fetchEpisodes();
  }, [selectedDooplexSeason]);

  const resolveDooplexEpisode = (
    group: ParsedEpisodeGroup,
    groupIndex: number,
    startIndex: number
  ): DooplexEpisode | undefined => {
    if (group.episodeNumber !== null) {
      const byNumber = dooplexEpisodes.find((ep) => ep.episode_number === group.episodeNumber);
      if (byNumber) return byNumber;
    }
    if (startIndex >= 0) {
      return dooplexEpisodes[startIndex + groupIndex];
    }
    return undefined;
  };

  const handleRegister = async () => {
    if (!selectedDooplexSeason || !urls.trim()) {
      alert('Por favor selecciona una temporada y pega el texto con los episodios.');
      return;
    }

    if (parsedGroups.length === 0 || totalParsedLinks === 0) {
      alert('No hay enlaces válidos para registrar (verifica el formato o los servidores descartados).');
      return;
    }

    if (dooplexEpisodes.length === 0) {
      setProgress({
        total: 0,
        current: 0,
        logs: [{ msg: 'Error: no hay episodios cargados para la temporada seleccionada.', isError: true }]
      });
      return;
    }

    const startIndex = selectedStartEpisodeId
      ? dooplexEpisodes.findIndex((ep) => ep.id === Number(selectedStartEpisodeId))
      : 0;

    setIsRegistering(true);
    setProgress({ total: totalParsedLinks, current: 0, logs: [] });

    let completed = 0;

    for (let gIdx = 0; gIdx < parsedGroups.length; gIdx++) {
      const group = parsedGroups[gIdx];
      const targetEpisode = resolveDooplexEpisode(group, gIdx, startIndex >= 0 ? startIndex : 0);

      if (!targetEpisode) {
        setProgress((prev) => ({
          ...prev,
          logs: [
            {
              msg: `Aviso: No se encontró el episodio en Dooplex para "${group.title}". Se omitieron ${group.items.length} enlaces.`,
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
        const sourceFlags = {
          embed: item.source === 'embed' ? '1' : '0',
          youtubelink: '0',
          hls: '0',
          supported_hosts: item.source === 'supported_hosts' ? '1' : '0'
        };

        try {
          await registerDooplexLink({
            episode_id: targetEpisode.id,
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
                msg: `[Ep ${targetEpisode.episode_number}] OK -> [${item.server}] [${item.lang}] ${item.header} (${
                  item.source === 'supported_hosts' ? 'SUPPORTED HOST' : 'EMBED'
                })`,
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
                msg: `[Ep ${targetEpisode.episode_number}] Error -> [${item.server}] [${item.lang}] ${item.header}: ${item.link}`,
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
        <h1 className="text-3xl font-bold text-gray-900">Registro Dooplex V2</h1>
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

      {dooplexSeries && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Selection & Rules Info */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Datos de la Serie</h2>

              <div className="mb-6">
                <div>
                  <span className="block text-sm text-gray-500">Dooplex</span>
                  <span className="font-medium">{dooplexSeries ? dooplexSeries.name : 'No encontrada'}</span>
                  {dooplexSeries && (
                    <span className="block text-xs text-gray-400 mt-0.5">ID: {dooplexSeries.id}</span>
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
                    {dooplexSeasons.map((s) => (
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
                    disabled={!selectedDooplexSeason}
                  >
                    <option value="">Seleccione episodio...</option>
                    {dooplexEpisodes.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.episode_number}: {e.name}
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
                      const isEx = isServerExcluded(srv, '', excludedServers);
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
                    const isEx = isLanguageExcluded(code, code, excludedLangs);
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

            {/* Preview of Parsed Episodes */}
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
                      ? dooplexEpisodes.findIndex((ep) => ep.id === Number(selectedStartEpisodeId))
                      : 0;
                    const matchedEp = resolveDooplexEpisode(group, idx, startIndex >= 0 ? startIndex : 0);

                    return (
                      <div key={idx} className="bg-gray-50 rounded-md p-3 border border-gray-200 text-xs">
                        <div className="flex items-center justify-between font-semibold text-gray-800 mb-1.5">
                          <span>{group.title}</span>
                          {matchedEp ? (
                            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              &rarr; Dooplex Ep. {matchedEp.episode_number}
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
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {item.source === 'supported_hosts' ? 'SUPPORTED HOST' : 'EMBED'}
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

          {/* Right Column: URLs and Progress */}
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
                placeholder={`--------------------------------------------------------------------\nEPISODIO 1 [T1·E1] - Capítulo 1\n--------------------------------------------------------------------\n  • [1080p HD] [Español España] Voe -> https://voe.sx/e/bjvd6oxwbz4k\n  • [1080p HD] [Subtitulado] filemoon -> https://byseqekaho.com/e/6wbosve3hlry`}
              ></textarea>

              <button
                onClick={handleRegister}
                disabled={isRegistering || !selectedDooplexSeason || totalParsedLinks === 0}
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

            {/* Progress Viewer */}
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
