import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

function loadEnvFiles() {
  for (const name of [".env.local", "env.local", ".env"]) {
    const filePath = path.join(process.cwd(), name);
    if (!fs.existsSync(filePath)) continue;
    dotenv.config({ path: filePath, override: false, quiet: true });
  }
}

function runStep(label, args) {
  console.log(`[seed:debug] ${label}`);
  const bin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(bin, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    const code = typeof result.status === "number" ? result.status : 1;
    throw new Error(`step failed: ${label} (exit ${code})`);
  }
}

function main() {
  loadEnvFiles();

  const finlifeFixture = path.join("tests", "fixtures", "finlife_deposit.normalized.json");
  const kdbFixture = path.join("tests", "fixtures", "kdb-deposit.sample.xml");
  const hasFinlifeFixture = fs.existsSync(path.join(process.cwd(), finlifeFixture));
  const hasKdbFixture = fs.existsSync(path.join(process.cwd(), kdbFixture));

  if (hasFinlifeFixture) {
    runStep("FINLIFE replay", ["finlife:sync", "--kind=deposit", `--fromFile=${finlifeFixture}`]);
  } else {
    console.log("[seed:debug] FINLIFE fixture not found. skipping FINLIFE replay.");
  }
  if (hasKdbFixture) {
    runStep("KDB replay", ["datago:sync", "--source=kdb", "--kind=deposit", `--fromFile=${kdbFixture}`]);
  } else {
    console.log("[seed:debug] KDB fixture not found. skipping KDB replay.");
  }

  console.log("\n[seed:debug] done.");
  console.log("[seed:debug] Open: /debug/unified?kind=deposit&includeSources=finlife,datago_kdb");
  console.log("[seed:debug] Validate: q/qMode search, onlyNew/changedSince, single-source cursor Load more.");
  console.log("[seed:debug] Policy: cursor is single-source only, multi-source uses limit + q.");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "seed failed";
  console.error(`[seed:debug] ${message}`);
  process.exit(1);
}
