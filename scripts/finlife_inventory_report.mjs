import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";

import { readDumpFile } from "./finlife_dump_utils.mjs";
import { KIND_PRIORITY, PRIORITY_KIND_ORDER } from "./finlife_persistence.mjs";

dotenv.config({ path: ".env.local", override: false, quiet: true });

const require = createRequire(import.meta.url);
const SUPPORTED_KINDS = new Set(PRIORITY_KIND_ORDER);
let prismaClient = null;

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function toNonNegativeInteger(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
}

function toNullableInteger(value) {
  return value == null || !Number.isFinite(Number(value)) ? null : Math.trunc(Number(value));
}

function toIsoString(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function productCode(value) {
  const row = asRecord(value);
  return String(row.fin_prdt_cd ?? row.finPrdtCd ?? "").trim();
}

export function extractCandidateCodes(items) {
  const codes = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const code = productCode(item);
    if (code) codes.add(code);
  }
  return [...codes].sort((a, b) => a.localeCompare(b));
}

function snapshotPath(kind, cwd) {
  return path.join(cwd, ".data", `finlife_${kind}_snapshot.json`);
}

function assertDumpKind(kind, meta) {
  const dumpKind = typeof meta?.kind === "string" ? meta.kind.trim() : "";
  if (dumpKind && dumpKind !== kind) {
    throw new Error(`FINLIFE inventory report kind mismatch: requested=${kind}, dump=${dumpKind}`);
  }
}

function snapshotQuality(meta) {
  return meta.source === "finlife"
    && meta.fallbackUsed === false
    && meta.truncatedByHardCap === false
    && typeof meta.completionRate === "number"
    && meta.completionRate >= 0.95;
}

export function loadFinlifeInventoryCandidateSource(kind, options = {}) {
  if (!SUPPORTED_KINDS.has(kind)) {
    throw new Error(`Unsupported FINLIFE inventory report kind: ${kind}`);
  }
  const cwd = options.cwd ?? process.cwd();
  const fromFile = typeof options.fromFile === "string" ? options.fromFile.trim() : "";

  if (fromFile) {
    const loaded = readDumpFile(path.isAbsolute(fromFile) ? fromFile : path.join(cwd, fromFile));
    assertDumpKind(kind, loaded.payload.meta);
    return {
      type: "normalized-dump",
      fileName: path.basename(loaded.absolute),
      generatedAt: toIsoString(loaded.payload.meta?.dumpedAt),
      qualityVerified: null,
      candidateCodes: extractCandidateCodes(loaded.payload.products),
    };
  }

  const filePath = snapshotPath(kind, cwd);
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const meta = asRecord(parsed.meta);
  return {
    type: "snapshot",
    fileName: path.basename(filePath),
    generatedAt: toIsoString(meta.generatedAt),
    qualityVerified: snapshotQuality(meta),
    candidateCodes: extractCandidateCodes(parsed.items),
  };
}

function summarizeEvidence(row) {
  if (!row) return { status: "missing" };
  const meta = asRecord(row.metaJson);
  const state = meta.completionState;
  if (meta.evidenceType !== "finlife-prisma-product-sync"
    || (state !== "db-complete" && state !== "complete")) {
    return { status: "invalid" };
  }
  const lastRun = asRecord(meta.lastRun);
  const provenance = asRecord(meta.provenance);
  return {
    status: "found",
    completionState: state,
    lastSyncedAt: toIsoString(row.lastSyncedAt),
    snapshotGeneratedAt: toIsoString(meta.snapshotGeneratedAt),
    qualityVerified: meta.source === "finlife"
      && meta.fallbackUsed === false
      && meta.truncatedByHardCap === false
      && typeof meta.completionRate === "number"
      && meta.completionRate >= 0.95,
    provenance: {
      mode: provenance.mode === "replay" ? "replay" : "live",
      replayFile: provenance.mode === "replay" && typeof provenance.replayFile === "string"
        ? path.basename(provenance.replayFile)
        : null,
    },
    metrics: {
      fetchedItems: toNullableInteger(lastRun.fetchedItems),
      upsertedItems: toNullableInteger(lastRun.upsertedItems),
      candidateItems: toNullableInteger(lastRun.candidateItems),
      inventoryItems: toNullableInteger(lastRun.inventoryItems),
      inventoryDeltaItems: toNullableInteger(lastRun.inventoryDeltaItems),
      staleCandidateItems: toNullableInteger(lastRun.staleCandidateItems),
      skippedCrossKindDuplicates: toNullableInteger(lastRun.skippedCrossKindDuplicates),
      replacedCrossKindDuplicates: toNullableInteger(lastRun.replacedCrossKindDuplicates),
    },
  };
}

