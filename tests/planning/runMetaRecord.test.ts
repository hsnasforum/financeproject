import { describe, expect, it } from "vitest";
import {
  buildCreateRunRecord,
  compactRawRunOutputs,
  normalizeRunMetaForRead,
} from "../../src/lib/planning/store/runMetaRecord";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";
import { buildResultDtoV1 } from "../../src/lib/planning/v2/resultDto";

function resultDto() {
  return buildResultDtoV1({
    generatedAt: "2026-03-01T00:00:00.000Z",
    simulate: {
      summary: {
        endNetWorthKrw: 1_000_000,
        worstCashKrw: 100_000,
        worstCashMonthIndex: 1,
        goalsAchievedCount: 0,
        goalsMissedCount: 0,
      },
      warnings: [],
      goalsStatus: [],
      keyTimelinePoints: [],
      timeline: [],
    },
  });
}

describe("run meta record", () => {
  it("builds compact create-run meta while stage blobs keep raw payload ownership", () => {
    const record = buildCreateRunRecord({
      source: {
        profileId: "profile-1",
        title: "  compact run  ",
        input: { horizonMonths: 12 },
        meta: { snapshot: { missing: true } },
        stages: [
          {
            id: "simulate",
            status: "SUCCESS",
            outputRef: { key: "simulate", hasData: true },
          },
        ],
        outputs: {
          resultDto: resultDto(),
          simulate: {
            summary: { endNetWorthKrw: 1_000_000 },
            warnings: ["WARN_1"],
            goalsStatus: [],
            keyTimelinePoints: [],
          },
        },
      },
      runId: "run-1",
      profileId: "profile-1",
      createdAt: "2026-03-01T00:00:00.000Z",
      blobRefs: {
        simulate: {
          name: "simulate",
          path: ".data/planning/vault/profiles/profile-1/runs/run-1/blobs/simulate.json",
          sizeBytes: 123,
        },
      },
    });

    expect(record.schemaVersion).toBe(2);
    expect(record.title).toBe("compact run");
    expect(record.outputs.resultDto?.version).toBe(1);
    expect(record.outputs.resultDto?.raw).toEqual({});
    expect(record.outputs.simulate?.ref).toMatchObject({ name: "simulate", sizeBytes: 123 });
    expect((record.outputs.simulate as { summary?: unknown }).summary).toBeUndefined();
    expect(record.stages?.[0]?.outputRef?.ref).toMatchObject({ name: "simulate", sizeBytes: 123 });
  });

  it("keeps bounded raw output fields for blob writes", () => {
    const outputs = compactRawRunOutputs({
      resultDto: resultDto(),
      simulate: {
        summary: { endNetWorthKrw: 2_000_000 },
        warnings: Array.from({ length: 100 }, (_, index) => `WARN_${index + 1}`),
        goalsStatus: [],
        keyTimelinePoints: [],
      },
    } as unknown as PlanningRunRecord["outputs"]);

    expect(outputs.resultDto?.raw).toBeDefined();
    expect((outputs.simulate as { summary?: { endNetWorthKrw?: number } }).summary?.endNetWorthKrw).toBe(2_000_000);
    expect((outputs.simulate as { warnings?: string[] }).warnings?.length).toBeLessThan(100);
  });

  it("normalizes legacy run meta for read without file-store dependencies", () => {
    const normalized = normalizeRunMetaForRead({
      version: 1,
      id: "legacy-run",
      profileId: "profile-1",
      createdAt: "2026-03-01T00:00:00.000Z",
      input: { horizonMonths: 12 },
      meta: { snapshot: { missing: true } },
      outputs: {
        simulate: {
          summary: {
            endNetWorthKrw: 1_200_000,
            worstCashKrw: 100_000,
            worstCashMonthIndex: 1,
          },
          warnings: [],
          goalsStatus: [],
          keyTimelinePoints: [],
          timeline: [],
        },
      },
    } as unknown as PlanningRunRecord);

    expect(normalized.migrated).toBe(true);
    expect(normalized.source).toBe("runStore/readRunMetaByPath/outputs.resultDto.rebuild");
    expect(normalized.run.outputs.resultDto?.version).toBe(1);
  });
});
