// Synchronous fast SHA-256 in pure JS for Proof-of-Work mining and AES key derivation
function sha256Sync(ascii: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const maxWord = Math.pow(2, 32);
  let i: number, j: number;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15],
        w2 = w[i - 2];

      const a = hash[0],
        e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

// Pure JS AES-256-CBC Decryption (works in all browsers without HTTPS/crypto.subtle requirements)
function aesDecryptCBCSync(ciphertextWithIvBase64: string, keyBytes: Uint8Array): string | null {
  try {
    const binaryStr = atob(ciphertextWithIvBase64);
    const input = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      input[i] = binaryStr.charCodeAt(i);
    }

    if (input.length < 16) return null;
    const iv = input.slice(0, 16);
    const ciphertext = input.slice(16);

    if (ciphertext.length % 16 !== 0) return null;

    const SBOX = new Uint8Array([
      0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
      0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
      0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
      0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
      0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
      0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
      0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
      0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
      0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
      0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
      0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
      0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
      0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
      0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
      0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
      0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
    ]);

    const INV_SBOX = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      INV_SBOX[SBOX[i]] = i;
    }

    const RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

    const Nk = 8;
    const Nr = 14;
    const w = new Uint32Array(4 * (Nr + 1));

    for (let i = 0; i < Nk; i++) {
      w[i] = (keyBytes[4 * i] << 24) | (keyBytes[4 * i + 1] << 16) | (keyBytes[4 * i + 2] << 8) | keyBytes[4 * i + 3];
    }

    function subWord(word: number): number {
      return (
        (SBOX[(word >>> 24) & 0xff] << 24) |
        (SBOX[(word >>> 16) & 0xff] << 16) |
        (SBOX[(word >>> 8) & 0xff] << 8) |
        SBOX[word & 0xff]
      );
    }

    function rotWord(word: number): number {
      return ((word << 8) | (word >>> 24)) >>> 0;
    }

    for (let i = Nk; i < 4 * (Nr + 1); i++) {
      let temp = w[i - 1];
      if (i % Nk === 0) {
        temp = (subWord(rotWord(temp)) ^ (RCON[i / Nk] << 24)) >>> 0;
      } else if (Nk > 6 && i % Nk === 4) {
        temp = subWord(temp);
      }
      w[i] = (w[i - Nk] ^ temp) >>> 0;
    }

    function gmul(a: number, b: number): number {
      let p = 0;
      for (let c = 0; c < 8; c++) {
        if (b & 1) p ^= a;
        const hi_bit_set = a & 0x80;
        a = (a << 1) & 0xff;
        if (hi_bit_set) a ^= 0x1b;
        b >>>= 1;
      }
      return p;
    }

    function decryptBlock(blockIn: Uint8Array, blockOut: Uint8Array, offset: number) {
      const state = new Uint8Array(16);
      for (let i = 0; i < 16; i++) state[i] = blockIn[offset + i];

      for (let c = 0; c < 4; c++) {
        const kw = w[Nr * 4 + c];
        state[c * 4] ^= (kw >>> 24) & 0xff;
        state[c * 4 + 1] ^= (kw >>> 16) & 0xff;
        state[c * 4 + 2] ^= (kw >>> 8) & 0xff;
        state[c * 4 + 3] ^= kw & 0xff;
      }

      for (let round = Nr - 1; round >= 1; round--) {
        const s0 = state[0], s4 = state[4], s8 = state[8], s12 = state[12];
        const s1 = state[1], s5 = state[5], s9 = state[9], s13 = state[13];
        const s2 = state[2], s6 = state[6], s10 = state[10], s14 = state[14];
        const s3 = state[3], s7 = state[7], s11 = state[11], s15 = state[15];

        state[1] = s13; state[5] = s1; state[9] = s5; state[13] = s9;
        state[2] = s10; state[6] = s14; state[10] = s2; state[14] = s6;
        state[3] = s7; state[7] = s11; state[11] = s15; state[15] = s3;

        for (let i = 0; i < 16; i++) {
          state[i] = INV_SBOX[state[i]];
        }

        for (let c = 0; c < 4; c++) {
          const kw = w[round * 4 + c];
          state[c * 4] ^= (kw >>> 24) & 0xff;
          state[c * 4 + 1] ^= (kw >>> 16) & 0xff;
          state[c * 4 + 2] ^= (kw >>> 8) & 0xff;
          state[c * 4 + 3] ^= kw & 0xff;
        }

        for (let c = 0; c < 4; c++) {
          const idx = c * 4;
          const a0 = state[idx], a1 = state[idx + 1], a2 = state[idx + 2], a3 = state[idx + 3];
          state[idx] = gmul(a0, 0x0e) ^ gmul(a1, 0x0b) ^ gmul(a2, 0x0d) ^ gmul(a3, 0x09);
          state[idx + 1] = gmul(a0, 0x09) ^ gmul(a1, 0x0e) ^ gmul(a2, 0x0b) ^ gmul(a3, 0x0d);
          state[idx + 2] = gmul(a0, 0x0d) ^ gmul(a1, 0x09) ^ gmul(a2, 0x0e) ^ gmul(a3, 0x0b);
          state[idx + 3] = gmul(a0, 0x0b) ^ gmul(a1, 0x0d) ^ gmul(a2, 0x09) ^ gmul(a3, 0x0e);
        }
      }

      const s0 = state[0], s4 = state[4], s8 = state[8], s12 = state[12];
      const s1 = state[1], s5 = state[5], s9 = state[9], s13 = state[13];
      const s2 = state[2], s6 = state[6], s10 = state[10], s14 = state[14];
      const s3 = state[3], s7 = state[7], s11 = state[11], s15 = state[15];

      state[1] = s13; state[5] = s1; state[9] = s5; state[13] = s9;
      state[2] = s10; state[6] = s14; state[10] = s2; state[14] = s6;
      state[3] = s7; state[7] = s11; state[11] = s15; state[15] = s3;

      for (let i = 0; i < 16; i++) {
        state[i] = INV_SBOX[state[i]];
      }

      for (let c = 0; c < 4; c++) {
        const kw = w[c];
        state[c * 4] ^= (kw >>> 24) & 0xff;
        state[c * 4 + 1] ^= (kw >>> 16) & 0xff;
        state[c * 4 + 2] ^= (kw >>> 8) & 0xff;
        state[c * 4 + 3] ^= kw & 0xff;
      }

      for (let i = 0; i < 16; i++) {
        blockOut[offset + i] = state[i];
      }
    }

    const numBlocks = ciphertext.length / 16;
    const plaintextBytes = new Uint8Array(ciphertext.length);

    for (let b = 0; b < numBlocks; b++) {
      const offset = b * 16;
      decryptBlock(ciphertext, plaintextBytes, offset);
      const prevBlock = b === 0 ? iv : ciphertext.subarray(offset - 16, offset);
      for (let i = 0; i < 16; i++) {
        plaintextBytes[offset + i] ^= prevBlock[i];
      }
    }

    const padLen = plaintextBytes[plaintextBytes.length - 1];
    if (padLen < 1 || padLen > 16) return null;
    for (let i = plaintextBytes.length - padLen; i < plaintextBytes.length; i++) {
      if (plaintextBytes[i] !== padLen) return null;
    }

    const unpadded = plaintextBytes.subarray(0, plaintextBytes.length - padLen);
    return new TextDecoder().decode(unpadded);
  } catch {
    return null;
  }
}

