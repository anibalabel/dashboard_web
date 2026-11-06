// @ts-ignore - Built-in Cloudflare Workers TCP socket API
import { connect } from 'cloudflare:sockets';
import bcrypt from 'bcryptjs';

// ============================================================================
// Pure-JS MD5 implementation for Web Workers / Cloudflare Edge
// ============================================================================
function md5(input: string): string {
  function rotateLeft(lValue: number, iShiftBits: number) {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
  }
  function addUnsigned(lX: number, lY: number) {
    const lX8 = lX & 0x80000000;
    const lY8 = lY & 0x80000000;
    const lX4 = lX & 0x40000000;
    const lY4 = lY & 0x40000000;
    const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
    if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    if (lX4 | lY4) {
      if (lResult & 0x40000000) return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
      return lResult ^ 0x40000000 ^ lX8 ^ lY8;
    }
    return lResult ^ lX8 ^ lY8;
  }
  function F(x: number, y: number, z: number) { return (x & y) | (~x & z); }
  function G(x: number, y: number, z: number) { return (x & z) | (y & ~z); }
  function H(x: number, y: number, z: number) { return x ^ y ^ z; }
  function I(x: number, y: number, z: number) { return y ^ (x | ~z); }
  function FF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function GG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function HH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function II(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function convertToWordArray(bytes: Uint8Array) {
    const lMessageLength = bytes.length;
    const lNumberOfWordsTemp1 = lMessageLength + 8;
    const lNumberOfWordsTemp2 = (lNumberOfWordsTemp1 - (lNumberOfWordsTemp1 % 64)) / 64;
    const lNumberOfWords = (lNumberOfWordsTemp2 + 1) * 16;
    const lWordArray = new Array<number>(lNumberOfWords).fill(0);
    let lBytePosition = 0;
    let lByteCount = 0;
    while (lByteCount < lMessageLength) {
      const lWordCount = (lByteCount - (lByteCount % 4)) / 4;
      lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | (bytes[lByteCount] << lBytePosition);
      lByteCount++;
    }
    const lWordCount = (lByteCount - (lByteCount % 4)) / 4;
    lBytePosition = (lByteCount % 4) * 8;
    lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
    return lWordArray;
  }
  function wordToHex(lValue: number) {
    let wordToHexValue = '';
    for (let lCount = 0; lCount <= 3; lCount++) {
      const lByte = (lValue >>> (lCount * 8)) & 255;
      const wordToHexValueTemp = '0' + lByte.toString(16);
      wordToHexValue += wordToHexValueTemp.substr(wordToHexValueTemp.length - 2, 2);
    }
    return wordToHexValue;
  }

  const bytes = new TextEncoder().encode(input);
  const x = convertToWordArray(bytes);
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let k = 0; k < x.length; k += 16) {
    const AA = a, BB = b, CC = c, DD = d;
    a = FF(a, b, c, d, x[k + 0], 7, 0xd76aa478);
    d = FF(d, a, b, c, x[k + 1], 12, 0xe8c7b756);
    c = FF(c, d, a, b, x[k + 2], 17, 0x242070db);
    b = FF(b, c, d, a, x[k + 3], 22, 0xc1bdceee);
    a = FF(a, b, c, d, x[k + 4], 7, 0xf57c0faf);
    d = FF(d, a, b, c, x[k + 5], 12, 0x4787c62a);
    c = FF(c, d, a, b, x[k + 6], 17, 0xa8304613);
    b = FF(b, c, d, a, x[k + 7], 22, 0xfd469501);
    a = FF(a, b, c, d, x[k + 8], 7, 0x698098d8);
    d = FF(d, a, b, c, x[k + 9], 12, 0x8b44f7af);
    c = FF(c, d, a, b, x[k + 10], 17, 0xffff5bb1);
    b = FF(b, c, d, a, x[k + 11], 22, 0x895cd7be);
    a = FF(a, b, c, d, x[k + 12], 7, 0x6b901122);
    d = FF(d, a, b, c, x[k + 13], 12, 0xfd987193);
    c = FF(c, d, a, b, x[k + 14], 17, 0xa679438e);
    b = FF(b, c, d, a, x[k + 15], 22, 0x49b40821);
    a = GG(a, b, c, d, x[k + 1], 5, 0xf61e2562);
    d = GG(d, a, b, c, x[k + 6], 9, 0xc040b340);
    c = GG(c, d, a, b, x[k + 11], 14, 0x265e5a51);
    b = GG(b, c, d, a, x[k + 0], 20, 0xe9b6c7aa);
    a = GG(a, b, c, d, x[k + 5], 5, 0xd62f105d);
    d = GG(d, a, b, c, x[k + 10], 9, 0x02441453);
    c = GG(c, d, a, b, x[k + 15], 14, 0xd8a1e681);
    b = GG(b, c, d, a, x[k + 4], 20, 0xe7d3fbc8);
    a = GG(a, b, c, d, x[k + 9], 5, 0x21e1cde6);
    d = GG(d, a, b, c, x[k + 14], 9, 0xc33707d6);
    c = GG(c, d, a, b, x[k + 3], 14, 0xf4d50d87);
    b = GG(b, c, d, a, x[k + 8], 20, 0x455a14ed);
    a = GG(a, b, c, d, x[k + 13], 5, 0xa9e3e905);
    d = GG(d, a, b, c, x[k + 2], 9, 0xfcefa3f8);
    c = GG(c, d, a, b, x[k + 7], 14, 0x676f02d9);
    b = GG(b, c, d, a, x[k + 12], 20, 0x8d2a4c8a);
    a = HH(a, b, c, d, x[k + 5], 4, 0xfffa3942);
    d = HH(d, a, b, c, x[k + 8], 11, 0x8771f681);
    c = HH(c, d, a, b, x[k + 11], 16, 0x6d9d6122);
    b = HH(b, c, d, a, x[k + 14], 23, 0xfde5380c);
    a = HH(a, b, c, d, x[k + 1], 4, 0xa4beea44);
    d = HH(d, a, b, c, x[k + 4], 11, 0x4bdecfa9);
    c = HH(c, d, a, b, x[k + 7], 16, 0xf6bb4b60);
    b = HH(b, c, d, a, x[k + 10], 23, 0xbebfbc70);
    a = HH(a, b, c, d, x[k + 13], 4, 0x289b7ec6);
    d = HH(d, a, b, c, x[k + 0], 11, 0xeaa127fa);
    c = HH(c, d, a, b, x[k + 3], 16, 0xd4ef3085);
    b = HH(b, c, d, a, x[k + 6], 23, 0x04881d05);
    a = HH(a, b, c, d, x[k + 9], 4, 0xd9d4d039);
    d = HH(d, a, b, c, x[k + 12], 11, 0xe6db99e5);
    c = HH(c, d, a, b, x[k + 15], 16, 0x1fa27cf8);
    b = HH(b, c, d, a, x[k + 2], 23, 0xc4ac5665);
    a = II(a, b, c, d, x[k + 0], 6, 0xf4292244);
    d = II(d, a, b, c, x[k + 7], 10, 0x432aff97);
    c = II(c, d, a, b, x[k + 14], 15, 0xab9423a7);
    b = II(b, c, d, a, x[k + 5], 21, 0xfc93a039);
    a = II(a, b, c, d, x[k + 12], 6, 0x655b59c3);
    d = II(d, a, b, c, x[k + 3], 10, 0x8f0ccc92);
    c = II(c, d, a, b, x[k + 10], 15, 0xffeff47d);
    b = II(b, c, d, a, x[k + 1], 21, 0x85845dd1);
    a = II(a, b, c, d, x[k + 8], 6, 0x6fa87e4f);
    d = II(d, a, b, c, x[k + 15], 10, 0xfe2ce6e0);
    c = II(c, d, a, b, x[k + 6], 15, 0xa3014314);
    b = II(b, c, d, a, x[k + 13], 21, 0x4e0811a1);
    a = II(a, b, c, d, x[k + 4], 6, 0xf7537e82);
    d = II(d, a, b, c, x[k + 11], 10, 0xbd3af235);
    c = II(c, d, a, b, x[k + 2], 15, 0x2ad7d2bb);
    b = II(b, c, d, a, x[k + 9], 21, 0xeb86d391);
    a = addUnsigned(a, AA);
    b = addUnsigned(b, BB);
    c = addUnsigned(c, CC);
    d = addUnsigned(d, DD);
  }
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
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

// ============================================================================
// Pure Web-Streams MySQL Wire Protocol 41 Client over cloudflare:sockets
// ============================================================================
interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface QueryResult {
  rows: Record<string, any>[];
  affectedRows: number;
  insertId: number;
}

const DOOPLEX_CONFIG: DbConfig = {
  host: 'mysql.us.cloudlogin.co',
  port: 3306,
  user: 'plusmovie_st',
  password: '5083038xS/@',
  database: 'plusmovie_st',
};

const DOCINES_CONFIG: DbConfig = {
  host: 'mysql.us.cloudlogin.co',
  port: 3306,
  user: 'plusmovie_do',
  password: '5083038xS/@',
  database: 'plusmovie_do',
};

const PLUSMOVIE_CONFIG: DbConfig = {
  host: 'mysql.us.cloudlogin.co',
  port: 3306,
  user: 'plusmpzj_docines',
  password: '5083038xS/@',
  database: 'plusmpzj_docines',
};

const NUMERIC_COL_TYPES = new Set([1, 2, 3, 4, 5, 8, 9, 13]);

async function sha1(data: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-1', data);
  return new Uint8Array(buf);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

async function computeMysqlNativePassword(password: string, scramble: Uint8Array): Promise<Uint8Array> {
  if (!password) return new Uint8Array(0);
  const passBytes = new TextEncoder().encode(password);
  const stage1 = await sha1(passBytes);
  const stage2 = await sha1(stage1);
  const combined = concatBytes(scramble.slice(0, 20), stage2);
  const stage3 = await sha1(combined);
  const out = new Uint8Array(20);
  for (let i = 0; i < 20; i++) out[i] = stage1[i] ^ stage3[i];
  return out;
}

function readLenEncInt(buf: Uint8Array, offset: number): { value: number | null; nextOffset: number } {
  const first = buf[offset];
  if (first < 0xfb) return { value: first, nextOffset: offset + 1 };
  if (first === 0xfb) return { value: null, nextOffset: offset + 1 };
  if (first === 0xfc) {
    return { value: buf[offset + 1] | (buf[offset + 2] << 8), nextOffset: offset + 3 };
  }
  if (first === 0xfd) {
    return {
      value: buf[offset + 1] | (buf[offset + 2] << 8) | (buf[offset + 3] << 16),
      nextOffset: offset + 4,
    };
  }
  const low = buf[offset + 1] | (buf[offset + 2] << 8) | (buf[offset + 3] << 16) | ((buf[offset + 4] << 24) >>> 0);
  const high = buf[offset + 5] | (buf[offset + 6] << 8) | (buf[offset + 7] << 16) | ((buf[offset + 8] << 24) >>> 0);
  return { value: high * 4294967296 + (low >>> 0), nextOffset: offset + 9 };
}

function readLenEncString(buf: Uint8Array, offset: number): { value: string | null; nextOffset: number } {
  const { value: len, nextOffset } = readLenEncInt(buf, offset);
  if (len === null) return { value: null, nextOffset };
  const str = new TextDecoder().decode(buf.slice(nextOffset, nextOffset + len));
  return { value: str, nextOffset: nextOffset + len };
}

function escapeSqlValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  const str = String(val)
    .replace(/\\/g, '\\\\')
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\x1a/g, '\\Z');
  return `'${str}'`;
}

