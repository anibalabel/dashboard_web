# Documentación: APIs de Películas

Este documento describe el funcionamiento y los endpoints disponibles en las APIs REST para las bases de datos de películas `PlusMovie` y `Dooplex` y `Docines`.

---

## 0. API: Dashboard
**Archivo:** `dashboard.php`
**Base de datos:** `db_docines`, `db_plusmovie`, `db_dooplex`

Devuelve conteos para mostrar en el dashboard.
- **Método:** `GET`
- **Endpoint:** `/dashboard.php`
- **Responde (200):**
  ```json
  {
      "success": true,
      "data": {
          "docines": {
              "series": 120,
              "movies": 540
          },
          "plusmovie": {
              "movies": 800,
              "series": 200
          },
          "dooplex": {
              "movies": 300,
              "series": 90,
              "animes": 40
          }
      }
  }
  ```

## 1. API: PlusMovie
**Archivo:** `movie_plusmovie.php`
**Base de datos:** `db_plusmovie`

Esta API gestiona los datos de la base de datos `PlusMovie`, interactuando con las tablas `videos` y `video_file`.

### Obtener título y videos_id
Busca una película por su ID de TMDB.
- **Método:** `GET`
- **Endpoint:** `/movie_plusmovie.php?tmdbid={tmdbid}`
- **Responde:** 
  Retorna el `title` y `videos_id` desde la tabla `videos`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "title": "Nombre de la película",
                "videos_id": 1
            }
        ]
    }
    ```

### Obtener archivos de video
Obtiene todos los enlaces y datos de un video según su ID de relación.
- **Método:** `GET`
- **Endpoint:** `/movie_plusmovie.php?videos_id={videos_id}`
- **Responde:** 
  Retorna `video_file_id`, `file_url`, `label`, y `order` desde la tabla `video_file`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "video_file_id": 1,
                "file_url": "https://example.com/video.mp4",
                "label": "1080p",
                "order": 1
            }
        ]
    }
    ```

### Registrar un nuevo video (POST)
Crea una nueva entrada para un archivo de video. El `stream_key` se genera automáticamente y el `id` es auto-incremental.
- **Método:** `POST`
- **Endpoint:** `/movie_plusmovie.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "videos_id": 123,
      "file_url": "https://example.com/video.mp4",
      "label": "1080p"
  }
  ```
- **Valores predeterminados (internos):** `file_source = "embed"`, `source_type = "link"`.
- **Nota sobre 'order':** La API busca los `order` existentes por `videos_id` y asigna el **primer número faltante** en la secuencia (1, 2, 3...). Ejemplo: si existen `[1, 2, 4]` asigna `3`.
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Registrado correctamente",
        "data": {
            "video_file_id": "457",
            "stream_key": "a1b2c3d4e5f6",
            "order": 1
        }
    }
    ```

### Actualizar un video (PUT / POST)
Actualiza un registro existente mediante su ID único.
- **Método:** `PUT` (o `POST` enviando el parámetro `video_file_id`)
- **Endpoint:** `/movie_plusmovie.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "video_file_id": 456,
      "file_url": "https://example.com/newvideo.mkv",
      "label": "4K",
      "order": 1
  }
  ```

### Eliminar un video (DELETE)
Borra un archivo de video del sistema.
- **Método:** `DELETE`
- **Endpoint:** `/movie_plusmovie.php?video_file_id={video_file_id}`
- **Cuerpo alternativo (JSON):** `{"video_file_id": 456}`
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Eliminado correctamente"
    }
    ```

### Login admin (POST)
Valida credenciales contra la tabla `user` de `db_plusmovie`. Solo permite acceso cuando `role` es `admin`.
- **Método:** `POST`
- **Endpoint:** `/login_plusmovie.php`
- **Cuerpo (JSON por stream):**
  ```json
  {
      "email": "admin@demo.com",
      "password": "123456"
  }
  ```
- **Comparación interna:** Se compara `email`, `password` (MD5) y `role` = `admin`.
- **Responde (200):**
  ```json
  {
      "success": true,
      "message": "Login correcto",
      "data": {
          "username": "admin",
          "role": "admin"
      }
  }
  ```
