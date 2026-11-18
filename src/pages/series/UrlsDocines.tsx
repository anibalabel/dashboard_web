import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Edit2, Link as LinkIcon, Loader2, Save, Search, Trash2, X, Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../../lib/clipboard';
import { ConfirmModal } from '../../components/ConfirmModal';
import {
  deleteDocinesVideo,
  getDocinesEpisodes,
  getDocinesSeasons,
  getDocinesSeries,
  getDocinesVideos,
  updateDocinesVideo
} from '../../services/api';
import { DocinesEpisode, DocinesSeason, DocinesSerie, DocinesVideoLink } from '../../types';
import { LANG_OPTIONS, QUALITY_OPTIONS } from '../../lib/constants';
import { formatDoodstreamUrl } from '../../lib/doodstreamUtils';
import { useSnackbarStore } from '../../store/snackbarStore';

export default function UrlsDocines() {
  const { showSnackbar } = useSnackbarStore();
  const [tmdbId, setTmdbId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const [serie, setSerie] = useState<DocinesSerie | null>(null);
  const [seasons, setSeasons] = useState<DocinesSeason[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | ''>('');

  const [episodes, setEpisodes] = useState<DocinesEpisode[]>([]);
  const [videosMap, setVideosMap] = useState<Record<number, DocinesVideoLink[]>>({});

  const [selectedVideos, setSelectedVideos] = useState<number[]>([]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<DocinesVideoLink>>({});

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

  const allVideoIds = useMemo(() => Object.values(videosMap).flat().map(v => v.id), [videosMap]);

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tmdbId) return;

    setIsSearching(true);
    setError('');
    setSerie(null);
    setSeasons([]);
    setSelectedSeason('');
    setEpisodes([]);
    setVideosMap({});
    setSelectedVideos([]);
    setEditingId(null);
    setEditForm({});

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
    const fetchEpisodesAndVideos = async () => {
      if (!selectedSeason) return;

      setEpisodes([]);
      setVideosMap({});
      setSelectedVideos([]);
      setEditingId(null);
      setEditForm({});

      try {
        const epRes = await getDocinesEpisodes(Number(selectedSeason));
        const episodesList = (epRes.data || []).slice().sort((a, b) => a.episoade_order - b.episoade_order);
        setEpisodes(episodesList);

        const videosResponses = await Promise.all(episodesList.map(ep => getDocinesVideos(ep.id)));
        const nextMap: Record<number, DocinesVideoLink[]> = {};
        episodesList.forEach((ep, idx) => {
          nextMap[ep.id] = videosResponses[idx].data || [];
        });
        setVideosMap(nextMap);
      } catch {
        setEpisodes([]);
        setVideosMap({});
      }
    };
    fetchEpisodesAndVideos();
  }, [selectedSeason]);

  const toggleSelect = (id: number) => {
    setSelectedVideos(prev => (prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]));
  };

  const selectAll = () => setSelectedVideos(allVideoIds);
  const deselectAll = () => setSelectedVideos([]);

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

  const handleCopyUrls = async () => {
    const urls =
      selectedVideos.length > 0
        ? Object.values(videosMap).flat().filter(v => selectedVideos.includes(v.id)).map(v => v.url).join('\n')
        : Object.values(videosMap).flat().map(v => v.url).join('\n');
    await handleCopyText(urls, 'all', 'URLs copiadas al portapapeles');
  };

  const handleEdit = (video: DocinesVideoLink) => {
    setEditingId(video.id);
    setEditForm({ ...video });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async (episodeId: number) => {
    if (!editingId) return;
    try {
      const normalizedUrl = formatDoodstreamUrl(editForm.url || '', editForm.name);
      await updateDocinesVideo({
        id: editingId,
        name: editForm.name,
        url: normalizedUrl,
        quality: editForm.quality
      });

      setVideosMap(prev => ({
        ...prev,
        [episodeId]: prev[episodeId].map(v => (v.id === editingId ? ({ ...v, ...editForm, url: normalizedUrl } as DocinesVideoLink) : v))
      }));
      setEditingId(null);
      setEditForm({});
    } catch {
      showSnackbar('Error al actualizar el enlace', 'error');
    }
  };

  const handleDeleteOne = (id: number, episodeId: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Enlace',
      message: '¿Estás seguro de eliminar este enlace?',
      onConfirm: async () => {
        try {
          await deleteDocinesVideo(id);
          setVideosMap(prev => ({
            ...prev,
            [episodeId]: prev[episodeId].filter(v => v.id !== id)
          }));
          setSelectedVideos(prev => prev.filter(v => v !== id));
          if (editingId === id) {
            setEditForm({});
          }
        } catch {
          showSnackbar('Error al eliminar el enlace', 'error');
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
          await Promise.all(selectedVideos.map(id => deleteDocinesVideo(id)));
          setVideosMap(prev => {
            const nextMap: Record<number, DocinesVideoLink[]> = {};
            Object.keys(prev).forEach(key => {
              const epId = Number(key);
              nextMap[epId] = prev[epId].filter(v => !selectedVideos.includes(v.id));
            });
            return nextMap;
          });
          setSelectedVideos([]);
          setEditingId(null);
          setEditForm({});
        } catch {
          showSnackbar('Error al eliminar algunos enlaces', 'error');
        }
      }
    });
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-3">
        <LinkIcon className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Urls Series Docines</h1>
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

          {selectedSeason && episodes.length > 0 && (
            <div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h3 className="text-lg font-bold text-gray-800">Episodios y Enlaces</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={selectAll}
                    className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-semibold transition-colors"
                    type="button"
                  >
                    Marcar Todo
                  </button>
                  <button
                    onClick={deselectAll}
                    className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-semibold transition-colors"
                    type="button"
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
                    type="button"
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
                    <button
                      onClick={handleMassDelete}
                      className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs font-semibold transition-colors flex items-center gap-1"
                      type="button"
                    >
                      <Trash2 className="h-3 w-3" /> Eliminar
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                {episodes.map((ep) => {
                  const links = videosMap[ep.id] || [];
                  return (
                    <div key={ep.id} className="bg-white rounded-lg border border-gray-200 shadow-sm">
                      <div className="px-5 py-4 border-b border-gray-100">
                        <h4 className="font-semibold text-gray-900">
                          {ep.episoade_order}: {ep.Episoade_Name}
                        </h4>
                      </div>

                      <div className="p-5 space-y-3">
                        {links.length === 0 ? (
                          <div className="text-sm text-gray-500">Sin enlaces</div>
                        ) : (
                          links.map((video) => {
                            const isSelected = selectedVideos.includes(video.id);
                            const isEditing = editingId === video.id;
                            return (
                              <div key={video.id} className="bg-gray-50 rounded border border-gray-200 p-4">
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelect(video.id)}
                                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                                  />
                                  <div className="flex-1 min-w-0">
                                    {isEditing ? (
                                      <div className="bg-white p-3 rounded border border-blue-200 shadow-sm grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                                        <div className="sm:col-span-2">
                                          <select
                                            value={editForm.name ?? ''}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                            className="w-full rounded border-gray-300 text-xs p-1.5"
                                          >
                                            <option value="">Idioma...</option>
                                            {LANG_OPTIONS.map(opt => (
                                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="sm:col-span-2">
                                          <select
                                            value={editForm.quality ?? ''}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, quality: e.target.value }))}
                                            className="w-full rounded border-gray-300 text-xs p-1.5"
                                          >
                                            <option value="">Calidad...</option>
                                            {QUALITY_OPTIONS.map(opt => (
                                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="sm:col-span-7">
                                          <input
                                            type="text"
                                            value={editForm.url ?? ''}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, url: e.target.value }))}
                                            className="w-full rounded border-gray-300 text-xs p-1.5"
                                            placeholder="URL"
                                          />
                                        </div>
                                        <div className="sm:col-span-1 flex justify-end gap-1">
                                          <button
                                            onClick={() => handleSave(ep.id)}
                                            className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200"
                                            type="button"
                                          >
                                            <Save className="h-4 w-4" />
                                          </button>
                                          <button
                                            onClick={handleCancelEdit}
                                            className="p-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                            type="button"
                                          >
                                            <X className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <div className="flex gap-2 items-center text-xs">
                                            <span className="font-semibold text-gray-800">{video.name}</span>
                                            <span className="text-gray-400">•</span>
                                            <span className="text-gray-600">Calidad: {video.quality || 'N/A'}</span>
                                          </div>
                                          <a
                                            href={video.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-gray-500 hover:text-blue-600 hover:underline truncate block"
                                          >
                                            {video.url}
                                          </a>
                                        </div>
                                        <div className="flex items-center gap-2 self-end sm:self-center">
                                          <button
                                            onClick={() => handleEdit(video)}
                                            className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-semibold transition-colors"
                                            type="button"
                                          >
                                            <Edit2 className="h-3 w-3" /> Editar
                                          </button>
                                          <button
                                            onClick={() => handleCopyText(video.url, `vid-${video.id}`)}
                                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                                              copiedKey === `vid-${video.id}`
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                            }`}
                                            type="button"
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
                                            onClick={() => handleDeleteOne(video.id, ep.id)}
                                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                            title="Eliminar"
                                            type="button"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

      {selectedSeason && episodes.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-sm text-gray-500">
          No hay episodios disponibles para esta temporada.
        </div>
      )}
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
