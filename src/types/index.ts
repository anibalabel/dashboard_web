export interface DocinesStats {
  series: number;
  movies: number;
}

export interface PlusmovieStats {
  movies: number;
  series: number;
}

export interface DooplexStats {
  movies: number;
  series: number;
  animes: number;
}

export interface DashboardData {
  docines: DocinesStats;
  plusmovie: PlusmovieStats;
  dooplex: DooplexStats;
}

export interface DashboardResponse {
  success: boolean;
  data: DashboardData;
}

export interface User {
  username: string;
  role: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: User;
}

export interface LoginCredentials {
  email: string;
  password?: string;
}

// --- Series Interfaces ---

export interface DooplexSerie {
  id: number;
  name: string;
}

export interface DooplexSeason {
  id: number;
  season_number: number;
  name: string;
}

export interface DooplexEpisode {
  id: number;
  season_id: number;
  episode_number: number;
  name: string;
  overview?: string;
  still_path?: string;
  still_path_tv?: string;
}

export interface DooplexEpisodeUpdatePayload {
  episodes_id: number;
  name: string;
  overview: string;
  still_path: string;
  still_path_tv: string;
}

export interface DooplexVideo {
  id: number;
  server: string;
  header: string;
  link: string;
  lang: string;
  embed?: string | number;
  youtubelink?: string | number;
  hls?: string | number;
  supported_hosts?: string | number;
}

export interface DooplexUpdatePayload {
  id: number;
  link?: string;
  server?: string;
  header?: string;
  lang?: string;
  embed?: string | number;
  youtubelink?: string | number;
  hls?: string | number;
  supported_hosts?: string | number;
}

export interface PlusmovieSerie {
  videos_id: number;
  title: string;
  tmdbid?: number;
}

export interface PlusmovieSerieUpdatePayload {
  videos_id: number;
  title: string;
  tmdbid: number;
}

export interface PlusmovieSeason {
  seasons_id: number;
  seasons_name: string;
  order: number;
}

export interface PlusmovieEpisode {
  episodes_id: number;
  episodes_name: string;
  file_url: string;
  order: number;
}

export interface PlusmovieUpdatePayload {
  episodes_id: number;
  episodes_name?: string;
  file_url?: string;
  order?: number;
}

export interface DooplexRegisterPayload {
  episode_id: number;
  server: string;
  header: string;
  link: string;
  lang: string;
}

export interface PlusmovieRegisterPayload {
  videos_id: number;
  seasons_id: number;
  episodes_name: string;
  file_source: string;
  source_type: string;
  file_url: string;
  order: number;
}

// --- Anime Interfaces ---

export interface DooplexAnime {
  id: number;
  name: string;
}

export interface DooplexAnimeSeason {
  id: number;
  anime_id: number;
  season_number: number;
  name: string;
}

export interface DooplexAnimeEpisode {
  id: number;
  episode_number: number;
  name: string;
  overview?: string;
  still_path?: string;
  still_path_tv?: string;
}

export interface DooplexAnimeEpisodeUpdatePayload {
  anime_episodes_id: number;
  name: string;
  overview: string;
  still_path: string;
  still_path_tv: string;
}

export interface DooplexAnimeRegisterPayload {
  anime_episode_id: number;
  server: string;
  header: string;
  link: string;
  lang: string;
}

export interface DooplexAnimeVideo {
  id: number;
  server: string;
  header: string;
  link: string;
  lang: string;
}

export interface DooplexAnimeVideoUpdatePayload {
  id: number;
  anime_episode_id?: number;
  server?: string;
  header?: string;
  link?: string;
  lang?: string;
}

// --- Docines Interfaces ---

export interface DocinesSerie {
  id: number;
  name: string;
}

export interface DocinesSeason {
  id: number;
  Session_Name: string;
  season_order: number;
}

export interface DocinesEpisode {
  id: number;
  season_id: number;
  episoade_order: number;
  Episoade_Name: string;
}

export interface DocinesEpisodeUpdatePayload {
  web_series_episoade_id: number;
  Episoade_Name: string;
  episoade_image: string;
  episoade_description: string;
}

export interface DocinesRegisterPayload {
  episode_id: number;
  name: string;
  url: string;
  quality: string;
}

export interface DocinesVideoLink {
  id: number;
  name: string;
  url: string;
  quality: string;
}

export interface DocinesUpdatePayload {
  id: number;
  name?: string;
  url?: string;
  quality?: string;
}

// --- Movies Interfaces ---

export interface DooplexMovie {
  id: number;
  title: string;
}

export interface PlusmovieMovie {
  videos_id: number;
  title: string;
  tmdbid?: number;
}

export interface PlusmovieMovieUpdatePayload {
  videos_id: number;
  title: string;
  tmdbid: number;
}

export interface DocinesMovie {
  id: number;
  name: string;
}

export interface DocinesMovieUpdatePayload {
  movies_id: number;
  movie_name: string;
}

export interface DooplexMovieRegisterPayload {
  movie_id: number;
  server: string;
  header: string;
  link: string;
  lang: string;
}

export interface PlusmovieMovieRegisterPayload {
  videos_id: number;
  file_url: string;
  label: string;
}

export interface DocinesMovieRegisterPayload {
  movie_id: number;
  name: string;
  url: string;
  quality: string;
}

export interface PlusmovieMovieVideo {
  video_file_id: number;
  file_url: string;
  label: string;
  order: number;
}

export interface PlusmovieMovieVideoUpdatePayload {
  video_file_id: number;
  file_url?: string;
  label?: string;
  order?: number;
}

export interface DooplexMovieVideo {
  id: number;
  server: string;
  header: string;
  link: string;
  lang: string;
  embed?: string | number;
  youtubelink?: string | number;
  hls?: string | number;
  supported_hosts?: string | number;
}

export interface DooplexMovieVideoUpdatePayload {
  id: number;
  server?: string;
  header?: string;
  link?: string;
  lang?: string;
  embed?: string | number;
  youtubelink?: string | number;
  hls?: string | number;
  supported_hosts?: string | number;
}

export interface DocinesMovieVideo {
  id: number;
  name: string;
  url: string;
  quality: string;
  link_order: number;
}

export interface DocinesMovieVideoUpdatePayload {
  id: number;
  name?: string;
  url?: string;
  quality?: string;
  link_order?: number;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}