export interface Embed69ServerItem {
  servername: string;
  link: string;
  type?: string;
}

export interface Embed69LanguageGroup {
  file_id?: number | string;
  video_language?: string;
  lang?: string;
  sortedEmbeds?: Embed69ServerItem[];
  downloadEmbeds?: Embed69ServerItem[];
}

export interface ExtractedLanguageUrls {
  lat: string | null;
  cast: string | null;
  sub: string | null;
}

/**
 * Extracts and decodes clean URL from an embed link (handling direct URL, decrypted AES, or JWT).
 */
export function extractCleanUrlFromEmbedLink(rawLink: string): string {
  if (!rawLink) return '';
  let clean = rawLink.replace(/`/g, '').trim();

  // If link is a JWT token (e.g. "header.payload.sig")
  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 3) {
      try {
        const base64Url = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = base64Url.length % 4;
        const padded = pad ? base64Url + '='.repeat(4 - pad) : base64Url;
        const payload = JSON.parse(atob(padded));
        if (payload && payload.link) {
          clean = String(payload.link).replace(/`/g, '').trim();
        }
      } catch {
        // Not a valid JWT or parse error, keep clean string
      }
    }
  }

  return clean;
}

/**
 * Detects the anti-bot interstitial (Anubis) that embed69 may serve instead of the player.
 */
