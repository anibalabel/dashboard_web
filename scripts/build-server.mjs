import { build } from 'esbuild';
import path from 'node:path';

const rootDir = process.cwd();

await build({
  entryPoints: [path.join(rootDir, 'server', 'nodeServer.ts')],
  outfile: path.join(rootDir, 'server.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node18'],
  external: ['mysql2', 'mysql2/*', 'bcryptjs'],
  logLevel: 'info',
});
