import { tsImport } from "tsx/esm/api";
import {
  createLegacyBackfillAnomalyCollector,
  summarizeLegacyBackfillAnomalies,
} from "./planning_v2_legacy_backfill_anomalies.mjs";

const REQUIRED_CONFIRM = "BACKFILL LEGACY RUNS";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeLimit(value, fallback = 100) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 500);
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    apply: false,
    includeOpsDoctor: false,
    confirm: "",
    limit: 100,
  };

  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    if (token === "--dry-run") out.dryRun = true;
    if (token === "--apply") out.apply = true;
    if (token === "--include-ops-doctor") out.includeOpsDoctor = true;
    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = asString(rest.join("="));
    if (key === "confirm") out.confirm = value;
    if (key === "limit") out.limit = toSafeLimit(value, 100);
  }

  if (!out.dryRun && !out.apply) out.dryRun = true;
  return out;
}

function printSummary(summary, includeOpsDoctor) {
  console.log("[planning:v2:backfill-legacy-runs] summary");
  console.log(`- totalRuns=${summary.totalRuns}`);
  console.log(`- opsDoctorRuns=${summary.opsDoctorRuns}`);
  console.log(`- userRuns=${summary.userRuns}`);
  console.log(`- legacyCandidates=${summary.legacyCandidates}`);
  console.log(`- userLegacyCandidates=${summary.userLegacyCandidates}`);
  console.log(`- opsDoctorLegacyCandidates=${summary.opsDoctorLegacyCandidates}`);
  console.log(`- resultDtoOnlyCandidates=${summary.resultDtoOnlyCandidates}`);
  console.log(`- missingEngineSchemaCandidates=${summary.missingEngineSchemaCandidates}`);
  console.log(`- missingResultDtoCandidates=${summary.missingResultDtoCandidates}`);
  console.log(`- unreadableCandidates=${summary.unreadableCandidates}`);
  console.log(`- includeOpsDoctor=${includeOpsDoctor ? "true" : "false"}`);
}

function printCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 1) return;
  console.log("[planning:v2:backfill-legacy-runs] sample");
  for (const row of candidates.slice(0, 20)) {
    console.log(`- ${row.id} profile=${row.profileId} kind=${row.runKind} reason=${row.reason} createdAt=${row.createdAt}`);
  }
}

function printAnomalySummary(events) {
  const summary = summarizeLegacyBackfillAnomalies(events);
  if (summary.total < 1) return;
  console.log("[planning:v2:backfill-legacy-runs] anomalies");
  console.log(`- total=${summary.total}`);
  console.log(`- recoveredReadFallbackEvents=${summary.recoveredReadFallbackEvents}`);
  console.log(`- skipped=${summary.skipped}`);
  console.log(`- failed=${summary.failed}`);
  for (const [reason, count] of Object.entries(summary.byReason).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`- reason.${reason}=${count}`);
  }
  for (const [reason, count] of Object.entries(summary.byCandidateReason).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`- candidateReason.${reason}=${count}`);
  }
  for (const [errorName, count] of Object.entries(summary.byErrorName).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`- errorName.${errorName}=${count}`);
  }
  for (const [runKind, count] of Object.entries(summary.byRunKind).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`- runKind.${runKind}=${count}`);
  }
  for (const [source, count] of Object.entries(summary.bySource).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`- source.${source}=${count}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const modRaw = await tsImport("../src/lib/planning/store/runStore.ts", { parentURL: import.meta.url });
  const mod = modRaw?.default && typeof modRaw.default === "object" ? modRaw.default : modRaw;
  if (
    typeof mod.summarizeLegacyRunBackfill !== "function"
    || typeof mod.listLegacyRunBackfillCandidates !== "function"
    || typeof mod.backfillLegacyRuns !== "function"
  ) {
    throw new Error("legacy run backfill exports not found");
  }

  const summary = await mod.summarizeLegacyRunBackfill();
  const candidates = await mod.listLegacyRunBackfillCandidates({
    limit: args.limit,
    includeOpsDoctor: args.includeOpsDoctor,
  });

  printSummary(summary, args.includeOpsDoctor);
  printCandidates(candidates);

  if (args.dryRun) return;

  if (args.confirm !== REQUIRED_CONFIRM) {
    console.error(`[planning:v2:backfill-legacy-runs] confirm mismatch (required: "${REQUIRED_CONFIRM}")`);
    process.exit(1);
  }

  const anomalies = createLegacyBackfillAnomalyCollector();
  const result = await mod.backfillLegacyRuns({
    limit: args.limit,
    includeOpsDoctor: args.includeOpsDoctor,
    recordBackfillAnomaly: anomalies.record,
  });

  console.log("[planning:v2:backfill-legacy-runs] apply");
  console.log(`- selected=${result.selected}`);
  console.log(`- migrated=${result.migrated}`);
  console.log(`- skipped=${result.skipped}`);
  console.log(`- failed=${result.failed}`);
  printAnomalySummary(anomalies.events);
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(`[planning:v2:backfill-legacy-runs] FAIL\n${message}`);
  process.exit(1);
});
