#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import {
  FSS_PENSION_API_BASE_URL,
  FSS_PENSION_GUARANTEED_AREAS,
  FSS_PENSION_PRODUCT_AREAS,
  FSS_PENSION_SOURCE,
  FssPensionError,
  classifyFssPensionResult,
  listRecentCompletedQuarters,
  normalizeFssPensionGuaranteedRows,
  normalizeFssPensionProductRows,
} from "../src/lib/publicApis/providers/fssPension.mjs";

export const FSS_PENSION_PRODUCTS_SNAPSHOT = "fss_pension_products_snapshot.json";
export const FSS_PENSION_GUARANTEED_SNAPSHOT = "fss_pension_guaranteed_snapshot.json";
export const FSS_PENSION_SCHEMA_VERSION = 1;

const DAY_MS = 24 * 60 * 60 * 1000;
// Freshness allows 7 days; refreshing after 3 keeps a margin for a few failed daily runs.
const IF_STALE_MAX_AGE_MS = 3 * DAY_MS;
const QUARTER_CANDIDATES = 3;
const REQUEST_TIMEOUT_MS = 90_000;

async function fetchFssPension(endpoint, params, { apiKey, fetchImpl }) {
  const url = new URL(`${FSS_PENSION_API_BASE_URL}/${endpoint}.json`);
  url.searchParams.set("key", apiKey);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  const label = `${endpoint} ${Object.entries(params).map(([name, value]) => `${name}=${value}`).join(" ")}`;
  let response;
  try {
    response = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    // Never echo the request URL: it carries the key.
    throw new FssPensionError("UPSTREAM", `${label}: request failed (${error instanceof Error ? error.name : "error"})`);
  }
  if (!response.ok) throw new FssPensionError("UPSTREAM", `${label}: http ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new FssPensionError("UPSTREAM", `${label}: response is not JSON`);
  }
}

function quarterLabel({ year, quarter }) {
  return `${year}년 ${quarter}분기`;
}

/**
 * Picks the newest completed quarter (of the last three) for which every area answers 000.
 * 001 (no data) means the quarter is not published yet; any other failure stops the run.
 */
async function collectProducts({ apiKey, fetchImpl, now }) {
  const attempts = [];
  const candidates = listRecentCompletedQuarters(now, QUARTER_CANDIDATES);
  for (const [quartersBehind, candidate] of candidates.entries()) {
    const areas = [];
    let notPublished = false;
    for (const area of FSS_PENSION_PRODUCT_AREAS) {
      const payload = await fetchFssPension(
        "psProdList2",
        { year: candidate.year, quarter: candidate.quarter, areaCode: area.code },
        { apiKey, fetchImpl },
      );
      if (classifyFssPensionResult(payload).status === "no_data") {
        notPublished = true;
        attempts.push({ ...candidate, status: "not_published", areaCode: area.code });
        break;
      }
      areas.push({ area, result: normalizeFssPensionProductRows(payload, area) });
    }
    if (notPublished) continue;
    attempts.push({ ...candidate, status: "selected" });
    return { candidate, quartersBehind, attempts, areas };
  }
  throw new FssPensionError(
    "NO_DATA",
    `psProdList2: no quarter published among ${candidates.map(quarterLabel).join(", ")}`,
  );
}

async function collectGuaranteed({ apiKey, fetchImpl }) {
  const areas = [];
  for (const area of FSS_PENSION_GUARANTEED_AREAS) {
    const payload = await fetchFssPension("psGuaranteedProdList", { areaCode: area.code }, { apiKey, fetchImpl });
    areas.push({ area, result: normalizeFssPensionGuaranteedRows(payload, area) });
  }
  const months = new Set(areas.map(({ result }) => result.reportMonth));
  if (months.size !== 1) throw new FssPensionError("CONTRACT", "psGuaranteedProdList: areas report different months");
  return { reportMonth: [...months][0], areas };
}

export async function collectFssPensionSnapshots({ apiKey, fetchImpl = globalThis.fetch, now = new Date() }) {
  if (!/^[0-9A-Za-z]{32}$/.test(String(apiKey ?? ""))) {
    throw new FssPensionError("CONFIG_MISSING", "FSS_PENSION_API_KEY must be the 32-character 통합연금포털 key");
  }
  const products = await collectProducts({ apiKey, fetchImpl, now });
  const guaranteed = await collectGuaranteed({ apiKey, fetchImpl });
  const generatedAt = now.toISOString();
  const [reportYear, reportMonthNumber] = guaranteed.reportMonth.split("-");

  return {
    products: {
      schemaVersion: FSS_PENSION_SCHEMA_VERSION,
      source: { ...FSS_PENSION_SOURCE, endpoint: "psProdList2" },
      generatedAt,
      asOf: { year: products.candidate.year, quarter: products.candidate.quarter, label: quarterLabel(products.candidate) },
      selection: { attempts: products.attempts, quartersBehind: products.quartersBehind },
      areas: products.areas.map(({ area, result }) => ({
        code: area.code,
        label: area.label,
        sourceRows: result.sourceRows,
        rowCount: result.items.length,
        excludedRowsWithoutProductInfo: result.excludedRowsWithoutProductInfo,
        exactDuplicateRowsRemoved: result.exactDuplicateRowsRemoved,
      })),
      rowCount: products.areas.reduce((sum, { result }) => sum + result.items.length, 0),
      items: products.areas.flatMap(({ result }) => result.items),
    },
    guaranteed: {
      schemaVersion: FSS_PENSION_SCHEMA_VERSION,
      source: { ...FSS_PENSION_SOURCE, endpoint: "psGuaranteedProdList" },
      generatedAt,
      asOf: { reportMonth: guaranteed.reportMonth, label: `${reportYear}년 ${Number(reportMonthNumber)}월` },
      areas: guaranteed.areas.map(({ area, result }) => ({
        code: area.code,
        label: area.label,
        sourceRows: result.sourceRows,
        rowCount: result.items.length,
        exactDuplicateRowsRemoved: result.exactDuplicateRowsRemoved,
      })),
      rowCount: guaranteed.areas.reduce((sum, { result }) => sum + result.items.length, 0),
      items: guaranteed.areas.flatMap(({ result }) => result.items),
    },
  };
}

function readGeneratedAtMs(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const ms = Date.parse(parsed?.generatedAt ?? "");
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

export function fssPensionSnapshotsAreFresh(dataDir, now = new Date()) {
  return [FSS_PENSION_PRODUCTS_SNAPSHOT, FSS_PENSION_GUARANTEED_SNAPSHOT].every((name) => {
    const generatedAtMs = readGeneratedAtMs(path.join(dataDir, name));
    return generatedAtMs !== null && now.getTime() - generatedAtMs <= IF_STALE_MAX_AGE_MS;
  });
}

/** Both files are written to temporaries first so a failed run never leaves one new and one old. */
export function writeFssPensionSnapshots(dataDir, snapshots) {
  fs.mkdirSync(dataDir, { recursive: true });
  const targets = [
    [FSS_PENSION_PRODUCTS_SNAPSHOT, snapshots.products],
    [FSS_PENSION_GUARANTEED_SNAPSHOT, snapshots.guaranteed],
  ].map(([name, value]) => ({
    filePath: path.join(dataDir, name),
    tempPath: path.join(dataDir, `${name}.tmp-${process.pid}-${randomUUID()}`),
    value,
  }));
  try {
    for (const target of targets) {
      fs.writeFileSync(target.tempPath, `${JSON.stringify(target.value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    }
    for (const target of targets) fs.renameSync(target.tempPath, target.filePath);
  } finally {
    for (const target of targets) fs.rmSync(target.tempPath, { force: true });
  }
}

function parseNow(args) {
  const option = args.find((arg) => arg.startsWith("--now="));
  if (!option) return new Date();
  const ms = Date.parse(option.slice("--now=".length).trim());
  if (!Number.isFinite(ms)) throw new FssPensionError("BAD_REQUEST", "--now requires a valid ISO date-time");
  return new Date(ms);
}

async function main() {
  const root = process.cwd();
  const dataDir = path.join(root, ".data");
  for (const name of [".env.local", "env.local", ".env"]) {
    const filePath = path.join(root, name);
    if (fs.existsSync(filePath)) dotenv.config({ path: filePath, override: false, quiet: true });
  }
  const args = process.argv.slice(2);
  const now = parseNow(args);
  if (args.includes("--if-stale") && fssPensionSnapshotsAreFresh(dataDir, now)) {
    console.log("[pension:sync] fresh, skip");
    return;
  }
  const snapshots = await collectFssPensionSnapshots({
    apiKey: String(process.env.FSS_PENSION_API_KEY ?? "").trim(),
    now,
  });
  writeFssPensionSnapshots(dataDir, snapshots);
  const { products, guaranteed } = snapshots;
  console.log(
    `[pension:sync] products asOf=${products.asOf.label} quartersBehind=${products.selection.quartersBehind} rows=${products.rowCount} `
      + products.areas.map((area) => `${area.label}=${area.rowCount}/${area.sourceRows}`).join(" "),
  );
  const excluded = products.areas.reduce((sum, area) => sum + area.excludedRowsWithoutProductInfo, 0);
  if (excluded > 0) console.log(`[pension:sync] products excluded rows without product info=${excluded}`);
  console.log(`[pension:sync] guaranteed asOf=${guaranteed.asOf.label} rows=${guaranteed.rowCount}`);
  if (products.selection.quartersBehind >= 2) {
    console.warn(`[pension:sync] WARN products are ${products.selection.quartersBehind} quarters behind the last completed quarter`);
  }
}

const directPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (directPath === import.meta.url) {
  main().catch((error) => {
    const code = error instanceof FssPensionError ? error.code : "UNEXPECTED";
    console.error(`[pension:sync] failed code=${code} ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
