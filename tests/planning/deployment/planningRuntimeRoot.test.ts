import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyPlanningFilesystemType,
  classifyPlanningWindowsDriveType,
  inspectPlanningDataRoot,
  isObviouslySharedDataRoot,
  resolvePlanningDatabaseFacts,
  resolvePlanningControlRoot,
  resolvePlanningDataRoot,
} from "../../../src/lib/planning/deployment/runtimeRoot.mjs";

const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("planning runtime data root", () => {
  it("keeps the canonical resolver aligned with development and production roots", () => {
    expect(resolvePlanningDataRoot({
      cwd: "/workspace/app",
      env: { NODE_ENV: "development" } as NodeJS.ProcessEnv,
      platform: "linux",
    })).toBe(path.resolve("/workspace/app/.data/planning"));

    expect(resolvePlanningDataRoot({
      cwd: "/workspace/app",
      env: {
        NODE_ENV: "production",
        XDG_DATA_HOME: "/var/local/user-data",
        PLANNING_APP_NAME: "Finance",
      } as NodeJS.ProcessEnv,
      platform: "linux",
    })).toBe(path.resolve("/var/local/user-data/Finance/vault"));
    expect(resolvePlanningControlRoot({
      cwd: "/workspace/app",
      env: {
        NODE_ENV: "production",
        XDG_DATA_HOME: "/var/local/user-data",
        PLANNING_APP_NAME: "Finance",
      } as NodeJS.ProcessEnv,
      platform: "linux",
    })).toBe(path.resolve("/var/local/user-data/Finance"));
  });

  it("resolves and canonicalizes an explicit local root", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "planning-root-"));
    cleanupRoots.push(parent);
    const inspected = await inspectPlanningDataRoot({ dataRoot: path.join(parent, "vault") });

    expect(inspected.dataRoot).toBe(await fs.realpath(path.join(parent, "vault")));
    expect(inspected.dataRootKind).toBe("local");
  });

  it.runIf(process.platform === "win32")("does not use caller-provided OS roots to locate PowerShell", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "planning-root-win-system-"));
    cleanupRoots.push(parent);

    await expect(inspectPlanningDataRoot({
      dataRoot: path.join(parent, "vault"),
      env: {
        SystemRoot: "C:\\untrusted-system-root",
        WINDIR: "C:\\untrusted-windows-root",
      } as unknown as NodeJS.ProcessEnv,
    })).resolves.toMatchObject({ dataRootKind: "local" });
  });

  it("fails closed for UNC and unknown filesystem types", () => {
    expect(isObviouslySharedDataRoot("\\\\server\\share\\vault", "win32")).toBe(true);
    expect(classifyPlanningFilesystemType(0x6969)).toBe("shared");
    expect(classifyPlanningFilesystemType(0x12345678)).toBe("unknown");
    expect(classifyPlanningWindowsDriveType("Fixed")).toBe("local");
    expect(classifyPlanningWindowsDriveType("Network")).toBe("shared");
    expect(classifyPlanningWindowsDriveType("Removable")).toBe("unknown");
    expect(classifyPlanningWindowsDriveType("Unknown")).toBe("unknown");
  });

  it("classifies a mapped-network filesystem result as shared instead of assuming local", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "planning-root-win-"));
    cleanupRoots.push(parent);
    const statfs = vi.spyOn(fs, "statfs").mockResolvedValue({
      type: 0xff534d42,
    } as Awaited<ReturnType<typeof fs.statfs>>);

    try {
      await expect(inspectPlanningDataRoot({
        dataRoot: path.join(parent, "vault"),
      })).resolves.toMatchObject({ dataRootKind: "shared", filesystemType: 0xff534d42 });
    } finally {
      statfs.mockRestore();
    }
  });

  it("accepts only SQLite file database facts", () => {
    expect(resolvePlanningDatabaseFacts({ DATABASE_URL: "file:./data.db" } as unknown as NodeJS.ProcessEnv)).toEqual({
      databaseProvider: "sqlite",
      databaseConnection: "file",
    });
    expect(resolvePlanningDatabaseFacts({ DATABASE_URL: "postgresql://host/db" } as unknown as NodeJS.ProcessEnv)).toEqual({
      databaseProvider: "unknown",
      databaseConnection: "network",
    });
  });
});
