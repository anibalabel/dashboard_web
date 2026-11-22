import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import type { Plugin } from 'vite';
import {
  buildDuplicateResponse,
  computeNextMissingOrder,
  findDuplicateUrlRow,
  trimNullableUrl,
} from './duplicateCheck';

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

function nowDatetime(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

function verifyPassword(plain: string, storedHash: string): boolean {
  if (!storedHash) return false;
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
        // Fallback to URLSearchParams
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
// 3. /movie_dooplex.php (con header, embed, youtubelink, hls, supported_hosts)
// ============================================================================
async function handleMovieDooplex(req: IncomingMessage, res: ServerResponse, query: URLSearchParams): Promise<void> {
  const method = req.method || 'GET';

  try {
    if (method === 'GET') {
      const tmdbId = query.get('tmdb_id');
      const movieId = query.get('movie_id');

      if (tmdbId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, title FROM movies WHERE tmdb_id = ?',
          [tmdbId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else if (movieId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, server, header, link, lang, embed, youtubelink, hls, supported_hosts FROM movie_videos WHERE movie_id = ?',
          [movieId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else {
        sendJson(res, 400, { error: 'Faltan parámetros (tmdb_id o movie_id)' });
      }
      return;
    }

    if (method === 'DELETE') {
      let id = query.get('id');
      if (!id) {
        const input = await readBody(req);
        if (input.id !== undefined) id = String(input.id);
      }
      if (!id) {
        sendJson(res, 400, { error: 'Falta el parámetro id para eliminar' });
        return;
      }
      await dooplexPool.execute('DELETE FROM movie_videos WHERE id = ?', [id]);
      sendJson(res, 200, { success: true, message: 'Eliminado correctamente' });
      return;
    }

    if (method === 'POST' || method === 'PUT') {
      const input = await readBody(req);
      const id = input.id ?? null;
      const currentTime = nowDatetime();

      if (method === 'PUT' || id !== null) {
        if (!id) {
          sendJson(res, 400, { error: 'Falta el parámetro id para actualizar' });
          return;
        }

        const updateFields: string[] = [];
        const values: any[] = [];

        if (input.server !== undefined && String(input.server).trim() !== '') {
          updateFields.push('server = ?');
          values.push(String(input.server).trim());
        }
        if (input.header !== undefined && String(input.header).trim() !== '') {
          updateFields.push('header = ?');
          values.push(String(input.header).trim());
        }
        if (input.link !== undefined && String(input.link).trim() !== '') {
          updateFields.push('`link` = ?');
          values.push(String(input.link).trim());
        }
        if (input.lang !== undefined && String(input.lang).trim() !== '') {
          updateFields.push('lang = ?');
          values.push(String(input.lang).trim());
        }
        if ('embed' in input) {
          updateFields.push('embed = ?');
          values.push(typeof input.embed === 'boolean' ? (input.embed ? 1 : 0) : input.embed);
        }
        if ('youtubelink' in input) {
          updateFields.push('youtubelink = ?');
          values.push(input.youtubelink);
        }
        if ('hls' in input) {
          updateFields.push('hls = ?');
          values.push(typeof input.hls === 'boolean' ? (input.hls ? 1 : 0) : input.hls);
        }
        if ('supported_hosts' in input) {
          updateFields.push('supported_hosts = ?');
          values.push(
            Array.isArray(input.supported_hosts) ? JSON.stringify(input.supported_hosts) : input.supported_hosts
          );
        }

        if (updateFields.length === 0) {
          sendJson(res, 200, { message: 'No se enviaron datos válidos para actualizar o no hubieron cambios' });
          return;
        }

        updateFields.push('updated_at = ?');
        values.push(currentTime);
        values.push(id);

        await dooplexPool.execute(`UPDATE movie_videos SET ${updateFields.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, {
          success: true,
          message: 'Actualizado correctamente',
          updated_at: currentTime,
        });
      } else {
        const movieId = input.movie_id ?? null;
        if (!movieId) {
          sendJson(res, 400, { error: 'Falta el parámetro movie_id para el registro' });
          return;
        }

        const server = input.server ?? null;
        const header = input.header ?? null;
        const link = trimNullableUrl(input.link);
        const lang = input.lang ?? null;
        const embed = typeof input.embed === 'boolean' ? (input.embed ? 1 : 0) : (input.embed ?? null);
        const youtubelink = input.youtubelink ?? null;
        const hls = typeof input.hls === 'boolean' ? (input.hls ? 1 : 0) : (input.hls ?? null);
        const supportedHosts = Array.isArray(input.supported_hosts)
          ? JSON.stringify(input.supported_hosts)
          : (input.supported_hosts ?? null);

        if (link) {
          const [existingRows] = await dooplexPool.query<RowDataPacket[]>(
            'SELECT id, `link` FROM movie_videos WHERE movie_id = ?',
            [movieId]
          );
          const duplicateRow = findDuplicateUrlRow(existingRows, 'link', link);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ id: String(duplicateRow.id) }));
            return;
          }
        }

        const [result] = await dooplexPool.execute<ResultSetHeader>(
          'INSERT INTO movie_videos (movie_id, server, header, `link`, lang, embed, youtubelink, hls, supported_hosts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [movieId, server, header, link, lang, embed, youtubelink, hls, supportedHosts, currentTime, currentTime]
        );

        sendJson(res, 200, {
          success: true,
          message: 'Registrado correctamente',
          data: {
            id: String(result.insertId),
            created_at: currentTime,
            updated_at: currentTime,
          },
        });
      }
      return;
    }

    sendJson(res, 405, { error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { error: 'Error en movie_dooplex: ' + (err?.message || String(err)) });
  }
}

// ============================================================================
// 4. /series_dooplex.php (con header, embed, youtubelink, hls, supported_hosts)
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
        const [rows] = await dooplexPool.query<RowDataPacket[]>('SELECT id, name FROM series WHERE tmdb_id = ?', [
          tmdbId,
        ]);
        sendJson(res, 200, { success: true, data: rows });
      } else if (serieId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, season_number, name FROM seasons WHERE serie_id = ?',
          [serieId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else if (seasonId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, episode_number, name FROM episodes WHERE season_id = ?',
          [seasonId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else if (episodeId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, server, header, link, lang, embed, youtubelink, hls, supported_hosts FROM serie_videos WHERE episode_id = ?',
          [episodeId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else {
        sendJson(res, 400, { error: 'Faltan parámetros (tmdb_id, serie_id, season_id o episode_id)' });
      }
      return;
    }

    if (method === 'DELETE') {
      let id = query.get('id');
      if (!id) {
        const input = await readBody(req);
        if (input.id !== undefined) id = String(input.id);
      }
      if (!id) {
        sendJson(res, 400, { error: 'Falta el parámetro id para eliminar' });
        return;
      }
      await dooplexPool.execute('DELETE FROM serie_videos WHERE id = ?', [id]);
      sendJson(res, 200, { success: true, message: 'Eliminado correctamente' });
      return;
    }

    if (method === 'POST' || method === 'PUT') {
      const input = await readBody(req);
      const id = input.id ?? null;
      const episodesId = input.episodes_id ?? null;
      const currentTime = nowDatetime();

      if (episodesId !== null) {
        if (!episodesId) {
          sendJson(res, 400, { error: 'Falta el parámetro episodes_id para actualizar' });
          return;
        }
        const updateFields: string[] = [];
        const values: any[] = [];
        for (const k of ['name', 'overview', 'still_path', 'still_path_tv']) {
          if (input[k] !== undefined && input[k] !== null && String(input[k]).trim() !== '') {
            updateFields.push(`${k} = ?`);
            values.push(input[k]);
          }
        }
        if (updateFields.length === 0) {
          sendJson(res, 200, { message: 'No hay datos válidos para actualizar' });
          return;
        }
        values.push(episodesId);
        await dooplexPool.execute(`UPDATE episodes SET ${updateFields.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, { success: true, message: 'Actualizado correctamente' });
      } else if (method === 'PUT' || id !== null) {
        if (!id) {
          sendJson(res, 400, { error: 'Falta el parámetro id para actualizar' });
          return;
        }

        const updateFields: string[] = [];
        const values: any[] = [];

        if (input.server !== undefined && String(input.server).trim() !== '') {
          updateFields.push('server = ?');
          values.push(String(input.server).trim());
        }
        if (input.header !== undefined && String(input.header).trim() !== '') {
          updateFields.push('header = ?');
          values.push(String(input.header).trim());
        }
        if (input.link !== undefined && String(input.link).trim() !== '') {
          updateFields.push('`link` = ?');
          values.push(String(input.link).trim());
        }
        if (input.lang !== undefined && String(input.lang).trim() !== '') {
          updateFields.push('lang = ?');
          values.push(String(input.lang).trim());
        }
        if ('embed' in input) {
          updateFields.push('embed = ?');
          values.push(typeof input.embed === 'boolean' ? (input.embed ? 1 : 0) : input.embed);
        }
        if ('youtubelink' in input) {
          updateFields.push('youtubelink = ?');
          values.push(input.youtubelink);
        }
        if ('hls' in input) {
          updateFields.push('hls = ?');
          values.push(typeof input.hls === 'boolean' ? (input.hls ? 1 : 0) : input.hls);
        }
        if ('supported_hosts' in input) {
          updateFields.push('supported_hosts = ?');
          values.push(
            Array.isArray(input.supported_hosts) ? JSON.stringify(input.supported_hosts) : input.supported_hosts
          );
        }

        if (updateFields.length === 0) {
          sendJson(res, 200, { message: 'No se enviaron datos válidos para actualizar o no hubieron cambios' });
          return;
        }

        updateFields.push('updated_at = ?');
        values.push(currentTime);
        values.push(id);

        await dooplexPool.execute(`UPDATE serie_videos SET ${updateFields.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, {
          success: true,
          message: 'Actualizado correctamente',
          updated_at: currentTime,
        });
      } else {
        const episodeId = input.episode_id ?? null;
        if (!episodeId) {
          sendJson(res, 400, { error: 'Falta el parámetro episode_id para el registro' });
          return;
        }

        const server = input.server ?? null;
        const header = input.header ?? null;
        const link = trimNullableUrl(input.link);
        const lang = input.lang ?? null;
        const embed = typeof input.embed === 'boolean' ? (input.embed ? 1 : 0) : (input.embed ?? null);
        const youtubelink = input.youtubelink ?? null;
        const hls = typeof input.hls === 'boolean' ? (input.hls ? 1 : 0) : (input.hls ?? null);
        const supportedHosts = Array.isArray(input.supported_hosts)
          ? JSON.stringify(input.supported_hosts)
          : (input.supported_hosts ?? null);

        if (link) {
          const [existingRows] = await dooplexPool.query<RowDataPacket[]>(
            'SELECT id, `link` FROM serie_videos WHERE episode_id = ?',
            [episodeId]
          );
          const duplicateRow = findDuplicateUrlRow(existingRows, 'link', link);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ id: String(duplicateRow.id) }));
            return;
          }
        }

        const [result] = await dooplexPool.execute<ResultSetHeader>(
          'INSERT INTO serie_videos (episode_id, server, header, `link`, lang, embed, youtubelink, hls, supported_hosts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [episodeId, server, header, link, lang, embed, youtubelink, hls, supportedHosts, currentTime, currentTime]
        );

        sendJson(res, 200, {
          success: true,
          message: 'Registrado correctamente',
          data: {
            id: String(result.insertId),
            created_at: currentTime,
            updated_at: currentTime,
          },
        });
      }
      return;
    }

    sendJson(res, 405, { error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { error: 'Error en series_dooplex: ' + (err?.message || String(err)) });
  }
}

// ============================================================================
// 5. /anime_dooplex.php (con header, embed, youtubelink, hls, supported_hosts)
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
        const [rows] = await dooplexPool.query<RowDataPacket[]>('SELECT id, name FROM animes WHERE tmdb_id = ?', [
          tmdbId,
        ]);
        sendJson(res, 200, { success: true, data: rows });
      } else if (animeId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>('SELECT * FROM anime_seasons WHERE anime_id = ?', [
          animeId,
        ]);
        sendJson(res, 200, { success: true, data: rows });
      } else if (animeSeasonId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, episode_number, name FROM anime_episodes WHERE anime_season_id = ?',
          [animeSeasonId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else if (animeEpisodeId) {
        const [rows] = await dooplexPool.query<RowDataPacket[]>(
          'SELECT id, anime_episode_id, server, header, `link`, lang, embed, youtubelink, hls, supported_hosts FROM anime_videos WHERE anime_episode_id = ?',
          [animeEpisodeId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else {
        sendJson(res, 400, { error: 'Faltan parámetros (tmdb_id, anime_id, anime_season_id o anime_episode_id)' });
      }
      return;
    }

    if (method === 'DELETE') {
      let id = query.get('id');
      if (!id) {
        const input = await readBody(req);
        if (input.id !== undefined) id = String(input.id);
      }
      if (!id) {
        sendJson(res, 400, { error: 'Falta el parámetro id para eliminar' });
        return;
      }
      await dooplexPool.execute('DELETE FROM anime_videos WHERE id = ?', [id]);
      sendJson(res, 200, { success: true, message: 'Eliminado correctamente' });
      return;
    }

    if (method === 'POST' || method === 'PUT') {
      const input = await readBody(req);
      const id = input.id ?? null;
      const animeEpisodesId = input.anime_episodes_id ?? null;
      const currentTime = nowDatetime();

      if (animeEpisodesId !== null) {
        if (!animeEpisodesId) {
          sendJson(res, 400, { error: 'Falta el parámetro anime_episodes_id para actualizar' });
          return;
        }
        const updateFields: string[] = [];
        const values: any[] = [];
        for (const k of ['name', 'overview', 'still_path', 'still_path_tv']) {
          if (input[k] !== undefined && input[k] !== null && String(input[k]).trim() !== '') {
            updateFields.push(`${k} = ?`);
            values.push(input[k]);
          }
        }
        if (updateFields.length === 0) {
          sendJson(res, 200, { message: 'No hay datos válidos para actualizar' });
          return;
        }
        values.push(animeEpisodesId);
        await dooplexPool.execute(`UPDATE anime_episodes SET ${updateFields.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, { success: true, message: 'Actualizado correctamente' });
      } else if (method === 'PUT' || id !== null) {
        if (!id) {
          sendJson(res, 400, { error: 'Falta el parámetro id para actualizar' });
          return;
        }

        const updateFields: string[] = [];
        const values: any[] = [];

        if (input.anime_episode_id !== undefined && String(input.anime_episode_id).trim() !== '') {
          updateFields.push('anime_episode_id = ?');
          values.push(input.anime_episode_id);
        }
        if (input.server !== undefined && String(input.server).trim() !== '') {
          updateFields.push('server = ?');
          values.push(String(input.server).trim());
        }
        if (input.header !== undefined && String(input.header).trim() !== '') {
          updateFields.push('header = ?');
          values.push(String(input.header).trim());
        }
        if (input.link !== undefined && String(input.link).trim() !== '') {
          updateFields.push('`link` = ?');
          values.push(String(input.link).trim());
        }
        if (input.lang !== undefined && String(input.lang).trim() !== '') {
          updateFields.push('lang = ?');
          values.push(String(input.lang).trim());
        }
        if ('embed' in input) {
          updateFields.push('embed = ?');
          values.push(typeof input.embed === 'boolean' ? (input.embed ? 1 : 0) : input.embed);
        }
        if ('youtubelink' in input) {
          updateFields.push('youtubelink = ?');
          values.push(input.youtubelink);
        }
        if ('hls' in input) {
          updateFields.push('hls = ?');
          values.push(typeof input.hls === 'boolean' ? (input.hls ? 1 : 0) : input.hls);
        }
        if ('supported_hosts' in input) {
          updateFields.push('supported_hosts = ?');
          values.push(
            Array.isArray(input.supported_hosts) ? JSON.stringify(input.supported_hosts) : input.supported_hosts
          );
        }

        if (updateFields.length === 0) {
          sendJson(res, 200, { message: 'No se enviaron datos válidos para actualizar o no hubieron cambios' });
          return;
        }

        updateFields.push('updated_at = ?');
        values.push(currentTime);
        values.push(id);

        await dooplexPool.execute(`UPDATE anime_videos SET ${updateFields.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, {
          success: true,
          message: 'Actualizado correctamente',
          updated_at: currentTime,
        });
      } else {
        const animeEpisodeId = input.anime_episode_id ?? null;
        if (!animeEpisodeId) {
          sendJson(res, 400, { error: 'Falta el parámetro anime_episode_id para el registro' });
          return;
        }

        const server = input.server ?? null;
        const header = input.header ?? null;
        const link = trimNullableUrl(input.link);
        const lang = input.lang ?? null;
        const embed = typeof input.embed === 'boolean' ? (input.embed ? 1 : 0) : (input.embed ?? null);
        const youtubelink = input.youtubelink ?? null;
        const hls = typeof input.hls === 'boolean' ? (input.hls ? 1 : 0) : (input.hls ?? null);
        const supportedHosts = Array.isArray(input.supported_hosts)
          ? JSON.stringify(input.supported_hosts)
          : (input.supported_hosts ?? null);

        if (link) {
          const [existingRows] = await dooplexPool.query<RowDataPacket[]>(
            'SELECT id, `link` FROM anime_videos WHERE anime_episode_id = ?',
            [animeEpisodeId]
          );
          const duplicateRow = findDuplicateUrlRow(existingRows, 'link', link);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ id: String(duplicateRow.id) }));
            return;
          }
        }

        const [result] = await dooplexPool.execute<ResultSetHeader>(
          'INSERT INTO anime_videos (anime_episode_id, server, header, `link`, lang, embed, youtubelink, hls, supported_hosts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            animeEpisodeId,
            server,
            header,
            link,
            lang,
            embed,
            youtubelink,
            hls,
            supportedHosts,
            currentTime,
            currentTime,
          ]
        );

        sendJson(res, 200, {
          success: true,
          message: 'Registrado correctamente',
          data: {
            id: String(result.insertId),
            created_at: currentTime,
            updated_at: currentTime,
          },
        });
      }
      return;
    }

    sendJson(res, 405, { error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { error: 'Error en anime_dooplex: ' + (err?.message || String(err)) });
  }
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
        const [rows] = await docinesPool.query<RowDataPacket[]>('SELECT id, name FROM movies WHERE TMDB_ID = ?', [
          tmdbid,
        ]);
        sendJson(res, 200, { data: rows });
      } else if (movieId) {
        const [rows] = await docinesPool.query<RowDataPacket[]>(
          'SELECT id, name, url, quality, link_order FROM movie_play_links WHERE movie_id = ?',
          [movieId]
        );
        sendJson(res, 200, { data: rows });
      } else {
        sendJson(res, 200, { error: 'Faltan parámetros (tmdbid o movie_id)' });
      }
      return;
    }

    if (method === 'DELETE') {
      let id = query.get('id');
      if (!id) {
        const input = await readBody(req);
        if (input.id !== undefined) id = String(input.id);
      }
      if (!id) {
        sendJson(res, 400, { error: 'Falta el parámetro id' });
        return;
      }
      await docinesPool.execute('DELETE FROM movie_play_links WHERE id = ?', [id]);
      sendJson(res, 200, { message: 'Eliminado correctamente' });
      return;
    }

    if (method === 'POST' || method === 'PUT') {
      const input = await readBody(req);
      const id = input.id ?? null;
      const moviesId = input.movies_id ?? null;

      if (id !== null) {
        if (!id) {
          sendJson(res, 400, { error: 'Falta el parámetro id para actualizar' });
          return;
        }
        const updates: string[] = [];
        const values: any[] = [];
        for (const k of ['name', 'url', 'link_order', 'quality']) {
          if (input[k] !== undefined && input[k] !== null && input[k] !== '') {
            updates.push(`${k} = ?`);
            values.push(input[k]);
          }
        }
        if (updates.length === 0) {
          sendJson(res, 200, { message: 'No hay datos válidos para actualizar' });
          return;
        }
        values.push(id);
        await docinesPool.execute(`UPDATE movie_play_links SET ${updates.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, { message: 'Actualizado correctamente' });
      } else if (moviesId !== null) {
        if (!moviesId || !input.movie_name || String(input.movie_name).trim() === '') {
          sendJson(res, 400, { error: 'Faltan parámetros (movies_id o movie_name)' });
          return;
        }
        await docinesPool.execute('UPDATE movies SET name = ? WHERE id = ?', [input.movie_name, moviesId]);
        sendJson(res, 200, { message: 'Actualizado correctamente' });
      } else if (method === 'PUT') {
        sendJson(res, 400, { error: 'Faltan parámetros (id o movies_id)' });
      } else {
        const movieId = input.movie_id ?? null;
        if (!movieId) {
          sendJson(res, 400, { error: 'Falta el parámetro movie_id para el registro' });
          return;
        }
        const cleanUrl = trimNullableUrl(input.url);
        const [existingRows] = await docinesPool.query<RowDataPacket[]>(
          'SELECT id, url, link_order FROM movie_play_links WHERE movie_id = ? ORDER BY link_order ASC',
          [movieId]
        );
        if (cleanUrl) {
          const duplicateRow = findDuplicateUrlRow(existingRows, 'url', cleanUrl);
          if (duplicateRow) {
            sendJson(
              res,
              200,
              buildDuplicateResponse({
                id: String(duplicateRow.id),
                link_order: Number(duplicateRow.link_order ?? 0),
              })
            );
            return;
          }
        }
        const nextLinkOrder = computeNextMissingOrder(existingRows.map((row) => Number(row.link_order ?? 0)));
        const [result] = await docinesPool.execute<ResultSetHeader>(
          'INSERT INTO movie_play_links (movie_id, name, url, quality, link_order, type, status, skip_available, link_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [movieId, input.name ?? null, cleanUrl, input.quality ?? null, nextLinkOrder, 'Embed', 1, 0, 0]
        );
        sendJson(res, 200, {
          message: 'Registrado correctamente',
          data: {
            id: String(result.insertId),
            link_order: nextLinkOrder,
          },
        });
      }
      return;
    }

    sendJson(res, 405, { error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { error: 'Error en movie_docines: ' + (err?.message || String(err)) });
  }
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
        const [rows] = await docinesPool.query<RowDataPacket[]>('SELECT id, name FROM web_series WHERE TMDB_ID = ?', [
          tmdbid,
        ]);
        sendJson(res, 200, { data: rows });
      } else if (webSeriesId) {
        const [rows] = await docinesPool.query<RowDataPacket[]>(
          'SELECT id, Session_Name, season_order FROM web_series_seasons WHERE web_series_id = ?',
          [webSeriesId]
        );
        sendJson(res, 200, { data: rows });
      } else if (seasonId) {
        const [rows] = await docinesPool.query<RowDataPacket[]>(
          'SELECT id, Episoade_Name, episoade_order FROM web_series_episoade WHERE season_id = ? ORDER BY episoade_order ASC, id ASC',
          [seasonId]
        );
        sendJson(res, 200, { data: rows });
      } else if (episodeId) {
        const [rows] = await docinesPool.query<RowDataPacket[]>(
          'SELECT id, name, url, quality FROM episode_play_links WHERE episode_id = ?',
          [episodeId]
        );
        sendJson(res, 200, { data: rows });
      } else {
        sendJson(res, 200, { error: 'Faltan parámetros (tmdbid, web_series_id, season_id o episode_id)' });
      }
      return;
    }

    if (method === 'DELETE') {
      let id = query.get('id');
      if (!id) {
        const input = await readBody(req);
        if (input.id !== undefined) id = String(input.id);
      }
      if (!id) {
        sendJson(res, 400, { error: 'Falta el parámetro id' });
        return;
      }
      await docinesPool.execute('DELETE FROM episode_play_links WHERE id = ?', [id]);
      sendJson(res, 200, { message: 'Eliminado correctamente' });
      return;
    }

    if (method === 'POST' || method === 'PUT') {
      const input = await readBody(req);
      const id = input.id ?? null;
      const webSeriesEpisoadeId = input.web_series_episoade_id ?? input.episodes_id ?? null;

      if (webSeriesEpisoadeId !== null) {
        if (!webSeriesEpisoadeId) {
          sendJson(res, 400, { error: 'Falta el parámetro web_series_episoade_id para actualizar' });
          return;
        }
        const updates: string[] = [];
        const values: any[] = [];
        for (const k of ['Episoade_Name', 'episoade_image', 'episoade_description']) {
          if (input[k] !== undefined && input[k] !== null && String(input[k]).trim() !== '') {
            updates.push(`${k} = ?`);
            values.push(input[k]);
          }
        }
        if (updates.length === 0) {
          sendJson(res, 200, { message: 'No hay datos válidos para actualizar' });
          return;
        }
        values.push(webSeriesEpisoadeId);
        await docinesPool.execute(`UPDATE web_series_episoade SET ${updates.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, { message: 'Actualizado correctamente' });
      } else if (id !== null) {
        if (!id) {
          sendJson(res, 400, { error: 'Falta el parámetro id para actualizar' });
          return;
        }
        const updates: string[] = [];
        const values: any[] = [];
        for (const k of ['name', 'url', 'quality']) {
          if (input[k] !== undefined && input[k] !== null && input[k] !== '') {
            updates.push(`${k} = ?`);
            values.push(input[k]);
          }
        }
        if (updates.length === 0) {
          sendJson(res, 200, { message: 'No hay datos válidos para actualizar' });
          return;
        }
        values.push(id);
        await docinesPool.execute(`UPDATE episode_play_links SET ${updates.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, { message: 'Actualizado correctamente' });
      } else if (method === 'PUT') {
        sendJson(res, 400, { error: 'Faltan parámetros (id o web_series_episoade_id)' });
      } else {
        const episodeId = input.episode_id ?? null;
        if (!episodeId) {
          sendJson(res, 400, { error: 'Falta el parámetro episode_id para el registro' });
          return;
        }
        const cleanUrl = trimNullableUrl(input.url);
        const [existingRows] = await docinesPool.query<RowDataPacket[]>(
          'SELECT id, url FROM episode_play_links WHERE episode_id = ?',
          [episodeId]
        );
        if (cleanUrl) {
          const duplicateRow = findDuplicateUrlRow(existingRows, 'url', cleanUrl);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ id: String(duplicateRow.id) }));
            return;
          }
        }
        const linkOrder = existingRows.length + 1;
        const [result] = await docinesPool.execute<ResultSetHeader>(
          'INSERT INTO episode_play_links (name, episode_id, url, quality, status, type, skip_available, link_type, link_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [input.name ?? null, episodeId, cleanUrl, input.quality ?? null, 1, 'Embed', 0, 0, linkOrder]
        );
        sendJson(res, 200, {
          message: 'Registrado correctamente',
          data: {
            id: String(result.insertId),
            link_order: linkOrder,
          },
        });
      }
      return;
    }

    sendJson(res, 405, { error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { error: 'Error en series_docines: ' + (err?.message || String(err)) });
  }
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
          'SELECT title, videos_id FROM videos WHERE tmdbid = ?',
          [tmdbid]
        );
        sendJson(res, 200, { data: rows });
      } else if (videosId) {
        const [rows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT video_file_id, file_url, label, `order` FROM video_file WHERE videos_id = ?',
          [videosId]
        );
        sendJson(res, 200, { data: rows });
      } else {
        sendJson(res, 200, { error: 'Faltan parámetros (tmdbid o videos_id)' });
      }
      return;
    }

    if (method === 'DELETE') {
      let videoFileId = query.get('video_file_id');
      if (!videoFileId) {
        const input = await readBody(req);
        if (input.video_file_id !== undefined) videoFileId = String(input.video_file_id);
      }
      if (!videoFileId) {
        sendJson(res, 400, { error: 'Falta el parámetro video_file_id' });
        return;
      }
      await plusmoviePool.execute('DELETE FROM video_file WHERE video_file_id = ?', [videoFileId]);
      sendJson(res, 200, { message: 'Eliminado correctamente' });
      return;
    }

    if (method === 'POST' || method === 'PUT') {
      const input = await readBody(req);
      const videoFileId = input.video_file_id ?? null;

      if (method === 'PUT' || videoFileId !== null) {
        if (!videoFileId) {
          sendJson(res, 400, { error: 'Falta el parámetro video_file_id para actualizar' });
          return;
        }
        await plusmoviePool.execute(
          'UPDATE video_file SET file_url = ?, label = ?, `order` = ? WHERE video_file_id = ?',
          [input.file_url, input.label, input.order, videoFileId]
        );
        sendJson(res, 200, { message: 'Actualizado correctamente' });
      } else {
        const videosId = input.videos_id ?? null;
        const cleanFileUrl = trimNullableUrl(input.file_url);
        if (!videosId || !cleanFileUrl || !input.label) {
          sendJson(res, 400, { error: 'Faltan parámetros (videos_id, file_url, label)' });
          return;
        }
        const [existingRows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT video_file_id, file_url, `order` FROM video_file WHERE videos_id = ? ORDER BY `order` ASC',
          [videosId]
        );
        const duplicateRow = findDuplicateUrlRow(existingRows, 'file_url', cleanFileUrl);
        if (duplicateRow) {
          sendJson(
            res,
            200,
            buildDuplicateResponse({
              video_file_id: String(duplicateRow.video_file_id),
              order: Number(duplicateRow.order ?? 0),
            })
          );
          return;
        }
        const nextOrder = computeNextMissingOrder(existingRows.map((row) => Number(row.order ?? 0)));
        const streamKey = generateStreamKey(12);
        const [result] = await plusmoviePool.execute<ResultSetHeader>(
          'INSERT INTO video_file (stream_key, videos_id, file_source, source_type, file_url, label, `order`) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [streamKey, videosId, 'embed', 'link', cleanFileUrl, input.label, nextOrder]
        );
        sendJson(res, 200, {
          message: 'Registrado correctamente',
          data: {
            video_file_id: String(result.insertId),
            stream_key: streamKey,
            order: nextOrder,
          },
        });
      }
      return;
    }

    sendJson(res, 405, { error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { error: 'Error en movie_plusmovie: ' + (err?.message || String(err)) });
  }
}

async function handleSeriesPlusmovie(req: IncomingMessage, res: ServerResponse, query: URLSearchParams): Promise<void> {
  const method = req.method || 'GET';
  try {
    if (method === 'GET') {
      const title = query.get('title');
      const videosInfoId = query.get('videos_info_id');
      const tmdbid = query.get('tmdbid');
      const videosId = query.get('videos_id');
      const seasonsId = query.get('seasons_id');

      if (title) {
        const [rows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT videos_id, title, tmdbid FROM videos WHERE title LIKE ?',
          [`%${title}%`]
        );
        sendJson(res, 200, { data: rows });
      } else if (videosInfoId) {
        const [rows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT videos_id, title, tmdbid FROM videos WHERE videos_id = ?',
          [videosInfoId]
        );
        sendJson(res, 200, { data: rows });
      } else if (tmdbid) {
        const [rows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT videos_id, title FROM videos WHERE tmdbid = ?',
          [tmdbid]
        );
        sendJson(res, 200, { data: rows });
      } else if (videosId) {
        const [rows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT seasons_id, seasons_name, `order` FROM seasons WHERE videos_id = ?',
          [videosId]
        );
        sendJson(res, 200, { data: rows });
      } else if (seasonsId) {
        const [rows] = await plusmoviePool.query<RowDataPacket[]>(
          'SELECT episodes_id, episodes_name, file_url, `order` FROM episodes WHERE seasons_id = ?',
          [seasonsId]
        );
        sendJson(res, 200, { data: rows });
      } else {
        sendJson(res, 400, { error: 'Faltan parámetros (tmdbid, videos_id o seasons_id)' });
      }
      return;
    }

    if (method === 'DELETE') {
      let episodesId = query.get('episodes_id');
      if (!episodesId) {
        const input = await readBody(req);
        if (input.episodes_id !== undefined) episodesId = String(input.episodes_id);
      }
      if (!episodesId) {
        sendJson(res, 400, { error: 'Falta el parámetro episodes_id' });
        return;
      }
      await plusmoviePool.execute('DELETE FROM episodes WHERE episodes_id = ?', [episodesId]);
      sendJson(res, 200, { message: 'Eliminado correctamente' });
      return;
    }

    if (method === 'POST' || method === 'PUT') {
      const input = await readBody(req);
      const episodesId = input.episodes_id ?? null;
      const videosId = input.videos_id ?? null;
      const seasonsId = input.seasons_id ?? null;
      const title = input.title ?? null;
      const tmdbid = input.tmdbid ?? null;
      const currentDate = nowDatetime();

      if (episodesId === null && seasonsId === null && videosId !== null && (title !== null || tmdbid !== null)) {
        if (!title || !tmdbid) {
          sendJson(res, 400, { error: 'Faltan parámetros (videos_id, title, tmdbid)' });
          return;
        }
        await plusmoviePool.execute('UPDATE videos SET title = ?, tmdbid = ? WHERE videos_id = ?', [
          title,
          tmdbid,
          videosId,
        ]);
        sendJson(res, 200, { message: 'Actualizado correctamente' });
        return;
      }

      if (method === 'PUT' || episodesId !== null) {
        if (!episodesId) {
          sendJson(res, 400, { error: 'Falta el parámetro episodes_id para actualizar' });
          return;
        }
        await plusmoviePool.execute(
          'UPDATE episodes SET episodes_name = ?, file_url = ?, `order` = ?, last_ep_added = ? WHERE episodes_id = ?',
          [input.episodes_name, input.file_url, input.order, currentDate, episodesId]
        );
        sendJson(res, 200, { message: 'Actualizado correctamente', last_ep_added: currentDate });
      } else {
        if (!seasonsId || !videosId) {
          sendJson(res, 400, { error: 'Faltan parámetros requeridos (seasons_id o videos_id) para el registro' });
          return;
        }
        const cleanFileUrl = trimNullableUrl(input.file_url);
        if (cleanFileUrl) {
          const [existingRows] = await plusmoviePool.query<RowDataPacket[]>(
            'SELECT episodes_id, file_url FROM episodes WHERE videos_id = ? AND seasons_id = ?',
            [videosId, seasonsId]
          );
          const duplicateRow = findDuplicateUrlRow(existingRows, 'file_url', cleanFileUrl);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ episodes_id: String(duplicateRow.episodes_id) }));
            return;
          }
        }
        const streamKey = generateStreamKey(12);
        const [result] = await plusmoviePool.execute<ResultSetHeader>(
          'INSERT INTO episodes (stream_key, videos_id, seasons_id, episodes_name, file_source, source_type, file_url, `order`, date_added, last_ep_added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            streamKey,
            videosId,
            seasonsId,
            input.episodes_name ?? null,
            input.file_source ?? 'embed',
            input.source_type ?? 'link',
            cleanFileUrl,
            input.order ?? null,
            currentDate,
            currentDate,
          ]
        );
        sendJson(res, 200, {
          message: 'Registrado correctamente',
          data: {
            episodes_id: String(result.insertId),
            stream_key: streamKey,
            date_added: currentDate,
          },
        });
      }
      return;
    }

    sendJson(res, 405, { error: 'Método no permitido' });
  } catch (err: any) {
    sendJson(res, 500, { error: 'Error en series_plusmovie: ' + (err?.message || String(err)) });
  }
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
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}
