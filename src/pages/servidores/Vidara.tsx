import { useState, useEffect, useMemo } from 'react';
import { 
  Upload, CloudUpload, Copy, Check, AlertCircle, CheckCircle2, 
  RefreshCw, Folder, ExternalLink, HelpCircle, Loader2,
  Play, Square, Key, FileVideo, Edit2, FolderInput, Trash2,
  Search, Eye, Clock, ChevronRight, ArrowLeft
} from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { 
  DEFAULT_VIDARA_API_KEY, 
  parseVidaraBatchInput, 
  getVidaraUrl,
  ParsedVidaraItem 
} from '@/lib/vidaraUtils';
import { 
  listVidaraFolders, 
  listVidaraVideos, 
  renameVidaraVideo, 
  moveVidaraVideo, 
  deleteVidaraVideo, 
  uploadUrlVidara,
  VidaraFolder,
  VidaraVideo
} from '@/services/vidara';

interface UploadItemStatus {
  item: ParsedVidaraItem;
  status: 'idle' | 'uploading' | 'success' | 'error';
  filecode?: string;
  serverTitle?: string;
  error?: string;
  serverTime?: string;
  size?: number;
}

const STORAGE_FLD_ID = 'vidara_fld_id';

const EXAMPLE_INPUT = `https://lulustream.com/e/jta3a5ep8e4k\t=\tstar-trek-strange-new-worlds-4x1
FALTA 4 - 2 - Episodio 2 (Sin enlace en Luluvdo / Castellano)\t=\tstar-trek-strange-new-worlds-4x2
https://lulustream.com/e/woz55ms7vx5z\t=\tstar-trek-strange-new-worlds-4x3
https://lulustream.com/e/rlt31gqzb7n8\t=\tstar-trek-strange-new-worlds-4x4`;

