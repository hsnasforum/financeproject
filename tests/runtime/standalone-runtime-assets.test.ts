import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureStandaloneRuntimeAssets } from "../../scripts/standalone_runtime_assets.mjs";

const tempDirs: string[] = [];

function mkdirp(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function realpath(filePath: string): string {
  return fs.realpathSync(filePath);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("ensureStandaloneRuntimeAssets", () => {
  it("links static, public, and prisma assets beside a standalone server", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "standalone-assets-"));
    tempDirs.push(root);
    const standaloneDir = path.join(root, ".next", "standalone");
    const standaloneServer = path.join(standaloneDir, "server.js");
    mkdirp(standaloneDir);
    mkdirp(path.join(root, ".next", "static"));
    mkdirp(path.join(root, "public"));
    mkdirp(path.join(root, "prisma"));
    const standaloneNodeModules = path.join(standaloneDir, "node_modules");
    const adapterDir = path.join(standaloneNodeModules, "@prisma", "adapter-better-sqlite3");
    const driverUtilsDir = path.join(
      standaloneNodeModules,
      ".pnpm",
      "@prisma+driver-adapter-utils@7.7.0",
      "node_modules",
      "@prisma",
      "driver-adapter-utils",
    );
    const betterSqliteDir = path.join(standaloneNodeModules, "better-sqlite3");
    const bindingsDir = path.join(standaloneNodeModules, ".pnpm", "bindings@1.5.0", "node_modules", "bindings");
    const fileUriToPathDir = path.join(
      standaloneNodeModules,
      ".pnpm",
      "file-uri-to-path@1.0.0",
      "node_modules",
      "file-uri-to-path",
    );
    mkdirp(adapterDir);
    mkdirp(driverUtilsDir);
    mkdirp(betterSqliteDir);
    mkdirp(bindingsDir);
    mkdirp(fileUriToPathDir);
    fs.writeFileSync(standaloneServer, "module.exports = {};\n");
    fs.writeFileSync(
      path.join(adapterDir, "package.json"),
      JSON.stringify({
        dependencies: {
          "@prisma/driver-adapter-utils": "7.7.0",
        },
      }),
    );
    fs.writeFileSync(path.join(driverUtilsDir, "package.json"), JSON.stringify({ version: "7.7.0" }));
    fs.writeFileSync(
      path.join(betterSqliteDir, "package.json"),
      JSON.stringify({
        dependencies: {
          bindings: "^1.5.0",
        },
      }),
    );
    fs.writeFileSync(
      path.join(bindingsDir, "package.json"),
      JSON.stringify({
        version: "1.5.0",
        dependencies: {
          "file-uri-to-path": "1.0.0",
        },
      }),
    );
    fs.writeFileSync(path.join(fileUriToPathDir, "package.json"), JSON.stringify({ version: "1.0.0" }));

    ensureStandaloneRuntimeAssets({
      standaloneServer,
      distDir: ".next",
      cwd: root,
      log: () => undefined,
    });

    expect(realpath(path.join(standaloneDir, ".next", "static"))).toBe(realpath(path.join(root, ".next", "static")));
    expect(realpath(path.join(standaloneDir, "public"))).toBe(realpath(path.join(root, "public")));
    expect(realpath(path.join(standaloneDir, "prisma"))).toBe(realpath(path.join(root, "prisma")));
    expect(realpath(path.join(standaloneNodeModules, "@prisma", "driver-adapter-utils"))).toBe(realpath(driverUtilsDir));
    expect(realpath(path.join(standaloneNodeModules, "bindings"))).toBe(realpath(bindingsDir));
    expect(realpath(path.join(standaloneNodeModules, "file-uri-to-path"))).toBe(realpath(fileUriToPathDir));
  });
});
