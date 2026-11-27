import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnvContent, loadEnvFiles } from '../../server/env';
import { createNodeAppServer, stripBasePath } from '../../server/nodeApp';

async function listenEphemeral(server: http.Server): Promise<number> {
  return await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve(addr.port);
      } else {
        reject(new Error('No se pudo obtener el puerto'));
      }
    });
  });
}

describe('Namecheap Node.js Standalone Server & Env Helpers', () => {
  const tempDirs: string[] = [];
  const servers: http.Server[] = [];

  afterEach(async () => {
    for (const s of servers.splice(0)) {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
    for (const d of tempDirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('parseEnvContent y loadEnvFiles cargan variables sin sobrescribir las ya existentes', () => {
    const parsed = parseEnvContent(`
# comentario
DOOPLEX_DB_HOST="localhost"
export DOOPLEX_DB_PORT=3306
DOOPLEX_DB_NAME='mi_bd'
`);
    expect(parsed).toEqual({
      DOOPLEX_DB_HOST: 'localhost',
      DOOPLEX_DB_PORT: '3306',
      DOOPLEX_DB_NAME: 'mi_bd',
    });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-env-'));
    tempDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, '.env'),
      'TEST_ENV_FROM_FILE=desde_archivo\nTEST_ENV_KEEP=nuevo_valor\n',
      'utf-8'
    );

    const prevFromFile = process.env.TEST_ENV_FROM_FILE;
    const prevKeep = process.env.TEST_ENV_KEEP;
    try {
      delete process.env.TEST_ENV_FROM_FILE;
      process.env.TEST_ENV_KEEP = 'desde_cpanel';

      loadEnvFiles([dir], { force: true });
      expect(process.env.TEST_ENV_FROM_FILE).toBe('desde_archivo');
      expect(process.env.TEST_ENV_KEEP).toBe('desde_cpanel');
    } finally {
      if (prevFromFile === undefined) delete process.env.TEST_ENV_FROM_FILE;
      else process.env.TEST_ENV_FROM_FILE = prevFromFile;

      if (prevKeep === undefined) delete process.env.TEST_ENV_KEEP;
      else process.env.TEST_ENV_KEEP = prevKeep;
    }
  });

  it('stripBasePath normaliza rutas montadas en subdirectorio de Passenger', () => {
    expect(stripBasePath('/panel/dashboard.php', '/panel')).toBe('/dashboard.php');
    expect(stripBasePath('/panel', '/panel')).toBe('/');
    expect(stripBasePath('/assets/index.js', '')).toBe('/assets/index.js');
  });

  it('sirve dist/, SPA fallback, bloqueo de path traversal, /health, /proxy.php, /update_version.php y /upload_app.php', async () => {
    const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-dist-'));
    tempDirs.push(distDir);
    fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(distDir, 'index.html'), '<html><body>SPA OK</body></html>', 'utf-8');
    fs.writeFileSync(path.join(distDir, 'assets', 'app.js'), 'console.log("ok");', 'utf-8');
    fs.writeFileSync(
      path.join(distDir, 'v-streamnexus.json'),
      JSON.stringify({ version: '1.0', meta: { format: 'X.X' } }, null, 2),
      'utf-8'
    );

    const server = createNodeAppServer({ distDir });
    servers.push(server);
    const port = await listenEphemeral(server);
    const base = `http://127.0.0.1:${port}`;

    // 1. Health check
    const healthRes = await fetch(`${base}/health`);
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toEqual({ ok: true, status: 'up', distAvailable: true });

    // 2. Static asset & cache headers
    const jsRes = await fetch(`${base}/assets/app.js`);
    expect(jsRes.status).toBe(200);
    expect(jsRes.headers.get('cache-control')).toContain('immutable');
    expect(await jsRes.text()).toBe('console.log("ok");');

    // 3. SPA fallback
    const spaRes = await fetch(`${base}/series/registro-dooplex-v2`);
    expect(spaRes.status).toBe(200);
    expect(await spaRes.text()).toContain('SPA OK');

    // 4. Missing asset returns 404 (not SPA HTML)
    const missingAssetRes = await fetch(`${base}/assets/missing.js`);
    expect(missingAssetRes.status).toBe(404);

    // 5. Proxy validation without url returns 400
    const proxyRes = await fetch(`${base}/proxy.php`);
    expect(proxyRes.status).toBe(400);

    // 6. Update version JSON
    const badVerRes = await fetch(`${base}/update_version.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: '10.0' }),
    });
    expect(badVerRes.status).toBe(400);

    const okVerRes = await fetch(`${base}/update_version.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: '3.4' }),
    });
    expect(okVerRes.status).toBe(200);
    expect(await okVerRes.json()).toEqual({ success: true, version: '3.4' });

    const updatedJson = JSON.parse(fs.readFileSync(path.join(distDir, 'v-streamnexus.json'), 'utf-8'));
    expect(updatedJson.version).toBe('3.4');
    expect(updatedJson.meta).toEqual({ format: 'X.X' });

    // 7. Streaming APK upload + download
    const boundary = '----TestBoundary12345';
    const fakeApk = Buffer.from('PK\x03\x04FAKE_APK_BINARY_CONTENT');
    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="extra"\r\n\r\nhola\r\n`),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.apk"\r\nContent-Type: application/vnd.android.package-archive\r\n\r\n`
      ),
      fakeApk,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadRes = await fetch(`${base}/upload_app.php`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: multipartBody,
    });
    expect(uploadRes.status).toBe(200);
    const uploadJson = (await uploadRes.json()) as { success: boolean; filename: string };
    expect(uploadJson.success).toBe(true);
    expect(uploadJson.filename).toBe('app-streamnexus.apk');
    expect(fs.readFileSync(path.join(distDir, 'app-streamnexus.apk'))).toEqual(fakeApk);

    const downloadRes = await fetch(`${base}/app-streamnexus.apk`);
    expect(downloadRes.status).toBe(200);
    expect(Buffer.from(await downloadRes.arrayBuffer())).toEqual(fakeApk);

    // 8. Reject non-.apk upload
    const badApkBody = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="evil.exe"\r\n\r\nMZ123\r\n--${boundary}--\r\n`
    );
    const badApkRes = await fetch(`${base}/upload_app.php`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: badApkBody,
    });
    expect(badApkRes.status).toBe(400);
  });
});
