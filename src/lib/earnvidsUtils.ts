export const DEFAULT_EARNVIDS_BASE = 'https://smoothpre.com/v/';
const STORAGE_KEY = 'earnvids_base_url';
const FIREBASE_PATH = 'server_configs/earnvids_base_url';
const CONFIG_EVENT = 'earnvids_config_changed';

// Variable en memoria para entornos Node / Tests o respaldo
let inMemoryBaseUrl = DEFAULT_EARNVIDS_BASE;

/**
 * Normaliza la URL base asegurando que termine con '/' o '/v/' según corresponda.
 * Si el usuario introduce solo el dominio (ej: "smoothpre.com" o "https://smoothpre.com"),
 * lo normaliza a "https://smoothpre.com/v/".
 */
export function normalizeEarnvidsBase(base: string): string {
  if (!base || !base.trim()) {
    return DEFAULT_EARNVIDS_BASE;
  }

  let cleaned = base.trim();

  // Agregar protocolo si no tiene
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `https://${cleaned}`;
  }

  try {
    const parsed = new URL(cleaned);
    let pathname = parsed.pathname.replace(/\/+$/, '');

    // Si no tiene ruta o es '/', establecer /v
    if (!pathname || pathname === '' || pathname === '/') {
      pathname = '/v';
    }

    return `${parsed.origin}${pathname}/`;
  } catch {
    // Fallback de string si URL parser falla
    cleaned = cleaned.replace(/\/+$/, '');
    if (!cleaned.endsWith('/v') && !cleaned.endsWith('/e') && !cleaned.endsWith('/d') && !cleaned.endsWith('/f')) {
      cleaned = `${cleaned}/v`;
    }
    return `${cleaned}/`;
  }
}

/**
 * Obtiene la URL base configurada para EarnVids (LocalStorage / Memoria con fallback a predeterminado).
 */
export function getEarnvidsBaseUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored.trim()) {
        return normalizeEarnvidsBase(stored);
      }
    } catch {
      // Si falla acceso a localStorage, usar memoria
    }
  }

  return inMemoryBaseUrl || DEFAULT_EARNVIDS_BASE;
}

/**
 * Guarda la URL base configurada en LocalStorage, memoria y opcionalmente en Firebase.
 */
export async function setEarnvidsBaseUrl(newBase: string, syncFirebase = true): Promise<string> {
  const normalized = normalizeEarnvidsBase(newBase);
  inMemoryBaseUrl = normalized;

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
      window.dispatchEvent(new CustomEvent(CONFIG_EVENT, { detail: { baseUrl: normalized } }));
    } catch (e) {
      console.error('Error guardando en localStorage:', e);
    }
  }

  if (syncFirebase && typeof window !== 'undefined') {
    try {
      const { ref, set } = await import('firebase/database');
      const { database } = await import('./firebase');
      await set(ref(database, FIREBASE_PATH), normalized);
    } catch (e) {
      console.warn('No se pudo sincronizar en Firebase:', e);
    }
  }

  return normalized;
}

/**
 * Suscribe un callback a cambios de configuración de EarnVids (tanto locales como en Firebase).
 */
export function subscribeEarnvidsConfig(callback: (baseUrl: string) => void): () => void {
  // 1. Escuchar cambios locales (misma ventana o entre pestañas)
  const handleLocalChange = (e: Event) => {
    const customEvt = e as CustomEvent<{ baseUrl: string }>;
    if (customEvt.detail?.baseUrl) {
      callback(customEvt.detail.baseUrl);
    } else {
      callback(getEarnvidsBaseUrl());
    }
  };

  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      callback(normalizeEarnvidsBase(e.newValue));
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener(CONFIG_EVENT, handleLocalChange);
    window.addEventListener('storage', handleStorageChange);
  }

  // 2. Escuchar cambios en Firebase si está en el navegador
  let fbUnsubscribe = () => {};
  if (typeof window !== 'undefined') {
    import('firebase/database')
      .then(async ({ ref, onValue }) => {
        const { database } = await import('./firebase');
        const configRef = ref(database, FIREBASE_PATH);
        fbUnsubscribe = onValue(configRef, (snapshot) => {
          const data = snapshot.val();
          if (data && typeof data === 'string' && data.trim()) {
            const normalized = normalizeEarnvidsBase(data);
            inMemoryBaseUrl = normalized;
            try {
              localStorage.setItem(STORAGE_KEY, normalized);
            } catch {}
            callback(normalized);
          }
        }, (err) => {
          console.warn('Error leyendo EarnVids config de Firebase:', err);
        });
      })
      .catch((err) => {
        console.warn('Error inicializando listener Firebase:', err);
      });
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(CONFIG_EVENT, handleLocalChange);
      window.removeEventListener('storage', handleStorageChange);
    }
    fbUnsubscribe();
  };
}

