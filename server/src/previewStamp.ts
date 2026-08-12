import { resolve } from "node:path";
import { buildPreviewMeta, stampPreviewDist } from "./preview";

function arg(flag: string, argv: string[]): string | undefined {
  const idx = argv.indexOf(`--${flag}`);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function required(flag: string, argv: string[]): string {
  const value = arg(flag, argv)?.trim();
  if (!value) throw new Error(`missing --${flag}`);
  return value;
}

export async function stampFromArgs(argv: string[]): Promise<void> {
  const dir = resolve(required("dir", argv));
  const pr = Number(required("pr", argv));
  if (!Number.isInteger(pr) || pr < 1) throw new Error("invalid --pr");
  const sha = required("sha", argv);
  const htmlUrl = arg("html-url", argv);
  const siteUrl = arg("site-url", argv);
  await stampPreviewDist(
    dir,
    buildPreviewMeta({ pr, sha, htmlUrl, siteUrl }),
  );
}

if (import.meta.main) {
  await stampFromArgs(process.argv.slice(2));
}
