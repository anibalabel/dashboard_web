export const DEFAULT_STREAMWISH_BASE = 'https://streamwish.fun/e/';
const STORAGE_KEY = 'streamwish_base_url';
const FIREBASE_PATH = 'server_configs/streamwish_base_url';
const CONFIG_EVENT = 'streamwish_config_changed';

// Variable en memoria para entornos Node / Tests o respaldo
let inMemoryBaseUrl = DEFAULT_STREAMWISH_BASE;

/**
 * Normaliza la URL base asegurando que termine con '/' o '/e/' según corresponda.
 * Si el usuario introduce solo el dominio (ej: "streamwish.fun" o "https://streamwish.to"),
 * lo normaliza a "https://streamwish.to/e/".
 */
export function normalizeStreamwishBase(base: string): string {
  if (!base || !base.trim()) {
    return DEFAULT_STREAMWISH_BASE;
  }

  let cleaned = base.trim();
  
  // Agregar protocolo si no tiene
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `https://${cleaned}`;
  }

  try {
    const parsed = new URL(cleaned);
    let pathname = parsed.pathname.replace(/\/+$/, '');
    
    // Si no tiene ruta o es '/', establecer /e
    if (!pathname || pathname === '' || pathname === '/') {
      pathname = '/e';
    }

    return `${parsed.origin}${pathname}/`;
  } catch {
    // Fallback de string si URL parser falla
    cleaned = cleaned.replace(/\/+$/, '');
    if (!cleaned.endsWith('/e') && !cleaned.endsWith('/f') && !cleaned.endsWith('/d')) {
      cleaned = `${cleaned}/e`;
    }
    return `${cleaned}/`;
  }
}

/**
 * Obtiene la URL base configurada para Streamwish (LocalStorage / Memoria con fallback a predeterminado).
 */
export function getStreamwishBaseUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored.trim()) {
        return normalizeStreamwishBase(stored);
      }
    } catch {
      // Si falla acceso a localStorage, usar memoria
    }
  }

  return inMemoryBaseUrl || DEFAULT_STREAMWISH_BASE;
}

/**
 * Guarda la URL base configurada en LocalStorage, memoria y opcionalmente en Firebase.
 */
export async function setStreamwishBaseUrl(newBase: string, syncFirebase = true): Promise<string> {
  const normalized = normalizeStreamwishBase(newBase);
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
 * Suscribe un callback a cambios de configuración de Streamwish (tanto locales como en Firebase).
 */
export function subscribeStreamwishConfig(callback: (baseUrl: string) => void): () => void {
  // 1. Escuchar cambios locales (misma ventana o entre pestañas)
  const handleLocalChange = (e: Event) => {
    const customEvt = e as CustomEvent<{ baseUrl: string }>;
    if (customEvt.detail?.baseUrl) {
      callback(customEvt.detail.baseUrl);
    } else {
      callback(getStreamwishBaseUrl());
    }
  };

  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      callback(normalizeStreamwishBase(e.newValue));
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
            const normalized = normalizeStreamwishBase(data);
            inMemoryBaseUrl = normalized;
            try {
              localStorage.setItem(STORAGE_KEY, normalized);
            } catch {}
            callback(normalized);
          }
        }, (err) => {
          // Si Firebase no tiene permisos públicos de lectura, usamos la configuración local sin saturar la consola
          if (err && (err.message?.includes('permission_denied') || (err as any).code === 'PERMISSION_DENIED')) {
            return;
          }
          console.warn('Error leyendo Streamwish config de Firebase:', err);
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
 * Comprueba si un servidor o URL corresponde a Streamwish o sus variantes conocidas.
 */
export function isStreamwishUrlOrServer(url?: string | null, serverName?: string): boolean {
  if (serverName && /(?:streamwish|embedwish|wishembed|awish|mwish|swishsrv|swish|wish)/i.test(serverName)) {
    return true;
  }

  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();

  return /(?:streamwish\.[a-z0-9]+|embedwish\.[a-z0-9]+|wishembed\.[a-z0-9]+|awish\.[a-z0-9]+|mwish\.[a-z0-9]+|swishsrv\.[a-z0-9]+|filelions\.[a-z0-9]+)/i.test(trimmed);
}

/**
 * Extrae el VIDEO_ID de un enlace o embed de Streamwish de forma robusta.
 */
export function extractStreamwishVideoId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // 1. Patrones estándar: /e/VIDEO_ID, /f/VIDEO_ID, /d/VIDEO_ID, /v/VIDEO_ID, /embed/VIDEO_ID
  const eMatch = trimmed.match(/(?:\/e\/|\/f\/|\/d\/|\/v\/|\/embed\/)([a-zA-Z0-9_-]+)/i);
  if (eMatch && eMatch[1]) {
    return eMatch[1].replace(/\.html?$/i, '');
  }

  // 2. Parámetros query: ?id=VIDEO_ID o &id=VIDEO_ID
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (queryMatch && queryMatch[1]) {
    return queryMatch[1];
  }

  // 3. URLs con .html al final: ej. https://streamwish.to/3r0ttf5nvn5w.html
  const htmlMatch = trimmed.match(/\/([a-zA-Z0-9_-]{4,})\.html?(?:[?#]|$)/i);
  if (htmlMatch && htmlMatch[1]) {
    return htmlMatch[1];
  }

  // 4. Último segmento de ruta limpio: ej. https://streamwish.to/3r0ttf5nvn5w
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
 * Convierte y normaliza cualquier URL o servidor de Streamwish al formato configurado:
 * Por defecto: https://streamwish.fun/e/VIDEO_ID
 */
export function formatStreamwishUrl(
  url: string | null | undefined,
  serverName?: string,
  customBaseUrl?: string
): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const isStreamwish = isStreamwishUrlOrServer(trimmed, serverName);
  if (!isStreamwish) {
    return trimmed;
  }

  const videoId = extractStreamwishVideoId(trimmed);
  if (!videoId) {
    return trimmed;
  }

  const base = customBaseUrl ? normalizeStreamwishBase(customBaseUrl) : getStreamwishBaseUrl();
  return `${base}${videoId}`;
}
