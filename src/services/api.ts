import axios from 'axios';
import {
  DashboardResponse,
  LoginCredentials,
  LoginResponse,
  DooplexSerie,
  DooplexSeason,
  DooplexEpisode,
  PlusmovieSerie,
  PlusmovieSerieUpdatePayload,
  PlusmovieSeason,
  PlusmovieEpisode,
  PlusmovieUpdatePayload,
  DooplexRegisterPayload,
  PlusmovieRegisterPayload,
  DooplexVideo,
  DooplexUpdatePayload,
  DooplexEpisodeUpdatePayload,
  DocinesSerie,
  DocinesSeason,
  DocinesEpisode,
  DocinesEpisodeUpdatePayload,
  DocinesRegisterPayload,
  DocinesVideoLink,
  DocinesUpdatePayload,
  DooplexMovie,
  PlusmovieMovie,
  DocinesMovie,
  DocinesMovieUpdatePayload,
  DooplexMovieRegisterPayload,
  PlusmovieMovieRegisterPayload,
  PlusmovieMovieUpdatePayload,
  DocinesMovieRegisterPayload,
  PlusmovieMovieVideo,
  PlusmovieMovieVideoUpdatePayload,
  DooplexMovieVideo,
  DooplexMovieVideoUpdatePayload,
  DocinesMovieVideo,
  DocinesMovieVideoUpdatePayload,
  DooplexAnime,
  DooplexAnimeSeason,
  DooplexAnimeEpisode,
  DooplexAnimeEpisodeUpdatePayload,
  DooplexAnimeRegisterPayload,
  DooplexAnimeVideo,
  DooplexAnimeVideoUpdatePayload,
  ApiResponse
} from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const fetchDashboardStats = async (): Promise<DashboardResponse> => {
  try {
    const response = await axios.get<DashboardResponse>(`${BASE_URL}/dashboard.php`);
    return response.data;
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
};

export const loginAdmin = async (credentials: LoginCredentials): Promise<LoginResponse> => {
  try {
    const response = await axios.post<LoginResponse>(`${BASE_URL}/login_dooplex.php`, credentials, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.data as LoginResponse;
    }
    console.error('Error logging in:', error);
    throw error;
  }
};

// --- Series Endpoints ---

export const getDooplexSeries = async (tmdbId: string): Promise<ApiResponse<DooplexSerie[]>> => {
  const response = await axios.get<ApiResponse<DooplexSerie[]>>(`${BASE_URL}/series_dooplex.php?tmdb_id=${tmdbId}`);
  return response.data;
};

export const getDooplexSeasons = async (serieId: number): Promise<ApiResponse<DooplexSeason[]>> => {
  const response = await axios.get<ApiResponse<DooplexSeason[]>>(`${BASE_URL}/series_dooplex.php?serie_id=${serieId}`);
  return response.data;
};

export const getDooplexEpisodes = async (seasonId: number): Promise<ApiResponse<DooplexEpisode[]>> => {
  const response = await axios.get<ApiResponse<DooplexEpisode[]>>(`${BASE_URL}/series_dooplex.php?season_id=${seasonId}`);
  return response.data;
};

export const updateDooplexEpisode = async (payload: DooplexEpisodeUpdatePayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.put<ApiResponse<unknown>>(`${BASE_URL}/series_dooplex.php`, payload);
  return response.data;
};

export const getPlusmovieSeries = async (tmdbId: string): Promise<ApiResponse<PlusmovieSerie[]>> => {
  const response = await axios.get<ApiResponse<PlusmovieSerie[]>>(`${BASE_URL}/series_plusmovie.php?tmdbid=${tmdbId}`);
  return response.data;
};

export const getPlusmovieSeriesByTitle = async (title: string): Promise<ApiResponse<PlusmovieSerie[]>> => {
  const response = await axios.get<ApiResponse<PlusmovieSerie[]>>(`${BASE_URL}/series_plusmovie.php?title=${title}`);
  return response.data;
};

export const getPlusmovieSeriesByVideosId = async (videosInfoId: number): Promise<ApiResponse<PlusmovieSerie[]>> => {
  const response = await axios.get<ApiResponse<PlusmovieSerie[]>>(`${BASE_URL}/series_plusmovie.php?videos_info_id=${videosInfoId}`);
  return response.data;
};

export const updatePlusmovieSerie = async (payload: PlusmovieSerieUpdatePayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.put<ApiResponse<unknown>>(`${BASE_URL}/series_plusmovie.php`, payload);
  return response.data;
};

export const getPlusmovieSeasons = async (videosId: number): Promise<ApiResponse<PlusmovieSeason[]>> => {
  const response = await axios.get<ApiResponse<PlusmovieSeason[]>>(`${BASE_URL}/series_plusmovie.php?videos_id=${videosId}`);
  return response.data;
};

export const getPlusmovieEpisodes = async (seasonsId: number): Promise<ApiResponse<PlusmovieEpisode[]>> => {
  const response = await axios.get<ApiResponse<PlusmovieEpisode[]>>(`${BASE_URL}/series_plusmovie.php?seasons_id=${seasonsId}`);
  return response.data;
};

export const registerDooplexLink = async (payload: DooplexRegisterPayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.post<ApiResponse<unknown>>(`${BASE_URL}/series_dooplex.php`, payload);
  return response.data;
};

export const registerPlusmovieEpisode = async (payload: PlusmovieRegisterPayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.post<ApiResponse<unknown>>(`${BASE_URL}/series_plusmovie.php`, payload);
  return response.data;
};

export const updatePlusmovieEpisode = async (payload: PlusmovieUpdatePayload): Promise<ApiResponse<{ last_ep_added?: string }>> => {
  const response = await axios.put<ApiResponse<{ last_ep_added?: string }>>(`${BASE_URL}/series_plusmovie.php`, payload);
  return response.data;
};

export const deletePlusmovieEpisode = async (episodesId: number): Promise<ApiResponse<unknown>> => {
  const response = await axios.delete<ApiResponse<unknown>>(`${BASE_URL}/series_plusmovie.php?episodes_id=${episodesId}`);
  return response.data;
};

export const getDooplexVideos = async (episodeId: number): Promise<ApiResponse<DooplexVideo[]>> => {
  const response = await axios.get<ApiResponse<DooplexVideo[]>>(`${BASE_URL}/series_dooplex.php?episode_id=${episodeId}`);
  return response.data;
};

export const updateDooplexVideo = async (payload: DooplexUpdatePayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.put<ApiResponse<unknown>>(`${BASE_URL}/series_dooplex.php`, payload);
  return response.data;
};

export const deleteDooplexVideo = async (id: number): Promise<ApiResponse<unknown>> => {
  const response = await axios.delete<ApiResponse<unknown>>(`${BASE_URL}/series_dooplex.php?id=${id}`);
  return response.data;
};

// --- Anime Endpoints ---

export const getDooplexAnime = async (tmdbId: string): Promise<ApiResponse<DooplexAnime[]>> => {
  const response = await axios.get<ApiResponse<DooplexAnime[]>>(`${BASE_URL}/anime_dooplex.php?tmdb_id=${tmdbId}`);
  return response.data;
};

export const getDooplexAnimeSeasons = async (animeId: number): Promise<ApiResponse<DooplexAnimeSeason[]>> => {
  const response = await axios.get<ApiResponse<DooplexAnimeSeason[]>>(`${BASE_URL}/anime_dooplex.php?anime_id=${animeId}`);
  return response.data;
};

export const getDooplexAnimeEpisodes = async (animeSeasonId: number): Promise<ApiResponse<DooplexAnimeEpisode[]>> => {
  const response = await axios.get<ApiResponse<DooplexAnimeEpisode[]>>(`${BASE_URL}/anime_dooplex.php?anime_season_id=${animeSeasonId}`);
  return response.data;
};

export const registerDooplexAnimeEpisodeVideo = async (
  payload: DooplexAnimeRegisterPayload
): Promise<ApiResponse<{ id: string; created_at: string; updated_at: string }>> => {
  const response = await axios.post<ApiResponse<{ id: string; created_at: string; updated_at: string }>>(
    `${BASE_URL}/anime_dooplex.php`,
    payload
  );
  return response.data;
};

export const getDooplexAnimeVideos = async (animeEpisodeId: number): Promise<ApiResponse<DooplexAnimeVideo[]>> => {
  const response = await axios.get<ApiResponse<DooplexAnimeVideo[]>>(`${BASE_URL}/anime_dooplex.php?anime_episode_id=${animeEpisodeId}`);
  return response.data;
};

export const updateDooplexAnimeEpisode = async (payload: DooplexAnimeEpisodeUpdatePayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.put<ApiResponse<unknown>>(`${BASE_URL}/anime_dooplex.php`, payload);
  return response.data;
};

export const updateDooplexAnimeVideo = async (payload: DooplexAnimeVideoUpdatePayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.put<ApiResponse<unknown>>(`${BASE_URL}/anime_dooplex.php`, payload);
  return response.data;
};

export const deleteDooplexAnimeVideo = async (id: number): Promise<ApiResponse<unknown>> => {
  const response = await axios.delete<ApiResponse<unknown>>(`${BASE_URL}/anime_dooplex.php?id=${id}`);
  return response.data;
};

// --- Docines Endpoints ---

export const getDocinesSeries = async (tmdbId: string): Promise<ApiResponse<DocinesSerie[]>> => {
  const response = await axios.get<ApiResponse<DocinesSerie[]>>(`${BASE_URL}/series_docines.php?tmdbid=${tmdbId}`);
  return response.data;
};

export const getDocinesSeasons = async (webSeriesId: number): Promise<ApiResponse<DocinesSeason[]>> => {
  const response = await axios.get<ApiResponse<DocinesSeason[]>>(`${BASE_URL}/series_docines.php?web_series_id=${webSeriesId}`);
  return response.data;
};

export const getDocinesEpisodes = async (seasonId: number): Promise<ApiResponse<DocinesEpisode[]>> => {
  const response = await axios.get<ApiResponse<DocinesEpisode[]>>(`${BASE_URL}/series_docines.php?season_id=${seasonId}`);
  return response.data;
};

export const updateDocinesEpisodeMetadata = async (payload: DocinesEpisodeUpdatePayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.put<ApiResponse<unknown>>(`${BASE_URL}/series_docines.php`, payload);
  return response.data;
};

export const registerDocinesLink = async (payload: DocinesRegisterPayload): Promise<ApiResponse<{ id: string; link_order: number }>> => {
  const response = await axios.post<ApiResponse<{ id: string; link_order: number }>>(`${BASE_URL}/series_docines.php`, payload);
  return response.data;
};

export const getDocinesVideos = async (episodeId: number): Promise<ApiResponse<DocinesVideoLink[]>> => {
  const response = await axios.get<ApiResponse<DocinesVideoLink[]>>(`${BASE_URL}/series_docines.php?episode_id=${episodeId}`);
  return response.data;
};

export const updateDocinesVideo = async (payload: DocinesUpdatePayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.put<ApiResponse<unknown>>(`${BASE_URL}/series_docines.php`, payload);
  return response.data;
};

export const deleteDocinesVideo = async (id: number): Promise<ApiResponse<unknown>> => {
  const response = await axios.delete<ApiResponse<unknown>>(`${BASE_URL}/series_docines.php?id=${id}`);
  return response.data;
};

// --- Movies Endpoints ---

export const getPlusmovieMovie = async (tmdbid: string): Promise<ApiResponse<PlusmovieMovie[]>> => {
  const response = await axios.get<ApiResponse<PlusmovieMovie[]>>(`${BASE_URL}/movie_plusmovie.php?tmdbid=${tmdbid}`);
  return response.data;
};

export const getPlusmovieMovieByTitle = async (title: string): Promise<ApiResponse<PlusmovieMovie[]>> => {
  const response = await axios.get<ApiResponse<PlusmovieMovie[]>>(`${BASE_URL}/series_plusmovie.php?title=${title}`);
  return response.data;
};

export const getPlusmovieMovieByVideosId = async (videosInfoId: number): Promise<ApiResponse<PlusmovieMovie[]>> => {
  const response = await axios.get<ApiResponse<PlusmovieMovie[]>>(`${BASE_URL}/series_plusmovie.php?videos_info_id=${videosInfoId}`);
  return response.data;
};

export const updatePlusmovieMovie = async (payload: PlusmovieMovieUpdatePayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.put<ApiResponse<unknown>>(`${BASE_URL}/series_plusmovie.php`, payload);
  return response.data;
};

export const registerPlusmovieMovie = async (payload: PlusmovieMovieRegisterPayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.post<ApiResponse<unknown>>(`${BASE_URL}/movie_plusmovie.php`, payload);
  return response.data;
};

export const getPlusmovieMovieVideos = async (videos_id: number): Promise<ApiResponse<PlusmovieMovieVideo[]>> => {
  const response = await axios.get<ApiResponse<PlusmovieMovieVideo[]>>(`${BASE_URL}/movie_plusmovie.php?videos_id=${videos_id}`);
  return response.data;
};

export const updatePlusmovieMovieVideo = async (payload: PlusmovieMovieVideoUpdatePayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.put<ApiResponse<unknown>>(`${BASE_URL}/movie_plusmovie.php`, payload);
  return response.data;
};

export const deletePlusmovieMovieVideo = async (video_file_id: number): Promise<ApiResponse<unknown>> => {
  const response = await axios.delete<ApiResponse<unknown>>(`${BASE_URL}/movie_plusmovie.php?video_file_id=${video_file_id}`);
  return response.data;
};

export const getDooplexMovie = async (tmdb_id: string): Promise<ApiResponse<DooplexMovie[]>> => {
  const response = await axios.get<ApiResponse<DooplexMovie[]>>(`${BASE_URL}/movie_dooplex.php?tmdb_id=${tmdb_id}`);
  return response.data;
};

export const registerDooplexMovie = async (payload: DooplexMovieRegisterPayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.post<ApiResponse<unknown>>(`${BASE_URL}/movie_dooplex.php`, payload);
  return response.data;
};

export const getDooplexMovieVideos = async (movie_id: number): Promise<ApiResponse<DooplexMovieVideo[]>> => {
  const response = await axios.get<ApiResponse<DooplexMovieVideo[]>>(`${BASE_URL}/movie_dooplex.php?movie_id=${movie_id}`);
  return response.data;
};

export const updateDooplexMovieVideo = async (payload: DooplexMovieVideoUpdatePayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.put<ApiResponse<unknown>>(`${BASE_URL}/movie_dooplex.php`, payload);
  return response.data;
};

export const deleteDooplexMovieVideo = async (id: number): Promise<ApiResponse<unknown>> => {
  const response = await axios.delete<ApiResponse<unknown>>(`${BASE_URL}/movie_dooplex.php?id=${id}`);
  return response.data;
};

export const getDocinesMovie = async (tmdbid: string): Promise<ApiResponse<DocinesMovie[]>> => {
  const response = await axios.get<ApiResponse<DocinesMovie[]>>(`${BASE_URL}/movie_docines.php?tmdbid=${tmdbid}`);
  return response.data;
};

export const registerDocinesMovie = async (payload: DocinesMovieRegisterPayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.post<ApiResponse<unknown>>(`${BASE_URL}/movie_docines.php`, payload);
  return response.data;
};

export const updateDocinesMovie = async (payload: DocinesMovieUpdatePayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.put<ApiResponse<unknown>>(`${BASE_URL}/movie_docines.php`, payload);
  return response.data;
};

export const getDocinesMovieVideos = async (movie_id: number): Promise<ApiResponse<DocinesMovieVideo[]>> => {
  const response = await axios.get<ApiResponse<DocinesMovieVideo[]>>(`${BASE_URL}/movie_docines.php?movie_id=${movie_id}`);
  return response.data;
};

export const updateDocinesMovieVideo = async (payload: DocinesMovieVideoUpdatePayload): Promise<ApiResponse<unknown>> => {
  const response = await axios.put<ApiResponse<unknown>>(`${BASE_URL}/movie_docines.php`, payload);
  return response.data;
};

export const deleteDocinesMovieVideo = async (id: number): Promise<ApiResponse<unknown>> => {
  const response = await axios.delete<ApiResponse<unknown>>(`${BASE_URL}/movie_docines.php?id=${id}`);
  return response.data;
};
