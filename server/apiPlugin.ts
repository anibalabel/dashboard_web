import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import type { Plugin } from 'vite';

// ============================================================================
// Conexiones integradas a las bases de datos MySQL (Dooplex, Docines, PlusMovie)
// ============================================================================

const dooplexPool: Pool = mysql.createPool({
  host: process.env.DOOPLEX_DB_HOST || 'mysql.us.cloudlogin.co',
  port: Number(process.env.DOOPLEX_DB_PORT || 3306),
  user: process.env.DOOPLEX_DB_USER || 'plusmovie_st',
  password: process.env.DOOPLEX_DB_PASSWORD || '5083038xS/@',
  database: process.env.DOOPLEX_DB_NAME || 'plusmovie_st',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const docinesPool: Pool = mysql.createPool({
  host: process.env.DOCINES_DB_HOST || 'mysql.us.cloudlogin.co',
  port: Number(process.env.DOCINES_DB_PORT || 3306),
  user: process.env.DOCINES_DB_USER || 'plusmovie_do',
  password: process.env.DOCINES_DB_PASSWORD || '5083038xS/@',
  database: process.env.DOCINES_DB_NAME || 'plusmovie_do',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

const plusmoviePool: Pool = mysql.createPool({
  host: process.env.PLUSMOVIE_DB_HOST || 'mysql.us.cloudlogin.co',
  port: Number(process.env.PLUSMOVIE_DB_PORT || 3306),
  user: process.env.PLUSMOVIE_DB_USER || 'plusmpzj_docines',
  password: process.env.PLUSMOVIE_DB_PASSWORD || '5083038xS/@',
  database: process.env.PLUSMOVIE_DB_NAME || 'plusmpzj_docines',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

function generateStreamKey(length = 12): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let key = '';
  for (let i = 0; i < length; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

function verifyPassword(plain: string, storedHash: string): boolean {
  if (!storedHash) return false;
  // Laravel / PHP $2y$ bcrypt compatibility with bcryptjs ($2a$ / $2b$)
  if (storedHash.startsWith('$2y$') || storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    const normalized = storedHash.replace(/^\$2y\$/, '$2a$');
    try {
      if (bcrypt.compareSync(plain, normalized)) return true;
    } catch {
      // ignore
    }
  }
  if (storedHash.toLowerCase() === md5(plain).toLowerCase()) return true;
  if (storedHash === plain) return true;
  return false;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With, X-Proxy-Headers, X-Proxy-Cookies'
  );
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          resolve(parsed as Record<string, any>);
          return;
        }
      } catch {
        // Fallback to URLSearchParams (application/x-www-form-urlencoded)
      }
      const params = new URLSearchParams(raw);
      const obj: Record<string, any> = {};
      for (const [k, v] of params.entries()) {
        obj[k] = v;
      }
      resolve(obj);
    });
    req.on('error', () => resolve({}));
  });
}

// ============================================================================
// 1. /login_dooplex.php
// ============================================================================
async function handleLoginDooplex(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { success: false, error: 'Método no permitido' });
    return;
  }

  const input = await readBody(req);
  const email = input.email ? String(input.email).trim() : '';
  const password = input.password ? String(input.password) : '';

  if (!email || !password) {
    sendJson(res, 400, { success: false, error: 'Faltan parámetros (email, password)' });
    return;
  }

  try {
    const [rows] = await dooplexPool.query<RowDataPacket[]>(
      'SELECT * FROM `users` WHERE `email` = ? LIMIT 1',
      [email]
    );
    const user = rows[0];

    if (!user) {
      sendJson(res, 401, { success: false, error: 'Credenciales inválidas' });
      return;
    }

    const storedPassword = String(user.password ?? '');
    if (!verifyPassword(password, storedPassword)) {
      sendJson(res, 401, { success: false, error: 'Credenciales inválidas' });
      return;
    }

    const role = user.role ?? (user.premuim !== undefined ? (user.premuim ? 'premium' : 'user') : 'admin');
    const username = user.name ?? user.username ?? email;

    sendJson(res, 200, {
      success: true,
      message: 'Login correcto',
      data: {
        username,
        role,
      },
    });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: 'Error al procesar el login: ' + (err?.message || String(err)) });
  }
}

// ============================================================================
// 2. /dashboard.php
// ============================================================================
async function handleDashboard(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { success: false, error: 'Método no permitido' });
    return;
  }

  try {
    const [[moviesRow]] = await dooplexPool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM movies');
    const [[seriesRow]] = await dooplexPool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM series');
    const [[animesRow]] = await dooplexPool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM animes');

    sendJson(res, 200, {
      success: true,
      data: {
        dooplex: {
          movies: Number(moviesRow?.total ?? 0),
          series: Number(seriesRow?.total ?? 0),
          animes: Number(animesRow?.total ?? 0),
        },
      },
    });
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: 'Error al obtener conteos del dashboard: ' + (err?.message || String(err)),
    });
  }
}

