import axios from 'axios';

const API_KEY = '24895c857heko0c1ujhkj';
const BASE_URL = 'https://supervideo.cc/api';

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
export interface SupervideoFolder {
  fld_id: string;
  name: string;
  code: string;
}

export interface SupervideoFile {
  file_code: string;
  title: string;
  thumbnail: string;
  length: string;
  uploaded: string;
  views: string;
  link: string;
  fld_id: string;
  canplay: number;
  public: string;
}

export interface SupervideoListResponse {
  msg: string;
  status: number;
  result: {
    folders?: SupervideoFolder[];
    files?: SupervideoFile[];
    results_total?: number;
    pages?: number;
    results?: number;
  };
}

export interface SupervideoUploadSlot {
  file_code: string;
  remote_url: string;
  status: string;
  progress: number;
  fld_id: string;
}

export interface SupervideoUploadActionsResponse {
  msg: string;
  status: number;
  requests_available?: number;
  result?: SupervideoUploadSlot[];
}

// Folder Management
export const createFolder = async (name: string, parentId: string = '0') => {
  const endpoint = `/folder/create?key=${API_KEY}&name=${encodeURIComponent(name)}&parent_id=${parentId}`;
  return await fetchApi(endpoint);
};

export const renameFolder = async (fldId: string, name: string) => {
  const endpoint = `/folder/edit?key=${API_KEY}&fld_id=${fldId}&name=${encodeURIComponent(name)}`;
  return await fetchApi(endpoint);
};

export const listFoldersAndFiles = async (fldId: string = '0') => {
  const endpoint = `/folder/list?key=${API_KEY}&fld_id=${fldId}&files=1`;
  return await fetchApi(endpoint) as SupervideoListResponse;
};

export const deleteFolder = async (fldId: string) => {
  const endpoint = `/folder/delete?key=${API_KEY}&fld_id=${fldId}`;
  return await fetchApi(endpoint);
};

// File Management
export const renameFile = async (fileCode: string, title: string) => {
  const endpoint = `/file/edit?key=${API_KEY}&file_code=${fileCode}&file_title=${encodeURIComponent(title)}`;
  return await fetchApi(endpoint);
};

export const deleteFile = async (fileCode: string) => {
  const endpoint = `/file/delete?key=${API_KEY}&file_code=${fileCode}`;
  return await fetchApi(endpoint);
};

// Remote Upload
export const addRemoteUpload = async (url: string, fldId?: string) => {
  let endpoint = `/upload/url?key=${API_KEY}&url=${encodeURIComponent(url)}`;
  if (fldId) endpoint += `&fld_id=${fldId}`;
  
  return await fetchApi(endpoint);
};

export const getRemoteUploadList = async () => {
  const endpoint = `/file/url_uploads?key=${API_KEY}`;
  return await fetchApi(endpoint) as SupervideoUploadActionsResponse;
};

export const clearRemoteUploadErrors = async () => {
  const endpoint = `/file/url_actions?key=${API_KEY}&delete_errors=1`;
  return await fetchApi(endpoint);
};

export const deleteRemoteUpload = async (fileCode: string) => {
  const endpoint = `/file/url_actions?key=${API_KEY}&delete_code=${fileCode}`;
  return await fetchApi(endpoint);
};
