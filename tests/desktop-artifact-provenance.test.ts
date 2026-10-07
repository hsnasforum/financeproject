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

function linkRelativeDirectory(source: string, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(
    process.platform === "win32"
      ? fs.realpathSync(source)
      : path.relative(path.dirname(target), fs.realpathSync(source)),
    target,
    process.platform === "win32" ? "junction" : "dir",
  );
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

function initializeDesktopProjectFixture(projectRoot: string): void {
  fs.mkdirSync(projectRoot, { recursive: true });
  writeFixtureFile(projectRoot, "package.json", `${JSON.stringify({ version: "1.0.0" })}\n`);
  writeFixtureFile(projectRoot, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  writeFixtureFile(projectRoot, ".env.local.example", "DATABASE_URL=file:./prisma/dev.db\n");
  writeFixtureFile(projectRoot, "scripts/placeholder.mjs");
  writeFixtureFile(projectRoot, "public/placeholder.txt");
  writeFixtureFile(projectRoot, "prisma/schema.prisma", "generator client {}\n");
  for (const relativePath of REQUIRED_V3_FILES) {
    writeFixtureFile(projectRoot, relativePath, relativePath.endsWith(".json") ? "{}\n" : "export {};\n");
  }
  writeFixtureFile(projectRoot, ".next/static/chunks/app.js", "console.log('fixture');\n");
  writeFixtureFile(projectRoot, ".next/standalone/server.js", "module.exports = {};\n");
  const prismaPackage = path.join(
    projectRoot,
    "node_modules",
    ".pnpm",
    "prisma@1.0.0",
    "node_modules",
    "prisma",
  );
  writeFixtureFile(prismaPackage, "package.json", `${JSON.stringify({ name: "prisma", version: "1.0.0" })}\n`);
  writeFixtureFile(prismaPackage, "build/index.js", "module.exports = {};\n");
  linkDirectory(prismaPackage, path.join(projectRoot, "node_modules", "prisma"));

  const betterSqlitePackage = path.join(
    projectRoot,
    "node_modules",
    ".pnpm",
    "better-sqlite3@1.0.0",
    "node_modules",
    "better-sqlite3",
  );
  writeFixtureFile(betterSqlitePackage, "package.json", `${JSON.stringify({
    name: "better-sqlite3",
    version: "1.0.0",
    main: "index.js",
    dependencies: { bindings: "1.0.0" },
  })}\n`);
  writeFixtureFile(betterSqlitePackage, "index.js", "module.exports = require('bindings');\n");
  const bindingsPackage = path.join(
    projectRoot,
    "node_modules",
    ".pnpm",
    "bindings@1.0.0",
    "node_modules",
    "bindings",
  );
  writeFixtureFile(bindingsPackage, "package.json", `${JSON.stringify({
    name: "bindings",
    version: "1.0.0",
    main: "index.js",
    dependencies: { "file-uri-to-path": "1.0.0" },
  })}\n`);
  writeFixtureFile(bindingsPackage, "index.js", "module.exports = `bindings:${require('file-uri-to-path')}`;\n");
  const fileUriPackage = path.join(
    projectRoot,
    "node_modules",
    ".pnpm",
    "file-uri-to-path@1.0.0",
    "node_modules",
    "file-uri-to-path",
  );
  writeFixtureFile(fileUriPackage, "package.json", `${JSON.stringify({
    name: "file-uri-to-path",
    version: "1.0.0",
    main: "index.js",
  })}\n`);
  writeFixtureFile(fileUriPackage, "index.js", "module.exports = 'file-uri-to-path';\n");
  linkRelativeDirectory(fileUriPackage, path.join(path.dirname(bindingsPackage), "file-uri-to-path"));
  linkRelativeDirectory(bindingsPackage, path.join(path.dirname(betterSqlitePackage), "bindings"));
  linkDirectory(betterSqlitePackage, path.join(projectRoot, "node_modules", "better-sqlite3"));
  initializeFixtureGit(projectRoot);
}

function seedCyclicPackageGraph(projectRoot: string, shadowAncestor = false): string {
  const standaloneDir = path.join(projectRoot, ".next", "standalone");
  const packageA = path.join(standaloneDir, "node_modules", ".pnpm", "package-a@1.0.0", "node_modules", "package-a");
  const packageB = path.join(standaloneDir, "node_modules", ".pnpm", "package-b@1.0.0", "node_modules", "package-b");
  writeFixtureFile(packageA, "package.json", `${JSON.stringify({ name: "package-a", version: "1.0.0", main: "index.js" })}\n`);
  writeFixtureFile(packageA, "index.js", "exports.name = 'package-a'; exports.loadB = () => require('package-b');\n");
  writeFixtureFile(packageB, "package.json", `${JSON.stringify({ name: "package-b", version: "1.0.0", main: "index.js" })}\n`);
  writeFixtureFile(packageB, "index.js", "exports.name = 'package-b'; exports.loadA = () => require('package-a');\n");
  linkRelativeDirectory(packageB, path.join(path.dirname(packageA), "package-b"));
  linkRelativeDirectory(packageA, path.join(path.dirname(packageB), "package-a"));
  if (shadowAncestor) {
    writeFixtureFile(packageA, "node_modules/package-a/package.json", `${JSON.stringify({
      name: "package-a",
      version: "9.9.9",
    })}\n`);
  }
  const packageALink = path.join(standaloneDir, "node_modules", "package-a");
  linkRelativeDirectory(packageA, packageALink);
  return packageALink;
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

  it("rejects a missing desktop environment template before mutating the artifact", () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    initializeDesktopProjectFixture(projectRoot);
    fs.rmSync(path.join(projectRoot, ".env.local.example"));
    writeFixtureFile(artifactDir, "sentinel.txt", "keep\n");

    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toContain("required file not found");
    expect(fs.readFileSync(path.join(artifactDir, "sentinel.txt"), "utf8")).toBe("keep\n");
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

  it.runIf(process.platform !== "win32")("writes package, git, lockfile, and checksum provenance into the generated manifest", () => {
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
    expect(manifest).toMatchObject({
      platform: process.platform,
      arch: process.arch,
      nodeAbi: process.versions.modules,
    });
    expect(manifest.artifactChecksum).toMatchObject({
      algorithm: "sha256",
    });
    expect(manifest.artifactChecksum?.value).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.artifactChecksum?.fileCount).toBeGreaterThan(0);

    for (const relativePath of REQUIRED_V3_FILES) {
      expect(fs.existsSync(path.join(artifactDir, relativePath))).toBe(true);
    }
  }, 180_000);

  it("materializes internal standalone links without mutating the source standalone", async () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    initializeDesktopProjectFixture(projectRoot);

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
    const internalPackageSource = path.join(
      projectRoot,
      ".next",
      "standalone",
      "node_modules",
      ".pnpm",
      "internal-package@1.0.0",
      "node_modules",
      "internal-package",
    );
    const internalPackageLink = path.join(
      projectRoot,
      ".next",
      "standalone",
      "node_modules",
      ".pnpm",
      "consumer@1.0.0",
      "node_modules",
      "internal-package",
    );
    writeFixtureFile(internalPackageSource, "package.json", `${JSON.stringify({
      name: "internal-package",
      version: "1.0.0",
      main: "index.js",
    })}\n`);
    writeFixtureFile(
      internalPackageSource,
      "index.js",
      "module.exports = `${require('bar')}:${require('.prisma/client/default')}`;\n",
    );
    const internalExecutable = path.join(internalPackageSource, "bin", "run.js");
    writeFixtureFile(internalPackageSource, "bin/run.js", "#!/usr/bin/env node\n");
    fs.chmodSync(internalExecutable, 0o755);
    const internalDependencySource = path.join(
      projectRoot,
      ".next",
      "standalone",
      "node_modules",
      ".pnpm",
      "bar@2.0.0",
      "node_modules",
      "bar",
    );
    writeFixtureFile(internalDependencySource, "package.json", `${JSON.stringify({
      name: "bar",
      version: "2.0.0",
      main: "index.js",
    })}\n`);
    writeFixtureFile(internalDependencySource, "index.js", "module.exports = 'bar@2.0.0';\n");
    writeFixtureFile(
      path.dirname(internalPackageSource),
      ".prisma/client/default.js",
      "module.exports = 'generated-client';\n",
    );
    linkRelativeDirectory(
      internalDependencySource,
      path.join(path.dirname(internalPackageSource), "bar"),
    );
    linkRelativeDirectory(internalPackageSource, internalPackageLink);

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
    expect(fs.lstatSync(internalPackageLink).isSymbolicLink()).toBe(true);
    const artifactInternalPackage = path.join(
      artifactDir,
      ".next",
      "standalone",
      "node_modules",
      ".pnpm",
      "consumer@1.0.0",
      "node_modules",
      "internal-package",
    );
    expect(fs.lstatSync(artifactInternalPackage).isSymbolicLink()).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(artifactInternalPackage, "package.json"), "utf8"))).toMatchObject({
      name: "internal-package",
      version: "1.0.0",
    });
    const nestedDependencyResolution = spawnSync(
      process.execPath,
      ["-e", `const value = require(${JSON.stringify(artifactInternalPackage)}); if (value !== "bar@2.0.0:generated-client") process.exit(1);`],
      { encoding: "utf8" },
    );
    expect(
      nestedDependencyResolution.status,
      `${nestedDependencyResolution.stderr}\n${nestedDependencyResolution.stdout}`,
    ).toBe(0);
    const artifactPrisma = path.join(
      artifactDir,
      ".next",
      "standalone",
      "node_modules",
      "prisma",
    );
    expect(fs.lstatSync(artifactPrisma).isSymbolicLink()).toBe(false);
    expect(fs.existsSync(path.join(artifactPrisma, "build", "index.js"))).toBe(true);
    const artifactBetterSqlite = path.join(
      artifactDir,
      ".next",
      "standalone",
      "node_modules",
      "better-sqlite3",
    );
    expect(fs.lstatSync(artifactBetterSqlite).isSymbolicLink()).toBe(false);
    const betterSqliteResolution = spawnSync(
      process.execPath,
      ["-e", `const value = require(${JSON.stringify(artifactBetterSqlite)}); if (value !== "bindings:file-uri-to-path") process.exit(1);`],
      { encoding: "utf8" },
    );
    expect(
      betterSqliteResolution.status,
      `${betterSqliteResolution.stderr}\n${betterSqliteResolution.stdout}`,
    ).toBe(0);
    const portablePrismaConfig = fs.readFileSync(path.join(artifactDir, "prisma.config.mjs"), "utf8");
    expect(portablePrismaConfig).toContain("process.env.DATABASE_URL");
    expect(portablePrismaConfig).not.toContain("prisma/config");
    expect(portablePrismaConfig).not.toContain("dotenv");
    if (process.platform !== "win32") {
      expect(fs.statSync(path.join(artifactInternalPackage, "bin", "run.js")).mode & 0o111).not.toBe(0);
    }
    await expect(listArtifactFiles(artifactDir)).resolves.toEqual(expect.arrayContaining([
      ".next/standalone/server.js",
    ]));
  }, 180_000);

  it("keeps virtual-store dependency versions local to each materialized package", () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    const standaloneDir = path.join(projectRoot, ".next", "standalone");
    initializeDesktopProjectFixture(projectRoot);

    const seedConsumer = (packageName: string, dependencyVersion: string, consumerName: string): string => {
      const packageSource = path.join(
        standaloneDir,
        "node_modules",
        ".pnpm",
        `${packageName}@1.0.0`,
        "node_modules",
        packageName,
      );
      writeFixtureFile(packageSource, "package.json", `${JSON.stringify({
        name: packageName,
        version: "1.0.0",
        main: "index.js",
      })}\n`);
      writeFixtureFile(packageSource, "index.js", "module.exports = require('shared-dependency');\n");
      const dependencySource = path.join(
        standaloneDir,
        "node_modules",
        ".pnpm",
        `shared-dependency@${dependencyVersion}`,
        "node_modules",
        "shared-dependency",
      );
      writeFixtureFile(dependencySource, "package.json", `${JSON.stringify({
        name: "shared-dependency",
        version: dependencyVersion,
        main: "index.js",
      })}\n`);
      writeFixtureFile(dependencySource, "index.js", `module.exports = ${JSON.stringify(dependencyVersion)};\n`);
      linkRelativeDirectory(dependencySource, path.join(path.dirname(packageSource), "shared-dependency"));
      const packageLink = path.join(
        standaloneDir,
        "node_modules",
        ".pnpm",
        `${consumerName}@1.0.0`,
        "node_modules",
        packageName,
      );
      linkRelativeDirectory(packageSource, packageLink);
      return packageLink;
    };

    const firstPackage = seedConsumer("first-package", "1.0.0", "first-consumer");
    const secondPackage = seedConsumer("second-package", "2.0.0", "second-consumer");
    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });

    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    const artifactStandalone = path.join(artifactDir, ".next", "standalone");
    const artifactFirstPackage = path.join(artifactStandalone, path.relative(standaloneDir, firstPackage));
    const artifactSecondPackage = path.join(artifactStandalone, path.relative(standaloneDir, secondPackage));
    const resolution = spawnSync(
      process.execPath,
      [
        "-e",
        `const first = require(${JSON.stringify(artifactFirstPackage)}); const second = require(${JSON.stringify(artifactSecondPackage)}); if (first !== "1.0.0" || second !== "2.0.0") process.exit(1);`,
      ],
      { encoding: "utf8" },
    );
    expect(resolution.status, `${resolution.stderr}\n${resolution.stdout}`).toBe(0);
    expect(fs.existsSync(path.join(artifactStandalone, "node_modules", "shared-dependency"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(
      path.join(artifactFirstPackage, "node_modules", "shared-dependency", "package.json"),
      "utf8",
    ))).toMatchObject({ version: "1.0.0" });
    expect(JSON.parse(fs.readFileSync(
      path.join(artifactSecondPackage, "node_modules", "shared-dependency", "package.json"),
      "utf8",
    ))).toMatchObject({ version: "2.0.0" });
  });

  it("preserves a valid cyclic package dependency through ancestor resolution", async () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    initializeDesktopProjectFixture(projectRoot);
    const packageALink = seedCyclicPackageGraph(projectRoot);

    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });

    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    const standaloneDir = path.join(projectRoot, ".next", "standalone");
    const artifactPackageA = path.join(artifactDir, ".next", "standalone", path.relative(standaloneDir, packageALink));
    const resolution = spawnSync(
      process.execPath,
      [
        "-e",
        `const a = require(${JSON.stringify(artifactPackageA)}); const b = a.loadB(); if (a.name !== "package-a" || b.name !== "package-b" || b.loadA().name !== "package-a") process.exit(1);`,
      ],
      { encoding: "utf8" },
    );
    expect(resolution.status, `${resolution.stderr}\n${resolution.stdout}`).toBe(0);
    await expect(listArtifactFiles(artifactDir)).resolves.toEqual(expect.arrayContaining([
      ".next/standalone/node_modules/package-a/index.js",
    ]));
  });

  it.runIf(process.platform === "win32")("materializes Windows standalone junctions from the project pnpm store", () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    initializeDesktopProjectFixture(projectRoot);
    const packageSource = path.join(
      projectRoot,
      "node_modules",
      ".pnpm",
      "external-package@1.0.0",
      "node_modules",
      "external-package",
    );
    writeFixtureFile(packageSource, "package.json", `${JSON.stringify({
      name: "external-package",
      version: "1.0.0",
      main: "index.js",
    })}\n`);
    writeFixtureFile(packageSource, "index.js", "module.exports = 'materialized';\n");
    linkDirectory(
      packageSource,
      path.join(projectRoot, ".next", "standalone", "node_modules", "external-package"),
    );

    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });

    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    const artifactPackage = path.join(artifactDir, ".next", "standalone", "node_modules", "external-package");
    expect(fs.lstatSync(artifactPackage).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(artifactPackage, "index.js"), "utf8")).toContain("materialized");
  });

  it.runIf(process.platform === "win32")("rejects a Windows standalone junction to a non-package project directory", () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    initializeDesktopProjectFixture(projectRoot);
    linkDirectory(
      path.join(projectRoot, "src"),
      path.join(projectRoot, ".next", "standalone", "node_modules", "not-a-package"),
    );

    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toContain(
      "desktop standalone contains unsupported directory symlink: node_modules/not-a-package",
    );
    expect(fs.existsSync(path.join(artifactDir, "desktop-manifest.json"))).toBe(false);
  });

  it("rejects an active package cycle when an intermediate package shadows the ancestor", () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    initializeDesktopProjectFixture(projectRoot);
    seedCyclicPackageGraph(projectRoot, true);

    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toContain("desktop standalone symlink cycle detected");
    expect(fs.existsSync(path.join(artifactDir, "desktop-manifest.json"))).toBe(false);
  });

  it("rejects a standalone symlink whose target escapes the source root", () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    const externalTarget = path.join(root, "external-package");
    initializeDesktopProjectFixture(projectRoot);
    writeFixtureFile(externalTarget, "package.json", `${JSON.stringify({ name: "external-package" })}\n`);
    linkDirectory(
      externalTarget,
      path.join(projectRoot, ".next", "standalone", "node_modules", "external-package"),
    );

    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toContain(
      "desktop standalone symlink escapes source root: node_modules/external-package",
    );
    expect(fs.existsSync(path.join(artifactDir, "desktop-manifest.json"))).toBe(false);
  });

  it("rejects an artifact destination inside the source standalone before mutation", () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    initializeDesktopProjectFixture(projectRoot);
    const sourceServer = path.join(projectRoot, ".next", "standalone", "server.js");
    const artifactDir = path.join(projectRoot, ".next", "standalone", "generated-artifact");

    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toContain(
      "desktop artifact directory overlaps source standalone",
    );
    expect(fs.readFileSync(sourceServer, "utf8")).toContain("module.exports");
    expect(fs.existsSync(artifactDir)).toBe(false);
  });

  it.runIf(process.platform !== "win32")("rejects a dangling standalone symlink", () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    initializeDesktopProjectFixture(projectRoot);
    const danglingLink = path.join(projectRoot, ".next", "standalone", "node_modules", "dangling-package");
    fs.mkdirSync(path.dirname(danglingLink), { recursive: true });
    fs.symlinkSync("missing-package", danglingLink, "dir");

    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toContain(
      "desktop standalone contains dangling symlink: node_modules/dangling-package",
    );
    expect(fs.existsSync(path.join(artifactDir, "desktop-manifest.json"))).toBe(false);
  });

  it.runIf(process.platform !== "win32")("rejects a standalone file symlink", () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    initializeDesktopProjectFixture(projectRoot);
    const standaloneDir = path.join(projectRoot, ".next", "standalone");
    const targetFile = path.join(standaloneDir, "node_modules", ".pnpm", "tool", "bin", "run.js");
    writeFixtureFile(standaloneDir, "node_modules/.pnpm/tool/bin/run.js", "#!/usr/bin/env node\n");
    const fileLink = path.join(standaloneDir, "node_modules", ".bin", "tool");
    fs.mkdirSync(path.dirname(fileLink), { recursive: true });
    fs.symlinkSync(path.relative(path.dirname(fileLink), targetFile), fileLink, "file");

    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toContain(
      "desktop standalone contains unsupported file symlink: node_modules/.bin/tool",
    );
    expect(fs.existsSync(path.join(artifactDir, "desktop-manifest.json"))).toBe(false);
  });

  it("rejects a standalone symlink cycle", () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    initializeDesktopProjectFixture(projectRoot);
    const standaloneDir = path.join(projectRoot, ".next", "standalone");
    linkRelativeDirectory(standaloneDir, path.join(standaloneDir, "node_modules", "cycle"));

    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toContain(
      "desktop standalone symlink cycle detected: node_modules/cycle",
    );
    expect(fs.existsSync(path.join(artifactDir, "desktop-manifest.json"))).toBe(false);
  });

  it.runIf(process.platform !== "win32")("rejects a special filesystem entry in standalone", () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    initializeDesktopProjectFixture(projectRoot);
    const fifoPath = path.join(projectRoot, ".next", "standalone", "runtime.pipe");
    const created = spawnSync("mkfifo", [fifoPath], { encoding: "utf8" });
    expect(created.status, created.stderr).toBe(0);

    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const result = runNode(script, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toContain(
      "desktop standalone contains unsupported filesystem entry: runtime.pipe",
    );
    expect(fs.existsSync(path.join(artifactDir, "desktop-manifest.json"))).toBe(false);
  });

  it("rejects install input without a provenance manifest", () => {
    const root = makeRoot();
    const fromDir = path.join(root, "artifact");
    const toDir = path.join(root, "installed");
    fs.mkdirSync(fromDir, { recursive: true });
    fs.writeFileSync(path.join(fromDir, "run.sh"), "#!/usr/bin/env bash\n", "utf8");
    const script = path.join(process.cwd(), "scripts", "planning_v2_desktop_install.mjs");

    const result = runNode(script, ["--skip-install", `--from=${fromDir}`, `--to=${toDir}`]);

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toContain(
      "desktop self-verification missing desktop manifest",
    );
    expect(fs.existsSync(toDir)).toBe(false);
  });

  it("rejects an artifact built for another native platform", () => {
    const root = makeRoot();
    const projectRoot = path.join(root, "project");
    const artifactDir = path.join(root, "artifact");
    const toDir = path.join(root, "installed");
    initializeDesktopProjectFixture(projectRoot);
    const buildScript = path.join(process.cwd(), "scripts", "planning_v2_desktop_build.mjs");
    const installScript = path.join(process.cwd(), "scripts", "planning_v2_desktop_install.mjs");
    const built = runNode(buildScript, ["--no-next-build", `--artifact-dir=${artifactDir}`], { cwd: projectRoot });
    expect(built.status, `${built.stderr}\n${built.stdout}`).toBe(0);
    const manifestPath = path.join(artifactDir, "desktop-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.platform = process.platform === "win32" ? "linux" : "win32";
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const installed = runNode(installScript, [
      "--skip-install",
      "--skip-shortcuts",
      `--from=${artifactDir}`,
      `--to=${toDir}`,
    ], { cwd: projectRoot });

    expect(installed.status).not.toBe(0);
    expect(`${installed.stderr}\n${installed.stdout}`).toContain(
      "desktop self-verification mismatch: platform",
    );
    expect(fs.existsSync(toDir)).toBe(false);
  });

  it.runIf(process.platform !== "win32")("rejects symlinked and stale desktop artifacts", () => {
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
