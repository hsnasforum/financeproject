import { runSyncKinds } from "./finlife_sync.mjs";
import { parsePositiveInt, readSnapshot, runShouldSync } from "./finlife_cli_common.mjs";

async function main() {
  const ttlMs = parsePositiveInt(process.env.FINLIFE_SNAPSHOT_TTL_SECONDS, 43_200, 60, 7 * 24 * 60 * 60) * 1000;

  const kinds = ["deposit", "saving"];
  const needs = [];
  for (const kind of kinds) {
    const snap = readSnapshot(kind);
    const shouldRun = runShouldSync(snap?.meta ?? null, ttlMs);
    if (shouldRun) needs.push(kind);
    else console.log(`[finlife:sync:if-stale] ${kind} fresh, skip`);
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

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[finlife:sync:if-stale] failed: ${msg}`);
  process.exit(1);
});
