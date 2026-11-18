import { useState, useEffect } from 'react';
import { 
  Folder, FileVideo, Upload, Trash2, FolderPlus, RefreshCw, 
  ArrowLeft, Edit2, Loader2, CheckCircle, AlertCircle, Copy, Check 
} from 'lucide-react';
import { copyToClipboard } from '../../lib/clipboard';
import {
  listFoldersAndFiles,
  createFolder,
  renameFolder,
  renameFile,
  addRemoteUpload,
  getRemoteUploadList,
  clearRemoteUploadErrors,
  deleteRemoteUpload,
  DoodFolder,
  DoodFile,
  DoodUploadSlot
} from '../../services/doodstream';

interface Breadcrumb {
  id: string;
  name: string;
}

export default function DoodStream() {
  const [activeTab, setActiveTab] = useState<'explorer' | 'upload'>('explorer');
  
  // Explorer State
  const [currentFolderId, setCurrentFolderId] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: '', name: 'Root' }]);
  const [folders, setFolders] = useState<DoodFolder[]>([]);
  const [files, setFiles] = useState<DoodFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Upload State
  const [uploadUrls, setUploadUrls] = useState('');
  const [uploadList, setUploadList] = useState<DoodUploadSlot[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isRefreshingUploads, setIsRefreshingUploads] = useState(false);

  // Notification State
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Custom Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    type: 'prompt' | 'confirm';
    message?: string;
    inputValue?: string;
    onConfirm?: (val?: string) => void;
  }>({ isOpen: false, title: '', type: 'confirm' });

  const showModal = (config: Omit<typeof modalConfig, 'isOpen'>) => {
    setModalConfig({ ...config, isOpen: true });
  };

  const closeModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleCopyUrl = async (fileCode: string) => {
    const doodUrl = `https://playmogo.com/e/${fileCode}`;
    const ok = await copyToClipboard(doodUrl);
    if (ok) {
      setCopiedKey(`file-${fileCode}`);
      showNotification('Enlace copiado (https://playmogo.com/e/...)');
      setTimeout(() => {
        setCopiedKey(prev => (prev === `file-${fileCode}` ? null : prev));
      }, 2000);
    } else {
      showNotification('Error al copiar el enlace', 'error');
    }
  };

  // --- Explorer Logic ---

  const fetchContent = async (folderId = '') => {
    setIsLoading(true);
    try {
      const res = await listFoldersAndFiles(folderId);
      if (res.status === 200 && res.result) {
        setFolders(res.result.folders || []);
        setFiles(res.result.files || []);
      }
    } catch (error) {
      console.error(error);
      showNotification('Error al cargar contenido', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'explorer') {
      fetchContent(currentFolderId);
    }
  }, [currentFolderId, activeTab]);

  const handleNavigate = (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setBreadcrumbs([...breadcrumbs, { id: folderId, name: folderName }]);
  };

  const handleNavigateUp = (index: number) => {
    const target = breadcrumbs[index];
    setCurrentFolderId(target.id);
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName, currentFolderId);
      showNotification('Carpeta creada');
      setNewFolderName('');
      setIsCreatingFolder(false);
      fetchContent(currentFolderId);
    } catch {
      showNotification('Error al crear carpeta', 'error');
    }
  };

  const handleRenameFolder = (folderId: string, currentName: string) => {
    showModal({
      title: 'Nuevo nombre de carpeta:',
      type: 'prompt',
      inputValue: currentName,
      onConfirm: async (newName) => {
        if (newName && newName !== currentName) {
          try {
            await renameFolder(folderId, newName);
            showNotification('Carpeta renombrada');
            fetchContent(currentFolderId);
          } catch {
            showNotification('Error al renombrar carpeta', 'error');
          }
        }
      }
    });
  };

  const handleRenameFile = (fileCode: string, currentTitle: string) => {
    showModal({
      title: 'Nuevo nombre de archivo:',
      type: 'prompt',
      inputValue: currentTitle,
      onConfirm: async (newTitle) => {
        if (newTitle && newTitle !== currentTitle) {
          try {
            await renameFile(fileCode, newTitle);
            showNotification('Archivo renombrado');
            fetchContent(currentFolderId);
          } catch {
            showNotification('Error al renombrar archivo', 'error');
          }
        }
      }
    });
  };

  // --- Upload Logic ---

  const fetchUploads = async () => {
    setIsRefreshingUploads(true);
    try {
      const res = await getRemoteUploadList();
      if (res.status === 200 && res.result) {
        setUploadList(res.result);
      }
    } catch {
      console.error('Error fetching uploads');
    } finally {
      setIsRefreshingUploads(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'upload') {
      fetchUploads();
      const interval = setInterval(fetchUploads, 10000); // Auto-refresh every 10s
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const handleUpload = async () => {
    if (!uploadUrls.trim()) return;
    
    // Split por saltos de línea, eliminar espacios, filtrar vacíos, y eliminar URLs duplicadas usando un Set
    const rawUrls = uploadUrls.split('\n').map(u => u.trim()).filter(u => u);
    const urls = Array.from(new Set(rawUrls));
    
    if (urls.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const url of urls) {
        const res = await addRemoteUpload(url, currentFolderId || undefined);
        if (res.status === 200 && res.msg === 'OK') {
          successCount++;
        } else {
          errorCount++;
        }
      }

      if (successCount > 0) {
        showNotification(`${successCount} subida(s) iniciada(s)`);
        setUploadUrls('');
        fetchUploads();
      }
      if (errorCount > 0) {
        showNotification(`Error al iniciar ${errorCount} subida(s)`, 'error');
      }
    } catch {
      showNotification('Error crítico al subir', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteUpload = (fileCode: string) => {
    showModal({
      title: '¿Detener y eliminar esta subida?',
      type: 'confirm',
      onConfirm: async () => {
        try {
          await deleteRemoteUpload(fileCode);
          showNotification('Subida eliminada');
          fetchUploads();
        } catch {
          showNotification('Error al eliminar subida', 'error');
        }
      }
    });
  };

  const handleClearErrors = async () => {
    try {
      await clearRemoteUploadErrors();
      showNotification('Errores limpiados');
      fetchUploads();
    } catch {
      showNotification('Error al limpiar errores', 'error');
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 relative">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-md shadow-lg flex items-center gap-2 animate-fade-in-down text-white ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {notification.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span>{notification.msg}</span>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => window.history.back()}
            className="mr-2 text-gray-500 hover:text-gray-700 transition-colors"
            title="Volver"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="bg-yellow-500 p-2 rounded-lg">
            <Folder className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Gestor DoodStream</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('explorer')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'explorer' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border'}`}
          >
            Explorador
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'upload' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border'}`}
          >
            Subida Remota
          </button>
        </div>
      </div>

      {activeTab === 'explorer' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col min-h-[600px]">
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2 overflow-x-auto">
              {breadcrumbs.map((crumb, idx) => (
                <div key={crumb.id || 'root'} className="flex items-center whitespace-nowrap">
                  {idx > 0 && <span className="mx-2 text-gray-400">/</span>}
                  <button
                    onClick={() => handleNavigateUp(idx)}
                    className={`text-sm font-medium hover:text-blue-600 ${idx === breadcrumbs.length - 1 ? 'text-gray-900' : 'text-gray-500'}`}
                  >
                    {crumb.name}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCreatingFolder(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50"
              >
                <FolderPlus className="h-4 w-4" />
                Nueva Carpeta
              </button>
              <button
                onClick={() => fetchContent(currentFolderId)}
                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
              >
                <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Create Folder Input */}
          {isCreatingFolder && (
            <div className="p-4 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
              <Folder className="h-5 w-5 text-blue-500" />
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nombre de la carpeta"
                className="flex-1 text-sm border-gray-300 rounded focus:border-blue-500 focus:ring-blue-500"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
              <button onClick={handleCreateFolder} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Crear</button>
              <button onClick={() => setIsCreatingFolder(false)} className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">Cancelar</button>
            </div>
          )}

          {/* Content List */}
          <div className="flex-1 p-4 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
              </div>
            ) : folders.length === 0 && files.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <Folder className="h-12 w-12 mb-2 opacity-20" />
                <p>Carpeta vacía</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {/* Folders */}
                {folders.map(folder => (
                  <div 
                    key={folder.code} 
                    className="group flex flex-col p-4 bg-yellow-50 rounded-lg border border-yellow-100 hover:border-yellow-300 transition-colors cursor-pointer relative"
                    onClick={() => handleNavigate(folder.fld_id, folder.name)}
                  >
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleRenameFolder(folder.fld_id, folder.name); }}
                        className="p-1 hover:bg-yellow-200 rounded text-yellow-700"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    </div>
                    <Folder className="h-10 w-10 text-yellow-500 mb-2" />
                    <span className="font-medium text-gray-800 truncate" title={folder.name}>{folder.name}</span>
                    <span className="text-xs text-gray-400">ID: {folder.fld_id}</span>
                  </div>
                ))}

                {/* Files */}
                {files.map(file => (
                  <div key={file.file_code} className="group flex flex-col p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors relative">
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/90 rounded-md shadow-sm backdrop-blur-sm p-1">
                      <button 
                        onClick={() => handleCopyUrl(file.file_code)}
                        className={`p-1.5 rounded transition-colors ${
                          copiedKey === `file-${file.file_code}`
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'hover:bg-blue-50 text-gray-600 hover:text-blue-600'
                        }`}
                        title="Copiar enlace https://playmogo.com/e/..."
                      >
                        {copiedKey === `file-${file.file_code}` ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button 
                        onClick={() => handleRenameFile(file.file_code, file.title)}
                        className="p-1.5 hover:bg-gray-100 rounded text-gray-600"
                        title="Renombrar"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="aspect-video bg-gray-100 rounded mb-2 overflow-hidden relative">
                      {file.single_img ? (
                        <img src={file.single_img} alt={file.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <FileVideo className="h-8 w-8 text-gray-300" />
                        </div>
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
                        {file.length}s
                      </div>
                    </div>
                    <span className="font-medium text-sm text-gray-800 truncate mb-1" title={file.title}>{file.title}</span>
                    <div className="flex justify-between items-end mt-auto">
                      <div className="text-xs text-gray-500 flex flex-col">
                        <span>{file.uploaded}</span>
                        <span>{file.views} views</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'upload' && (
        <div className="space-y-6">
          {/* Upload Form */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Subida Remota (Múltiples URLs)</h2>
            <div className="flex flex-col gap-4">
              <textarea
                value={uploadUrls}
                onChange={(e) => setUploadUrls(e.target.value)}
                placeholder="https://ejemplo.com/video1.mp4&#10;https://ejemplo.com/video2.mp4"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 min-h-[120px] font-mono text-sm"
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Subiendo a: <span className="font-medium text-gray-900">{breadcrumbs[breadcrumbs.length - 1].name}</span>
                  <br />
                  <span className="text-xs">Una URL por línea</span>
                </span>
                <button
                  onClick={handleUpload}
                  disabled={isUploading || !uploadUrls.trim()}
                  className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                  Subir Videos
                </button>
              </div>
            </div>
          </div>

          {/* Upload List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4 border-b pb-2">
              <h2 className="text-lg font-semibold text-gray-900">Estado de Subidas</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleClearErrors}
                  className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100"
                >
                  Limpiar Errores
                </button>
                <button
                  onClick={fetchUploads}
                  className="text-xs px-3 py-1.5 bg-gray-50 text-gray-600 rounded hover:bg-gray-100 flex items-center gap-1"
                >
                  <RefreshCw className={`h-3 w-3 ${isRefreshingUploads ? 'animate-spin' : ''}`} />
                  Refrescar
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {uploadList.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No hay subidas activas</div>
              ) : (
                uploadList.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${
                          item.status === 'working' ? 'bg-blue-500 animate-pulse' :
                          item.status === 'completed' ? 'bg-green-500' :
                          'bg-red-500'
                        }`} />
                        <span className="font-medium text-sm text-gray-900 truncate block">{item.remote_url}</span>
                      </div>
                      <div className="text-xs text-gray-500 flex gap-3">
                        <span>Estado: {item.status}</span>
                        <span>Creado: {item.created}</span>
                        {item.file_code && <span>Código: {item.file_code}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteUpload(item.file_code)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Cancelar/Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Modal */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#2A3042] rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-slide-up">
            <div className="p-4 border-b border-gray-700/50">
              <h3 className="text-lg font-bold text-white">docines.vercel.app dice</h3>
            </div>
            <div className="p-6">
              {modalConfig.message && (
                <p className="text-gray-200 mb-4">{modalConfig.message}</p>
              )}
              {modalConfig.type === 'prompt' && (
                <>
                  <label className="block text-gray-300 mb-2">{modalConfig.title}</label>
                  <input
                    type="text"
                    id="modalInput"
                    defaultValue={modalConfig.inputValue}
                    className="w-full bg-[#3B4256] text-white border border-gray-600 rounded p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        modalConfig.onConfirm?.((e.target as HTMLInputElement).value);
                        closeModal();
                      }
                      if (e.key === 'Escape') closeModal();
                    }}
                  />
                </>
              )}
              {modalConfig.type === 'confirm' && !modalConfig.message && (
                <p className="text-gray-200">{modalConfig.title}</p>
              )}
            </div>
            <div className="p-4 bg-[#232838] flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const val = modalConfig.type === 'prompt' 
                    ? (document.getElementById('modalInput') as HTMLInputElement)?.value 
                    : undefined;
                  modalConfig.onConfirm?.(val);
                  closeModal();
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors font-medium"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
