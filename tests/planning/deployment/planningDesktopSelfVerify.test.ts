import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DESKTOP_MANIFEST_FILENAME,
  DESKTOP_MANIFEST_KIND,
  DESKTOP_PROVENANCE_VERSION,
  computeArtifactChecksum,
  listArtifactFiles,
  lockfileSha256,
} from "../../../scripts/planning_v2_desktop_provenance.mjs";
import {
  DESKTOP_VERIFY_MODE_PRISTINE_INSTALL,
  DESKTOP_VERIFY_MODE_RUNTIME,
  verifyPlanningDesktopArtifact,
} from "../../../scripts/planning_v2_desktop_verify.mjs";
import {
  buildInstallCmd,
  buildInstallSh,
  buildRunCmd,
  buildRunSh,
  buildUninstallCmd,
  buildUninstallSh,
} from "../../../scripts/planning_v2_desktop_build.mjs";

const tempRoots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "planning-desktop-verify-"));
  tempRoots.push(root);
  return root;
}

async function seedArtifact(): Promise<string> {
  const root = makeRoot();
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ version: "1.2.3" })}\n`, "utf8");
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
  fs.writeFileSync(path.join(root, ".env.local.example"), "DATABASE_URL=file:./prisma/dev.db\n", "utf8");
  fs.writeFileSync(path.join(root, "run.sh"), "#!/usr/bin/env bash\n", "utf8");
  const artifactChecksum = await computeArtifactChecksum(root);
  const manifest = {
    kind: DESKTOP_MANIFEST_KIND,
    provenanceVersion: DESKTOP_PROVENANCE_VERSION,
    version: "1.2.3",
    packageVersion: "1.2.3",
    gitSha: "a".repeat(40),
    lockfileSha256: await lockfileSha256(root),
    platform: process.platform,
    arch: process.arch,
    nodeAbi: process.versions.modules,
    artifactChecksum,
  };
  fs.writeFileSync(
    path.join(root, DESKTOP_MANIFEST_FILENAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return root;
}

async function computeSequentialReferenceChecksum(artifactDir: string) {
  const files = await listArtifactFiles(artifactDir);
  const aggregate = crypto.createHash("sha256");
  let totalBytes = 0;

  for (const relativePath of files) {
    const absolutePath = path.join(artifactDir, ...relativePath.split("/"));
    const content = fs.readFileSync(absolutePath);
    totalBytes += content.byteLength;
    aggregate.update(relativePath);
    aggregate.update("\0");
    aggregate.update(String(content.byteLength));
    aggregate.update("\0");
    aggregate.update(crypto.createHash("sha256").update(content).digest("hex"));
    aggregate.update("\n");
  }

  return {
    algorithm: "sha256",
    value: aggregate.digest("hex"),
    fileCount: files.length,
    totalBytes,
    excludes: [DESKTOP_MANIFEST_FILENAME],
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("planning desktop self verifier", () => {
  it("keeps the batched artifact checksum identical to the sequential contract", async () => {
    const artifactDir = makeRoot();
    fs.mkdirSync(path.join(artifactDir, "nested"), { recursive: true });
    for (let index = 0; index < 67; index += 1) {
      const directory = index % 2 === 0 ? artifactDir : path.join(artifactDir, "nested");
      fs.writeFileSync(path.join(directory, `file-${String(index).padStart(3, "0")}.txt`), `value-${index}\n`);
    }
    fs.writeFileSync(path.join(artifactDir, DESKTOP_MANIFEST_FILENAME), "excluded\n");

    await expect(computeArtifactChecksum(artifactDir)).resolves.toEqual(
      await computeSequentialReferenceChecksum(artifactDir),
    );
  });

  it("validates the complete pristine artifact checksum", async () => {
    const artifactDir = await seedArtifact();

    const result = await verifyPlanningDesktopArtifact({
      artifactDir,
      mode: DESKTOP_VERIFY_MODE_PRISTINE_INSTALL,
    });

    expect(result.checksum?.fileCount).toBe(4);
    expect(result.manifest.packageVersion).toBe("1.2.3");
  });

  it("runs as an artifact-internal pristine verification CLI", async () => {
    const artifactDir = await seedArtifact();
    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_verify.mjs");

    const result = spawnSync(process.execPath, [
      script,
      "--mode=pristine-install",
      `--root=${artifactDir}`,
    ], {
      cwd: artifactDir,
      encoding: "utf8",
    });

    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(result.stdout).toContain("ok mode=pristine-install version=1.2.3");
  });

  it("allows install-time additions at runtime but rejects the same mutation in pristine mode", async () => {
    const artifactDir = await seedArtifact();
    fs.writeFileSync(path.join(artifactDir, ".env.local"), "DATABASE_URL=file:runtime.db\n", "utf8");

    await expect(verifyPlanningDesktopArtifact({
      artifactDir,
      mode: DESKTOP_VERIFY_MODE_RUNTIME,
    })).resolves.toMatchObject({ checksum: null });
    await expect(verifyPlanningDesktopArtifact({
      artifactDir,
      mode: DESKTOP_VERIFY_MODE_PRISTINE_INSTALL,
    })).rejects.toThrow("artifactChecksum");
  });

  it("rejects package, lockfile, and native runtime mismatches in runtime mode", async () => {
    const packageArtifact = await seedArtifact();
    fs.writeFileSync(path.join(packageArtifact, "package.json"), `${JSON.stringify({ version: "9.9.9" })}\n`, "utf8");
    await expect(verifyPlanningDesktopArtifact({
      artifactDir: packageArtifact,
      mode: DESKTOP_VERIFY_MODE_RUNTIME,
    })).rejects.toThrow("version");

    const lockArtifact = await seedArtifact();
    fs.appendFileSync(path.join(lockArtifact, "pnpm-lock.yaml"), "# changed\n", "utf8");
    await expect(verifyPlanningDesktopArtifact({
      artifactDir: lockArtifact,
      mode: DESKTOP_VERIFY_MODE_RUNTIME,
    })).rejects.toThrow("lockfileSha256");

    const nativeArtifact = await seedArtifact();
    const manifestPath = path.join(nativeArtifact, DESKTOP_MANIFEST_FILENAME);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.nodeAbi = "0";
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await expect(verifyPlanningDesktopArtifact({
      artifactDir: nativeArtifact,
      mode: DESKTOP_VERIFY_MODE_RUNTIME,
    })).rejects.toThrow("nodeAbi");
  });

  it("rejects an artifact without the required desktop environment template", async () => {
    const artifactDir = await seedArtifact();
    fs.rmSync(path.join(artifactDir, ".env.local.example"));

    await expect(verifyPlanningDesktopArtifact({
      artifactDir,
      mode: DESKTOP_VERIFY_MODE_RUNTIME,
    })).rejects.toThrow("desktop environment template");
  });

  it("rejects an artifact without a valid source commit identity", async () => {
    const artifactDir = await seedArtifact();
    const manifestPath = path.join(artifactDir, DESKTOP_MANIFEST_FILENAME);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.gitSha = "invalid";
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    await expect(verifyPlanningDesktopArtifact({
      artifactDir,
      mode: DESKTOP_VERIFY_MODE_RUNTIME,
    })).rejects.toThrow("gitSha");
  });

  it("generates immutable-source install wrappers and verified run wrappers", () => {
    for (const installWrapper of [buildInstallSh(), buildInstallCmd()]) {
      const verifyIndex = installWrapper.indexOf("planning_v2_desktop_verify.mjs --mode=pristine-install");
      const installIndex = installWrapper.indexOf("planning_v2_desktop_install.mjs --self-contained-source");

      expect(verifyIndex).toBeGreaterThan(-1);
      expect(installIndex).toBeGreaterThan(verifyIndex);
      expect(installWrapper).toContain("--from=");
      expect(installWrapper).toContain("--to=");
      expect(installWrapper).toContain("PLANNING_DESKTOP_SKIP_INSTALL");
      expect(installWrapper).toContain("PLANNING_DESKTOP_SKIP_SHORTCUTS");
      expect(installWrapper).not.toContain("pnpm install --frozen-lockfile");
      expect(installWrapper).not.toContain("prisma_cli_safe.mjs db push");
      expect(installWrapper).not.toContain("copy \".env.local.example\"");
    }

    for (const runWrapper of [buildRunSh(), buildRunCmd()]) {
      const verifyIndex = runWrapper.indexOf("planning_v2_desktop_verify.mjs --mode=runtime");
      const launchIndex = runWrapper.indexOf("planning_v2_desktop_launch.mjs");

      expect(verifyIndex).toBeGreaterThan(-1);
      expect(launchIndex).toBeGreaterThan(verifyIndex);
      expect(runWrapper).toContain("DATABASE_URL");
      expect(runWrapper).toContain("PLANNING_DATA_DIR");
      expect(runWrapper).toContain("PLANNING_APP_NAME");
    }
  });

  it("keeps install wrappers source-only so an installed target cannot update from itself", () => {
    const installerSource = fs.readFileSync(
      path.join(process.cwd(), "scripts", "planning_v2_desktop_install.mjs"),
      "utf8",
    );
    expect(installerSource).toContain(
      'const DESKTOP_SOURCE_ONLY_FILES = new Set(["install.cmd", "install.sh"]);',
    );
    expect(installerSource).toContain("if (DESKTOP_SOURCE_ONLY_FILES.has(entry.name)) continue;");
  });

  it("passes the current installed directory to uninstall with the parser-compatible form", () => {
    const uninstallSh = buildUninstallSh();
    const uninstallCmd = buildUninstallCmd();
    expect(uninstallSh).toContain('--target="$(pwd)"');
    expect(uninstallSh).toContain("--keep-wrapper=uninstall.sh");
    expect(uninstallSh).toContain('rm -- "$0"');
    expect(uninstallCmd).toContain('--target="%CD%"');
    expect(uninstallCmd).toContain("--keep-wrapper=uninstall.cmd");
    expect(uninstallCmd).toContain("(goto) 2>nul & del /f /q \"%~f0\"");
  });
});
