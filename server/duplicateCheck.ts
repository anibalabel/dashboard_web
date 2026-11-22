/**
 * Normaliza una URL para detectar enlaces duplicados antes de hacer INSERT en BD.
 * Unifica http -> https, host en minúsculas sin "www." y elimina barras/espacios sobrantes,
 * preservando mayúsculas/minúsculas en pathname/query/hash (IDs de video).
 */
export function normalizeComparableUrl(rawUrl: unknown): string {
  const trimmed = rawUrl === null || rawUrl === undefined ? '' : String(rawUrl).trim();
  if (!trimmed) return '';

  const withProtocol = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  try {
    const parsed = new URL(withProtocol);
    const protocol = parsed.protocol === 'http:' ? 'https:' : parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const port = parsed.port ? `:${parsed.port}` : '';
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${protocol}//${hostname}${port}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return withProtocol.replace(/^http:\/\//i, 'https://').replace(/\/+$/, '');
  }
}

export function trimNullableUrl(rawUrl: unknown): string | null {
  if (rawUrl === null || rawUrl === undefined) return null;
  const trimmed = String(rawUrl).trim();
  return trimmed === '' ? null : trimmed;
}

export function findDuplicateUrlRow<T extends Record<string, unknown>>(
  rows: T[],
  urlColumn: keyof T,
  incomingUrl: unknown
): T | null {
  const target = normalizeComparableUrl(incomingUrl);
  if (!target) return null;

  for (const row of rows) {
    if (normalizeComparableUrl(row[urlColumn]) === target) {
      return row;
    }
  }
  return null;
}

export function computeNextMissingOrder(orders: number[]): number {
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

export function buildDuplicateResponse(extraData: Record<string, unknown> = {}) {
  return {
    success: true,
    duplicate: true,
    skipped: true,
    message: 'El enlace ya existe en la BD (omitido)',
    data: {
      ...extraData,
      duplicate: true,
    },
  };
}
