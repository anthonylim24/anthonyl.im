const IG_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);
const TRACKING_PARAMS = /^(utm_|igsh$|igshid$|fbclid$|si$)/;

export function isInstagramUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return IG_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeInstagramUrl(input: string): string {
  const u = new URL(input);
  const host = u.hostname.toLowerCase();
  if (!IG_HOSTS.has(host)) {
    throw new Error(`not an instagram url: ${input}`);
  }

  // Strip /share/ redirect prefix: /share/p/ABC → /p/ABC
  let pathname = u.pathname.replace(/^\/share\//, '/');
  // Trim trailing slash
  pathname = pathname.replace(/\/+$/, '');

  // Filter query
  const params = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (!TRACKING_PARAMS.test(k)) params.append(k, v);
  }
  const qs = params.toString();
  return `https://www.instagram.com${pathname}${qs ? '?' + qs : ''}`;
}
