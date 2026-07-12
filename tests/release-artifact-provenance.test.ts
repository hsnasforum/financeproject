import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createReleaseArtifactProvenance,
  verifyReleaseArtifactProvenance,
} from "../scripts/release_artifact_provenance.mjs";
import {
  DESKTOP_MANIFEST_KIND,
  DESKTOP_PROVENANCE_VERSION,
  computeArtifactChecksum,
  fileSha256,
} from "../scripts/planning_v2_desktop_provenance.mjs";

const roots: string[] = [];
const SOURCE_SHA = "a".repeat(40);
const TAG = "v1.0.4";

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-release-provenance-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "release"), { recursive: true });
  return root;
}

function write(root: string, relativePath: string, content: string | Buffer): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

async function seedArtifact(root: string, overrides: Record<string, unknown> = {}) {
  const artifactDir = path.join(root, "planning-v2-desktop");
  write(artifactDir, ".next/standalone/server.js", "module.exports = {};\n");
  write(artifactDir, ".next/standalone/.next/BUILD_ID", "fixture-build-id\n");
  write(artifactDir, ".next/standalone/.next/required-server-files.json", "{}\n");
  write(artifactDir, ".next/standalone/.next/server/app-paths-manifest.json", "{}\n");
  write(artifactDir, ".next/standalone/.next/server/chunks/runtime.js", "module.exports = {};\n");
  write(artifactDir, ".next/standalone/.next/static/chunks/app.js", "console.log('fixture');\n");
  write(artifactDir, "package.json", `${JSON.stringify({ name: "finance", version: "1.0.4" })}\n`);
  write(artifactDir, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  write(artifactDir, "run.sh", "#!/usr/bin/env bash\n");
  write(artifactDir, "run.cmd", "@echo off\r\n");
  write(artifactDir, "public/fixture.txt", "fixture\n");
  const artifactChecksum = await computeArtifactChecksum(artifactDir);
  const manifest = {
    kind: DESKTOP_MANIFEST_KIND,
    provenanceVersion: DESKTOP_PROVENANCE_VERSION,
    version: "1.0.4",
    packageVersion: "1.0.4",
    gitSha: SOURCE_SHA,
    lockfileSha256: await fileSha256(path.join(artifactDir, "pnpm-lock.yaml")),
    artifactChecksum,
    ...overrides,
  };
  write(artifactDir, "desktop-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  return { artifactDir, manifest };
}

function releasePaths(root: string) {
  const releaseDir = path.join(root, "release");
  return {
    archivePath: path.join(releaseDir, `planning-v2-desktop-${TAG}.tar.gz`),
    inventoryPath: path.join(releaseDir, `planning-v2-desktop-${TAG}.inventory.json`),
    manifestPath: path.join(releaseDir, `planning-v2-desktop-${TAG}.manifest.json`),
  };
}

async function createFixture(root: string) {
  const seeded = await seedArtifact(root);
  const paths = releasePaths(root);
  const manifest = await createReleaseArtifactProvenance({
    artifactDir: seeded.artifactDir,
    ...paths,
    sourceSha: SOURCE_SHA,
    tag: TAG,
    nodeVersion: "v20.19.0",
    pnpmVersion: "9.15.0",
    platform: "linux",
    arch: "x64",
    generatedAt: "2026-07-12T00:00:00.000Z",
  });
  return { ...seeded, ...paths, manifest };
}

afterEach(() => {
  for (const root of roots.splice(0, roots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("release artifact provenance", () => {
  it("creates the archive itself and links source, toolchain, inventory, and checksums", async () => {
    const root = makeRoot();
    const fixture = await createFixture(root);

    expect(fixture.manifest).toMatchObject({
      schemaVersion: 1,
      kind: "planning-v2-desktop-release",
      sourceSha: SOURCE_SHA,
      tag: TAG,
      packageVersion: "1.0.4",
      toolchain: { node: "v20.19.0", pnpm: "9.15.0", platform: "linux", arch: "x64" },
      desktopArtifact: {
        artifactChecksum: fixture.manifest.desktopArtifact.artifactChecksum,
      },
    });
    expect(fixture.manifest.desktopArtifact.artifactChecksum.fileCount).toBeGreaterThan(0);
    expect(fixture.manifest.inventory.fileCount).toBe(
      fixture.manifest.desktopArtifact.artifactChecksum.fileCount + 1,
    );
    const listed = spawnSync("tar", ["-tzf", fixture.archivePath], { encoding: "utf-8" });
    expect(listed.status, listed.stderr).toBe(0);
    expect(listed.stdout).toContain("planning-v2-desktop/.next/standalone/server.js");
    await expect(verifyReleaseArtifactProvenance({
      manifestPath: fixture.manifestPath,
      sourceSha: SOURCE_SHA,
      tag: TAG,
    })).resolves.toMatchObject({ ok: true });
  });

  it("rejects archive and inventory mutation before publish", async () => {
    const archiveRoot = makeRoot();
    const inventoryRoot = makeRoot();
    const manifestRoot = makeRoot();
    const archiveFixture = await createFixture(archiveRoot);
    const inventoryFixture = await createFixture(inventoryRoot);
    const manifestFixture = await createFixture(manifestRoot);
    fs.appendFileSync(archiveFixture.archivePath, "tampered", "utf-8");
    fs.appendFileSync(inventoryFixture.inventoryPath, "tampered", "utf-8");
    fs.appendFileSync(manifestFixture.manifestPath, "tampered", "utf-8");

    await expect(verifyReleaseArtifactProvenance({
      manifestPath: archiveFixture.manifestPath,
      sourceSha: SOURCE_SHA,
      tag: TAG,
    })).rejects.toThrowError(/archive (size|checksum)/);
    await expect(verifyReleaseArtifactProvenance({
      manifestPath: inventoryFixture.manifestPath,
      sourceSha: SOURCE_SHA,
      tag: TAG,
    })).rejects.toThrowError(/inventory (size|checksum)/);
    await expect(verifyReleaseArtifactProvenance({
      manifestPath: manifestFixture.manifestPath,
      sourceSha: SOURCE_SHA,
      tag: TAG,
    })).rejects.toThrowError(/manifest is not valid JSON/);
  });

  it("rejects a release manifest that weakens the desktop checksum exclusions", async () => {
    const root = makeRoot();
    const fixture = await createFixture(root);
    const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, "utf-8")) as {
      desktopArtifact: { artifactChecksum: { excludes: string[] } };
    };
    manifest.desktopArtifact.artifactChecksum.excludes = [];
    fs.writeFileSync(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await expect(verifyReleaseArtifactProvenance({
      manifestPath: fixture.manifestPath,
      sourceSha: SOURCE_SHA,
      tag: TAG,
    })).rejects.toThrowError(/artifactChecksum excludes are invalid/);
  });

  it("rejects desktop manifest source, schema, lockfile, and checksum mismatch", async () => {
    const cases: Array<{ overrides: Record<string, unknown>; pattern: RegExp }> = [
      { overrides: { gitSha: "b".repeat(40) }, pattern: /source SHA/ },
      { overrides: { kind: "wrong-kind" }, pattern: /schema is unsupported/ },
      { overrides: { provenanceVersion: 2 }, pattern: /schema is unsupported/ },
      { overrides: { lockfileSha256: "invalid" }, pattern: /lockfileSha256 is invalid/ },
      {
        overrides: {
          artifactChecksum: {
            algorithm: "sha256",
            value: "c".repeat(64),
            fileCount: 1,
            totalBytes: 1,
            excludes: ["desktop-manifest.json"],
          },
        },
        pattern: /does not match release artifact contents/,
      },
    ];

    for (const testCase of cases) {
      const root = makeRoot();
      const seeded = await seedArtifact(root, testCase.overrides);
      await expect(createReleaseArtifactProvenance({
        artifactDir: seeded.artifactDir,
        ...releasePaths(root),
        sourceSha: SOURCE_SHA,
        tag: TAG,
        pnpmVersion: "9.15.0",
      })).rejects.toThrowError(testCase.pattern);
    }
  });

  it("rejects missing runtime files, symlinks, and tag-derived filename drift", async () => {
    const missingRoot = makeRoot();
    const symlinkRoot = makeRoot();
    const filenameRoot = makeRoot();
    const missing = await seedArtifact(missingRoot);
    const symlinked = await seedArtifact(symlinkRoot);
    const filename = await seedArtifact(filenameRoot);
    fs.rmSync(path.join(missing.artifactDir, ".next/standalone/server.js"));
    fs.symlinkSync(
      path.join(symlinked.artifactDir, "public/fixture.txt"),
      path.join(symlinked.artifactDir, "linked.txt"),
      "file",
    );

    await expect(createReleaseArtifactProvenance({
      artifactDir: missing.artifactDir,
      ...releasePaths(missingRoot),
      sourceSha: SOURCE_SHA,
      tag: TAG,
      pnpmVersion: "9.15.0",
    })).rejects.toThrowError(/required release artifact.*server.js/);
    await expect(createReleaseArtifactProvenance({
      artifactDir: symlinked.artifactDir,
      ...releasePaths(symlinkRoot),
      sourceSha: SOURCE_SHA,
      tag: TAG,
      pnpmVersion: "9.15.0",
    })).rejects.toThrowError(/unsupported symlink/);
    await expect(createReleaseArtifactProvenance({
      artifactDir: filename.artifactDir,
      ...releasePaths(filenameRoot),
      archivePath: path.join(filenameRoot, "release", "wrong.tar.gz"),
      sourceSha: SOURCE_SHA,
      tag: TAG,
      pnpmVersion: "9.15.0",
    })).rejects.toThrowError(/filenames do not match the tag/);
  });

  it("rejects missing server payload and static assets", async () => {
    const serverRoot = makeRoot();
    const staticRoot = makeRoot();
    const server = await seedArtifact(serverRoot);
    const staticArtifact = await seedArtifact(staticRoot);
    fs.rmSync(path.join(server.artifactDir, ".next/standalone/.next/server"), {
      recursive: true,
      force: true,
    });
    fs.rmSync(path.join(staticArtifact.artifactDir, ".next/standalone/.next/static"), {
      recursive: true,
      force: true,
    });

    await expect(createReleaseArtifactProvenance({
      artifactDir: server.artifactDir,
      ...releasePaths(serverRoot),
      sourceSha: SOURCE_SHA,
      tag: TAG,
      pnpmVersion: "9.15.0",
    })).rejects.toThrowError(/app-paths-manifest|required release runtime/);
    await expect(createReleaseArtifactProvenance({
      artifactDir: staticArtifact.artifactDir,
      ...releasePaths(staticRoot),
      sourceSha: SOURCE_SHA,
      tag: TAG,
      pnpmVersion: "9.15.0",
    })).rejects.toThrowError(/required release runtime/);
  });

  it.runIf(process.platform !== "win32")("rejects unsupported filesystem entries", async () => {
    const root = makeRoot();
    const seeded = await seedArtifact(root);
    const fifoPath = path.join(seeded.artifactDir, "runtime.pipe");
    const created = spawnSync("mkfifo", [fifoPath], { encoding: "utf-8" });
    expect(created.status, created.stderr).toBe(0);

    await expect(createReleaseArtifactProvenance({
      artifactDir: seeded.artifactDir,
      ...releasePaths(root),
      sourceSha: SOURCE_SHA,
      tag: TAG,
      pnpmVersion: "9.15.0",
    })).rejects.toThrowError(/unsupported filesystem entry/);
  });

  it("links desktop manifest and lockfile hashes to their inventory rows", async () => {
    const manifestRoot = makeRoot();
    const lockfileRoot = makeRoot();
    const manifestFixture = await createFixture(manifestRoot);
    const lockfileFixture = await createFixture(lockfileRoot);
    const manifest = JSON.parse(fs.readFileSync(manifestFixture.manifestPath, "utf-8")) as {
      desktopArtifact: { manifestSha256: string };
    };
    const lockfile = JSON.parse(fs.readFileSync(lockfileFixture.manifestPath, "utf-8")) as {
      desktopArtifact: { lockfileSha256: string };
    };
    manifest.desktopArtifact.manifestSha256 = "b".repeat(64);
    lockfile.desktopArtifact.lockfileSha256 = "c".repeat(64);
    fs.writeFileSync(manifestFixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(lockfileFixture.manifestPath, `${JSON.stringify(lockfile, null, 2)}\n`);

    await expect(verifyReleaseArtifactProvenance({
      manifestPath: manifestFixture.manifestPath,
      sourceSha: SOURCE_SHA,
      tag: TAG,
    })).rejects.toThrowError(/desktop manifest checksum/);
    await expect(verifyReleaseArtifactProvenance({
      manifestPath: lockfileFixture.manifestPath,
      sourceSha: SOURCE_SHA,
      tag: TAG,
    })).rejects.toThrowError(/lockfile checksum/);
  });
});
