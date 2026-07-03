import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getRunPaths,
  resolveRunReadSources,
} from "../../src/lib/planning/store/runReadSources";
import {
  resolveProfileRunMetaPath,
  resolveRunMetaPath,
  resolveRunPath,
} from "../../src/lib/planning/store/paths";

const env = process.env as Record<string, string | undefined>;

const originalRunsDir = process.env.PLANNING_RUNS_DIR;

async function touch(filePath: string): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, "{}\n", "utf-8");
}

describe("planning run read sources", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-read-sources-"));
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
  });

  afterEach(() => {
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps partition hint before legacy fallbacks when a profile hint is available", async () => {
    const { sources } = await resolveRunReadSources("run-1", "profile-1");

    expect(sources.map((source) => source.source)).toEqual([
      "partition-hint",
      "legacy-meta",
      "legacy-file",
    ]);
    expect(sources.map((source) => source.filePath)).toEqual([
      resolveProfileRunMetaPath("profile-1", "run-1"),
      resolveRunMetaPath("run-1"),
      resolveRunPath("run-1"),
    ]);
  });

  it("scans partitioned profile dirs before legacy fallbacks when no profile hint exists", async () => {
    const partitionMetaPath = resolveProfileRunMetaPath("profile-2", "run-2");
    await touch(partitionMetaPath);

    const { sources } = await resolveRunReadSources("run-2");

    expect(sources.map((source) => source.source)).toEqual([
      "partition-scan",
      "legacy-meta",
      "legacy-file",
    ]);
    expect(sources[0]?.filePath).toBe(partitionMetaPath);
  });

  it("falls back to legacy paths when no partitioned run can be found", async () => {
    const paths = getRunPaths("run-3");
    const { sources } = await resolveRunReadSources("run-3");

    expect(sources).toEqual([
      {
        source: "legacy-meta",
        filePath: paths.legacyMetaPath,
      },
      {
        source: "legacy-file",
        filePath: paths.legacyFilePath,
      },
    ]);
  });
});