function formatSql(sql: string, params: any[] = []): string {
  let idx = 0;
  return sql.replace(/\?/g, () => escapeSqlValue(params[idx++]));
}

async function withMysql<T>(
  config: DbConfig,
  fn: (query: (sql: string, params?: any[]) => Promise<QueryResult>) => Promise<T>
): Promise<T> {
  const sock = connect({ hostname: config.host, port: config.port });
  const reader = sock.readable.getReader();
  const writer = sock.writable.getWriter();
  let buffer = new Uint8Array(0);

  const ensureBytes = async (n: number) => {
    while (buffer.length < n) {
      const { value, done } = await reader.read();
      if (done) throw new Error('Conexión cerrada inesperadamente por el servidor MySQL');
      buffer = concatBytes(buffer, value);
    }
  };

  const readPacket = async () => {
    await ensureBytes(4);
    const len = buffer[0] | (buffer[1] << 8) | (buffer[2] << 16);
    const seq = buffer[3];
    await ensureBytes(4 + len);
    const payload = buffer.slice(4, 4 + len);
    buffer = buffer.slice(4 + len);
    return { seq, payload };
  };

  const writePacket = async (seq: number, body: Uint8Array) => {
    const pkt = new Uint8Array(4 + body.length);
    pkt[0] = body.length & 0xff;
    pkt[1] = (body.length >> 8) & 0xff;
    pkt[2] = (body.length >> 16) & 0xff;
    pkt[3] = seq & 0xff;
    pkt.set(body, 4);
    await writer.write(pkt);
  };

  try {
    const greeting = await readPacket();
    const p = greeting.payload;
    let pos = 1;
    while (p[pos] !== 0) pos++;
    pos++; // skip null byte
    pos += 4; // thread id
    const auth1 = p.slice(pos, pos + 8);
    pos += 8 + 1 + 2 + 1 + 2 + 2;
    const authLen = p[pos];
    pos += 1 + 10;
    const restLen = Math.max(13, authLen - 8);
    const auth2 = p.slice(pos, pos + restLen - 1);
    const scramble = concatBytes(auth1, auth2);

    const clientFlags = 1 | 4 | 8 | 512 | 32768 | 0x00080000 | 0x01000000;
    const authResp = await computeMysqlNativePassword(config.password, scramble);
    const userBytes = new TextEncoder().encode(config.user + '\0');
    const dbBytes = new TextEncoder().encode(config.database + '\0');
    const pluginBytes = new TextEncoder().encode('mysql_native_password\0');

    const header = new Uint8Array(32);
    header[0] = clientFlags & 0xff;
    header[1] = (clientFlags >> 8) & 0xff;
    header[2] = (clientFlags >> 16) & 0xff;
    header[3] = (clientFlags >> 24) & 0xff;
    header[7] = 0x01; // 16MB max packet
    header[8] = 45; // utf8mb4_general_ci

    const body = concatBytes(header, userBytes, new Uint8Array([authResp.length]), authResp, dbBytes, pluginBytes);
    await writePacket(greeting.seq + 1, body);

    const authRes = await readPacket();
    if (authRes.payload[0] === 0xff) {
      const errMsg = new TextDecoder().decode(authRes.payload.slice(9));
      throw new Error('Error de autenticación MySQL: ' + errMsg);
    }

    const query = async (sql: string, params: any[] = []): Promise<QueryResult> => {
      const finalSql = params.length > 0 ? formatSql(sql, params) : sql;
      const sqlBytes = new TextEncoder().encode(finalSql);
      const cmd = new Uint8Array(1 + sqlBytes.length);
      cmd[0] = 0x03; // COM_QUERY
      cmd.set(sqlBytes, 1);
      await writePacket(0, cmd);

      const firstPkt = await readPacket();
      const fp = firstPkt.payload;

      if (fp[0] === 0x00) {
        let o = 1;
        const aff = readLenEncInt(fp, o);
        o = aff.nextOffset;
        const ins = readLenEncInt(fp, o);
        return { rows: [], affectedRows: aff.value ?? 0, insertId: ins.value ?? 0 };
      }

      if (fp[0] === 0xff) {
        const errMsg = new TextDecoder().decode(fp.slice(9));
        throw new Error('Error en consulta MySQL: ' + errMsg);
      }

      const { value: colCount } = readLenEncInt(fp, 0);
      const count = colCount ?? 0;
      const columns: { name: string; isNumeric: boolean }[] = [];

      for (let i = 0; i < count; i++) {
        const colPkt = await readPacket();
        const cp = colPkt.payload;
        let o = 0;
        o = readLenEncString(cp, o).nextOffset; // catalog
        o = readLenEncString(cp, o).nextOffset; // schema
        o = readLenEncString(cp, o).nextOffset; // table
        o = readLenEncString(cp, o).nextOffset; // org_table
        const nameRes = readLenEncString(cp, o); // name
        o = nameRes.nextOffset;
        o = readLenEncString(cp, o).nextOffset; // org_name
        const colType = cp[o + 7];
        columns.push({
          name: nameRes.value ?? `col_${i}`,
          isNumeric: NUMERIC_COL_TYPES.has(colType),
        });
      }

      const rows: Record<string, any>[] = [];
      while (true) {
        const rowPkt = await readPacket();
        const rp = rowPkt.payload;
        if (rp[0] === 0xfe && rp.length < 0xffffff) {
          break;
        }
        if (rp[0] === 0xff) {
          const errMsg = new TextDecoder().decode(rp.slice(9));
          throw new Error('Error leyendo fila MySQL: ' + errMsg);
        }
        let o = 0;
        const rowObj: Record<string, any> = {};
        for (let i = 0; i < count; i++) {
          const valRes = readLenEncString(rp, o);
          o = valRes.nextOffset;
          const col = columns[i];
          if (valRes.value === null) {
            rowObj[col.name] = null;
          } else if (col.isNumeric) {
            const num = Number(valRes.value);
            rowObj[col.name] = Number.isNaN(num) ? valRes.value : num;
          } else {
            rowObj[col.name] = valRes.value;
          }
        }
        rows.push(rowObj);
      }

      return { rows, affectedRows: 0, insertId: 0 };
    };

    return await fn(query);
  } finally {
    try {
      // Send COM_QUIT (0x01) gracefully
      await writePacket(0, new Uint8Array([0x01]));
    } catch {
      // ignore
    }
    try {
      writer.releaseLock();
    } catch {
      // ignore
    }
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
    try {
      sock.close();
    } catch {
      // ignore
    }
  }
}

