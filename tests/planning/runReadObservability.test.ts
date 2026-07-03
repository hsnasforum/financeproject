import { describe, expect, it, vi } from "vitest";
import {
  createRunReadDiagnosticRecorder,
  recordRunReadFallbackUsage,
  type ReadRunMetaByPathDetailedResult,
} from "../../src/lib/planning/store/runReadObservability";

describe("planning run read observability", () => {
  it("records fallback metrics with the existing metric keys and source keys", () => {
    const recordFallbackUsage = vi.fn();

    recordRunReadFallbackUsage({
      canonicalMeta: {
        migrated: true,
        source: "runStore/readRunMetaByPath/outputs.resultDto.normalize",
      },
      migration: {
        migrated: true,
        source: "engineEnvelope",
        run: { id: "run-1" },
      },
      recordFallbackUsage,
    });

    expect(recordFallbackUsage).toHaveBeenCalledWith("legacyReportContractFallbackCount", {
      source: "runStore/readRunMetaByPath/outputs.resultDto.normalize",
      sourceKey: "compatRebuild",
      runId: "run-1",
    });
    expect(recordFallbackUsage).toHaveBeenCalledWith("legacyRunEngineMigrationCount", {
      source: "runStore/readRunMetaByPath/engineEnvelope",
      sourceKey: "legacyEngineFallback",
      runId: "run-1",
    });
  });

  it("keeps diagnostic attempts and final status construction outside runStore", () => {
    const recorder = createRunReadDiagnosticRecorder({
      id: "run-1",
      profileIdHint: "profile-1",
      normalizePath: (filePath) => filePath.replace("/repo/", ""),
    });
    const missing: ReadRunMetaByPathDetailedResult = { status: "missing", reason: "file-missing" };
    const unreadable: ReadRunMetaByPathDetailedResult = { status: "unreadable", reason: "invalid-json" };

    recorder.recordAttempt("partition-hint", "/repo/vault/run.json", unreadable);
    recorder.recordAttempt("legacy-meta", "/repo/runs/run-1/meta.json", missing);

    expect(recorder.final()).toEqual({
      id: "run-1",
      profileIdHint: "profile-1",
      status: "unreadable",
      attempts: [
        {
          source: "partition-hint",
          path: "vault/run.json",
          status: "unreadable",
          reason: "invalid-json",
        },
        {
          source: "legacy-meta",
          path: "runs/run-1/meta.json",
          status: "missing",
          reason: "file-missing",
        },
      ],
    });
  });
});
