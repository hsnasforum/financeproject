import "dotenv/config";
import { loadFinlifeSnapshot } from "../src/lib/finlife/snapshot";
import { shouldRunFinlifeSync } from "../src/lib/finlife/syncPolicy";
import { runFinlifeSnapshotSync } from "../src/lib/finlife/syncRunner";

function parseTtlMs(): number {
  const sec = Number(process.env.FINLIFE_SNAPSHOT_TTL_SECONDS ?? "43200");
  if (!Number.isFinite(sec)) return 12 * 60 * 60 * 1000;
  return Math.max(60, Math.trunc(sec)) * 1000;
}

async function main() {
  const ttlMs = parseTtlMs();
  const kinds: Array<"deposit" | "saving"> = ["deposit", "saving"];

  for (const kind of kinds) {
    const snap = loadFinlifeSnapshot(kind);
    const decision = shouldRunFinlifeSync(snap?.meta ?? null, Date.now(), { ttlMs, minCompletionRate: 0.95 });
    if (!decision.shouldRun) {
      console.log(`[finlife:sync:if-stale] ${kind} fresh snapshot, skip`);
      continue;
    }

    console.log(`[finlife:sync:if-stale] ${kind} run sync (${decision.reason})`);
    const result = await runFinlifeSnapshotSync(kind);
    if (!result.ok) {
      console.error(`[finlife:sync:if-stale] ${kind} failed: ${result.error.code} ${result.error.message}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`[finlife:sync:if-stale] ${kind} done`);
  }
}

void main();
