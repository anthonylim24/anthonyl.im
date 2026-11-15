import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { STATIC_PAGES } from "./staticPages";

// The service worker cannot import the server's list, so it keeps a copy. A
// page missing from it would be cached and served as the SPA shell offline.
test("the service worker's static pages are the server's", () => {
  const worker = readFileSync(resolve(import.meta.dir, "../../frontend/public/sw.js"), "utf8");
  const declaration = worker.match(/const STATIC_PAGES = new Set\(\[([^\]]*)\]\)/);
  expect(declaration).not.toBeNull();
  const workerPages = [...declaration![1]!.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
  expect(workerPages.toSorted()).toEqual(Object.keys(STATIC_PAGES).toSorted());
});