- **Responde (401):**
  ```json
  {
      "success": false,
      "error": "Credenciales inválidas o sin permisos"
  }
  ```

---

## 2. API: Dooplex
**Archivo:** `movie_dooplex.php`
**Base de datos:** `db_dooplex`

Esta API atiende a los enlaces de películas en la base de datos `Dooplex`, consultando e insertando en las tablas `movies` y `movie_videos`.

### Obtener ID y Título
Busca una película por su ID de TMDB.
- **Método:** `GET`
- **Endpoint:** `/movie_dooplex.php?tmdb_id={tmdb_id}`
- **Responde:** 
  Retorna `id` y `title` desde la tabla `movies`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 1,
                "title": "Nombre de la película"
            }
        ]
    }
    ```

### Obtener videos y enlaces
Recupera los datos de los diferentes servidores donde está alojada la película.
- **Método:** `GET`
- **Endpoint:** `/movie_dooplex.php?movie_id={movie_id}`
- **Responde:** 
  Retorna `id`, `server`, `header`, `link`, `lang`, `embed`, `youtubelink`, `hls`, `supported_hosts` desde la tabla `movie_videos`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 5,
                "server": "Mega",
                "header": "AuthToken123",
                "link": "https://mega.nz/file/...",
                "lang": "Latino",
                "embed": 1,
                "youtubelink": "",
                "hls": 0,
                "supported_hosts": ""
            }
        ]
    }
    ```

### Registrar un enlace de video (POST)
Añade un nuevo servidor o enlace a la base de datos de videos. Las fechas `created_at` y `updated_at` se autogeneran e insertan con la fecha/hora en que se realiza la petición.
- **Método:** `POST`
- **Endpoint:** `/movie_dooplex.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "movie_id": 12,
      "server": "Mega",
      "header": "AuthToken123",
      "link": "https://mega.nz/file/...",
      "lang": "Latino",
      "embed": 1,
      "youtubelink": "",
      "hls": 0,
      "supported_hosts": ""
  }
  ```
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Registrado correctamente",
        "data": {
            "id": "10",
            "created_at": "2026-03-15 10:00:00",
            "updated_at": "2026-03-15 10:00:00"
        }
    }
    ```

### Actualizar registro de video (PUT / POST)
Modifica los datos de un servidor existente. Envía únicamente los campos que deseas actualizar. El campo `updated_at` siempre se regenerará automáticamente reflejando la fecha del cambio.
- **Método:** `PUT` (o `POST` con el parámetro `id` obligatorio).
- **Endpoint:** `/movie_dooplex.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "id": 99,
      "server": "Mediafire",
      "header": "AuthToken123",
      "link": "https://mediafire.com/file/...",
      "lang": "Subtitulado",
      "embed": 1,
      "youtubelink": "",
      "hls": 0,
      "supported_hosts": ""
  }
  ```
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Actualizado correctamente",
        "updated_at": "2026-03-15 10:05:00"
    }
    ```

### Eliminar un video (DELETE)
Elimina un enlace en específico.
- **Método:** `DELETE`
- **Endpoint:** `/movie_dooplex.php?id={id}`
- **Cuerpo alternativo (JSON):** `{"id": 99}`
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Eliminado correctamente"
    }
    ```

### Anime (Dooplex)
**Archivo:** `anime_dooplex.php`
**Base de datos:** `db_dooplex`

#### Obtener anime por TMDB
- **Método:** `GET`
- **Endpoint:** `/anime_dooplex.php?tmdb_id={tmdb_id}`
- **Responde:** Retorna `id` y `name` desde la tabla `animes`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 1,
                "name": "Nombre del anime"
            }
        ]
    }
    ```

