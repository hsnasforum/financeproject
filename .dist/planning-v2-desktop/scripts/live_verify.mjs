import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

for (const name of [".env.local", "env.local", ".env"]) {
  const filePath = path.join(process.cwd(), name);
  if (!fs.existsSync(filePath)) continue;
  dotenv.config({ path: filePath, override: false, quiet: true });
}

const require = createRequire(import.meta.url);

function parseMode(argv) {
  const token = argv.find((v) => v.startsWith("--mode="));
  const raw = token ? token.slice("--mode=".length).trim().toLowerCase() : "smoke";
  return raw === "full" ? "full" : "smoke";
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function nowStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}${m}${day}-${h}${min}${s}`;
}

function runStep(step) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  console.log(`[live:verify] ${step.name} ...`);
  const bin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const res = spawnSync(bin, step.args, {
    stdio: "inherit",
    env: process.env,
  });
  const durationMs = Date.now() - t0;
  const exitCode = typeof res.status === "number" ? res.status : 1;
  const finishedAt = new Date().toISOString();
  console.log(`[live:verify] ${step.name} ${exitCode === 0 ? "ok" : "failed"} (${durationMs}ms)`);
  return {
    name: step.name,
    args: step.args,
    startedAt,
    finishedAt,
    durationMs,
    exitCode,
    ok: exitCode === 0,
  };
}

async function getPrismaClient() {
  const [{ PrismaClient }, adapterPkg] = await Promise.all([
    import("@prisma/client"),
    Promise.resolve(require("@prisma/adapter-better-sqlite3")),
  ]);
  const Adapter = adapterPkg.PrismaBetterSqlite3 ?? adapterPkg.PrismaBetterSQLite3;
  if (!Adapter) throw new Error("Prisma SQLite adapter not found");
  return new PrismaClient({
    adapter: new Adapter({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
    log: ["error"],
  });
}

async function readCounts(prisma) {
  const [productCount, productOptionCount, externalProductTotal, snapshots, externalBySourceRows] = await Promise.all([
    prisma.product.count(),
    prisma.productOption.count(),
    prisma.externalProduct.count(),
    prisma.externalSourceSnapshot.findMany({
      select: { sourceId: true, kind: true, lastSyncedAt: true },
    }),
    prisma.externalProduct.groupBy({
      by: ["sourceId", "kind"],
      _count: { _all: true },
    }),
  ]);
  const externalBySource = externalBySourceRows.map((row) => ({
    sourceId: row.sourceId,
    kind: row.kind,
    count: row._count._all,
  }));
  return {
    productCount,
    productOptionCount,
    externalProductTotal,
    externalBySource,
    snapshots: snapshots.map((s) => ({
      sourceId: s.sourceId,
      kind: s.kind,
      lastSyncedAt: s.lastSyncedAt.toISOString(),
    })),
  };
}

function countDelta(before, after) {
  return {
    productCount: after.productCount - before.productCount,
    productOptionCount: after.productOptionCount - before.productOptionCount,
    externalProductTotal: after.externalProductTotal - before.externalProductTotal,
  };
}

function buildSteps(mode) {
  if (mode === "full") {
    return [
      { name: "FINLIFE deposit full", args: ["finlife:sync", "--kind=deposit"] },
      { name: "FINLIFE saving full", args: ["finlife:sync", "--kind=saving"] },
      { name: "DATAGO KDB full", args: ["datago:sync", "--source=kdb", "--kind=deposit"] },
    ];
  }
  const to = ymd(new Date());
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 7);
  const from = ymd(fromDate);
  return [
    { name: "FINLIFE deposit smoke", args: ["finlife:sync", "--kind=deposit", "--maxPages=1", "--pageSize=20"] },
    { name: "FINLIFE saving smoke", args: ["finlife:sync", "--kind=saving", "--maxPages=1", "--pageSize=20"] },
    { name: "DATAGO KDB smoke", args: ["datago:sync", "--source=kdb", "--kind=deposit", "--maxPages=1", "--numOfRows=20", `--from=${from}`, `--to=${to}`] },
  ];
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const prisma = await getPrismaClient();
  try {
    const countsBefore = await readCounts(prisma);
    const steps = buildSteps(mode);
    const stepResults = [];
    for (const step of steps) {
      stepResults.push(runStep(step));
    }
    const countsAfter = await readCounts(prisma);
    const finishedAt = new Date().toISOString();
    const report = {
      mode,
      startedAt,
      finishedAt,
      steps: stepResults,
      countsBefore,
      countsAfter,
      delta: countDelta(countsBefore, countsAfter),
    };
    fs.mkdirSync(path.join(process.cwd(), "artifacts"), { recursive: true });
    const outPath = path.join(process.cwd(), "artifacts", `live-verify-${nowStamp()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
    console.log(`[live:verify] report: ${path.relative(process.cwd(), outPath)}`);
    console.log(`[live:verify] delta product=${report.delta.productCount}, option=${report.delta.productOptionCount}, external=${report.delta.externalProductTotal}`);
    if (stepResults.some((s) => !s.ok)) {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[live:verify] failed: ${message}`);
  process.exit(1);
});
