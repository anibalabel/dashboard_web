import path from 'node:path';
import { loadEnvFiles } from './env';
import { createNodeAppServer } from './nodeApp';

// En Phusion Passenger (Namecheap cPanel Setup Node.js App), este archivo se carga via require()
// desde lsnode.js, por lo que require.main === module es false en produccion.
// Solo evitamos iniciar el servidor si estamos corriendo pruebas con Vitest o DISABLE_AUTO_LISTEN=1.
const shouldStart = !process.env.VITEST && process.env.DISABLE_AUTO_LISTEN !== '1';

if (shouldStart) {
  const rootDir = typeof __dirname === 'string' ? __dirname : process.cwd();
  loadEnvFiles([process.cwd(), rootDir]);

  const rawPort = process.env.PORT;
  const port = rawPort && /^\d+$/.test(rawPort) ? Number(rawPort) : rawPort || 3000;
  const host = process.env.HOST?.trim();
  const distDir = path.resolve(process.env.DIST_DIR || path.join(rootDir, 'dist'));

  const server = createNodeAppServer({ distDir });

  // No pasar `host` salvo que HOST este definido explicitamente, para que Phusion Passenger
  // intercepte server.listen(port) sin conflictos.
  if (host && typeof port === 'number') {
    server.listen(port, host, () => {
      console.log(`[dashboard_web] Servidor Node.js activo en http://${host}:${port} (dist: ${distDir})`);
    });
  } else {
    server.listen(port as number, () => {
      console.log(`[dashboard_web] Servidor Node.js activo en puerto ${port} (dist: ${distDir})`);
    });
  }

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
