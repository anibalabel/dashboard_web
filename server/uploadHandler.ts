import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_HEADER_BUFFER = 64 * 1024;
const MAX_APK_BYTES = Number(process.env.MAX_APK_UPLOAD_BYTES || 200 * 1024 * 1024);

function extractBoundary(contentType?: string): string | null {
  if (!contentType || !/multipart\/form-data/i.test(contentType)) {
    return null;
  }
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  return (match?.[1] || match?.[2] || '').trim() || null;
}

function parsePartDisposition(headerText: string): { name?: string; filename?: string } {
  const dispLine = headerText
    .split(/\r?\n/)
    .find((line) => /^content-disposition\s*:/i.test(line));
  if (!dispLine) return {};

  const nameMatch = dispLine.match(/\bname="([^"]*)"/i);
  const filenameMatch = dispLine.match(/\bfilename="([^"]*)"/i);
  return {
    name: nameMatch?.[1],
    filename: filenameMatch?.[1],
  };
}

class ApkUploadHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Recibe un multipart/form-data (.apk) haciendo streaming directo a disco
 * para mantener el uso de memoria minimo en hostings compartidos (Namecheap).
 */
export async function streamMultipartApkToFile(
  req: IncomingMessage,
  destinationDir: string,
  targetFilename = 'app-streamnexus.apk'
): Promise<{ filename: string; bytes: number }> {
  const boundary = extractBoundary(req.headers['content-type'] ? String(req.headers['content-type']) : undefined);
  if (!boundary) {
    throw new ApkUploadHttpError(400, 'No se recibió ningún archivo');
  }

  fs.mkdirSync(destinationDir, { recursive: true });
  const destinationPath = path.join(destinationDir, targetFilename);
  const tmpPath = path.join(
    destinationDir,
    `.tmp-${targetFilename}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
  );

  const firstBoundary = Buffer.from(`--${boundary}`);
  const nextBoundary = Buffer.from(`\r\n--${boundary}`);

  type State = 'preamble' | 'headers' | 'file' | 'skip_part' | 'done';
  let state: State = 'preamble';
  let buffer = Buffer.alloc(0);
  let writeStream: fs.WriteStream | null = null;
  let bytesWritten = 0;
  let fileReceived = false;

  const closeStream = async (): Promise<void> => {
    const stream = writeStream;
    if (!stream) return;
    writeStream = null;
    await new Promise<void>((resolve, reject) => {
      stream.on('error', reject);
      stream.end(() => resolve());
    });
  };

  const cleanupTmp = () => {
    if (writeStream) {
      try {
        writeStream.destroy();
      } catch {
        // ignore
      }
      writeStream = null;
    }
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // ignore
    }
  };

  const writeFileChunk = async (chunk: Buffer): Promise<void> => {
    if (chunk.length === 0) return;
    bytesWritten += chunk.length;
    if (bytesWritten > MAX_APK_BYTES) {
      throw new ApkUploadHttpError(413, 'El archivo APK excede el tamaño máximo permitido');
    }
    if (!writeStream) {
      throw new ApkUploadHttpError(500, 'No se pudo escribir el archivo en el servidor');
    }
    const canContinue = writeStream.write(chunk);
    if (!canContinue) {
      await new Promise<void>((resolve, reject) => {
        writeStream!.once('drain', resolve);
        writeStream!.once('error', reject);
      });
    }
  };

  try {
    for await (const rawChunk of req) {
      const chunk = typeof rawChunk === 'string' ? Buffer.from(rawChunk) : (rawChunk as Buffer);
      if (state === 'done') continue;

      buffer = buffer.length > 0 ? Buffer.concat([buffer, chunk]) : chunk;

      let progress = true;
      while (progress) {
        progress = false;

        if (state === 'preamble' || state === 'skip_part') {
          const targetBoundary = state === 'preamble' ? firstBoundary : nextBoundary;
          const idx = buffer.indexOf(targetBoundary);
          if (idx === -1) {
            if (buffer.length > targetBoundary.length) {
              buffer = buffer.subarray(buffer.length - targetBoundary.length);
            }
            break;
          }
          buffer = buffer.subarray(idx + targetBoundary.length);
          if (buffer.length >= 2 && buffer.subarray(0, 2).toString() === '--') {
            state = 'done';
            break;
          }
          if (buffer.length >= 2 && buffer[0] === 13 && buffer[1] === 10) {
            buffer = buffer.subarray(2);
          }
          state = 'headers';
          progress = true;
        } else if (state === 'headers') {
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd === -1) {
            if (buffer.length > MAX_HEADER_BUFFER) {
              throw new ApkUploadHttpError(400, 'Cabeceras multipart demasiado grandes');
            }
            break;
          }

          const headerText = buffer.subarray(0, headerEnd).toString('utf-8');
          buffer = buffer.subarray(headerEnd + 4);
          const disp = parsePartDisposition(headerText);

          if (disp.filename !== undefined) {
            const ext = path.extname(disp.filename).toLowerCase();
            if (ext !== '.apk') {
              throw new ApkUploadHttpError(400, 'El archivo debe ser .apk');
            }
            fileReceived = true;
            writeStream = fs.createWriteStream(tmpPath);
            state = 'file';
          } else {
            state = 'skip_part';
          }
          progress = true;
        } else if (state === 'file') {
          const idx = buffer.indexOf(nextBoundary);
          if (idx !== -1) {
            await writeFileChunk(buffer.subarray(0, idx));
            await closeStream();
            buffer = buffer.subarray(idx + nextBoundary.length);
            state = 'done';
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
      throw new ApkUploadHttpError(400, 'No se recibió ningún archivo');
    }

    fs.renameSync(tmpPath, destinationPath);
    return { filename: targetFilename, bytes: bytesWritten };
  } catch (err) {
    cleanupTmp();
    throw err;
  }
}

export async function handleUploadApkRequest(
  req: IncomingMessage,
  res: ServerResponse,
  staticDir: string
): Promise<void> {
  const setCors = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end(JSON.stringify(body));
  };

  if (req.method === 'OPTIONS') {
    setCors(200, { ok: true });
    return;
  }

  if (req.method !== 'POST') {
    setCors(405, { success: false, error: 'Método no permitido' });
    return;
  }

  try {
    const saved = await streamMultipartApkToFile(req, staticDir, 'app-streamnexus.apk');
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const url = `${proto}://${host}/${saved.filename}`;

    setCors(200, {
      success: true,
      filename: saved.filename,
      url,
    });
  } catch (err: unknown) {
    if (err instanceof ApkUploadHttpError) {
      setCors(err.status, { success: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'No se pudo guardar el archivo en el servidor';
    setCors(500, { success: false, error: message });
  }
}
