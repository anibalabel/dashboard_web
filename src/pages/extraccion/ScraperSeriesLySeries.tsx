import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Copy, Film, ListVideo, Loader2, Search, Terminal, Check } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDoodstreamUrl } from '@/lib/doodstreamUtils';

type LogLine = { msg: string; isError: boolean };

type SeriesLyEpisodeRow = {
  episode: string;
  server: string;
  language: string;
  qualityName: string;
  playUrl: string;
  finalSrc?: string | null;
};

const ALLOWED_LANGUAGES = ['Español - Latino', 'Español - España'] as const;
const MAIN_SERVERS = ['STREAMWISH', 'VIDARA', 'VIDSONIC'] as const;

const safeTrim = (value: string | null | undefined) => (value ?? '').trim();

const cleanInjectedQuotes = (value: string) =>
  value
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^['"]+|['"]+$/g, '')
    .trim();

const buildProxyUrl = (targetUrl: string, opts?: { cookieId?: string; referer?: string; resetCookie?: boolean }) => {
  let proxy = `/proxy.php?url=${encodeURIComponent(targetUrl)}`;
  if (opts?.referer) proxy += `&referer=${encodeURIComponent(opts.referer)}`;
  if (opts?.cookieId) proxy += `&cookie_id=${encodeURIComponent(opts.cookieId)}`;
  if (opts?.resetCookie) proxy += `&reset_cookie=true`;
  return proxy;
};

const isProbablyLoginPage = (html: string) => {
  const normalized = html.toLowerCase();
  return normalized.includes('type="password"') || normalized.includes('/login') || normalized.includes('/ingresar') || normalized.includes('iniciar sesión');
};

const pickLoginForm = (doc: Document) => {
  const forms = Array.from(doc.querySelectorAll('form'));
  for (const form of forms) {
    if (form.querySelector('input[type="password"]')) return form;
  }
  return forms[0] ?? null;
};

const extractPlayUrlFromRow = (row: Element): string | null => {
  const btn = row.querySelector('a[x-on\\:click*="playLink"], a[x-on\\:click*="playlink"], button[x-on\\:click*="playLink"], button[x-on\\:click*="playlink"]');
  const raw = btn?.getAttribute('x-on:click') ?? btn?.getAttribute('@click') ?? '';
  const compact = raw.replace(/\s+/g, ' ');

  const lower = compact.toLowerCase();
  const startIdx = lower.indexOf('playlink(');
  if (startIdx === -1) return null;

  const afterParen = compact.slice(startIdx + 'playlink('.length);
  const firstQuoteMatch = afterParen.match(/^\s*(['"])/);
  let extracted = '';

  if (firstQuoteMatch) {
    const quote = firstQuoteMatch[1];
    const contentStart = afterParen.indexOf(quote) + 1;
    const contentEnd = afterParen.indexOf(quote, contentStart);
    if (contentEnd === -1) return null;
    extracted = afterParen.slice(contentStart, contentEnd);
  } else {
    const cleaned = cleanInjectedQuotes(compact);
    const match =
      cleaned.match(/playLink\(\s*['"]\s*([^'"]+?)\s*['"]\s*,/i) ??
      cleaned.match(/playLink\(\s*([^,]+)\s*,/i);
    if (!match) return null;
    extracted = match[1] ?? '';
  }

  const firstArg = cleanInjectedQuotes(extracted);
  if (!firstArg) return null;

  try {
    return new URL(firstArg, window.location.origin).toString();
  } catch {
    return firstArg;
  }
};

const extractFinalSrcFromJsonOrHtml = (payload: string) => {
  const text = payload.trim();

  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object') {
      const eValue = (parsed as Record<string, unknown>).e;
      if (typeof eValue === 'string') {
        const iframeDoc = new DOMParser().parseFromString(eValue, 'text/html');
        const iframe = iframeDoc.querySelector('iframe[src]');
        const src = iframe?.getAttribute('src') ?? '';
        const cleaned = cleanInjectedQuotes(src);
        return cleaned || null;
      }
    }
  } catch {
    // ignore
  }

  const doc = new DOMParser().parseFromString(text, 'text/html');
  const iframe = doc.querySelector('iframe[src]');
  const src = iframe?.getAttribute('src') ?? '';
  const cleaned = cleanInjectedQuotes(src);
  if (cleaned) return cleaned;

  const match = text.match(/src\s*=\s*["'`]\s*([^"'`\s>]+)\s*["'`]/i);
  return match ? cleanInjectedQuotes(match[1]) : null;
};

const extractRowsFromEpisodeHtml = (episode: string, html: string): SeriesLyEpisodeRow[] => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = Array.from(doc.querySelectorAll('tr[data-server]'));

  const results: SeriesLyEpisodeRow[] = [];
  for (const row of rows) {
    const server = safeTrim(row.getAttribute('data-server'));
    if (!server) continue;
    const language = safeTrim(row.getAttribute('data-language')) || 'Desconocido';
    if (!ALLOWED_LANGUAGES.includes(language as (typeof ALLOWED_LANGUAGES)[number])) continue;

    const qualityName = safeTrim(row.getAttribute('data-quality-name')) || safeTrim(row.getAttribute('data-quality')) || '';
    const playUrl = extractPlayUrlFromRow(row);
    if (!playUrl) continue;

    results.push({ episode, server, language, qualityName, playUrl });
  }

  return results;
};

const parseSeriesSlug = (seriesUrl: string) => {
  const u = new URL(seriesUrl);
  const parts = u.pathname.split('/').filter(Boolean);
  const idx = parts.findIndex(p => p.toLowerCase() === 'series');
  const slug = idx >= 0 && parts[idx + 1] ? parts[idx + 1] : '';
  return { origin: u.origin, slug };
};

export default function ScraperSeriesLySeries() {
  const [seriesUrl, setSeriesUrl] = useState('https://primo-ly.enlace.ly/series/');
  const [season, setSeason] = useState(1);
  const [fromEpisode, setFromEpisode] = useState(1);
  const [toEpisode, setToEpisode] = useState(1);

  const [serverFilter, setServerFilter] = useState('TODOS');
  const [languageFilter, setLanguageFilter] = useState('TODOS');
  const [resolveFinalSrc, setResolveFinalSrc] = useState(true);

  const [useLogin, setUseLogin] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [turnstileResponse, setTurnstileResponse] = useState('');
  const [useManualCookie, setUseManualCookie] = useState(false);
  const [manualCookie, setManualCookie] = useState('');
  const [cookieId, setCookieId] = useState('');

  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [results, setResults] = useState<SeriesLyEpisodeRow[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    const existing = localStorage.getItem('seriesly_cookie_id');
    if (existing) {
      setCookieId(existing);
      return;
    }
    let next = '';
    try {
      next = crypto.randomUUID();
    } catch {
      next = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    localStorage.setItem('seriesly_cookie_id', next);
    setCookieId(next);
  }, []);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const addLog = (msg: string, isError = false) => {
    setLogs(prev => [...prev, { msg, isError }]);
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  const handleCopy = async (text: string, key: string, successMsg?: string) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      showNotification(successMsg || 'URL copiada al portapapeles');
      setTimeout(() => {
        setCopiedKey(prev => (prev === key ? null : prev));
      }, 2000);
    } else {
      showNotification('Error al copiar al portapapeles');
    }
  };

  const copyAllLinks = async () => {
    const links = filteredResults
      .map(r => r.finalSrc || r.playUrl)
      .filter((l): l is string => Boolean(l && l.trim()))
      .join('\n');

    if (links) {
      await handleCopy(links, 'all-all', 'Todos los enlaces copiados');
    } else {
      showNotification('No hay enlaces disponibles para copiar');
    }
  };

  const fetchText = async (targetUrl: string, opts?: { method?: string; body?: BodyInit; referer?: string; cookieId?: string; resetCookie?: boolean }) => {
    const proxyUrl = buildProxyUrl(targetUrl, { cookieId: opts?.cookieId, referer: opts?.referer, resetCookie: opts?.resetCookie });
    const headers: Record<string, string> = {};
    if (opts?.method?.toUpperCase() === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    }
    if (useManualCookie && manualCookie.trim()) {
      headers['X-Proxy-Cookie'] = manualCookie.trim();
    }
    const res = await fetch(proxyUrl, {
      method: opts?.method ?? 'GET',
      headers: Object.keys(headers).length ? headers : undefined,
      body: opts?.body,
    });
    if (!res.ok) throw new Error(`Error ${res.status} al consultar el proxy`);
    return await res.text();
  };

  const ensureLoggedIn = async (targetUrl: string) => {
    if (!useLogin) return;
    if (!loginUser || !loginPass) throw new Error('Credenciales incompletas');
    if (!cookieId) throw new Error('cookie_id vacío');

    const firstHtml = await fetchText(targetUrl, { cookieId });
    if (!isProbablyLoginPage(firstHtml)) return;

    addLog('Página requiere login, intentando autenticación...');
    const origin = new URL(targetUrl).origin;
    let loginHtml = firstHtml;
    if (!loginHtml.toLowerCase().includes('type="password"')) {
      loginHtml = await fetchText(`${origin}/ingresar`, { cookieId });
    }

    const doc = new DOMParser().parseFromString(loginHtml, 'text/html');
    const form = pickLoginForm(doc);
    if (!form) throw new Error('Formulario de login no encontrado');

    const actionAttrRaw = safeTrim(form.getAttribute('action')) || '/ingresar';
    const actionAttr = cleanInjectedQuotes(actionAttrRaw);
    const actionUrl = new URL(actionAttr || '/ingresar', origin).toString();

    const fields: Record<string, string> = {};
    const inputs = Array.from(form.querySelectorAll('input'));
    for (const input of inputs) {
      const name = safeTrim(input.getAttribute('name'));
      if (!name) continue;
      const type = (safeTrim(input.getAttribute('type')) || 'text').toLowerCase();
      if (type === 'hidden') fields[name] = safeTrim((input as HTMLInputElement).value);
    }

    const passInput = form.querySelector('input[type="password"][name]') as HTMLInputElement | null;
    const passName = safeTrim(passInput?.name) || 'password';
    const userInput =
      (form.querySelector('input[name*="email" i]') as HTMLInputElement | null) ??
      (form.querySelector('input[name*="user" i]') as HTMLInputElement | null) ??
      (form.querySelector('input[type="text"][name]') as HTMLInputElement | null);
    const userName = safeTrim(userInput?.name) || 'email';

    fields[userName] = loginUser;
    fields[passName] = loginPass;

    if (turnstileResponse.trim()) {
      fields['cf-turnstile-response'] = turnstileResponse.trim();
    }

    if (Object.keys(fields).some(k => k.toLowerCase() === 'cf-turnstile-response') && !fields['cf-turnstile-response']) {
      throw new Error('Falta cf-turnstile-response');
    }

    const body = new URLSearchParams(fields).toString();
    await fetchText(actionUrl, { method: 'POST', body, referer: actionUrl, cookieId });

    const afterHtml = await fetchText(targetUrl, { cookieId });
    if (isProbablyLoginPage(afterHtml)) throw new Error('Login fallido');
    addLog('Login OK');
  };

  const availableServers = useMemo(() => {
    const found = new Set(
      results
        .map(r => r.server)
        .filter(Boolean)
        .map(s => s.toUpperCase())
    );

    const ordered: string[] = ['TODOS'];
    for (const s of MAIN_SERVERS) ordered.push(s);

    const rest = Array.from(found)
      .filter(s => !MAIN_SERVERS.includes(s as (typeof MAIN_SERVERS)[number]))
      .sort((a, b) => a.localeCompare(b));
    ordered.push(...rest);

    return Array.from(new Set(ordered));
  }, [results]);

  const availableLanguages = useMemo(() => {
    return ['TODOS', ...Array.from(ALLOWED_LANGUAGES)];
  }, []);

  const filteredResults = useMemo(() => {
    return results.filter(r => {
      const serverOk = serverFilter === 'TODOS' || r.server.toUpperCase() === serverFilter.toUpperCase();
      const langOk = languageFilter === 'TODOS' || r.language.toLowerCase() === languageFilter.toLowerCase();
      return serverOk && langOk;
    });
  }, [languageFilter, results, serverFilter]);

  const handleResetSession = async () => {
    if (!seriesUrl || !cookieId) return;
    try {
      const origin = new URL(seriesUrl).origin;
      await fetchText(origin, { cookieId, resetCookie: true });
      addLog('Sesión reiniciada (cookies borradas)');
    } catch (e) {
      addLog(`No se pudo reiniciar sesión: ${e instanceof Error ? e.message : 'error desconocido'}`, true);
    }
  };

  const resolveToFinalSrc = async (playUrl: string, refererUrl: string) => {
    const raw = await fetchText(playUrl, { referer: refererUrl, cookieId: useLogin && !useManualCookie ? cookieId : undefined });
    let final = extractFinalSrcFromJsonOrHtml(raw);
    if (!final) return null;
    if (final.startsWith('//')) final = `https:${final}`;
    return formatDoodstreamUrl(final);
  };

  const handleScrape = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!seriesUrl) return;

    setIsScraping(true);
    setLogs([]);
    setResults([]);

    try {
      const targetUrl = cleanInjectedQuotes(seriesUrl);
      const { origin, slug } = parseSeriesSlug(targetUrl);
      if (!slug) throw new Error('No se pudo detectar el slug de la serie');

      const s = Math.max(1, Number(season) || 1);
      const from = Math.max(1, Number(fromEpisode) || 1);
      const to = Math.max(from, Number(toEpisode) || from);

      addLog(`Serie: ${slug}`);
      addLog(`Rango: ${s}x${from} -> ${s}x${to}`);

      if (useLogin && !useManualCookie) await ensureLoggedIn(targetUrl);

      const episodeUrls: { episode: string; url: string }[] = [];
      for (let ep = from; ep <= to; ep++) {
        const episode = `${s}x${ep}`;
        const url = `${origin}/series/${slug}/${episode}`;
        episodeUrls.push({ episode, url });
      }

      const collected: SeriesLyEpisodeRow[] = [];
      for (let i = 0; i < episodeUrls.length; i++) {
        const { episode, url } = episodeUrls[i];
        addLog(`[${i + 1}/${episodeUrls.length}] Cargando ${url}`);
        const html = await fetchText(url, { referer: targetUrl, cookieId: useLogin && !useManualCookie ? cookieId : undefined });
        if (isProbablyLoginPage(html)) {
          addLog(`Bloqueo/login detectado en ${episode}`, true);
          continue;
        }
        const rows = extractRowsFromEpisodeHtml(episode, html);
        collected.push(...rows);
        addLog(`  ${episode}: ${rows.length} links`);
      }

      if (collected.length === 0) {
        addLog('No se encontraron filas con data-server/playLink()', true);
        setResults([]);
        return;
      }

      if (resolveFinalSrc) {
        addLog('Resolviendo src final (JSON -> iframe -> src)...');
        const resolved: SeriesLyEpisodeRow[] = [];
        for (let i = 0; i < collected.length; i++) {
          const item = collected[i];
          const referer = `${origin}/series/${slug}/${item.episode}`;
          try {
            const finalSrc = await resolveToFinalSrc(item.playUrl, referer);
            resolved.push({ ...item, finalSrc });
            addLog(`  [${i + 1}/${collected.length}] ${item.episode} ${item.server} -> ${finalSrc ? 'OK' : 'SIN SRC'}`);
          } catch (err) {
            resolved.push({ ...item, finalSrc: null });
            addLog(`  [${i + 1}/${collected.length}] ${item.episode} ${item.server} -> ERROR`, true);
            if (err instanceof Error) addLog(err.message, true);
          }
        }
        setResults(resolved);
      } else {
        setResults(collected);
      }

      addLog('Extracción finalizada.');
    } catch (error) {
      addLog(`Error crítico: ${error instanceof Error ? error.message : 'No se pudo completar la extracción'}`, true);
    } finally {
      setIsScraping(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {notification && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-md shadow-lg flex items-center gap-2 z-50">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <span className="text-sm">{notification}</span>
        </div>
      )}

      <div className="mb-8 flex items-center gap-3">
        <ListVideo className="h-8 w-8 text-slate-700" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción Series.ly Series</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL de la serie</label>
                <input
                  type="url"
                  value={seriesUrl}
                  onChange={(e) => setSeriesUrl(e.target.value)}
                  placeholder="https://primo-ly.enlace.ly/series/..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 border p-2"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temporada</label>
                  <input
                    type="number"
                    min={1}
                    value={season}
                    onChange={(e) => setSeason(Number(e.target.value))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 border p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                  <input
                    type="number"
                    min={1}
                    value={fromEpisode}
                    onChange={(e) => setFromEpisode(Number(e.target.value))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 border p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                  <input
                    type="number"
                    min={1}
                    value={toEpisode}
                    onChange={(e) => setToEpisode(Number(e.target.value))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 border p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Servidor</label>
                  <select
                    value={serverFilter}
                    onChange={(e) => setServerFilter(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 border p-2 bg-white"
                  >
                    {availableServers.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
                  <select
                    value={languageFilter}
                    onChange={(e) => setLanguageFilter(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 border p-2 bg-white"
                  >
                    {availableLanguages.map(l => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={resolveFinalSrc}
                  onChange={(e) => setResolveFinalSrc(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Resolver src final (JSON)
              </label>

              <div className="rounded-md border border-gray-200 p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={useLogin}
                    onChange={(e) => setUseLogin(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Usar login (si la página lo pide)
                </label>

                {useLogin && (
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <input
                        type="checkbox"
                        checked={useManualCookie}
                        onChange={(e) => setUseManualCookie(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      Usar cookies manuales (recomendado si hay Turnstile)
                    </label>

                    {useManualCookie && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cookie (header completo)</label>
                        <textarea
                          value={manualCookie}
                          onChange={(e) => setManualCookie(e.target.value)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 border p-2 font-mono text-xs min-h-24"
                          placeholder="Ej: laravel_session=...; XSRF-TOKEN=...; ..."
                          spellCheck={false}
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Usuario / Email</label>
                      <input
                        value={loginUser}
                        onChange={(e) => setLoginUser(e.target.value)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 border p-2"
                        autoComplete="username"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                      <input
                        type="password"
                        value={loginPass}
                        onChange={(e) => setLoginPass(e.target.value)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 border p-2"
                        autoComplete="current-password"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">cf-turnstile-response (si aparece)</label>
                      <input
                        value={turnstileResponse}
                        onChange={(e) => setTurnstileResponse(e.target.value)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 border p-2 font-mono text-xs"
                        placeholder="Pegar valor del input hidden cf-turnstile-response"
                        spellCheck={false}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleResetSession}
                      className="w-full bg-gray-100 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-200 disabled:opacity-50 text-sm font-medium"
                      disabled={!cookieId}
                    >
                      Reiniciar sesión
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isScraping || !seriesUrl}
                className="w-full bg-slate-700 text-white px-4 py-2.5 rounded-md hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2 font-medium mt-4"
              >
                {isScraping ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Extrayendo...
                  </>
                ) : (
                  <>
                    <Search className="h-5 w-5" />
                    Iniciar Extracción
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="bg-gray-900 rounded-lg shadow-sm border border-gray-800 p-4 h-64 flex flex-col">
            <div className="flex items-center gap-2 mb-2 text-gray-400 border-b border-gray-800 pb-2">
              <Terminal className="h-4 w-4" />
              <h3 className="text-sm font-medium uppercase tracking-wider">Terminal</h3>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1 pr-2 custom-scrollbar">
              {logs.length === 0 && <span className="text-gray-600">Esperando para iniciar...</span>}
              {logs.map((log, i) => (
                <div key={i} className={`${log.isError ? 'text-red-400' : 'text-green-400'} flex gap-2`}>
                  <span className="opacity-50 select-none">&gt;</span>
                  <span className="break-all">{log.msg}</span>
                </div>
              ))}
              {isScraping && (
                <div className="text-slate-300 flex gap-2 animate-pulse">
                  <span className="opacity-50">&gt;</span>
                  <span>Procesando_</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b pb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Resultados</h2>
                <span className="text-sm text-gray-500">({filteredResults.length} links)</span>
              </div>
              {filteredResults.length > 0 && (
                <button
                  type="button"
                  onClick={copyAllLinks}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded transition-all shadow-sm ${
                    copiedKey === 'all-all'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                  title="Copiar todos los enlaces disponibles"
                >
                  {copiedKey === 'all-all' ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>¡Copiados!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar Todos</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {filteredResults.length === 0 ? (
              <div className="text-center py-10">
                <AlertCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Sin resultados</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ep</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Server</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Calidad</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Idioma</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final src</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredResults.map((r, idx) => (
                      <tr key={`${r.episode}-${r.server}-${r.language}-${idx}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{r.episode}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{r.server}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{r.qualityName || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{r.language}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs break-all">{r.finalSrc || '-'}</span>
                            {r.finalSrc && (
                              <button
                                type="button"
                                onClick={() => handleCopy(r.finalSrc || '', `row-${idx}`)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-all shrink-0 ${
                                  copiedKey === `row-${idx}`
                                    ? 'bg-emerald-100 text-emerald-800 font-medium ring-1 ring-emerald-300'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                }`}
                                title="Copiar src"
                              >
                                {copiedKey === `row-${idx}` ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-600" />
                                    <span>¡Copiado!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" />
                                    <span>Copiar</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-1 font-mono break-all">{r.playUrl}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
