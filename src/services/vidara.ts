import axios from 'axios';
import { DEFAULT_VIDARA_API_KEY } from '@/lib/vidaraUtils';

const BASE_URL = 'https://api.vidara.so/v1';

// --- Types ---

export interface VidaraFolder {
  fld_id: number | string;
  name: string;
  code?: number | string;
  videos?: number;
  created?: string;
}

export interface VidaraFolderListResponse {
  msg?: string;
  server_time?: string;
  status: number;
  result?: {
    folders?: VidaraFolder[];
    results?: number;
  } | VidaraFolder[];
  error?: string;
}

export interface VidaraVideo {
  vid_id?: number | string;
  filecode: string;
  title?: string;
  thumbnail?: string;
  player_img?: string;
  length?: string | number;
  video_length?: string | number;
  link?: string;
  views?: number | string;
  video_views?: number | string;
  uploaded?: string;
  video_created?: string;
  status?: string;
  file_active?: number;
  fld_id?: number | string;
}

export interface VidaraVideoListResponse {
  msg?: string;
  server_time?: string;
  status: number;
  result?: {
    videos?: VidaraVideo[];
    results?: number;
    page?: number;
    per_page?: number;
    total_pages?: number;
    total?: number;
  } | VidaraVideo[];
  error?: string;
}

export interface VidaraVideoInfoResponse {
  msg?: string;
  server_time?: string;
  status: number;
  result?: VidaraVideo[] | VidaraVideo;
  error?: string;
}

export interface VidaraActionResponse {
  msg?: string;
  server_time?: string;
  status: number;
  result?: {
    filecode?: string;
    title?: string;
    fld_id?: number | string;
    deleted?: boolean;
  };
  error?: string;
}

export interface VidaraUploadData {
  filecode: string;
  title: string;
  size?: number;
  fld_id?: string | number;
  folder_id?: string | number;
  url?: string;
}

export interface VidaraUploadResponse {
  msg: string;
  server_time?: string;
  status: number;
  data?: VidaraUploadData;
  result?: VidaraUploadData;
  error?: string;
}

export interface VidaraUploadParams {
  url: string;
  title?: string;
  folderId?: string;
  fldId?: string;
  apiKey?: string;
}

// --- Helper for API execution via local PHP proxy ---

const executeApi = async (endpoint: string): Promise<any> => {
  const targetUrl = `${BASE_URL}${endpoint}`;
  const proxyUrl = `/proxy.php?url=${encodeURIComponent(targetUrl)}`;

  try {
    const response = await axios.get(proxyUrl, { timeout: 35000 });
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  } catch (proxyError: unknown) {
    console.warn('Proxy call failed, trying direct endpoint...', proxyError);
    try {
      const directResponse = await axios.get(targetUrl, { timeout: 35000 });
      return typeof directResponse.data === 'string' ? JSON.parse(directResponse.data) : directResponse.data;
    } catch (directError: unknown) {
      const err = directError as { response?: { data?: unknown } };
      if (err.response?.data) {
        return typeof err.response.data === 'string' ? JSON.parse(err.response.data) : err.response.data;
      }
      throw proxyError;
    }
  }
};

// --- API Methods ---

/**
 * Obtener lista de carpetas (Folder List)
 * GET /v1/folder/list?api_key=...
 */
export const listVidaraFolders = async (
  apiKey = DEFAULT_VIDARA_API_KEY
): Promise<VidaraFolderListResponse> => {
  const endpoint = `/folder/list?api_key=${encodeURIComponent(apiKey.trim() || DEFAULT_VIDARA_API_KEY)}`;
  return await executeApi(endpoint);
};

/**
 * Obtener lista de videos (File List)
 * GET /v1/video/list?api_key=...&page=1&limit=100&fld_id=5&title=...&status=active
 */
