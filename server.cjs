var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server/nodeServer.ts
var import_node_path5 = __toESM(require("node:path"), 1);

// server/env.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
function parseEnvContent(content) {
  const result = {};
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const line = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eqIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2 || value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}
var loadedDirs = /* @__PURE__ */ new Set();
function loadEnvFiles(baseDirs = [process.cwd()], options) {
  const nodeEnv = process.env.NODE_ENV?.trim();
  const candidates = [".env", ".env.local"];
  if (nodeEnv) {
    candidates.push(`.env.${nodeEnv}`, `.env.${nodeEnv}.local`);
  }
  const uniqueDirs = Array.from(new Set(baseDirs.map((d) => import_node_path.default.resolve(d))));
  for (const dir of uniqueDirs) {
    if (!options?.force && loadedDirs.has(dir)) continue;
    loadedDirs.add(dir);
    for (const fileName of candidates) {
      const fullPath = import_node_path.default.join(dir, fileName);
      if (!import_node_fs.default.existsSync(fullPath)) continue;
      try {
        const raw = import_node_fs.default.readFileSync(fullPath, "utf-8");
        const parsed = parseEnvContent(raw);
        for (const [k, v] of Object.entries(parsed)) {
          if (process.env[k] === void 0) {
            process.env[k] = v;
          }
        }
      } catch {
      }
    }
  }
}

