import "dotenv/config";
import { parseProbeCandidates, probeFinlifeGroups } from "../src/lib/finlife/probeGroups";

async function main() {
  const candidates = parseProbeCandidates(process.env.FINLIFE_PROBE_GROUP_CANDIDATES);
  const result = await probeFinlifeGroups(candidates);

  console.log(`[finlife:probe] candidates=${candidates.length}`);
  console.log(`[finlife:probe] deposit validGroups=${result.validByKind.deposit.join(",") || "(none)"}`);
  console.log(`[finlife:probe] saving validGroups=${result.validByKind.saving.join(",") || "(none)"}`);
  console.log(`[finlife:probe] deposit counts=${JSON.stringify(result.countsByKindAndGroup.deposit)}`);
  console.log(`[finlife:probe] saving counts=${JSON.stringify(result.countsByKindAndGroup.saving)}`);

  if (result.failures.length > 0) {
    const grouped = result.failures.reduce<Record<string, number>>((acc, row) => {
      const key = `${row.kind}:${row.status ?? "ERR"}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`[finlife:probe] failures=${JSON.stringify(grouped)}`);
  }

  const recommended = result.recommendedGroups.join(",");
  console.log(`Recommended FINLIFE_TOPFIN_GRP_LIST=${recommended}`);

  if (result.recommendedGroups.length === 0) {
    process.exitCode = 2;
  }
}

void main();