function evidenceAlignment(candidateSource, evidence) {
  if (evidence.status !== "found") {
    return { aligned: false, basis: "none", reason: `completion_evidence_${evidence.status}` };
  }
  if (evidence.completionState !== "complete") {
    return { aligned: false, basis: "none", reason: "completion_evidence_incomplete" };
  }
  if (!evidence.qualityVerified) {
    return { aligned: false, basis: "none", reason: "completion_evidence_unverified" };
  }

  if (candidateSource.type === "normalized-dump") {
    const aligned = evidence.provenance.mode === "replay"
      && evidence.provenance.replayFile === candidateSource.fileName;
    return {
      aligned,
      basis: "replay-basename",
      reason: aligned ? null : "replay_provenance_mismatch",
    };
  }

  const aligned = candidateSource.qualityVerified === true
    && candidateSource.generatedAt != null
    && candidateSource.generatedAt === evidence.snapshotGeneratedAt;
  return {
    aligned,
    basis: "snapshot-generated-at",
    reason: aligned ? null : "snapshot_evidence_mismatch",
  };
}

function referencesFor(row) {
  const counts = asRecord(row?._count);
  return {
    productOptions: toNonNegativeInteger(counts.options),
    favorites: toNonNegativeInteger(counts.favorites),
    externalMatches: toNonNegativeInteger(counts.externalMatches),
  };
}

function storedRowView(row) {
  return {
    code: productCode(row),
    ownerKind: String(row.kind),
    references: referencesFor(row),
  };
}

function comparePriority(ownerKind, currentKind) {
  const ownerPriority = KIND_PRIORITY.get(ownerKind) ?? Number.MAX_SAFE_INTEGER;
  const currentPriority = KIND_PRIORITY.get(currentKind) ?? Number.MAX_SAFE_INTEGER;
  return ownerPriority <= currentPriority ? "blocked-by-priority" : "replaceable-owner";
}

function referenceReviewStatus(references, evidenceAligned) {
  if (!evidenceAligned) return "evidence-unaligned";
  if (references.favorites > 0 || references.externalMatches > 0) return "referenced";
  if (references.productOptions > 0) return "owned-options-only";
  return "unreferenced";
}

export function buildFinlifeInventoryReport(input) {
  const sourceCodes = Array.isArray(input.candidateSource.candidateCodes)
    ? input.candidateSource.candidateCodes
    : [];
  const candidateCodes = extractCandidateCodes(sourceCodes.map((code) => ({
    fin_prdt_cd: code,
  })));
  const candidateSet = new Set(candidateCodes);
  const storedRows = [...input.storedRows]
    .filter((row) => productCode(row))
    .sort((a, b) => productCode(a).localeCompare(productCode(b)));
  const rowByCode = new Map(storedRows.map((row) => [productCode(row), row]));
  const evidence = summarizeEvidence(input.evidenceRow);
  const alignment = evidenceAlignment(input.candidateSource, evidence);
  const kept = [];
  const missing = [];
  const crossKind = [];

  for (const code of candidateCodes) {
    const row = rowByCode.get(code);
    if (!row) {
      missing.push(code);
      continue;
    }
    if (row.kind === input.kind) {
      kept.push(code);
      continue;
    }
    crossKind.push({
      ...storedRowView(row),
      relation: comparePriority(String(row.kind), input.kind),
    });
  }

  const staleObserved = storedRows
    .filter((row) => row.kind === input.kind && !candidateSet.has(productCode(row)))
    .map((row) => {
      const view = storedRowView(row);
      return {
        ...view,
        reviewStatus: referenceReviewStatus(view.references, alignment.aligned),
      };
    });
  const storedKindItems = storedRows.filter((row) => row.kind === input.kind).length;
  const ready = storedKindItems > 0 || evidence.status === "found";
  const warnings = [];
  if (!alignment.aligned) warnings.push(alignment.reason);
  if (alignment.aligned && alignment.basis === "replay-basename") {
    warnings.push("replay_alignment_uses_basename_only");
  }
  if (candidateCodes.length === 0) warnings.push("candidate_set_empty");
  if (storedKindItems === 0) warnings.push("kind_product_inventory_empty");
  if (!ready) warnings.push("report_not_ready");
  if (evidence.status === "found" && evidence.metrics.candidateItems != null
    && evidence.metrics.candidateItems !== candidateCodes.length) {
    warnings.push("candidate_count_differs_from_evidence");
  }
  if (evidence.status === "found" && evidence.metrics.inventoryItems != null
    && evidence.metrics.inventoryItems !== storedKindItems) {
    warnings.push("inventory_count_differs_from_evidence");
  }

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    mode: "read-only",
    kind: input.kind,
    readiness: {
      ready,
      reason: ready ? null : "finlife_inventory_and_evidence_missing",
    },
    candidateSource: {
      type: input.candidateSource.type,
      fileName: input.candidateSource.fileName,
      generatedAt: input.candidateSource.generatedAt,
      qualityVerified: input.candidateSource.qualityVerified,
      evidenceAligned: alignment.aligned,
      alignmentBasis: alignment.basis,
    },
    evidence,
    summary: {
      candidateItems: candidateCodes.length,
      storedKindItems,
      keptItems: kept.length,
      missingItems: missing.length,
      crossKindItems: crossKind.length,
      blockedByPriorityItems: crossKind.filter((row) => row.relation === "blocked-by-priority").length,
      replaceableOwnerItems: crossKind.filter((row) => row.relation === "replaceable-owner").length,
      staleObservedItems: staleObserved.length,
      referencedStaleItems: staleObserved.filter((row) => row.reviewStatus === "referenced").length,
    },
    candidates: {
      kept,
      missing,
      crossKind,
    },
    staleObserved,
    warnings: [...new Set(warnings.filter(Boolean))],
  };
}

