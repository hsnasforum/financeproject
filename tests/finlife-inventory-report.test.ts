import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildFinlifeInventoryReport,
  collectFinlifeInventoryReport,
  loadFinlifeInventoryCandidateSource,
} from "../scripts/finlife_inventory_report.mjs";

const temporaryRoots: string[] = [];

function makeTemporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "finlife-inventory-report-"));
  temporaryRoots.push(root);
  return root;
}

function replayEvidence() {
  return {
    lastSyncedAt: new Date("2026-07-10T00:10:00.000Z"),
    metaJson: {
      evidenceType: "finlife-prisma-product-sync",
      completionState: "complete",
      source: "finlife",
      fallbackUsed: false,
      truncatedByHardCap: false,
      completionRate: 1,
      snapshotGeneratedAt: "2026-07-10T00:05:00.000Z",
      provenance: {
        mode: "replay",
        replayFile: "mortgage.json",
      },
      lastRun: {
        fetchedItems: 4,
        upsertedItems: 2,
        candidateItems: 4,
        inventoryItems: 3,
        inventoryDeltaItems: -1,
        staleCandidateItems: 1,
        skippedCrossKindDuplicates: 1,
        replacedCrossKindDuplicates: 1,
      },
    },
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("FINLIFE inventory report", () => {
  it("classifies owner conflicts and stale references without mutating inventory", () => {
    const report = buildFinlifeInventoryReport({
      kind: "mortgage-loan",
      candidateSource: {
        type: "normalized-dump",
        fileName: "mortgage.json",
        generatedAt: "2026-07-10T00:00:00.000Z",
        qualityVerified: null,
        candidateCodes: ["KEEP", "BLOCKED", "REPLACE", "MISSING"],
      },
      evidenceRow: replayEvidence(),
      generatedAt: "2026-07-10T00:20:00.000Z",
      storedRows: [
        { finPrdtCd: "KEEP", kind: "mortgage-loan", _count: { options: 1, favorites: 0, externalMatches: 0 } },
        { finPrdtCd: "BLOCKED", kind: "saving", _count: { options: 1, favorites: 0, externalMatches: 0 } },
        { finPrdtCd: "REPLACE", kind: "deposit", _count: { options: 1, favorites: 0, externalMatches: 0 } },
        { finPrdtCd: "STALE-REF", kind: "mortgage-loan", _count: { options: 2, favorites: 1, externalMatches: 1 } },
        { finPrdtCd: "STALE-ONLY", kind: "mortgage-loan", _count: { options: 0, favorites: 0, externalMatches: 0 } },
      ],
    });

    expect(report.mode).toBe("read-only");
    expect(report.readiness).toEqual({ ready: true, reason: null });
    expect(report.candidateSource).toMatchObject({
      evidenceAligned: true,
      alignmentBasis: "replay-basename",
    });
    expect(report.summary).toEqual({
      candidateItems: 4,
      storedKindItems: 3,
      keptItems: 1,
      missingItems: 1,
      crossKindItems: 2,
      blockedByPriorityItems: 1,
      replaceableOwnerItems: 1,
      staleObservedItems: 2,
      referencedStaleItems: 1,
    });
    expect(report.candidates.crossKind).toEqual([
      expect.objectContaining({ code: "BLOCKED", ownerKind: "saving", relation: "blocked-by-priority" }),
      expect.objectContaining({ code: "REPLACE", ownerKind: "deposit", relation: "replaceable-owner" }),
    ]);
    expect(report.staleObserved).toEqual([
      expect.objectContaining({ code: "STALE-ONLY", reviewStatus: "unreferenced" }),
      expect.objectContaining({ code: "STALE-REF", reviewStatus: "referenced" }),
    ]);
  });

  it("marks stale rows as evidence-unaligned when the input dump is not the completed replay", () => {
    const report = buildFinlifeInventoryReport({
      kind: "deposit",
      candidateSource: {
        type: "normalized-dump",
        fileName: "different.json",
        generatedAt: null,
        qualityVerified: null,
        candidateCodes: [],
      },
      evidenceRow: replayEvidence(),
      generatedAt: "2026-07-10T00:20:00.000Z",
      storedRows: [
        { finPrdtCd: "STALE", kind: "deposit", _count: { options: 1, favorites: 0, externalMatches: 0 } },
      ],
    });

    expect(report.candidateSource.evidenceAligned).toBe(false);
    expect(report.staleObserved[0]).toMatchObject({ reviewStatus: "evidence-unaligned" });
    expect(report.warnings).toContain("replay_provenance_mismatch");
    expect(report.warnings).toContain("candidate_set_empty");
  });

  it("does not treat another kind inventory as readiness for the requested kind", () => {
    const report = buildFinlifeInventoryReport({
      kind: "deposit",
      candidateSource: {
        type: "snapshot",
        fileName: "finlife_deposit_snapshot.json",
        generatedAt: "2026-07-10T00:05:00.000Z",
        qualityVerified: true,
        candidateCodes: ["ONE"],
      },
      evidenceRow: null,
      generatedAt: "2026-07-10T00:20:00.000Z",
      storedRows: [
        { finPrdtCd: "OTHER", kind: "saving", _count: { options: 0, favorites: 0, externalMatches: 0 } },
      ],
    });

    expect(report.readiness).toEqual({
      ready: false,
      reason: "finlife_inventory_and_evidence_missing",
    });
    expect(report.warnings).toContain("kind_product_inventory_empty");
    expect(report.warnings).toContain("report_not_ready");
  });

  it("loads a verified snapshot fallback and deduplicates product codes", () => {
    const root = makeTemporaryRoot();
    const dataDir = path.join(root, ".data");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "finlife_deposit_snapshot.json"), JSON.stringify({
      meta: {
        generatedAt: "2026-07-10T00:05:00.000Z",
        source: "finlife",
        fallbackUsed: false,
        truncatedByHardCap: false,
        completionRate: 1,
      },
      items: [
        { fin_prdt_cd: "B" },
        { fin_prdt_cd: "A" },
        { fin_prdt_cd: "A" },
        { fin_prdt_cd: "" },
      ],
    }), "utf-8");

    expect(loadFinlifeInventoryCandidateSource("deposit", { cwd: root })).toEqual({
      type: "snapshot",
      fileName: "finlife_deposit_snapshot.json",
      generatedAt: "2026-07-10T00:05:00.000Z",
      qualityVerified: true,
      candidateCodes: ["A", "B"],
    });
  });

  it("prefers an explicit normalized dump over the ambient snapshot path", () => {
    const source = loadFinlifeInventoryCandidateSource("deposit", {
      cwd: process.cwd(),
      fromFile: "tests/fixtures/finlife_deposit.normalized.json",
    });

    expect(source).toMatchObject({
      type: "normalized-dump",
      fileName: "finlife_deposit.normalized.json",
      qualityVerified: null,
      candidateCodes: ["DEPOSIT_SAMPLE_001", "DEPOSIT_SAMPLE_002"],
    });
  });

  it("aligns a verified snapshot only to the same completed snapshot timestamp", () => {
    const report = buildFinlifeInventoryReport({
      kind: "deposit",
      candidateSource: {
        type: "snapshot",
        fileName: "finlife_deposit_snapshot.json",
        generatedAt: "2026-07-10T00:05:00.000Z",
        qualityVerified: true,
        candidateCodes: ["ONE"],
      },
      evidenceRow: {
        lastSyncedAt: new Date("2026-07-10T00:10:00.000Z"),
        metaJson: {
          evidenceType: "finlife-prisma-product-sync",
          completionState: "complete",
          source: "finlife",
          fallbackUsed: false,
          truncatedByHardCap: false,
          completionRate: 1,
          snapshotGeneratedAt: "2026-07-10T00:05:00.000Z",
          provenance: { mode: "live" },
          lastRun: { candidateItems: 1, inventoryItems: 1 },
        },
      },
      generatedAt: "2026-07-10T00:20:00.000Z",
      storedRows: [
        { finPrdtCd: "ONE", kind: "deposit", _count: { options: 0, favorites: 0, externalMatches: 0 } },
      ],
    });

    expect(report.candidateSource).toMatchObject({
      evidenceAligned: true,
      alignmentBasis: "snapshot-generated-at",
    });
    expect(report.warnings).not.toContain("snapshot_evidence_mismatch");
  });

  it("uses only Prisma read operations and preserves internal evidence metrics", async () => {
    const findMany = vi.fn(async () => []);
    const findUnique = vi.fn(async () => replayEvidence());
    const prisma = {
      product: { findMany },
      externalSourceSnapshot: { findUnique },
    };

    const report = await collectFinlifeInventoryReport({
      prisma,
      kind: "mortgage-loan",
      candidateSource: {
        type: "normalized-dump",
        fileName: "mortgage.json",
        generatedAt: null,
        qualityVerified: null,
        candidateCodes: ["ONE"],
      },
      generatedAt: "2026-07-10T00:20:00.000Z",
    });

    expect(findMany).toHaveBeenCalledWith({
      select: {
        finPrdtCd: true,
        kind: true,
        _count: {
          select: {
            options: true,
            favorites: true,
            externalMatches: true,
          },
        },
      },
    });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        sourceId_kind: {
          sourceId: "finlife",
          kind: "mortgage-loan",
        },
      },
    }));
    expect(report.evidence).toMatchObject({
      status: "found",
      metrics: {
        candidateItems: 4,
        inventoryItems: 3,
        inventoryDeltaItems: -1,
      },
    });
    expect(Object.keys(prisma.product)).toEqual(["findMany"]);
    expect(Object.keys(prisma.externalSourceSnapshot)).toEqual(["findUnique"]);
  });

  it("keeps the package script and operator docs wired to the read-only entrypoint", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"));
    const docs = fs.readFileSync(path.join(process.cwd(), "docs", "finlife-sync.md"), "utf-8");

    expect(packageJson.scripts?.["finlife:inventory:report"]).toBe(
      "node scripts/finlife_inventory_report.mjs",
    );
    expect(docs).toContain("pnpm finlife:inventory:report");
    expect(docs).toContain("read-only");
  });
});
