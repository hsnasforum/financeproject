import "dotenv/config";
import { runGov24SnapshotSync } from "../src/lib/gov24/syncRunner";

async function main() {
  const result = await runGov24SnapshotSync({
    scanPages: "auto",
    rows: 200,
    limit: 100_000,
    maxMatches: 200_000,
  });

  if (!result.ok) {
    console.error(`[gov24:sync] failed: ${result.error.code} ${result.error.message}`);
    process.exitCode = 1;
    return;
  }

  const m = result.meta;
  console.log("[gov24:sync] done");
  console.log(`- uniqueCount: ${m.uniqueCount ?? "?"}`);
  console.log(`- upstreamTotalCount: ${m.upstreamTotalCount ?? "?"}`);
  console.log(`- completionRate: ${typeof m.completionRate === "number" ? `${(m.completionRate * 100).toFixed(1)}%` : "?"}`);
  console.log(`- pagesFetched: ${m.pagesFetched ?? "?"}`);
  console.log(`- effectiveMaxPages: ${m.effectiveMaxPages ?? "?"}`);
}

void main();

