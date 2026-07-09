import { describe, expect, it, vi } from "vitest";

import { createRunBlobWriteStore } from "../../src/lib/planning/store/runBlobWriteStore";
import {
  writeStageBlobs,
  type RunBlobRef,
} from "../../src/lib/planning/store/runBlobStore";
import { compactRawRunOutputs } from "../../src/lib/planning/store/runMetaRecord";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

function makeOutputs(): PlanningRunRecord["outputs"] {
  return {
    simulate: {
      summary: {
        endNetWorthKrw: 1234,
      },
      warnings: [],
      goalsStatus: [],
      keyTimelinePoints: [],
    },
    actions: {
      actions: [],
    },
  };
}

describe("planning run blob write store", () => {
  it("compacts raw outputs before writing stage blobs", async () => {
    const sourceOutputs = makeOutputs();
    const compactedOutputs = {
      simulate: {
        summary: {
          endNetWorthKrw: 5678,
        },
      },
    } as PlanningRunRecord["outputs"];
    const simulateRef: RunBlobRef = {
      name: "simulate",
      path: ".data/planning/vault/profiles/profile-1/runs/run-1/blobs/simulate.json",
      sizeBytes: 321,
    };
    const tx = { txId: "tx-1", kind: "RUN_CREATE" as const };
    const compactOutputs = vi.fn<typeof compactRawRunOutputs>(() => compactedOutputs);
    const writeBlobs = vi.fn<typeof writeStageBlobs>(async () => ({
      simulate: simulateRef,
    }));
    const appendTransactionStep = vi.fn(async () => undefined);
    const store = createRunBlobWriteStore({
      appendTransactionStep,
      compactOutputs,
      writeStageBlobs: writeBlobs,
    });

    await expect(store.writeRunStageBlobs({
      profileId: "profile-1",
      runId: "run-1",
      outputs: sourceOutputs,
      options: {
        timelineSampleStepMonths: 6,
      },
      tx,
    })).resolves.toEqual({
      simulate: simulateRef,
    });

    expect(compactOutputs).toHaveBeenCalledWith(sourceOutputs, {
      timelineSampleStepMonths: 6,
    });
    expect(writeBlobs).toHaveBeenCalledWith({
      profileId: "profile-1",
      runId: "run-1",
      outputs: compactedOutputs,
    });
    expect(appendTransactionStep).toHaveBeenCalledWith(tx, "WRITE_BLOB", {
      blob: "simulate",
      path: simulateRef.path,
      sizeBytes: simulateRef.sizeBytes,
    });
  });

  it("skips blob journal steps when a ref is missing or no transaction is provided", async () => {
    const appendTransactionStep = vi.fn(async () => undefined);
    const writeBlobs = vi.fn<typeof writeStageBlobs>(async () => ({
      simulate: undefined,
      actions: {
        name: "actions",
        path: ".data/planning/vault/profiles/profile-1/runs/run-1/blobs/actions.json",
        sizeBytes: 111,
      },
    }));
    const store = createRunBlobWriteStore({
      appendTransactionStep,
      compactOutputs: vi.fn<typeof compactRawRunOutputs>((outputs) => outputs),
      writeStageBlobs: writeBlobs,
    });

    await store.writeRunStageBlobs({
      profileId: "profile-1",
      runId: "run-1",
      outputs: makeOutputs(),
    });

    expect(appendTransactionStep).not.toHaveBeenCalled();

    await store.writeRunStageBlobs({
      profileId: "profile-1",
      runId: "run-1",
      outputs: makeOutputs(),
      tx: { txId: "tx-1", kind: "RUN_CREATE" },
    });

    expect(appendTransactionStep).toHaveBeenCalledTimes(1);
    expect(appendTransactionStep).toHaveBeenCalledWith(expect.any(Object), "WRITE_BLOB", {
      blob: "actions",
      path: ".data/planning/vault/profiles/profile-1/runs/run-1/blobs/actions.json",
      sizeBytes: 111,
    });
  });
});
