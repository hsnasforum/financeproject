import { tsImport } from "tsx/esm/api";

function fmt(value) {
  if (value === undefined || value === null) return "-";
  return String(value);
}

async function main() {
  const syncRaw = await tsImport("../src/lib/planning/server/assumptions/sync.ts", { parentURL: import.meta.url });
  const storageRaw = await tsImport("../src/lib/planning/server/assumptions/storage.ts", { parentURL: import.meta.url });
  const sync = syncRaw?.default && typeof syncRaw.default === "object" ? syncRaw.default : syncRaw;
  const storage = storageRaw?.default && typeof storageRaw.default === "object" ? storageRaw.default : storageRaw;
  if (typeof sync?.buildAssumptionsSnapshot !== "function") {
    throw new Error("buildAssumptionsSnapshot not available");
  }

  const assumptionsPath = typeof storage?.ASSUMPTIONS_PATH === "string"
    ? storage.ASSUMPTIONS_PATH
    : ".data/planning/assumptions.latest.json";
  const { snapshot, snapshotId } = await sync.buildAssumptionsSnapshot();
  const ecosConfigured = Boolean((process.env.BOK_ECOS_API_KEY ?? process.env.ECOS_API_KEY ?? "").trim());
  const ecosUsed = snapshot.sources.some((source) => source.name.includes("ECOS"));

  const lines = [
    "[ops:refresh-assumptions] done",
    `path=${assumptionsPath}`,
    `snapshotId=${snapshotId}`,
    `asOf=${snapshot.asOf}`,
    `fetchedAt=${snapshot.fetchedAt}`,
    `sources=${snapshot.sources.length}`,
    `warnings=${snapshot.warnings.length}`,
    `ecosConfigured=${ecosConfigured}`,
    `ecosUsed=${ecosUsed}`,
    `policyRatePct=${fmt(snapshot.korea.policyRatePct)}`,
    `baseRatePct=${fmt(snapshot.korea.baseRatePct)}`,
    `cpiYoYPct=${fmt(snapshot.korea.cpiYoYPct)}`,
  ];

  for (const warning of snapshot.warnings) {
    lines.push(`warn=${warning}`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[ops:refresh-assumptions] failed\n${message}\n`);
  process.exit(1);
});
