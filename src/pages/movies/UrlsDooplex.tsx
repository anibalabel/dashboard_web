import { useMemo, useState, FormEvent } from 'react';
import { AlertCircle, Link as LinkIcon, Loader2, Save, Search, Trash2, X, Edit2 } from 'lucide-react';
import { ConfirmModal } from '../../components/ConfirmModal';
import {
  deleteDooplexMovieVideo,
  getDooplexMovieVideos,
  getDooplexMovie,
  updateDooplexMovieVideo
} from '../../services/api';
import { DooplexMovieVideo, DooplexMovie } from '../../types';
import { QUALITY_OPTIONS, HEADER_OPTIONS, LANG_OPTIONS } from '../../lib/constants';

export default function UrlsDooplexPeliculas() {
  const [tmdbId, setTmdbId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const [movie, setMovie] = useState<DooplexMovie | null>(null);
  const [videos, setVideos] = useState<DooplexMovieVideo[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<number[]>([]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<DooplexMovieVideo>>({});

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

  const allVideoIds = useMemo(() => videos.map(v => v.id), [videos]);

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tmdbId) return;

    setIsSearching(true);
    setError('');
    setMovie(null);
    setVideos([]);
    setSelectedVideos([]);
    setEditingId(null);
    setEditForm({});

    try {
      const movieRes = await getDooplexMovie(tmdbId);
      if (!movieRes.data || movieRes.data.length === 0) {
        setError('No se encontró la película en Dooplex.');
        return;
      }

      const foundMovie = movieRes.data[0];
      setMovie(foundMovie);

      const videosRes = await getDooplexMovieVideos(foundMovie.id);
      setVideos(videosRes.data || []);
    } catch {
      setError('Error al buscar la película. Verifica el ID de TMDB.');
    } finally {
      setIsSearching(false);
    }
  };

  const toggleSelect = (videoId: number) => {
    setSelectedVideos(prev => (prev.includes(videoId) ? prev.filter(id => id !== videoId) : [...prev, videoId]));
  };

  const selectAll = () => setSelectedVideos(allVideoIds);
  const deselectAll = () => setSelectedVideos([]);

  const handleCopyUrls = async () => {
    const urls =
      selectedVideos.length > 0
        ? videos.filter(v => selectedVideos.includes(v.id)).map(v => v.link).join('\n')
        : videos.map(v => v.link).join('\n');
    await navigator.clipboard.writeText(urls);
    alert('URLs copiadas al portapapeles');
  };

  const handleEdit = (video: DooplexMovieVideo) => {
    setEditingId(video.id);
    setEditForm({ ...video });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async () => {
    if (!editingId) return;
    try {
      await updateDooplexMovieVideo({
        id: editingId,
        server: editForm.server,
        header: editForm.header,
        link: editForm.link,
        lang: editForm.lang
      });

      setVideos(prev =>
        prev.map(v => (v.id === editingId ? ({ ...v, ...editForm } as DooplexMovieVideo) : v))
      );
      setEditingId(null);
      setEditForm({});
    } catch {
      alert('Error al actualizar el video');
    }
  };

  const handleDeleteOne = (videoId: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Video',
      message: '¿Estás seguro de eliminar este video?',
      onConfirm: async () => {
        try {
          await deleteDooplexMovieVideo(videoId);
          setVideos(prev => prev.filter(v => v.id !== videoId));
          setSelectedVideos(prev => prev.filter(id => id !== videoId));
          if (editingId === videoId) {
            setEditingId(null);
            setEditForm({});
          }
        } catch {
          alert('Error al eliminar el video');
        }
      }
    });
  };

  const handleMassDelete = () => {
    if (selectedVideos.length === 0) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Videos',
      message: `¿Estás seguro de eliminar ${selectedVideos.length} videos?`,
      onConfirm: async () => {
        try {
          await Promise.all(selectedVideos.map(id => deleteDooplexMovieVideo(id)));
          setVideos(prev => prev.filter(v => !selectedVideos.includes(v.id)));
          setSelectedVideos([]);
          setEditingId(null);
          setEditForm({});
        } catch {
          alert('Error al eliminar algunos videos');
        }
      }
    });
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-3">
        <LinkIcon className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">URLs Dooplex (Películas)</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <form onSubmit={handleSearch} className="flex gap-4 items-end">
          <div className="flex-1">
            <label htmlFor="tmdbId" className="block text-sm font-medium text-gray-700 mb-1">
              TMDB ID de la Película
            </label>
            <input
              type="text"
              id="tmdbId"
              value={tmdbId}
              onChange={(e) => setTmdbId(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
              placeholder="Ej. 550"
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

      {movie && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{movie.title}</h2>
                <p className="text-sm text-gray-500 mt-1">Total de URLs: {videos.length}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCopyUrls}
                  disabled={videos.length === 0}
                  className="px-4 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 disabled:opacity-50 transition-colors"
                >
                  Copiar URLs
                </button>
                <button
                  onClick={handleMassDelete}
                  disabled={selectedVideos.length === 0}
                  className="px-4 py-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar ({selectedVideos.length})
                </button>
              </div>
            </div>

            <div className="flex gap-4 mb-4">
              <button onClick={selectAll} className="text-sm text-blue-600 hover:text-blue-800">Seleccionar Todo</button>
              <button onClick={deselectAll} className="text-sm text-blue-600 hover:text-blue-800">Deseleccionar Todo</button>
            </div>

            <div className="space-y-4">
              {videos.map((video) => {
                const isEditing = editingId === video.id;
                const isSelected = selectedVideos.includes(video.id);

                return (
                  <div
                    key={video.id}
                    className={`border rounded-lg p-4 transition-colors ${
                      isSelected ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Calidad (Server)</label>
                            <select
                              value={editForm.server || ''}
                              onChange={(e) => setEditForm({ ...editForm, server: e.target.value })}
                              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                            >
                              {QUALITY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Header</label>
                            <select
                              value={editForm.header || ''}
                              onChange={(e) => setEditForm({ ...editForm, header: e.target.value })}
                              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                            >
                              {HEADER_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Idioma (Lang)</label>
                            <select
                              value={editForm.lang || ''}
                              onChange={(e) => setEditForm({ ...editForm, lang: e.target.value })}
                              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                            >
                              {LANG_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">URL del Video</label>
                          <input
                            type="text"
                            value={editForm.link || ''}
                            onChange={(e) => setEditForm({ ...editForm, link: e.target.value })}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm font-mono"
                          />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            onClick={handleCancelEdit}
                            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                            title="Cancelar"
                          >
                            <X className="h-5 w-5" />
                          </button>
                          <button
                            onClick={handleSave}
                            className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-md transition-colors"
                            title="Guardar"
                          >
                            <Save className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-4">
                        <div className="pt-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(video.id)}
                            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {video.server}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              {video.header || 'Sin Header'}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {video.lang}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 font-mono break-all mt-2 bg-gray-50 p-2 rounded">
                            <a href={video.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              {video.link}
                            </a>
                          </p>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleEdit(video)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteOne(video.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {videos.length === 0 && !isSearching && (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <p className="text-gray-500">No hay URLs registradas para esta película</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirm}
        onConfirm={() => {
          confirmModal.onConfirm();
          closeConfirm();
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive={true}
      />
    </div>
  );
}