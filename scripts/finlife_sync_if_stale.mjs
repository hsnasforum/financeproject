import { SUPPORTED_FINLIFE_KINDS, runSyncKinds } from "./finlife_sync.mjs";
import {
  parsePositiveInt,
  readSnapshot,
  readSyncAttempt,
  runShouldSync,
} from "./finlife_cli_common.mjs";

export function evaluateFinlifeSyncNeed(kind, ttlMs, dependencies = {}) {
  const loadSnapshot = dependencies.readSnapshot ?? readSnapshot;
  const loadAttempt = dependencies.readSyncAttempt ?? readSyncAttempt;
  const attempt = loadAttempt(kind);
  if (attempt) {
    return {
      shouldRun: attempt.status === "failed",
      reason: attempt.status === "failed" ? "failed_attempt" : "running_attempt",
      attempt,
    };
  }
  const snapshot = loadSnapshot(kind);
  return {
    shouldRun: runShouldSync(snapshot?.meta ?? null, ttlMs),
    reason: "snapshot_policy",
    attempt: null,
  };
}

async function main() {
  const ttlMs = parsePositiveInt(process.env.FINLIFE_SNAPSHOT_TTL_SECONDS, 43_200, 60, 7 * 24 * 60 * 60) * 1000;

  const kinds = SUPPORTED_FINLIFE_KINDS;
  const needs = [];
  for (const kind of kinds) {
    const decision = evaluateFinlifeSyncNeed(kind, ttlMs);
    if (decision.shouldRun) {
      needs.push(kind);
      if (decision.reason === "failed_attempt") {
        console.log(`[finlife:sync:if-stale] ${kind} failed sync attempt, retry`);
      }
    } else if (decision.reason === "running_attempt") {
      console.log(`[finlife:sync:if-stale] ${kind} sync attempt running, skip`);
    } else {
      console.log(`[finlife:sync:if-stale] ${kind} fresh, skip`);
    }
  }

  if (needs.length === 0) {
    console.log("[finlife:sync:if-stale] snapshot fresh, skip");
    return;
  }

  const groupsRaw = (process.env.FINLIFE_TOPFIN_GRP_LIST || "").trim();
  if (!groupsRaw) {
    console.error("[finlife:sync:if-stale] FINLIFE_TOPFIN_GRP_LIST가 없습니다.");
    console.error("[finlife:sync:if-stale] 먼저 pnpm finlife:probe로 유효 그룹을 찾고, Recommended 값을 FINLIFE_TOPFIN_GRP_LIST에 설정하세요.");
    process.exit(2);
  }

  console.log(`[finlife:sync:if-stale] run sync for ${needs.join(",")}`);
  await runSyncKinds(needs);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[finlife:sync:if-stale] failed: ${msg}`);
    process.exit(1);
  });
}
