import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const ciDir = join(import.meta.dir, "../../../deploy/ci");
const originDir = join(import.meta.dir, "../../../deploy/origin");

function bashFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sh"))
    .map((name) => join(dir, name));
}

describe("portable CI scripts", () => {
  test("bash -n accepts every deploy/ci and deploy/origin script", async () => {
    const files = [...bashFiles(ciDir), ...bashFiles(originDir)];
    expect(files.length).toBeGreaterThan(8);
    for (const file of files) {
      const proc = Bun.spawn(["bash", "-n", file], { stdout: "pipe", stderr: "pipe" });
      const [stderr, exit] = await Promise.all([
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      expect(exit, `${file}: ${stderr}`).toBe(0);
    }
  });

  test("preview comment body includes the sticky marker", async () => {
    const proc = Bun.spawn(["bash", join(ciDir, "preview-comment-body.sh"), "success"], {
      env: {
        ...process.env,
        PR_NUMBER: "12",
        PR_SHA: "abc1234deadbeef",
        RUN_URL: "https://example.test/run",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exit] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    expect(exit).toBe(0);
    expect(stdout).toContain("<!-- pr-preview -->");
    expect(stdout).toContain("https://anthonyl.im/preview/pr/12/");
    expect(stdout).toContain("/korea");
  });
});