#### Obtener temporadas del anime
- **Método:** `GET`
- **Endpoint:** `/anime_dooplex.php?anime_id={anime_id}`
- **Responde:** Retorna los registros desde la tabla `anime_seasons`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 1,
                "anime_id": 1,
                "season_number": 1,
                "name": "Temporada 1"
            }
        ]
    }
    ```

#### Obtener episodios de una temporada
- **Método:** `GET`
- **Endpoint:** `/anime_dooplex.php?anime_season_id={anime_season_id}`
- **Responde:** Retorna `id`, `episode_number`, `name` desde la tabla `anime_episodes`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 10,
                "episode_number": 1,
                "name": "Episodio 1"
            }
        ]
    }
    ```

#### Actualizar episodio (PUT / POST)
Actualiza campos del episodio en la tabla `anime_episodes` por `id`, usando el parámetro `anime_episodes_id` para evitar conflicto con el `id` de `anime_videos`.
- **Método:** `PUT` (o `POST` enviando el parámetro `anime_episodes_id`)
- **Endpoint:** `/anime_dooplex.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "anime_episodes_id": 10,
      "name": "Episodio 1 (Editado)",
      "overview": "Descripción del episodio",
      "still_path": "/still_path.jpg",
      "still_path_tv": "/still_path_tv.jpg"
  }
  ```
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Actualizado correctamente"
    }
    ```

#### Obtener videos del episodio
- **Método:** `GET`
- **Endpoint:** `/anime_dooplex.php?anime_episode_id={anime_episode_id}`
- **Responde:** Retorna `id`, `server`, `header`, `link`, `lang` desde la tabla `anime_videos`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 5,
                "server": "Mega",
                "header": "AuthToken123",
                "link": "https://mega.nz/file/...",
                "lang": "Latino"
            }
        ]
    }
    ```

#### Registrar video del episodio (POST)
- **Método:** `POST`
- **Endpoint:** `/anime_dooplex.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "anime_episode_id": 55,
      "server": "Mega",
      "header": "AuthToken123",
      "link": "https://mega.nz/file/...",
      "lang": "Latino"
  }
  ```
- **Valores predeterminados (internos):** `embed = 1`.
- **Autogenerado:** `created_at`, `updated_at` con formato `YYYY-MM-DD HH:MM:SS`.
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Registrado correctamente",
        "data": {
            "id": "10",
            "created_at": "2025-08-13 18:05:04",
            "updated_at": "2025-08-13 18:05:04"
        }
    }
    ```

#### Actualizar video del episodio (PUT / POST)
- **Método:** `PUT` (o `POST` con el parámetro `id` obligatorio).
- **Endpoint:** `/anime_dooplex.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "id": 99,
      "anime_episode_id": 55,
      "server": "Mediafire",
      "header": "AuthToken123",
      "link": "https://mediafire.com/file/...",
      "lang": "Subtitulado"
  }
  ```
- **Autogenerado:** `updated_at` con formato `YYYY-MM-DD HH:MM:SS`.
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Actualizado correctamente",
        "updated_at": "2025-08-13 18:05:04"
    }
    ```

#### Eliminar video del episodio (DELETE)
- **Método:** `DELETE`
- **Endpoint:** `/anime_dooplex.php?id={id}`
- **Cuerpo alternativo (JSON):** `{"id": 99}`
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Eliminado correctamente"
    }
    ```

---

## 3. API: Docines
**Archivo:** `movie_docines.php`
**Base de datos:** `db_docines`

Esta API atiende a la información de películas y enlaces para `Docines`, usando las tablas `movies` y `movie_play_links`.

### Obtener ID y Nombre Original de TMDB
Busca una película por su ID de TMDB.
- **Método:** `GET`
- **Endpoint:** `/movie_docines.php?tmdbid={tmdbid}`
- **Responde:** 
  Retorna `id` y `name` desde la tabla `movies`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 1,
                "name": "Nombre original de la película"
            }
        ]
    }
    ```

