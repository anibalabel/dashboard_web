import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { LayoutDashboard, Clapperboard, Film, FileVideo, ChevronDown, ChevronRight, ListVideo, DownloadCloud, Smartphone, Wrench, Link as LinkIcon, Globe, Flame, CloudUpload } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface SidebarProps {
  onClose?: () => void;
}

export const Sidebar = ({ onClose }: SidebarProps) => {
  const location = useLocation();
  const plusmovieMode = new URLSearchParams(location.search).get('mode');
  const isPlusmovieSeriesRActive = location.pathname === '/series/registro-doble' && plusmovieMode === 'plusmovie';
  const { user } = useAuthStore();
  const [isSeriesOpen, setIsSeriesOpen] = useState(location.pathname.includes('/series'));
  const [isMoviesOpen, setIsMoviesOpen] = useState(location.pathname.includes('/movies'));
  const [isExtractionOpen, setIsExtractionOpen] = useState(location.pathname.includes('/extraccion'));
  const [isServidoresOpen, setIsServidoresOpen] = useState(location.pathname.includes('/servidores'));
  const [isHerramientasOpen, setIsHerramientasOpen] = useState(location.pathname.includes('/herramientas'));

  if (!user) return null;

  const isSeriesActive = location.pathname.includes('/series');
  const isMoviesActive = location.pathname.includes('/movies');
  const isExtractionActive = location.pathname.includes('/extraccion');
  const isServidoresActive = location.pathname.includes('/servidores');
  const isHerramientasActive = location.pathname.includes('/herramientas');

  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-full overflow-y-auto block">
      <div className="py-6 px-4">
        <nav className="space-y-2">
          <Link
            to="/"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
              location.pathname === '/'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <LayoutDashboard className="h-5 w-5" />
            Dashboard
          </Link>

          <Link
            to="/version-app"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
              location.pathname === '/version-app'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Smartphone className="h-5 w-5" />
            Version App
          </Link>

          <div className="pt-4">
            <button
              onClick={() => setIsSeriesOpen(!isSeriesOpen)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
                isSeriesActive && !isSeriesOpen
                  ? 'text-blue-700 bg-blue-50/50'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <FileVideo className={`h-5 w-5 ${isSeriesActive ? 'text-blue-600' : 'text-gray-500'}`} />
                Series
              </div>
              {isSeriesOpen ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
            </button>

            {isSeriesOpen && (
              <div className="mt-1 ml-4 pl-4 border-l border-gray-200 space-y-1">
                <Link
                  to="/series/registro-dooplex"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/series/registro-dooplex'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Clapperboard className="h-4 w-4" />
                  Registro Dooplex
                </Link>
                <Link
                  to="/series/registro-anime"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/series/registro-anime'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Clapperboard className="h-4 w-4" />
                  Registro Anime
                </Link>
                <Link
                  to="/series/urls-dooplex"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/series/urls-dooplex'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Urls Series Dooplex
                </Link>
                <Link
                  to="/series/urls-dooplex-update"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/series/urls-dooplex-update'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Update Episodios Series
                </Link>
                <Link
                  to="/series/urls-anime"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/series/urls-anime'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Urls Anime
                </Link>
                <Link
                  to="/series/urls-anime-update"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/series/urls-anime-update'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Update Episodios Anime
                </Link>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={() => setIsMoviesOpen(!isMoviesOpen)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
                isMoviesActive && !isMoviesOpen
                  ? 'text-blue-700 bg-blue-50/50'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <Film className={`h-5 w-5 ${isMoviesActive ? 'text-blue-600' : 'text-gray-500'}`} />
                Películas
              </div>
              {isMoviesOpen ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
            </button>

            {isMoviesOpen && (
              <div className="mt-1 ml-4 pl-4 border-l border-gray-200 space-y-1">
                <Link
                  to="/movies/dooplex-r-movie"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/movies/dooplex-r-movie'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Film className="h-4 w-4" />
                  Dooplex R-Movie
                </Link>
                <Link
                  to="/movies/urls-dooplex"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/movies/urls-dooplex'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Urls Dooplex
                </Link>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={() => setIsExtractionOpen(!isExtractionOpen)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
                isExtractionActive && !isExtractionOpen
                  ? 'text-blue-700 bg-blue-50/50'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <DownloadCloud className={`h-5 w-5 ${isExtractionActive ? 'text-blue-600' : 'text-gray-500'}`} />
                Extracción
              </div>
              {isExtractionOpen ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
            </button>

            {isExtractionOpen && (
              <div className="mt-1 ml-4 pl-4 border-l border-gray-200 space-y-1">
                <Link
                  to="/extraccion/series-gnula"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/series-gnula'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Series Gnula
                </Link>
                <Link
                  to="/extraccion/movies-gnula"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/movies-gnula'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Film className="h-4 w-4" />
                  Movies Gnula
                </Link>
                <Link
                  to="/extraccion/movies-gnula-v2"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/movies-gnula-v2'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Film className="h-4 w-4" />
                  Movies Gnula V2
                </Link>
                <Link
                  to="/extraccion/series-pelisplus"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/series-pelisplus'
                      ? 'bg-red-50 text-red-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Series Pelisplus
                </Link>
                <Link
                  to="/extraccion/movies-pelisplus"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/movies-pelisplus'
                      ? 'bg-red-50 text-red-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Film className="h-4 w-4" />
                  Movies Pelisplus
                </Link>
                <Link
                  to="/extraccion/series-cinemitas"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/series-cinemitas'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Series Cinemitas
                </Link>
                <Link
                  to="/extraccion/movies-cinemitas"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/movies-cinemitas'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Film className="h-4 w-4" />
                  Movies Cinemitas
                </Link>
                <Link
                  to="/extraccion/movies-cinemitas-v2"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/movies-cinemitas-v2'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Film className="h-4 w-4" />
                  Cinemitas Movies V2
                </Link>
                <Link
                  to="/extraccion/series-cinehdplus"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/series-cinehdplus'
                      ? 'bg-green-50 text-green-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Series CineHDPlus
                </Link>
                <Link
                  to="/extraccion/movies-cinehdplus"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/movies-cinehdplus'
                      ? 'bg-green-50 text-green-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Film className="h-4 w-4" />
                  Movies CineHDPlus
                </Link>
                <Link
                  to="/extraccion/seriesly-movie"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/seriesly-movie'
                      ? 'bg-slate-50 text-slate-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Film className="h-4 w-4" />
                  Series.ly Movie
                </Link>
                <Link
                  to="/extraccion/seriesly-series"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/seriesly-series'
                      ? 'bg-slate-50 text-slate-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Series.ly Series
                </Link>
                <Link
                  to="/extraccion/animeonline-ninja"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/animeonline-ninja'
                      ? 'bg-orange-50 text-orange-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  AnimeOnlineNinja
                </Link>
                <Link
                  to="/extraccion/latinoyt-anime"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/latinoyt-anime'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Latinoyt Anime
                </Link>
                <Link
                  to="/extraccion/animegratis-net"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/animegratis-net'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  AnimeGratis.net
                </Link>
                <Link
                  to="/extraccion/anime-jl-series"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/extraccion/anime-jl-series'
                      ? 'bg-sky-50 text-sky-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Anime-JL.net Series
                </Link>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={() => setIsServidoresOpen(!isServidoresOpen)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
                isServidoresActive && !isServidoresOpen
                  ? 'text-blue-700 bg-blue-50/50'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <DownloadCloud className={`h-5 w-5 ${isServidoresActive ? 'text-blue-600' : 'text-gray-500'}`} />
                Servidores
              </div>
              {isServidoresOpen ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
            </button>

            {isServidoresOpen && (
              <div className="mt-1 ml-4 pl-4 border-l border-gray-200 space-y-1">
                <Link
                  to="/servidores/doodstream"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/servidores/doodstream'
                      ? 'bg-yellow-50 text-yellow-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  DoodStream
                </Link>
                <Link
                  to="/servidores/supervideo"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/servidores/supervideo'
                      ? 'bg-purple-50 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Supervideo
                </Link>
                <Link
                  to="/servidores/byse"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/servidores/byse'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <ListVideo className="h-4 w-4" />
                  Byse
                </Link>
                <Link
                  to="/servidores/vidara"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/servidores/vidara'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <CloudUpload className="h-4 w-4" />
                  Vidara
                </Link>
                <Link
                  to="/servidores/streamwish"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/servidores/streamwish'
                      ? 'bg-orange-50 text-orange-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Flame className="h-4 w-4" />
                  Streamwish
                </Link>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={() => setIsHerramientasOpen(!isHerramientasOpen)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
                isHerramientasActive && !isHerramientasOpen
                  ? 'text-blue-700 bg-blue-50/50'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <Wrench className={`h-5 w-5 ${isHerramientasActive ? 'text-blue-600' : 'text-gray-500'}`} />
                Herramientas
              </div>
              {isHerramientasOpen ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
            </button>

            {isHerramientasOpen && (
              <div className="mt-1 ml-4 pl-4 border-l border-gray-200 space-y-1">
                <Link
                  to="/herramientas/streamwish-mod"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/herramientas/streamwish-mod'
                      ? 'bg-orange-50 text-orange-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Flame className="h-4 w-4" />
                  Streamwish Mod
                </Link>
                <Link
                  to="/herramientas/uqload-mod"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/herramientas/uqload-mod'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Wrench className="h-4 w-4" />
                  Uqload Mod
                </Link>
                <Link
                  to="/herramientas/urls-mod"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/herramientas/urls-mod'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <LinkIcon className="h-4 w-4" />
                  URLS Mod
                </Link>
                <Link
                  to="/herramientas/dominios"
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === '/herramientas/dominios'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Globe className="h-4 w-4" />
                  Dominios
                </Link>
              </div>
            )}
          </div>
        </nav>
      </div>
    </aside>
  );
};
