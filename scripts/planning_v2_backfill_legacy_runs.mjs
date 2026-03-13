import { tsImport } from "tsx/esm/api";

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

  const result = await mod.backfillLegacyRuns({
    limit: args.limit,
    includeOpsDoctor: args.includeOpsDoctor,
  });

  console.log("[planning:v2:backfill-legacy-runs] apply");
  console.log(`- selected=${result.selected}`);
  console.log(`- migrated=${result.migrated}`);
  console.log(`- skipped=${result.skipped}`);
  console.log(`- failed=${result.failed}`);
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(`[planning:v2:backfill-legacy-runs] FAIL\n${message}`);
  process.exit(1);
});
