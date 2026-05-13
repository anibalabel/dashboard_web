import { useState, useEffect, FormEvent } from 'react';
import { Search, PlayCircle, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import {
  getDocinesSeries,
  getDocinesSeasons,
  getDocinesEpisodes,
  registerDocinesLink
} from '../../services/api';
import {
  DocinesSerie,
  DocinesSeason,
  DocinesEpisode
} from '../../types';
import { LANG_OPTIONS, QUALITY_OPTIONS, HEADER_OPTIONS } from '../../lib/constants';

export default function RegistroDocines() {
  const [tmdbId, setTmdbId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  // Series Data
  const [docinesSeries, setDocinesSeries] = useState<DocinesSerie | null>(null);

  // Seasons Data
  const [docinesSeasons, setDocinesSeasons] = useState<DocinesSeason[]>([]);
  const [selectedDocinesSeason, setSelectedDocinesSeason] = useState<number | ''>('');

  // Episodes Data
  const [docinesEpisodes, setDocinesEpisodes] = useState<DocinesEpisode[]>([]);
  const [selectedStartEpisodeId, setSelectedStartEpisodeId] = useState<number | ''>('');

  // Form Data
  const [urls, setUrls] = useState('');
  const [docinesQuality, setDocinesQuality] = useState('1080P');
  const [docinesHeader, setDocinesHeader] = useState('');
  const [docinesLang, setDocinesLang] = useState('LAT');

  // Registration State
  const [isRegistering, setIsRegistering] = useState(false);
  const [progress, setProgress] = useState<{ total: number; current: number; logs: { msg: string, isError?: boolean }[] }>({
    total: 0,
    current: 0,
    logs: []
  });

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tmdbId) return;

    setIsSearching(true);
    setError('');
    setDocinesSeries(null);
    setDocinesSeasons([]);
    setDocinesEpisodes([]);
    setSelectedDocinesSeason('');
    setSelectedStartEpisodeId('');

    try {
      const res = await getDocinesSeries(tmdbId);

      if (res.data && res.data.length > 0) {
        const serie = res.data[0];
        setDocinesSeries(serie);
        const seasonsRes = await getDocinesSeasons(serie.id);
        setDocinesSeasons(seasonsRes.data || []);
      } else {
        setError('No se encontró la serie en Docines.');
      }
    } catch {
      setError('Error al buscar la serie. Verifica el ID de TMDB.');
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const fetchEpisodes = async () => {
      if (selectedDocinesSeason) {
        try {
          const res = await getDocinesEpisodes(Number(selectedDocinesSeason));
          const normalizedEpisodes = (res.data || [])
            .map((ep) => ({
              ...ep,
              id: Number(ep.id),
              season_id: Number(ep.season_id),
              episoade_order: Number(ep.episoade_order)
            }))
            .sort((a, b) => a.episoade_order - b.episoade_order);

          setDocinesEpisodes(normalizedEpisodes);
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
  }, [selectedDocinesSeason]);

  const handleRegister = async () => {
    if (!selectedStartEpisodeId || !urls.trim()) {
      alert("Por favor completa todos los campos y agrega al menos una URL.");
      return;
    }

    const urlList = urls.split('\n').map(u => u.trim()).filter(u => u);
    if (urlList.length === 0) return;

    setIsRegistering(true);
    setProgress({ total: urlList.length, current: 0, logs: [] });

    const startIndex = docinesEpisodes.findIndex(ep => ep.id === Number(selectedStartEpisodeId));
    if (docinesEpisodes.length === 0) {
      setProgress(prev => ({
        ...prev,
        logs: [{ msg: 'Error: no hay episodios cargados para la temporada seleccionada.', isError: true }, ...prev.logs]
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

    const availableFromStart = docinesEpisodes.length - startIndex;
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
      const currentEpisode = docinesEpisodes[currentIndex];

      if (!currentEpisode) {
        setProgress(prev => ({
          ...prev,
          logs: [{ msg: `Aviso: No hay suficientes episodios en la temporada. Se detuvo en la URL ${i + 1}.`, isError: true }, ...prev.logs]
        }));
        break;
      }

      try {
        await registerDocinesLink({
          episode_id: currentEpisode.id,
          quality: docinesQuality,
          name: docinesHeader ? `${docinesLang} - ${docinesHeader}` : docinesLang,
          url: currentUrl
        });
        setProgress(prev => ({
          ...prev,
          logs: [{ msg: `[Docines] Episodio ${currentEpisode.episoade_order} registrado.`, isError: false }, ...prev.logs]
        }));
      } catch {
        setProgress(prev => ({
          ...prev,
          logs: [{ msg: `[Docines] Error al registrar Episodio ${currentEpisode.episoade_order}.`, isError: true }, ...prev.logs]
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
        <h1 className="text-3xl font-bold text-gray-900">Registro Docines</h1>
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

      {docinesSeries && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Datos de la Serie</h2>
              
              <div className="mb-6">
                <span className="block text-sm text-gray-500">Docines</span>
                <span className="font-medium">{docinesSeries.name}</span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temporada Docines</label>
                  <select
                    value={selectedDocinesSeason}
                    onChange={(e) => setSelectedDocinesSeason(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  >
                    <option value="">Seleccione temporada...</option>
                    {docinesSeasons.map(s => (
                      <option key={s.id} value={s.id}>{s.season_order}: {s.Session_Name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Episodio Inicial (Docines)</label>
                  <select
                    value={selectedStartEpisodeId}
                    onChange={(e) => setSelectedStartEpisodeId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    disabled={!selectedDocinesSeason}
                  >
                    <option value="">Seleccione episodio...</option>
                    {docinesEpisodes.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.episoade_order}: {e.Episoade_Name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Metadatos Docines</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Calidad</label>
                  <select
                    value={docinesQuality}
                    onChange={(e) => setDocinesQuality(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
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
                    onChange={(e) => setDocinesHeader(e.target.value)}
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
                    value={docinesLang}
                    onChange={(e) => setDocinesLang(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  >
                    {LANG_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">URLs de Episodios</h2>
              <p className="text-sm text-gray-500 mb-2">Ingresa una URL por línea.</p>
              <textarea
                rows={8}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 font-mono text-sm"
                placeholder="https://example.com/ep1.mp4&#10;https://example.com/ep2.mp4"
              ></textarea>

              <button
                onClick={handleRegister}
                disabled={isRegistering || !selectedStartEpisodeId || !urls.trim()}
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
                    Iniciar Registro Docines
                  </>
                )}
              </button>
            </div>

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
