function parseArgs(argv) {
  return {
    strict: argv.includes("--strict"),
  };
}

function printList(label, items) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length < 1) {
    console.log(`[planning:v2:doctor] ${label}: 0`);
    return;
  }
  console.log(`[planning:v2:doctor] ${label}: ${rows.length}`);
  for (const item of rows.slice(0, 10)) {
    console.log(`  - ${String(item)}`);
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await import("../src/lib/ops/planningDoctor.ts");
  const doctor = (raw && typeof raw === "object" && raw.default && typeof raw.default === "object")
    ? raw.default
    : raw;
  if (typeof doctor.checkPlanningIntegrity !== "function") {
    throw new Error("checkPlanningIntegrity export not found");
  }
  const report = await doctor.checkPlanningIntegrity({ strict: args.strict });

  console.log(`[planning:v2:doctor] ok=${report.ok} strict=${args.strict ? "true" : "false"}`);
  console.log(
    `[planning:v2:doctor] counts profiles=${report.counts.profiles} runs=${report.counts.runs} assumptionsHistory=${report.counts.assumptionsHistory}`,
  );

  printList("missing", report.missing);
  printList("invalidJson", report.invalidJson);
  printList("optionalMissing", report.optionalMissing);
  printList("notes", report.notes);

  if (!report.ok) {
    process.exit(1);
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[planning:v2:doctor] failed\n${message}`);
  process.exit(1);
});