export function isEmbed69BotChallenge(html: string): boolean {
  return /not a bot|\.within\.website|anubis/i.test(html);
}

/**
 * Parses Embed69 iframe HTML, solves Proof-of-Work (PoW) if present, and decrypts AES links.
 */
export async function parseAndDecryptEmbed69(
  iframeHtml: string,
  onLog?: (msg: string) => void
): Promise<Embed69LanguageGroup[] | null> {
  // 1. Locate data array in the HTML
  const dataMatch =
    iframeHtml.match(/let\s+dataLink\s*=\s*(\[[\s\S]*?\]);/) ||
    iframeHtml.match(/let\s+sortedEmbeds\s*=\s*(\[[\s\S]*?\]);/) ||
    iframeHtml.match(/(?:const\s+data|var\s+dataLink)\s*=\s*(\[[\s\S]*?\]);/);

  if (!dataMatch) {
    if (isEmbed69BotChallenge(iframeHtml)) {
      throw new Error(
        'Embed69 devolvió una página anti-bot (Anubis: "Making sure you\'re not a bot!") en lugar del reproductor. ' +
          'El proxy no puede obtener los datos mientras el desafío esté activo.'
      );
    }
    return null;
  }

  let parsedData: Embed69LanguageGroup[];
  try {
    parsedData = new Function(`return ${dataMatch[1]}`)();
  } catch {
    return null;
  }

  if (!Array.isArray(parsedData) || parsedData.length === 0) {
    return parsedData;
  }

  // 2. Check for PoW challenge + salt
  const challengeMatch = iframeHtml.match(/POW_CHALLENGE\s*=\s*['"]([^'"]+)['"]/);
  const difficultyMatch = iframeHtml.match(/POW_DIFFICULTY\s*=\s*(\d+)/);
  const saltMatch = iframeHtml.match(/POW_SALT\s*=\s*['"]([^'"]+)['"]/);

  if (challengeMatch && difficultyMatch && saltMatch) {
    const challenge = challengeMatch[1];
    const difficulty = parseInt(difficultyMatch[1], 10);
    const salt = saltMatch[1];
    const prefix = '0'.repeat(difficulty);

    if (onLog) {
      onLog(`Verificando encriptación PoW + AES...`);
    }

    // Solve PoW
    let nonce = 0;
    while (true) {
      const hash = sha256Sync(challenge + nonce);
      if (hash.startsWith(prefix)) {
        break;
      }
      nonce++;
    }

    // Derive AES key bytes
    const keyHashHex = sha256Sync(challenge + nonce + salt);
    const aesKeyBytes = new Uint8Array(keyHashHex.length / 2);
    for (let i = 0; i < keyHashHex.length; i += 2) {
      aesKeyBytes[i / 2] = parseInt(keyHashHex.substring(i, i + 2), 16);
    }

    // Decrypt all sortedEmbeds and downloadEmbeds links
    for (let fi = 0; fi < parsedData.length; fi++) {
      const file = parsedData[fi];
      if (Array.isArray(file.sortedEmbeds)) {
        for (let ei = 0; ei < file.sortedEmbeds.length; ei++) {
          const item = file.sortedEmbeds[ei];
          if (item && item.link && typeof item.link === 'string') {
            const dec = aesDecryptCBCSync(item.link, aesKeyBytes);
            if (dec) {
              parsedData[fi].sortedEmbeds![ei].link = dec;
            }
          }
        }
      }

      if (Array.isArray(file.downloadEmbeds)) {
        for (let ei = 0; ei < file.downloadEmbeds.length; ei++) {
          const item = file.downloadEmbeds[ei];
          if (item && item.link && typeof item.link === 'string') {
            const dec = aesDecryptCBCSync(item.link, aesKeyBytes);
            if (dec) {
              parsedData[fi].downloadEmbeds![ei].link = dec;
            }
          }
        }
      }
    }
  }

  return parsedData;
}
