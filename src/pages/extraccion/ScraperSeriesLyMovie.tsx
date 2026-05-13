import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Copy, Film, Loader2, Search, Terminal } from 'lucide-react';

type LogLine = { msg: string; isError: boolean };

type SeriesLyRow = {
  server: string;
  language: string;
  qualityName: string;
  user: string;
  updated: string;
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

const pickLoginForm = (doc: Document) => {
  const forms = Array.from(doc.querySelectorAll('form'));
  for (const form of forms) {
    if (form.querySelector('input[type="password"]')) return form;
  }
  return forms[0] ?? null;
};

const isProbablyLoginPage = (html: string) => {
  const normalized = html.toLowerCase();
  return normalized.includes('type="password"') || normalized.includes('/login') || normalized.includes('/ingresar') || normalized.includes('iniciar sesión');
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

const extractSeriesLyRows = (html: string): SeriesLyRow[] => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = Array.from(doc.querySelectorAll('tr[data-server]'));

  const results: SeriesLyRow[] = [];
  for (const row of rows) {
    const server = safeTrim(row.getAttribute('data-server'));
    if (!server) continue;

    const language = safeTrim(row.getAttribute('data-language')) || 'Desconocido';
    if (!ALLOWED_LANGUAGES.includes(language as (typeof ALLOWED_LANGUAGES)[number])) continue;
    const qualityName = safeTrim(row.getAttribute('data-quality-name')) || safeTrim(row.getAttribute('data-quality')) || '';
    const user = safeTrim(row.getAttribute('data-user'));
    const updated = safeTrim(row.getAttribute('data-updated'));
    const playUrl = extractPlayUrlFromRow(row);
    if (!playUrl) continue;

    results.push({
      server,
      language,
      qualityName,
      user,
      updated,
      playUrl,
    });
  }

  return results;
};

export default function ScraperSeriesLyMovie() {
  const [url, setUrl] = useState('https://primo-ly.enlace.ly/peliculas/');
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
  const [results, setResults] = useState<SeriesLyRow[]>([]);
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

  const addLog = (msg: string, isError = false) => {
    setLogs(prev => [...prev, { msg, isError }]);
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showNotification('URL copiada al portapapeles');
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
    if (!loginUser || !loginPass) {
      addLog('Login activado pero faltan credenciales', true);
      throw new Error('Credenciales incompletas');
    }
    if (!cookieId) {
      addLog('No hay cookie_id para mantener la sesión', true);
      throw new Error('cookie_id vacío');
    }

    const firstHtml = await fetchText(targetUrl, { cookieId });
    if (!isProbablyLoginPage(firstHtml)) return;

    addLog('Página requiere login, intentando autenticación...');

    const origin = new URL(targetUrl).origin;
    let loginHtml = firstHtml;
    if (!loginHtml.toLowerCase().includes('type="password"')) {
      try {
        loginHtml = await fetchText(`${origin}/ingresar`, { cookieId });
      } catch {
        loginHtml = firstHtml;
      }
    }

    const doc = new DOMParser().parseFromString(loginHtml, 'text/html');
    const form = pickLoginForm(doc);
    if (!form) {
      addLog('No se encontró formulario de login', true);
      throw new Error('Formulario de login no encontrado');
    }

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

    const emailInput =
      (form.querySelector('input[type="email"][name]') as HTMLInputElement | null) ??
      (form.querySelector('input[name*="email" i]') as HTMLInputElement | null);
    const userInput =
      emailInput ??
      (form.querySelector('input[name*="user" i]') as HTMLInputElement | null) ??
      (form.querySelector('input[type="text"][name]') as HTMLInputElement | null);
    const userName = safeTrim(userInput?.name) || 'email';

    fields[userName] = loginUser;
    fields[passName] = loginPass;

    if (turnstileResponse.trim()) {
      fields['cf-turnstile-response'] = turnstileResponse.trim();
    }

    if (Object.keys(fields).some(k => k.toLowerCase() === 'cf-turnstile-response') && !fields['cf-turnstile-response']) {
      addLog('Turnstile detectado. Pega el valor de cf-turnstile-response o el login fallará.', true);
      throw new Error('Falta cf-turnstile-response');
    }

    if (!fields.email && !fields.username) {
      fields.email = loginUser;
      fields.username = loginUser;
    }

    const body = new URLSearchParams(fields).toString();
    await fetchText(actionUrl, { method: 'POST', body, referer: actionUrl, cookieId });

    const afterHtml = await fetchText(targetUrl, { cookieId });
    if (isProbablyLoginPage(afterHtml)) {
      addLog('Login no se aplicó (sigue mostrando login)', true);
      throw new Error('Login fallido');
    }
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
  }, [results]);

  const filteredResults = useMemo(() => {
    return results.filter(r => {
      const serverOk = serverFilter === 'TODOS' || r.server.toUpperCase() === serverFilter.toUpperCase();
      const langOk = languageFilter === 'TODOS' || r.language.toLowerCase() === languageFilter.toLowerCase();
      return serverOk && langOk;
    });
  }, [languageFilter, results, serverFilter]);

  const handleResetSession = async () => {
    if (!url || !cookieId) return;
    try {
      const origin = new URL(url).origin;
      await fetchText(origin, { cookieId, resetCookie: true });
      addLog('Sesión reiniciada (cookies borradas)');
    } catch (e) {
      addLog(`No se pudo reiniciar sesión: ${e instanceof Error ? e.message : 'error desconocido'}`, true);
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

  const resolveToFinalSrc = async (playUrl: string, refererUrl: string) => {
    const raw = await fetchText(playUrl, { referer: refererUrl, cookieId: useLogin && !useManualCookie ? cookieId : undefined });
    let final = extractFinalSrcFromJsonOrHtml(raw);
    if (!final) return null;
    if (final.startsWith('//')) final = `https:${final}`;
    return final;
  };

  const handleScrape = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!url) return;

    setIsScraping(true);
    setLogs([]);
    setResults([]);

    try {
      const targetUrl = cleanInjectedQuotes(url);
      addLog(`Iniciando petición a: ${targetUrl}`);

      if (useLogin && !useManualCookie) await ensureLoggedIn(targetUrl);

      const html = await fetchText(targetUrl, { cookieId: useLogin && !useManualCookie ? cookieId : undefined });
      const extracted = extractSeriesLyRows(html);

      if (extracted.length === 0) {
        addLog('No se encontraron filas con data-server/playLink()', true);
        if (isProbablyLoginPage(html)) addLog('La respuesta parece una pantalla de login o bloqueo', true);
      } else {
        addLog(`Encontrados ${extracted.length} enlaces`);
      }

      if (resolveFinalSrc && extracted.length > 0) {
        addLog('Resolviendo src final (JSON -> iframe -> src)...');
        const resolved: SeriesLyRow[] = [];
        for (let i = 0; i < extracted.length; i++) {
          const item = extracted[i];
          try {
            const finalSrc = await resolveToFinalSrc(item.playUrl, targetUrl);
            resolved.push({ ...item, finalSrc });
            addLog(`  [${i + 1}/${extracted.length}] ${item.server} -> ${finalSrc ? 'OK' : 'SIN SRC'}`);
          } catch (err) {
            resolved.push({ ...item, finalSrc: null });
            addLog(`  [${i + 1}/${extracted.length}] ${item.server} -> ERROR`, true);
            if (err instanceof Error) addLog(err.message, true);
          }
        }
        setResults(resolved);
      } else {
        setResults(extracted);
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
        <Film className="h-8 w-8 text-slate-700" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción Series.ly Movie</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>

            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la película (primo-ly.enlace.ly)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://primo-ly.enlace.ly/peliculas/..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 border p-2"
                  required
                />
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
                disabled={isScraping || !url}
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
            <div className="flex items-center justify-between mb-4 border-b pb-2">
              <h2 className="text-lg font-semibold text-gray-900">Resultados</h2>
              <span className="text-sm text-gray-500">{filteredResults.length} links</span>
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Server</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Calidad</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Idioma</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final src</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredResults.map((r, idx) => (
                      <tr key={`${r.server}-${r.language}-${idx}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{r.server}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{r.qualityName || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{r.language}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs break-all">{r.finalSrc || '-'}</span>
                            {r.finalSrc && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(r.finalSrc || '')}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs"
                                title="Copiar src"
                              >
                                <Copy className="h-3 w-3" />
                                Copiar
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-1 font-mono break-all">{r.playUrl}</div>
                          {(r.user || r.updated) && (
                            <div className="text-xs text-gray-400 mt-1">
                              {r.user ? `@${r.user}` : ''}{r.user && r.updated ? ' • ' : ''}{r.updated ? r.updated : ''}
                            </div>
                          )}
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
