import "dotenv/config";
import { runFinlifeSnapshotSync } from "../src/lib/finlife/syncRunner";

async function main() {
  const kinds: Array<"deposit" | "saving"> = ["deposit", "saving"];

  for (const kind of kinds) {
    const result = await runFinlifeSnapshotSync(kind);
    if (!result.ok) {
      console.error(`[finlife:sync] ${kind} failed: ${result.error.code} ${result.error.message}${result.error.upstreamStatus ? ` (${result.error.upstreamStatus})` : ""}`);
      process.exitCode = 1;
      continue;
    }

    const m = result.meta;
    console.log(`[finlife:sync] ${kind} done`);
    console.log(`- source: ${m.source}`);
    console.log(`- groupsScanned: ${m.groupsScanned.join(",")}`);
    console.log(`- totalProducts: ${m.totalProducts}`);
    console.log(`- totalOptions: ${m.totalOptions}`);
    console.log(`- completionRate: ${(m.completionRate * 100).toFixed(1)}%`);
    console.log(`- truncatedByHardCap: ${m.truncatedByHardCap}`);
    console.log(`- fallbackUsed: ${Boolean(m.fallbackUsed)}`);
  }
}

void main();
