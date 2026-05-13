import { useEffect, useMemo, useState, FormEvent } from 'react';
import { AlertCircle, Link as LinkIcon, Loader2, Save, Search, Trash2, X, Edit2 } from 'lucide-react';
import { ConfirmModal } from '../../components/ConfirmModal';
import {
  deletePlusmovieEpisode,
  getPlusmovieEpisodes,
  getPlusmovieSeasons,
  getPlusmovieSeries,
  updatePlusmovieEpisode
} from '../../services/api';
import { PlusmovieEpisode, PlusmovieSeason, PlusmovieSerie } from '../../types';
import { useSnackbarStore } from '../../store/snackbarStore';

export default function UrlsPlusmovie() {
  const { showSnackbar } = useSnackbarStore();
  const [tmdbId, setTmdbId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const [serie, setSerie] = useState<PlusmovieSerie | null>(null);
  const [seasons, setSeasons] = useState<PlusmovieSeason[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | ''>('');

  const [episodes, setEpisodes] = useState<PlusmovieEpisode[]>([]);
  const [selectedEpisodes, setSelectedEpisodes] = useState<number[]>([]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<PlusmovieEpisode>>({});

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

  const allEpisodeIds = useMemo(() => episodes.map(e => e.episodes_id), [episodes]);

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tmdbId) return;

    setIsSearching(true);
    setError('');
    setSerie(null);
    setSeasons([]);
    setSelectedSeason('');
    setEpisodes([]);
    setSelectedEpisodes([]);
    setEditingId(null);
    setEditForm({});

    try {
      const seriesRes = await getPlusmovieSeries(tmdbId);
      if (!seriesRes.data || seriesRes.data.length === 0) {
        setError('No se encontró la serie en Plusmovie.');
        return;
      }

      const foundSerie = seriesRes.data[0];
      setSerie(foundSerie);

      const seasonsRes = await getPlusmovieSeasons(foundSerie.videos_id);
      setSeasons(seasonsRes.data || []);
    } catch {
      setError('Error al buscar la serie. Verifica el ID de TMDB.');
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const fetchEpisodes = async () => {
      if (!selectedSeason) return;
      try {
        const res = await getPlusmovieEpisodes(Number(selectedSeason));
        const list = (res.data || []).slice().sort((a, b) => a.order - b.order);
        setEpisodes(list);
        setSelectedEpisodes([]);
        setEditingId(null);
        setEditForm({});
      } catch {
        setEpisodes([]);
      }
    };
    fetchEpisodes();
  }, [selectedSeason]);

  const toggleSelect = (episodesId: number) => {
    setSelectedEpisodes(prev => (prev.includes(episodesId) ? prev.filter(id => id !== episodesId) : [...prev, episodesId]));
  };

  const selectAll = () => setSelectedEpisodes(allEpisodeIds);
  const deselectAll = () => setSelectedEpisodes([]);

  const handleCopyUrls = async () => {
    const urls =
      selectedEpisodes.length > 0
        ? episodes.filter(e => selectedEpisodes.includes(e.episodes_id)).map(e => e.file_url).join('\n')
        : episodes.map(e => e.file_url).join('\n');
    await navigator.clipboard.writeText(urls);
    showSnackbar('URLs copiadas al portapapeles', 'success');
  };

  const handleEdit = (episode: PlusmovieEpisode) => {
    setEditingId(episode.episodes_id);
    setEditForm({ ...episode });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async () => {
    if (!editingId) return;
    try {
      await updatePlusmovieEpisode({
        episodes_id: editingId,
        episodes_name: editForm.episodes_name,
        file_url: editForm.file_url,
        order: editForm.order
      });

      setEpisodes(prev =>
        prev
          .map(ep => (ep.episodes_id === editingId ? ({ ...ep, ...editForm } as PlusmovieEpisode) : ep))
          .slice()
          .sort((a, b) => a.order - b.order)
      );
      setEditingId(null);
      setEditForm({});
    } catch {
      showSnackbar('Error al actualizar el episodio', 'error');
    }
  };

  const handleDeleteOne = (episodesId: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Episodio',
      message: '¿Estás seguro de eliminar este episodio?',
      onConfirm: async () => {
        try {
          await deletePlusmovieEpisode(episodesId);
          setEpisodes(prev => prev.filter(ep => ep.episodes_id !== episodesId));
          setSelectedEpisodes(prev => prev.filter(id => id !== episodesId));
          if (editingId === episodesId) {
            setEditForm({});
          }
        } catch {
          showSnackbar('Error al eliminar el episodio', 'error');
        }
      }
    });
  };

  const handleMassDelete = () => {
    if (selectedEpisodes.length === 0) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Episodios',
      message: `¿Estás seguro de eliminar ${selectedEpisodes.length} episodios?`,
      onConfirm: async () => {
        try {
          await Promise.all(selectedEpisodes.map(id => deletePlusmovieEpisode(id)));
          setEpisodes(prev => prev.filter(ep => !selectedEpisodes.includes(ep.episodes_id)));
          setSelectedEpisodes([]);
          setEditingId(null);
          setEditForm({});
        } catch {
          showSnackbar('Error al eliminar algunos episodios', 'error');
        }
      }
    });
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-3">
        <LinkIcon className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Urls Series Plusmovie</h1>
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
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{serie.title}</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seleccionar Temporada</label>
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
              >
                <option value="">Seleccione temporada...</option>
                {seasons.map(s => (
                  <option key={s.seasons_id} value={s.seasons_id}>{s.order}: {s.seasons_name}</option>
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
                    className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-semibold transition-colors flex items-center gap-1"
                    type="button"
                  >
                    <LinkIcon className="h-3 w-3" /> Copiar URLs
                  </button>
                  {selectedEpisodes.length > 0 && (
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

              <div className="space-y-4">
                {episodes.map((episode) => {
                  const isSelected = selectedEpisodes.includes(episode.episodes_id);
                  const isEditing = editingId === episode.episodes_id;

                  return (
                    <div key={episode.episodes_id} className="bg-gray-50 rounded-lg border border-gray-200 p-5 shadow-sm">
                      <div className="flex items-center gap-3 mb-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(episode.episodes_id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <h4 className="text-md font-bold text-gray-800">
                          {episode.order}: {episode.episodes_name}
                        </h4>
                      </div>

                      <div className="pl-7">
                        {isEditing ? (
                          <div className="bg-white p-3 rounded border border-blue-200 shadow-sm grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                            <div className="sm:col-span-6">
                              <input
                                type="text"
                                value={editForm.episodes_name ?? ''}
                                onChange={(e) => setEditForm(prev => ({ ...prev, episodes_name: e.target.value }))}
                                className="w-full rounded border-gray-300 text-xs p-1.5"
                                placeholder="Nombre del episodio"
                              />
                            </div>
                            <div className="sm:col-span-4">
                              <input
                                type="text"
                                value={editForm.file_url ?? ''}
                                onChange={(e) => setEditForm(prev => ({ ...prev, file_url: e.target.value }))}
                                className="w-full rounded border-gray-300 text-xs p-1.5"
                                placeholder="URL"
                              />
                            </div>
                            <div className="sm:col-span-1">
                              <input
                                type="number"
                                value={editForm.order ?? 0}
                                onChange={(e) => setEditForm(prev => ({ ...prev, order: Number(e.target.value) }))}
                                className="w-full rounded border-gray-300 text-xs p-1.5"
                                min={0}
                              />
                            </div>
                            <div className="sm:col-span-1 flex justify-end gap-1">
                              <button onClick={handleSave} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200" type="button">
                                <Save className="h-4 w-4" />
                              </button>
                              <button onClick={handleCancelEdit} className="p-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" type="button">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <a
                                href={episode.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-gray-500 hover:text-blue-600 hover:underline truncate block"
                              >
                                {episode.file_url}
                              </a>
                            </div>
                            <div className="flex items-center gap-2 self-end sm:self-center">
                              <button
                                onClick={() => handleEdit(episode)}
                                className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-semibold transition-colors"
                                type="button"
                              >
                                <Edit2 className="h-3 w-3" /> Editar
                              </button>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(episode.file_url);
                                  showSnackbar('URL copiada', 'success');
                                }}
                                className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-semibold transition-colors"
                                type="button"
                              >
                                <LinkIcon className="h-3 w-3" /> Copiar
                              </button>
                              <button
                                onClick={() => handleDeleteOne(episode.episodes_id)}
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
