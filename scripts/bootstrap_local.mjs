import { spawnSync } from "node:child_process";

const steps = [
  ["pnpm", ["deps:approve-builds"]],
  ["pnpm", ["rebuild"]],
  ["pnpm", ["prisma:generate"]],
  ["pnpm", ["prisma", "db", "push"]],
  ["pnpm", ["products:sync"]],
];

function run(name, args) {
  console.log(`[bootstrap:local] run: ${name} ${args.join(" ")}`);
  const cmd = process.platform === "win32" && name === "pnpm" ? "pnpm.cmd" : name;
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      CI: process.env.CI ?? "true",
    },
  });

  if ((result.status ?? 1) !== 0) {
    console.error(`[bootstrap:local] failed at: ${name} ${args.join(" ")}`);
    console.error("[bootstrap:local] 점검: .env.local의 DATABASE_URL/FINLIFE_API_KEY/KDB_DATAGO_SERVICE_KEY 설정");
    process.exit(result.status ?? 1);
  }
}

for (const [name, args] of steps) {
  run(name, args);
}

console.log("[bootstrap:local] done");
