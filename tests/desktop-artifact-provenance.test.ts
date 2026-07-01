import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-desktop-artifact-"));
  tempRoots.push(root);
  return root;
}

function runNode(script: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("desktop artifact provenance", () => {
  it("does not keep generated .dist artifacts tracked as source files", () => {
    const result = spawnSync("git", ["ls-files", ".dist"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  it("writes package, git, lockfile, and checksum provenance into the generated manifest", () => {
    const root = makeRoot();
    const artifactDir = path.join(root, "planning-v2-desktop");
    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");

    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`]);

    expect(result.status).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(artifactDir, "desktop-manifest.json"), "utf8")) as {
      version?: string;
      gitSha?: string;
      lockfileSha256?: string;
      artifactChecksum?: { algorithm?: string; value?: string; fileCount?: number };
    };
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string };

    expect(manifest.version).toBe(packageJson.version);
    expect(manifest.gitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.lockfileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.artifactChecksum).toMatchObject({
      algorithm: "sha256",
    });
    expect(manifest.artifactChecksum?.value).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.artifactChecksum?.fileCount).toBeGreaterThan(0);

    const requiredV3Files = [
      "src/lib/planning/v3/ops/doctor.ts",
      "src/lib/planning/v3/ops/refreshAll.ts",
      "src/lib/planning/v3/ops/export.ts",
      "src/lib/planning/v3/ops/restore.ts",
      "src/lib/planning/v3/report/weeklyHtml.ts",
      "tsconfig.planning-v3.json",
    ];
    for (const relativePath of requiredV3Files) {
      expect(fs.existsSync(path.join(artifactDir, relativePath))).toBe(true);
    }
  }, 180_000);

  it("rejects install input without a provenance manifest", () => {
    const root = makeRoot();
    const fromDir = path.join(root, "artifact");
    const toDir = path.join(root, "installed");
    fs.mkdirSync(fromDir, { recursive: true });
    fs.writeFileSync(path.join(fromDir, "run.sh"), "#!/usr/bin/env bash\n", "utf8");
    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_install.mjs");

    const result = runNode(script, ["--skip-install", `--from=${fromDir}`, `--to=${toDir}`]);

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toContain("desktop provenance manifest");
    expect(fs.existsSync(toDir)).toBe(false);
  });

  it("rejects stale desktop artifacts after their content changes", () => {
    const root = makeRoot();
    const artifactDir = path.join(root, "planning-v2-desktop");
    const toDir = path.join(root, "installed");
    const buildScript = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const installScript = path.join(process.cwd(), "scripts", "planning_v2_desktop_install.mjs");

    const built = runNode(buildScript, ["--no-next-build", `--artifact-dir=${artifactDir}`]);
    expect(built.status).toBe(0);

    fs.appendFileSync(path.join(artifactDir, "run.sh"), "\n# stale artifact mutation\n", "utf8");
    const installed = runNode(installScript, ["--skip-install", `--from=${artifactDir}`, `--to=${toDir}`]);

    expect(installed.status).not.toBe(0);
    expect(`${installed.stderr}\n${installed.stdout}`).toContain("artifactChecksum");
    expect(fs.existsSync(toDir)).toBe(false);
  }, 180_000);
});
