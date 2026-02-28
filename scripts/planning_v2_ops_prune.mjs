import { normalizeKeep, pruneOpsArtifacts } from "./planning_v2_ops_common.mjs";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const out = { keep: 50 };
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = rest.join("=");
    if (key === "keep") out.keep = normalizeKeep(value, 50);
  }
  return out;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const result = await pruneOpsArtifacts(process.cwd(), args.keep);
  console.log(
    `[planning:v2:ops:prune] keep=${result.keep} purgedReports=${result.purgedReports} purgedLogs=${result.purgedLogs} keptReports=${result.keptReports} keptLogs=${result.keptLogs}`,
  );
}

run().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[planning:v2:ops:prune] FAIL\n${message}`);
  process.exit(1);
});