### Obtener enlaces de reproducción de la película
Recupera los enlaces relacionados a una película.
- **Método:** `GET`
- **Endpoint:** `/movie_docines.php?movie_id={movie_id}`
- **Responde:** 
  Retorna `id`, `name`, `url`, `quality` y `link_order` desde la tabla `movie_play_links`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 20,
                "name": "Latino HD",
                "url": "https://example.com/video.mp4",
                "quality": "1080p",
                "link_order": 1
            }
        ]
    }
    ```

### Actualizar nombre de película (PUT / POST)
Actualiza el campo `name` de la tabla `movies` por `id` (sin conflicto con el `id` de `movie_play_links`).
- **Método:** `PUT` (o `POST` enviando el parámetro `movies_id`)
- **Endpoint:** `/movie_docines.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "movies_id": 12,
      "movie_name": "Nuevo nombre de la película"
  }
  ```
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Actualizado correctamente"
    }
    ```

### Registrar un enlace de video (POST)
Crea un nuevo registro de un enlace de video en la tabla `movie_play_links` aplicando automáticamente valores predeterminados para `type`, `status`, `skip_available` y `link_type`.
- **Método:** `POST`
- **Endpoint:** `/movie_docines.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "movie_id": 12,
      "name": "Latino HD",
      "quality": "1080p",
      "url": "https://example.com/video.mp4"
  }
  ```
- **Generación de 'link_order':** Al enviar el registro, la API ignorará cualquier `link_order` enviado. Buscará los `link_order` existentes para ese `movie_id` y asignará el **primer número faltante** en la secuencia (1, 2, 3...). Ejemplo: si existen `[1, 2, 4]` asigna `3`.
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Registrado correctamente",
        "data": {
            "id": "21",
            "link_order": 2
        }
    }
    ```

### Actualizar registro de un enlace (PUT / POST)
Modifica dinámicamente campos enviados por ID ignorando datos nulos, por lo que solamente se alteran los campos válidamente proporcionados (`name`, `url`, `link_order`, `quality`).
- **Método:** `PUT` (o `POST` con el parámetro `id` obligatorio).
- **Endpoint:** `/movie_docines.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "id": 85,
      "name": "Servidor 1",
      "link_order": 3,
      "quality": "1080p",
      "url": "https://example.com/updated_video.mp4"
  }
  ```
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Actualizado correctamente"
    }
    ```

### Eliminar un enlace de video (DELETE)
Borra permanentemente un enlace desde la Base de Datos.
- **Método:** `DELETE`
- **Endpoint:** `/movie_docines.php?id={id}`
- **Cuerpo alternativo (JSON):** `{"id": 85}`
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Eliminado correctamente"
    }
    ```

---

## 4. API: Series PlusMovie
**Archivo:** `series_plusmovie.php`
**Base de datos:** `db_plusmovie`

Esta API gestiona los datos de series para la base de datos `PlusMovie`, interactuando con las tablas `videos`, `seasons` y `episodes`.

### Obtener título y videos_id
Busca una serie por su ID de TMDB.
- **Método:** `GET`
- **Endpoint:** `/series_plusmovie.php?tmdbid={tmdbid}`
- **Responde:** 
  Retorna `videos_id` y `title` desde la tabla `videos`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "videos_id": 1,
                "title": "Nombre de la Serie"
            }
        ]
    }
    ```

### Obtener videos_id por title
Busca una serie por su título (búsqueda parcial).
- **Método:** `GET`
- **Endpoint:** `/series_plusmovie.php?title={title}`
- **Responde:** 
  Retorna `videos_id` y `title` (además de `tmdbid`) desde la tabla `videos`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "videos_id": 1,
                "title": "Nombre de la Serie",
                "tmdbid": 12345
            }
        ]
    }
    ```

### Obtener datos de la serie por videos_id
Obtiene `title`, `videos_id` y `tmdbid` desde la tabla `videos` buscando por `videos_id`.
- **Método:** `GET`
- **Endpoint:** `/series_plusmovie.php?videos_info_id={videos_id}`
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "videos_id": 1,
                "title": "Nombre de la Serie",
                "tmdbid": 12345
            }
        ]
    }
    ```

