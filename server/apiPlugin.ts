import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import type { Connect, Plugin } from 'vite';
import {
  buildDuplicateResponse,
  computeNextMissingOrder,
  findDuplicateUrlRow,
  trimNullableUrl,
} from './duplicateCheck';
import { loadEnvFiles } from './env';
import { handleUploadApkRequest } from './uploadHandler';
import { isValidStreamNexusVersion } from '../src/lib/versioning';

// ============================================================================
// Conexiones lazy y ligeras a MySQL (Dooplex, Docines, PlusMovie)
// ============================================================================

type DbPrefix = 'DOOPLEX' | 'DOCINES' | 'PLUSMOVIE';
const pools: Partial<Record<DbPrefix, Pool>> = {};

function getDbConfig(prefix: DbPrefix) {
  loadEnvFiles();
  const host = process.env[`${prefix}_DB_HOST`] || process.env.DB_HOST || 'localhost';
  const port = Number(process.env[`${prefix}_DB_PORT`] || process.env.DB_PORT || 3306);
  const user = process.env[`${prefix}_DB_USER`] || process.env.DB_USER || '';
  const password = process.env[`${prefix}_DB_PASSWORD`] ?? process.env.DB_PASSWORD ?? '';
  const database =
    process.env[`${prefix}_DB_NAME`] ||
    process.env[`${prefix}_DB_DATABASE`] ||
    process.env.DB_NAME ||
    '';

  if (!user || !database) {
    throw new Error(
      `Faltan variables de entorno de MySQL para ${prefix} (${prefix}_DB_NAME, ${prefix}_DB_USER, ${prefix}_DB_PASSWORD)`
    );
  }

  return { host, port, user, password, database };
}

function getPool(prefix: DbPrefix): Pool {
  const existing = pools[prefix];
  if (existing) return existing;

  const cfg = getDbConfig(prefix);
  const connectionLimit = Number(
    prefix === 'DOOPLEX' ? process.env.DB_POOL_LIMIT || 3 : process.env.DB_SUB_POOL_LIMIT || 2
  );

  const pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: Number.isFinite(connectionLimit) && connectionLimit > 0 ? connectionLimit : 2,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });

  pools[prefix] = pool;
  return pool;
}

const getDooplexPool = () => getPool('DOOPLEX');
const getDocinesPool = () => getPool('DOCINES');
const getPlusmoviePool = () => getPool('PLUSMOVIE');

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

type SqlParam = string | number | boolean | null;

