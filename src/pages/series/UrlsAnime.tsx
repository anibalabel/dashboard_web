import { useState, useEffect, FormEvent } from 'react';
import { Search, Loader2, AlertCircle, Trash2, Save, Link as LinkIcon, Edit2, X, Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../../lib/clipboard';
import { ConfirmModal } from '../../components/ConfirmModal';
import {
  getDooplexAnime,
  getDooplexAnimeSeasons,
  getDooplexAnimeEpisodes,
  getDooplexAnimeVideos,
  updateDooplexAnimeVideo,
  deleteDooplexAnimeVideo
} from '../../services/api';
import {
  DooplexAnime,
  DooplexAnimeSeason,
  DooplexAnimeEpisode,
  DooplexAnimeVideo
} from '../../types';
import { SERVER_OPTIONS, LANG_OPTIONS, HEADER_OPTIONS } from '../../lib/constants';
import { useSnackbarStore } from '../../store/snackbarStore';

export default function UrlsAnime() {
  const { showSnackbar } = useSnackbarStore();
  const [tmdbId, setTmdbId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  // Anime Data
  const [anime, setAnime] = useState<DooplexAnime | null>(null);
  const [seasons, setSeasons] = useState<DooplexAnimeSeason[]>([]);
  
  const [selectedSeason, setSelectedSeason] = useState<number | ''>('');
  
  // Episode Data
  const [episodes, setEpisodes] = useState<DooplexAnimeEpisode[]>([]);
  // Store videos grouped by episode ID: { [episodeId]: DooplexAnimeVideo[] }
  const [videosMap, setVideosMap] = useState<Record<number, DooplexAnimeVideo[]>>({});

  // Editing State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<DooplexAnimeVideo>>({});
  
  // Selection State for Mass Delete
  const [selectedVideos, setSelectedVideos] = useState<number[]>([]);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tmdbId) return;

    setIsSearching(true);
    setError('');
    setAnime(null);
    setSeasons([]);
    setEpisodes([]);
    setVideosMap({});
    setSelectedSeason('');

    try {
      const res = await getDooplexAnime(tmdbId);
      if (res.data && res.data.length > 0) {
        const foundAnime = res.data[0];
        setAnime(foundAnime);
        
        // Fetch seasons
        const seasonsRes = await getDooplexAnimeSeasons(foundAnime.id);
        setSeasons(seasonsRes.data || []);
      } else {
        setError('No se encontró el anime.');
      }
    } catch {
      setError('Error al buscar el anime.');
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const fetchEpisodesAndVideos = async () => {
      if (selectedSeason) {
        try {
          const res = await getDooplexAnimeEpisodes(Number(selectedSeason));
          const episodesList = res.data || [];
          setEpisodes(episodesList);
          
          // Fetch videos for all episodes in parallel
          const videosPromises = episodesList.map(ep => getDooplexAnimeVideos(ep.id));
          const videosResponses = await Promise.all(videosPromises);
          
          const newVideosMap: Record<number, DooplexAnimeVideo[]> = {};
          episodesList.forEach((ep, index) => {
            newVideosMap[ep.id] = videosResponses[index].data || [];
          });
          
          setVideosMap(newVideosMap);
          setSelectedVideos([]);
        } catch {
          console.error("Error fetching episodes or videos");
        }
      }
    };
    fetchEpisodesAndVideos();
  }, [selectedSeason]);

  const handleEdit = (video: DooplexAnimeVideo) => {
    setEditingId(video.id);
    setEditForm(video);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async (episodeId: number) => {
    if (!editingId || !editForm) return;

    try {
      await updateDooplexAnimeVideo({
        id: editingId,
        link: editForm.link,
        server: editForm.server,
        header: editForm.header,
        lang: editForm.lang
      });
      
      // Update local state
      setVideosMap(prev => ({
        ...prev,
        [episodeId]: prev[episodeId].map(v => v.id === editingId ? { ...v, ...editForm } as DooplexAnimeVideo : v)
      }));
      setEditingId(null);
    } catch {
      showSnackbar('Error al actualizar el video', 'error');
    }
  };

  const handleDelete = (id: number, episodeId: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Enlace',
      message: '¿Estás seguro de eliminar este enlace?',
      onConfirm: async () => {
        try {
          await deleteDooplexAnimeVideo(id);
          setVideosMap(prev => ({
            ...prev,
            [episodeId]: prev[episodeId].filter(v => v.id !== id)
          }));
        } catch {
          showSnackbar('Error al eliminar el video', 'error');
        }
      }
    });
  };

  const handleMassDelete = () => {
    if (selectedVideos.length === 0) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Enlaces',
      message: `¿Estás seguro de eliminar ${selectedVideos.length} enlaces?`,
      onConfirm: async () => {
        try {
          await Promise.all(selectedVideos.map(id => deleteDooplexAnimeVideo(id)));
          
          setVideosMap(prev => {
            const newMap = { ...prev };
            Object.keys(newMap).forEach(key => {
              const epId = Number(key);
              newMap[epId] = newMap[epId].filter(v => !selectedVideos.includes(v.id));
            });
            return newMap;
          });
          setSelectedVideos([]);
        } catch {
          showSnackbar('Error al eliminar algunos videos', 'error');
        }
      }
    });
  };

  const toggleSelect = (id: number) => {
    if (selectedVideos.includes(id)) {
      setSelectedVideos(selectedVideos.filter(v => v !== id));
    } else {
      setSelectedVideos([...selectedVideos, id]);
    }
  };

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyText = async (text: string, key: string, successMsg?: string) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      showSnackbar(successMsg || 'URL copiada al portapapeles', 'success');
      setTimeout(() => {
        setCopiedKey(prev => (prev === key ? null : prev));
      }, 2000);
    } else {
      showSnackbar('Error al copiar al portapapeles', 'error');
    }
  };

  // Helper to copy URLs
  const handleCopyUrls = async () => {
    const urls = selectedVideos.length > 0
      ? Object.values(videosMap).flat().filter(v => selectedVideos.includes(v.id)).map(v => v.link).join('\n')
      : Object.values(videosMap).flat().map(v => v.link).join('\n');
    
    await handleCopyText(urls, 'all', 'URLs copiadas al portapapeles');
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-3">
        <LinkIcon className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Urls Anime</h1>
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
          {/* Season Selection */}
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
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>{s.season_number}: {s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {selectedSeason && episodes.length > 0 && (
            <div>
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h3 className="text-lg font-bold text-gray-800">Episodios y Enlaces</h3>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => {
                      const allVideoIds = Object.values(videosMap).flat().map(v => v.id);
                      setSelectedVideos(allVideoIds);
                    }} 
                    className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-semibold transition-colors"
                  >
                    Marcar Todo
                  </button>
                  <button 
                    onClick={() => setSelectedVideos([])} 
                    className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-semibold transition-colors"
                  >
                    Desmarcar Todo
                  </button>
                  <button 
                    onClick={handleCopyUrls} 
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                      copiedKey === 'all'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {copiedKey === 'all' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>¡Copiadas!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar URLs</span>
                      </>
                    )}
                  </button>
                  {selectedVideos.length > 0 && (
                    <button onClick={handleMassDelete} className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs font-semibold transition-colors flex items-center gap-1">
                      <Trash2 className="h-3 w-3" /> Eliminar
                    </button>
                  )}
                </div>
              </div>

              {/* Episode List */}
              <div className="space-y-4">
                {episodes.map((episode) => {
                  const epVideos = videosMap[episode.id] || [];
                  const isEpSelected = epVideos.length > 0 && epVideos.every(v => selectedVideos.includes(v.id));

                  return (
                    <div key={episode.id} className="bg-gray-50 rounded-lg border border-gray-200 p-5 shadow-sm">
                      <div className="flex items-center gap-3 mb-2">
                        <input
                          type="checkbox"
                          checked={isEpSelected}
                          onChange={() => {
                            if (isEpSelected) {
                              setSelectedVideos(prev => prev.filter(id => !epVideos.map(v => v.id).includes(id)));
                            } else {
                              const newIds = epVideos.map(v => v.id).filter(id => !selectedVideos.includes(id));
                              setSelectedVideos(prev => [...prev, ...newIds]);
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                          disabled={epVideos.length === 0}
                        />
                        <h4 className="text-md font-bold text-gray-800">
                          {episode.episode_number}: {episode.name}
                        </h4>
                      </div>

                      <div className="pl-7">
                        {epVideos.length === 0 ? (
                          <p className="text-sm text-gray-400 italic">No hay enlaces disponibles.</p>
                        ) : (
                          <div className="space-y-4">
                            {epVideos.map(video => (
                              <div key={video.id} className="relative group">
                                {editingId === video.id ? (
                                  <div className="bg-white p-3 rounded border border-blue-200 shadow-sm grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                                    <div className="sm:col-span-2">
                                      <select
                                        value={editForm.server}
                                        onChange={(e) => setEditForm({...editForm, server: e.target.value})}
                                        className="w-full rounded border-gray-300 text-xs p-1.5"
                                      >
                                        {SERVER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                      </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                      <select
                                        value={editForm.lang}
                                        onChange={(e) => setEditForm({...editForm, lang: e.target.value})}
                                        className="w-full rounded border-gray-300 text-xs p-1.5"
                                      >
                                        {LANG_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                      </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                      <select
                                        value={editForm.header || ''}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          setEditForm({ ...editForm, header: value, server: value || editForm.server });
                                        }}
                                        className="w-full rounded border-gray-300 text-xs p-1.5"
                                      >
                                        {HEADER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                      </select>
                                    </div>
                                    <div className="sm:col-span-4">
                                      <input
                                        type="text"
                                        value={editForm.link}
                                        onChange={(e) => setEditForm({...editForm, link: e.target.value})}
                                        className="w-full rounded border-gray-300 text-xs p-1.5"
                                      />
                                    </div>
                                    <div className="sm:col-span-2 flex justify-end gap-1">
                                      <button onClick={() => handleSave(episode.id)} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200"><Save className="h-4 w-4" /></button>
                                      <button onClick={handleCancelEdit} className="p-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"><X className="h-4 w-4" /></button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <input
                                            type="checkbox"
                                            checked={selectedVideos.includes(video.id)}
                                            onChange={() => toggleSelect(video.id)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3 w-3"
                                        />
                                        <span className="font-bold text-gray-700 text-sm">
                                          {video.server} - {video.lang} {video.header ? `(${video.header})` : ''}
                                        </span>
                                      </div>
                                      <a 
                                        href={video.link} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="text-xs text-gray-500 hover:text-blue-600 hover:underline truncate block pl-5"
                                      >
                                        {video.link}
                                      </a>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 pl-5 sm:pl-0">
                                      <button 
                                        onClick={() => handleEdit(video)}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-semibold transition-colors"
                                      >
                                        <Edit2 className="h-3 w-3" /> Editar
                                      </button>
                                      <button 
                                        onClick={() => handleCopyText(video.link, `vid-${video.id}`)}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                                          copiedKey === `vid-${video.id}`
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                        }`}
                                      >
                                        {copiedKey === `vid-${video.id}` ? (
                                          <>
                                            <Check className="h-3 w-3 text-emerald-600" /> ¡Copiado!
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="h-3 w-3" /> Copiar
                                          </>
                                        )}
                                      </button>
                                      <button 
                                        onClick={() => handleDelete(video.id, episode.id)}
                                        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                        title="Eliminar"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedSeason && episodes.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-sm text-gray-500">
          No hay episodios disponibles para esta temporada.
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirm}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive
      />
    </div>
  );
}
