import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const STORE_DIR = "./.pnpm-store";

function printUsage() {
  console.log("Usage: node scripts/deps_offline.mjs <fetch|install> [pnpm args...] [--build-from-source]");
}

function runPnpm(args, extraEnv = {}) {
  const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(pnpmBin, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      CI: process.env.CI ?? "true",
      ...extraEnv,
    },
  });

  if (typeof result.status === "number") process.exit(result.status);
  process.exit(1);
}

function main() {
  const [, , command, ...rest] = process.argv;
  const buildFromSource = rest.includes("--build-from-source");
  const passthroughArgs = rest.filter((arg) => arg !== "--build-from-source");

  if (!command || (command !== "fetch" && command !== "install")) {
    printUsage();
    process.exit(1);
  }

  if (command === "fetch") {
    console.log(`[deps:offline] mode=fetch store=${STORE_DIR} extra=${passthroughArgs.join(" ") || "-"}`);
    runPnpm(["fetch", "--store-dir", STORE_DIR, ...passthroughArgs]);
  }

  if (!existsSync(STORE_DIR)) {
    console.error(`[deps:offline] store not found: ${STORE_DIR}`);
    console.error('[deps:offline] 온라인 환경에서 먼저 "pnpm deps:offline:fetch"를 실행해 store를 준비하세요.');
    process.exit(2);
  }

  const env = buildFromSource
    ? { npm_config_build_from_source: "better-sqlite3" }
    : {};

  console.log(
    `[deps:offline] mode=install store=${STORE_DIR} build_from_source=${buildFromSource ? "on" : "off"} extra=${passthroughArgs.join(" ") || "-"}`,
  );
  runPnpm(["install", "--offline", "--frozen-lockfile", "--store-dir", STORE_DIR, ...passthroughArgs], env);
}

main();
