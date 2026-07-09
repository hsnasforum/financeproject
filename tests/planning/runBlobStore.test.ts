import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readRunBlobPayload,
  withStageBlobRefs,
  withStageOutputRefs,
  writeStageBlobs,
} from "../../src/lib/planning/store/runBlobStore";
import { resolveProfileRunBlobsDir } from "../../src/lib/planning/store/paths";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

const env = process.env as Record<string, string | undefined>;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;

describe("run blob store", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-run-blob-store-"));
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
  });

  afterEach(() => {
    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("writes stage blobs and reads them without runStore orchestration", async () => {
    const outputs = {
      simulate: {
        summary: { endNetWorthKrw: 1234 },
        warnings: [],
        goalsStatus: [],
        keyTimelinePoints: [],
      },
      actions: {
        actions: [
          {
            id: "save-more",
            title: "저축 늘리기",
            reason: "월 저축을 늘립니다.",
            priority: 1,
          },
        ],
      },
    } as unknown as PlanningRunRecord["outputs"];

    const refs = await writeStageBlobs({
      profileId: "profile-1",
      runId: "run-1",
      outputs,
    });

    expect(refs.simulate).toMatchObject({ name: "simulate" });
    expect(refs.actions).toMatchObject({ name: "actions" });
    expect(fs.existsSync(path.join(resolveProfileRunBlobsDir("profile-1", "run-1"), "simulate.json"))).toBe(true);

    const run = {
      id: "run-1",
      profileId: "profile-1",
      outputs,
    } as Pick<PlanningRunRecord, "id" | "profileId" | "outputs">;
    const simulate = await readRunBlobPayload({
      runId: "run-1",
      blobName: "simulate",
      run,
    }) as { summary?: { endNetWorthKrw?: number } } | null;

    expect(simulate?.summary?.endNetWorthKrw).toBe(1234);
  });

  it("attaches blob refs to compact outputs and legacy debt stage output refs", () => {
    const ref = {
      name: "debtStrategy" as const,
      path: ".data/planning/vault/profiles/profile-1/runs/run-1/blobs/debtStrategy.json",
      sizeBytes: 321,
    };

    const outputs = withStageBlobRefs({
      debtStrategy: {
        summary: {
          totalMonthlyPaymentKrw: 100_000,
          debtServiceRatio: 0.25,
        },
        warnings: [],
        summaries: [],
      },
    } as unknown as PlanningRunRecord["outputs"], {
      debtStrategy: ref,
    });

    expect(outputs.debtStrategy?.ref).toMatchObject(ref);

    const stages = withStageOutputRefs([
      {
        id: "debt",
        status: "SUCCESS",
        outputRef: {
          key: "debt",
          hasData: true,
        },
      },
    ], {
      debtStrategy: ref,
    });

    expect(stages?.[0]?.outputRef?.ref).toMatchObject(ref);
  });
});
