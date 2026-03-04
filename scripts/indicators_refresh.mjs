import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { tsImport } from "tsx/esm/api";

function loadEnvFiles(cwd = process.cwd()) {
  for (const name of [".env.local", "env.local", ".env"]) {
    const filePath = path.join(cwd, name);
    if (!fs.existsSync(filePath)) continue;
    dotenv.config({ path: filePath, override: false, quiet: true });
  }
}

function parseArgs(argv) {
  return {
    dry: argv.includes("--dry"),
    strict: argv.includes("--strict"),
  };
}

async function loadRefreshRunner() {
  const raw = await tsImport("../src/lib/indicators/refresh.ts", { parentURL: import.meta.url });
  const runIndicatorsRefresh = raw?.runIndicatorsRefresh;
  if (typeof runIndicatorsRefresh !== "function") {
    throw new Error("missing export indicators.refresh.runIndicatorsRefresh");
  }
  return runIndicatorsRefresh;
}

async function main() {
  const cwd = process.cwd();
  loadEnvFiles(cwd);
  const args = parseArgs(process.argv.slice(2));
  const runIndicatorsRefresh = await loadRefreshRunner();

  const result = await runIndicatorsRefresh({
    cwd,
    dry: args.dry,
  });

  console.log(`[indicators:refresh] sources=${result.sourcesProcessed} series=${result.seriesProcessed} updated=${result.seriesUpdated} appended=${result.observationsAppended} errors=${result.errors.length}`);
  if (result.errors.length > 0) {
    for (const row of result.errors.slice(0, 20)) {
      console.error(`  - ${row.sourceId}/${row.seriesId ?? "-"} ${row.code}: ${row.message}`);
    }
  }

  if (args.strict && result.errors.length > 0) {
    return 1;
  }
  return 0;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[indicators:refresh] failed: ${message}`);
  return 1;
}).then((code) => {
  process.exit(typeof code === "number" ? code : 1);
});
