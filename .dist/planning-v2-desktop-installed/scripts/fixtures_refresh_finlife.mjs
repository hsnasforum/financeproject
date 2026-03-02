import fs from "node:fs";
import path from "node:path";
import { FINLIFE_DUMP_SCHEMA_VERSION, readDumpFile } from "./finlife_dump_utils.mjs";

function parseArgs(argv) {
  const out = { kind: "deposit", take: 10, from: "" };
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [k, v = ""] = token.slice(2).split("=");
    if (k === "kind" && ["deposit", "saving"].includes(v)) out.kind = v;
    if (k === "take") {
      const n = Number(v);
      if (Number.isInteger(n) && n > 0) out.take = n;
    }
    if (k === "from" && v) out.from = v;
  }
  return out;
}

function pickInputFile(kind, from) {
  if (from) return path.isAbsolute(from) ? from : path.join(process.cwd(), from);
  const artifactsDir = path.join(process.cwd(), "artifacts");
  const candidates = [
    path.join(artifactsDir, `finlife_${kind}.normalized.v${FINLIFE_DUMP_SCHEMA_VERSION}.json`),
    path.join(artifactsDir, `finlife_${kind}.normalized.v${FINLIFE_DUMP_SCHEMA_VERSION}.json.gz`),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputFile = pickInputFile(args.kind, args.from);
  if (!inputFile) {
    console.error('[fixtures:refresh:finlife] dump not found. run "pnpm finlife:sync --kind=deposit --inspect" first.');
    process.exit(2);
  }

  const loaded = readDumpFile(inputFile);
  const products = Array.isArray(loaded.payload.products) ? loaded.payload.products : [];
  const sampled = products.slice(0, args.take);
  const optionCount = sampled.reduce((sum, row) => sum + (Array.isArray(row.options) ? row.options.length : 0), 0);
  const output = {
    schemaVersion: loaded.payload.schemaVersion ?? FINLIFE_DUMP_SCHEMA_VERSION,
    meta: {
      dumpedAt: new Date().toISOString(),
      kind: args.kind,
      source: "finlife_sync_normalized_dump",
      productCount: sampled.length,
      optionCount,
      fixtureNote: "sampled from dump",
    },
    products: sampled,
  };

  const outPath = path.join(process.cwd(), "tests", "fixtures", `finlife_${args.kind}.normalized.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output), "utf-8");

  console.log("[fixtures:refresh:finlife] done");
  console.log(`- input: ${path.relative(process.cwd(), inputFile)}`);
  console.log(`- output: ${path.relative(process.cwd(), outPath)}`);
  console.log(`- productCount: ${sampled.length}`);
  console.log(`- optionCount: ${optionCount}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[fixtures:refresh:finlife] failed: ${message}`);
  process.exit(1);
}