### Obtener temporadas
Obtiene todas las temporadas de una serie según su ID de relación.
- **Método:** `GET`
- **Endpoint:** `/series_plusmovie.php?videos_id={videos_id}`
- **Responde:** 
  Retorna `seasons_id`, `seasons_name`, y `order` desde la tabla `seasons`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "seasons_id": 4,
                "seasons_name": "Temporada 1",
                "order": 1
            }
        ]
    }
    ```

### Obtener episodios
Obtiene todos los episodios de una temporada según su ID de relación.
- **Método:** `GET`
- **Endpoint:** `/series_plusmovie.php?seasons_id={seasons_id}`
- **Responde:** 
  Retorna `episodes_id`, `episodes_name`, `file_url`, y `order` desde la tabla `episodes`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "episodes_id": 456,
                "episodes_name": "Episodio 1",
                "file_url": "https://example.com/episode.mp4",
                "order": 1
            }
        ]
    }
    ```

### Registrar un nuevo episodio (POST)
Crea una nueva entrada para un episodio. El `stream_key`, `date_added` y `last_ep_added` se generan automáticamente. El `id` es auto-incremental.
- **Método:** `POST`
- **Endpoint:** `/series_plusmovie.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "videos_id": 123,
      "seasons_id": 4,
      "episodes_name": "Episodio 1",
      "file_source": "Source Name",
      "source_type": "mp4",
      "file_url": "https://example.com/episode.mp4",
      "order": 1
  }
  ```
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Registrado correctamente",
        "data": {
            "episodes_id": "457",
            "stream_key": "a1b2c3d4e5f6",
            "date_added": "2026-03-14 22:30:00"
        }
    }
    ```

### Actualizar un episodio (PUT / POST)
Actualiza los datos de un episodio existente mediante su ID único. Las fechas de `last_ep_added` se modifican y devuelven en la respuesta.
- **Método:** `PUT` (o `POST` enviando el parámetro `episodes_id`)
- **Endpoint:** `/series_plusmovie.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "episodes_id": 456,
      "episodes_name": "Nuevo Nombre del Episodio",
      "file_url": "https://example.com/newvideo.mp4",
      "order": 2
  }
  ```
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Actualizado correctamente",
        "last_ep_added": "2026-03-14 22:35:00"
    }
    ```

### Actualizar serie (videos) (PUT / POST) Actualiza el TMDBID y el Título de una Serie
Actualiza `title` y `tmdbid` en la tabla `videos` por `videos_id`.
- **Método:** `PUT` (o `POST` enviando el parámetro `videos_id`)
- **Endpoint:** `/series_plusmovie.php`
- **Requeridos:** `videos_id`, `title`, `tmdbid`.
- **Cuerpo (JSON o Form):**
  ```json
  {
      "videos_id": 1,
      "title": "Nuevo Título",
      "tmdbid": 12345
  }
  ```
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Actualizado correctamente"
    }
    ```

### Eliminar un episodio (DELETE)
Borra un episodio del sistema mediante su ID.
- **Método:** `DELETE`
- **Endpoint:** `/series_plusmovie.php?episodes_id={episodes_id}`
- **Cuerpo alternativo (JSON):** `{"episodes_id": 456}`
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Eliminado correctamente"
    }
    ```

---

## 5. API: Series Dooplex
**Archivo:** `series_dooplex.php`
**Base de datos:** `db_dooplex`

Esta API atiende a los enlaces de series en la base de datos `Dooplex`, consultando e insertando en las tablas `series`, `seasons`, `episodes` y `serie_videos`.

### Obtener ID y Nombre de Serie
Busca una serie por su ID de TMDB.
- **Método:** `GET`
- **Endpoint:** `/series_dooplex.php?tmdb_id={tmdb_id}`
- **Responde:** 
  Retorna `id` y `name` desde la tabla `series`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 1,
                "name": "Nombre de la Serie"
            }
        ]
    }
    ```

### Obtener Temporadas
Recupera las temporadas relacionadas a una serie.
- **Método:** `GET`
- **Endpoint:** `/series_dooplex.php?serie_id={serie_id}`
- **Responde:** 
  Retorna `id`, `season_number` y `name` desde la tabla `seasons`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 10,
                "season_number": 1,
                "name": "Temporada 1"
            }
        ]
    }
    ```

