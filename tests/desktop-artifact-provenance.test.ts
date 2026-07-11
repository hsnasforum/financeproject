import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listArtifactFiles } from "../scripts/planning_v2_desktop_provenance.mjs";
import { STANDALONE_RUNTIME_LINKED_PACKAGES } from "../scripts/standalone_runtime_assets.mjs";

const tempRoots: string[] = [];
const REQUIRED_V3_FILES = [
  "src/lib/planning/v3/ops/doctor.ts",
  "src/lib/planning/v3/ops/refreshAll.ts",
  "src/lib/planning/v3/ops/export.ts",
  "src/lib/planning/v3/ops/restore.ts",
  "src/lib/planning/v3/report/weeklyHtml.ts",
  "tsconfig.planning-v3.json",
];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-desktop-artifact-"));
  tempRoots.push(root);
  return root;
}

function runNode(script: string, args: string[], options: { cwd?: string } = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
}

function writeFixtureFile(root: string, relativePath: string, content = "fixture\n"): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function linkDirectory(source: string, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(
    fs.realpathSync(source),
    target,
    process.platform === "win32" ? "junction" : "dir",
  );
}

function linkSourceAlias(sourceFile: string, target: string): void {
  if (process.platform === "win32") {
    linkDirectory(path.dirname(sourceFile), target);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(fs.realpathSync(sourceFile), target, "file");
}

function initializeFixtureGit(root: string): void {
  const initialized = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
  if (initialized.status !== 0) throw new Error(initialized.stderr || "fixture git init failed");
  const committed = spawnSync(
    "git",
    [
      "-c",
      "user.name=finance-test",
      "-c",
      "user.email=finance-test@example.invalid",
      "commit",
      "--allow-empty",
      "--quiet",
      "-m",
      "fixture",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (committed.status !== 0) throw new Error(committed.stderr || "fixture git commit failed");
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

  it("rejects a symlinked provenance manifest before manifest exclusion", async () => {
    const root = makeRoot();
    const artifactDir = path.join(root, "artifact");
    const externalManifestDir = path.join(root, "external-manifest");
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.mkdirSync(externalManifestDir, { recursive: true });
    linkDirectory(externalManifestDir, path.join(artifactDir, "desktop-manifest.json"));

    await expect(listArtifactFiles(artifactDir)).rejects.toThrow(
      "desktop artifact contains unsupported symlink: desktop-manifest.json",
    );
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

    for (const relativePath of REQUIRED_V3_FILES) {
      expect(fs.existsSync(path.join(artifactDir, relativePath))).toBe(true);
    }
  }, 180_000);

  it("replaces a copied runtime static link without mutating the source standalone", () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    fs.mkdirSync(projectRoot, { recursive: true });
    writeFixtureFile(projectRoot, "package.json", `${JSON.stringify({ version: "1.0.0" })}\n`);
    writeFixtureFile(projectRoot, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
    writeFixtureFile(projectRoot, "scripts/placeholder.mjs");
    writeFixtureFile(projectRoot, "public/placeholder.txt");
    writeFixtureFile(projectRoot, "prisma/schema.prisma", "generator client {}\n");
    for (const relativePath of REQUIRED_V3_FILES) {
      writeFixtureFile(projectRoot, relativePath, relativePath.endsWith(".json") ? "{}\n" : "export {};\n");
    }
    writeFixtureFile(projectRoot, ".next/static/chunks/app.js", "console.log('fixture');\n");
    writeFixtureFile(projectRoot, ".next/standalone/server.js", "module.exports = {};\n");
    initializeFixtureGit(projectRoot);

    const sourceStatic = path.join(projectRoot, ".next", "static");
    const sourceRuntimeStatic = path.join(projectRoot, ".next", "standalone", ".next", "static");
    const sourceOnlyAuditTarget = path.join(projectRoot, ".next", "standalone", "audit-source");
    const sourceOnlyAuditLinks = [
      "txn-batch-detail-client-audit.tsx",
      "flow-v3-import-to-cashflow-audit.spec.ts",
    ].map((filename) => path.join(projectRoot, ".next", "standalone", "tmp", filename));
    writeFixtureFile(sourceOnlyAuditTarget, "marker.txt", "source-only audit alias\n");
    const sourceOnlyAuditFile = path.join(sourceOnlyAuditTarget, "marker.txt");
    linkDirectory(sourceStatic, sourceRuntimeStatic);
    linkDirectory(path.join(projectRoot, "public"), path.join(projectRoot, ".next", "standalone", "public"));
    linkDirectory(path.join(projectRoot, "prisma"), path.join(projectRoot, ".next", "standalone", "prisma"));
    for (const sourceOnlyAuditLink of sourceOnlyAuditLinks) {
      linkSourceAlias(sourceOnlyAuditFile, sourceOnlyAuditLink);
    }

    const sourcePackageLinks = STANDALONE_RUNTIME_LINKED_PACKAGES.map((packageName) => {
      const packagePath = packageName.split("/");
      const packageSource = path.join(
        projectRoot,
        ".next",
        "standalone",
        "node_modules",
        ".pnpm",
        `${packageName.replace("/", "+")}@1.0.0`,
        "node_modules",
        ...packagePath,
      );
      writeFixtureFile(packageSource, "package.json", `${JSON.stringify({ name: packageName, version: "1.0.0" })}\n`);
      const packageLink = path.join(projectRoot, ".next", "standalone", "node_modules", ...packagePath);
      linkDirectory(packageSource, packageLink);
      return { packageName, packageLink };
    });

    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });

    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(fs.lstatSync(sourceRuntimeStatic).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(sourceRuntimeStatic)).toBe(fs.realpathSync(sourceStatic));
    for (const sourceOnlyAuditLink of sourceOnlyAuditLinks) {
      expect(fs.lstatSync(sourceOnlyAuditLink).isSymbolicLink()).toBe(true);
    }

    const artifactRuntimeStatic = path.join(artifactDir, ".next", "standalone", ".next", "static");
    expect(fs.lstatSync(artifactRuntimeStatic).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(artifactRuntimeStatic, "chunks", "app.js"), "utf8")).toContain("fixture");
    expect(fs.lstatSync(path.join(artifactDir, ".next", "standalone", "public"), { throwIfNoEntry: false })).toBeUndefined();
    expect(fs.lstatSync(path.join(artifactDir, ".next", "standalone", "prisma"), { throwIfNoEntry: false })).toBeUndefined();
    for (const sourceOnlyAuditLink of sourceOnlyAuditLinks) {
      expect(fs.lstatSync(
        path.join(artifactDir, ".next", "standalone", "tmp", path.basename(sourceOnlyAuditLink)),
        { throwIfNoEntry: false },
      )).toBeUndefined();
    }
    for (const { packageName, packageLink } of sourcePackageLinks) {
      expect(fs.lstatSync(packageLink).isSymbolicLink()).toBe(true);
      const artifactPackage = path.join(
        artifactDir,
        ".next",
        "standalone",
        "node_modules",
        ...packageName.split("/"),
      );
      expect(fs.lstatSync(artifactPackage).isSymbolicLink()).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(artifactPackage, "package.json"), "utf8"))).toMatchObject({
        name: packageName,
        version: "1.0.0",
      });
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

  it("rejects symlinked and stale desktop artifacts", () => {
    const root = makeRoot();
    const artifactDir = path.join(root, "planning-v2-desktop");
    const toDir = path.join(root, "installed");
    const buildScript = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const installScript = path.join(process.cwd(), "scripts", "planning_v2_desktop_install.mjs");

    const built = runNode(buildScript, ["--no-next-build", `--artifact-dir=${artifactDir}`]);
    expect(built.status).toBe(0);

    const linkedPublic = path.join(artifactDir, "linked-public");
    linkDirectory(path.join(artifactDir, "public"), linkedPublic);
    const symlinkedInstall = runNode(installScript, ["--skip-install", `--from=${artifactDir}`, `--to=${toDir}`]);

    expect(symlinkedInstall.status).not.toBe(0);
    expect(`${symlinkedInstall.stderr}\n${symlinkedInstall.stdout}`).toContain(
      "desktop artifact contains unsupported symlink: linked-public",
    );
    expect(fs.existsSync(toDir)).toBe(false);

    fs.rmSync(linkedPublic, { recursive: true, force: true });
    fs.appendFileSync(path.join(artifactDir, "run.sh"), "\n# stale artifact mutation\n", "utf8");
    const staleInstall = runNode(installScript, ["--skip-install", `--from=${artifactDir}`, `--to=${toDir}`]);

    expect(staleInstall.status).not.toBe(0);
    expect(`${staleInstall.stderr}\n${staleInstall.stdout}`).toContain("artifactChecksum");
    expect(fs.existsSync(toDir)).toBe(false);
  }, 180_000);
});
