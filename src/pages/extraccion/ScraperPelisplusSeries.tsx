import { useState, FormEvent } from 'react';
import { Search, Loader2, PlayCircle, AlertCircle, Terminal, Copy, Check, CheckCircle } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { formatDoodstreamUrl } from '@/lib/doodstreamUtils';
import { parseAndDecryptEmbed69, extractCleanUrlFromEmbedLink } from '@/lib/embed69Utils';
import { getProxyUrl } from '@/lib/proxy';

interface EpisodeLink {
  season: number;
  episode: number;
  url: string;
}

interface ScrapedResult {
  season: number;
  episode: number;
  lat?: string | null;
  cast?: string | null;
  sub?: string | null;
}

const powCache = new Map<string, Uint8Array>();

async function sha256(str: string) {
  const buf = new TextEncoder().encode(str);
  const hash = await window.crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function solvePoW(challenge: string, difficulty: number, salt: string) {
  if (powCache.has(challenge)) return powCache.get(challenge);
  const prefix = '0'.repeat(difficulty);
  let nonce = 0;
  while (true) {
    const hash = await sha256(challenge + nonce);
    if (hash.startsWith(prefix)) {
      const keyHash = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(challenge + nonce + salt));
      const aesKey = new Uint8Array(keyHash);
      powCache.set(challenge, aesKey);
      return aesKey;
    }
    nonce++;
    if (nonce > 500000) return null;
  }
}

async function decryptAES(encryptedBase64: string, aesKey: Uint8Array) {
  try {
    const raw = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const iv = raw.slice(0, 16);
    const ciphertext = raw.slice(16);
    const key = await window.crypto.subtle.importKey('raw', aesKey.slice(0, 32), { name: 'AES-CBC' }, false, ['decrypt']);
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return encryptedBase64;
  }
}

