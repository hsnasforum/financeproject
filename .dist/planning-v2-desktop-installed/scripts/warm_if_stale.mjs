#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DAY_MS = 24 * 60 * 60 * 1000;
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, ".data");

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

function runStep(name, cmd, args) {
  console.log(`[warm] ${name}: ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
  });
  return result.status === 0;
}

function parseExchangeAsOf(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (!first || typeof first !== "object") return null;
  const date = first.deal_bas_dt ?? first.dealBasDt ?? first.asOf;
  if (typeof date !== "string") return null;
  const digits = date.replace(/[^0-9]/g, "");
  if (/^\d{8}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return null;
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

async function warmExchangeSnapshot() {
  const apiKey = (process.env.EXIM_EXCHANGE_API_KEY ?? "").trim();
  const baseUrl = (process.env.EXIM_EXCHANGE_API_URL ?? "").trim();
  if (!apiKey || !baseUrl) {
    console.log("[warm] exchange: skipped (EXIM env missing)");
    return true;
  }

  const keyParam = (process.env.EXIM_EXCHANGE_KEY_PARAM ?? "authkey").trim() || "authkey";
  const dataParam = (process.env.EXIM_EXCHANGE_DATA ?? "AP01").trim() || "AP01";
  const date = todayKstYYYYMMDD();

  const url = new URL(baseUrl);
  url.searchParams.set(keyParam, apiKey);
  url.searchParams.set("data", dataParam);
  url.searchParams.set("searchdate", date);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      console.log(`[warm] exchange: failed (${res.status})`);
      return false;
    }
    const text = await res.text();
    const raw = JSON.parse(text);

    const snapshot = {
      generatedAt: new Date().toISOString(),
      asOf: parseExchangeAsOf(raw),
      rowCount: Array.isArray(raw) ? raw.length : 0,
    };

    fs.mkdirSync(DATA_DIR, { recursive: true });
    const filePath = path.join(DATA_DIR, "exchange_snapshot.json");
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf8");
    console.log(`[warm] exchange: wrote ${path.relative(ROOT, filePath)}`);
    return true;
  } catch (error) {
    console.log(`[warm] exchange: failed (${error instanceof Error ? error.message : "unknown"})`);
    return false;
  }
}

async function main() {
  const offline = process.argv.includes("--offline");

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

  if (finlifeStale) {
    ok = runStep("finlife", "pnpm", ["finlife:sync:if-stale"]) && ok;
  } else {
    console.log("[warm] finlife: fresh, skip");
  }

  if (gov24Stale || benefitsStale) {
    ok = runStep("gov24/benefits", "pnpm", ["gov24:sync:if-stale"]) && ok;
  } else {
    console.log("[warm] gov24/benefits: fresh, skip");
  }

  if (exchangeStale) {
    if (offline) {
      console.log("[warm] exchange: stale but offline mode, skip");
    } else {
      ok = (await warmExchangeSnapshot()) && ok;
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