export const listVidaraVideos = async ({
  page = 1,
  limit = 100,
  title,
  fldId,
  status = 'active',
  apiKey = DEFAULT_VIDARA_API_KEY,
}: {
  page?: number;
  limit?: number;
  title?: string;
  fldId?: string | number;
  status?: string;
  apiKey?: string;
}): Promise<VidaraVideoListResponse> => {
  const params = new URLSearchParams();
  params.append('api_key', (apiKey && apiKey.trim()) ? apiKey.trim() : DEFAULT_VIDARA_API_KEY);
  if (page) params.append('page', String(page));
  if (limit) params.append('limit', String(limit));
  if (title && title.trim()) params.append('title', title.trim());
  if (fldId !== undefined && fldId !== null && String(fldId).trim() !== '' && String(fldId) !== '0') {
    params.append('fld_id', String(fldId).trim());
  }
  if (status) params.append('status', status);

  const endpoint = `/video/list?${params.toString()}`;
  return await executeApi(endpoint);
};

/**
 * Obtener información de un video (File Info)
 * GET /v1/video/info?api_key=...&filecode=AbC123xY
 */
export const getVidaraVideoInfo = async (
  filecode: string,
  apiKey = DEFAULT_VIDARA_API_KEY
): Promise<VidaraVideoInfoResponse> => {
  const endpoint = `/video/info?api_key=${encodeURIComponent(apiKey.trim() || DEFAULT_VIDARA_API_KEY)}&filecode=${encodeURIComponent(filecode.trim())}`;
  return await executeApi(endpoint);
};

/**
 * Renombrar un video (File Rename)
 * GET /v1/video/rename?api_key=...&filecode=AbC123xY&title=New%20title
 */
export const renameVidaraVideo = async (
  filecode: string,
  newTitle: string,
  apiKey = DEFAULT_VIDARA_API_KEY
): Promise<VidaraActionResponse> => {
  const endpoint = `/video/rename?api_key=${encodeURIComponent(apiKey.trim() || DEFAULT_VIDARA_API_KEY)}&filecode=${encodeURIComponent(filecode.trim())}&title=${encodeURIComponent(newTitle.trim())}`;
  return await executeApi(endpoint);
};

/**
 * Mover un video a otra carpeta (File Move)
 * GET /v1/video/move?api_key=...&filecode=AbC123xY&fld_id=5 (0 para mover a la raíz)
 */
export const moveVidaraVideo = async (
  filecode: string,
  destinationFldId: string | number = 0,
  apiKey = DEFAULT_VIDARA_API_KEY
): Promise<VidaraActionResponse> => {
  const endpoint = `/video/move?api_key=${encodeURIComponent(apiKey.trim() || DEFAULT_VIDARA_API_KEY)}&filecode=${encodeURIComponent(filecode.trim())}&fld_id=${encodeURIComponent(String(destinationFldId))}`;
  return await executeApi(endpoint);
};

/**
 * Eliminar un video (File Delete)
 * GET /v1/video/delete?api_key=...&filecode=AbC123xY
 */
export const deleteVidaraVideo = async (
  filecode: string,
  apiKey = DEFAULT_VIDARA_API_KEY
): Promise<VidaraActionResponse> => {
  const endpoint = `/video/delete?api_key=${encodeURIComponent(apiKey.trim() || DEFAULT_VIDARA_API_KEY)}&filecode=${encodeURIComponent(filecode.trim())}`;
  return await executeApi(endpoint);
};

/**
 * Subida Remota por URL (Upload URL)
 * GET /v1/upload/url?title=...&fld_id=...&api_key=...&url=...
 */
export const uploadUrlVidara = async ({
  url,
  title,
  folderId,
  fldId,
  apiKey = DEFAULT_VIDARA_API_KEY,
}: VidaraUploadParams): Promise<VidaraUploadResponse> => {
  const queryParts: string[] = [];

  if (title && title.trim()) {
    queryParts.push(`title=${encodeURIComponent(title.trim())}`);
  }

  const cleanFolder = (folderId || fldId || '').trim();
  if (cleanFolder && cleanFolder !== '0') {
    queryParts.push(`fld_id=${encodeURIComponent(cleanFolder)}`);
  }

  queryParts.push(`api_key=${encodeURIComponent((apiKey && apiKey.trim()) ? apiKey.trim() : DEFAULT_VIDARA_API_KEY)}`);
  queryParts.push(`url=${encodeURIComponent(url.trim())}`);

  const endpoint = `/upload/url?${queryParts.join('&')}`;
  return await executeApi(endpoint);
};
