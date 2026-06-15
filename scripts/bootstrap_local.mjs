import { runPnpmSync } from "./pnpm_runner.mjs";

const steps = [
  ["deps:approve-builds"],
  ["rebuild"],
  ["prisma:generate"],
  ["prisma", "db", "push"],
  ["products:sync"],
];

function run(args) {
  console.log(`[bootstrap:local] run: pnpm ${args.join(" ")}`);
  const result = runPnpmSync(args, {
    stdio: "inherit",
    env: {
      ...process.env,
      CI: process.env.CI ?? "true",
    },
  });

  if ((result.status ?? 1) !== 0) {
    console.error(`[bootstrap:local] failed at: pnpm ${args.join(" ")}`);
    console.error("[bootstrap:local] 점검: .env.local의 DATABASE_URL/FINLIFE_API_KEY/KDB_DATAGO_SERVICE_KEY 설정");
    process.exit(result.status ?? 1);
  }
}

for (const args of steps) {
  run(args);
}

console.log("[bootstrap:local] done");
