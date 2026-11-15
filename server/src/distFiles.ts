import { join } from "node:path";

/**
 * Reads text files from the built frontend. With `memoise`, each file is read
 * (and transformed) once and kept: in production `dist/` only changes on a
 * deploy, and a deploy restarts the process. Without it every call reads the
 * disk, so a rebuild under `bun --watch` shows without a restart. A failed
 * read is never cached.
 */
export function createDistReader(dir: string, { memoise }: { memoise: boolean }) {
  const cache = new Map<string, string>();
  return async function readDist(file: string, transform: (text: string) => string = (text) => text): Promise<string> {
    const hit = cache.get(file);
    if (hit !== undefined) return hit;
    const text = transform(await Bun.file(join(dir, file)).text());
    if (memoise) cache.set(file, text);
    return text;
  };
}

/**
 * A memo with a hard size cap, for values keyed by something a visitor
 * chooses (a URL path). Past `max` the oldest entry goes, so random paths can
 * churn it but never grow it.
 */
export function createBoundedMemo<V>(max: number, { enabled }: { enabled: boolean }) {
  const cache = new Map<string, V>();
  return {
    get(key: string, make: () => V): V {
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const value = make();
      if (!enabled) return value;
      if (cache.size >= max) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, value);
      return value;
    },
    size: () => cache.size,
  };
}