// server/nodeApp.ts
var import_node_http = __toESM(require("node:http"), 1);
var import_node_fs4 = __toESM(require("node:fs"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);

// server/apiPlugin.ts
var import_node_crypto2 = __toESM(require("node:crypto"), 1);
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
var import_promise = __toESM(require("mysql2/promise"), 1);
var import_bcryptjs = __toESM(require("bcryptjs"), 1);

// server/duplicateCheck.ts
function normalizeComparableUrl(rawUrl) {
  const trimmed = rawUrl === null || rawUrl === void 0 ? "" : String(rawUrl).trim();
  if (!trimmed) return "";
  const withProtocol = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  try {
    const parsed = new URL(withProtocol);
    const protocol = parsed.protocol === "http:" ? "https:" : parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const port = parsed.port ? `:${parsed.port}` : "";
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${protocol}//${hostname}${port}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return withProtocol.replace(/^http:\/\//i, "https://").replace(/\/+$/, "");
  }
}
function trimNullableUrl(rawUrl) {
  if (rawUrl === null || rawUrl === void 0) return null;
  const trimmed = String(rawUrl).trim();
  return trimmed === "" ? null : trimmed;
}
function findDuplicateUrlRow(rows, urlColumn, incomingUrl) {
  const target = normalizeComparableUrl(incomingUrl);
  if (!target) return null;
  for (const row of rows) {
    if (normalizeComparableUrl(row[urlColumn]) === target) {
      return row;
    }
  }
  return null;
}
function computeNextMissingOrder(orders) {
  let nextOrder = 1;
  for (const current of orders) {
    if (current < nextOrder) continue;
    if (current === nextOrder) {
      nextOrder++;
      continue;
    }
    if (current > nextOrder) break;
  }
  return nextOrder;
}
function buildDuplicateResponse(extraData = {}) {
  return {
    success: true,
    duplicate: true,
    skipped: true,
    message: "El enlace ya existe en la BD (omitido)",
    data: {
      ...extraData,
      duplicate: true
    }
  };
}

// server/uploadHandler.ts
var import_node_crypto = __toESM(require("node:crypto"), 1);
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var MAX_HEADER_BUFFER = 64 * 1024;
var MAX_APK_BYTES = Number(process.env.MAX_APK_UPLOAD_BYTES || 200 * 1024 * 1024);
function extractBoundary(contentType) {
  if (!contentType || !/multipart\/form-data/i.test(contentType)) {
    return null;
  }
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  return (match?.[1] || match?.[2] || "").trim() || null;
}
function parsePartDisposition(headerText) {
  const dispLine = headerText.split(/\r?\n/).find((line) => /^content-disposition\s*:/i.test(line));
  if (!dispLine) return {};
  const nameMatch = dispLine.match(/\bname="([^"]*)"/i);
  const filenameMatch = dispLine.match(/\bfilename="([^"]*)"/i);
  return {
    name: nameMatch?.[1],
    filename: filenameMatch?.[1]
  };
}
var ApkUploadHttpError = class extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
async function streamMultipartApkToFile(req, destinationDir, targetFilename = "app-streamnexus.apk") {
  const boundary = extractBoundary(req.headers["content-type"] ? String(req.headers["content-type"]) : void 0);
  if (!boundary) {
    throw new ApkUploadHttpError(400, "No se recibi\xF3 ning\xFAn archivo");
  }
  import_node_fs2.default.mkdirSync(destinationDir, { recursive: true });
  const destinationPath = import_node_path2.default.join(destinationDir, targetFilename);
  const tmpPath = import_node_path2.default.join(
    destinationDir,
    `.tmp-${targetFilename}-${process.pid}-${import_node_crypto.default.randomBytes(4).toString("hex")}`
  );
  const firstBoundary = Buffer.from(`--${boundary}`);
  const nextBoundary = Buffer.from(`\r
--${boundary}`);
  let state = "preamble";
  let buffer = Buffer.alloc(0);
  let writeStream = null;
  let bytesWritten = 0;
  let fileReceived = false;
  const closeStream = async () => {
    const stream = writeStream;
    if (!stream) return;
    writeStream = null;
    await new Promise((resolve, reject) => {
      stream.on("error", reject);
      stream.end(() => resolve());
    });
  };
  const cleanupTmp = () => {
    if (writeStream) {
      try {
        writeStream.destroy();
      } catch {
      }
      writeStream = null;
    }
    try {
      if (import_node_fs2.default.existsSync(tmpPath)) {
        import_node_fs2.default.unlinkSync(tmpPath);
      }
    } catch {
    }
  };
  const writeFileChunk = async (chunk) => {
    if (chunk.length === 0) return;
    bytesWritten += chunk.length;
    if (bytesWritten > MAX_APK_BYTES) {
      throw new ApkUploadHttpError(413, "El archivo APK excede el tama\xF1o m\xE1ximo permitido");
    }
    if (!writeStream) {
      throw new ApkUploadHttpError(500, "No se pudo escribir el archivo en el servidor");
    }
    const canContinue = writeStream.write(chunk);
    if (!canContinue) {
      await new Promise((resolve, reject) => {
        writeStream.once("drain", resolve);
        writeStream.once("error", reject);
      });
    }
  };
  try {
    for await (const rawChunk of req) {
      const chunk = typeof rawChunk === "string" ? Buffer.from(rawChunk) : rawChunk;
      if (state === "done") continue;
      buffer = buffer.length > 0 ? Buffer.concat([buffer, chunk]) : chunk;
      let progress = true;
      while (progress) {
        progress = false;
        if (state === "preamble" || state === "skip_part") {
          const targetBoundary = state === "preamble" ? firstBoundary : nextBoundary;
          const idx = buffer.indexOf(targetBoundary);
          if (idx === -1) {
            if (buffer.length > targetBoundary.length) {
              buffer = buffer.subarray(buffer.length - targetBoundary.length);
            }
            break;
          }
          buffer = buffer.subarray(idx + targetBoundary.length);
          if (buffer.length >= 2 && buffer.subarray(0, 2).toString() === "--") {
            state = "done";
            break;
          }
          if (buffer.length >= 2 && buffer[0] === 13 && buffer[1] === 10) {
            buffer = buffer.subarray(2);
          }
          state = "headers";
          progress = true;
        } else if (state === "headers") {
          const headerEnd = buffer.indexOf("\r\n\r\n");
          if (headerEnd === -1) {
            if (buffer.length > MAX_HEADER_BUFFER) {
              throw new ApkUploadHttpError(400, "Cabeceras multipart demasiado grandes");
            }
            break;
          }
          const headerText = buffer.subarray(0, headerEnd).toString("utf-8");
          buffer = buffer.subarray(headerEnd + 4);
          const disp = parsePartDisposition(headerText);
          if (disp.filename !== void 0) {
            const ext = import_node_path2.default.extname(disp.filename).toLowerCase();
            if (ext !== ".apk") {
              throw new ApkUploadHttpError(400, "El archivo debe ser .apk");
            }
            fileReceived = true;
            writeStream = import_node_fs2.default.createWriteStream(tmpPath);
            state = "file";
          } else {
            state = "skip_part";
          }
          progress = true;
        } else if (state === "file") {
          const idx = buffer.indexOf(nextBoundary);
          if (idx !== -1) {
            await writeFileChunk(buffer.subarray(0, idx));
            await closeStream();
            buffer = buffer.subarray(idx + nextBoundary.length);
            state = "done";
            break;
          }
          const safeFlushLen = buffer.length - nextBoundary.length;
          if (safeFlushLen > 0) {
            await writeFileChunk(buffer.subarray(0, safeFlushLen));
            buffer = buffer.subarray(safeFlushLen);
          }
          break;
        }
      }
    }
    await closeStream();
    if (!fileReceived || bytesWritten === 0) {
      throw new ApkUploadHttpError(400, "No se recibi\xF3 ning\xFAn archivo");
    }
    import_node_fs2.default.renameSync(tmpPath, destinationPath);
    return { filename: targetFilename, bytes: bytesWritten };
  } catch (err) {
    cleanupTmp();
    throw err;
  }
}
async function handleUploadApkRequest(req, res, staticDir) {
  const setCors = (status, body) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.end(JSON.stringify(body));
  };
  if (req.method === "OPTIONS") {
    setCors(200, { ok: true });
    return;
  }
  if (req.method !== "POST") {
    setCors(405, { success: false, error: "M\xE9todo no permitido" });
    return;
  }
  try {
    const saved = await streamMultipartApkToFile(req, staticDir, "app-streamnexus.apk");
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    const url = `${proto}://${host}/${saved.filename}`;
    setCors(200, {
      success: true,
      filename: saved.filename,
      url
    });
  } catch (err) {
    if (err instanceof ApkUploadHttpError) {
      setCors(err.status, { success: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : "No se pudo guardar el archivo en el servidor";
    setCors(500, { success: false, error: message });
  }
}

// src/lib/versioning.ts
var STREAMNEXUS_VERSION_REGEX = /^[0-9]\.[0-9]$/;
function isValidStreamNexusVersion(value) {
  return typeof value === "string" && STREAMNEXUS_VERSION_REGEX.test(value);
}

// server/apiPlugin.ts
var pools = {};
function getDbConfig(prefix) {
  loadEnvFiles();
  const host = process.env[`${prefix}_DB_HOST`] || process.env.DB_HOST || "localhost";
  const port = Number(process.env[`${prefix}_DB_PORT`] || process.env.DB_PORT || 3306);
  const user = process.env[`${prefix}_DB_USER`] || process.env.DB_USER || "";
  const password = process.env[`${prefix}_DB_PASSWORD`] ?? process.env.DB_PASSWORD ?? "";
  const database = process.env[`${prefix}_DB_NAME`] || process.env[`${prefix}_DB_DATABASE`] || process.env.DB_NAME || "";
  if (!user || !database) {
    throw new Error(
      `Faltan variables de entorno de MySQL para ${prefix} (${prefix}_DB_NAME, ${prefix}_DB_USER, ${prefix}_DB_PASSWORD)`
    );
  }
  return { host, port, user, password, database };
}
function getPool(prefix) {
  const existing = pools[prefix];
  if (existing) return existing;
  const cfg = getDbConfig(prefix);
  const connectionLimit = Number(
    prefix === "DOOPLEX" ? process.env.DB_POOL_LIMIT || 3 : process.env.DB_SUB_POOL_LIMIT || 2
  );
  const pool = import_promise.default.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: Number.isFinite(connectionLimit) && connectionLimit > 0 ? connectionLimit : 2,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 1e4
  });
  pools[prefix] = pool;
  return pool;
}
var getDooplexPool = () => getPool("DOOPLEX");
var getDocinesPool = () => getPool("DOCINES");
var getPlusmoviePool = () => getPool("PLUSMOVIE");
function generateStreamKey(length = 12) {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let key = "";
  for (let i = 0; i < length; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}
function nowDatetime() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
}
function md5(str) {
  return import_node_crypto2.default.createHash("md5").update(str).digest("hex");
}
function verifyPassword(plain, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith("$2y$") || storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$")) {
    const normalized = storedHash.replace(/^\$2y\$/, "$2a$");
    try {
      if (import_bcryptjs.default.compareSync(plain, normalized)) return true;
    } catch {
    }
  }
  if (storedHash.toLowerCase() === md5(plain).toLowerCase()) return true;
  if (storedHash === plain) return true;
  return false;
}
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With, X-Proxy-Headers, X-Proxy-Cookies"
  );
  res.end(JSON.stringify(payload));
}
function toSqlParam(val) {
  if (val === void 0 || val === null) return null;
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return val;
  return String(val);
}
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
function buildDooplexVideoUpdate(input, includeAnimeEpisodeId = false) {
  const updateFields = [];
  const values = [];
  if (includeAnimeEpisodeId && input.anime_episode_id !== void 0 && String(input.anime_episode_id).trim() !== "") {
    updateFields.push("anime_episode_id = ?");
    values.push(toSqlParam(input.anime_episode_id));
  }
  for (const [key, col] of [
    ["server", "server"],
    ["header", "header"],
    ["link", "`link`"],
    ["lang", "lang"]
  ]) {
    if (input[key] !== void 0 && String(input[key]).trim() !== "") {
      updateFields.push(`${col} = ?`);
      values.push(String(input[key]).trim());
    }
  }
  if ("embed" in input) {
    updateFields.push("embed = ?");
    values.push(typeof input.embed === "boolean" ? input.embed ? 1 : 0 : toSqlParam(input.embed));
  }
  if ("youtubelink" in input) {
    updateFields.push("youtubelink = ?");
    values.push(toSqlParam(input.youtubelink));
  }
  if ("hls" in input) {
    updateFields.push("hls = ?");
    values.push(typeof input.hls === "boolean" ? input.hls ? 1 : 0 : toSqlParam(input.hls));
  }
  if ("supported_hosts" in input) {
    updateFields.push("supported_hosts = ?");
    values.push(
      Array.isArray(input.supported_hosts) ? JSON.stringify(input.supported_hosts) : toSqlParam(input.supported_hosts)
    );
  }
  return { updateFields, values };
}
function extractDooplexVideoInsert(input) {
  return {
    server: toSqlParam(input.server),
    header: toSqlParam(input.header),
    link: trimNullableUrl(input.link),
    lang: toSqlParam(input.lang),
    embed: typeof input.embed === "boolean" ? input.embed ? 1 : 0 : toSqlParam(input.embed),
    youtubelink: toSqlParam(input.youtubelink),
    hls: typeof input.hls === "boolean" ? input.hls ? 1 : 0 : toSqlParam(input.hls),
    supportedHosts: Array.isArray(input.supported_hosts) ? JSON.stringify(input.supported_hosts) : toSqlParam(input.supported_hosts)
  };
}
async function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          resolve(parsed);
          return;
        }
      } catch {
      }
      const params = new URLSearchParams(raw);
      const obj = {};
      for (const [k, v] of params.entries()) {
        obj[k] = v;
      }
      resolve(obj);
    });
    req.on("error", () => resolve({}));
  });
}
async function handleLoginDooplex(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { success: false, error: "M\xE9todo no permitido" });
    return;
  }
  const input = await readBody(req);
  const email = input.email ? String(input.email).trim() : "";
  const password = input.password ? String(input.password) : "";
  if (!email || !password) {
    sendJson(res, 400, { success: false, error: "Faltan par\xE1metros (email, password)" });
    return;
  }
  try {
    const [rows] = await getDooplexPool().query(
      "SELECT * FROM `users` WHERE `email` = ? LIMIT 1",
      [email]
    );
    const user = rows[0];
    if (!user) {
      sendJson(res, 401, { success: false, error: "Credenciales inv\xE1lidas" });
      return;
    }
    const storedPassword = String(user.password ?? "");
    if (!verifyPassword(password, storedPassword)) {
      sendJson(res, 401, { success: false, error: "Credenciales inv\xE1lidas" });
      return;
    }
    const role = user.role ?? (user.premuim !== void 0 ? user.premuim ? "premium" : "user" : "admin");
    const username = user.name ?? user.username ?? email;
    sendJson(res, 200, {
      success: true,
      message: "Login correcto",
      data: {
        username,
        role
      }
    });
  } catch (err) {
    sendJson(res, 500, { success: false, error: "Error al procesar el login: " + errorMessage(err) });
  }
}
async function handleDashboard(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { success: false, error: "M\xE9todo no permitido" });
    return;
  }
  try {
    const [[moviesRow]] = await getDooplexPool().query("SELECT COUNT(*) AS total FROM movies");
    const [[seriesRow]] = await getDooplexPool().query("SELECT COUNT(*) AS total FROM series");
    const [[animesRow]] = await getDooplexPool().query("SELECT COUNT(*) AS total FROM animes");
    sendJson(res, 200, {
      success: true,
      data: {
        dooplex: {
          movies: Number(moviesRow?.total ?? 0),
          series: Number(seriesRow?.total ?? 0),
          animes: Number(animesRow?.total ?? 0)
        }
      }
    });
  } catch (err) {
    sendJson(res, 500, {
      success: false,
      error: "Error al obtener conteos del dashboard: " + errorMessage(err)
    });
  }
}
async function handleMovieDooplex(req, res, query) {
  const method = req.method || "GET";
  try {
    if (method === "GET") {
      const tmdbId = query.get("tmdb_id");
      const movieId = query.get("movie_id");
      if (tmdbId) {
        const [rows] = await getDooplexPool().query(
          "SELECT id, title FROM movies WHERE tmdb_id = ?",
          [tmdbId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else if (movieId) {
        const [rows] = await getDooplexPool().query(
          "SELECT id, server, header, link, lang, embed, youtubelink, hls, supported_hosts FROM movie_videos WHERE movie_id = ?",
          [movieId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else {
        sendJson(res, 400, { error: "Faltan par\xE1metros (tmdb_id o movie_id)" });
      }
      return;
    }
    if (method === "DELETE") {
      let id = query.get("id");
      if (!id) {
        const input = await readBody(req);
        if (input.id !== void 0) id = String(input.id);
      }
      if (!id) {
        sendJson(res, 400, { error: "Falta el par\xE1metro id para eliminar" });
        return;
      }
      await getDooplexPool().execute("DELETE FROM movie_videos WHERE id = ?", [id]);
      sendJson(res, 200, { success: true, message: "Eliminado correctamente" });
      return;
    }
    if (method === "POST" || method === "PUT") {
      const input = await readBody(req);
      const id = input.id ?? null;
      const currentTime = nowDatetime();
      if (method === "PUT" || id !== null) {
        if (!id) {
          sendJson(res, 400, { error: "Falta el par\xE1metro id para actualizar" });
          return;
        }
        const { updateFields, values } = buildDooplexVideoUpdate(input, false);
        if (updateFields.length === 0) {
          sendJson(res, 200, { message: "No se enviaron datos v\xE1lidos para actualizar o no hubieron cambios" });
          return;
        }
        updateFields.push("updated_at = ?");
        values.push(currentTime);
        values.push(toSqlParam(id));
        await getDooplexPool().execute(`UPDATE movie_videos SET ${updateFields.join(", ")} WHERE id = ?`, values);
        sendJson(res, 200, {
          success: true,
          message: "Actualizado correctamente",
          updated_at: currentTime
        });
      } else {
        const movieId = toSqlParam(input.movie_id);
        if (!movieId) {
          sendJson(res, 400, { error: "Falta el par\xE1metro movie_id para el registro" });
          return;
        }
        const { server, header, link, lang, embed, youtubelink, hls, supportedHosts } = extractDooplexVideoInsert(input);
        if (link) {
          const [existingRows] = await getDooplexPool().query(
            "SELECT id, `link` FROM movie_videos WHERE movie_id = ?",
            [movieId]
          );
          const duplicateRow = findDuplicateUrlRow(existingRows, "link", link);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ id: String(duplicateRow.id) }));
            return;
          }
        }
        const [result] = await getDooplexPool().execute(
          "INSERT INTO movie_videos (movie_id, server, header, `link`, lang, embed, youtubelink, hls, supported_hosts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [movieId, server, header, link, lang, embed, youtubelink, hls, supportedHosts, currentTime, currentTime]
        );
        sendJson(res, 200, {
          success: true,
          message: "Registrado correctamente",
          data: {
            id: String(result.insertId),
            created_at: currentTime,
            updated_at: currentTime
          }
        });
      }
      return;
    }
    sendJson(res, 405, { error: "M\xE9todo no permitido" });
  } catch (err) {
    sendJson(res, 500, { error: "Error en movie_dooplex: " + errorMessage(err) });
  }
}
async function handleSeriesDooplex(req, res, query) {
  const method = req.method || "GET";
  try {
    if (method === "GET") {
      const tmdbId = query.get("tmdb_id");
      const serieId = query.get("serie_id");
      const seasonId = query.get("season_id");
      const episodeId = query.get("episode_id");
      if (tmdbId) {
        const [rows] = await getDooplexPool().query("SELECT id, name FROM series WHERE tmdb_id = ?", [
          tmdbId
        ]);
        sendJson(res, 200, { success: true, data: rows });
      } else if (serieId) {
        const [rows] = await getDooplexPool().query(
          "SELECT id, season_number, name FROM seasons WHERE serie_id = ?",
          [serieId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else if (seasonId) {
        const [rows] = await getDooplexPool().query(
          "SELECT id, episode_number, name FROM episodes WHERE season_id = ?",
          [seasonId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else if (episodeId) {
        const [rows] = await getDooplexPool().query(
          "SELECT id, server, header, link, lang, embed, youtubelink, hls, supported_hosts FROM serie_videos WHERE episode_id = ?",
          [episodeId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else {
        sendJson(res, 400, { error: "Faltan par\xE1metros (tmdb_id, serie_id, season_id o episode_id)" });
      }
      return;
    }
    if (method === "DELETE") {
      let id = query.get("id");
      if (!id) {
        const input = await readBody(req);
        if (input.id !== void 0) id = String(input.id);
      }
      if (!id) {
        sendJson(res, 400, { error: "Falta el par\xE1metro id para eliminar" });
        return;
      }
      await getDooplexPool().execute("DELETE FROM serie_videos WHERE id = ?", [id]);
      sendJson(res, 200, { success: true, message: "Eliminado correctamente" });
      return;
    }
    if (method === "POST" || method === "PUT") {
      const input = await readBody(req);
      const id = input.id ?? null;
      const episodesId = input.episodes_id ?? null;
      const currentTime = nowDatetime();
      if (episodesId !== null) {
        if (!episodesId) {
          sendJson(res, 400, { error: "Falta el par\xE1metro episodes_id para actualizar" });
          return;
        }
        const updateFields = [];
        const values = [];
        for (const k of ["name", "overview", "still_path", "still_path_tv"]) {
          if (input[k] !== void 0 && input[k] !== null && String(input[k]).trim() !== "") {
            updateFields.push(`${k} = ?`);
            values.push(toSqlParam(input[k]));
          }
        }
        if (updateFields.length === 0) {
          sendJson(res, 200, { message: "No hay datos v\xE1lidos para actualizar" });
          return;
        }
        values.push(toSqlParam(episodesId));
        await getDooplexPool().execute(`UPDATE episodes SET ${updateFields.join(", ")} WHERE id = ?`, values);
        sendJson(res, 200, { success: true, message: "Actualizado correctamente" });
      } else if (method === "PUT" || id !== null) {
        if (!id) {
          sendJson(res, 400, { error: "Falta el par\xE1metro id para actualizar" });
          return;
        }
        const { updateFields, values } = buildDooplexVideoUpdate(input, false);
        if (updateFields.length === 0) {
          sendJson(res, 200, { message: "No se enviaron datos v\xE1lidos para actualizar o no hubieron cambios" });
          return;
        }
        updateFields.push("updated_at = ?");
        values.push(currentTime);
        values.push(toSqlParam(id));
        await getDooplexPool().execute(`UPDATE serie_videos SET ${updateFields.join(", ")} WHERE id = ?`, values);
        sendJson(res, 200, {
          success: true,
          message: "Actualizado correctamente",
          updated_at: currentTime
        });
      } else {
        const episodeId = toSqlParam(input.episode_id);
        if (!episodeId) {
          sendJson(res, 400, { error: "Falta el par\xE1metro episode_id para el registro" });
          return;
        }
        const { server, header, link, lang, embed, youtubelink, hls, supportedHosts } = extractDooplexVideoInsert(input);
        if (link) {
          const [existingRows] = await getDooplexPool().query(
            "SELECT id, `link` FROM serie_videos WHERE episode_id = ?",
            [episodeId]
          );
          const duplicateRow = findDuplicateUrlRow(existingRows, "link", link);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ id: String(duplicateRow.id) }));
            return;
          }
        }
        const [result] = await getDooplexPool().execute(
          "INSERT INTO serie_videos (episode_id, server, header, `link`, lang, embed, youtubelink, hls, supported_hosts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [episodeId, server, header, link, lang, embed, youtubelink, hls, supportedHosts, currentTime, currentTime]
        );
        sendJson(res, 200, {
          success: true,
          message: "Registrado correctamente",
          data: {
            id: String(result.insertId),
            created_at: currentTime,
            updated_at: currentTime
          }
        });
      }
      return;
    }
    sendJson(res, 405, { error: "M\xE9todo no permitido" });
  } catch (err) {
    sendJson(res, 500, { error: "Error en series_dooplex: " + errorMessage(err) });
  }
}
async function handleAnimeDooplex(req, res, query) {
  const method = req.method || "GET";
  try {
    if (method === "GET") {
      const tmdbId = query.get("tmdb_id");
      const animeId = query.get("anime_id");
      const animeSeasonId = query.get("anime_season_id");
      const animeEpisodeId = query.get("anime_episode_id");
      if (tmdbId) {
        const [rows] = await getDooplexPool().query("SELECT id, name FROM animes WHERE tmdb_id = ?", [
          tmdbId
        ]);
        sendJson(res, 200, { success: true, data: rows });
      } else if (animeId) {
        const [rows] = await getDooplexPool().query("SELECT * FROM anime_seasons WHERE anime_id = ?", [
          animeId
        ]);
        sendJson(res, 200, { success: true, data: rows });
      } else if (animeSeasonId) {
        const [rows] = await getDooplexPool().query(
          "SELECT id, episode_number, name FROM anime_episodes WHERE anime_season_id = ?",
          [animeSeasonId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else if (animeEpisodeId) {
        const [rows] = await getDooplexPool().query(
          "SELECT id, anime_episode_id, server, header, `link`, lang, embed, youtubelink, hls, supported_hosts FROM anime_videos WHERE anime_episode_id = ?",
          [animeEpisodeId]
        );
        sendJson(res, 200, { success: true, data: rows });
      } else {
        sendJson(res, 400, { error: "Faltan par\xE1metros (tmdb_id, anime_id, anime_season_id o anime_episode_id)" });
      }
      return;
    }
    if (method === "DELETE") {
      let id = query.get("id");
      if (!id) {
        const input = await readBody(req);
        if (input.id !== void 0) id = String(input.id);
      }
      if (!id) {
        sendJson(res, 400, { error: "Falta el par\xE1metro id para eliminar" });
        return;
      }
      await getDooplexPool().execute("DELETE FROM anime_videos WHERE id = ?", [id]);
      sendJson(res, 200, { success: true, message: "Eliminado correctamente" });
      return;
    }
    if (method === "POST" || method === "PUT") {
      const input = await readBody(req);
      const id = input.id ?? null;
      const animeEpisodesId = input.anime_episodes_id ?? null;
      const currentTime = nowDatetime();
      if (animeEpisodesId !== null) {
        if (!animeEpisodesId) {
          sendJson(res, 400, { error: "Falta el par\xE1metro anime_episodes_id para actualizar" });
          return;
        }
        const updateFields = [];
        const values = [];
        for (const k of ["name", "overview", "still_path", "still_path_tv"]) {
          if (input[k] !== void 0 && input[k] !== null && String(input[k]).trim() !== "") {
            updateFields.push(`${k} = ?`);
            values.push(toSqlParam(input[k]));
          }
        }
        if (updateFields.length === 0) {
          sendJson(res, 200, { message: "No hay datos v\xE1lidos para actualizar" });
          return;
        }
        values.push(toSqlParam(animeEpisodesId));
        await getDooplexPool().execute(`UPDATE anime_episodes SET ${updateFields.join(", ")} WHERE id = ?`, values);
        sendJson(res, 200, { success: true, message: "Actualizado correctamente" });
      } else if (method === "PUT" || id !== null) {
        if (!id) {
          sendJson(res, 400, { error: "Falta el par\xE1metro id para actualizar" });
          return;
        }
        const { updateFields, values } = buildDooplexVideoUpdate(input, true);
        if (updateFields.length === 0) {
          sendJson(res, 200, { message: "No se enviaron datos v\xE1lidos para actualizar o no hubieron cambios" });
          return;
        }
        updateFields.push("updated_at = ?");
        values.push(currentTime);
        values.push(toSqlParam(id));
        await getDooplexPool().execute(`UPDATE anime_videos SET ${updateFields.join(", ")} WHERE id = ?`, values);
        sendJson(res, 200, {
          success: true,
          message: "Actualizado correctamente",
          updated_at: currentTime
        });
      } else {
        const animeEpisodeId = toSqlParam(input.anime_episode_id);
        if (!animeEpisodeId) {
          sendJson(res, 400, { error: "Falta el par\xE1metro anime_episode_id para el registro" });
          return;
        }
        const { server, header, link, lang, embed, youtubelink, hls, supportedHosts } = extractDooplexVideoInsert(input);
        if (link) {
          const [existingRows] = await getDooplexPool().query(
            "SELECT id, `link` FROM anime_videos WHERE anime_episode_id = ?",
            [animeEpisodeId]
          );
          const duplicateRow = findDuplicateUrlRow(existingRows, "link", link);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ id: String(duplicateRow.id) }));
            return;
          }
        }
        const [result] = await getDooplexPool().execute(
          "INSERT INTO anime_videos (anime_episode_id, server, header, `link`, lang, embed, youtubelink, hls, supported_hosts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
            currentTime
          ]
        );
        sendJson(res, 200, {
          success: true,
          message: "Registrado correctamente",
          data: {
            id: String(result.insertId),
            created_at: currentTime,
            updated_at: currentTime
          }
        });
      }
      return;
    }
    sendJson(res, 405, { error: "M\xE9todo no permitido" });
  } catch (err) {
    sendJson(res, 500, { error: "Error en anime_dooplex: " + errorMessage(err) });
  }
}
async function handleMovieDocines(req, res, query) {
  const method = req.method || "GET";
  try {
    if (method === "GET") {
      const tmdbid = query.get("tmdbid");
      const movieId = query.get("movie_id");
      if (tmdbid) {
        const [rows] = await getDocinesPool().query("SELECT id, name FROM movies WHERE TMDB_ID = ?", [
          tmdbid
        ]);
        sendJson(res, 200, { data: rows });
      } else if (movieId) {
        const [rows] = await getDocinesPool().query(
          "SELECT id, name, url, quality, link_order FROM movie_play_links WHERE movie_id = ?",
          [movieId]
        );
        sendJson(res, 200, { data: rows });
      } else {
        sendJson(res, 200, { error: "Faltan par\xE1metros (tmdbid o movie_id)" });
      }
      return;
    }
    if (method === "DELETE") {
      let id = query.get("id");
      if (!id) {
        const input = await readBody(req);
        if (input.id !== void 0) id = String(input.id);
      }
      if (!id) {
        sendJson(res, 400, { error: "Falta el par\xE1metro id" });
        return;
      }
      await getDocinesPool().execute("DELETE FROM movie_play_links WHERE id = ?", [id]);
      sendJson(res, 200, { message: "Eliminado correctamente" });
      return;
    }
    if (method === "POST" || method === "PUT") {
      const input = await readBody(req);
      const id = input.id ?? null;
      const moviesId = input.movies_id ?? null;
      if (id !== null) {
        if (!id) {
          sendJson(res, 400, { error: "Falta el par\xE1metro id para actualizar" });
          return;
        }
        const updates = [];
        const values = [];
        for (const k of ["name", "url", "link_order", "quality"]) {
          if (input[k] !== void 0 && input[k] !== null && input[k] !== "") {
            updates.push(`${k} = ?`);
            values.push(toSqlParam(input[k]));
          }
        }
        if (updates.length === 0) {
          sendJson(res, 200, { message: "No hay datos v\xE1lidos para actualizar" });
          return;
        }
        values.push(toSqlParam(id));
        await getDocinesPool().execute(`UPDATE movie_play_links SET ${updates.join(", ")} WHERE id = ?`, values);
        sendJson(res, 200, { message: "Actualizado correctamente" });
      } else if (moviesId !== null) {
        if (!moviesId || !input.movie_name || String(input.movie_name).trim() === "") {
          sendJson(res, 400, { error: "Faltan par\xE1metros (movies_id o movie_name)" });
          return;
        }
        await getDocinesPool().execute("UPDATE movies SET name = ? WHERE id = ?", [
          toSqlParam(input.movie_name),
          toSqlParam(moviesId)
        ]);
        sendJson(res, 200, { message: "Actualizado correctamente" });
      } else if (method === "PUT") {
        sendJson(res, 400, { error: "Faltan par\xE1metros (id o movies_id)" });
      } else {
        const movieId = toSqlParam(input.movie_id);
        if (!movieId) {
          sendJson(res, 400, { error: "Falta el par\xE1metro movie_id para el registro" });
          return;
        }
        const cleanUrl = trimNullableUrl(input.url);
        const [existingRows] = await getDocinesPool().query(
          "SELECT id, url, link_order FROM movie_play_links WHERE movie_id = ? ORDER BY link_order ASC",
          [movieId]
        );
        if (cleanUrl) {
          const duplicateRow = findDuplicateUrlRow(existingRows, "url", cleanUrl);
          if (duplicateRow) {
            sendJson(
              res,
              200,
              buildDuplicateResponse({
                id: String(duplicateRow.id),
                link_order: Number(duplicateRow.link_order ?? 0)
              })
            );
            return;
          }
        }
        const nextLinkOrder = computeNextMissingOrder(existingRows.map((row) => Number(row.link_order ?? 0)));
        const [result] = await getDocinesPool().execute(
          "INSERT INTO movie_play_links (movie_id, name, url, quality, link_order, type, status, skip_available, link_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [movieId, toSqlParam(input.name), cleanUrl, toSqlParam(input.quality), nextLinkOrder, "Embed", 1, 0, 0]
        );
        sendJson(res, 200, {
          message: "Registrado correctamente",
          data: {
            id: String(result.insertId),
            link_order: nextLinkOrder
          }
        });
      }
      return;
    }
    sendJson(res, 405, { error: "M\xE9todo no permitido" });
  } catch (err) {
    sendJson(res, 500, { error: "Error en movie_docines: " + errorMessage(err) });
  }
}
async function handleSeriesDocines(req, res, query) {
  const method = req.method || "GET";
  try {
    if (method === "GET") {
      const tmdbid = query.get("tmdbid");
      const webSeriesId = query.get("web_series_id");
      const seasonId = query.get("season_id");
      const episodeId = query.get("episode_id");
      if (tmdbid) {
        const [rows] = await getDocinesPool().query("SELECT id, name FROM web_series WHERE TMDB_ID = ?", [
          tmdbid
        ]);
        sendJson(res, 200, { data: rows });
      } else if (webSeriesId) {
        const [rows] = await getDocinesPool().query(
          "SELECT id, Session_Name, season_order FROM web_series_seasons WHERE web_series_id = ?",
          [webSeriesId]
        );
        sendJson(res, 200, { data: rows });
      } else if (seasonId) {
        const [rows] = await getDocinesPool().query(
          "SELECT id, Episoade_Name, episoade_order FROM web_series_episoade WHERE season_id = ? ORDER BY episoade_order ASC, id ASC",
          [seasonId]
        );
        sendJson(res, 200, { data: rows });
      } else if (episodeId) {
        const [rows] = await getDocinesPool().query(
          "SELECT id, name, url, quality FROM episode_play_links WHERE episode_id = ?",
          [episodeId]
        );
        sendJson(res, 200, { data: rows });
      } else {
        sendJson(res, 200, { error: "Faltan par\xE1metros (tmdbid, web_series_id, season_id o episode_id)" });
      }
      return;
    }
    if (method === "DELETE") {
      let id = query.get("id");
      if (!id) {
        const input = await readBody(req);
        if (input.id !== void 0) id = String(input.id);
      }
      if (!id) {
        sendJson(res, 400, { error: "Falta el par\xE1metro id" });
        return;
      }
      await getDocinesPool().execute("DELETE FROM episode_play_links WHERE id = ?", [id]);
      sendJson(res, 200, { message: "Eliminado correctamente" });
      return;
    }
    if (method === "POST" || method === "PUT") {
      const input = await readBody(req);
      const id = input.id ?? null;
      const webSeriesEpisoadeId = input.web_series_episoade_id ?? input.episodes_id ?? null;
      if (webSeriesEpisoadeId !== null) {
        if (!webSeriesEpisoadeId) {
          sendJson(res, 400, { error: "Falta el par\xE1metro web_series_episoade_id para actualizar" });
          return;
        }
        const updates = [];
        const values = [];
        for (const k of ["Episoade_Name", "episoade_image", "episoade_description"]) {
          if (input[k] !== void 0 && input[k] !== null && String(input[k]).trim() !== "") {
            updates.push(`${k} = ?`);
            values.push(toSqlParam(input[k]));
          }
        }
        if (updates.length === 0) {
          sendJson(res, 200, { message: "No hay datos v\xE1lidos para actualizar" });
          return;
        }
        values.push(toSqlParam(webSeriesEpisoadeId));
        await getDocinesPool().execute(`UPDATE web_series_episoade SET ${updates.join(", ")} WHERE id = ?`, values);
        sendJson(res, 200, { message: "Actualizado correctamente" });
      } else if (id !== null) {
        if (!id) {
          sendJson(res, 400, { error: "Falta el par\xE1metro id para actualizar" });
          return;
        }
        const updates = [];
        const values = [];
        for (const k of ["name", "url", "quality"]) {
          if (input[k] !== void 0 && input[k] !== null && input[k] !== "") {
            updates.push(`${k} = ?`);
            values.push(toSqlParam(input[k]));
          }
        }
        if (updates.length === 0) {
          sendJson(res, 200, { message: "No hay datos v\xE1lidos para actualizar" });
          return;
        }
        values.push(toSqlParam(id));
        await getDocinesPool().execute(`UPDATE episode_play_links SET ${updates.join(", ")} WHERE id = ?`, values);
        sendJson(res, 200, { message: "Actualizado correctamente" });
      } else if (method === "PUT") {
        sendJson(res, 400, { error: "Faltan par\xE1metros (id o web_series_episoade_id)" });
      } else {
        const episodeId = toSqlParam(input.episode_id);
        if (!episodeId) {
          sendJson(res, 400, { error: "Falta el par\xE1metro episode_id para el registro" });
          return;
        }
        const cleanUrl = trimNullableUrl(input.url);
        const [existingRows] = await getDocinesPool().query(
          "SELECT id, url FROM episode_play_links WHERE episode_id = ?",
          [episodeId]
        );
        if (cleanUrl) {
          const duplicateRow = findDuplicateUrlRow(existingRows, "url", cleanUrl);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ id: String(duplicateRow.id) }));
            return;
          }
        }
        const linkOrder = existingRows.length + 1;
        const [result] = await getDocinesPool().execute(
          "INSERT INTO episode_play_links (name, episode_id, url, quality, status, type, skip_available, link_type, link_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [toSqlParam(input.name), episodeId, cleanUrl, toSqlParam(input.quality), 1, "Embed", 0, 0, linkOrder]
        );
        sendJson(res, 200, {
          message: "Registrado correctamente",
          data: {
            id: String(result.insertId),
            link_order: linkOrder
          }
        });
      }
      return;
    }
    sendJson(res, 405, { error: "M\xE9todo no permitido" });
  } catch (err) {
    sendJson(res, 500, { error: "Error en series_docines: " + errorMessage(err) });
  }
}
async function handleMoviePlusmovie(req, res, query) {
  const method = req.method || "GET";
  try {
    if (method === "GET") {
      const tmdbid = query.get("tmdbid");
      const videosId = query.get("videos_id");
      if (tmdbid) {
        const [rows] = await getPlusmoviePool().query(
          "SELECT title, videos_id FROM videos WHERE tmdbid = ?",
          [tmdbid]
        );
        sendJson(res, 200, { data: rows });
      } else if (videosId) {
        const [rows] = await getPlusmoviePool().query(
          "SELECT video_file_id, file_url, label, `order` FROM video_file WHERE videos_id = ?",
          [videosId]
        );
        sendJson(res, 200, { data: rows });
      } else {
        sendJson(res, 200, { error: "Faltan par\xE1metros (tmdbid o videos_id)" });
      }
      return;
    }
    if (method === "DELETE") {
      let videoFileId = query.get("video_file_id");
      if (!videoFileId) {
        const input = await readBody(req);
        if (input.video_file_id !== void 0) videoFileId = String(input.video_file_id);
      }
      if (!videoFileId) {
        sendJson(res, 400, { error: "Falta el par\xE1metro video_file_id" });
        return;
      }
      await getPlusmoviePool().execute("DELETE FROM video_file WHERE video_file_id = ?", [videoFileId]);
      sendJson(res, 200, { message: "Eliminado correctamente" });
      return;
    }
    if (method === "POST" || method === "PUT") {
      const input = await readBody(req);
      const videoFileId = input.video_file_id ?? null;
      if (method === "PUT" || videoFileId !== null) {
        if (!videoFileId) {
          sendJson(res, 400, { error: "Falta el par\xE1metro video_file_id para actualizar" });
          return;
        }
        await getPlusmoviePool().execute(
          "UPDATE video_file SET file_url = ?, label = ?, `order` = ? WHERE video_file_id = ?",
          [toSqlParam(input.file_url), toSqlParam(input.label), toSqlParam(input.order), toSqlParam(videoFileId)]
        );
        sendJson(res, 200, { message: "Actualizado correctamente" });
      } else {
        const videosId = toSqlParam(input.videos_id);
        const cleanFileUrl = trimNullableUrl(input.file_url);
        if (!videosId || !cleanFileUrl || !input.label) {
          sendJson(res, 400, { error: "Faltan par\xE1metros (videos_id, file_url, label)" });
          return;
        }
        const [existingRows] = await getPlusmoviePool().query(
          "SELECT video_file_id, file_url, `order` FROM video_file WHERE videos_id = ? ORDER BY `order` ASC",
          [videosId]
        );
        const duplicateRow = findDuplicateUrlRow(existingRows, "file_url", cleanFileUrl);
        if (duplicateRow) {
          sendJson(
            res,
            200,
            buildDuplicateResponse({
              video_file_id: String(duplicateRow.video_file_id),
              order: Number(duplicateRow.order ?? 0)
            })
          );
          return;
        }
        const nextOrder = computeNextMissingOrder(existingRows.map((row) => Number(row.order ?? 0)));
        const streamKey = generateStreamKey(12);
        const [result] = await getPlusmoviePool().execute(
          "INSERT INTO video_file (stream_key, videos_id, file_source, source_type, file_url, label, `order`) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [streamKey, videosId, "embed", "link", cleanFileUrl, toSqlParam(input.label), nextOrder]
        );
        sendJson(res, 200, {
          message: "Registrado correctamente",
          data: {
            video_file_id: String(result.insertId),
            stream_key: streamKey,
            order: nextOrder
          }
        });
      }
      return;
    }
    sendJson(res, 405, { error: "M\xE9todo no permitido" });
  } catch (err) {
    sendJson(res, 500, { error: "Error en movie_plusmovie: " + errorMessage(err) });
  }
}
async function handleSeriesPlusmovie(req, res, query) {
  const method = req.method || "GET";
  try {
    if (method === "GET") {
      const title = query.get("title");
      const videosInfoId = query.get("videos_info_id");
      const tmdbid = query.get("tmdbid");
      const videosId = query.get("videos_id");
      const seasonsId = query.get("seasons_id");
      if (title) {
        const [rows] = await getPlusmoviePool().query(
          "SELECT videos_id, title, tmdbid FROM videos WHERE title LIKE ?",
          [`%${title}%`]
        );
        sendJson(res, 200, { data: rows });
      } else if (videosInfoId) {
        const [rows] = await getPlusmoviePool().query(
          "SELECT videos_id, title, tmdbid FROM videos WHERE videos_id = ?",
          [videosInfoId]
        );
        sendJson(res, 200, { data: rows });
      } else if (tmdbid) {
        const [rows] = await getPlusmoviePool().query(
          "SELECT videos_id, title FROM videos WHERE tmdbid = ?",
          [tmdbid]
        );
        sendJson(res, 200, { data: rows });
      } else if (videosId) {
        const [rows] = await getPlusmoviePool().query(
          "SELECT seasons_id, seasons_name, `order` FROM seasons WHERE videos_id = ?",
          [videosId]
        );
        sendJson(res, 200, { data: rows });
      } else if (seasonsId) {
        const [rows] = await getPlusmoviePool().query(
          "SELECT episodes_id, episodes_name, file_url, `order` FROM episodes WHERE seasons_id = ?",
          [seasonsId]
        );
        sendJson(res, 200, { data: rows });
      } else {
        sendJson(res, 400, { error: "Faltan par\xE1metros (tmdbid, videos_id o seasons_id)" });
      }
      return;
    }
    if (method === "DELETE") {
      let episodesId = query.get("episodes_id");
      if (!episodesId) {
        const input = await readBody(req);
        if (input.episodes_id !== void 0) episodesId = String(input.episodes_id);
      }
      if (!episodesId) {
        sendJson(res, 400, { error: "Falta el par\xE1metro episodes_id" });
        return;
      }
      await getPlusmoviePool().execute("DELETE FROM episodes WHERE episodes_id = ?", [episodesId]);
      sendJson(res, 200, { message: "Eliminado correctamente" });
      return;
    }
    if (method === "POST" || method === "PUT") {
      const input = await readBody(req);
      const episodesId = input.episodes_id ?? null;
      const videosId = input.videos_id ?? null;
      const seasonsId = input.seasons_id ?? null;
      const title = input.title ?? null;
      const tmdbid = input.tmdbid ?? null;
      const currentDate = nowDatetime();
      if (episodesId === null && seasonsId === null && videosId !== null && (title !== null || tmdbid !== null)) {
        if (!title || !tmdbid) {
          sendJson(res, 400, { error: "Faltan par\xE1metros (videos_id, title, tmdbid)" });
          return;
        }
        await getPlusmoviePool().execute("UPDATE videos SET title = ?, tmdbid = ? WHERE videos_id = ?", [
          toSqlParam(title),
          toSqlParam(tmdbid),
          toSqlParam(videosId)
        ]);
        sendJson(res, 200, { message: "Actualizado correctamente" });
        return;
      }
      if (method === "PUT" || episodesId !== null) {
        if (!episodesId) {
          sendJson(res, 400, { error: "Falta el par\xE1metro episodes_id para actualizar" });
          return;
        }
        await getPlusmoviePool().execute(
          "UPDATE episodes SET episodes_name = ?, file_url = ?, `order` = ?, last_ep_added = ? WHERE episodes_id = ?",
          [
            toSqlParam(input.episodes_name),
            toSqlParam(input.file_url),
            toSqlParam(input.order),
            currentDate,
            toSqlParam(episodesId)
          ]
        );
        sendJson(res, 200, { message: "Actualizado correctamente", last_ep_added: currentDate });
      } else {
        const cleanSeasonsId = toSqlParam(seasonsId);
        const cleanVideosId = toSqlParam(videosId);
        if (!cleanSeasonsId || !cleanVideosId) {
          sendJson(res, 400, { error: "Faltan par\xE1metros requeridos (seasons_id o videos_id) para el registro" });
          return;
        }
        const cleanFileUrl = trimNullableUrl(input.file_url);
        if (cleanFileUrl) {
          const [existingRows] = await getPlusmoviePool().query(
            "SELECT episodes_id, file_url FROM episodes WHERE videos_id = ? AND seasons_id = ?",
            [cleanVideosId, cleanSeasonsId]
          );
          const duplicateRow = findDuplicateUrlRow(existingRows, "file_url", cleanFileUrl);
          if (duplicateRow) {
            sendJson(res, 200, buildDuplicateResponse({ episodes_id: String(duplicateRow.episodes_id) }));
            return;
          }
        }
        const streamKey = generateStreamKey(12);
        const [result] = await getPlusmoviePool().execute(
          "INSERT INTO episodes (stream_key, videos_id, seasons_id, episodes_name, file_source, source_type, file_url, `order`, date_added, last_ep_added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            streamKey,
            cleanVideosId,
            cleanSeasonsId,
            toSqlParam(input.episodes_name),
            toSqlParam(input.file_source ?? "embed"),
            toSqlParam(input.source_type ?? "link"),
            cleanFileUrl,
            toSqlParam(input.order),
            currentDate,
            currentDate
          ]
        );
        sendJson(res, 200, {
          message: "Registrado correctamente",
          data: {
            episodes_id: String(result.insertId),
            stream_key: streamKey,
            date_added: currentDate
          }
        });
      }
      return;
    }
    sendJson(res, 405, { error: "M\xE9todo no permitido" });
  } catch (err) {
    sendJson(res, 500, { error: "Error en series_plusmovie: " + errorMessage(err) });
  }
}
async function handleLoginPlusmovie(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { success: false, error: "M\xE9todo no permitido" });
    return;
  }
  const input = await readBody(req);
  const email = input.email ? String(input.email).trim() : "";
  const password = input.password ? String(input.password) : "";
  if (!email || !password) {
    sendJson(res, 400, { success: false, error: "Faltan par\xE1metros (email, password)" });
    return;
  }
  try {
    const [rows] = await getPlusmoviePool().query(
      "SELECT username, role FROM `user` WHERE email = ? AND password = ? AND role = ? LIMIT 1",
      [email, md5(password), "admin"]
    );
    const user = rows[0];
    if (!user) {
      sendJson(res, 401, { success: false, error: "Credenciales inv\xE1lidas o sin permisos" });
      return;
    }
    sendJson(res, 200, {
      success: true,
      message: "Login correcto",
      data: {
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    sendJson(res, 500, { success: false, error: "Error al procesar el login: " + errorMessage(err) });
  }
}
async function handleUpdateVersion(req, res, staticDir) {
  if (req.method !== "POST") {
    sendJson(res, 405, { success: false, error: "M\xE9todo no permitido" });
    return;
  }
  const input = await readBody(req);
  let version = null;
  if (input && typeof input === "object") {
    if (isValidStreamNexusVersion(input.version)) {
      version = input.version;
    } else if (typeof input.v === "number" && Number.isFinite(input.v)) {
      const d = Math.max(0, Math.min(9, Math.trunc(input.v)));
      version = `${d}.0`;
    }
  }
  if (!version || !isValidStreamNexusVersion(version)) {
    sendJson(res, 400, {
      success: false,
      error: 'Payload inv\xE1lido. Se espera {"version":"X.X"} con X en [0-9]'
    });
    return;
  }
  try {
    import_node_fs3.default.mkdirSync(staticDir, { recursive: true });
    const targetFile = import_node_path3.default.join(staticDir, "v-streamnexus.json");
    const fallbackTemplate = import_node_path3.default.resolve(process.cwd(), "public", "v-streamnexus.json");
    let current = {};
    const existingSource = import_node_fs3.default.existsSync(targetFile) ? targetFile : import_node_fs3.default.existsSync(fallbackTemplate) ? fallbackTemplate : null;
    if (existingSource) {
      try {
        const parsed = JSON.parse(import_node_fs3.default.readFileSync(existingSource, "utf-8"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          current = parsed;
        }
      } catch {
      }
    }
    current.version = version;
    import_node_fs3.default.writeFileSync(targetFile, JSON.stringify(current, null, 2) + "\n", "utf-8");
    sendJson(res, 200, { success: true, version });
  } catch (err) {
    sendJson(res, 500, {
      success: false,
      error: "No se pudo escribir v-streamnexus.json: " + errorMessage(err)
    });
  }
}
async function handleApiRequest(req, res, options = {}) {
  if (!req.url) return false;
  const parsedUrl = new URL(req.url, "http://localhost");
  const pathname = options.pathnameOverride || parsedUrl.pathname;
  const staticDir = import_node_path3.default.resolve(options.staticDir || import_node_path3.default.join(process.cwd(), "dist"));
  const handledRoutes = /* @__PURE__ */ new Set([
    "/login_dooplex.php",
    "/dashboard.php",
    "/movie_dooplex.php",
    "/series_dooplex.php",
    "/anime_dooplex.php",
    "/movie_docines.php",
    "/series_docines.php",
    "/movie_plusmovie.php",
    "/series_plusmovie.php",
    "/login_plusmovie.php",
    "/update_version.php",
    "/upload_app.php"
  ]);
  if (!handledRoutes.has(pathname)) {
    return false;
  }
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return true;
  }
  switch (pathname) {
    case "/login_dooplex.php":
      await handleLoginDooplex(req, res);
      return true;
    case "/dashboard.php":
      await handleDashboard(req, res);
      return true;
    case "/movie_dooplex.php":
      await handleMovieDooplex(req, res, parsedUrl.searchParams);
      return true;
    case "/series_dooplex.php":
      await handleSeriesDooplex(req, res, parsedUrl.searchParams);
      return true;
    case "/anime_dooplex.php":
      await handleAnimeDooplex(req, res, parsedUrl.searchParams);
      return true;
    case "/movie_docines.php":
      await handleMovieDocines(req, res, parsedUrl.searchParams);
      return true;
    case "/series_docines.php":
      await handleSeriesDocines(req, res, parsedUrl.searchParams);
      return true;
    case "/movie_plusmovie.php":
      await handleMoviePlusmovie(req, res, parsedUrl.searchParams);
      return true;
    case "/series_plusmovie.php":
      await handleSeriesPlusmovie(req, res, parsedUrl.searchParams);
      return true;
    case "/login_plusmovie.php":
      await handleLoginPlusmovie(req, res);
      return true;
    case "/update_version.php":
      await handleUpdateVersion(req, res, staticDir);
      return true;
    case "/upload_app.php":
      await handleUploadApkRequest(req, res, staticDir);
      return true;
    default:
      return false;
  }
}

// server/proxyHandler.ts
var PROXY_PATHS = /* @__PURE__ */ new Set(["/proxy.php", "/proxy", "/api/proxy"]);
function isProxyPath(pathname) {
  return PROXY_PATHS.has(pathname);
}
async function handleProxyRequest(req, res, pathnameOverride) {
  const parsedUrl = new URL(req.url || "/", "http://localhost");
  const pathname = pathnameOverride || parsedUrl.pathname;
  if (!isProxyPath(pathname)) {
    return false;
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  const targetUrl = parsedUrl.searchParams.get("url");
  const referer = parsedUrl.searchParams.get("referer");
  const resolveRedirect = parsedUrl.searchParams.get("resolve_redirect") === "true";
  if (!targetUrl) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "No URL provided" }));
    return true;
  }
  try {
    if (resolveRedirect) {
      const r = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          ...referer ? { Referer: referer } : targetUrl.includes("embed69.org") ? { Referer: "https://pelisplushd.bz/" } : {}
        }
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ finalUrl: r.url || targetUrl }));
      return true;
    }
    const outgoingHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache"
    };
    if (req.method === "POST") {
      outgoingHeaders["Accept"] = "*/*";
      outgoingHeaders["X-Requested-With"] = "XMLHttpRequest";
      if (req.headers["content-type"]) {
        outgoingHeaders["Content-Type"] = String(req.headers["content-type"]);
      }
    } else {
      outgoingHeaders["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
    }
    if (referer) {
      outgoingHeaders["Referer"] = referer;
    } else if (targetUrl.includes("embed69.org")) {
      outgoingHeaders["Referer"] = "https://pelisplushd.bz/";
    }
    const customHeadersRaw = req.headers["x-proxy-headers"];
    if (typeof customHeadersRaw === "string" && customHeadersRaw.trim()) {
      try {
        const parsedCustom = JSON.parse(customHeadersRaw);
        if (parsedCustom && typeof parsedCustom === "object") {
          for (const [k, v] of Object.entries(parsedCustom)) {
            outgoingHeaders[k] = String(v);
          }
        }
      } catch {
      }
    }
    const customCookiesRaw = req.headers["x-proxy-cookies"];
    if (typeof customCookiesRaw === "string" && customCookiesRaw.trim()) {
      outgoingHeaders["Cookie"] = customCookiesRaw;
    }
    let body;
    if (["POST", "PUT", "PATCH"].includes(req.method || "")) {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      if (chunks.length > 0) {
        body = Buffer.concat(chunks);
      }
    }
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: outgoingHeaders,
      body,
      redirect: "follow"
    });
    res.statusCode = response.status;
    res.setHeader("Content-Type", response.headers.get("content-type") || "text/plain; charset=utf-8");
    const arrayBuffer = await response.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const message = err instanceof Error ? err.message : "Proxy request failed";
    res.end(JSON.stringify({ error: message }));
  }
  return true;
}