function toSqlParam(val: unknown): SqlParam {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
  return String(val);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildDooplexVideoUpdate(
  input: Record<string, unknown>,
  includeAnimeEpisodeId = false
): { updateFields: string[]; values: SqlParam[] } {
  const updateFields: string[] = [];
  const values: SqlParam[] = [];

  if (includeAnimeEpisodeId && input.anime_episode_id !== undefined && String(input.anime_episode_id).trim() !== '') {
    updateFields.push('anime_episode_id = ?');
    values.push(toSqlParam(input.anime_episode_id));
  }
  for (const [key, col] of [
    ['server', 'server'],
    ['header', 'header'],
    ['link', '`link`'],
    ['lang', 'lang'],
  ] as const) {
    if (input[key] !== undefined && String(input[key]).trim() !== '') {
      updateFields.push(`${col} = ?`);
      values.push(String(input[key]).trim());
    }
  }
  if ('embed' in input) {
    updateFields.push('embed = ?');
    values.push(typeof input.embed === 'boolean' ? (input.embed ? 1 : 0) : toSqlParam(input.embed));
  }
  if ('youtubelink' in input) {
    updateFields.push('youtubelink = ?');
    values.push(toSqlParam(input.youtubelink));
  }
  if ('hls' in input) {
    updateFields.push('hls = ?');
    values.push(typeof input.hls === 'boolean' ? (input.hls ? 1 : 0) : toSqlParam(input.hls));
  }
  if ('supported_hosts' in input) {
    updateFields.push('supported_hosts = ?');
    values.push(
      Array.isArray(input.supported_hosts)
        ? JSON.stringify(input.supported_hosts)
        : toSqlParam(input.supported_hosts)
    );
  }
  return { updateFields, values };
}

function extractDooplexVideoInsert(input: Record<string, unknown>) {
  return {
    server: toSqlParam(input.server),
    header: toSqlParam(input.header),
    link: trimNullableUrl(input.link),
    lang: toSqlParam(input.lang),
    embed: typeof input.embed === 'boolean' ? (input.embed ? 1 : 0) : toSqlParam(input.embed),
    youtubelink: toSqlParam(input.youtubelink),
    hls: typeof input.hls === 'boolean' ? (input.hls ? 1 : 0) : toSqlParam(input.hls),
    supportedHosts: Array.isArray(input.supported_hosts)
      ? JSON.stringify(input.supported_hosts)
      : toSqlParam(input.supported_hosts),
  };
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
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
          resolve(parsed as Record<string, unknown>);
          return;
        }
      } catch {
        // Fallback to URLSearchParams
      }
      const params = new URLSearchParams(raw);
      const obj: Record<string, unknown> = {};
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
    const [rows] = await getDooplexPool().query<RowDataPacket[]>(
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
  } catch (err: unknown) {
    sendJson(res, 500, { success: false, error: 'Error al procesar el login: ' + errorMessage(err) });
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
    const [[moviesRow]] = await getDooplexPool().query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM movies');
    const [[seriesRow]] = await getDooplexPool().query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM series');
    const [[animesRow]] = await getDooplexPool().query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM animes');

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
  } catch (err: unknown) {
    sendJson(res, 500, {
      success: false,
      error: 'Error al obtener conteos del dashboard: ' + errorMessage(err),
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
        const [rows] = await getDooplexPool().query<RowDataPacket[]>(
          'SELECT id, title FROM movies WHERE tmdb_id = ?',
          [tmdbId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else if (movieId) {
        const [rows] = await getDooplexPool().query<RowDataPacket[]>(
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
      await getDooplexPool().execute('DELETE FROM movie_videos WHERE id = ?', [id]);
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

        const { updateFields, values } = buildDooplexVideoUpdate(input, false);

        if (updateFields.length === 0) {
          sendJson(res, 200, { message: 'No se enviaron datos válidos para actualizar o no hubieron cambios' });
          return;
        }

        updateFields.push('updated_at = ?');
        values.push(currentTime);
        values.push(toSqlParam(id));

        await getDooplexPool().execute(`UPDATE movie_videos SET ${updateFields.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, {
          success: true,
          message: 'Actualizado correctamente',
          updated_at: currentTime,
        });
      } else {
        const movieId = toSqlParam(input.movie_id);
        if (!movieId) {
          sendJson(res, 400, { error: 'Falta el parámetro movie_id para el registro' });
          return;
        }

        const { server, header, link, lang, embed, youtubelink, hls, supportedHosts } =
          extractDooplexVideoInsert(input);

        if (link) {
          const [existingRows] = await getDooplexPool().query<RowDataPacket[]>(
            'SELECT id, `link` FROM movie_videos WHERE movie_id = ?',
            [movieId]
          );
          const duplicateRow = findDuplicateUrlRow(existingRows, 'link', link);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ id: String(duplicateRow.id) }));
            return;
          }
        }

        const [result] = await getDooplexPool().execute<ResultSetHeader>(
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
  } catch (err: unknown) {
    sendJson(res, 500, { error: 'Error en movie_dooplex: ' + errorMessage(err) });
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
        const [rows] = await getDooplexPool().query<RowDataPacket[]>('SELECT id, name FROM series WHERE tmdb_id = ?', [
          tmdbId,
        ]);
        sendJson(res, 200, { success: true, data: rows });
      } else if (serieId) {
        const [rows] = await getDooplexPool().query<RowDataPacket[]>(
          'SELECT id, season_number, name FROM seasons WHERE serie_id = ?',
          [serieId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else if (seasonId) {
        const [rows] = await getDooplexPool().query<RowDataPacket[]>(
          'SELECT id, episode_number, name FROM episodes WHERE season_id = ?',
          [seasonId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else if (episodeId) {
        const [rows] = await getDooplexPool().query<RowDataPacket[]>(
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
      await getDooplexPool().execute('DELETE FROM serie_videos WHERE id = ?', [id]);
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
        const values: SqlParam[] = [];
        for (const k of ['name', 'overview', 'still_path', 'still_path_tv']) {
          if (input[k] !== undefined && input[k] !== null && String(input[k]).trim() !== '') {
            updateFields.push(`${k} = ?`);
            values.push(toSqlParam(input[k]));
          }
        }
        if (updateFields.length === 0) {
          sendJson(res, 200, { message: 'No hay datos válidos para actualizar' });
          return;
        }
        values.push(toSqlParam(episodesId));
        await getDooplexPool().execute(`UPDATE episodes SET ${updateFields.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, { success: true, message: 'Actualizado correctamente' });
      } else if (method === 'PUT' || id !== null) {
        if (!id) {
          sendJson(res, 400, { error: 'Falta el parámetro id para actualizar' });
          return;
        }

        const { updateFields, values } = buildDooplexVideoUpdate(input, false);

        if (updateFields.length === 0) {
          sendJson(res, 200, { message: 'No se enviaron datos válidos para actualizar o no hubieron cambios' });
          return;
        }

        updateFields.push('updated_at = ?');
        values.push(currentTime);
        values.push(toSqlParam(id));

        await getDooplexPool().execute(`UPDATE serie_videos SET ${updateFields.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, {
          success: true,
          message: 'Actualizado correctamente',
          updated_at: currentTime,
        });
      } else {
        const episodeId = toSqlParam(input.episode_id);
        if (!episodeId) {
          sendJson(res, 400, { error: 'Falta el parámetro episode_id para el registro' });
          return;
        }

        const { server, header, link, lang, embed, youtubelink, hls, supportedHosts } =
          extractDooplexVideoInsert(input);

        if (link) {
          const [existingRows] = await getDooplexPool().query<RowDataPacket[]>(
            'SELECT id, `link` FROM serie_videos WHERE episode_id = ?',
            [episodeId]
          );
          const duplicateRow = findDuplicateUrlRow(existingRows, 'link', link);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ id: String(duplicateRow.id) }));
            return;
          }
        }

        const [result] = await getDooplexPool().execute<ResultSetHeader>(
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
  } catch (err: unknown) {
    sendJson(res, 500, { error: 'Error en series_dooplex: ' + errorMessage(err) });
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
        const [rows] = await getDooplexPool().query<RowDataPacket[]>('SELECT id, name FROM animes WHERE tmdb_id = ?', [
          tmdbId,
        ]);
        sendJson(res, 200, { success: true, data: rows });
      } else if (animeId) {
        const [rows] = await getDooplexPool().query<RowDataPacket[]>('SELECT * FROM anime_seasons WHERE anime_id = ?', [
          animeId,
        ]);
        sendJson(res, 200, { success: true, data: rows });
      } else if (animeSeasonId) {
        const [rows] = await getDooplexPool().query<RowDataPacket[]>(
          'SELECT id, episode_number, name FROM anime_episodes WHERE anime_season_id = ?',
          [animeSeasonId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else if (animeEpisodeId) {
        const [rows] = await getDooplexPool().query<RowDataPacket[]>(
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
      await getDooplexPool().execute('DELETE FROM anime_videos WHERE id = ?', [id]);
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
        const values: SqlParam[] = [];
        for (const k of ['name', 'overview', 'still_path', 'still_path_tv']) {
          if (input[k] !== undefined && input[k] !== null && String(input[k]).trim() !== '') {
            updateFields.push(`${k} = ?`);
            values.push(toSqlParam(input[k]));
          }
        }
        if (updateFields.length === 0) {
          sendJson(res, 200, { message: 'No hay datos válidos para actualizar' });
          return;
        }
        values.push(toSqlParam(animeEpisodesId));
        await getDooplexPool().execute(`UPDATE anime_episodes SET ${updateFields.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, { success: true, message: 'Actualizado correctamente' });
      } else if (method === 'PUT' || id !== null) {
        if (!id) {
          sendJson(res, 400, { error: 'Falta el parámetro id para actualizar' });
          return;
        }

        const { updateFields, values } = buildDooplexVideoUpdate(input, true);

        if (updateFields.length === 0) {
          sendJson(res, 200, { message: 'No se enviaron datos válidos para actualizar o no hubieron cambios' });
          return;
        }

        updateFields.push('updated_at = ?');
        values.push(currentTime);
        values.push(toSqlParam(id));

        await getDooplexPool().execute(`UPDATE anime_videos SET ${updateFields.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, {
          success: true,
          message: 'Actualizado correctamente',
          updated_at: currentTime,
        });
      } else {
        const animeEpisodeId = toSqlParam(input.anime_episode_id);
        if (!animeEpisodeId) {
          sendJson(res, 400, { error: 'Falta el parámetro anime_episode_id para el registro' });
          return;
        }

        const { server, header, link, lang, embed, youtubelink, hls, supportedHosts } =
          extractDooplexVideoInsert(input);

        if (link) {
          const [existingRows] = await getDooplexPool().query<RowDataPacket[]>(
            'SELECT id, `link` FROM anime_videos WHERE anime_episode_id = ?',
            [animeEpisodeId]
          );
          const duplicateRow = findDuplicateUrlRow(existingRows, 'link', link);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ id: String(duplicateRow.id) }));
            return;
          }
        }

        const [result] = await getDooplexPool().execute<ResultSetHeader>(
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
  } catch (err: unknown) {
    sendJson(res, 500, { error: 'Error en anime_dooplex: ' + errorMessage(err) });
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
        const [rows] = await getDocinesPool().query<RowDataPacket[]>('SELECT id, name FROM movies WHERE TMDB_ID = ?', [
          tmdbid,
        ]);
        sendJson(res, 200, { data: rows });
      } else if (movieId) {
        const [rows] = await getDocinesPool().query<RowDataPacket[]>(
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
      await getDocinesPool().execute('DELETE FROM movie_play_links WHERE id = ?', [id]);
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
        const values: SqlParam[] = [];
        for (const k of ['name', 'url', 'link_order', 'quality']) {
          if (input[k] !== undefined && input[k] !== null && input[k] !== '') {
            updates.push(`${k} = ?`);
            values.push(toSqlParam(input[k]));
          }
        }
        if (updates.length === 0) {
          sendJson(res, 200, { message: 'No hay datos válidos para actualizar' });
          return;
        }
        values.push(toSqlParam(id));
        await getDocinesPool().execute(`UPDATE movie_play_links SET ${updates.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, { message: 'Actualizado correctamente' });
      } else if (moviesId !== null) {
        if (!moviesId || !input.movie_name || String(input.movie_name).trim() === '') {
          sendJson(res, 400, { error: 'Faltan parámetros (movies_id o movie_name)' });
          return;
        }
        await getDocinesPool().execute('UPDATE movies SET name = ? WHERE id = ?', [
          toSqlParam(input.movie_name),
          toSqlParam(moviesId),
        ]);
        sendJson(res, 200, { message: 'Actualizado correctamente' });
      } else if (method === 'PUT') {
        sendJson(res, 400, { error: 'Faltan parámetros (id o movies_id)' });
      } else {
        const movieId = toSqlParam(input.movie_id);
        if (!movieId) {
          sendJson(res, 400, { error: 'Falta el parámetro movie_id para el registro' });
          return;
        }
        const cleanUrl = trimNullableUrl(input.url);
        const [existingRows] = await getDocinesPool().query<RowDataPacket[]>(
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
        const [result] = await getDocinesPool().execute<ResultSetHeader>(
          'INSERT INTO movie_play_links (movie_id, name, url, quality, link_order, type, status, skip_available, link_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [movieId, toSqlParam(input.name), cleanUrl, toSqlParam(input.quality), nextLinkOrder, 'Embed', 1, 0, 0]
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
  } catch (err: unknown) {
    sendJson(res, 500, { error: 'Error en movie_docines: ' + errorMessage(err) });
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
        const [rows] = await getDocinesPool().query<RowDataPacket[]>('SELECT id, name FROM web_series WHERE TMDB_ID = ?', [
          tmdbid,
        ]);
        sendJson(res, 200, { data: rows });
      } else if (webSeriesId) {
        const [rows] = await getDocinesPool().query<RowDataPacket[]>(
          'SELECT id, Session_Name, season_order FROM web_series_seasons WHERE web_series_id = ?',
          [webSeriesId]
        );
        sendJson(res, 200, { data: rows });
      } else if (seasonId) {
        const [rows] = await getDocinesPool().query<RowDataPacket[]>(
          'SELECT id, Episoade_Name, episoade_order FROM web_series_episoade WHERE season_id = ? ORDER BY episoade_order ASC, id ASC',
          [seasonId]
        );
        sendJson(res, 200, { data: rows });
      } else if (episodeId) {
        const [rows] = await getDocinesPool().query<RowDataPacket[]>(
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
      await getDocinesPool().execute('DELETE FROM episode_play_links WHERE id = ?', [id]);
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
        const values: SqlParam[] = [];
        for (const k of ['Episoade_Name', 'episoade_image', 'episoade_description']) {
          if (input[k] !== undefined && input[k] !== null && String(input[k]).trim() !== '') {
            updates.push(`${k} = ?`);
            values.push(toSqlParam(input[k]));
          }
        }
        if (updates.length === 0) {
          sendJson(res, 200, { message: 'No hay datos válidos para actualizar' });
          return;
        }
        values.push(toSqlParam(webSeriesEpisoadeId));
        await getDocinesPool().execute(`UPDATE web_series_episoade SET ${updates.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, { message: 'Actualizado correctamente' });
      } else if (id !== null) {
        if (!id) {
          sendJson(res, 400, { error: 'Falta el parámetro id para actualizar' });
          return;
        }
        const updates: string[] = [];
        const values: SqlParam[] = [];
        for (const k of ['name', 'url', 'quality']) {
          if (input[k] !== undefined && input[k] !== null && input[k] !== '') {
            updates.push(`${k} = ?`);
            values.push(toSqlParam(input[k]));
          }
        }
        if (updates.length === 0) {
          sendJson(res, 200, { message: 'No hay datos válidos para actualizar' });
          return;
        }
        values.push(toSqlParam(id));
        await getDocinesPool().execute(`UPDATE episode_play_links SET ${updates.join(', ')} WHERE id = ?`, values);
        sendJson(res, 200, { message: 'Actualizado correctamente' });
      } else if (method === 'PUT') {
        sendJson(res, 400, { error: 'Faltan parámetros (id o web_series_episoade_id)' });
      } else {
        const episodeId = toSqlParam(input.episode_id);
        if (!episodeId) {
          sendJson(res, 400, { error: 'Falta el parámetro episode_id para el registro' });
          return;
        }
        const cleanUrl = trimNullableUrl(input.url);
        const [existingRows] = await getDocinesPool().query<RowDataPacket[]>(
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
        const [result] = await getDocinesPool().execute<ResultSetHeader>(
          'INSERT INTO episode_play_links (name, episode_id, url, quality, status, type, skip_available, link_type, link_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [toSqlParam(input.name), episodeId, cleanUrl, toSqlParam(input.quality), 1, 'Embed', 0, 0, linkOrder]
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
  } catch (err: unknown) {
    sendJson(res, 500, { error: 'Error en series_docines: ' + errorMessage(err) });
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
        const [rows] = await getPlusmoviePool().query<RowDataPacket[]>(
          'SELECT title, videos_id FROM videos WHERE tmdbid = ?',
          [tmdbid]
        );
        sendJson(res, 200, { data: rows });
      } else if (videosId) {
        const [rows] = await getPlusmoviePool().query<RowDataPacket[]>(
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
      await getPlusmoviePool().execute('DELETE FROM video_file WHERE video_file_id = ?', [videoFileId]);
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
        await getPlusmoviePool().execute(
          'UPDATE video_file SET file_url = ?, label = ?, `order` = ? WHERE video_file_id = ?',
          [toSqlParam(input.file_url), toSqlParam(input.label), toSqlParam(input.order), toSqlParam(videoFileId)]
        );
        sendJson(res, 200, { message: 'Actualizado correctamente' });
      } else {
        const videosId = toSqlParam(input.videos_id);
        const cleanFileUrl = trimNullableUrl(input.file_url);
        if (!videosId || !cleanFileUrl || !input.label) {
          sendJson(res, 400, { error: 'Faltan parámetros (videos_id, file_url, label)' });
          return;
        }
        const [existingRows] = await getPlusmoviePool().query<RowDataPacket[]>(
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
        const [result] = await getPlusmoviePool().execute<ResultSetHeader>(
          'INSERT INTO video_file (stream_key, videos_id, file_source, source_type, file_url, label, `order`) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [streamKey, videosId, 'embed', 'link', cleanFileUrl, toSqlParam(input.label), nextOrder]
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
  } catch (err: unknown) {
    sendJson(res, 500, { error: 'Error en movie_plusmovie: ' + errorMessage(err) });
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
        const [rows] = await getPlusmoviePool().query<RowDataPacket[]>(
          'SELECT videos_id, title, tmdbid FROM videos WHERE title LIKE ?',
          [`%${title}%`]
        );
        sendJson(res, 200, { data: rows });
      } else if (videosInfoId) {
        const [rows] = await getPlusmoviePool().query<RowDataPacket[]>(
          'SELECT videos_id, title, tmdbid FROM videos WHERE videos_id = ?',
          [videosInfoId]
        );
        sendJson(res, 200, { data: rows });
      } else if (tmdbid) {
        const [rows] = await getPlusmoviePool().query<RowDataPacket[]>(
          'SELECT videos_id, title FROM videos WHERE tmdbid = ?',
          [tmdbid]
        );
        sendJson(res, 200, { data: rows });
      } else if (videosId) {
        const [rows] = await getPlusmoviePool().query<RowDataPacket[]>(
          'SELECT seasons_id, seasons_name, `order` FROM seasons WHERE videos_id = ?',
          [videosId]
        );
        sendJson(res, 200, { data: rows });
      } else if (seasonsId) {
        const [rows] = await getPlusmoviePool().query<RowDataPacket[]>(
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
      await getPlusmoviePool().execute('DELETE FROM episodes WHERE episodes_id = ?', [episodesId]);
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
        await getPlusmoviePool().execute('UPDATE videos SET title = ?, tmdbid = ? WHERE videos_id = ?', [
          toSqlParam(title),
          toSqlParam(tmdbid),
          toSqlParam(videosId),
        ]);
        sendJson(res, 200, { message: 'Actualizado correctamente' });
        return;
      }

      if (method === 'PUT' || episodesId !== null) {
        if (!episodesId) {
          sendJson(res, 400, { error: 'Falta el parámetro episodes_id para actualizar' });
          return;
        }
        await getPlusmoviePool().execute(
          'UPDATE episodes SET episodes_name = ?, file_url = ?, `order` = ?, last_ep_added = ? WHERE episodes_id = ?',
          [
            toSqlParam(input.episodes_name),
            toSqlParam(input.file_url),
            toSqlParam(input.order),
            currentDate,
            toSqlParam(episodesId),
          ]
        );
        sendJson(res, 200, { message: 'Actualizado correctamente', last_ep_added: currentDate });
      } else {
        const cleanSeasonsId = toSqlParam(seasonsId);
        const cleanVideosId = toSqlParam(videosId);
        if (!cleanSeasonsId || !cleanVideosId) {
          sendJson(res, 400, { error: 'Faltan parámetros requeridos (seasons_id o videos_id) para el registro' });
          return;
        }
        const cleanFileUrl = trimNullableUrl(input.file_url);
        if (cleanFileUrl) {
          const [existingRows] = await getPlusmoviePool().query<RowDataPacket[]>(
            'SELECT episodes_id, file_url FROM episodes WHERE videos_id = ? AND seasons_id = ?',
            [cleanVideosId, cleanSeasonsId]
          );
          const duplicateRow = findDuplicateUrlRow(existingRows, 'file_url', cleanFileUrl);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ episodes_id: String(duplicateRow.episodes_id) }));
            return;
          }
        }
        const streamKey = generateStreamKey(12);
        const [result] = await getPlusmoviePool().execute<ResultSetHeader>(
          'INSERT INTO episodes (stream_key, videos_id, seasons_id, episodes_name, file_source, source_type, file_url, `order`, date_added, last_ep_added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            streamKey,
            cleanVideosId,
            cleanSeasonsId,
            toSqlParam(input.episodes_name),
            toSqlParam(input.file_source ?? 'embed'),
            toSqlParam(input.source_type ?? 'link'),
            cleanFileUrl,
            toSqlParam(input.order),
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
  } catch (err: unknown) {
    sendJson(res, 500, { error: 'Error en series_plusmovie: ' + errorMessage(err) });
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
    const [rows] = await getPlusmoviePool().query<RowDataPacket[]>(
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
  } catch (err: unknown) {
    sendJson(res, 500, { success: false, error: 'Error al procesar el login: ' + errorMessage(err) });
  }
}

// ============================================================================
// 8. /update_version.php
// ============================================================================
async function handleUpdateVersion(req: IncomingMessage, res: ServerResponse, staticDir: string): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { success: false, error: 'Método no permitido' });
    return;
  }

  const input = await readBody(req);
  let version: string | null = null;

  if (input && typeof input === 'object') {
    if (isValidStreamNexusVersion(input.version)) {
      version = input.version;
    } else if (typeof input.v === 'number' && Number.isFinite(input.v)) {
      const d = Math.max(0, Math.min(9, Math.trunc(input.v)));
      version = `${d}.0`;
    }
  }

  if (!version || !isValidStreamNexusVersion(version)) {
    sendJson(res, 400, {
      success: false,
      error: 'Payload inválido. Se espera {"version":"X.X"} con X en [0-9]',
    });
    return;
  }

  try {
    fs.mkdirSync(staticDir, { recursive: true });
    const targetFile = path.join(staticDir, 'v-streamnexus.json');
    const fallbackTemplate = path.resolve(process.cwd(), 'public', 'v-streamnexus.json');

    let current: Record<string, unknown> = {};
    const existingSource = fs.existsSync(targetFile)
      ? targetFile
      : fs.existsSync(fallbackTemplate)
        ? fallbackTemplate
        : null;

    if (existingSource) {
      try {
        const parsed = JSON.parse(fs.readFileSync(existingSource, 'utf-8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          current = parsed as Record<string, unknown>;
        }
      } catch {
        // ignore invalid existing json
      }
    }

    current.version = version;
    fs.writeFileSync(targetFile, JSON.stringify(current, null, 2) + '\n', 'utf-8');
    sendJson(res, 200, { success: true, version });
  } catch (err: unknown) {
    sendJson(res, 500, {
      success: false,
      error: 'No se pudo escribir v-streamnexus.json: ' + errorMessage(err),
    });
  }
}

export interface HandleApiOptions {
  staticDir?: string;
  pathnameOverride?: string;
}

/**
 * Manejador HTTP compartido para todos los endpoints .php de Dooplex / Docines / PlusMovie.
 * Usado por el plugin de Vite y por el servidor standalone Node.js (Namecheap).
 */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: HandleApiOptions = {}
): Promise<boolean> {
  if (!req.url) return false;

  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = options.pathnameOverride || parsedUrl.pathname;
  const staticDir = path.resolve(options.staticDir || path.join(process.cwd(), 'dist'));

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
    '/upload_app.php',
  ]);

  if (!handledRoutes.has(pathname)) {
    return false;
  }

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return true;
  }

  switch (pathname) {
    case '/login_dooplex.php':
      await handleLoginDooplex(req, res);
      return true;
    case '/dashboard.php':
      await handleDashboard(req, res);
      return true;
    case '/movie_dooplex.php':
      await handleMovieDooplex(req, res, parsedUrl.searchParams);
      return true;
    case '/series_dooplex.php':
      await handleSeriesDooplex(req, res, parsedUrl.searchParams);
      return true;
    case '/anime_dooplex.php':
      await handleAnimeDooplex(req, res, parsedUrl.searchParams);
      return true;
    case '/movie_docines.php':
      await handleMovieDocines(req, res, parsedUrl.searchParams);
      return true;
    case '/series_docines.php':
      await handleSeriesDocines(req, res, parsedUrl.searchParams);
      return true;
    case '/movie_plusmovie.php':
      await handleMoviePlusmovie(req, res, parsedUrl.searchParams);
      return true;
    case '/series_plusmovie.php':
      await handleSeriesPlusmovie(req, res, parsedUrl.searchParams);
      return true;
    case '/login_plusmovie.php':
      await handleLoginPlusmovie(req, res);
      return true;
    case '/update_version.php':
      await handleUpdateVersion(req, res, staticDir);
      return true;
    case '/upload_app.php':
      await handleUploadApkRequest(req, res, staticDir);
      return true;
    default:
      return false;
  }
}

// ============================================================================
// Vite Plugin Export
// ============================================================================
export function integratedApiPlugin(): Plugin {
  const attachMiddleware = (middlewares: Connect.Server, staticDir: string) => {
    middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const handled = await handleApiRequest(req, res, { staticDir });
      if (!handled) {
        next();
      }
    });
  };

  return {
    name: 'integrated-dooplex-api',
    configureServer(server) {
      attachMiddleware(server.middlewares, path.resolve(process.cwd(), 'public'));
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares, path.resolve(process.cwd(), 'dist'));
    },
  };
}
