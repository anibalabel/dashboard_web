import { useState, useEffect } from 'react';
import { 
  Folder, FileVideo, Upload, Trash2, FolderPlus, RefreshCw, 
  Loader2, CheckCircle, AlertCircle, Copy, Clock, Check
} from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import {
  listFoldersAndFiles,
  createFolder,
  cloneFile,
  addRemoteUpload,
  checkRemoteStatus,
  removeRemoteUpload,
  getDeletedFiles,
  ByseFolder,
  ByseFile
} from '../../services/byse';

interface Breadcrumb {
  id: string;
  name: string;
}

interface UploadJob {
  fileCode: string;
  originalUrl: string;
  status: string;
  progress: string;
}

interface ByseDeletedFile {
  file_code: string;
  title?: string;
  deleted_ago_sec?: number | string;
  deleted_by?: string;
}

export default function Byse() {
  const [activeTab, setActiveTab] = useState<'explorer' | 'upload' | 'deleted'>('explorer');
  
  // Explorer State
  const [currentFolderId, setCurrentFolderId] = useState('0');
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: '0', name: 'Root' }]);
  const [folders, setFolders] = useState<ByseFolder[]>([]);
  const [files, setFiles] = useState<ByseFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Upload State
  const [uploadUrls, setUploadUrls] = useState('');
  const [activeUploads, setActiveUploads] = useState<UploadJob[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Deleted State
  const [deletedFiles, setDeletedFiles] = useState<ByseDeletedFile[]>([]);
  const [isLoadingDeleted, setIsLoadingDeleted] = useState(false);

  // Notification State
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // --- Explorer Logic ---

  const fetchContent = async (folderId = '0') => {
    setIsLoading(true);
    try {
      const res = await listFoldersAndFiles(folderId);
      if (res.status === 200 && res.result) {
        if (Array.isArray(res.result)) {
           // Fallback for endpoints returning array directly
           setFolders([]);
           setFiles(res.result);
        } else {
           setFolders(res.result.folders || []);
           setFiles(res.result.files || []);
        }
      } else {
         setFolders([]);
         setFiles([]);
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

  const handleCloneFile = async (fileCode: string) => {
    try {
      const res = await cloneFile(fileCode, currentFolderId);
      if (res.status === 200) {
         showNotification('Archivo clonado exitosamente');
         fetchContent(currentFolderId);
      } else {
         showNotification('Error al clonar archivo', 'error');
      }
    } catch {
      showNotification('Error al clonar archivo', 'error');
    }
  };

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboardHandler = async (text: string, key: string) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      showNotification('Enlace copiado');
      setTimeout(() => {
        setCopiedKey(prev => (prev === key ? null : prev));
      }, 2000);
    } else {
      showNotification('Error al copiar', 'error');
    }
  };

  // --- Upload Logic ---

  // Since Byse doesn't have a list of all remote uploads, we track them in state
  // and poll their status individually
  useEffect(() => {
    if (activeUploads.length === 0) return;

    const interval = setInterval(async () => {
      const updatedUploads = await Promise.all(
        activeUploads.map(async (job) => {
          if (job.status === 'COMPLETED' || job.status === 'ERROR') return job;
          
          try {
            const res = await checkRemoteStatus(job.fileCode);
            if (res.status === 200 && res.result) {
              return {
                ...job,
                status: res.result.status,
                progress: res.result.progress,
              };
            }
          } catch (err) {
            console.error('Error checking status for', job.fileCode, err);
          }
          return job;
        })
      );
      
      // Update state only if there are changes (simplified for brevity)
      setActiveUploads(updatedUploads);
    }, 5000);

    return () => clearInterval(interval);
  }, [activeUploads]);

  const handleUpload = async () => {
    if (!uploadUrls.trim()) return;
    
    // Split por saltos de línea, eliminar espacios, filtrar vacíos, y eliminar URLs duplicadas usando un Set
    const rawUrls = uploadUrls.split('\n').map(u => u.trim()).filter(u => u);
    const urls = Array.from(new Set(rawUrls));
    
    if (urls.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;
    const newJobs: UploadJob[] = [];

    try {
      for (const url of urls) {
        const res = await addRemoteUpload(url, currentFolderId);
        if (res.status === 200 && res.result?.filecode) {
          successCount++;
          newJobs.push({ fileCode: res.result.filecode, originalUrl: url, status: 'WORKING', progress: '0%' });
        } else {
          errorCount++;
        }
      }

      if (successCount > 0) {
        showNotification(`${successCount} subida(s) iniciada(s)`);
        setActiveUploads(prev => [...newJobs, ...prev]);
        setUploadUrls('');
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

  const handleCancelUpload = async (fileCode: string) => {
    try {
      await removeRemoteUpload(fileCode);
      showNotification('Subida cancelada');
      setActiveUploads(prev => prev.filter(u => u.fileCode !== fileCode));
    } catch {
      showNotification('Error al cancelar subida', 'error');
    }
  };

  // --- Deleted Logic ---
  
  const fetchDeleted = async () => {
    setIsLoadingDeleted(true);
    try {
       const res = await getDeletedFiles(24); // last 24 hours
       if (res.status === 200 && res.result) {
          setDeletedFiles(Array.isArray(res.result) ? (res.result as ByseDeletedFile[]) : []);
       }
    } catch {
       showNotification('Error al cargar archivos eliminados', 'error');
    } finally {
       setIsLoadingDeleted(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'deleted') {
       fetchDeleted();
    }
  }, [activeTab]);


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
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Folder className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Gestor FileMoon / Bysekoze</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('explorer')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'explorer' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border'}`}
          >
            Explorador
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'upload' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border'}`}
          >
            Subida Remota
          </button>
          <button
            onClick={() => setActiveTab('deleted')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'deleted' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border'}`}
          >
            Papelera
          </button>
        </div>
      </div>

      {activeTab === 'explorer' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col min-h-[600px]">
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2 overflow-x-auto">
              {breadcrumbs.map((crumb, idx) => (
                <div key={crumb.id} className="flex items-center whitespace-nowrap">
                  {idx > 0 && <span className="mx-2 text-gray-400">/</span>}
                  <button
                    onClick={() => handleNavigateUp(idx)}
                    className={`text-sm font-medium hover:text-indigo-600 ${idx === breadcrumbs.length - 1 ? 'text-gray-900' : 'text-gray-500'}`}
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
                className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
              >
                <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Create Folder Input */}
          {isCreatingFolder && (
            <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
              <Folder className="h-5 w-5 text-indigo-500" />
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nombre de la carpeta"
                className="flex-1 text-sm border-gray-300 rounded focus:border-indigo-500 focus:ring-indigo-500"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
              <button onClick={handleCreateFolder} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700">Crear</button>
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
                    key={folder.fld_id} 
                    className="group flex flex-col p-4 bg-indigo-50 rounded-lg border border-indigo-100 hover:border-indigo-300 transition-colors cursor-pointer relative"
                    onClick={() => handleNavigate(folder.fld_id, folder.name)}
                  >
                    <Folder className="h-10 w-10 text-indigo-500 mb-2" />
                    <span className="font-medium text-gray-800 truncate" title={folder.name}>{folder.name}</span>
                    <span className="text-xs text-gray-400">ID: {folder.fld_id}</span>
                  </div>
                ))}

                {/* Files */}
                {files.map(file => (
                  <div key={file.file_code} className="group flex flex-col p-4 bg-white rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors relative">
                    <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/90 rounded shadow-sm backdrop-blur-sm p-1">
                      <button 
                        type="button"
                        onClick={() => copyToClipboardHandler(`https://bysekoze.com/e/${file.file_code}`, `file-${file.file_code}`)}
                        className={`p-1.5 rounded transition-colors ${
                          copiedKey === `file-${file.file_code}`
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'hover:bg-gray-100 text-gray-600'
                        }`}
                        title="Copiar Link"
                      >
                        {copiedKey === `file-${file.file_code}` ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleCloneFile(file.file_code)}
                        className="p-1.5 hover:bg-indigo-50 rounded text-indigo-600"
                        title="Clonar aquí"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="aspect-video bg-gray-100 rounded mb-2 overflow-hidden relative">
                      {file.thumbnail ? (
                        <img src={file.thumbnail} alt={file.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <FileVideo className="h-8 w-8 text-gray-300" />
                        </div>
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
                        {Math.floor(Number(file.length) / 60)}:{(Number(file.length) % 60).toString().padStart(2, '0')}
                      </div>
                    </div>
                    <span className="font-medium text-sm text-gray-800 truncate mb-1" title={file.title}>{file.title || file.file_code}</span>
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
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2 min-h-[120px] font-mono text-sm"
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
                  className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                  Añadir a la Cola
                </button>
              </div>
            </div>
          </div>

          {/* Upload List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4 border-b pb-2">
              <h2 className="text-lg font-semibold text-gray-900">Cola de Subidas (Locales de esta sesión)</h2>
            </div>

            <div className="space-y-3">
              {activeUploads.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No hay subidas encoladas en esta sesión</div>
              ) : (
                activeUploads.map((item) => (
                  <div key={item.fileCode} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${
                          item.status === 'WORKING' ? 'bg-blue-500 animate-pulse' :
                          item.status === 'COMPLETED' ? 'bg-green-500' :
                          item.status === 'ERROR' ? 'bg-red-500' :
                          'bg-yellow-500'
                        }`} />
                        <span className="font-medium text-sm text-gray-900 truncate block">{item.originalUrl}</span>
                      </div>
                      <div className="text-xs text-gray-500 flex gap-3">
                        <span>Estado: {item.status}</span>
                        <span>Progreso: {item.progress}</span>
                        <span>Código: {item.fileCode}</span>
                      </div>
                    </div>
                    {item.status !== 'COMPLETED' && (
                      <button
                        onClick={() => handleCancelUpload(item.fileCode)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Cancelar Subida"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'deleted' && (
         <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 min-h-[400px]">
           <div className="flex items-center justify-between mb-4 border-b pb-2">
              <h2 className="text-lg font-semibold text-gray-900">Papelera (Últimas 24hs)</h2>
              <button
                onClick={fetchDeleted}
                className="text-xs px-3 py-1.5 bg-gray-50 text-gray-600 rounded hover:bg-gray-100 flex items-center gap-1"
              >
                <RefreshCw className={`h-3 w-3 ${isLoadingDeleted ? 'animate-spin' : ''}`} />
                Refrescar
              </button>
            </div>
            
            {isLoadingDeleted ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : deletedFiles.length === 0 ? (
               <div className="text-center py-12 text-gray-500 flex flex-col items-center">
                  <Trash2 className="h-12 w-12 text-gray-300 mb-3" />
                  <p>No hay archivos eliminados recientemente</p>
               </div>
            ) : (
               <div className="space-y-2">
                  {deletedFiles.map((f, idx) => (
                     <div key={idx} className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded">
                        <div>
                           <span className="font-medium text-gray-800 block">{f.title || f.file_code}</span>
                           <div className="text-xs text-gray-500 flex items-center gap-3 mt-1">
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3"/> Hace {f.deleted_ago_sec} segs</span>
                              <span>Por: {f.deleted_by}</span>
                           </div>
                        </div>
                        <span className="text-xs font-mono bg-white px-2 py-1 rounded border border-gray-200">{f.file_code}</span>
                     </div>
                  ))}
               </div>
            )}
         </div>
      )}
    </div>
  );
}
