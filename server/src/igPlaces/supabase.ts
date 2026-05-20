export interface SupabaseConfig {
  url: string;
  serviceKey: string;
  fetch?: typeof fetch;
}

export interface SelectOptions {
  select?: string;
  eq?: Record<string, string | number | boolean>;
  order?: string;
  limit?: number;
}

export interface InsertOptions {
  onConflict?: string;
  returning?: 'minimal' | 'representation';
}

export interface SupabaseClient {
  select<T>(table: string, opts?: SelectOptions): Promise<T[]>;
  insert<T = unknown>(table: string, row: object, opts?: InsertOptions): Promise<T[]>;
  update<T = unknown>(table: string, patch: object, eq: Record<string, unknown>): Promise<T[]>;
  rpc<T = unknown>(fn: string, args?: object): Promise<T>;
}

/** Parse Supabase response bodies defensively. PostgREST normally returns
 *  valid JSON, but an upstream proxy occasionally returns an HTML error
 *  page; throwing a SyntaxError there would bypass the higher-level error
 *  path. Treat any parse failure as the typed fallback + warn. */
function safeJson<T>(txt: string, label: string, fallback: T): T {
  if (!txt) return fallback;
  try { return JSON.parse(txt) as T; }
  catch (err) {
    console.warn(`[supabase] ${label}: non-JSON response (${(err as Error).message}); body=${txt.slice(0, 120)}`);
    return fallback;
  }
}

export function createSupabaseClient(cfg: SupabaseConfig): SupabaseClient {
  const f = cfg.fetch ?? fetch;
  const baseHeaders = {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    'Content-Type': 'application/json',
  };

  async function call(path: string, init: RequestInit, timeoutMs = 10_000): Promise<Response> {
    const r = await f(`${cfg.url}/rest/v1${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`supabase ${init.method ?? 'GET'} ${path} → ${r.status}: ${body.slice(0, 200)}`);
    }
    return r;
  }

  function eqParams(eq: Record<string, unknown> | undefined): string {
    if (!eq) return '';
    return Object.entries(eq)
      .map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(String(v))}`)
      .join('&');
  }

  return {
    async select<T>(table: string, opts: SelectOptions = {}) {
      const parts: string[] = [];
      const eq = eqParams(opts.eq);
      if (eq) parts.push(eq);
      if (opts.select) parts.push(`select=${opts.select}`);
      if (opts.order) parts.push(`order=${encodeURIComponent(opts.order)}`);
      if (opts.limit) parts.push(`limit=${opts.limit}`);
      const qs = parts.length ? `?${parts.join('&')}` : '';
      const r = await call(`/${table}${qs}`, { headers: { ...baseHeaders, Accept: 'application/json' } });
      return (await r.json()) as T[];
    },

    async insert<T = unknown>(table: string, row: object, opts: InsertOptions = {}) {
      const parts: string[] = [];
      if (opts.onConflict) parts.push(`on_conflict=${encodeURIComponent(opts.onConflict)}`);
      const qs = parts.length ? `?${parts.join('&')}` : '';
      const prefer: string[] = [];
      if (opts.onConflict) prefer.push('resolution=merge-duplicates');
      prefer.push(opts.returning === 'representation' ? 'return=representation' : 'return=minimal');
      const r = await call(`/${table}${qs}`, {
        method: 'POST',
        headers: { ...baseHeaders, Prefer: prefer.join(',') },
        body: JSON.stringify(row),
      });
      return safeJson<T[]>(await r.text(), `insert ${table}`, []);
    },

    async update<T = unknown>(table: string, patch: object, eq: Record<string, unknown>) {
      const qs = eqParams(eq);
      const r = await call(`/${table}?${qs}`, {
        method: 'PATCH',
        headers: { ...baseHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      return safeJson<T[]>(await r.text(), `update ${table}`, []);
    },

    async rpc<T = unknown>(fn: string, args: object = {}) {
      const r = await call(`/rpc/${fn}`, {
        method: 'POST',
        headers: { ...baseHeaders },
        body: JSON.stringify(args),
      });
      return safeJson<T>(await r.text(), `rpc ${fn}`, null as T);
    },
  };
}
