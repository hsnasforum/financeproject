import path from "node:path";
import * as cleanupModule from "../src/lib/maintenance/cleanup.ts";

async function main() {
  const runCleanup = typeof cleanupModule?.runCleanup === "function"
    ? cleanupModule.runCleanup
    : typeof cleanupModule?.default?.runCleanup === "function"
      ? cleanupModule.default.runCleanup
      : null;

  if (typeof runCleanup !== "function") {
    const keys = cleanupModule && typeof cleanupModule === "object" ? Object.keys(cleanupModule) : [];
    throw new Error(`runCleanup export not found (keys: ${keys.join(", ") || "-"})`);
  }

  const result = runCleanup({ now: new Date(), cwd: process.cwd() });
  const report = result.report;
  const reportPath = path.join(process.cwd(), "tmp", "cleanup_report.json");

  console.log(`[cleanup] ok=${result.ok ? "Y" : "N"}`);
  console.log(`[cleanup] summary removed=${report.summary.removed} truncated=${report.summary.truncated} kept=${report.summary.kept} skipped=${report.summary.skipped} errors=${report.summary.errors}`);
  for (const target of report.targets) {
    console.log(`[cleanup] - ${target.target}: ${target.status}`);
  }
  console.log(`[cleanup] report: ${reportPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[cleanup] failed: ${message}`);
  process.exit(1);
});
