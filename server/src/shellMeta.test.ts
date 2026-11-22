import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { injectPreviewMeta, stripExistingPreviewMeta } from "./shellMeta";

// The real template, so a change to index.html's head is tested too.
const template = stripExistingPreviewMeta(
  readFileSync(resolve(import.meta.dir, "../../frontend/index.html"), "utf8"),
);
const render = (path: string) => injectPreviewMeta(template, path, "https://anthonyl.im");
const contentOf = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`<meta name="${name}" content="([^"]*)"`, "g"))].map((m) => m[1]);

describe("injectPreviewMeta", () => {
  test("writes the tags straight after <meta charset>, ahead of the route scripts", () => {
    const html = render("/trips");
    const charset = html.search(/<meta charset/i);
    const title = html.indexOf("<title>");
    const firstScript = html.indexOf("<script");
    expect(charset).toBeGreaterThanOrEqual(0);
    expect(title).toBeGreaterThan(charset);
    expect(title).toBeLessThan(firstScript);
    expect(html.indexOf('property="og:image"')).toBeLessThan(firstScript);
    expect(html.match(/<title>/g)).toHaveLength(1);
  });

  test("gives each app its short Home Screen name, once", () => {
    for (const [path, name] of [
      ["/trips/korea-2026", "Korea Trip"],
      ["/trips/korea-2026/day/3", "Korea Trip"],
      ["/korea", "Korea Trip"],
      ["/trips", "Trips"],
      ["/trips/tokyo/day/1", "Trips"],
      ["/", "Lim"],
      ["/breathwork/session", "BreathFlow"],
      ["/lab", "anthonyl.im"],
    ] as const) {
      const html = render(path);
      expect(contentOf(html, "apple-mobile-web-app-title")).toEqual([name]);
      expect(contentOf(html, "application-name")).toEqual([name]);
    }
  });

  test("links one manifest: Trips for every trip but Korea's, Korea's elsewhere", () => {
    for (const [path, manifest] of [
      ["/trips", "/trips.webmanifest"],
      ["/trips/new", "/trips.webmanifest"],
      ["/trips/tokyo/day/1", "/trips.webmanifest"],
      ["/trips/korea-2026", "/korea.webmanifest"],
      ["/trips/korea-2026/day/3", "/korea.webmanifest"],
      ["/korea", "/korea.webmanifest"],
      ["/", "/korea.webmanifest"],
      ["/breathwork", "/korea.webmanifest"],
    ] as const) {
      const html = render(path);
      const links = [...html.matchAll(/<link rel="manifest" href="([^"]*)"/g)].map((m) => m[1]);
      expect(links).toEqual([manifest]);
      // Ahead of the route scripts, which keep it right under a preview base.
      expect(html.indexOf('rel="manifest"')).toBeLessThan(html.indexOf("<script"));
    }
  });

  test("never puts the full page title in the install name", () => {
    expect(contentOf(render("/trips"), "apple-mobile-web-app-title")).not.toContain("Trips — plan a trip, pin by pin");
  });

  test("inserts the request path literally, with no $& expansion", () => {
    const html = render("/trips/$&$'$`");
    expect(html).toContain('content="https://anthonyl.im/trips/$&amp;$&#39;$`"');
    expect(html).toContain('<link rel="canonical" href="https://anthonyl.im/trips/$&amp;$&#39;$`" />');
    expect(html.match(/<title>/g)).toHaveLength(1);
  });

  test("falls back to just inside <head> when there is no charset tag", () => {
    const html = injectPreviewMeta("<html><head><script></script></head></html>", "/", "https://anthonyl.im");
    expect(html.indexOf("<title>")).toBeLessThan(html.indexOf("<script>"));
    expect(html.startsWith("<html><head>\n")).toBe(true);
  });
});
