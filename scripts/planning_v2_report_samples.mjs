import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const FIXTURE_DIR = path.join(ROOT, "tests", "planning-v2", "report", "fixtures");
const OUTPUT_DIR = path.join(ROOT, ".data", "planning", "reports", "samples");

const FIXTURES = [
  { name: "dto-ok", title: "Planning v2 Sample Report - OK" },
  { name: "dto-warn", title: "Planning v2 Sample Report - WARN" },
  { name: "dto-risk", title: "Planning v2 Sample Report - RISK" },
];

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const { renderHtmlReport } = await import("../src/lib/planning/v2/report/htmlReport.ts");
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const fixture of FIXTURES) {
    const dtoPath = path.join(FIXTURE_DIR, `${fixture.name}.json`);
    const dto = await readJson(dtoPath);
    const html = renderHtmlReport(dto, { title: fixture.title });
    const htmlPath = path.join(OUTPUT_DIR, `${fixture.name}.html`);
    await fs.writeFile(htmlPath, html, "utf8");
  }

  console.log(path.relative(ROOT, OUTPUT_DIR));
}

main().catch((error) => {
  console.error("[planning:v2:report:samples] failed", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