export default function ScraperPelisplusSeries() {
  const [url, setUrl] = useState('');
  const [targetSeason, setTargetSeason] = useState('');
  const [limit, setLimit] = useState('');
  const [targetServer, setTargetServer] = useState('voe'); // Default a voe
  
  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; isError: boolean }[]>([]);
  const [results, setResults] = useState<ScrapedResult[]>([]);

  const addLog = (msg: string, isError = false) => {
    setLogs(prev => [...prev, { msg, isError }]);
  };

  const fetchHTML = async (targetUrl: string, refererUrl?: string) => {
    // Usar proxy
    const proxy = getProxyUrl(targetUrl, refererUrl ? { referer: refererUrl } : undefined);
    try {
      const res = await fetch(proxy);
      if (!res.ok) throw new Error(`Error ${res.status} al conectar con proxy local`);
      return await res.text();
    } catch (error) {
      console.error('Error en proxy local:', error);
      throw error;
    }
  };

  const resolveRedirect = async (targetUrl: string) => {
    try {
      const res = await fetch(getProxyUrl(targetUrl, { resolveRedirect: true }));
      if (!res.ok) return targetUrl;
      const data = await res.json();
      return data.finalUrl || targetUrl;
    } catch {
      return targetUrl;
    }
  };

  const handleScrape = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!url) return;

    setIsScraping(true);
    setLogs([]);
    setResults([]);

    try {
      const cleanUrl = url.split('#')[0].trim();
      addLog(`Iniciando petición a: ${cleanUrl}`);

      const epLinks: EpisodeLink[] = [];

      // Validar si la URL ingresada es directamente la de un episodio clásico
      const isDirectEpisode =
        cleanUrl.match(/-(\d+)x(\d+)(?:\/|$)/i) ||
        cleanUrl.match(/\/temporada\/(\d+)\/capitulo\/(\d+)(?:\/|$)/i) ||
        cleanUrl.match(/-temporada-(\d+)-episodio-(\d+)(?:\/|$)/i) ||
        cleanUrl.match(/\/episodio\/(\d+)\/(\d+)(?:\/|$)/i);

      if (isDirectEpisode) {
        const s = parseInt(isDirectEpisode[1], 10);
        const e = parseInt(isDirectEpisode[2], 10);
        epLinks.push({ season: s, episode: e, url: cleanUrl });
        addLog(`Se detectó URL directa de episodio: S${s}xE${e}`);
      } else {
        // 1. Descarga del HTML de la serie
        const html = await fetchHTML(cleanUrl);
        const doc = new DOMParser().parseFromString(html, 'text/html');

        addLog('Buscando temporadas y episodios en el HTML...');

        // 2. Detectar endpoint dinámico de episodios (nuevo sistema Pelisplus SPA)
        const episodeArea = doc.querySelector('#episode-area');
        let endpoint = episodeArea?.getAttribute('data-endpoint') || '';
        if (!endpoint) {
          const endpointMatch =
            html.match(/id=["']episode-area["'][^>]*data-endpoint=["']([^"']+)["']/i) ||
            html.match(/data-endpoint=["']([^"']+)["']/i);
          if (endpointMatch) {
            endpoint = endpointMatch[1];
          } else {
            endpoint = `${cleanUrl.replace(/\/+$/, '')}/episodio`;
          }
        }
        if (endpoint.startsWith('/')) {
          endpoint = new URL(endpoint, cleanUrl).href;
        }

        // 3. Extraer episodios modernos (enlaces con data-season, data-episode o clase episode-link)
        const modernLinks = Array.from(
          doc.querySelectorAll<HTMLAnchorElement>(
            'a[data-episode-link], a.episode-link, a[data-season][data-episode], .tab-pane a[href*="#s"], .tab-content a[href*="#s"], .VideoPlayer ~ .tab-content a'
          )
        );

        modernLinks.forEach(a => {
          let s = parseInt(a.getAttribute('data-season') || '', 10);
          let e = parseInt(a.getAttribute('data-episode') || '', 10);
          const href = a.getAttribute('href') || '';

          if (isNaN(s) || s <= 0) {
            const hashMatch = href.match(/#s(\d+)-e(\d+)/i);
            if (hashMatch) {
              s = parseInt(hashMatch[1], 10);
              if (isNaN(e) || e <= 0) e = parseInt(hashMatch[2], 10);
            }
          }

          if (isNaN(s) || s <= 0) {
            const pane = a.closest('.tab-pane, [id^="temporada-"]');
            const paneId = pane?.getAttribute('id') || '';
            const tempMatch = paneId.match(/temporada-(\d+)/i);
            if (tempMatch) s = parseInt(tempMatch[1], 10);
          }

          if (isNaN(s) || s <= 0) {
            const textMatch = (a.textContent || '').match(/T(\d+)\s*-\s*E(\d+)/i);
            if (textMatch) {
              s = parseInt(textMatch[1], 10);
              if (isNaN(e) || e <= 0) e = parseInt(textMatch[2], 10);
            }
          }

          if (isNaN(e) || e <= 0) {
            const textMatch = (a.textContent || '').match(/(?:E|Episodio|Cap[ií]tulo)\s*(\d+)/i);
            if (textMatch) e = parseInt(textMatch[1], 10);
          }

          if (s > 0 && e > 0) {
            if (!epLinks.some(ep => ep.season === s && ep.episode === e)) {
              epLinks.push({
                season: s,
                episode: e,
                url: `${endpoint}/${s}/${e}`
              });
            }
          }
        });

        // 4. Fallback: buscar enlaces clásicos con href conteniendo /episodio/ o /capitulo/
        if (epLinks.length === 0) {
          const legacyLinks = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href*="/episodio/"], a[href*="/capitulo/"]'));
          legacyLinks.forEach(a => {
            const href = a.getAttribute('href') || '';
            if (!href) return;

            const fullUrl = href.startsWith('http') ? href : new URL(href, cleanUrl).href;

            const match1 = fullUrl.match(/-(\d+)x(\d+)(?:\/|$)/i);
            const match2 = fullUrl.match(/\/temporada\/(\d+)\/capitulo\/(\d+)(?:\/|$)/i);
            const match3 = fullUrl.match(/-temporada-(\d+)-episodio-(\d+)(?:\/|$)/i);

            let s = 0, e = 0;
            if (match1) {
              s = parseInt(match1[1], 10);
              e = parseInt(match1[2], 10);
            } else if (match2) {
              s = parseInt(match2[1], 10);
              e = parseInt(match2[2], 10);
            } else if (match3) {
              s = parseInt(match3[1], 10);
              e = parseInt(match3[2], 10);
            }

            if (s > 0 && e > 0) {
              if (!epLinks.some(ep => ep.season === s && ep.episode === e)) {
                epLinks.push({ season: s, episode: e, url: fullUrl });
              }
            }
          });
        }

        // 5. Fallback adicional con Regex directamente sobre el HTML crudo
        if (epLinks.length === 0) {
          const hashMatches = Array.from(html.matchAll(/href=["']#s(\d+)-e(\d+)["']/gi));
          for (const m of hashMatches) {
            const s = parseInt(m[1], 10);
            const e = parseInt(m[2], 10);
            if (s > 0 && e > 0 && !epLinks.some(x => x.season === s && x.episode === e)) {
              epLinks.push({ season: s, episode: e, url: `${endpoint}/${s}/${e}` });
            }
          }

          const dataMatches = Array.from(html.matchAll(/data-season=["'](\d+)["'][^>]*data-episode=["'](\d+)["']/gi));
          for (const m of dataMatches) {
            const s = parseInt(m[1], 10);
            const e = parseInt(m[2], 10);
            if (s > 0 && e > 0 && !epLinks.some(x => x.season === s && x.episode === e)) {
              epLinks.push({ season: s, episode: e, url: `${endpoint}/${s}/${e}` });
            }
          }
        }
      }

      // Loggear temporadas detectadas
      const seasonsFound = Array.from(new Set(epLinks.map(ep => ep.season))).sort((a, b) => a - b);
      if (seasonsFound.length > 0) {
        addLog(`Temporadas encontradas: ${seasonsFound.join(', ')} (Total: ${epLinks.length} episodios detectados)`);
      }

      // Filtrar por temporada específica y límite
      let filtered = epLinks;
      if (targetSeason) {
        filtered = filtered.filter(ep => ep.season === Number(targetSeason));
        addLog(`Filtrado por Temporada ${targetSeason}: ${filtered.length} episodios.`);
      }
      filtered.sort((a, b) => a.season === b.season ? a.episode - b.episode : a.season - b.season);
      if (limit) {
        filtered = filtered.slice(0, Number(limit));
        addLog(`Límite aplicado: ${filtered.length} episodios.`);
      }

      addLog(`Se procesarán ${filtered.length} episodios con el servidor '${targetServer.toUpperCase()}'.`);

      // 6. Loop para obtener iframes y enlaces finales
      const finalResults: ScrapedResult[] = [];

      for (const ep of filtered) {
        addLog(`Procesando S${ep.season}xE${ep.episode}...`);
        try {
          const epRaw = await fetchHTML(ep.url, cleanUrl);

          // Si el endpoint devolvió JSON (API interna de Pelisplus), extraemos el HTML
          let epHtml = epRaw;
          try {
            const parsedJson = JSON.parse(epRaw);
            if (parsedJson && parsedJson.data && parsedJson.data.html) {
              epHtml = parsedJson.data.html;
            }
          } catch {
            // Es HTML plano (diseño tradicional)
          }

          // Normalizar el HTML eliminando saltos de línea y tabulaciones múltiples
          const normalizedHtml = epHtml.replace(/\s+/g, ' ');

          // Extraer todos los data-src presentes en los servidores del episodio
          const dataSrcList = Array.from(epHtml.matchAll(/data-src=['"]([^'"]+)['"]/gi)).map(m => m[1].trim());

          if (targetServer.toLowerCase() === 'uqload') {
            addLog(`Buscando enlace de redirección / iframe para Uqload en S${ep.season}xE${ep.episode}...`);
            
            let uqlinkUrl = '';
            let directUqloadUrl = '';

            // 0. Revisar data-src directo de Uqload
            const uqDataSrc = dataSrcList.find(s => /uqload\.[a-z0-9]+/i.test(s));
            if (uqDataSrc) {
              directUqloadUrl = uqDataSrc;
            }

            // 1. Buscar en variables video[N]
            if (!directUqloadUrl) {
              const videoMatches = Array.from(normalizedHtml.matchAll(/video\[(\d+)\]\s*=\s*['"]([^'"]+)['"]/gi));
              for (const match of videoMatches) {
                const vUrl = match[2].trim();
                if (/uqlink\.php\?id=/i.test(vUrl)) {
                  uqlinkUrl = vUrl;
                  break;
                }
                if (/uqload\.[a-z0-9]+/i.test(vUrl)) {
                  directUqloadUrl = vUrl;
                  break;
                }
              }
            }

            // 2. Si hay tabs de servidor, buscar si Uqload está en alguna pestaña específica
            if (!uqlinkUrl && !directUqloadUrl) {
              const uqTabMatch = normalizedHtml.match(/<li[^>]*data-id=['"]?(\d+)['"]?[^>]*>\s*<a[^>]*>(?:Uqload|Uq)[^<]*<\/a>/i);
              if (uqTabMatch) {
                const tabId = uqTabMatch[1];
                const videoTabMatch = normalizedHtml.match(new RegExp(`video\\[${tabId}\\]\\s*=\\s*['"]([^'"]+)['"]`, 'i'));
                if (videoTabMatch) {
                  const vUrl = videoTabMatch[1].trim();
                  if (/uqlink\.php\?id=/i.test(vUrl)) {
                    uqlinkUrl = vUrl;
                  } else if (/uqload\.[a-z0-9]+/i.test(vUrl)) {
                    directUqloadUrl = vUrl;
                  }
                }
              }
            }

            // 3. Buscar en todo el HTML si no se encontró en video[N]
            if (!uqlinkUrl && !directUqloadUrl) {
              const uqlinkMatch = normalizedHtml.match(/(https?:\/\/[^\s'"`<>]+\/uqlink\.php\?id=[a-zA-Z0-9_-]+)/i) ||
                                  normalizedHtml.match(/(\/\/[^\s'"`<>]+\/uqlink\.php\?id=[a-zA-Z0-9_-]+)/i) ||
                                  normalizedHtml.match(/(\/uqlink\.php\?id=[a-zA-Z0-9_-]+)/i);
              if (uqlinkMatch) {
                uqlinkUrl = uqlinkMatch[1];
              }
            }

            if (!uqlinkUrl && !directUqloadUrl) {
              const directMatch = normalizedHtml.match(/(https?:\/\/uqload\.[a-z0-9]+\/(?:embed-|e\/)?[a-zA-Z0-9._-]+\.html)/i) ||
                                  normalizedHtml.match(/<iframe[^>]+src=['"]([^'"]*uqload[^'"]*)['"]/i);
              if (directMatch) {
                directUqloadUrl = directMatch[1];
              }
            }

            let uqloadEmbedUrl = directUqloadUrl;

            if (uqlinkUrl) {
              if (uqlinkUrl.startsWith('//')) {
                uqlinkUrl = 'https:' + uqlinkUrl;
              } else if (uqlinkUrl.startsWith('/')) {
                uqlinkUrl = 'https://embed69.org' + uqlinkUrl;
              }

              addLog(`Redirección de Uqload encontrada: ${uqlinkUrl}. Descargando iframe...`);
              
              try {
                const uqHtml = await fetchHTML(uqlinkUrl, ep.url);
                
                const iframeMatch = uqHtml.match(/<iframe[^>]+src=['"]([^'"]*uqload[^'"]*)['"]/i);
                if (iframeMatch) {
                  uqloadEmbedUrl = iframeMatch[1];
                } else {
                  const directMatch = uqHtml.match(/(https?:\/\/uqload\.[a-z0-9]+\/(?:embed-|e\/)?[a-zA-Z0-9._-]+\.html)/i) ||
                                      uqHtml.match(/<iframe[^>]+src=['"]([^'"]+)['"]/i);
                  if (directMatch) {
                    uqloadEmbedUrl = directMatch[1];
                  }
                }
              } catch (e) {
                console.warn('Error al descargar HTML de uqlink:', e);
              }

              // Fallback directo por ID si no se pudo extraer el iframe del HTML de redirección
              if (!uqloadEmbedUrl) {
                const idMatch = uqlinkUrl.match(/id=([a-zA-Z0-9_-]+)/i);
                if (idMatch && idMatch[1]) {
                  uqloadEmbedUrl = `https://uqload.vc/embed-${idMatch[1]}.html`;
                  addLog(`Iframe Uqload generado a partir del ID: ${uqloadEmbedUrl}`);
                }
              }
            }

            if (uqloadEmbedUrl) {
              if (uqloadEmbedUrl.startsWith('//')) {
                uqloadEmbedUrl = 'https:' + uqloadEmbedUrl;
              }
              const formattedUrl = formatDoodstreamUrl(uqloadEmbedUrl, targetServer);
              finalResults.push({ season: ep.season, episode: ep.episode, lat: formattedUrl });
              addLog(`Éxito S${ep.season}xE${ep.episode} (uqload) - LAT: ${formattedUrl}`);
              continue;
            } else {
              addLog(`No se encontró enlace directo de Uqload en S${ep.season}xE${ep.episode}, buscando en Embed69...`);
            }
          }

          // Buscar la variable JavaScript o atributo que contiene el iframe de Embed69
          let embedUrl = dataSrcList.find(s => /embed69/i.test(s) || /^\/(?:f|v)\//i.test(s)) || '';

          // Intento 1: Regex exacta del PHP original
          if (!embedUrl) {
            const phpRegexMatch = normalizedHtml.match(/video\[1\]\s*=\s*['"]([^'"]+)['"]/i);
            if (phpRegexMatch) embedUrl = phpRegexMatch[1];
          }

          // Intento 2: Buscar cualquier texto dentro de video[1] = '...' que contenga embed69
          if (!embedUrl) {
            const embed69Match = normalizedHtml.match(/video\[1\]\s*=\s*[^;]*?(https?:\/\/embed69[^'"`\s;]+)/i);
            if (embed69Match) embedUrl = embed69Match[1];
          }

          // Intento 3: Acepta comillas simples, dobles, backticks o concatenación
          if (!embedUrl) {
            const videoMatch = normalizedHtml.match(/video\[1\]\s*=\s*(?:['"`]([^'"`]+)['"`]|inicio\s*\+\s*['"`]([^'"`]+)['"`]|['"`][^'"`]+['"`]\s*\+\s*['"`]([^'"`]+)['"`])/i);
            if (videoMatch) embedUrl = videoMatch[1] || videoMatch[2] || videoMatch[3] || '';
          }

          if (!embedUrl) {
            const fallbackMatch = normalizedHtml.match(/video\[1\]\s*=\s*[^;]*?(https?:\/\/embed69[^\s'"`]+)/i) || 
                                  normalizedHtml.match(/video\[1\]\s*=\s*[^;]*?(\/f\/[^\s'"`]+)/i) ||
                                  normalizedHtml.match(/video\[1\]\s*=\s*[^;]*?(\/v\/[^\s'"`]+)/i);
            if (fallbackMatch) embedUrl = fallbackMatch[1];
          }

          if (!embedUrl) {
            const looseMatch = normalizedHtml.match(/video\[1\]\s*=\s*['"`]\s*([^'"`]+)\s*['"`]/i);
            if (looseMatch) embedUrl = looseMatch[1].trim();
          }

          if (!embedUrl) {
            const iframeMatch = normalizedHtml.match(/<iframe[^>]+src=['"]([^'"]*embed69[^'"]*)['"]/i) ||
                                normalizedHtml.match(/<iframe[^>]+src=['"]([^'"]*\/f\/[^'"]*)['"]/i) ||
                                normalizedHtml.match(/<iframe[^>]+src=['"]([^'"]*\/v\/[^'"]*)['"]/i);
            if (iframeMatch) embedUrl = iframeMatch[1];
          }

          if (!embedUrl) {
            const doc = new DOMParser().parseFromString(epHtml, 'text/html');
            const iframe = doc.querySelector('.video-html iframe, #video-content iframe, iframe[src*="embed69"]');
            if (iframe) {
              const src = iframe.getAttribute('src');
              if (src) embedUrl = src;
            }
          }

          if (!embedUrl && dataSrcList.length > 0) {
            embedUrl = dataSrcList[0];
          }

          if (!embedUrl) {
            const rawMatch = normalizedHtml.match(/(https?:\/\/embed69[^'"`\s<>]+)/i) || 
                             normalizedHtml.match(/['"`](\/f\/[^'"`\s<>]+)['"`]/i);
            if (rawMatch) embedUrl = rawMatch[1];
          }

          if (!embedUrl) {
            addLog(`No se encontró iframe de embed69 en S${ep.season}xE${ep.episode}`, true);
            continue;
          }

          // Limpiar si trae comillas invertidas por error
          embedUrl = embedUrl.replace(/`/g, '').trim();

          if (embedUrl.startsWith('/f/') || embedUrl.startsWith('/v/')) {
            embedUrl = 'https://embed69.org' + embedUrl;
          } else if (embedUrl.startsWith('//')) {
            embedUrl = 'https:' + embedUrl;
          }

          addLog(`Obteniendo reproductor Embed69 para S${ep.season}xE${ep.episode}...`);
          
          // Petición al iframe de embed69 (necesita referer de pelisplus para evitar 403 Forbidden)
          const iframeHtml = await fetchHTML(embedUrl, ep.url || cleanUrl);

          const parsedData = await parseAndDecryptEmbed69(iframeHtml, (stepMsg) => {
            addLog(`S${ep.season}xE${ep.episode}: ${stepMsg || 'Descifrando PoW + AES...'}`);
          });

          if (!parsedData || parsedData.length === 0) {
            addLog(`No se encontraron datos de video en Embed69 S${ep.season}xE${ep.episode}`, true);
            continue;
          }

          let latUrl = null;
          let castUrl = null;
          let subUrl = null;

          for (const langGroup of parsedData) {
            const langName = String(langGroup.video_language || langGroup.lang || '').toUpperCase();
            const embeds = langGroup.sortedEmbeds || [];

            for (const server of embeds) {
              if (!server.link) continue;
              if (String(server.servername).toLowerCase() !== targetServer.toLowerCase()) continue;

              try {
                let cleanUrl = extractCleanUrlFromEmbedLink(server.link);
                if (cleanUrl) {
                  if (String(server.servername).toLowerCase() === 'streamwish') {
                    addLog(`Resolviendo redirección de Streamwish...`);
                    cleanUrl = await resolveRedirect(cleanUrl);
                  }

                  cleanUrl = formatDoodstreamUrl(cleanUrl, targetServer || server.servername);

                  if (langName === 'LAT' || langName === 'LATINO') {
                    if (!latUrl) latUrl = cleanUrl;
                  } else if (langName === 'ESP' || langName === 'CASTELLANO') {
                    if (!castUrl) castUrl = cleanUrl;
                  } else if (langName === 'SUB' || langName === 'SUBTITULADO') {
                    if (!subUrl) subUrl = cleanUrl;
                  } else {
                    if (!latUrl) latUrl = cleanUrl;
                  }
                }
              } catch (e) {
                console.error("Error procesando enlace de servidor", e);
                addLog(`Error al procesar enlace para ${server.servername}: ${e instanceof Error ? e.message : 'Error desconocido'}`);
              }
            }
          }

          if (latUrl || castUrl || subUrl) {
            finalResults.push({ season: ep.season, episode: ep.episode, lat: latUrl, cast: castUrl, sub: subUrl });
            addLog(`Éxito S${ep.season}xE${ep.episode} (${targetServer}) - LAT: ${!!latUrl}, CAST: ${!!castUrl}, SUB: ${!!subUrl}`);
          } else {
            addLog(`No se encontraron videos válidos para el servidor '${targetServer}' en S${ep.season}xE${ep.episode}`, true);
          }
        } catch (err) {
          addLog(`Error al procesar S${ep.season}xE${ep.episode}: ${err instanceof Error ? err.message : 'Error desconocido'}`, true);
        }
      }

      setResults(finalResults);
      addLog('Extracción finalizada exitosamente.');
    } catch (error) {
      addLog(`Error crítico: ${error instanceof Error ? error.message : 'No se pudo completar la extracción'}`, true);
    } finally {
      setIsScraping(false);
    }
  };

  const [notification, setNotification] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
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

  const copyAllLinks = async (type: 'all' | 'lat' | 'cast' | 'sub') => {
    let links = '';
    let label = '';

    if (type === 'all') {
      links = results
        .flatMap(r => [r.lat, r.cast, r.sub])
        .filter((l): l is string => Boolean(l && l.trim()))
        .join('\n');
      label = 'todos los enlaces';
    } else {
      links = results
        .map(r => r[type])
        .filter((l): l is string => Boolean(l && l.trim()))
        .join('\n');
      label = `enlaces ${type.toUpperCase()}`;
    }

    if (links) {
      await handleCopy(links, `all-${type}`, `Todos los ${label} copiados`);
    } else {
      showNotification(`No hay ${label} disponibles`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-md shadow-lg flex items-center gap-2 z-50">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <span className="text-sm">{notification}</span>
        </div>
      )}

      <div className="mb-8 flex items-center gap-3">
        <PlayCircle className="h-8 w-8 text-red-600" />
        <h1 className="text-3xl font-bold text-gray-900">Extracción PelisplusHD (Series)</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Configuración</h2>
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL de la Serie (PelisplusHD.bz)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://pelisplushd.bz/serie/..."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 border p-2"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Servidor a extraer
                  </label>
                  <select
                    value={targetServer}
                    onChange={(e) => setTargetServer(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 border p-2 bg-white"
                  >
                    <option value="voe">Voe</option>
                    <option value="filemoon">FileMoon / Bysekoze</option>
                    <option value="streamwish">Streamwish</option>
                    <option value="earnvids">EarnVids</option>
                    <option value="vidhide">Vidhide</option>
                    <option value="uqload">Uqload</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temporada Específica
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={targetSeason}
                    onChange={(e) => setTargetSeason(e.target.value)}
                    placeholder="Opcional"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Límite de Episodios
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="Opcional"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isScraping || !url}
                className="w-full bg-red-600 text-white px-4 py-2.5 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium mt-4"
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

          {/* Consola de Logs */}
          <div className="bg-gray-900 rounded-lg shadow-sm border border-gray-800 p-4 h-64 flex flex-col">
            <div className="flex items-center gap-2 mb-2 text-gray-400 border-b border-gray-800 pb-2">
              <Terminal className="h-4 w-4" />
              <h3 className="text-sm font-medium uppercase tracking-wider">Terminal de Proceso</h3>
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
                <div className="text-blue-400 flex gap-2 animate-pulse">
                  <span className="opacity-50">&gt;</span>
                  <span>Procesando_</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resultados */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Resultados ({results.length})
              </h2>
              {results.length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => copyAllLinks('all')}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-all shadow-sm ${
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

                  <button
                    type="button"
                    onClick={() => copyAllLinks('lat')}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-all border ${
                      copiedKey === 'all-lat'
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                        : 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-800'
                    }`}
                    title="Copiar todos los enlaces Latinos"
                  >
                    {copiedKey === 'all-lat' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>¡LAT Copiados!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar LAT</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => copyAllLinks('cast')}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-all border ${
                      copiedKey === 'all-cast'
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                        : 'bg-red-50 hover:bg-red-100 border-red-200 text-red-800'
                    }`}
                    title="Copiar todos los enlaces Castellanos"
                  >
                    {copiedKey === 'all-cast' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>¡CAST Copiados!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar CAST</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => copyAllLinks('sub')}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-all border ${
                      copiedKey === 'all-sub'
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                        : 'bg-green-50 hover:bg-green-100 border-green-200 text-green-800'
                    }`}
                    title="Copiar todos los enlaces Subtitulados"
                  >
                    {copiedKey === 'all-sub' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>¡SUB Copiados!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar SUB</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {results.length === 0 && !isScraping && (
              <div className="flex flex-col items-center justify-center flex-1 min-h-[250px] text-gray-400">
                <AlertCircle className="h-12 w-12 mb-2 opacity-20" />
                <p>No hay resultados aún</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2 flex-1">
                {results.map((res, idx) => (
                  <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
                      <h3 className="font-bold text-gray-800 text-base">
                        Temporada {res.season} - Episodio {res.episode}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          const epLinks = [res.lat, res.cast, res.sub].filter(Boolean).join('\n');
                          handleCopy(epLinks, `card-${idx}`, 'Enlaces del episodio copiados');
                        }}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                          copiedKey === `card-${idx}`
                            ? 'bg-emerald-100 text-emerald-800 font-medium'
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        }`}
                        title="Copiar todos los enlaces de este episodio"
                      >
                        {copiedKey === `card-${idx}` ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" />
                            <span>¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copiar Todo</span>
                          </>
                        )}
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      {res.lat && (
                        <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-gray-200 hover:border-blue-300 transition-colors">
                          <span className="font-semibold text-xs text-blue-800 bg-blue-100 px-2 py-1 rounded w-14 text-center shrink-0">LAT</span>
                          <a href={res.lat} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono" title={res.lat}>{res.lat}</a>
                          <button 
                            type="button"
                            onClick={() => handleCopy(res.lat!, `lat-${idx}`)} 
                            className={`p-1.5 rounded transition-all shrink-0 ${
                              copiedKey === `lat-${idx}`
                                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                                : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                            }`}
                            title="Copiar enlace Latino"
                          >
                            {copiedKey === `lat-${idx}` ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      )}
                      
                      {res.cast && (
                        <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-gray-200 hover:border-red-300 transition-colors">
                          <span className="font-semibold text-xs text-red-800 bg-red-100 px-2 py-1 rounded w-14 text-center shrink-0">CAST</span>
                          <a href={res.cast} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono" title={res.cast}>{res.cast}</a>
                          <button 
                            type="button"
                            onClick={() => handleCopy(res.cast!, `cast-${idx}`)} 
                            className={`p-1.5 rounded transition-all shrink-0 ${
                              copiedKey === `cast-${idx}`
                                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                                : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                            }`}
                            title="Copiar enlace Castellano"
                          >
                            {copiedKey === `cast-${idx}` ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      )}

                      {res.sub && (
                        <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-gray-200 hover:border-green-300 transition-colors">
                          <span className="font-semibold text-xs text-green-800 bg-green-100 px-2 py-1 rounded w-14 text-center shrink-0">SUB</span>
                          <a href={res.sub} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 font-mono" title={res.sub}>{res.sub}</a>
                          <button 
                            type="button"
                            onClick={() => handleCopy(res.sub!, `sub-${idx}`)} 
                            className={`p-1.5 rounded transition-all shrink-0 ${
                              copiedKey === `sub-${idx}`
                                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                                : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                            }`}
                            title="Copiar enlace Subtitulado"
                          >
                            {copiedKey === `sub-${idx}` ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}