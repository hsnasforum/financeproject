#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import Database from "better-sqlite3";

const root = process.cwd();

function loadEnvFiles() {
  for (const name of [".env.local", "env.local", ".env"]) {
    const filePath = path.join(root, name);
    if (!fs.existsSync(filePath)) continue;
    dotenv.config({ path: filePath, override: false, quiet: true });
  }
}

function printStatus(level, title, detail) {
  const normalized = level.toUpperCase();
  const body = detail ? ` - ${detail}` : "";
  console.log(`${normalized} | ${title}${body}`);
}

function resolveSqlitePath(databaseUrl) {
  if (!databaseUrl || typeof databaseUrl !== "string") return null;
  if (!databaseUrl.startsWith("file:")) return null;

  let rest = databaseUrl.slice("file:".length);
  const q = rest.indexOf("?");
  if (q >= 0) rest = rest.slice(0, q);
  const hash = rest.indexOf("#");
  if (hash >= 0) rest = rest.slice(0, hash);

  if (!rest) return null;
  if (rest === ":memory:") return ":memory:";

  if (rest.startsWith("//")) {
    rest = rest.slice(2);
    return path.resolve("/", decodeURIComponent(rest));
  }

  return path.isAbsolute(rest) ? decodeURIComponent(rest) : path.resolve(root, decodeURIComponent(rest));
}

function main() {
  loadEnvFiles();

  let fail = 0;
  let warn = 0;

  const snapshotPath = path.join(root, ".data", "finlife_deposit_snapshot.json");
  if (fs.existsSync(snapshotPath)) {
    printStatus("OK", "FINLIFE snapshot", ".data/finlife_deposit_snapshot.json");
  } else {
    fail += 1;
    printStatus("FAIL", "FINLIFE snapshot", "missing .data/finlife_deposit_snapshot.json");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail += 1;
    printStatus("FAIL", "DATABASE_URL", "missing (.env.local 에 DATABASE_URL=file:./prisma/dev.db 설정)");
  } else {
    printStatus("OK", "DATABASE_URL", databaseUrl);
  }

  if (databaseUrl) {
    const sqlitePath = resolveSqlitePath(databaseUrl);
    if (!sqlitePath) {
      fail += 1;
      printStatus("FAIL", "DB URL parse", `unsupported DATABASE_URL: ${databaseUrl}`);
    } else if (sqlitePath === ":memory:") {
      warn += 1;
      printStatus("WARN", "DB path", "DATABASE_URL=file::memory: 은 오프라인 재현용으로 비권장");
    } else {
      if (fs.existsSync(sqlitePath)) {
        printStatus("OK", "DB file", sqlitePath);
      } else {
        warn += 1;
        printStatus("WARN", "DB file", `not found: ${sqlitePath} (pnpm prisma db push 필요)`);
      }

      let db;
      try {
        db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
        const row = db.prepare('SELECT COUNT(*) AS cnt FROM "Product"').get();
        const count = Number(row?.cnt ?? 0);
        if (Number.isFinite(count) && count > 0) {
          printStatus("OK", "Product rows", String(count));
        } else {
          warn += 1;
          printStatus("WARN", "Product rows", "0 (pnpm seed:debug 실행 권장)");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        fail += 1;
        printStatus("FAIL", "DB query", `${message} (pnpm prisma db push 후 재시도)`);
      } finally {
        if (db) db.close();
      }
    }
  }

  if (process.env.FINLIFE_REPLAY === "1") {
    printStatus("OK", "FINLIFE_REPLAY", "1");
  } else {
    warn += 1;
    printStatus("WARN", "FINLIFE_REPLAY", `${process.env.FINLIFE_REPLAY ?? "(unset)"} (오프라인 재현은 1 권장)`);
  }

  console.log(`\nSummary: FAIL ${fail} / WARN ${warn}`);
  if (fail > 0) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "offline doctor failed";
  printStatus("FAIL", "offline:doctor", message);
  process.exit(1);
}
