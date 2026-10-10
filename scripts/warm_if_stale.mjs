#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { runPnpmSync } from "./pnpm_runner.mjs";
import { normalizeExchangeQuoteDate, validateEximExchangeRows } from "../src/lib/publicApis/providers/exchangeNormalization.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, ".data");

for (const name of [".env.local", "env.local", ".env"]) {
  const filePath = path.join(ROOT, name);
  if (!fs.existsSync(filePath)) continue;
  dotenv.config({ path: filePath, override: false, quiet: true });
}

const POLICY = {
  finlife: { maxAgeDays: 1 },
  gov24: { maxAgeDays: 1 },
  benefits: { maxAgeDays: 2 },
  exchange: { maxAgeDays: 1 },
};

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readGeneratedAt(filePath) {
  const payload = readJson(filePath);
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.generatedAt === "string") return payload.generatedAt;
  if (payload.meta && typeof payload.meta.generatedAt === "string") return payload.meta.generatedAt;
  return null;
}

function isStaleByFile(filePath, maxAgeDays) {
  const generatedAt = readGeneratedAt(filePath);
  if (!generatedAt) return true;
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedMs)) return true;
  const ageMs = Date.now() - generatedMs;
  return ageMs > maxAgeDays * DAY_MS;
}

function runStep(name, args) {
  console.log(`[warm] ${name}: pnpm ${args.join(" ")}`);
  const result = runPnpmSync(args, {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
  });
  return result.status === 0;
}

function todayKstYYYYMMDD() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}${m}${d}`;
}

async function warmExchangeSnapshot(date) {
  const apiKey = (process.env.EXIM_EXCHANGE_API_KEY ?? "").trim();
  const baseUrl = (process.env.EXIM_EXCHANGE_API_URL ?? "").trim();
  if (!apiKey || !baseUrl) {
    console.log("[warm] exchange: skipped (EXIM env missing)");
    return true;
  }

  const keyParam = (process.env.EXIM_EXCHANGE_KEY_PARAM ?? "authkey").trim() || "authkey";
  const dataParam = (process.env.EXIM_EXCHANGE_DATA ?? "AP01").trim() || "AP01";
  if (dataParam !== "AP01") {
    console.log("[warm] exchange: failed (EXIM_EXCHANGE_DATA must be AP01)");
    return false;
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set(keyParam, apiKey);
    url.searchParams.set("data", dataParam);
    url.searchParams.set("searchdate", date);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      console.log(`[warm] exchange: failed (${res.status})`);
      return false;
    }
    const text = await res.text();
    const raw = JSON.parse(text);
    const validated = validateEximExchangeRows(raw, { requestedDate: date });
    if (!validated) {
      console.log("[warm] exchange: failed (invalid quotes or source date)");
      return false;
    }

    const snapshot = {
      generatedAt: new Date().toISOString(),
      asOf: validated.asOf,
      rowCount: validated.rowCount,
    };

    fs.mkdirSync(DATA_DIR, { recursive: true });
    const filePath = path.join(DATA_DIR, "exchange_snapshot.json");
    const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(snapshot, null, 2), { encoding: "utf8", flag: "wx" });
      fs.renameSync(tempPath, filePath);
    } finally {
      try { fs.rmSync(tempPath, { force: true }); } catch {
        // Cleanup must not hide the original write/rename failure.
      }
    }
    console.log(`[warm] exchange: wrote ${path.relative(ROOT, filePath)}`);
    return true;
  } catch {
    console.log("[warm] exchange: failed (request or response error)");
    return false;
  }
}

async function main() {
  const offline = process.argv.includes("--offline");
  const exchangeOnly = process.argv.includes("--exchange-only");
  // Explicit historical dates must come from a verified source; never guess a business day.
  const dateArgs = process.argv.slice(2).filter((arg) => arg === "--exchange-date" || arg.startsWith("--exchange-date="));
  const explicitDate = dateArgs[0]?.slice("--exchange-date=".length);
  const requestDate = explicitDate ?? todayKstYYYYMMDD();
  if (dateArgs.length > 1 || !/^\d{8}$/.test(requestDate)
    || !normalizeExchangeQuoteDate(requestDate) || requestDate > todayKstYYYYMMDD()) {
    console.log("[warm] exchange: failed (exchange-date must be a valid nonfuture YYYYMMDD)");
    process.exitCode = 1;
    return;
  }


  const finlifeDepositPath = path.join(DATA_DIR, "finlife_deposit_snapshot.json");
  const finlifeSavingPath = path.join(DATA_DIR, "finlife_saving_snapshot.json");
  const gov24SnapshotPath = path.join(DATA_DIR, "benefits_snapshot.json");
  const exchangeSnapshotPath = path.join(DATA_DIR, "exchange_snapshot.json");

  const finlifeStale =
    isStaleByFile(finlifeDepositPath, POLICY.finlife.maxAgeDays)
    || isStaleByFile(finlifeSavingPath, POLICY.finlife.maxAgeDays);
  const gov24Stale = isStaleByFile(gov24SnapshotPath, POLICY.gov24.maxAgeDays);
  const benefitsStale = isStaleByFile(gov24SnapshotPath, POLICY.benefits.maxAgeDays);
  const exchangeStale = isStaleByFile(exchangeSnapshotPath, POLICY.exchange.maxAgeDays);

  let ok = true;

  if (exchangeOnly) {
    console.log("[warm] finlife and gov24/benefits: covered by canonical daily steps, skip");
  } else {
    if (finlifeStale) {
      ok = runStep("finlife", ["finlife:sync:if-stale"]) && ok;
    } else {
      console.log("[warm] finlife: fresh, skip");
    }

    if (gov24Stale || benefitsStale) {
      ok = runStep("gov24/benefits", ["gov24:sync:if-stale"]) && ok;
    } else {
      console.log("[warm] gov24/benefits: fresh, skip");
    }
  }

  if (exchangeStale || explicitDate !== undefined) {
    if (offline) {
      console.log("[warm] exchange: stale but offline mode, skip");
    } else {
      ok = (await warmExchangeSnapshot(requestDate)) && ok;
    }
  } else {
    console.log("[warm] exchange: fresh, skip");
  }

  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error("[warm] failed", error);
  process.exit(1);
});