export async function collectFinlifeInventoryReport(input) {
  const [storedRows, evidenceRow] = await Promise.all([
    input.prisma.product.findMany({
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
    }),
    input.prisma.externalSourceSnapshot.findUnique({
      where: {
        sourceId_kind: {
          sourceId: "finlife",
          kind: input.kind,
        },
      },
      select: {
        lastSyncedAt: true,
        metaJson: true,
      },
    }),
  ]);
  return buildFinlifeInventoryReport({
    kind: input.kind,
    candidateSource: input.candidateSource,
    storedRows,
    evidenceRow,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  });
}

function parseArgs(argv) {
  const out = { kind: "", fromFile: "", help: false };
  for (const token of argv) {
    if (token === "--help" || token === "-h") {
      out.help = true;
      continue;
    }
    if (token.startsWith("--kind=")) {
      out.kind = token.slice("--kind=".length).trim();
      continue;
    }
    if (token.startsWith("--fromFile=")) {
      out.fromFile = token.slice("--fromFile=".length).trim();
      continue;
    }
    throw new Error(`Unknown FINLIFE inventory report argument: ${token}`);
  }
  return out;
}

function printUsage() {
  console.log("Usage: pnpm finlife:inventory:report --kind=<kind> [--fromFile=<normalized-dump>]");
  console.log("Without --fromFile, the report reads .data/finlife_<kind>_snapshot.json.");
}

async function getPrismaClient() {
  if (prismaClient) return prismaClient;
  const [{ PrismaClient }, adapterPkg] = await Promise.all([
    import("@prisma/client"),
    Promise.resolve(require("@prisma/adapter-better-sqlite3")),
  ]);
  const Adapter = adapterPkg.PrismaBetterSqlite3 ?? adapterPkg.PrismaBetterSQLite3;
  if (!Adapter) throw new Error("Prisma SQLite adapter not found");
  prismaClient = new PrismaClient({
    adapter: new Adapter({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
  });
  return prismaClient;
}

function safeCliError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/does not exist|no such table|not initialized|SQLITE_ERROR/i.test(message)) {
    return "FINLIFE inventory report requires an initialized database with Product and ExternalSourceSnapshot tables.";
  }
  return message;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  if (!SUPPORTED_KINDS.has(args.kind)) {
    throw new Error(`--kind must be one of: ${PRIORITY_KIND_ORDER.join(", ")}`);
  }
  const candidateSource = loadFinlifeInventoryCandidateSource(args.kind, {
    fromFile: args.fromFile,
  });
  const prisma = await getPrismaClient();
  const report = await collectFinlifeInventoryReport({
    prisma,
    kind: args.kind,
    candidateSource,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.readiness.ready) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[finlife:inventory:report] failed: ${safeCliError(error)}`);
    process.exitCode = 1;
  }).finally(async () => {
    if (prismaClient) await prismaClient.$disconnect();
  });
}