// ============================================================================
// 3. /movie_dooplex.php
// ============================================================================
async function handleMovieDooplex(req: IncomingMessage, res: ServerResponse, query: URLSearchParams): Promise<void> {
  const method = req.method || 'GET';

  try {
    if (method === 'GET') {
      const tmdbId = query.get('tmdb_id');
      const movieId = query.get('movie_id');

      if (tmdbId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, tmdb_id, title, poster_path, backdrop_path FROM movies WHERE tmdb_id = ?',
          [tmdbId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (movieId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, movie_id, server, link, lang, hd, status FROM movie_videos WHERE movie_id = ?',
          [movieId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else {
        sendJson(res, 400, { success: false, error: 'Parámetro requerido: tmdb_id o movie_id' });
      }
      return;
    }

    if (method === 'POST') {
      const input = await readBody(req);
      if (input.id !== undefined) {
        // Actualizar registro en movie_videos
        await updateMovieDooplexVideo(res, input);
        return;
      }

      if (
        input.movie_id === undefined ||
        input.server === undefined ||
        input.link === undefined ||
        input.lang === undefined
      ) {
        sendJson(res, 400, {
          success: false,
          error: 'Faltan parámetros requeridos (movie_id, server, link, lang)',
        });
        return;
      }

      const hd = input.hd !== undefined ? input.hd : 1;
      const status = input.status !== undefined ? input.status : 1;

      const [result] = await dooplexPool.execute<ResultSetHeader>(
        'INSERT INTO movie_videos (movie_id, server, link, lang, hd, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [input.movie_id, input.server, input.link, input.lang, hd, status]
      );

      sendJson(res, 200, {
        success: true,
        message: 'Video de película insertado correctamente en Dooplex',
        id: String(result.insertId),
      });
      return;
    }

    if (method === 'PUT') {
      const input = await readBody(req);
      await updateMovieDooplexVideo(res, input);
      return;
    }

    if (method === 'DELETE') {
      let id = query.get('id');
      if (!id) {
        const input = await readBody(req);
        if (input.id !== undefined) id = String(input.id);
      }

      if (!id) {
        sendJson(res, 400, { success: false, error: 'Se requiere el parámetro id para eliminar' });
        return;
      }

      const [result] = await dooplexPool.execute<ResultSetHeader>('DELETE FROM movie_videos WHERE id = ?', [id]);
      if (result.affectedRows > 0) {
        sendJson(res, 200, { success: true, message: 'Video eliminado correctamente de Dooplex' });
      } else {
        sendJson(res, 404, { success: false, error: 'No se encontró el video con el id proporcionado' });
      }
      return;
    }

    sendJson(res, 405, { success: false, error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: 'Error en movie_dooplex: ' + (err?.message || String(err)) });
  }
}

async function updateMovieDooplexVideo(res: ServerResponse, input: Record<string, any>): Promise<void> {
  if (input.id === undefined) {
    sendJson(res, 400, { success: false, error: 'Se requiere el parámetro id para actualizar' });
    return;
  }

  const fields: string[] = [];
  const values: any[] = [];

  if (input.server !== undefined) {
    fields.push('server = ?');
    values.push(input.server);
  }
  if (input.link !== undefined) {
    fields.push('link = ?');
    values.push(input.link);
  }
  if (input.lang !== undefined) {
    fields.push('lang = ?');
    values.push(input.lang);
  }
  if (input.hd !== undefined) {
    fields.push('hd = ?');
    values.push(input.hd);
  }
  if (input.status !== undefined) {
    fields.push('status = ?');
    values.push(input.status);
  }

  if (fields.length === 0) {
    sendJson(res, 400, {
      success: false,
      error: 'No se proporcionaron campos para actualizar (server, link, lang, hd, status)',
    });
    return;
  }

  fields.push('updated_at = NOW()');
  values.push(input.id);

  await dooplexPool.execute(
    `UPDATE movie_videos SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  sendJson(res, 200, { success: true, message: 'Video actualizado correctamente en Dooplex' });
}

// ============================================================================
// 4. /series_dooplex.php
// ============================================================================
async function handleSeriesDooplex(req: IncomingMessage, res: ServerResponse, query: URLSearchParams): Promise<void> {
  const method = req.method || 'GET';

  try {
    if (method === 'GET') {
      const tmdbId = query.get('tmdb_id');
      const serieId = query.get('serie_id');
      const seasonId = query.get('season_id');
      const episodeId = query.get('episode_id');

      if (tmdbId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, tmdb_id, name, poster_path, backdrop_path, newEpisodes FROM series WHERE tmdb_id = ?',
          [tmdbId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (serieId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, tmdb_id, serie_id, name, season_number FROM seasons WHERE serie_id = ? ORDER BY season_number ASC',
          [serieId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (seasonId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, tmdb_id, season_id, name, episode_number, still_path FROM episodes WHERE season_id = ? ORDER BY episode_number ASC',
          [seasonId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (episodeId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, episode_id, server, link, lang, hd FROM serie_videos WHERE episode_id = ?',
          [episodeId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else {
        sendJson(res, 400, {
          success: false,
          error: 'Parámetro requerido: tmdb_id, serie_id, season_id o episode_id',
        });
      }
      return;
    }

    if (method === 'POST') {
      const input = await readBody(req);
      if (input.episodes_id !== undefined || input.id !== undefined) {
        await updateSeriesDooplexRecord(res, input);
        return;
      }

      if (
        input.episode_id === undefined ||
        input.server === undefined ||
        input.link === undefined ||
        input.lang === undefined ||
        input.hd === undefined
      ) {
        sendJson(res, 400, {
          success: false,
          error: 'Faltan parámetros requeridos (episode_id, server, link, lang, hd)',
        });
        return;
      }

      const [result] = await dooplexPool.execute<ResultSetHeader>(
        'INSERT INTO serie_videos (episode_id, server, link, lang, hd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
        [input.episode_id, input.server, input.link, input.lang, input.hd]
      );

      sendJson(res, 200, {
        success: true,
        message: 'Video insertado correctamente en Dooplex',
        id: String(result.insertId),
      });
      return;
    }

    if (method === 'PUT') {
      const input = await readBody(req);
      await updateSeriesDooplexRecord(res, input);
      return;
    }

    if (method === 'DELETE') {
      let id = query.get('id');
      if (!id) {
        const input = await readBody(req);
        if (input.id !== undefined) id = String(input.id);
      }

      if (!id) {
        sendJson(res, 400, { success: false, error: 'Se requiere el parámetro id para eliminar' });
        return;
      }

      const [result] = await dooplexPool.execute<ResultSetHeader>('DELETE FROM serie_videos WHERE id = ?', [id]);
      if (result.affectedRows > 0) {
        sendJson(res, 200, { success: true, message: 'Video eliminado correctamente de Dooplex' });
      } else {
        sendJson(res, 404, { success: false, error: 'No se encontró el video con el id proporcionado' });
      }
      return;
    }

    sendJson(res, 405, { success: false, error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: 'Error en series_dooplex: ' + (err?.message || String(err)) });
  }
}

async function updateSeriesDooplexRecord(res: ServerResponse, input: Record<string, any>): Promise<void> {
  if (input.episodes_id !== undefined) {
    const fields: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) {
      fields.push('name = ?');
      values.push(input.name);
    }
    if (input.overview !== undefined) {
      fields.push('overview = ?');
      values.push(input.overview);
    }
    if (input.still_path !== undefined) {
      fields.push('still_path = ?');
      values.push(input.still_path);
    }

    if (fields.length === 0) {
      sendJson(res, 400, {
        success: false,
        error: 'No se proporcionaron campos para actualizar en episodes (name, overview, still_path)',
      });
      return;
    }

    fields.push('updated_at = NOW()');
    values.push(input.episodes_id);

    await dooplexPool.execute(`UPDATE episodes SET ${fields.join(', ')} WHERE id = ?`, values);
    sendJson(res, 200, { success: true, message: 'Episodio actualizado correctamente en Dooplex' });
    return;
  }

  if (input.id !== undefined) {
    const fields: string[] = [];
    const values: any[] = [];

    if (input.server !== undefined) {
      fields.push('server = ?');
      values.push(input.server);
    }
    if (input.link !== undefined) {
      fields.push('link = ?');
      values.push(input.link);
    }
    if (input.lang !== undefined) {
      fields.push('lang = ?');
      values.push(input.lang);
    }
    if (input.hd !== undefined) {
      fields.push('hd = ?');
      values.push(input.hd);
    }

    if (fields.length === 0) {
      sendJson(res, 400, {
        success: false,
        error: 'No se proporcionaron campos para actualizar en serie_videos (server, link, lang, hd)',
      });
      return;
    }

    fields.push('updated_at = NOW()');
    values.push(input.id);

    await dooplexPool.execute(`UPDATE serie_videos SET ${fields.join(', ')} WHERE id = ?`, values);
    sendJson(res, 200, { success: true, message: 'Video actualizado correctamente en Dooplex' });
    return;
  }

  sendJson(res, 400, {
    success: false,
    error: 'Se requiere el parámetro episodes_id (para episodios) o id (para serie_videos) para actualizar',
  });
}

// ============================================================================
// 5. /anime_dooplex.php
// ============================================================================
async function handleAnimeDooplex(req: IncomingMessage, res: ServerResponse, query: URLSearchParams): Promise<void> {
  const method = req.method || 'GET';

  try {
    if (method === 'GET') {
      const tmdbId = query.get('tmdb_id');
      const animeId = query.get('anime_id');
      const animeSeasonId = query.get('anime_season_id');
      const animeEpisodeId = query.get('anime_episode_id');

      if (tmdbId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, tmdb_id, name, poster_path, backdrop_path, newEpisodes FROM animes WHERE tmdb_id = ?',
          [tmdbId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (animeId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, tmdb_id, anime_id, name, season_number FROM anime_seasons WHERE anime_id = ? ORDER BY season_number ASC',
          [animeId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (animeSeasonId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, tmdb_id, anime_season_id, name, episode_number, still_path FROM anime_episodes WHERE anime_season_id = ? ORDER BY episode_number ASC',
          [animeSeasonId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (animeEpisodeId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, anime_episode_id, server, link, lang, hd FROM anime_videos WHERE anime_episode_id = ?',
          [animeEpisodeId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else {
        sendJson(res, 400, {
          success: false,
          error: 'Parámetro requerido: tmdb_id, anime_id, anime_season_id o anime_episode_id',
        });
      }
      return;
    }

    if (method === 'POST') {
      const input = await readBody(req);
      if (input.anime_episodes_id !== undefined || input.id !== undefined) {
        await updateAnimeDooplexRecord(res, input);
        return;
      }

      if (
        input.anime_episode_id === undefined ||
        input.server === undefined ||
        input.link === undefined ||
        input.lang === undefined ||
        input.hd === undefined
      ) {
        sendJson(res, 400, {
          success: false,
          error: 'Faltan parámetros requeridos (anime_episode_id, server, link, lang, hd)',
        });
        return;
      }

      const [result] = await dooplexPool.execute<ResultSetHeader>(
        'INSERT INTO anime_videos (anime_episode_id, server, link, lang, hd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
        [input.anime_episode_id, input.server, input.link, input.lang, input.hd]
      );

      sendJson(res, 200, {
        success: true,
        message: 'Video insertado correctamente en Anime Dooplex',
        id: String(result.insertId),
      });
      return;
    }

    if (method === 'PUT') {
      const input = await readBody(req);
      await updateAnimeDooplexRecord(res, input);
      return;
    }

    if (method === 'DELETE') {
      let id = query.get('id');
      if (!id) {
        const input = await readBody(req);
        if (input.id !== undefined) id = String(input.id);
      }

      if (!id) {
        sendJson(res, 400, { success: false, error: 'Se requiere el parámetro id para eliminar' });
        return;
      }

      const [result] = await dooplexPool.execute<ResultSetHeader>('DELETE FROM anime_videos WHERE id = ?', [id]);
      if (result.affectedRows > 0) {
        sendJson(res, 200, { success: true, message: 'Video eliminado correctamente de Anime Dooplex' });
      } else {
        sendJson(res, 404, { success: false, error: 'No se encontró el video con el id proporcionado' });
      }
      return;
    }

    sendJson(res, 405, { success: false, error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: 'Error en anime_dooplex: ' + (err?.message || String(err)) });
  }
}

async function updateAnimeDooplexRecord(res: ServerResponse, input: Record<string, any>): Promise<void> {
  if (input.anime_episodes_id !== undefined) {
    const fields: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) {
      fields.push('name = ?');
      values.push(input.name);
    }
    if (input.overview !== undefined) {
      fields.push('overview = ?');
      values.push(input.overview);
    }
    if (input.still_path !== undefined) {
      fields.push('still_path = ?');
      values.push(input.still_path);
    }

    if (fields.length === 0) {
      sendJson(res, 400, {
        success: false,
        error: 'No se proporcionaron campos para actualizar en anime_episodes (name, overview, still_path)',
      });
      return;
    }

    fields.push('updated_at = NOW()');
    values.push(input.anime_episodes_id);

    await dooplexPool.execute(`UPDATE anime_episodes SET ${fields.join(', ')} WHERE id = ?`, values);
    sendJson(res, 200, { success: true, message: 'Episodio de anime actualizado correctamente en Dooplex' });
    return;
  }

  if (input.id !== undefined) {
    const fields: string[] = [];
    const values: any[] = [];

    if (input.server !== undefined) {
      fields.push('server = ?');
      values.push(input.server);
    }
    if (input.link !== undefined) {
      fields.push('link = ?');
      values.push(input.link);
    }
    if (input.lang !== undefined) {
      fields.push('lang = ?');
      values.push(input.lang);
    }
    if (input.hd !== undefined) {
      fields.push('hd = ?');
      values.push(input.hd);
    }

    if (fields.length === 0) {
      sendJson(res, 400, {
        success: false,
        error: 'No se proporcionaron campos para actualizar en anime_videos (server, link, lang, hd)',
      });
      return;
    }

    fields.push('updated_at = NOW()');
    values.push(input.id);

    await dooplexPool.execute(`UPDATE anime_videos SET ${fields.join(', ')} WHERE id = ?`, values);
    sendJson(res, 200, { success: true, message: 'Video de anime actualizado correctamente en Dooplex' });
    return;
  }

  sendJson(res, 400, {
    success: false,
    error: 'Se requiere el parámetro anime_episodes_id (para episodios) o id (para anime_videos) para actualizar',
  });
}

// ============================================================================
// 6. /movie_docines.php & /series_docines.php
// ============================================================================
async function handleMovieDocines(req: IncomingMessage, res: ServerResponse, query: URLSearchParams): Promise<void> {
  const method = req.method || 'GET';

  try {
    if (method === 'GET') {
      const tmdbid = query.get('tmdbid');
      const movieId = query.get('movie_id');

      if (tmdbid) {
        const [rows] = await docinesPool.query<RowDataPacket[]>(
          'SELECT id, TMDB_ID, name, description, genres, release_date, runtime, poster, banner, youtube_trailer, downloadable, type, status, content_type FROM movies WHERE TMDB_ID = ?',
          [tmdbid]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (movieId) {
        const [rows] = await docinesPool.query<RowDataPacket[]>(
          'SELECT id, name, size, quality, link_order, movie_id, url, type, status, skip_available, intro_start, intro_end, end_credits_marker, link_type, drm_uuid, drm_license_uri FROM movie_play_links WHERE movie_id = ? ORDER BY link_order ASC',
          [movieId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else {
        sendJson(res, 400, { success: false, error: 'Parámetro requerido: tmdbid o movie_id' });
      }
      return;
    }

    if (method === 'POST') {
      const input = await readBody(req);
      if (input.id !== undefined || input.movies_id !== undefined) {
        await updateMovieDocinesRecord(res, input);
        return;
      }

      if (
        input.name === undefined ||
        input.quality === undefined ||
        input.movie_id === undefined ||
        input.url === undefined ||
        input.type === undefined
      ) {
        sendJson(res, 400, {
          success: false,
          error: 'Faltan parámetros requeridos (name, quality, movie_id, url, type)',
        });
        return;
      }

      const [maxRows] = await docinesPool.query<RowDataPacket[]>(
        'SELECT COALESCE(MAX(link_order), 0) + 1 AS next_order FROM movie_play_links WHERE movie_id = ?',
        [input.movie_id]
      );
      const linkOrder = Number(maxRows[0]?.next_order ?? 1);
      const size = input.size !== undefined ? input.size : '1080P';
      const status = input.status !== undefined ? input.status : 1;
      const skipAvailable = input.skip_available !== undefined ? input.skip_available : 0;
      const introStart = input.intro_start !== undefined ? input.intro_start : '0';
      const introEnd = input.intro_end !== undefined ? input.intro_end : '0';
      const endCreditsMarker = input.end_credits_marker !== undefined ? input.end_credits_marker : '0';
      const linkType = input.link_type !== undefined ? input.link_type : 0;
      const drmUuid = input.drm_uuid !== undefined ? input.drm_uuid : '';
      const drmLicenseUri = input.drm_license_uri !== undefined ? input.drm_license_uri : '';

      const [result] = await docinesPool.execute<ResultSetHeader>(
        'INSERT INTO movie_play_links (name, size, quality, link_order, movie_id, url, type, status, skip_available, intro_start, intro_end, end_credits_marker, link_type, drm_uuid, drm_license_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          input.name,
          size,
          input.quality,
          linkOrder,
          input.movie_id,
          input.url,
          input.type,
          status,
          skipAvailable,
          introStart,
          introEnd,
          endCreditsMarker,
          linkType,
          drmUuid,
          drmLicenseUri,
        ]
      );

      sendJson(res, 200, {
        success: true,
        message: 'Enlace de película insertado correctamente en Docines',
        id: String(result.insertId),
        link_order: linkOrder,
      });
      return;
    }

    if (method === 'PUT') {
      const input = await readBody(req);
      await updateMovieDocinesRecord(res, input);
      return;
    }

    if (method === 'DELETE') {
      let id = query.get('id');
      if (!id) {
        const input = await readBody(req);
        if (input.id !== undefined) id = String(input.id);
      }

      if (!id) {
        sendJson(res, 400, { success: false, error: 'Se requiere el parámetro id para eliminar' });
        return;
      }

      const [result] = await docinesPool.execute<ResultSetHeader>('DELETE FROM movie_play_links WHERE id = ?', [id]);
      if (result.affectedRows > 0) {
        sendJson(res, 200, { success: true, message: 'Enlace eliminado correctamente de Docines' });
      } else {
        sendJson(res, 404, { success: false, error: 'No se encontró el enlace con el id proporcionado' });
      }
      return;
    }

    sendJson(res, 405, { success: false, error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: 'Error en movie_docines: ' + (err?.message || String(err)) });
  }
}

async function updateMovieDocinesRecord(res: ServerResponse, input: Record<string, any>): Promise<void> {
  if (input.movies_id !== undefined) {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = [
      'name',
      'description',
      'genres',
      'release_date',
      'runtime',
      'poster',
      'banner',
      'youtube_trailer',
      'downloadable',
      'type',
      'status',
      'content_type',
    ];
    for (const k of allowed) {
      if (input[k] !== undefined) {
        fields.push(`${k} = ?`);
        values.push(input[k]);
      }
    }
    if (fields.length === 0) {
      sendJson(res, 400, { success: false, error: 'No se proporcionaron campos para actualizar en movies' });
      return;
    }
    values.push(input.movies_id);
    await docinesPool.execute(`UPDATE movies SET ${fields.join(', ')} WHERE id = ?`, values);
    sendJson(res, 200, { success: true, message: 'Película actualizada correctamente en Docines' });
    return;
  }

  if (input.id !== undefined) {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['name', 'size', 'quality', 'link_order', 'url', 'type', 'status', 'skip_available', 'link_type'];
    for (const k of allowed) {
      if (input[k] !== undefined) {
        fields.push(`${k} = ?`);
        values.push(input[k]);
      }
    }
    if (fields.length === 0) {
      sendJson(res, 400, { success: false, error: 'No se proporcionaron campos para actualizar en movie_play_links' });
      return;
    }
    values.push(input.id);
    await docinesPool.execute(`UPDATE movie_play_links SET ${fields.join(', ')} WHERE id = ?`, values);
    sendJson(res, 200, { success: true, message: 'Enlace actualizado correctamente en Docines' });
    return;
  }

  sendJson(res, 400, {
    success: false,
    error: 'Se requiere el parámetro movies_id o id para actualizar',
  });
}

async function handleSeriesDocines(req: IncomingMessage, res: ServerResponse, query: URLSearchParams): Promise<void> {
  const method = req.method || 'GET';

  try {
    if (method === 'GET') {
      const tmdbid = query.get('tmdbid');
      const webSeriesId = query.get('web_series_id');
      const seasonId = query.get('season_id');
      const episodeId = query.get('episode_id');

      if (tmdbid) {
        const [rows] = await docinesPool.query<RowDataPacket[]>(
          'SELECT id, TMDB_ID, name, poster, banner FROM web_series WHERE TMDB_ID = ?',
          [tmdbid]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (webSeriesId) {
        const [rows] = await docinesPool.query<RowDataPacket[]>(
          'SELECT id, Session_Name, session_order, web_series_id FROM web_series_seasons WHERE web_series_id = ? ORDER BY session_order ASC',
          [webSeriesId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (seasonId) {
        const [rows] = await docinesPool.query<RowDataPacket[]>(
          'SELECT id, Episoade_Name, episoade_image, episoade_description, episoade_order, season_id, downloadable, type, status, source, url, skip_available, intro_start, intro_end, end_credits_marker, drm_uuid, drm_license_uri FROM web_series_episoade WHERE season_id = ? ORDER BY episoade_order ASC',
          [seasonId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (episodeId) {
        const [rows] = await docinesPool.query<RowDataPacket[]>(
          'SELECT id, name, size, quality, link_order, episode_id, url, type, status, skip_available, intro_start, intro_end, end_credits_marker, link_type, drm_uuid, drm_license_uri FROM episode_play_links WHERE episode_id = ? ORDER BY link_order ASC',
          [episodeId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else {
        sendJson(res, 400, {
          success: false,
          error: 'Parámetro requerido: tmdbid, web_series_id, season_id o episode_id',
        });
      }
      return;
    }

    if (method === 'POST') {
      const input = await readBody(req);
      if (input.episodes_id !== undefined || input.id !== undefined) {
        await updateSeriesDocinesRecord(res, input);
        return;
      }

      if (
        input.name === undefined ||
        input.quality === undefined ||
        input.episode_id === undefined ||
        input.url === undefined ||
        input.type === undefined
      ) {
        sendJson(res, 400, {
          success: false,
          error: 'Faltan parámetros requeridos (name, quality, episode_id, url, type)',
        });
        return;
      }

      const [maxRows] = await docinesPool.query<RowDataPacket[]>(
        'SELECT COALESCE(MAX(link_order), 0) + 1 AS next_order FROM episode_play_links WHERE episode_id = ?',
        [input.episode_id]
      );
      const linkOrder = Number(maxRows[0]?.next_order ?? 1);
      const size = input.size !== undefined ? input.size : '1080P';
      const status = input.status !== undefined ? input.status : '1';
      const skipAvailable = input.skip_available !== undefined ? input.skip_available : 0;
      const introStart = input.intro_start !== undefined ? input.intro_start : '';
      const introEnd = input.intro_end !== undefined ? input.intro_end : '';
      const endCreditsMarker = input.end_credits_marker !== undefined ? input.end_credits_marker : '0';
      const linkType = input.link_type !== undefined ? input.link_type : 0;
      const drmUuid = input.drm_uuid !== undefined ? input.drm_uuid : '';
      const drmLicenseUri = input.drm_license_uri !== undefined ? input.drm_license_uri : '';

      const [result] = await docinesPool.execute<ResultSetHeader>(
        'INSERT INTO episode_play_links (name, size, quality, link_order, episode_id, url, type, status, skip_available, intro_start, intro_end, end_credits_marker, link_type, drm_uuid, drm_license_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          input.name,
          size,
          input.quality,
          linkOrder,
          input.episode_id,
          input.url,
          input.type,
          status,
          skipAvailable,
          introStart,
          introEnd,
          endCreditsMarker,
          linkType,
          drmUuid,
          drmLicenseUri,
        ]
      );

      sendJson(res, 200, {
        success: true,
        message: 'Enlace insertado correctamente en Docines',
        id: String(result.insertId),
        link_order: linkOrder,
      });
      return;
    }

    if (method === 'PUT') {
      const input = await readBody(req);
      await updateSeriesDocinesRecord(res, input);
      return;
    }

    if (method === 'DELETE') {
      let id = query.get('id');
      if (!id) {
        const input = await readBody(req);
        if (input.id !== undefined) id = String(input.id);
      }

      if (!id) {
        sendJson(res, 400, { success: false, error: 'Se requiere el parámetro id para eliminar' });
        return;
      }

      const [result] = await docinesPool.execute<ResultSetHeader>('DELETE FROM episode_play_links WHERE id = ?', [id]);
      if (result.affectedRows > 0) {
        sendJson(res, 200, { success: true, message: 'Enlace eliminado correctamente de Docines' });
      } else {
        sendJson(res, 404, { success: false, error: 'No se encontró el enlace con el id proporcionado' });
      }
      return;
    }

    sendJson(res, 405, { success: false, error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: 'Error en series_docines: ' + (err?.message || String(err)) });
  }
}

async function updateSeriesDocinesRecord(res: ServerResponse, input: Record<string, any>): Promise<void> {
  if (input.episodes_id !== undefined) {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = [
      'Episoade_Name',
      'episoade_image',
      'episoade_description',
      'episoade_order',
      'downloadable',
      'type',
      'status',
      'source',
      'url',
    ];
    for (const k of allowed) {
      if (input[k] !== undefined) {
        fields.push(`${k} = ?`);
        values.push(input[k]);
      }
    }
    if (fields.length === 0) {
      sendJson(res, 400, {
        success: false,
        error: 'No se proporcionaron campos para actualizar en web_series_episoade',
      });
      return;
    }
    values.push(input.episodes_id);
    await docinesPool.execute(`UPDATE web_series_episoade SET ${fields.join(', ')} WHERE id = ?`, values);
    sendJson(res, 200, { success: true, message: 'Episodio actualizado correctamente en Docines' });
    return;
  }

  if (input.id !== undefined) {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['name', 'size', 'quality', 'link_order', 'url', 'type', 'status', 'skip_available', 'link_type'];
    for (const k of allowed) {
      if (input[k] !== undefined) {
        fields.push(`${k} = ?`);
        values.push(input[k]);
      }
    }
    if (fields.length === 0) {
      sendJson(res, 400, {
        success: false,
        error: 'No se proporcionaron campos para actualizar en episode_play_links',
      });
      return;
    }
    values.push(input.id);
    await docinesPool.execute(`UPDATE episode_play_links SET ${fields.join(', ')} WHERE id = ?`, values);
    sendJson(res, 200, { success: true, message: 'Enlace actualizado correctamente en Docines' });
    return;
  }

  sendJson(res, 400, {
    success: false,
    error: 'Se requiere el parámetro episodes_id o id para actualizar',
  });
}

// ============================================================================
// 7. /movie_plusmovie.php, /series_plusmovie.php & /login_plusmovie.php
// ============================================================================
async function handleMoviePlusmovie(req: IncomingMessage, res: ServerResponse, query: URLSearchParams): Promise<void> {
  const method = req.method || 'GET';

  try {
    if (method === 'GET') {
      const tmdbid = query.get('tmdbid');
      const videosId = query.get('videos_id');

      if (tmdbid) {
        const [rows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT videos_id, tmdbid, title, description, slug, release, runtime, video_quality, thumbnail_url, poster_url FROM videos WHERE tmdbid = ? AND is_tvseries = 0',
          [tmdbid]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (videosId) {
        const [rows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT video_file_id, stream_key, videos_id, file_source, source_type, file_url, label, `order` FROM video_file WHERE videos_id = ? ORDER BY `order` ASC',
          [videosId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else {
        sendJson(res, 400, { success: false, error: 'Parámetro requerido: tmdbid o videos_id' });
      }
      return;
    }

    if (method === 'POST') {
      const input = await readBody(req);
      if (input.video_file_id !== undefined) {
        await updateMoviePlusmovieRecord(res, input);
        return;
      }

      if (
        input.videos_id === undefined ||
        input.file_source === undefined ||
        input.source_type === undefined ||
        input.file_url === undefined ||
        input.label === undefined
      ) {
        sendJson(res, 400, {
          success: false,
          error: 'Faltan parámetros requeridos (videos_id, file_source, source_type, file_url, label)',
        });
        return;
      }

      const streamKey = generateStreamKey(12);
      const order = input.order !== undefined ? input.order : 0;

      const [result] = await plusmoviePool.execute<ResultSetHeader>(
        'INSERT INTO video_file (stream_key, videos_id, file_source, source_type, file_url, label, `order`) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [streamKey, input.videos_id, input.file_source, input.source_type, input.file_url, input.label, order]
      );

      sendJson(res, 200, {
        success: true,
        message: 'Archivo de video insertado correctamente en PlusMovie',
        id: String(result.insertId),
        stream_key: streamKey,
      });
      return;
    }

    if (method === 'PUT') {
      const input = await readBody(req);
      await updateMoviePlusmovieRecord(res, input);
      return;
    }

    if (method === 'DELETE') {
      let videoFileId = query.get('video_file_id');
      if (!videoFileId) {
        const input = await readBody(req);
        if (input.video_file_id !== undefined) videoFileId = String(input.video_file_id);
      }

      if (!videoFileId) {
        sendJson(res, 400, { success: false, error: 'Se requiere el parámetro video_file_id para eliminar' });
        return;
      }

      const [result] = await plusmoviePool.execute<ResultSetHeader>(
        'DELETE FROM video_file WHERE video_file_id = ?',
        [videoFileId]
      );
      if (result.affectedRows > 0) {
        sendJson(res, 200, { success: true, message: 'Archivo de video eliminado correctamente de PlusMovie' });
      } else {
        sendJson(res, 404, { success: false, error: 'No se encontró el archivo con el id proporcionado' });
      }
      return;
    }

    sendJson(res, 405, { success: false, error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: 'Error en movie_plusmovie: ' + (err?.message || String(err)) });
  }
}

async function updateMoviePlusmovieRecord(res: ServerResponse, input: Record<string, any>): Promise<void> {
  if (input.video_file_id === undefined) {
    sendJson(res, 400, { success: false, error: 'Se requiere video_file_id para actualizar' });
    return;
  }

  const fields: string[] = [];
  const values: any[] = [];
  if (input.file_source !== undefined) {
    fields.push('file_source = ?');
    values.push(input.file_source);
  }
  if (input.source_type !== undefined) {
    fields.push('source_type = ?');
    values.push(input.source_type);
  }
  if (input.file_url !== undefined) {
    fields.push('file_url = ?');
    values.push(input.file_url);
  }
  if (input.label !== undefined) {
    fields.push('label = ?');
    values.push(input.label);
  }
  if (input.order !== undefined) {
    fields.push('`order` = ?');
    values.push(input.order);
  }

  if (fields.length === 0) {
    sendJson(res, 400, { success: false, error: 'No se proporcionaron campos para actualizar en video_file' });
    return;
  }

  values.push(input.video_file_id);
  await plusmoviePool.execute(`UPDATE video_file SET ${fields.join(', ')} WHERE video_file_id = ?`, values);
  sendJson(res, 200, { success: true, message: 'Archivo de video actualizado correctamente en PlusMovie' });
}

async function handleSeriesPlusmovie(req: IncomingMessage, res: ServerResponse, query: URLSearchParams): Promise<void> {
  const method = req.method || 'GET';

  try {
    if (method === 'GET') {
      const tmdbid = query.get('tmdbid');
      const title = query.get('title');
      const videosInfoId = query.get('videos_info_id');
      const videosId = query.get('videos_id');
      const seasonsId = query.get('seasons_id');

      if (tmdbid) {
        const [rows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT videos_id, tmdbid, title, thumbnail_url, poster_url FROM videos WHERE tmdbid = ?',
          [tmdbid]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (title) {
        const [rows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT videos_id, tmdbid, title, description, slug, release, runtime, video_quality, thumbnail_url, poster_url FROM videos WHERE title LIKE ? LIMIT 50',
          [`%${title}%`]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (videosInfoId) {
        const [rows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT videos_id, tmdbid, title, description, slug, release, runtime, video_quality, thumbnail_url, poster_url FROM videos WHERE videos_id = ?',
          [videosInfoId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (videosId) {
        const [rows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT seasons_id, videos_id, seasons_name, `order` FROM seasons WHERE videos_id = ? ORDER BY `order` ASC',
          [videosId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else if (seasonsId) {
        const [rows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT episodes_id, stream_key, videos_id, seasons_id, episodes_name, file_source, source_type, file_url, `order`, date_added, last_ep_added, image_url FROM episodes WHERE seasons_id = ? ORDER BY `order` ASC',
          [seasonsId]
        );
        sendJson(res, 200, { success: true, data: rows, count: rows.length });
      } else {
        sendJson(res, 400, {
          success: false,
          error: 'Parámetro requerido: tmdbid, title, videos_info_id, videos_id o seasons_id',
        });
      }
      return;
    }

    if (method === 'POST') {
      const input = await readBody(req);
      if (input.episodes_id !== undefined || input.videos_id_update !== undefined) {
        await updateSeriesPlusmovieRecord(res, input);
        return;
      }

      if (
        input.videos_id === undefined ||
        input.seasons_id === undefined ||
        input.episodes_name === undefined ||
        input.file_source === undefined ||
        input.source_type === undefined ||
        input.file_url === undefined ||
        input.order === undefined ||
        input.image_url === undefined
      ) {
        sendJson(res, 400, {
          success: false,
          error:
            'Faltan parámetros requeridos (videos_id, seasons_id, episodes_name, file_source, source_type, file_url, order, image_url)',
        });
        return;
      }

      const streamKey = generateStreamKey(12);
      const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const [result] = await plusmoviePool.execute<ResultSetHeader>(
        'INSERT INTO episodes (stream_key, videos_id, seasons_id, episodes_name, file_source, source_type, file_url, `order`, date_added, last_ep_added, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          streamKey,
          input.videos_id,
          input.seasons_id,
          input.episodes_name,
          input.file_source,
          input.source_type,
          input.file_url,
          input.order,
          nowStr,
          nowStr,
          input.image_url,
        ]
      );

      sendJson(res, 200, {
        success: true,
        message: 'Episodio insertado correctamente en PlusMovie',
        id: String(result.insertId),
        stream_key: streamKey,
      });
      return;
    }

    if (method === 'PUT') {
      const input = await readBody(req);
      await updateSeriesPlusmovieRecord(res, input);
      return;
    }

    if (method === 'DELETE') {
      let episodesId = query.get('episodes_id');
      if (!episodesId) {
        const input = await readBody(req);
        if (input.episodes_id !== undefined) episodesId = String(input.episodes_id);
      }

      if (!episodesId) {
        sendJson(res, 400, { success: false, error: 'Se requiere el parámetro episodes_id para eliminar' });
        return;
      }

      const [result] = await plusmoviePool.execute<ResultSetHeader>('DELETE FROM episodes WHERE episodes_id = ?', [
        episodesId,
      ]);
      if (result.affectedRows > 0) {
        sendJson(res, 200, { success: true, message: 'Episodio eliminado correctamente de PlusMovie' });
      } else {
        sendJson(res, 404, { success: false, error: 'No se encontró el episodio con el id proporcionado' });
      }
      return;
    }

    sendJson(res, 405, { success: false, error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: 'Error en series_plusmovie: ' + (err?.message || String(err)) });
  }
}

async function updateSeriesPlusmovieRecord(res: ServerResponse, input: Record<string, any>): Promise<void> {
  if (input.videos_id_update !== undefined) {
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = [
      'tmdbid',
      'title',
      'description',
      'slug',
      'release',
      'runtime',
      'video_quality',
      'thumbnail_url',
      'poster_url',
    ];
    for (const k of allowed) {
      if (input[k] !== undefined) {
        fields.push(`\`${k}\` = ?`);
        values.push(input[k]);
      }
    }
    if (fields.length === 0) {
      sendJson(res, 400, { success: false, error: 'No se proporcionaron campos para actualizar en videos' });
      return;
    }
    values.push(input.videos_id_update);
    await plusmoviePool.execute(`UPDATE videos SET ${fields.join(', ')} WHERE videos_id = ?`, values);
    sendJson(res, 200, { success: true, message: 'Serie/Película actualizada correctamente en PlusMovie' });
    return;
  }

  if (input.episodes_id !== undefined) {
    const fields: string[] = [];
    const values: any[] = [];
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (input.episodes_name !== undefined) {
      fields.push('episodes_name = ?');
      values.push(input.episodes_name);
    }
    if (input.file_source !== undefined) {
      fields.push('file_source = ?');
      values.push(input.file_source);
    }
    if (input.source_type !== undefined) {
      fields.push('source_type = ?');
      values.push(input.source_type);
    }
    if (input.file_url !== undefined) {
      fields.push('file_url = ?');
      values.push(input.file_url);
    }
    if (input.order !== undefined) {
      fields.push('`order` = ?');
      values.push(input.order);
    }
    if (input.image_url !== undefined) {
      fields.push('image_url = ?');
      values.push(input.image_url);
    }

    fields.push('last_ep_added = ?');
    values.push(nowStr);
    values.push(input.episodes_id);

    await plusmoviePool.execute(`UPDATE episodes SET ${fields.join(', ')} WHERE episodes_id = ?`, values);
    sendJson(res, 200, {
      success: true,
      message: 'Episodio actualizado correctamente en PlusMovie',
      data: { last_ep_added: nowStr },
    });
    return;
  }

  sendJson(res, 400, { success: false, error: 'Se requiere episodes_id o videos_id_update para actualizar' });
}

async function handleLoginPlusmovie(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { success: false, error: 'Método no permitido' });
    return;
  }

  const input = await readBody(req);
  const email = input.email ? String(input.email).trim() : '';
  const password = input.password ? String(input.password) : '';

  if (!email || !password) {
    sendJson(res, 400, { success: false, error: 'Faltan parámetros (email, password)' });
    return;
  }

  try {
    const [rows] = await plusmoviePool.query<RowDataPacket[]>(
      'SELECT username, role FROM `user` WHERE email = ? AND password = ? AND role = ? LIMIT 1',
      [email, md5(password), 'admin']
    );
    const user = rows[0];
    if (!user) {
      sendJson(res, 401, { success: false, error: 'Credenciales inválidas o sin permisos' });
      return;
    }

    sendJson(res, 200, {
      success: true,
      message: 'Login correcto',
      data: {
        username: user.username,
        role: user.role,
      },
    });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: 'Error al procesar el login: ' + (err?.message || String(err)) });
  }
}