// ============================================================================
// HTTP Helpers
// ============================================================================
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers':
    'Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With, X-Proxy-Headers, X-Proxy-Cookies',
};

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

async function parseRequestBody(request: Request): Promise<Record<string, any>> {
  try {
    const raw = (await request.text()).trim();
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // fallback to URLSearchParams
    }
    const params = new URLSearchParams(raw);
    const out: Record<string, any> = {};
    for (const [k, v] of params.entries()) {
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function generateStreamKey(length = 12): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let key = '';
  for (let i = 0; i < length; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

// ============================================================================
// Route Handlers
// ============================================================================

async function handleLoginDooplex(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Método no permitido' });
  }

  const input = await parseRequestBody(request);
  const email = input.email ? String(input.email).trim() : '';
  const password = input.password ? String(input.password) : '';

  if (!email || !password) {
    return jsonResponse(400, { success: false, error: 'Faltan parámetros (email, password)' });
  }

  try {
    return await withMysql(DOOPLEX_CONFIG, async (query) => {
      const { rows } = await query('SELECT * FROM `users` WHERE `email` = ? LIMIT 1', [email]);
      const user = rows[0];
      if (!user) {
        return jsonResponse(401, { success: false, error: 'Credenciales inválidas' });
      }

      const storedPassword = String(user.password ?? '');
      if (!verifyPassword(password, storedPassword)) {
        return jsonResponse(401, { success: false, error: 'Credenciales inválidas' });
      }

      const role = user.role ?? (user.premuim !== undefined ? (user.premuim ? 'premium' : 'user') : 'admin');
      const username = user.name ?? user.username ?? email;

      return jsonResponse(200, {
        success: true,
        message: 'Login correcto',
        data: {
          username,
          role,
        },
      });
    });
  } catch (err: any) {
    return jsonResponse(500, {
      success: false,
      error: 'Error al procesar el login: ' + (err?.message || String(err)),
    });
  }
}

async function handleDashboard(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse(405, { success: false, error: 'Método no permitido' });
  }

  try {
    return await withMysql(DOOPLEX_CONFIG, async (query) => {
      const moviesRes = await query('SELECT COUNT(*) AS total FROM movies');
      const seriesRes = await query('SELECT COUNT(*) AS total FROM series');
      const animesRes = await query('SELECT COUNT(*) AS total FROM animes');

      return jsonResponse(200, {
        success: true,
        data: {
          dooplex: {
            movies: Number(moviesRes.rows[0]?.total ?? 0),
            series: Number(seriesRes.rows[0]?.total ?? 0),
            animes: Number(animesRes.rows[0]?.total ?? 0),
          },
        },
      });
    });
  } catch (err: any) {
    return jsonResponse(500, {
      success: false,
      error: 'Error al obtener conteos del dashboard: ' + (err?.message || String(err)),
    });
  }
}

async function handleMovieDooplex(request: Request, searchParams: URLSearchParams): Promise<Response> {
  const method = request.method;

  try {
    return await withMysql(DOOPLEX_CONFIG, async (query) => {
      if (method === 'GET') {
        const tmdbId = searchParams.get('tmdb_id');
        const movieId = searchParams.get('movie_id');

        if (tmdbId) {
          const { rows } = await query(
            'SELECT id, tmdb_id, title, poster_path, backdrop_path FROM movies WHERE tmdb_id = ?',
            [tmdbId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (movieId) {
          const { rows } = await query(
            'SELECT id, movie_id, server, link, lang, hd, status FROM movie_videos WHERE movie_id = ?',
            [movieId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, { success: false, error: 'Parámetro requerido: tmdb_id o movie_id' });
      }

      const updateMovieVideo = async (input: Record<string, any>) => {
        if (input.id === undefined) {
          return jsonResponse(400, { success: false, error: 'Se requiere el parámetro id para actualizar' });
        }
        const fields: string[] = [];
        const values: any[] = [];
        for (const k of ['server', 'link', 'lang', 'hd', 'status']) {
          if (input[k] !== undefined) {
            fields.push(`${k} = ?`);
            values.push(input[k]);
          }
        }
        if (fields.length === 0) {
          return jsonResponse(400, {
            success: false,
            error: 'No se proporcionaron campos para actualizar (server, link, lang, hd, status)',
          });
        }
        fields.push('updated_at = NOW()');
        values.push(input.id);
        await query(`UPDATE movie_videos SET ${fields.join(', ')} WHERE id = ?`, values);
        return jsonResponse(200, { success: true, message: 'Video actualizado correctamente en Dooplex' });
      };

      if (method === 'POST') {
        const input = await parseRequestBody(request);
        if (input.id !== undefined) {
          return await updateMovieVideo(input);
        }
        if (
          input.movie_id === undefined ||
          input.server === undefined ||
          input.link === undefined ||
          input.lang === undefined
        ) {
          return jsonResponse(400, {
            success: false,
            error: 'Faltan parámetros requeridos (movie_id, server, link, lang)',
          });
        }
        const hd = input.hd !== undefined ? input.hd : 1;
        const status = input.status !== undefined ? input.status : 1;
        const res = await query(
          'INSERT INTO movie_videos (movie_id, server, link, lang, hd, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
          [input.movie_id, input.server, input.link, input.lang, hd, status]
        );
        return jsonResponse(200, {
          success: true,
          message: 'Video de película insertado correctamente en Dooplex',
          id: String(res.insertId),
        });
      }

      if (method === 'PUT') {
        const input = await parseRequestBody(request);
        return await updateMovieVideo(input);
      }

      if (method === 'DELETE') {
        let id = searchParams.get('id');
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.id !== undefined) id = String(input.id);
        }
        if (!id) {
          return jsonResponse(400, { success: false, error: 'Se requiere el parámetro id para eliminar' });
        }
        const res = await query('DELETE FROM movie_videos WHERE id = ?', [id]);
        if (res.affectedRows > 0) {
          return jsonResponse(200, { success: true, message: 'Video eliminado correctamente de Dooplex' });
        }
        return jsonResponse(404, { success: false, error: 'No se encontró el video con el id proporcionado' });
      }

      return jsonResponse(405, { success: false, error: 'Método no permitido' });
    });
  } catch (err: any) {
    return jsonResponse(500, { success: false, error: 'Error en movie_dooplex: ' + (err?.message || String(err)) });
  }
}

async function handleSeriesDooplex(request: Request, searchParams: URLSearchParams): Promise<Response> {
  const method = request.method;

  try {
    return await withMysql(DOOPLEX_CONFIG, async (query) => {
      if (method === 'GET') {
        const tmdbId = searchParams.get('tmdb_id');
        const serieId = searchParams.get('serie_id');
        const seasonId = searchParams.get('season_id');
        const episodeId = searchParams.get('episode_id');

        if (tmdbId) {
          const { rows } = await query(
            'SELECT id, tmdb_id, name, poster_path, backdrop_path, newEpisodes FROM series WHERE tmdb_id = ?',
            [tmdbId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (serieId) {
          const { rows } = await query(
            'SELECT id, tmdb_id, serie_id, name, season_number FROM seasons WHERE serie_id = ? ORDER BY season_number ASC',
            [serieId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (seasonId) {
          const { rows } = await query(
            'SELECT id, tmdb_id, season_id, name, episode_number, still_path FROM episodes WHERE season_id = ? ORDER BY episode_number ASC',
            [seasonId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (episodeId) {
          const { rows } = await query(
            'SELECT id, episode_id, server, link, lang, hd FROM serie_videos WHERE episode_id = ?',
            [episodeId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, {
          success: false,
          error: 'Parámetro requerido: tmdb_id, serie_id, season_id o episode_id',
        });
      }

      const updateRecord = async (input: Record<string, any>) => {
        if (input.episodes_id !== undefined) {
          const fields: string[] = [];
          const values: any[] = [];
          for (const k of ['name', 'overview', 'still_path']) {
            if (input[k] !== undefined) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          if (fields.length === 0) {
            return jsonResponse(400, {
              success: false,
              error: 'No se proporcionaron campos para actualizar en episodes (name, overview, still_path)',
            });
          }
          fields.push('updated_at = NOW()');
          values.push(input.episodes_id);
          await query(`UPDATE episodes SET ${fields.join(', ')} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: 'Episodio actualizado correctamente en Dooplex' });
        }

        if (input.id !== undefined) {
          const fields: string[] = [];
          const values: any[] = [];
          for (const k of ['server', 'link', 'lang', 'hd']) {
            if (input[k] !== undefined) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          if (fields.length === 0) {
            return jsonResponse(400, {
              success: false,
              error: 'No se proporcionaron campos para actualizar en serie_videos (server, link, lang, hd)',
            });
          }
          fields.push('updated_at = NOW()');
          values.push(input.id);
          await query(`UPDATE serie_videos SET ${fields.join(', ')} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: 'Video actualizado correctamente en Dooplex' });
        }

        return jsonResponse(400, {
          success: false,
          error: 'Se requiere episodes_id o id para actualizar',
        });
      };

      if (method === 'POST') {
        const input = await parseRequestBody(request);
        if (input.episodes_id !== undefined || input.id !== undefined) {
          return await updateRecord(input);
        }
        if (
          input.episode_id === undefined ||
          input.server === undefined ||
          input.link === undefined ||
          input.lang === undefined ||
          input.hd === undefined
        ) {
          return jsonResponse(400, {
            success: false,
            error: 'Faltan parámetros requeridos (episode_id, server, link, lang, hd)',
          });
        }
        const res = await query(
          'INSERT INTO serie_videos (episode_id, server, link, lang, hd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
          [input.episode_id, input.server, input.link, input.lang, input.hd]
        );
        return jsonResponse(200, {
          success: true,
          message: 'Video insertado correctamente en Dooplex',
          id: String(res.insertId),
        });
      }

      if (method === 'PUT') {
        const input = await parseRequestBody(request);
        return await updateRecord(input);
      }

      if (method === 'DELETE') {
        let id = searchParams.get('id');
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.id !== undefined) id = String(input.id);
        }
        if (!id) {
          return jsonResponse(400, { success: false, error: 'Se requiere el parámetro id para eliminar' });
        }
        const res = await query('DELETE FROM serie_videos WHERE id = ?', [id]);
        if (res.affectedRows > 0) {
          return jsonResponse(200, { success: true, message: 'Video eliminado correctamente de Dooplex' });
        }
        return jsonResponse(404, { success: false, error: 'No se encontró el video con el id proporcionado' });
      }

      return jsonResponse(405, { success: false, error: 'Método no permitido' });
    });
  } catch (err: any) {
    return jsonResponse(500, { success: false, error: 'Error en series_dooplex: ' + (err?.message || String(err)) });
  }
}

async function handleAnimeDooplex(request: Request, searchParams: URLSearchParams): Promise<Response> {
  const method = request.method;

  try {
    return await withMysql(DOOPLEX_CONFIG, async (query) => {
      if (method === 'GET') {
        const tmdbId = searchParams.get('tmdb_id');
        const animeId = searchParams.get('anime_id');
        const animeSeasonId = searchParams.get('anime_season_id');
        const animeEpisodeId = searchParams.get('anime_episode_id');

        if (tmdbId) {
          const { rows } = await query(
            'SELECT id, tmdb_id, name, poster_path, backdrop_path, newEpisodes FROM animes WHERE tmdb_id = ?',
            [tmdbId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (animeId) {
          const { rows } = await query(
            'SELECT id, tmdb_id, anime_id, name, season_number FROM anime_seasons WHERE anime_id = ? ORDER BY season_number ASC',
            [animeId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (animeSeasonId) {
          const { rows } = await query(
            'SELECT id, tmdb_id, anime_season_id, name, episode_number, still_path FROM anime_episodes WHERE anime_season_id = ? ORDER BY episode_number ASC',
            [animeSeasonId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (animeEpisodeId) {
          const { rows } = await query(
            'SELECT id, anime_episode_id, server, link, lang, hd FROM anime_videos WHERE anime_episode_id = ?',
            [animeEpisodeId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, {
          success: false,
          error: 'Parámetro requerido: tmdb_id, anime_id, anime_season_id o anime_episode_id',
        });
      }

      const updateRecord = async (input: Record<string, any>) => {
        if (input.anime_episodes_id !== undefined) {
          const fields: string[] = [];
          const values: any[] = [];
          for (const k of ['name', 'overview', 'still_path']) {
            if (input[k] !== undefined) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          if (fields.length === 0) {
            return jsonResponse(400, {
              success: false,
              error: 'No se proporcionaron campos para actualizar en anime_episodes (name, overview, still_path)',
            });
          }
          fields.push('updated_at = NOW()');
          values.push(input.anime_episodes_id);
          await query(`UPDATE anime_episodes SET ${fields.join(', ')} WHERE id = ?`, values);
          return jsonResponse(200, {
            success: true,
            message: 'Episodio de anime actualizado correctamente en Dooplex',
          });
        }

        if (input.id !== undefined) {
          const fields: string[] = [];
          const values: any[] = [];
          for (const k of ['server', 'link', 'lang', 'hd']) {
            if (input[k] !== undefined) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          if (fields.length === 0) {
            return jsonResponse(400, {
              success: false,
              error: 'No se proporcionaron campos para actualizar en anime_videos (server, link, lang, hd)',
            });
          }
          fields.push('updated_at = NOW()');
          values.push(input.id);
          await query(`UPDATE anime_videos SET ${fields.join(', ')} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: 'Video de anime actualizado correctamente en Dooplex' });
        }

        return jsonResponse(400, {
          success: false,
          error: 'Se requiere anime_episodes_id o id para actualizar',
        });
      };

      if (method === 'POST') {
        const input = await parseRequestBody(request);
        if (input.anime_episodes_id !== undefined || input.id !== undefined) {
          return await updateRecord(input);
        }
        if (
          input.anime_episode_id === undefined ||
          input.server === undefined ||
          input.link === undefined ||
          input.lang === undefined ||
          input.hd === undefined
        ) {
          return jsonResponse(400, {
            success: false,
            error: 'Faltan parámetros requeridos (anime_episode_id, server, link, lang, hd)',
          });
        }
        const res = await query(
          'INSERT INTO anime_videos (anime_episode_id, server, link, lang, hd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
          [input.anime_episode_id, input.server, input.link, input.lang, input.hd]
        );
        return jsonResponse(200, {
          success: true,
          message: 'Video insertado correctamente en Anime Dooplex',
          id: String(res.insertId),
        });
      }

      if (method === 'PUT') {
        const input = await parseRequestBody(request);
        return await updateRecord(input);
      }

      if (method === 'DELETE') {
        let id = searchParams.get('id');
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.id !== undefined) id = String(input.id);
        }
        if (!id) {
          return jsonResponse(400, { success: false, error: 'Se requiere el parámetro id para eliminar' });
        }
        const res = await query('DELETE FROM anime_videos WHERE id = ?', [id]);
        if (res.affectedRows > 0) {
          return jsonResponse(200, { success: true, message: 'Video eliminado correctamente de Anime Dooplex' });
        }
        return jsonResponse(404, { success: false, error: 'No se encontró el video con el id proporcionado' });
      }

      return jsonResponse(405, { success: false, error: 'Método no permitido' });
    });
  } catch (err: any) {
    return jsonResponse(500, { success: false, error: 'Error en anime_dooplex: ' + (err?.message || String(err)) });
  }
}

async function handleMovieDocines(request: Request, searchParams: URLSearchParams): Promise<Response> {
  const method = request.method;
  try {
    return await withMysql(DOCINES_CONFIG, async (query) => {
      if (method === 'GET') {
        const tmdbid = searchParams.get('tmdbid');
        const movieId = searchParams.get('movie_id');
        if (tmdbid) {
          const { rows } = await query(
            'SELECT id, TMDB_ID, name, description, genres, release_date, runtime, poster, banner, youtube_trailer, downloadable, type, status, content_type FROM movies WHERE TMDB_ID = ?',
            [tmdbid]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (movieId) {
          const { rows } = await query(
            'SELECT id, name, size, quality, link_order, movie_id, url, type, status, skip_available, intro_start, intro_end, end_credits_marker, link_type, drm_uuid, drm_license_uri FROM movie_play_links WHERE movie_id = ? ORDER BY link_order ASC',
            [movieId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, { success: false, error: 'Parámetro requerido: tmdbid o movie_id' });
      }

      const updateRecord = async (input: Record<string, any>) => {
        if (input.movies_id !== undefined) {
          const fields: string[] = [];
          const values: any[] = [];
          for (const k of [
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
          ]) {
            if (input[k] !== undefined) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          if (fields.length === 0) {
            return jsonResponse(400, { success: false, error: 'No se proporcionaron campos para actualizar' });
          }
          values.push(input.movies_id);
          await query(`UPDATE movies SET ${fields.join(', ')} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: 'Película actualizada correctamente en Docines' });
        }
        if (input.id !== undefined) {
          const fields: string[] = [];
          const values: any[] = [];
          for (const k of [
            'name',
            'size',
            'quality',
            'link_order',
            'url',
            'type',
            'status',
            'skip_available',
            'link_type',
          ]) {
            if (input[k] !== undefined) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          if (fields.length === 0) {
            return jsonResponse(400, { success: false, error: 'No se proporcionaron campos para actualizar' });
          }
          values.push(input.id);
          await query(`UPDATE movie_play_links SET ${fields.join(', ')} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: 'Enlace actualizado correctamente en Docines' });
        }
        return jsonResponse(400, { success: false, error: 'Se requiere movies_id o id para actualizar' });
      };

      if (method === 'POST') {
        const input = await parseRequestBody(request);
        if (input.id !== undefined || input.movies_id !== undefined) {
          return await updateRecord(input);
        }
        const maxRes = await query(
          'SELECT COALESCE(MAX(link_order), 0) + 1 AS next_order FROM movie_play_links WHERE movie_id = ?',
          [input.movie_id]
        );
        const linkOrder = Number(maxRes.rows[0]?.next_order ?? 1);
        const res = await query(
          'INSERT INTO movie_play_links (name, size, quality, link_order, movie_id, url, type, status, skip_available, intro_start, intro_end, end_credits_marker, link_type, drm_uuid, drm_license_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            input.name,
            input.size ?? '1080P',
            input.quality,
            linkOrder,
            input.movie_id,
            input.url,
            input.type,
            input.status ?? 1,
            input.skip_available ?? 0,
            input.intro_start ?? '0',
            input.intro_end ?? '0',
            input.end_credits_marker ?? '0',
            input.link_type ?? 0,
            input.drm_uuid ?? '',
            input.drm_license_uri ?? '',
          ]
        );
        return jsonResponse(200, {
          success: true,
          message: 'Enlace insertado correctamente en Docines',
          id: String(res.insertId),
          link_order: linkOrder,
        });
      }

      if (method === 'PUT') {
        const input = await parseRequestBody(request);
        return await updateRecord(input);
      }

      if (method === 'DELETE') {
        let id = searchParams.get('id');
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.id !== undefined) id = String(input.id);
        }
        if (!id) return jsonResponse(400, { success: false, error: 'Se requiere id' });
        const res = await query('DELETE FROM movie_play_links WHERE id = ?', [id]);
        return jsonResponse(res.affectedRows > 0 ? 200 : 404, {
          success: res.affectedRows > 0,
          message: res.affectedRows > 0 ? 'Eliminado' : 'No encontrado',
        });
      }

      return jsonResponse(405, { success: false, error: 'Método no permitido' });
    });
  } catch (err: any) {
    return jsonResponse(500, { success: false, error: 'Error en movie_docines: ' + (err?.message || String(err)) });
  }
}

async function handleSeriesDocines(request: Request, searchParams: URLSearchParams): Promise<Response> {
  const method = request.method;
  try {
    return await withMysql(DOCINES_CONFIG, async (query) => {
      if (method === 'GET') {
        const tmdbid = searchParams.get('tmdbid');
        const webSeriesId = searchParams.get('web_series_id');
        const seasonId = searchParams.get('season_id');
        const episodeId = searchParams.get('episode_id');

        if (tmdbid) {
          const { rows } = await query('SELECT id, TMDB_ID, name, poster, banner FROM web_series WHERE TMDB_ID = ?', [
            tmdbid,
          ]);
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (webSeriesId) {
          const { rows } = await query(
            'SELECT id, Session_Name, session_order, web_series_id FROM web_series_seasons WHERE web_series_id = ? ORDER BY session_order ASC',
            [webSeriesId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (seasonId) {
          const { rows } = await query(
            'SELECT id, Episoade_Name, episoade_image, episoade_description, episoade_order, season_id, downloadable, type, status, source, url, skip_available, intro_start, intro_end, end_credits_marker, drm_uuid, drm_license_uri FROM web_series_episoade WHERE season_id = ? ORDER BY episoade_order ASC',
            [seasonId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (episodeId) {
          const { rows } = await query(
            'SELECT id, name, size, quality, link_order, episode_id, url, type, status, skip_available, intro_start, intro_end, end_credits_marker, link_type, drm_uuid, drm_license_uri FROM episode_play_links WHERE episode_id = ? ORDER BY link_order ASC',
            [episodeId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, { success: false, error: 'Parámetro requerido' });
      }

      const updateRecord = async (input: Record<string, any>) => {
        if (input.episodes_id !== undefined) {
          const fields: string[] = [];
          const values: any[] = [];
          for (const k of [
            'Episoade_Name',
            'episoade_image',
            'episoade_description',
            'episoade_order',
            'downloadable',
            'type',
            'status',
            'source',
            'url',
          ]) {
            if (input[k] !== undefined) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          values.push(input.episodes_id);
          await query(`UPDATE web_series_episoade SET ${fields.join(', ')} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: 'Episodio actualizado en Docines' });
        }
        if (input.id !== undefined) {
          const fields: string[] = [];
          const values: any[] = [];
          for (const k of [
            'name',
            'size',
            'quality',
            'link_order',
            'url',
            'type',
            'status',
            'skip_available',
            'link_type',
          ]) {
            if (input[k] !== undefined) {
              fields.push(`${k} = ?`);
              values.push(input[k]);
            }
          }
          values.push(input.id);
          await query(`UPDATE episode_play_links SET ${fields.join(', ')} WHERE id = ?`, values);
          return jsonResponse(200, { success: true, message: 'Enlace actualizado en Docines' });
        }
        return jsonResponse(400, { success: false, error: 'Se requiere episodes_id o id' });
      };

      if (method === 'POST') {
        const input = await parseRequestBody(request);
        if (input.episodes_id !== undefined || input.id !== undefined) {
          return await updateRecord(input);
        }
        const maxRes = await query(
          'SELECT COALESCE(MAX(link_order), 0) + 1 AS next_order FROM episode_play_links WHERE episode_id = ?',
          [input.episode_id]
        );
        const linkOrder = Number(maxRes.rows[0]?.next_order ?? 1);
        const res = await query(
          'INSERT INTO episode_play_links (name, size, quality, link_order, episode_id, url, type, status, skip_available, intro_start, intro_end, end_credits_marker, link_type, drm_uuid, drm_license_uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            input.name,
            input.size ?? '1080P',
            input.quality,
            linkOrder,
            input.episode_id,
            input.url,
            input.type,
            input.status ?? '1',
            input.skip_available ?? 0,
            input.intro_start ?? '',
            input.intro_end ?? '',
            input.end_credits_marker ?? '0',
            input.link_type ?? 0,
            input.drm_uuid ?? '',
            input.drm_license_uri ?? '',
          ]
        );
        return jsonResponse(200, {
          success: true,
          message: 'Enlace insertado en Docines',
          id: String(res.insertId),
          link_order: linkOrder,
        });
      }

      if (method === 'PUT') {
        const input = await parseRequestBody(request);
        return await updateRecord(input);
      }

      if (method === 'DELETE') {
        let id = searchParams.get('id');
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.id !== undefined) id = String(input.id);
        }
        if (!id) return jsonResponse(400, { success: false, error: 'Se requiere id' });
        const res = await query('DELETE FROM episode_play_links WHERE id = ?', [id]);
        return jsonResponse(res.affectedRows > 0 ? 200 : 404, {
          success: res.affectedRows > 0,
          message: res.affectedRows > 0 ? 'Eliminado' : 'No encontrado',
        });
      }

      return jsonResponse(405, { success: false, error: 'Método no permitido' });
    });
  } catch (err: any) {
    return jsonResponse(500, { success: false, error: 'Error en series_docines: ' + (err?.message || String(err)) });
  }
}

async function handleMoviePlusmovie(request: Request, searchParams: URLSearchParams): Promise<Response> {
  const method = request.method;
  try {
    return await withMysql(PLUSMOVIE_CONFIG, async (query) => {
      if (method === 'GET') {
        const tmdbid = searchParams.get('tmdbid');
        const videosId = searchParams.get('videos_id');
        if (tmdbid) {
          const { rows } = await query(
            'SELECT videos_id, tmdbid, title, description, slug, release, runtime, video_quality, thumbnail_url, poster_url FROM videos WHERE tmdbid = ? AND is_tvseries = 0',
            [tmdbid]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (videosId) {
          const { rows } = await query(
            'SELECT video_file_id, stream_key, videos_id, file_source, source_type, file_url, label, `order` FROM video_file WHERE videos_id = ? ORDER BY `order` ASC',
            [videosId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, { success: false, error: 'Parámetro requerido' });
      }

      const updateRecord = async (input: Record<string, any>) => {
        const fields: string[] = [];
        const values: any[] = [];
        for (const k of ['file_source', 'source_type', 'file_url', 'label', 'order']) {
          if (input[k] !== undefined) {
            fields.push(`\`${k}\` = ?`);
            values.push(input[k]);
          }
        }
        values.push(input.video_file_id);
        await query(`UPDATE video_file SET ${fields.join(', ')} WHERE video_file_id = ?`, values);
        return jsonResponse(200, { success: true, message: 'Actualizado en PlusMovie' });
      };

      if (method === 'POST') {
        const input = await parseRequestBody(request);
        if (input.video_file_id !== undefined) {
          return await updateRecord(input);
        }
        const streamKey = generateStreamKey(12);
        const res = await query(
          'INSERT INTO video_file (stream_key, videos_id, file_source, source_type, file_url, label, `order`) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            streamKey,
            input.videos_id,
            input.file_source,
            input.source_type,
            input.file_url,
            input.label,
            input.order ?? 0,
          ]
        );
        return jsonResponse(200, {
          success: true,
          message: 'Insertado en PlusMovie',
          id: String(res.insertId),
          stream_key: streamKey,
        });
      }

      if (method === 'PUT') {
        const input = await parseRequestBody(request);
        return await updateRecord(input);
      }

      if (method === 'DELETE') {
        let id = searchParams.get('video_file_id');
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.video_file_id !== undefined) id = String(input.video_file_id);
        }
        const res = await query('DELETE FROM video_file WHERE video_file_id = ?', [id]);
        return jsonResponse(res.affectedRows > 0 ? 200 : 404, {
          success: res.affectedRows > 0,
          message: res.affectedRows > 0 ? 'Eliminado' : 'No encontrado',
        });
      }

      return jsonResponse(405, { success: false, error: 'Método no permitido' });
    });
  } catch (err: any) {
    return jsonResponse(500, { success: false, error: 'Error en movie_plusmovie: ' + (err?.message || String(err)) });
  }
}

async function handleSeriesPlusmovie(request: Request, searchParams: URLSearchParams): Promise<Response> {
  const method = request.method;
  try {
    return await withMysql(PLUSMOVIE_CONFIG, async (query) => {
      if (method === 'GET') {
        const tmdbid = searchParams.get('tmdbid');
        const title = searchParams.get('title');
        const videosInfoId = searchParams.get('videos_info_id');
        const videosId = searchParams.get('videos_id');
        const seasonsId = searchParams.get('seasons_id');

        if (tmdbid) {
          const { rows } = await query(
            'SELECT videos_id, tmdbid, title, thumbnail_url, poster_url FROM videos WHERE tmdbid = ?',
            [tmdbid]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (title) {
          const { rows } = await query(
            'SELECT videos_id, tmdbid, title, description, slug, release, runtime, video_quality, thumbnail_url, poster_url FROM videos WHERE title LIKE ? LIMIT 50',
            [`%${title}%`]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (videosInfoId) {
          const { rows } = await query(
            'SELECT videos_id, tmdbid, title, description, slug, release, runtime, video_quality, thumbnail_url, poster_url FROM videos WHERE videos_id = ?',
            [videosInfoId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (videosId) {
          const { rows } = await query(
            'SELECT seasons_id, videos_id, seasons_name, `order` FROM seasons WHERE videos_id = ? ORDER BY `order` ASC',
            [videosId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        } else if (seasonsId) {
          const { rows } = await query(
            'SELECT episodes_id, stream_key, videos_id, seasons_id, episodes_name, file_source, source_type, file_url, `order`, date_added, last_ep_added, image_url FROM episodes WHERE seasons_id = ? ORDER BY `order` ASC',
            [seasonsId]
          );
          return jsonResponse(200, { success: true, data: rows, count: rows.length });
        }
        return jsonResponse(400, { success: false, error: 'Parámetro requerido' });
      }

      const updateRecord = async (input: Record<string, any>) => {
        if (input.videos_id_update !== undefined) {
          const fields: string[] = [];
          const values: any[] = [];
          for (const k of [
            'tmdbid',
            'title',
            'description',
            'slug',
            'release',
            'runtime',
            'video_quality',
            'thumbnail_url',
            'poster_url',
          ]) {
            if (input[k] !== undefined) {
              fields.push(`\`${k}\` = ?`);
              values.push(input[k]);
            }
          }
          values.push(input.videos_id_update);
          await query(`UPDATE videos SET ${fields.join(', ')} WHERE videos_id = ?`, values);
          return jsonResponse(200, { success: true, message: 'Actualizado en PlusMovie' });
        }
        if (input.episodes_id !== undefined) {
          const fields: string[] = [];
          const values: any[] = [];
          const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
          for (const k of ['episodes_name', 'file_source', 'source_type', 'file_url', 'order', 'image_url']) {
            if (input[k] !== undefined) {
              fields.push(`\`${k}\` = ?`);
              values.push(input[k]);
            }
          }
          fields.push('last_ep_added = ?');
          values.push(nowStr);
          values.push(input.episodes_id);
          await query(`UPDATE episodes SET ${fields.join(', ')} WHERE episodes_id = ?`, values);
          return jsonResponse(200, {
            success: true,
            message: 'Episodio actualizado en PlusMovie',
            data: { last_ep_added: nowStr },
          });
        }
        return jsonResponse(400, { success: false, error: 'Se requiere episodes_id o videos_id_update' });
      };

      if (method === 'POST') {
        const input = await parseRequestBody(request);
        if (input.episodes_id !== undefined || input.videos_id_update !== undefined) {
          return await updateRecord(input);
        }
        const streamKey = generateStreamKey(12);
        const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const res = await query(
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
        return jsonResponse(200, {
          success: true,
          message: 'Episodio insertado en PlusMovie',
          id: String(res.insertId),
          stream_key: streamKey,
        });
      }

      if (method === 'PUT') {
        const input = await parseRequestBody(request);
        return await updateRecord(input);
      }

      if (method === 'DELETE') {
        let id = searchParams.get('episodes_id');
        if (!id) {
          const input = await parseRequestBody(request);
          if (input.episodes_id !== undefined) id = String(input.episodes_id);
        }
        const res = await query('DELETE FROM episodes WHERE episodes_id = ?', [id]);
        return jsonResponse(res.affectedRows > 0 ? 200 : 404, {
          success: res.affectedRows > 0,
          message: res.affectedRows > 0 ? 'Eliminado' : 'No encontrado',
        });
      }

      return jsonResponse(405, { success: false, error: 'Método no permitido' });
    });
  } catch (err: any) {
    return jsonResponse(500, { success: false, error: 'Error en series_plusmovie: ' + (err?.message || String(err)) });
  }
}

async function handleLoginPlusmovie(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Método no permitido' });
  }
  const input = await parseRequestBody(request);
  const email = input.email ? String(input.email).trim() : '';
  const password = input.password ? String(input.password) : '';
  if (!email || !password) {
    return jsonResponse(400, { success: false, error: 'Faltan parámetros (email, password)' });
  }
  try {
    return await withMysql(PLUSMOVIE_CONFIG, async (query) => {
      const { rows } = await query(
        'SELECT username, role FROM `user` WHERE email = ? AND password = ? AND role = ? LIMIT 1',
        [email, md5(password), 'admin']
      );
      const user = rows[0];
      if (!user) {
        return jsonResponse(401, { success: false, error: 'Credenciales inválidas o sin permisos' });
      }
      return jsonResponse(200, {
        success: true,
        message: 'Login correcto',
        data: { username: user.username, role: user.role },
      });
    });
  } catch (err: any) {
    return jsonResponse(500, { success: false, error: 'Error al procesar login: ' + (err?.message || String(err)) });
  }
}

// ============================================================================
// Proxy Handler (/proxy.php, /proxy, /api/proxy)
// ============================================================================
async function handleProxy(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const reqUrl = new URL(request.url);
  const targetUrl = reqUrl.searchParams.get('url');
  const referer = reqUrl.searchParams.get('referer');
  const resolveRedirect = reqUrl.searchParams.get('resolve_redirect') === 'true';

  if (!targetUrl) {
    return jsonResponse(400, { error: 'No URL provided' });
  }

  if (resolveRedirect) {
    try {
      const redirectHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: '*/*',
      };
      if (referer) {
        redirectHeaders['Referer'] = referer;
      } else if (targetUrl.includes('embed69.org')) {
        redirectHeaders['Referer'] = 'https://pelisplushd.bz/';
      }

      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: redirectHeaders,
        redirect: 'follow',
      });
      return jsonResponse(200, { finalUrl: res.url || targetUrl });
    } catch (err: any) {
      return jsonResponse(200, { finalUrl: targetUrl, error: err?.message || 'Redirect resolution failed' });
    }
  }

  const outgoingHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };

  if (request.method === 'POST') {
    outgoingHeaders['Accept'] = '*/*';
    outgoingHeaders['X-Requested-With'] = 'XMLHttpRequest';
    const ct = request.headers.get('content-type');
    if (ct) outgoingHeaders['Content-Type'] = ct;
  } else {
    outgoingHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  }

  if (referer) {
    outgoingHeaders['Referer'] = referer;
  } else if (targetUrl.includes('embed69.org')) {
    outgoingHeaders['Referer'] = 'https://pelisplushd.bz/';
  }

  const customHeadersRaw = request.headers.get('x-proxy-headers');
  if (customHeadersRaw) {
    try {
      const parsed = JSON.parse(customHeadersRaw);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          outgoingHeaders[k] = String(v);
        }
      }
    } catch {
      // ignore
    }
  }

  const customCookies = request.headers.get('x-proxy-cookies');
  if (customCookies) {
    outgoingHeaders['Cookie'] = customCookies;
  }

  let body: ArrayBuffer | undefined = undefined;
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    try {
      const buf = await request.arrayBuffer();
      if (buf && buf.byteLength > 0) body = buf;
    } catch {
      body = undefined;
    }
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: outgoingHeaders,
      body,
      redirect: 'follow',
    });

    const responseBody = await upstream.arrayBuffer();
    const contentType = upstream.headers.get('content-type') || 'text/plain';

    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': contentType,
      },
    });
  } catch (err: any) {
    return jsonResponse(500, { error: err?.message || 'Error fetching URL' });
  }
}

// ============================================================================
// Cloudflare Pages _worker.js Entrypoint
// ============================================================================
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS preflight for all API routes
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS_HEADERS,
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    switch (pathname) {
      case '/login_dooplex.php':
        return await handleLoginDooplex(request);
      case '/dashboard.php':
        return await handleDashboard(request);
      case '/movie_dooplex.php':
        return await handleMovieDooplex(request, url.searchParams);
      case '/series_dooplex.php':
        return await handleSeriesDooplex(request, url.searchParams);
      case '/anime_dooplex.php':
        return await handleAnimeDooplex(request, url.searchParams);
      case '/movie_docines.php':
        return await handleMovieDocines(request, url.searchParams);
      case '/series_docines.php':
        return await handleSeriesDocines(request, url.searchParams);
      case '/movie_plusmovie.php':
        return await handleMoviePlusmovie(request, url.searchParams);
      case '/series_plusmovie.php':
        return await handleSeriesPlusmovie(request, url.searchParams);
      case '/login_plusmovie.php':
        return await handleLoginPlusmovie(request);
      case '/proxy.php':
      case '/proxy':
      case '/api/proxy':
        return await handleProxy(request);
    }

    // Serve static files and SPA fallback via Cloudflare Pages ASSETS binding
    if (env && env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status === 404 && request.method === 'GET' && !pathname.includes('.')) {
        const indexUrl = new URL('/index.html', request.url);
        return await env.ASSETS.fetch(new Request(indexUrl.toString(), request));
      }
      return assetRes;
    }

    return new Response('Not found', { status: 404 });
  },
};

