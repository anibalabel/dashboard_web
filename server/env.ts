import fs from 'node:fs';
import path from 'node:path';

/**
 * Parsea el contenido de un archivo .env sin dependencias externas.
 */
export function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const line = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

const loadedDirs = new Set<string>();

/**
 * Carga archivos .env (si existen) en process.env sin sobrescribir variables ya definidas
 * por el sistema o por el panel de cPanel / Namecheap.
 */
export function loadEnvFiles(baseDirs: string[] = [process.cwd()], options?: { force?: boolean }): void {
  const nodeEnv = process.env.NODE_ENV?.trim();
  const candidates = ['.env', '.env.local'];
  if (nodeEnv) {
    candidates.push(`.env.${nodeEnv}`, `.env.${nodeEnv}.local`);
  }

  const uniqueDirs = Array.from(new Set(baseDirs.map((d) => path.resolve(d))));
  for (const dir of uniqueDirs) {
    if (!options?.force && loadedDirs.has(dir)) continue;
    loadedDirs.add(dir);

    for (const fileName of candidates) {
      const fullPath = path.join(dir, fileName);
      if (!fs.existsSync(fullPath)) continue;
      try {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsed = parseEnvContent(raw);
        for (const [k, v] of Object.entries(parsed)) {
          if (process.env[k] === undefined) {
            process.env[k] = v;
          }
        }
      } catch {
        // Ignore unreadable .env files
      }
    }
  }
}
