#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const outBase = path.join(root, "tmp", "api-samples");
const defaultOpenDartBase = "https://opendart.fss.or.kr";
const defaultMolitSalesBase = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade";
const defaultMolitRentBase = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent";

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

function getDealYmd() {
  const now = new Date();
  now.setUTCDate(1);
  now.setUTCMonth(now.getUTCMonth() - 1);
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

function yyyymmdd(date) {
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

async function saveSample(name, url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const dir = path.join(outBase, name);
    fs.mkdirSync(dir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300).replace(/\s+/g, " ");
      console.error(`[WARN] ${name} status=${res.status} body=${body}`);
      const file = path.join(dir, `${ts}.error.txt`);
      fs.writeFileSync(file, body, "utf8");
      return;
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const isZip = contentType.includes("application/zip") || /corpCode\.xml/i.test(url);

    if (isZip) {
      const bytes = Buffer.from(await res.arrayBuffer());
      const file = path.join(dir, `${ts}.zip`);
      fs.writeFileSync(file, bytes);
      console.log(`[OK] ${name} status=${res.status} -> ${path.relative(root, file)}`);
      return;
    }

    const text = await res.text();
    const ext = text.trim().startsWith("<") ? "xml" : "json";
    const file = path.join(dir, `${ts}.${ext}`);
    fs.writeFileSync(file, text, "utf8");

    console.log(`[OK] ${name} status=${res.status} -> ${path.relative(root, file)}`);
  } catch (err) {
    console.error(`[FAIL] ${name} ${err instanceof Error ? err.message : String(err)}`);
  }
}

function requireEnv(name) {
  if (!process.env[name]) {
    console.error(`[SKIP] ${name} missing`);
    return false;
  }
  return true;
}

function normalizeBaseUrl(raw, fallback) {
  return (raw || fallback).trim().replace(/\/+$/, "");
}

function buildEndpoint(base, pathSuffix) {
  const trimmed = pathSuffix.replace(/^\/+/, "");
  if (base.toLowerCase().includes(trimmed.toLowerCase())) return base;
  return `${base}/${trimmed}`;
}

function encodeServiceKey(key) {
  return /%[0-9a-fA-F]{2}/.test(key) ? key : encodeURIComponent(key);
}

function buildApiUrl(endpoint, serviceKey, params) {
  const qs = new URLSearchParams(params).toString();
  const sep = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${sep}serviceKey=${encodeServiceKey(serviceKey)}${qs ? `&${qs}` : ""}`;
}

async function run() {
  loadEnvLocal();
  const dealYmd = getDealYmd();
  const now = new Date();
  const bgn = new Date(now.getTime());
  bgn.setUTCDate(bgn.getUTCDate() - 30);
  const openDartBase = (process.env.OPENDART_BASE_URL || defaultOpenDartBase).replace(/\/+$/, "");

  if (requireEnv("KEXIM_API_KEY")) {
    const url = `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${encodeURIComponent(process.env.KEXIM_API_KEY)}&data=AP01`;
    await saveSample("kexim-fx", url);
  }

  if (requireEnv("MOLIT_SALES_API_KEY")) {
    const base = normalizeBaseUrl(process.env.MOLIT_SALES_API_URL || "", defaultMolitSalesBase);
    const endpoint = buildEndpoint(base, "getRTMSDataSvcAptTrade");
    const url = buildApiUrl(endpoint, process.env.MOLIT_SALES_API_KEY, {
      LAWD_CD: "11680",
      DEAL_YMD: dealYmd,
      pageNo: "1",
      numOfRows: "10",
    });
    await saveSample("molit-sales", url);
  }

  if (requireEnv("MOLIT_RENT_API_KEY")) {
    const base = normalizeBaseUrl(process.env.MOLIT_RENT_API_URL || process.env.MOLIT_SALES_API_URL || "", defaultMolitRentBase);
    const endpoint = buildEndpoint(base, "getRTMSDataSvcAptRent");
    const url = buildApiUrl(endpoint, process.env.MOLIT_RENT_API_KEY, {
      LAWD_CD: "11680",
      DEAL_YMD: dealYmd,
      pageNo: "1",
      numOfRows: "10",
    });
    await saveSample("molit-rent", url);
  }

  if (requireEnv("MOIS_BENEFITS_API_KEY") && process.env.MOIS_BENEFITS_API_URL) {
    const url = `${process.env.MOIS_BENEFITS_API_URL}?serviceKey=${encodeURIComponent(process.env.MOIS_BENEFITS_API_KEY)}&query=${encodeURIComponent("주거")}`;
    await saveSample("mois-benefits", url);
  }

  if (requireEnv("REB_SUBSCRIPTION_API_KEY") && process.env.REB_SUBSCRIPTION_API_URL) {
    const url = `${process.env.REB_SUBSCRIPTION_API_URL}?serviceKey=${encodeURIComponent(process.env.REB_SUBSCRIPTION_API_KEY)}&region=서울&pageNo=1&numOfRows=10`;
    await saveSample("reb-subscription", url);
  }

  if (requireEnv("OPENDART_API_KEY")) {
    const key = encodeURIComponent(process.env.OPENDART_API_KEY);
    await saveSample("opendart-corpcodes", `${openDartBase}/api/corpCode.xml?crtfc_key=${key}`);
    await saveSample("opendart-company", `${openDartBase}/api/company.json?crtfc_key=${key}&corp_code=00126380`);
    await saveSample("opendart-list", `${openDartBase}/api/list.json?crtfc_key=${key}&bgn_de=${yyyymmdd(bgn)}&end_de=${yyyymmdd(now)}&page_no=1&page_count=10`);
  }
}

run();