/**
 * Comprueba si un servidor o URL corresponde a EarnVids o sus variantes conocidas (smoothpre, earnvid, etc.).
 */
export function isEarnvidsUrlOrServer(url?: string | null, serverName?: string): boolean {
  if (serverName && /(?:earnvids|earnvid|smoothpre|smoothplay|smooth)/i.test(serverName)) {
    return true;
  }

  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();

  return /(?:earnvids\.[a-z0-9]+|earnvid\.[a-z0-9]+|smoothpre\.[a-z0-9]+|smoothplay\.[a-z0-9]+)/i.test(trimmed);
}

/**
 * Extrae el VIDEO_ID de un enlace o embed de EarnVids / Smoothpre de forma robusta.
 */
export function extractEarnvidsVideoId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // 1. Patrones estándar: /v/VIDEO_ID, /e/VIDEO_ID, /d/VIDEO_ID, /f/VIDEO_ID, /embed/VIDEO_ID, /embed-VIDEO_ID.html
  const embedHyphenMatch = trimmed.match(/\/embed-([a-zA-Z0-9_-]+)(?:\.html?)?/i);
  if (embedHyphenMatch && embedHyphenMatch[1]) {
    return embedHyphenMatch[1];
  }

  const eMatch = trimmed.match(/(?:\/v\/|\/e\/|\/d\/|\/f\/|\/embed\/)([a-zA-Z0-9_-]+)/i);
  if (eMatch && eMatch[1]) {
    return eMatch[1].replace(/\.html?$/i, '');
  }

  // 2. Parámetros query: ?id=VIDEO_ID o &id=VIDEO_ID
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (queryMatch && queryMatch[1]) {
    return queryMatch[1];
  }

  // 3. URLs con .html al final: ej. https://smoothpre.com/3r0ttf5nvn5w.html o https://earnvids.com/3r0ttf5nvn5w.html
  const htmlMatch = trimmed.match(/\/([a-zA-Z0-9_-]{4,})\.html?(?:[?#]|$)/i);
  if (htmlMatch && htmlMatch[1]) {
    return htmlMatch[1];
  }

  // 4. Último segmento de ruta limpio: ej. https://smoothpre.com/3r0ttf5nvn5w o https://earnvids.com/3r0ttf5nvn5w
  try {
    const fullUrl = trimmed.startsWith('//') ? 'https:' + trimmed : trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(fullUrl);
    const segments = parsed.pathname.split('/').filter(s => s.trim().length > 0);
    if (segments.length > 0) {
      let lastSegment = segments[segments.length - 1];
      lastSegment = lastSegment.replace(/\.html?$/i, '');
      if (/^[a-zA-Z0-9_-]{4,}$/.test(lastSegment)) {
        return lastSegment;
      }
    }
  } catch {
    const lastSlashMatch = trimmed.match(/\/([a-zA-Z0-9_-]{4,})(?:\.html)?(?:\?|#|$)/i);
    if (lastSlashMatch && lastSlashMatch[1]) {
      return lastSlashMatch[1].replace(/\.html?$/i, '');
    }
  }

  return null;
}

/**
 * Convierte y normaliza cualquier URL o servidor de EarnVids al formato estándar:
 * Por defecto: https://smoothpre.com/v/VIDEO_ID
 */
export function formatEarnvidsUrl(
  url: string | null | undefined,
  serverName?: string,
  customBaseUrl?: string
): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const isEarnvids = isEarnvidsUrlOrServer(trimmed, serverName);
  if (!isEarnvids) {
    return trimmed;
  }

  const videoId = extractEarnvidsVideoId(trimmed);
  if (!videoId) {
    return trimmed;
  }

  const base = customBaseUrl ? normalizeEarnvidsBase(customBaseUrl) : getEarnvidsBaseUrl();
  return `${base}${videoId}`;
}
