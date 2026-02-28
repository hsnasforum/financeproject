const { buildAssumptionsSnapshot } = await import("../src/lib/planning/assumptions/sync.ts");
const { ASSUMPTIONS_PATH } = await import("../src/lib/planning/assumptions/storage.ts");

function fmt(value) {
  if (value === undefined || value === null) return "-";
  return String(value);
}

async function main() {
  const { snapshot, snapshotId } = await buildAssumptionsSnapshot();
  const ecosUsed = snapshot.sources.some((source) => source.name.includes("ECOS KeyStatisticList"));

  const out = [
    "[planning:assumptions:sync] done",
    `path=${ASSUMPTIONS_PATH}`,
    `snapshotId=${snapshotId}`,
    `asOf=${snapshot.asOf}`,
    `fetchedAt=${snapshot.fetchedAt}`,
    `ecosConfigured=${Boolean((process.env.ECOS_API_KEY ?? process.env.BOK_ECOS_API_KEY ?? "").trim())}`,
    `ecosUsed=${ecosUsed}`,
    `policyRatePct=${fmt(snapshot.korea.policyRatePct)}`,
    `callOvernightPct=${fmt(snapshot.korea.callOvernightPct)}`,
    `cd91Pct=${fmt(snapshot.korea.cd91Pct)}`,
    `koribor3mPct=${fmt(snapshot.korea.koribor3mPct)}`,
    `msb364Pct=${fmt(snapshot.korea.msb364Pct)}`,
    `baseRatePct=${fmt(snapshot.korea.baseRatePct)}`,
    `cpiYoYPct=${fmt(snapshot.korea.cpiYoYPct)}`,
    `coreCpiYoYPct=${fmt(snapshot.korea.coreCpiYoYPct)}`,
    `newDepositAvgPct=${fmt(snapshot.korea.newDepositAvgPct)}`,
    `newLoanAvgPct=${fmt(snapshot.korea.newLoanAvgPct)}`,
    `depositOutstandingAvgPct=${fmt(snapshot.korea.depositOutstandingAvgPct)}`,
    `loanOutstandingAvgPct=${fmt(snapshot.korea.loanOutstandingAvgPct)}`,
    `sources=${snapshot.sources.length}`,
    `warnings=${snapshot.warnings.length}`,
  ];

  for (const warning of snapshot.warnings) {
    out.push(`warn=${warning}`);
  }

  process.stdout.write(`${out.join("\n")}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[planning:assumptions:sync] failed\n${message}\n`);
  process.exitCode = 1;
});