// ============================================================================
// 8. /update_version.php
// ============================================================================
async function handleUpdateVersion(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { success: false, error: 'Método no permitido' });
    return;
  }

  const input = await readBody(req);
  if (!input || typeof input.latestVersionCode !== 'number') {
    sendJson(res, 400, { success: false, error: 'JSON inválido' });
    return;
  }

  try {
    const publicFile = path.resolve(process.cwd(), 'public', 'v-streamnexus.json');
    fs.writeFileSync(publicFile, JSON.stringify(input, null, 2), 'utf-8');
    sendJson(res, 200, { success: true });
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: 'No se pudo escribir v-streamnexus.json: ' + (err?.message || String(err)),
    });
  }
}

// ============================================================================
// Vite Plugin Export
// ============================================================================
export function integratedApiPlugin(): Plugin {
  const attachMiddleware = (middlewares: any) => {
    middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (!req.url) return next();

      const parsedUrl = new URL(req.url, 'http://localhost');
      const pathname = parsedUrl.pathname;

      const handledRoutes = new Set([
        '/login_dooplex.php',
        '/dashboard.php',
        '/movie_dooplex.php',
        '/series_dooplex.php',
        '/anime_dooplex.php',
        '/movie_docines.php',
        '/series_docines.php',
        '/movie_plusmovie.php',
        '/series_plusmovie.php',
        '/login_plusmovie.php',
        '/update_version.php',
      ]);

      if (!handledRoutes.has(pathname)) {
        return next();
      }

      if (req.method === 'OPTIONS') {
        sendJson(res, 200, { ok: true });
        return;
      }

      switch (pathname) {
        case '/login_dooplex.php':
          await handleLoginDooplex(req, res);
          return;
        case '/dashboard.php':
          await handleDashboard(req, res);
          return;
        case '/movie_dooplex.php':
          await handleMovieDooplex(req, res, parsedUrl.searchParams);
          return;
        case '/series_dooplex.php':
          await handleSeriesDooplex(req, res, parsedUrl.searchParams);
          return;
        case '/anime_dooplex.php':
          await handleAnimeDooplex(req, res, parsedUrl.searchParams);
          return;
        case '/movie_docines.php':
          await handleMovieDocines(req, res, parsedUrl.searchParams);
          return;
        case '/series_docines.php':
          await handleSeriesDocines(req, res, parsedUrl.searchParams);
          return;
        case '/movie_plusmovie.php':
          await handleMoviePlusmovie(req, res, parsedUrl.searchParams);
          return;
        case '/series_plusmovie.php':
          await handleSeriesPlusmovie(req, res, parsedUrl.searchParams);
          return;
        case '/login_plusmovie.php':
          await handleLoginPlusmovie(req, res);
          return;
        case '/update_version.php':
          await handleUpdateVersion(req, res);
          return;
        default:
          next();
      }
    });
  };

  return {
    name: 'integrated-dooplex-api',
    async buildStart() {
      try {
        const { build } = await import('esbuild');
        await build({
          entryPoints: [path.resolve(process.cwd(), 'server', 'cloudflareWorker.ts')],
          bundle: true,
          format: 'esm',
          target: 'es2022',
          platform: 'browser',
          external: ['cloudflare:sockets'],
          outfile: path.resolve(process.cwd(), 'public', '_worker.js'),
        });
      } catch (err) {
        console.warn('No se pudo regenerar public/_worker.js automáticamente:', err);
      }
    },
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}

