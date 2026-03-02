import "dotenv/config";
import { getSnapshotOrNull } from "../src/lib/publicApis/benefitsSnapshot";
import { shouldRunGov24Sync } from "../src/lib/gov24/syncPolicy";
import { runGov24SnapshotSync } from "../src/lib/gov24/syncRunner";

async function main() {
  const ttlMs = 24 * 60 * 60 * 1000;
  const snap = getSnapshotOrNull({ ttlMs });
  const decision = shouldRunGov24Sync(snap?.snapshot.meta ?? null, Date.now(), {
    ttlMs,
    minCompletionRate: 0.95,
  });

  if (!decision.shouldRun) {
    console.log("[gov24:sync:if-stale] fresh snapshot, skip");
    return;
  }

  console.log(`[gov24:sync:if-stale] run sync (${decision.reason})`);
  const result = await runGov24SnapshotSync({
    scanPages: "auto",
    rows: 200,
    limit: 100_000,
    maxMatches: 200_000,
  });
  if (!result.ok) {
    console.error(`[gov24:sync:if-stale] failed: ${result.error.code} ${result.error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log("[gov24:sync:if-stale] done");
}

void main();