### Obtener Episodios
Recupera los episodios relacionados a una temporada.
- **Método:** `GET`
- **Endpoint:** `/series_dooplex.php?season_id={season_id}`
- **Responde:** 
  Retorna `id`, `episode_number` y `name` desde la tabla `episodes`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 25,
                "episode_number": 1,
                "name": "Piloto"
            }
        ]
    }
    ```

### Actualizar episodio (PUT / POST)
Actualiza campos del episodio en la tabla `episodes` por `id`, usando el parámetro `episodes_id` para evitar conflicto con el `id` de `serie_videos`.
- **Método:** `PUT` (o `POST` enviando el parámetro `episodes_id`)
- **Endpoint:** `/series_dooplex.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "episodes_id": 25,
      "name": "Piloto (Editado)",
      "overview": "Descripción del episodio",
      "still_path": "/still_path.jpg",
      "still_path_tv": "/still_path_tv.jpg"
  }
  ```
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Actualizado correctamente"
    }
    ```
- **Anime:** Para actualizar `anime_episodes`, usa `/anime_dooplex.php` con `anime_episodes_id` (misma estructura de campos).

### Obtener Videos de un Episodio
Recupera los enlaces relacionados a un episodio.
- **Método:** `GET`
- **Endpoint:** `/series_dooplex.php?episode_id={episode_id}`
- **Responde:** 
  Retorna `id`, `server`, `header`, `link`, `lang`, `embed`, `youtubelink`, `hls`, `supported_hosts` desde la tabla `serie_videos`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 85,
                "server": "Mega",
                "header": "AuthToken",
                "link": "https://mega.nz/file/...",
                "lang": "Latino",
                "embed": 1,
                "youtubelink": "",
                "hls": 0,
                "supported_hosts": ""
            }
        ]
    }
    ```

### Registrar un enlace de video (POST)
Añade un nuevo servidor o enlace a la base de datos de videos de una serie. Las fechas `created_at` y `updated_at` se autogeneran e insertan con la fecha/hora en que se realiza la petición.
- **Método:** `POST`
- **Endpoint:** `/series_dooplex.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "episode_id": 25,
      "server": "Mediafire",
      "header": "",
      "link": "https://mediafire.com/file/...",
      "lang": "Inglés",
      "embed": 1,
      "youtubelink": "",
      "hls": 0,
      "supported_hosts": ""
  }
  ```
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Registrado correctamente",
        "data": {
            "id": "86",
            "created_at": "2026-03-14 22:45:00",
            "updated_at": "2026-03-14 22:45:00"
        }
    }
    ```

### Actualizar registro de video (PUT / POST)
Modifica los datos de un servidor existente omitiendo enviar información indeseada o nulos. El campo `updated_at` siempre se regenerará automáticamente reflejando la fecha del cambio.
- **Método:** `PUT` (o `POST` con el parámetro `id` obligatorio).
- **Endpoint:** `/series_dooplex.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "id": 86,
      "link": "https://mediafire.com/file/new_link...",
      "embed": 1,
      "youtubelink": "",
      "hls": 0,
      "supported_hosts": ""
  }
  ```
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Actualizado correctamente",
        "updated_at": "2026-03-14 22:50:00"
    }
    ```

### Eliminar un video (DELETE)
Borra un enlace en específico usando su ID único.
- **Método:** `DELETE`
- **Endpoint:** `/series_dooplex.php?id={id}`
- **Cuerpo alternativo (JSON):** `{"id": 86}`
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Eliminado correctamente"
    }
    ```

---

## 6. API: Series Docines
**Archivo:** `series_docines.php`
**Base de datos:** `db_docines`

Esta API atiende a los enlaces de series en la base de datos `Docines`, consultando e insertando en las tablas `web_series`, `web_series_seasons`, `web_series_episoade` y `episode_play_links`.

