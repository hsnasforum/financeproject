#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const baseUrlDefault = "https://finlife.fss.or.kr/finlifeapi";

const PRODUCT_ENDPOINTS = {
  deposit: "depositProductsSearch.json",
  saving: "savingProductsSearch.json",
  pension: "annuitySavingProductsSearch.json",
  "mortgage-loan": "mortgageLoanProductsSearch.json",
  "rent-house-loan": "rentHouseLoanProductsSearch.json",
  "credit-loan": "creditLoanProductsSearch.json",
};

const TOP_GROUPS = ["020000", "030200", "030300", "050000", "060000"];

function parseArgs(argv) {
  const out = {
    record: false,
    outDir: "",
    topFinGrpNo: "020000",
    pageNo: "1",
    kind: "",
    allGroups: false,
    allPages: false,
    delayMs: 0,
  };
  for (const arg of argv) {
    if (arg === "--record") out.record = true;
    else if (arg === "--all-groups") out.allGroups = true;
    else if (arg === "--all-pages") out.allPages = true;
    else if (arg.startsWith("--delay-ms=")) out.delayMs = Number(arg.slice("--delay-ms=".length).trim()) || 0;
    else if (arg.startsWith("--out-dir=")) out.outDir = arg.slice("--out-dir=".length).trim();
    else if (arg.startsWith("--topFinGrpNo=")) out.topFinGrpNo = arg.slice("--topFinGrpNo=".length).trim() || "020000";
    else if (arg.startsWith("--pageNo=")) out.pageNo = arg.slice("--pageNo=".length).trim() || "1";
    else if (arg.startsWith("--kind=")) out.kind = arg.slice("--kind=".length).trim();
  }
  return out;
}

function loadEnvLocal() {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const idx = s.indexOf("=");
    const key = s.slice(0, idx).trim();
    const val = s.slice(idx + 1).trim().replace(/^"|"$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

function mask(value) {
  if (!value) return "****";
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

function sanitizePart(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9._-]/g, "_");
}

function buildFixtureKey({ scope, kind, topFinGrpNo, pageNo }) {
  return `${sanitizePart(scope)}__${sanitizePart(kind || "company")}__${sanitizePart(topFinGrpNo)}__${sanitizePart(pageNo)}.json`;
}

function writeFixture({ outDir, scope, kind, topFinGrpNo, pageNo, raw }) {
  const key = buildFixtureKey({ scope, kind, topFinGrpNo, pageNo });
  const dir = path.resolve(root, outDir || process.env.FINLIFE_FIXTURE_DIR || "tmp/finlife-fixtures");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, key);
  const payload = {
    fetchedAt: new Date().toISOString(),
    scope,
    kind: kind || undefined,
    params: { topFinGrpNo, pageNo: Number(pageNo) || 1 },
    raw,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return path.relative(root, file);
}

function parsePositiveNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : undefined;
}

function resolveMaxPage(raw, fallbackPageNo) {
  const result = raw && typeof raw === "object" ? raw.result : null;
  if (!result || typeof result !== "object") return fallbackPageNo;

  const keys = Object.keys(result);
  const key = keys.find((entry) => entry.toLowerCase().replace(/[_\-]/g, "") === "maxpageno");
  const max = key ? parsePositiveNumber(result[key]) : undefined;
  return max ?? fallbackPageNo;
}

async function callEndpoint(baseUrl, auth, endpoint, topFinGrpNo = "020000", pageNo = "1") {
  const url = new URL(`${baseUrl}/${endpoint}`);
  url.searchParams.set("auth", auth);
  url.searchParams.set("topFinGrpNo", topFinGrpNo);
  url.searchParams.set("pageNo", pageNo);

  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: res.status, ok: false, message: "non-json response" };
  }

  const result = json?.result ?? {};
  const baseList = Array.isArray(result.baseList) ? result.baseList.length : 0;
  const optionList = Array.isArray(result.optionList) ? result.optionList.length : 0;
  return { status: res.status, ok: res.ok, baseList, optionList, raw: json };
}

async function waitMs(ms) {
  if (!ms || ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  const enableRecord = args.record || process.env.FINLIFE_RECORD_FIXTURES === "1";
  const auth = process.env.FINLIFE_API_KEY || "";
  const baseUrl = (process.env.FINLIFE_BASE_URL || baseUrlDefault).replace(/\/+$/, "");
  const kinds = Object.keys(PRODUCT_ENDPOINTS).filter((kind) => !args.kind || kind === args.kind);
  const groups = args.allGroups ? TOP_GROUPS : [args.topFinGrpNo];
  const startPage = parsePositiveNumber(args.pageNo) ?? 1;
  let hasFailure = false;

  if (!auth) {
    console.log("[SKIP] FINLIFE_API_KEY missing");
    return;
  }

  console.log(`[INFO] FINLIFE_API_KEY=${mask(auth)} base=${baseUrl} record=${enableRecord ? "on" : "off"} allGroups=${args.allGroups ? "on" : "off"} allPages=${args.allPages ? "on" : "off"}`);

  for (const group of groups) {
    for (const kind of kinds) {
      const endpoint = PRODUCT_ENDPOINTS[kind];
      let maxPage = startPage;

      for (let page = startPage; page <= maxPage; page += 1) {
        try {
          const result = await callEndpoint(baseUrl, auth, endpoint, group, String(page));
          if (args.allPages && result.raw && page === startPage) {
            maxPage = Math.max(maxPage, resolveMaxPage(result.raw, startPage));
          }

          let fixtureLog = "";
          if (enableRecord && result.ok && result.raw) {
            const saved = writeFixture({
              outDir: args.outDir,
              scope: "product",
              kind,
              topFinGrpNo: group,
              pageNo: String(page),
              raw: result.raw,
            });
            fixtureLog = ` fixture=${saved}`;
          }

          console.log(`[${kind}] group=${group} page=${page}/${maxPage} status=${result.status} ok=${result.ok} baseList=${result.baseList ?? 0} optionList=${result.optionList ?? 0}${result.message ? ` message=${result.message}` : ""}`);
          if (fixtureLog) console.log(`[${kind}]${fixtureLog}`);
          if (!result.ok) hasFailure = true;
          await waitMs(args.delayMs);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(`[${kind}] group=${group} page=${page} FAIL ${message}`);
          hasFailure = true;
        }
      }
    }

    if (!args.kind || args.kind === "company") {
      let maxPage = startPage;
      for (let page = startPage; page <= maxPage; page += 1) {
        try {
          const company = await callEndpoint(baseUrl, auth, "companySearch.json", group, String(page));
          if (args.allPages && company.raw && page === startPage) {
            maxPage = Math.max(maxPage, resolveMaxPage(company.raw, startPage));
          }

          if (enableRecord && company.ok && company.raw) {
            const saved = writeFixture({
              outDir: args.outDir,
              scope: "company",
              kind: "",
              topFinGrpNo: group,
              pageNo: String(page),
              raw: company.raw,
            });
            console.log(`[company] fixture=${saved}`);
          }

          console.log(`[company] group=${group} page=${page}/${maxPage} status=${company.status} ok=${company.ok} baseList=${company.baseList ?? 0}${company.message ? ` message=${company.message}` : ""}`);
          if (!company.ok) hasFailure = true;
          await waitMs(args.delayMs);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(`[company] group=${group} page=${page} FAIL ${message}`);
          hasFailure = true;
        }
      }
    }
  }

  if (hasFailure) process.exitCode = 1;
}

run();
