import axios from 'axios';

const API_KEY = '530268i15qo3meyrnhnhuj';
const BASE_URL = 'https://doodapi.co/api';

const fetchApi = async (endpoint: string) => {
  const targetUrl = `${BASE_URL}${endpoint}`;
  
  try {
    const response = await axios.get(targetUrl);
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  } catch (error: unknown) {
    const err = error as { code?: string; response?: unknown };
    if (err.code === 'ERR_NETWORK' || !err.response) {
      console.warn('Direct fetch failed, falling back to local PHP proxy...');
      const proxyUrl = `/proxy.php?url=${encodeURIComponent(targetUrl)}`;
      try {
        const proxyResponse = await axios.get(proxyUrl);
        // Si la respuesta del proxy es un string, intentamos parsearlo
        if (typeof proxyResponse.data === 'string') {
          try {
            return JSON.parse(proxyResponse.data);
          } catch {
            console.error('Error parsing proxy response:', proxyResponse.data);
            throw new Error('Invalid JSON from proxy');
          }
        }
        return proxyResponse.data;
      } catch (proxyError) {
        console.error('Proxy fetch failed:', proxyError);
        throw proxyError;
      }
    }
    throw error;
  }
};

// Types
export interface DoodFolder {
  fld_id: string;
  name: string;
  code: string;
}

export interface DoodFile {
  file_code: string;
  title: string;
  single_img: string;
  length: string;
  uploaded: string;
  views: string;
  download_url: string;
  fld_id: string;
  splash_img?: string;
}

export interface DoodListResponse {
  msg: string;
  status: number;
  result: {
    folders: DoodFolder[];
    files: DoodFile[];
  };
}

export interface DoodUploadSlot {
  file_code: string;
  remote_url: string;
  status: string;
  created: string;
  bytes_total?: string;
  bytes_downloaded?: string;
}

// Folder Management
export const createFolder = async (name: string, parentId?: string) => {
  const endpoint = `/folder/create?key=${API_KEY}&name=${encodeURIComponent(name)}${parentId ? `&parent_id=${parentId}` : ''}`;
  return await fetchApi(endpoint);
};

export const renameFolder = async (fldId: string, name: string) => {
  const endpoint = `/folder/rename?key=${API_KEY}&fld_id=${fldId}&name=${encodeURIComponent(name)}`;
  return await fetchApi(endpoint);
};

export const listFoldersAndFiles = async (fldId?: string) => {
  const endpoint = `/folder/list?key=${API_KEY}${fldId ? `&fld_id=${fldId}` : ''}`;
  return await fetchApi(endpoint) as DoodListResponse;
};

// File Management
export const renameFile = async (fileCode: string, title: string) => {
  const endpoint = `/file/rename?key=${API_KEY}&file_code=${fileCode}&title=${encodeURIComponent(title)}`;
  return await fetchApi(endpoint);
};

// Remote Upload
export const addRemoteUpload = async (url: string, fldId?: string, newTitle?: string) => {
  let endpoint = `/upload/url?key=${API_KEY}&url=${encodeURIComponent(url)}`;
  if (fldId) endpoint += `&fld_id=${fldId}`;
  if (newTitle) endpoint += `&new_title=${encodeURIComponent(newTitle)}`;
  
  return await fetchApi(endpoint);
};

export const getRemoteUploadList = async () => {
  const endpoint = `/urlupload/list?key=${API_KEY}`;
  return await fetchApi(endpoint);
};

export const clearRemoteUploadErrors = async () => {
  const endpoint = `/urlupload/actions?key=${API_KEY}&clear_errors=1`;
  return await fetchApi(endpoint);
};

export const deleteRemoteUpload = async (fileCode: string) => {
  const endpoint = `/urlupload/actions?key=${API_KEY}&delete_code=${fileCode}`;
  return await fetchApi(endpoint);
};