### Obtener ID y Nombre de Serie
Busca una serie por su ID de TMDB.
- **Método:** `GET`
- **Endpoint:** `/series_docines.php?tmdbid={tmdbid}`
- **Responde:** 
  Retorna `id` y `name` desde la tabla `web_series`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 1,
                "name": "Nombre de la Serie"
            }
        ]
    }
    ```

### Obtener Temporadas
Recupera las temporadas relacionadas a una serie.
- **Método:** `GET`
- **Endpoint:** `/series_docines.php?web_series_id={web_series_id}`
- **Responde:** 
  Retorna `id`, `Session_Name` y `season_order` desde la tabla `web_series_seasons`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 10,
                "Session_Name": "Temporada 1",
                "season_order": 1
            }
        ]
    }
    ```

### Obtener Episodios
Recupera los episodios relacionados a una temporada.
- **Método:** `GET`
- **Endpoint:** `/series_docines.php?season_id={season_id}`
- **Responde:** 
  Retorna `id`, `Episoade_Name` y `episoade_order` desde la tabla `web_series_episoade`.
  Ordena por `episoade_order`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 25,
                "Episoade_Name": "Piloto",
                "episoade_order": 1
            }
        ]
    }
    ```

### Actualizar episodio (web_series_episoade) (PUT / POST)
Actualiza campos del episodio en la tabla `web_series_episoade` por `id`, usando el parámetro `web_series_episoade_id` para evitar conflicto con el `id` de `episode_play_links`.
- **Método:** `PUT` (o `POST` enviando el parámetro `web_series_episoade_id`)
- **Endpoint:** `/series_docines.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "web_series_episoade_id": 25,
      "Episoade_Name": "Piloto (Editado)",
      "episoade_image": "https://example.com/episode.jpg",
      "episoade_description": "Descripción del episodio"
  }
  ```
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Actualizado correctamente"
    }
    ```

### Obtener Videos de un Episodio
Recupera los enlaces relacionados a un episodio.
- **Método:** `GET`
- **Endpoint:** `/series_docines.php?episode_id={episode_id}`
- **Responde:** 
  Retorna `id`, `name`, `url` y `quality` desde la tabla `episode_play_links`.
  - **Ejemplo de Respuesta:**
    ```json
    {
        "data": [
            {
                "id": 85,
                "name": "Latino HD",
                "url": "https://example.com/video.mp4",
                "quality": "1080p"
            }
        ]
    }
    ```

### Registrar un enlace de video (POST)
Crea un nuevo registro de un enlace de video en la tabla `episode_play_links` aplicando automáticamente valores predeterminados para `type`, `status`, `skip_available` y `link_type`. Además de ordernar calculando la cantidad de un mismo episodio.
- **Método:** `POST`
- **Endpoint:** `/series_docines.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "episode_id": 25,
      "name": "Latino HD",
      "url": "https://example.com/video.mp4",
      "quality": "1080p"
  }
  ```
- **Generación de 'link_order':** Al enviar el registro, la API calculará la cantidad de links asociados a este `episode_id` en la tabla `episode_play_links` y sumará 1.
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Registrado correctamente",
        "data": {
            "id": "86",
            "link_order": 2
        }
    }
    ```

### Actualizar registro de video (PUT / POST)
Modifica los datos de un enlace existente. Únicamente altera los campos proporcionados (`name`, `url`, `quality`).
- **Método:** `PUT` (o `POST` con el parámetro `id` obligatorio).
- **Endpoint:** `/series_docines.php`
- **Cuerpo (JSON o Form):**
  ```json
  {
      "id": 86,
      "name": "Nuevo Servidor",
      "url": "https://mediafire.com/file/new_link...",
      "quality": "720p"
  }
  ```
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Actualizado correctamente"
    }
    ```

### Eliminar un video (DELETE)
Borra un enlace en específico usando su ID único.
- **Método:** `DELETE`
- **Endpoint:** `/series_docines.php?id={id}`
- **Cuerpo alternativo (JSON):** `{"id": 86}`
- **Responde:**
  - **Ejemplo de Respuesta:**
    ```json
    {
        "message": "Eliminado correctamente"
    }
    ```
