import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

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
  const raw = await import(new URL("../src/lib/planning/v3/indicators/cli/refresh.ts", import.meta.url).href);
  const loadedModule = raw?.default && typeof raw.default === "object" ? raw.default : raw;
  const runIndicatorsRefresh = loadedModule?.runIndicatorsRefresh;
  if (typeof runIndicatorsRefresh !== "function") {
    throw new Error("missing export planning.v3.indicators.refresh.runIndicatorsRefresh");
  }
  return runIndicatorsRefresh;
}

async function loadAlertRunner() {
  const raw = await import(new URL("../src/lib/news/alerts.ts", import.meta.url).href);
  const loadedModule = raw?.default && typeof raw.default === "object" ? raw.default : raw;
  const evaluateAndAppendAlertEvents = loadedModule?.evaluateAndAppendAlertEvents;
  if (typeof evaluateAndAppendAlertEvents !== "function") {
    throw new Error("missing export news.alerts.evaluateAndAppendAlertEvents");
  }
  return evaluateAndAppendAlertEvents;
}

async function main() {
  const cwd = process.cwd();
  loadEnvFiles(cwd);
  const args = parseArgs(process.argv.slice(2));
  const runIndicatorsRefresh = await loadRefreshRunner();
  const now = new Date();

  const result = await runIndicatorsRefresh({
    cwd,
    dry: args.dry,
    now,
  });

  console.log(`[indicators:refresh] config=${result.configSource} enabledSources=${result.enabledSourceCount} enabledSeries=${result.enabledSeriesCount}`);
  console.log(`[indicators:refresh] sources=${result.sourcesProcessed} series=${result.seriesProcessed} updated=${result.seriesUpdated} appended=${result.observationsAppended} errors=${result.errors.length}`);
  if (result.errors.length > 0) {
    console.error(`[indicators:refresh] status=partial errors=${result.errors.length} strict=${args.strict ? "Y" : "N"}`);
    console.error("[indicators:refresh] alerts=skipped reason=partial-refresh");
    for (const row of result.errors.slice(0, 20)) {
      console.error(`  - ${row.sourceId}/${row.seriesId ?? "-"} ${row.code}: ${row.message}`);
    }
    return 1;
  }

  const evaluateAndAppendAlertEvents = await loadAlertRunner();
  const alertEval = evaluateAndAppendAlertEvents({
    cwd,
    generatedAt: result.generatedAt,
    source: "indicators:refresh",
  });
  console.log(`[indicators:refresh] alerts evaluated=${alertEval.evaluated} appended=${alertEval.appended} total=${alertEval.total}`);

  return 0;
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
})();

if (isMain) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[indicators:refresh] failed: ${message}`);
    return 1;
  }).then((code) => {
    process.exit(typeof code === "number" ? code : 1);
  });
}
