import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import ProtectedRoute from "@/components/ProtectedRoute";
import RegistroDoble from "@/pages/series/RegistroDoble";
import RegistroDobleUpdate from "@/pages/series/RegistroDobleUpdate";
import RegistroDooplex from "@/pages/series/RegistroDooplex";
import RegistroDocines from "@/pages/series/RegistroDocines";
import RegistroAnime from "@/pages/series/RegistroAnime";
import UrlsAnime from "@/pages/series/UrlsAnime";
import UrlsAnimeUpdate from "@/pages/series/UrlsAnimeUpdate";
import UrlsDooplex from "@/pages/series/UrlsDooplex";
import UrlsDooplexUpdate from "@/pages/series/UrlsDooplexUpdate";
import UrlsPlusmovie from "@/pages/series/UrlsPlusmovie";
import UrlsDocines from "@/pages/series/UrlsDocines";
import UrlsDocinesUpdate from "@/pages/series/UrlsDocinesUpdate";
import RegistroMultiplePeliculas from "@/pages/movies/RegistroMultiple";
import DooplexRMovie from "@/pages/movies/DooplexRMovie";
import UrlsPlusmoviePeliculas from "@/pages/movies/UrlsPlusmovie";
import UrlsDooplexPeliculas from "@/pages/movies/UrlsDooplex";
import UrlsDocinesPeliculas from "@/pages/movies/UrlsDocines";
import ScraperGnula from "@/pages/extraccion/ScraperGnula";
import ScraperMoviesGnula from "@/pages/extraccion/ScraperMoviesGnula";
import ScraperMoviesGnulaV2 from "@/pages/extraccion/ScraperMoviesGnulaV2";
import ScraperPelisplusSeries from "@/pages/extraccion/ScraperPelisplusSeries";
import ScraperMoviesPelisplus from "@/pages/extraccion/ScraperMoviesPelisplus";
import ScraperCinemitasSeries from "@/pages/extraccion/ScraperCinemitasSeries";
import ScraperMoviesCinemitas from "@/pages/extraccion/ScraperMoviesCinemitas";
import ScraperMoviesCinemitasV2 from "@/pages/extraccion/ScraperMoviesCinemitasV2";
import ScraperCineHDPlusSeries from "@/pages/extraccion/ScraperCineHDPlusSeries";
import ScraperMoviesCineHDPlus from "@/pages/extraccion/ScraperMoviesCineHDPlus";
import ScraperAnimeOnlineNinja from "@/pages/extraccion/ScraperAnimeOnlineNinja";
import ScraperLatinoytAnime from "@/pages/extraccion/ScraperLatinoytAnime";
import ScraperAnimeGratis from "@/pages/extraccion/ScraperAnimeGratis";
import ScraperAnimeJL from "@/pages/extraccion/ScraperAnimeJL";
import DoodStream from "@/pages/servidores/DoodStream";
import Supervideo from "@/pages/servidores/Supervideo";
import Byse from "@/pages/servidores/Byse";
import Vidara from "@/pages/servidores/Vidara";
import { DashboardLayout } from "@/components/DashboardLayout";
import VersionApp from "@/pages/VersionApp";
import UqloadMod from "@/pages/herramientas/UqloadMod";
import UrlsMod from "@/pages/herramientas/UrlsMod";
import Dominios from "@/pages/herramientas/Dominios";
import StreamwishMod from "@/pages/herramientas/StreamwishMod";
import Snackbar from "@/components/Snackbar";

export default function App() {
  return (
    <Router>
      <Snackbar />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route path="/" element={<Home />} />
          <Route path="/version-app" element={<VersionApp />} />
          <Route path="/series/registro-doble" element={<RegistroDoble />} />
          <Route path="/series/registro-doble-update" element={<RegistroDobleUpdate />} />
          <Route path="/series/registro-dooplex" element={<RegistroDooplex />} />
          <Route path="/series/registro-docines" element={<RegistroDocines />} />
          <Route path="/series/registro-anime" element={<RegistroAnime />} />
          <Route path="/series/urls-anime" element={<UrlsAnime />} />
          <Route path="/series/urls-anime-update" element={<UrlsAnimeUpdate />} />
          <Route path="/series/urls-plusmovie" element={<UrlsPlusmovie />} />
          <Route path="/series/urls-dooplex" element={<UrlsDooplex />} />
          <Route path="/series/urls-dooplex-update" element={<UrlsDooplexUpdate />} />
          <Route path="/series/urls-docines" element={<UrlsDocines />} />
          <Route path="/series/urls-docines-update" element={<UrlsDocinesUpdate />} />
          <Route path="/movies/registro-multiple" element={<RegistroMultiplePeliculas />} />
          <Route path="/movies/dooplex-r-movie" element={<DooplexRMovie />} />
          <Route path="/movies/urls-plusmovie" element={<UrlsPlusmoviePeliculas />} />
          <Route path="/movies/urls-dooplex" element={<UrlsDooplexPeliculas />} />
          <Route path="/movies/urls-docines" element={<UrlsDocinesPeliculas />} />
          <Route path="/extraccion/series-gnula" element={<ScraperGnula />} />
          <Route path="/extraccion/movies-gnula" element={<ScraperMoviesGnula />} />
          <Route path="/extraccion/movies-gnula-v2" element={<ScraperMoviesGnulaV2 />} />
          <Route path="/extraccion/series-pelisplus" element={<ScraperPelisplusSeries />} />
          <Route path="/extraccion/movies-pelisplus" element={<ScraperMoviesPelisplus />} />
          <Route path="/extraccion/series-cinemitas" element={<ScraperCinemitasSeries />} />
          <Route path="/extraccion/movies-cinemitas" element={<ScraperMoviesCinemitas />} />
          <Route path="/extraccion/movies-cinemitas-v2" element={<ScraperMoviesCinemitasV2 />} />
          <Route path="/extraccion/series-cinehdplus" element={<ScraperCineHDPlusSeries />} />
          <Route path="/extraccion/movies-cinehdplus" element={<ScraperMoviesCineHDPlus />} />
          <Route path="/extraccion/animeonline-ninja" element={<ScraperAnimeOnlineNinja />} />
          <Route path="/extraccion/latinoyt-anime" element={<ScraperLatinoytAnime />} />
          <Route path="/extraccion/animegratis-net" element={<ScraperAnimeGratis />} />
          <Route path="/extraccion/anime-jl-series" element={<ScraperAnimeJL />} />
          <Route path="/servidores/doodstream" element={<DoodStream />} />
          <Route path="/servidores/supervideo" element={<Supervideo />} />
          <Route path="/servidores/byse" element={<Byse />} />
          <Route path="/servidores/vidara" element={<Vidara />} />
          <Route path="/servidores/streamwish" element={<StreamwishMod />} />
          <Route path="/herramientas/uqload-mod" element={<UqloadMod />} />
          <Route path="/herramientas/urls-mod" element={<UrlsMod />} />
          <Route path="/herramientas/dominios" element={<Dominios />} />
          <Route path="/herramientas/streamwish-mod" element={<StreamwishMod />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
