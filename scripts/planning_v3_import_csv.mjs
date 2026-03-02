import fs from "node:fs/promises";
import path from "node:path";
import { tsImport } from "tsx/esm/api";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function loadTsModule(modulePath) {
  const raw = await tsImport(modulePath, { parentURL: import.meta.url });
  return raw?.default && typeof raw.default === "object" ? raw.default : raw;
}

function resolveCsvPath(argv) {
  const candidate = argv.find((arg) => !arg.startsWith("-"));
  return asString(candidate);
}

async function main() {
  const csvArg = resolveCsvPath(process.argv.slice(2));
  if (!csvArg) {
    process.stderr.write("Usage: pnpm planning:v3:import:csv -- <csv-path>\n");
    process.exit(1);
    return;
  }

  const csvPath = path.resolve(process.cwd(), csvArg);
  const csvText = await fs.readFile(csvPath, "utf-8");
  const [{ CsvAccountSourceProvider }, service] = await Promise.all([
    loadTsModule("../src/lib/planning/v3/providers/csvAccountSourceProvider.ts"),
    loadTsModule("../src/lib/planning/v3/service/buildCashflowFromTransactions.ts"),
  ]);

  const provider = new CsvAccountSourceProvider();
  const transactions = await provider.loadTransactions({
    csvText,
    mapping: {
      dateColumn: "date",
      amountColumn: "amount",
      descColumn: "description",
      typeColumn: "type",
      categoryColumn: "category",
    },
    hasHeader: true,
  });
  const cashflow = service.buildCashflowFromTransactions(transactions);
  const draft = service.buildProfileDraftFromCashflow(cashflow);

  process.stdout.write(`${JSON.stringify({
    source: "csv",
    file: csvPath,
    transactionsCount: transactions.length,
    months: cashflow.length,
    draft,
  }, null, 2)}\n`);
}

main().catch((error) => {
  const message = asString(error instanceof Error ? error.message : String(error));
  process.stderr.write(`[planning:v3:import:csv] failed ${message || "unknown error"}\n`);
  process.exit(1);
});
