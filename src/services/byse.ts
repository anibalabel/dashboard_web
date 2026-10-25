import axios from 'axios';

const API_KEY = '103679m3ntc0haczdasdlg';
const BASE_URL = 'https://api.byse.sx';

const fetchApi = async (endpoint: string) => {
  const targetUrl = `${BASE_URL}${endpoint}`;
  
  try {
    const response = await axios.get(targetUrl);
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  } catch (error: unknown) {
    const err = error as { code?: string; response?: unknown };
    if (err.code === 'ERR_NETWORK' || !err.response) {
      console.warn('Direct fetch failed (CORS), falling back to proxy...');
      const proxyUrl = `https://app.movflix.live/proxy.php?url=${encodeURIComponent(targetUrl)}`;
      const proxyResponse = await axios.get(proxyUrl);
      return typeof proxyResponse.data === 'string' ? JSON.parse(proxyResponse.data) : proxyResponse.data;
    }
    throw error;
  }
};

// Types
export interface ByseFolder {
  fld_id: string;
  name: string;
  code: string;
}

export interface ByseFile {
  file_code: string;
  title: string;
  thumbnail?: string;
  length: string;
  uploaded: string;
  views: string;
  link?: string;
  fld_id: string;
  canplay: number;
  public: string;
}

export interface ByseListResponse {
  msg: string;
  status: number;
  result: {
    folders?: ByseFolder[];
    files?: ByseFile[];
  } | ByseFile[]; // Sometimes API returns array directly based on docs
}

export interface ByseUploadStatus {
  url: string;
  progress: string;
  status: string;
  created: string;
  updated: string;
  error_msg: string;
}

// Folder Management
export const createFolder = async (name: string, parentId: string = '0') => {
  const endpoint = `/folder/create?key=${API_KEY}&name=${encodeURIComponent(name)}&parent_id=${parentId}`;
  return await fetchApi(endpoint);
};

export const listFoldersAndFiles = async (fldId: string = '0') => {
  // Nota: La API de byse puede devolver carpetas y archivos o solo archivos dependiendo del endpoint.
  // Intentaremos usar folder/list si queremos carpetas, y file/list para la raíz si folder/list falla.
  const endpoint = `/folder/list?key=${API_KEY}&fld_id=${fldId}&files=1`;
  return await fetchApi(endpoint);
};

// File Management
export const getFileInfo = async (fileCode: string) => {
  const endpoint = `/file/info?key=${API_KEY}&file_code=${fileCode}`;
  return await fetchApi(endpoint);
};

export const cloneFile = async (fileCode: string, fldId?: string) => {
  let endpoint = `/file/clone?key=${API_KEY}&file_code=${fileCode}`;
  if (fldId && fldId !== '0') endpoint += `&fld_id=${fldId}`;
  return await fetchApi(endpoint);
};

// Remote Upload
export const addRemoteUpload = async (url: string, fldId?: string) => {
  let endpoint = `/remote/add?key=${API_KEY}&url=${encodeURIComponent(url)}`;
  if (fldId && fldId !== '0') endpoint += `&fld_id=${fldId}`;
  return await fetchApi(endpoint);
};

export const removeRemoteUpload = async (fileCode: string) => {
  const endpoint = `/remote/remove?key=${API_KEY}&file_code=${fileCode}`;
  return await fetchApi(endpoint);
};

export const checkRemoteStatus = async (fileCode: string) => {
  const endpoint = `/remote/status?key=${API_KEY}&file_code=${fileCode}`;
  return await fetchApi(endpoint);
};

// Deleted Files
export const getDeletedFiles = async (lastHours: number = 24) => {
  const endpoint = `/files/deleted?key=${API_KEY}&last=${lastHours}`;
  return await fetchApi(endpoint);
};