export default function Vidara() {
  const [activeTab, setActiveTab] = useState<'explorer' | 'upload'>('explorer');

  // --- Explorer State ---
  const [folders, setFolders] = useState<VidaraFolder[]>([]);
  const [videos, setVideos] = useState<VidaraVideo[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<VidaraFolder | null>(null);
  const [isLoadingExplorer, setIsLoadingExplorer] = useState(false);
  const [explorerSearch, setExplorerSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalVideos, setTotalVideos] = useState(0);

  // --- Upload State ---
  const [fldId, setFldId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_FLD_ID) || '';
  });
  const [rawInput, setRawInput] = useState('');
  const [itemsList, setItemsList] = useState<UploadItemStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'valid' | 'skipped' | 'success' | 'error'>('all');

  // --- Notifications & Feedback ---
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // --- Modal Config ---
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    type: 'rename' | 'move' | 'delete';
    video?: VidaraVideo;
    inputValue?: string;
    targetFolderId?: string | number;
  }>({ isOpen: false, title: '', type: 'rename' });

  const showNotification = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const handleCopy = async (text: string, key: string, label = 'Copiado al portapapeles') => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      showNotification(label, 'success');
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
    } else {
      showNotification('Error al copiar', 'error');
    }
  };

  // Guardar fld_id en localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_FLD_ID, fldId);
  }, [fldId]);

  // --- Fetch Folders ---
  const fetchFolders = async () => {
    try {
      const res = await listVidaraFolders();
      if (res.status === 200 && res.result) {
        if (Array.isArray(res.result)) {
          setFolders(res.result);
        } else if (res.result.folders && Array.isArray(res.result.folders)) {
          setFolders(res.result.folders);
        } else {
          setFolders([]);
        }
      } else {
        setFolders([]);
      }
    } catch (err) {
      console.error('Error fetching folders:', err);
    }
  };

  // --- Fetch Videos ---
  const fetchVideos = async (folderId?: string | number, search?: string, page = 1) => {
    setIsLoadingExplorer(true);
    try {
      const res = await listVidaraVideos({
        fldId: folderId,
        title: search,
        page,
        limit: 100,
      });

      if (res.status === 200 && res.result) {
        if (Array.isArray(res.result)) {
          setVideos(res.result);
          setTotalVideos(res.result.length);
          setTotalPages(1);
        } else if (res.result.videos && Array.isArray(res.result.videos)) {
          setVideos(res.result.videos);
          setTotalVideos(res.result.total || res.result.videos.length);
          setTotalPages(res.result.total_pages || 1);
          setCurrentPage(res.result.page || 1);
        } else {
          setVideos([]);
          setTotalVideos(0);
        }
      } else {
        setVideos([]);
        setTotalVideos(0);
      }
    } catch (err) {
      console.error('Error fetching videos:', err);
      showNotification('Error al cargar videos de Vidara', 'error');
    } finally {
      setIsLoadingExplorer(false);
    }
  };

  // Cargar carpetas y videos al montar o cambiar pestaña
  useEffect(() => {
    fetchFolders();
  }, []);

  useEffect(() => {
    if (activeTab === 'explorer') {
      fetchVideos(selectedFolder ? selectedFolder.fld_id : undefined, explorerSearch, currentPage);
    }
  }, [activeTab, selectedFolder, currentPage]);

  const handleSelectFolder = (folder: VidaraFolder | null) => {
    setSelectedFolder(folder);
    setCurrentPage(1);
    fetchVideos(folder ? folder.fld_id : undefined, explorerSearch, 1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchVideos(selectedFolder ? selectedFolder.fld_id : undefined, explorerSearch, 1);
  };

  // --- Modal Operations (Rename, Move, Delete) ---
  const handleOpenRename = (video: VidaraVideo) => {
    setModalConfig({
      isOpen: true,
      title: 'Renombrar Video',
      type: 'rename',
      video,
      inputValue: video.title || '',
    });
  };

  const handleOpenMove = (video: VidaraVideo) => {
    setModalConfig({
      isOpen: true,
      title: 'Mover Video a Carpeta',
      type: 'move',
      video,
      targetFolderId: selectedFolder ? selectedFolder.fld_id : 0,
    });
  };

  const handleOpenDelete = (video: VidaraVideo) => {
    setModalConfig({
      isOpen: true,
      title: 'Eliminar Video',
      type: 'delete',
      video,
    });
  };

  const handleConfirmModal = async () => {
    const { type, video, inputValue, targetFolderId } = modalConfig;
    if (!video) return;

    try {
      if (type === 'rename') {
        if (!inputValue || !inputValue.trim()) {
          showNotification('El título no puede estar vacío', 'error');
          return;
        }
        const res = await renameVidaraVideo(video.filecode, inputValue.trim());
        if (res.status === 200) {
          showNotification('Video renombrado con éxito');
          fetchVideos(selectedFolder ? selectedFolder.fld_id : undefined, explorerSearch, currentPage);
        } else {
          showNotification(res.error || 'Error al renombrar video', 'error');
        }
      } else if (type === 'move') {
        const destId = targetFolderId !== undefined ? targetFolderId : 0;
        const res = await moveVidaraVideo(video.filecode, destId);
        if (res.status === 200) {
          showNotification('Video movido con éxito');
          fetchVideos(selectedFolder ? selectedFolder.fld_id : undefined, explorerSearch, currentPage);
          fetchFolders();
        } else {
          showNotification(res.error || 'Error al mover video', 'error');
        }
      } else if (type === 'delete') {
        const res = await deleteVidaraVideo(video.filecode);
        if (res.status === 200) {
          showNotification('Video eliminado con éxito');
          fetchVideos(selectedFolder ? selectedFolder.fld_id : undefined, explorerSearch, currentPage);
          fetchFolders();
        } else {
          showNotification(res.error || 'Error al eliminar video', 'error');
        }
      }
    } catch (err) {
      console.error(err);
      showNotification('Error al ejecutar la acción', 'error');
    } finally {
      setModalConfig({ isOpen: false, title: '', type: 'rename' });
    }
  };

  // --- Upload Tab Logic ---
  const parsedData = useMemo(() => {
    return parseVidaraBatchInput(rawInput);
  }, [rawInput]);

  const handleLoadParsed = () => {
    if (parsedData.items.length === 0) {
      showNotification('No hay líneas para cargar', 'info');
      return;
    }

    const newStatuses: UploadItemStatus[] = parsedData.items.map((item) => ({
      item,
      status: item.isValid ? 'idle' : 'error',
      error: item.isValid ? undefined : item.skipReason || 'Línea omitida',
    }));

    setItemsList(newStatuses);
    showNotification(
      `${parsedData.validCount} URLs válidas detectadas (${parsedData.skippedCount} omitidas)`,
      'success'
    );
  };

  const uploadSingleItem = async (
    targetItem: UploadItemStatus,
    currentFldId: string
  ): Promise<UploadItemStatus> => {
    try {
      const response = await uploadUrlVidara({
        url: targetItem.item.url,
        title: targetItem.item.title,
        fldId: currentFldId,
      });

      const responseData = response.data || response.result;
      const filecode = responseData?.filecode;

      if ((response.status === 200 || response.msg === 'OK') && filecode) {
        return {
          ...targetItem,
          status: 'success',
          filecode,
          serverTitle: responseData?.title || targetItem.item.title,
          serverTime: response.server_time,
          size: responseData?.size,
          error: undefined,
        };
      } else {
        return {
          ...targetItem,
          status: 'error',
          error: response.error || response.msg || 'Error en la respuesta del servidor Vidara',
        };
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string; response?: { data?: { msg?: string; error?: string } } };
      const errMsg =
        errorObj.response?.data?.msg ||
        errorObj.response?.data?.error ||
        errorObj.message ||
        'Error de conexión con la API de Vidara';
      return {
        ...targetItem,
        status: 'error',
        error: errMsg,
      };
    }
  };

  const handleStartUpload = async () => {
    let currentList = itemsList;
    if (currentList.length === 0 && parsedData.items.length > 0) {
      currentList = parsedData.items.map((item) => ({
        item,
        status: item.isValid ? 'idle' : 'error',
        error: item.isValid ? undefined : item.skipReason || 'Línea omitida',
      }));
      setItemsList(currentList);
    }

    const pendingItems = currentList.filter(
      (i) => i.item.isValid && (i.status === 'idle' || i.status === 'error')
    );

    if (pendingItems.length === 0) {
      showNotification('No hay elementos válidos pendientes por subir', 'info');
      return;
    }

    setIsProcessing(true);
    setCancelRequested(false);

    let successCounter = 0;
    let errorCounter = 0;

    const listCopy = [...currentList];

    for (let i = 0; i < listCopy.length; i++) {
      if (cancelRequested) {
        showNotification('Subida cancelada por el usuario', 'info');
        break;
      }

      const current = listCopy[i];
      if (!current.item.isValid || current.status === 'success') {
        continue;
      }

      listCopy[i] = { ...current, status: 'uploading' };
      setItemsList([...listCopy]);

      const updated = await uploadSingleItem(current, fldId);
      listCopy[i] = updated;
      setItemsList([...listCopy]);

      if (updated.status === 'success') {
        successCounter++;
      } else {
        errorCounter++;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    setIsProcessing(false);
    showNotification(
      `Proceso terminado: ${successCounter} subida(s) exitosa(s), ${errorCounter} fallida(s)`,
      successCounter > 0 ? 'success' : 'error'
    );
    if (successCounter > 0) {
      fetchFolders();
    }
  };

  const handleRetrySingle = async (index: number) => {
    const target = itemsList[index];
    if (!target || !target.item.isValid) return;

    const updatedList = [...itemsList];
    updatedList[index] = { ...target, status: 'uploading', error: undefined };
    setItemsList(updatedList);

    const result = await uploadSingleItem(target, fldId);
    updatedList[index] = result;
    setItemsList([...updatedList]);

    if (result.status === 'success') {
      showNotification('Archivo subido con éxito', 'success');
      fetchFolders();
    } else {
      showNotification(`Error: ${result.error}`, 'error');
    }
  };

  const handleCancelProcess = () => {
    setCancelRequested(true);
  };

  const handleClearAll = () => {
    setRawInput('');
    setItemsList([]);
    showNotification('Formulario y tabla limpiados', 'info');
  };

  const handleCopyFormattedUrls = () => {
    const successItems = itemsList.filter((i) => i.status === 'success' && i.filecode);
    if (successItems.length === 0) {
      showNotification('No hay enlaces subidos con éxito', 'info');
      return;
    }

    const formatted = successItems
      .map((i) => {
        const watchUrl = getVidaraUrl(i.filecode!, 'watch');
        return i.item.title ? `${watchUrl}\t=\t${i.item.title}` : watchUrl;
      })
      .join('\n');

    handleCopy(formatted, 'bulk-formatted', `${successItems.length} enlaces formateados (URL = Título) copiados`);
  };

  const handleCopyOnlyUrls = (type: 'watch' | 'embed' = 'watch') => {
    const successItems = itemsList.filter((i) => i.status === 'success' && i.filecode);
    if (successItems.length === 0) {
      showNotification('No hay enlaces para copiar', 'info');
      return;
    }

    const urls = successItems.map((i) => getVidaraUrl(i.filecode!, type)).join('\n');
    handleCopy(urls, `bulk-${type}`, `${successItems.length} URLs de ${type === 'watch' ? 'Vidara (/v/)' : 'Embed (/e/)'} copiadas`);
  };

  const handleCopyFilecodes = () => {
    const successItems = itemsList.filter((i) => i.status === 'success' && i.filecode);
    if (successItems.length === 0) {
      showNotification('No hay códigos para copiar', 'info');
      return;
    }

    const codes = successItems.map((i) => i.filecode!).join('\n');
    handleCopy(codes, 'bulk-codes', `${successItems.length} filecodes copiados`);
  };

  const stats = useMemo(() => {
    const total = itemsList.length;
    const valid = itemsList.filter((i) => i.item.isValid).length;
    const skipped = itemsList.filter((i) => !i.item.isValid).length;
    const success = itemsList.filter((i) => i.status === 'success').length;
    const error = itemsList.filter((i) => i.status === 'error' && i.item.isValid).length;
    const idle = itemsList.filter((i) => i.status === 'idle').length;
    return { total, valid, skipped, success, error, idle };
  }, [itemsList]);

  const filteredList = useMemo(() => {
    if (activeFilter === 'valid') return itemsList.filter((i) => i.item.isValid);
    if (activeFilter === 'skipped') return itemsList.filter((i) => !i.item.isValid);
    if (activeFilter === 'success') return itemsList.filter((i) => i.status === 'success');
    if (activeFilter === 'error') return itemsList.filter((i) => i.status === 'error');
    return itemsList;
  }, [itemsList, activeFilter]);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 relative">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl flex items-center gap-2.5 animate-bounce-short text-white text-sm font-medium border ${
            notification.type === 'success'
              ? 'bg-emerald-600 border-emerald-500'
              : notification.type === 'error'
              ? 'bg-rose-600 border-rose-500'
              : 'bg-slate-800 border-slate-700'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : notification.type === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <HelpCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{notification.msg}</span>
        </div>
      )}

      {/* Header & Tabs */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-emerald-600 to-teal-500 p-2.5 rounded-xl shadow-md text-white">
            <CloudUpload className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gestor Vidara</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                API Oficial
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Explorador de carpetas, gestor de videos y subida remota por URL
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('explorer')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'explorer'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Folder className="h-4 w-4" />
            Explorador de Archivos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'upload'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Upload className="h-4 w-4" />
            Subida Remota (URL)
          </button>
        </div>
      </div>

      {/* =========================================================
          TAB 1: EXPLORADOR DE ARCHIVOS Y CARPETAS
         ========================================================= */}
      {activeTab === 'explorer' && (
        <div className="space-y-6">
          {/* Top Bar: Breadcrumb + Search + Refresh */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Breadcrumb navigation */}
            <div className="flex items-center gap-2 text-sm overflow-x-auto">
              <button
                type="button"
                onClick={() => handleSelectFolder(null)}
                className={`font-semibold transition-colors flex items-center gap-1.5 ${
                  selectedFolder === null ? 'text-emerald-700' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Folder className="h-4 w-4" />
                Raíz (Todas las carpetas)
              </button>
              {selectedFolder && (
                <>
                  <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="font-bold text-gray-900 flex items-center gap-1.5">
                    <Folder className="h-4 w-4 text-emerald-600" />
                    {selectedFolder.name}
                    <span className="text-xs font-mono font-normal bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                      ID: {selectedFolder.fld_id}
                    </span>
                  </span>
                </>
              )}
            </div>

            {/* Actions: Search + Quick Upload to Folder + Refresh */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64">
                <input
                  type="text"
                  value={explorerSearch}
                  onChange={(e) => setExplorerSearch(e.target.value)}
                  placeholder="Buscar video por título..."
                  className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-2.5" />
              </form>

              {selectedFolder && (
                <button
                  type="button"
                  onClick={() => {
                    setFldId(String(selectedFolder.fld_id));
                    setActiveTab('upload');
                    showNotification(`Carpeta "${selectedFolder.name}" seleccionada para subir`, 'info');
                  }}
                  className="px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors"
                  title="Ir a subida con esta carpeta seleccionada"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Subir aquí
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  fetchFolders();
                  fetchVideos(selectedFolder ? selectedFolder.fld_id : undefined, explorerSearch, currentPage);
                  showNotification('Explorador actualizado', 'info');
                }}
                disabled={isLoadingExplorer}
                className="p-2 text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 border border-gray-300 rounded-lg transition-colors"
                title="Refrescar lista"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingExplorer ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Folders Overview Grid (when at Root) */}
          {selectedFolder === null && folders.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <Folder className="h-4 w-4 text-emerald-600" />
                  Carpetas de Vidara ({folders.length})
                </h2>
                <span className="text-xs text-gray-400">Haz clic en una carpeta para ver sus videos</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {folders.map((fld) => (
                  <div
                    key={fld.fld_id}
                    onClick={() => handleSelectFolder(fld)}
                    className="group p-3.5 bg-gradient-to-r from-emerald-50/40 to-slate-50 border border-emerald-100/80 hover:border-emerald-300 rounded-xl cursor-pointer transition-all hover:shadow-sm flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg group-hover:scale-105 transition-transform">
                        <Folder className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-gray-900 truncate" title={fld.name}>
                          {fld.name}
                        </div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-2">
                          <span className="font-mono">ID: {fld.fld_id}</span>
                          <span>•</span>
                          <span>{fld.videos ?? 0} videos</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-emerald-600 transition-colors shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Videos Grid / List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
              <div className="flex items-center gap-2">
                <FileVideo className="h-4 w-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-gray-800">
                  {selectedFolder ? `Videos en "${selectedFolder.name}"` : 'Todos los Videos'} ({totalVideos})
                </h2>
              </div>
              {selectedFolder && (
                <button
                  type="button"
                  onClick={() => handleSelectFolder(null)}
                  className="text-xs text-emerald-700 hover:underline flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Volver a carpetas
                </button>
              )}
            </div>

            {isLoadingExplorer ? (
              <div className="py-16 flex flex-col items-center justify-center text-gray-400 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                <span className="text-xs font-medium">Cargando videos de Vidara...</span>
              </div>
            ) : videos.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
                <FileVideo className="h-10 w-10 text-gray-300" />
                <span className="text-sm font-medium">No se encontraron videos en esta vista</span>
                <p className="text-xs text-gray-400">Puedes subir videos desde la pestaña "Subida Remota".</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {videos.map((vid) => {
                  const watchUrl = getVidaraUrl(vid.filecode, 'watch');
                  const thumb = vid.thumbnail || vid.player_img;
                  const lengthSec = Number(vid.length || vid.video_length || 0);
                  const durationStr = lengthSec > 0
                    ? `${Math.floor(lengthSec / 60)}:${(lengthSec % 60).toString().padStart(2, '0')}`
                    : '';

                  return (
                    <div
                      key={vid.filecode}
                      className="group bg-white rounded-xl border border-gray-200 hover:border-emerald-300 transition-all shadow-xs hover:shadow-md overflow-hidden flex flex-col relative"
                    >
                      {/* Thumbnail Container */}
                      <div className="aspect-video bg-slate-900 relative overflow-hidden flex items-center justify-center">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={vid.title || vid.filecode}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <FileVideo className="h-10 w-10 text-slate-600" />
                        )}

                        {/* Duration badge */}
                        {durationStr && (
                          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono font-medium backdrop-blur-xs flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {durationStr}
                          </span>
                        )}

                        {/* Status badge */}
                        {vid.status && vid.status !== 'active' && (
                          <span className="absolute top-2 left-2 bg-rose-600/90 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                            {vid.status}
                          </span>
                        )}

                        {/* Overlay Actions on Hover */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-xs">
                          <button
                            type="button"
                            onClick={() => handleCopy(watchUrl, `v-copy-${vid.filecode}`, 'Enlace de video copiado')}
                            className="p-2 bg-white/90 text-gray-800 hover:text-emerald-700 hover:bg-white rounded-lg shadow-sm transition-all"
                            title="Copiar Enlace https://vidara.so/v/..."
                          >
                            {copiedKey === `v-copy-${vid.filecode}` ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenRename(vid)}
                            className="p-2 bg-white/90 text-gray-800 hover:text-emerald-700 hover:bg-white rounded-lg shadow-sm transition-all"
                            title="Renombrar video"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenMove(vid)}
                            className="p-2 bg-white/90 text-gray-800 hover:text-emerald-700 hover:bg-white rounded-lg shadow-sm transition-all"
                            title="Mover a otra carpeta"
                          >
                            <FolderInput className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDelete(vid)}
                            className="p-2 bg-white/90 text-gray-800 hover:text-rose-600 hover:bg-white rounded-lg shadow-sm transition-all"
                            title="Eliminar video"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Video Info */}
                      <div className="p-3 flex-1 flex flex-col justify-between">
                        <div>
                          <div
                            className="font-bold text-xs text-gray-900 truncate mb-1"
                            title={vid.title || vid.filecode}
                          >
                            {vid.title || vid.filecode}
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono">
                            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 font-semibold">
                              {vid.filecode}
                            </span>
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {vid.views ?? vid.video_views ?? 0}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                          <a
                            href={watchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 hover:underline font-mono truncate max-w-[170px] inline-flex items-center gap-1"
                          >
                            {watchUrl}
                            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                          </a>

                          <button
                            type="button"
                            onClick={() => handleCopy(watchUrl, `v-btn-${vid.filecode}`, 'Enlace copiado')}
                            className="text-gray-400 hover:text-emerald-700 p-1"
                            title="Copiar URL"
                          >
                            {copiedKey === `v-btn-${vid.filecode}` ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                <span>
                  Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong> ({totalVideos} videos)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 font-medium"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 font-medium"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 2: SUBIDA REMOTA (URL)
         ========================================================= */}
      {activeTab === 'upload' && (
        <>
          {/* Main Upload Box */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-6 mb-6">
            {/* Folder Selection Bar */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center mb-4 pb-4 border-b border-gray-100">
              {/* Folder Selector Dropdown + Manual Input */}
              <div className="md:col-span-7 lg:col-span-6">
                <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                  <Folder className="h-3.5 w-3.5 text-emerald-600" />
                  Carpeta de Destino (fld_id):
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={fldId}
                    onChange={(e) => setFldId(e.target.value)}
                    className="text-xs px-3 py-2 bg-slate-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium flex-1"
                  >
                    <option value="">Raíz / Sin carpeta (fld_id: 0)</option>
                    {folders.map((fld) => (
                      <option key={fld.fld_id} value={String(fld.fld_id)}>
                        📁 {fld.name} (fld_id: {fld.fld_id})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={fldId}
                    onChange={(e) => setFldId(e.target.value)}
                    placeholder="ID Manual"
                    className="w-24 text-xs px-2.5 py-2 bg-slate-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-mono text-center"
                    title="ID de carpeta manual"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Se enviará <code>&fld_id={fldId || '0'}</code> en la subida a Vidara.
                </p>
              </div>

              {/* Action buttons */}
              <div className="md:col-span-5 lg:col-span-6 flex items-center justify-end gap-2 pt-2 md:pt-0">
                <button
                  type="button"
                  onClick={() => {
                    setRawInput(EXAMPLE_INPUT);
                    showNotification('Ejemplo cargado en el área de texto', 'info');
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors"
                >
                  Cargar Ejemplo
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors border border-gray-200"
                >
                  Limpiar
                </button>
              </div>
            </div>

            {/* Textarea */}
            <div className="relative mb-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                URLs y Títulos (Formato: <code>URL = Titulo</code> o solo <code>URL</code>):
              </label>
              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder={`https://lulustream.com/e/jta3a5ep8e4k\t=\tstar-trek-strange-new-worlds-4x1\nFALTA 4 - 2 - Episodio 2 (Sin enlace)...\t=\tstar-trek-strange-new-worlds-4x2\nhttps://lulustream.com/e/woz55ms7vx5z\t=\tstar-trek-strange-new-worlds-4x3`}
                rows={7}
                className="w-full rounded-lg border-gray-300 shadow-inner focus:border-emerald-500 focus:ring-emerald-500 border p-3 font-mono text-xs text-gray-800 leading-relaxed bg-slate-50/50"
              />
            </div>

            {/* Real-time Parser Stats & Action Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/80 p-3 rounded-lg border border-gray-200">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-gray-500 font-medium">Análisis de texto:</span>
                <span className="bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-700 font-mono">
                  Total: <strong>{parsedData.items.length}</strong>
                </span>
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 font-medium flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Válidas: <strong>{parsedData.validCount}</strong>
                </span>
                {parsedData.skippedCount > 0 && (
                  <span
                    className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200 font-medium flex items-center gap-1"
                    title="Líneas que no tienen URL válida (ej. notas como FALTA episodio)"
                  >
                    <AlertCircle className="h-3 w-3" />
                    Omitidas: <strong>{parsedData.skippedCount}</strong>
                  </span>
                )}
                {fldId && (
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 text-[11px] flex items-center gap-1">
                    <Folder className="h-3 w-3" />
                    fld_id: {fldId}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadParsed}
                  disabled={parsedData.items.length === 0 || isProcessing}
                  className="px-3.5 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
                >
                  Cargar en Tabla
                </button>

                {isProcessing ? (
                  <button
                    type="button"
                    onClick={handleCancelProcess}
                    className="px-4 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 flex items-center gap-1.5 shadow-sm animate-pulse"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    Detener
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartUpload}
                    disabled={parsedData.validCount === 0 && itemsList.filter((i) => i.item.isValid).length === 0}
                    className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Iniciar Subida {parsedData.validCount > 0 ? `(${parsedData.validCount})` : ''}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Progress & Upload Results Table */}
          {itemsList.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-6 mb-8">
              {/* Header toolbar */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4 pb-3 border-b border-gray-100">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-gray-900">Cola de Subidas</h2>
                  
                  {/* Filter Tabs */}
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-lg text-xs font-medium ml-2">
                    <button
                      type="button"
                      onClick={() => setActiveFilter('all')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        activeFilter === 'all' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Todos ({stats.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFilter('valid')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        activeFilter === 'valid' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Válidos ({stats.valid})
                    </button>
                    {stats.skipped > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveFilter('skipped')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          activeFilter === 'skipped' ? 'bg-white text-amber-700 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        Omitidos ({stats.skipped})
                      </button>
                    )}
                    {stats.success > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveFilter('success')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          activeFilter === 'success' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        Completados ({stats.success})
                      </button>
                    )}
                    {stats.error > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveFilter('error')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          activeFilter === 'error' ? 'bg-white text-rose-700 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        Errores ({stats.error})
                      </button>
                    )}
                  </div>
                </div>

                {/* Bulk Action Buttons */}
                {stats.success > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyFormattedUrls}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                        copiedKey === 'bulk-formatted'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      }`}
                      title="Copiar lista en formato 'https://vidara.so/v/filecode = Titulo'"
                    >
                      {copiedKey === 'bulk-formatted' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      Copiar Formato (URL = Titulo)
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyOnlyUrls('watch')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                        copiedKey === 'bulk-watch'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                      title="Copiar todas las URLs https://vidara.so/v/..."
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar URLs (/v/)
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyFilecodes}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                        copiedKey === 'bulk-codes'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                      title="Copiar solo los filecodes"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Filecodes
                    </button>
                  </div>
                )}
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-xs text-left">
                  <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">#</th>
                      <th className="py-2.5 px-3 w-28 text-center">Estado</th>
                      <th className="py-2.5 px-3">Título Asignado</th>
                      <th className="py-2.5 px-3">URL Origen</th>
                      <th className="py-2.5 px-3">Resultado Vidara</th>
                      <th className="py-2.5 px-3 w-20 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {filteredList.map((entry, idx) => {
                      const originalIndex = itemsList.findIndex((i) => i.item.id === entry.item.id);
                      const isSuccess = entry.status === 'success' && entry.filecode;
                      const watchUrl = isSuccess ? getVidaraUrl(entry.filecode!, 'watch') : '';

                      return (
                        <tr
                          key={entry.item.id}
                          className={`hover:bg-gray-50/80 transition-colors ${
                            !entry.item.isValid
                              ? 'bg-amber-50/40 text-gray-400'
                              : entry.status === 'success'
                              ? 'bg-emerald-50/20'
                              : entry.status === 'error'
                              ? 'bg-rose-50/20'
                              : ''
                          }`}
                        >
                          {/* Index */}
                          <td className="py-2.5 px-3 text-center font-mono text-gray-400">
                            {originalIndex + 1}
                          </td>

                          {/* Status */}
                          <td className="py-2.5 px-3 text-center">
                            {!entry.item.isValid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                Omitido
                              </span>
                            ) : entry.status === 'uploading' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800 border border-blue-200 animate-pulse">
                                <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                                Subiendo
                              </span>
                            ) : entry.status === 'success' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3 shrink-0" />
                                Listo
                              </span>
                            ) : entry.status === 'error' ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-800 border border-rose-200"
                                title={entry.error}
                              >
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                Error
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                En espera
                              </span>
                            )}
                          </td>

                          {/* Title */}
                          <td className="py-2.5 px-3 font-medium text-gray-800 max-w-[220px] truncate" title={entry.item.title || entry.serverTitle}>
                            {entry.item.title || entry.serverTitle || (
                              <span className="text-gray-400 italic font-normal">Sin título</span>
                            )}
                          </td>

                          {/* URL Origin */}
                          <td className="py-2.5 px-3 font-mono text-gray-600 max-w-[280px] truncate" title={entry.item.url}>
                            {entry.item.isValid ? (
                              <a
                                href={entry.item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline inline-flex items-center gap-1"
                              >
                                {entry.item.url}
                                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                              </a>
                            ) : (
                              <span className="text-amber-700 italic" title={entry.item.rawLine}>
                                {entry.item.rawLine}
                              </span>
                            )}
                          </td>

                          {/* Vidara Result */}
                          <td className="py-2.5 px-3">
                            {isSuccess ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                  <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200 font-semibold">
                                    {entry.filecode}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(entry.filecode!, `fc-${entry.filecode}`, 'Filecode copiado')}
                                    className="text-gray-400 hover:text-emerald-700 p-0.5"
                                    title="Copiar filecode"
                                  >
                                    {copiedKey === `fc-${entry.filecode}` ? (
                                      <Check className="h-3 w-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                                <div className="flex items-center gap-1 text-[11px] text-gray-600 font-mono">
                                  <a
                                    href={watchUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-700 hover:underline truncate max-w-[220px]"
                                  >
                                    {watchUrl}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(watchUrl, `url-${entry.filecode}`, 'URL copiada (https://vidara.so/v/...)')}
                                    className="text-gray-400 hover:text-emerald-700 p-0.5"
                                    title="Copiar URL https://vidara.so/v/..."
                                  >
                                    {copiedKey === `url-${entry.filecode}` ? (
                                      <Check className="h-3 w-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            ) : entry.status === 'error' ? (
                              <span className="text-rose-600 text-[11px] block max-w-[260px] truncate" title={entry.error}>
                                {entry.error}
                              </span>
                            ) : !entry.item.isValid ? (
                              <span className="text-amber-700 text-[11px]">
                                {entry.item.skipReason || 'Línea omitida'}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-[11px]">Pendiente de subir</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-2.5 px-3 text-center">
                            {entry.item.isValid && (
                              <div className="flex items-center justify-center gap-1">
                                {entry.status === 'error' && (
                                  <button
                                    type="button"
                                    onClick={() => handleRetrySingle(originalIndex)}
                                    className="p-1 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                                    title="Reintentar subida"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {isSuccess && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const text = entry.item.title
                                        ? `${watchUrl}\t=\t${entry.item.title}`
                                        : watchUrl;
                                      handleCopy(text, `row-${entry.filecode}`, 'Fila copiada (https://vidara.so/v/...)');
                                    }}
                                    className="p-1 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                                    title="Copiar fila formateada"
                                  >
                                    {copiedKey === `row-${entry.filecode}` ? (
                                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* =========================================================
          CUSTOM MODAL (Rename / Move / Delete)
         ========================================================= */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-slide-up">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                {modalConfig.type === 'rename' && <Edit2 className="h-4 w-4 text-emerald-400" />}
                {modalConfig.type === 'move' && <FolderInput className="h-4 w-4 text-emerald-400" />}
                {modalConfig.type === 'delete' && <Trash2 className="h-4 w-4 text-rose-400" />}
                {modalConfig.title}
              </h3>
            </div>

            <div className="p-5">
              {/* Rename Form */}
              {modalConfig.type === 'rename' && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-gray-700">
                    Nuevo título del video:
                  </label>
                  <input
                    type="text"
                    value={modalConfig.inputValue || ''}
                    onChange={(e) => setModalConfig({ ...modalConfig, inputValue: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleConfirmModal()}
                  />
                  <span className="text-[11px] text-gray-400 font-mono block">
                    Filecode: {modalConfig.video?.filecode}
                  </span>
                </div>
              )}

              {/* Move Form */}
              {modalConfig.type === 'move' && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-gray-700">
                    Selecciona la carpeta de destino:
                  </label>
                  <select
                    value={modalConfig.targetFolderId !== undefined ? String(modalConfig.targetFolderId) : '0'}
                    onChange={(e) => setModalConfig({ ...modalConfig, targetFolderId: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium"
                  >
                    <option value="0">Raíz / Sin carpeta (fld_id: 0)</option>
                    {folders.map((fld) => (
                      <option key={fld.fld_id} value={String(fld.fld_id)}>
                        📁 {fld.name} (fld_id: {fld.fld_id})
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-gray-400 block font-mono">
                    Video: {modalConfig.video?.title || modalConfig.video?.filecode}
                  </span>
                </div>
              )}

              {/* Delete Confirmation */}
              {modalConfig.type === 'delete' && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-700">
                    ¿Estás seguro de que deseas eliminar este video de Vidara?
                  </p>
                  <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 text-xs text-rose-800">
                    <strong>{modalConfig.video?.title || modalConfig.video?.filecode}</strong>
                    <div className="font-mono text-[11px] text-rose-600 mt-1">
                      Código: {modalConfig.video?.filecode}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-gray-50 flex items-center justify-end gap-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setModalConfig({ isOpen: false, title: '', type: 'rename' })}
                className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmModal}
                className={`px-4 py-2 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors ${
                  modalConfig.type === 'delete'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {modalConfig.type === 'delete' ? 'Eliminar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