// server/nodeApp.ts
var MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".apk": "application/vnd.android.package-archive"
};
function normalizeBasePath(raw) {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "/") return "";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, "");
}
function stripBasePath(pathname, basePath) {
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || "/";
  }
  return pathname;
}
function sendStaticFile(req, res, filePath, stat, isAsset) {
  const ext = import_node_path4.default.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", stat.size);
  if (ext === ".apk") {
    res.setHeader("Content-Disposition", `attachment; filename="${import_node_path4.default.basename(filePath)}"`);
  }
  if (isAsset) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else if (ext === ".html" || ext === ".json") {
    res.setHeader("Cache-Control", "no-cache");
  }
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = import_node_fs4.default.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Error al leer el archivo est\xE1tico" }));
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}
function createNodeAppHandler(options = {}) {
  loadEnvFiles([process.cwd()]);
  const distDir = import_node_path4.default.resolve(options.distDir || process.env.DIST_DIR || import_node_path4.default.join(process.cwd(), "dist"));
  const basePath = normalizeBasePath(
    options.basePath ?? process.env.APP_BASE_PATH ?? process.env.PASSENGER_BASE_URI
  );
  return async function requestHandler(req, res) {
    const parsedUrl = new URL(req.url || "/", "http://localhost");
    const pathname = stripBasePath(parsedUrl.pathname, basePath);
    if (pathname === "/health" || pathname === "/api/health") {
      const hasDist = import_node_fs4.default.existsSync(import_node_path4.default.join(distDir, "index.html"));
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true, status: "up", distAvailable: hasDist }));
      return;
    }
    if (await handleProxyRequest(req, res, pathname)) {
      return;
    }
    if (await handleApiRequest(req, res, { staticDir: distDir, pathnameOverride: pathname })) {
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Ruta no encontrada" }));
      return;
    }
    let decodedPath = "/";
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch {
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }
    const relativePath = decodedPath.replace(/^\/+/, "");
    const candidatePath = import_node_path4.default.resolve(distDir, relativePath || "index.html");
    const distPrefix = distDir.endsWith(import_node_path4.default.sep) ? distDir : `${distDir}${import_node_path4.default.sep}`;
    if (candidatePath !== distDir && !candidatePath.startsWith(distPrefix)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }
    if (import_node_fs4.default.existsSync(candidatePath)) {
      const stat = import_node_fs4.default.statSync(candidatePath);
      if (stat.isFile()) {
        sendStaticFile(req, res, candidatePath, stat, decodedPath.startsWith("/assets/"));
        return;
      }
      if (stat.isDirectory()) {
        const nestedIndex = import_node_path4.default.join(candidatePath, "index.html");
        if (import_node_fs4.default.existsSync(nestedIndex)) {
          const nestedStat = import_node_fs4.default.statSync(nestedIndex);
          if (nestedStat.isFile()) {
            sendStaticFile(req, res, nestedIndex, nestedStat, false);
            return;
          }
        }
      }
    }
    const hasExtension = import_node_path4.default.posix.basename(decodedPath).includes(".");
    if (hasExtension || decodedPath.startsWith("/assets/")) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Archivo o endpoint no encontrado" }));
      return;
    }
    const indexPath = import_node_path4.default.join(distDir, "index.html");
    if (!import_node_fs4.default.existsSync(indexPath)) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<!doctype html><html><body><h1>Falta subir la carpeta dist/</h1><p>Compila localmente con <code>npm run build</code> y sube <code>dist/</code> junto a <code>server.cjs</code>.</p></body></html>"
      );
      return;
    }
    const indexStat = import_node_fs4.default.statSync(indexPath);
    sendStaticFile(req, res, indexPath, indexStat, false);
  };
}
function createNodeAppServer(options = {}) {
  const handler = createNodeAppHandler(options);
  return import_node_http.default.createServer((req, res) => {
    void handler(req, res).catch((err) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        const message = err instanceof Error ? err.message : "Internal server error";
        res.end(JSON.stringify({ error: message }));
      } else {
        res.destroy();
      }
    });
  });
}

// server/nodeServer.ts
var shouldStart = !process.env.VITEST && process.env.DISABLE_AUTO_LISTEN !== "1";
if (shouldStart) {
  const rootDir = typeof __dirname === "string" ? __dirname : process.cwd();
  loadEnvFiles([process.cwd(), rootDir]);
  const rawPort = process.env.PORT;
  const port = rawPort && /^\d+$/.test(rawPort) ? Number(rawPort) : rawPort || 3e3;
  const host = process.env.HOST?.trim();
  const distDir = import_node_path5.default.resolve(process.env.DIST_DIR || import_node_path5.default.join(rootDir, "dist"));
  const server = createNodeAppServer({ distDir });
  if (host && typeof port === "number") {
    server.listen(port, host, () => {
      console.log(`[dashboard_web] Servidor Node.js activo en http://${host}:${port} (dist: ${distDir})`);
    });
  } else {
    server.listen(port, () => {
      console.log(`[dashboard_web] Servidor Node.js activo en puerto ${port} (dist: ${distDir})`);
    });
  }
  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
