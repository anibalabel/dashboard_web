export const PROXY_ENDPOINT = 'https://app.movflix.live/proxy.php';

export function getProxyUrl(
  targetUrl: string,
  options?: { referer?: string; resolveRedirect?: boolean }
): string {
  let url = `${PROXY_ENDPOINT}?url=${encodeURIComponent(targetUrl)}`;
  if (options?.referer) {
    url += `&referer=${encodeURIComponent(options.referer)}`;
  }
  if (options?.resolveRedirect) {
    url += '&resolve_redirect=true';
  }
  return url;
}
