import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import dotenv from "dotenv";

let prisma = null;

const KDB_ENDPOINT = "http://apis.data.go.kr/B190030/GetDepositProductInfoService/getDepositProductList";

for (const name of [".env.local", "env.local", ".env"]) {
  const filePath = path.join(process.cwd(), name);
  if (!fs.existsSync(filePath)) continue;
  dotenv.config({ path: filePath, override: false, quiet: true });
}

function parseArgs(argv) {
  const out = {
    source: "all",
    kind: "deposit",
    ttlMs: 3600000,
    inspect: false,
    fromFile: "",
    maxPages: Number.POSITIVE_INFINITY,
    pageNoStart: 1,
    numOfRows: 300,
  };
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [k, v = ""] = token.slice(2).split("=");
    if (k === "source" && ["kdb", "all"].includes(v)) out.source = v;
    if (k === "kind" && ["deposit", "saving", "all"].includes(v)) out.kind = v;
    if (k === "from") out.from = v;
    if (k === "to") out.to = v;
    if (k === "ttlMs" && Number.isFinite(Number(v)) && Number(v) > 0) out.ttlMs = Math.trunc(Number(v));
    if (k === "inspect" && (v === "1" || v === "true" || v === "")) out.inspect = true;
    if (k === "fromFile" && v) out.fromFile = v;
    if (k === "maxPages" && Number.isFinite(Number(v)) && Number(v) > 0) out.maxPages = Math.trunc(Number(v));
    if (k === "pageNoStart" && Number.isFinite(Number(v)) && Number(v) > 0) out.pageNoStart = Math.trunc(Number(v));
    if (k === "numOfRows" && Number.isFinite(Number(v)) && Number(v) > 0) out.numOfRows = Math.trunc(Number(v));
  }
  return out;
}

function normalizeName(input) {
  return String(input || "")
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("주식회사", "")
    .replaceAll("(주)", "")
    .replaceAll("㈜", "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

function buildExternalKey(providerName, productName, kind) {
  return createHash("sha1").update(`${normalizeName(providerName)}|${normalizeName(productName)}|${kind}`).digest("hex");
}

function resolveServiceKey(raw, missingMessage) {
  const key = String(raw || "").trim();
  if (!key) throw new Error(missingMessage);
  return key.includes("%") ? key : encodeURIComponent(key);
}

function serviceKeyForSource(sourceId) {
  void sourceId;
  return resolveServiceKey(
    process.env.KDB_DATAGO_SERVICE_KEY || process.env.DATAGO_SERVICE_KEY || "",
    "Missing KDB_DATAGO_SERVICE_KEY (or DATAGO_SERVICE_KEY)",
  );
}

function appendQuery(base, query) {
  if (!query) return base;
  return `${base}${base.includes("?") ? "&" : "?"}${query}`;
}

function datagoUrl(sourceId, base, params) {
  const serviceKey = serviceKeyForSource(sourceId);
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    query.set(k, String(v));
  }
  const withServiceKey = appendQuery(base, `ServiceKey=${serviceKey}`);
  return appendQuery(withServiceKey, query.toString());
}

function extractTagValue(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m?.[1]?.trim() ?? null;
}

function parseKdbXml(xml) {
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1] || "");
  const items = itemBlocks.map((block) => {
    const row = {};
    for (const pair of block.matchAll(/<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
      row[pair[1]] = (pair[2] || "").trim();
    }
    return row;
  });
  const totalCount = Number(extractTagValue(xml, "totalCount") || items.length);
  const numOfRows = Number(extractTagValue(xml, "numOfRows") || items.length || 100);
  return {
    items,
    totalCount: Number.isFinite(totalCount) ? totalCount : items.length,
    numOfRows: Number.isFinite(numOfRows) && numOfRows > 0 ? numOfRows : 100,
  };
}

async function fetchDatagoText(sourceId, base, params) {
  const res = await fetch(datagoUrl(sourceId, base, params), { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(`upstream failed (${res.status})`);
  return text;
}

function formatYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

async function fetchKdb(from, to, options = {}) {
  const toYmd = to || formatYmd(new Date());
  const fromYmd = from || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatYmd(d);
  })();

  const numOfRows = Number.isFinite(Number(options.numOfRows)) && Number(options.numOfRows) > 0
    ? Math.trunc(Number(options.numOfRows))
    : 300;
  const pageNoStart = Number.isFinite(Number(options.pageNoStart)) && Number(options.pageNoStart) > 0
    ? Math.trunc(Number(options.pageNoStart))
    : 1;
  const maxPages = Number.isFinite(Number(options.maxPages)) && Number(options.maxPages) > 0
    ? Math.trunc(Number(options.maxPages))
    : Number.POSITIVE_INFINITY;

  const firstXml = await fetchDatagoText("datago_kdb", KDB_ENDPOINT, {
    pageNo: pageNoStart,
    numOfRows,
    sBseDt: fromYmd,
    eBseDt: toYmd,
  });
  const first = parseKdbXml(firstXml);
  const totalPages = Math.max(1, Math.ceil(first.totalCount / first.numOfRows));
  const availablePages = Math.max(1, totalPages - pageNoStart + 1);
  const pages = Number.isFinite(maxPages) ? Math.min(availablePages, maxPages) : availablePages;
  const rows = [...first.items];

  for (let offset = 1; offset < pages; offset += 1) {
    const pageNo = pageNoStart + offset;
    const xml = await fetchDatagoText("datago_kdb", KDB_ENDPOINT, {
      pageNo,
      numOfRows,
      sBseDt: fromYmd,
      eBseDt: toYmd,
    });
    rows.push(...parseKdbXml(xml).items);
  }

  return {
    sourceId: "datago_kdb",
    kind: "deposit",
    pageCount: pages,
    items: rows
      .map((row) => {
        const providerNameRaw = String(row.instNm || row.fncIstNm || "한국산업은행").trim();
        const productNameRaw = String(row.prdNm || row.productNm || "").trim();
        if (!productNameRaw) return null;
        return {
          sourceId: "datago_kdb",
          kind: "deposit",
          externalKey: buildExternalKey(providerNameRaw, productNameRaw, "deposit"),
          providerNameRaw,
          providerNameNorm: normalizeName(providerNameRaw),
          productNameRaw,
          productNameNorm: normalizeName(productNameRaw),
          summary: String(row.prdOtl || "").trim() || null,
          rawJson: row,
        };
      })
      .filter(Boolean),
  };
}

async function fetchKdbFromFile(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const xml = fs.readFileSync(absolute, "utf8");
  const parsed = parseKdbXml(xml);
  return {
    sourceId: "datago_kdb",
    kind: "deposit",
    pageCount: 1,
    totalCount: parsed.totalCount,
    resultCode: undefined,
    resultMsg: undefined,
    items: parsed.items
      .map((row) => {
        const providerNameRaw = String(row.instNm || row.fncIstNm || "한국산업은행").trim();
        const productNameRaw = String(row.prdNm || row.productNm || "").trim();
        if (!productNameRaw) return null;
        return {
          sourceId: "datago_kdb",
          kind: "deposit",
          externalKey: buildExternalKey(providerNameRaw, productNameRaw, "deposit"),
          providerNameRaw,
          providerNameNorm: normalizeName(providerNameRaw),
          productNameRaw,
          productNameNorm: normalizeName(productNameRaw),
          summary: String(row.prdOtl || "").trim() || null,
          rawJson: row,
        };
      })
      .filter(Boolean),
  };
}

function printPrismaGuide() {
  console.error('[datago:sync] Prisma Client가 생성되지 않았습니다. 먼저 "pnpm prisma:generate"를 실행하세요.');
  console.error('[datago:sync] 필요 패키지: "@prisma/adapter-better-sqlite3", "better-sqlite3"');
  console.error('[datago:sync] 오프라인 설치: 온라인에서 "pnpm deps:offline:fetch" 후 오프라인에서 "pnpm deps:offline:install"');
  console.error("[datago:sync] 네트워크 제한 환경에서는 PRISMA_ENGINES_MIRROR, HTTP_PROXY/HTTPS_PROXY 설정을 확인하세요.");
  console.error('[datago:sync] 점검용: "pnpm prisma:debug"');
}

async function initPrisma() {
  try {
    const prismaPkg = await import("@prisma/client");
    const sqliteAdapterPkg = await import("@prisma/adapter-better-sqlite3");
    const PrismaClient = prismaPkg.PrismaClient ?? prismaPkg.default?.PrismaClient;
    const PrismaBetterSQLite3 = sqliteAdapterPkg.PrismaBetterSqlite3
      ?? sqliteAdapterPkg.PrismaBetterSQLite3
      ?? sqliteAdapterPkg.default?.PrismaBetterSqlite3
      ?? sqliteAdapterPkg.default?.PrismaBetterSQLite3;
    if (!PrismaClient || !PrismaBetterSQLite3) {
      printPrismaGuide();
      process.exit(2);
    }
    prisma = new PrismaClient({
      adapter: new PrismaBetterSQLite3({
        url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes(".prisma/client")
      || message.includes("@prisma/client")
      || message.includes("@prisma/adapter-better-sqlite3")
      || message.includes("better-sqlite3")
    ) {
      printPrismaGuide();
      process.exit(2);
    }
    throw error;
  }
}

async function saveBatch(batch, ttlMs) {
  const runStartedAt = new Date();
  const runStartedIso = runStartedAt.toISOString();
  const uniqueKeys = [...new Set(batch.items.map((row) => row.externalKey))];
  const existingRows = uniqueKeys.length > 0
    ? await prisma.externalProduct.findMany({
        where: {
          sourceId: batch.sourceId,
          kind: batch.kind,
          externalKey: { in: uniqueKeys },
        },
        select: { externalKey: true },
      })
    : [];
  const existingSet = new Set(existingRows.map((row) => row.externalKey));
  let createdItems = 0;
  let updatedItems = 0;
  for (const row of batch.items) {
    if (existingSet.has(row.externalKey)) updatedItems += 1;
    else createdItems += 1;
  }

  let upserted = 0;
  for (const row of batch.items) {
    await prisma.externalProduct.upsert({
      where: {
        sourceId_kind_externalKey: {
          sourceId: row.sourceId,
          kind: row.kind,
          externalKey: row.externalKey,
        },
      },
      update: {
        providerNameRaw: row.providerNameRaw,
        providerNameNorm: row.providerNameNorm,
        productNameRaw: row.productNameRaw,
        productNameNorm: row.productNameNorm,
        summary: row.summary,
        rawJson: row.rawJson,
        lastSeenAt: runStartedAt,
      },
      create: {
        sourceId: row.sourceId,
        kind: row.kind,
        externalKey: row.externalKey,
        providerNameRaw: row.providerNameRaw,
        providerNameNorm: row.providerNameNorm,
        productNameRaw: row.productNameRaw,
        productNameNorm: row.productNameNorm,
        summary: row.summary,
        rawJson: row.rawJson,
        firstSeenAt: runStartedAt,
        lastSeenAt: runStartedAt,
      },
    });
    upserted += 1;
  }
  const runFinishedIso = new Date().toISOString();

  await prisma.externalSourceSnapshot.upsert({
    where: {
      sourceId_kind: {
        sourceId: batch.sourceId,
        kind: batch.kind,
      },
    },
    update: {
      lastSyncedAt: new Date(runFinishedIso),
      ttlMs,
      metaJson: {
        lastAttemptAt: runFinishedIso,
        lastRun: {
          startedAt: runStartedIso,
          finishedAt: runFinishedIso,
          fetchedItems: batch.items.length,
          upsertedItems: upserted,
          touchedItems: batch.items.length,
          createdItems,
          updatedItems,
          totalCount: typeof batch.totalCount === "number" ? batch.totalCount : undefined,
          resultCode: typeof batch.resultCode === "string" ? batch.resultCode : undefined,
          resultMsg: typeof batch.resultMsg === "string" ? batch.resultMsg : undefined,
        },
        lastError: null,
      },
    },
    create: {
      sourceId: batch.sourceId,
      kind: batch.kind,
      lastSyncedAt: new Date(runFinishedIso),
      ttlMs,
      metaJson: {
        lastAttemptAt: runFinishedIso,
        lastRun: {
          startedAt: runStartedIso,
          finishedAt: runFinishedIso,
          fetchedItems: batch.items.length,
          upsertedItems: upserted,
          touchedItems: batch.items.length,
          createdItems,
          updatedItems,
          totalCount: typeof batch.totalCount === "number" ? batch.totalCount : undefined,
          resultCode: typeof batch.resultCode === "string" ? batch.resultCode : undefined,
          resultMsg: typeof batch.resultMsg === "string" ? batch.resultMsg : undefined,
        },
        lastError: null,
      },
    },
  });

  return {
    upserted,
    touchedItems: batch.items.length,
    createdItems,
    updatedItems,
    startedAt: runStartedIso,
    finishedAt: runFinishedIso,
  };
}

async function recordSyncFailure(sourceId, kind, ttlMs, message, hint = {}) {
  const safeMessage = String(message || "unknown").slice(0, 240);
  const existing = await prisma.externalSourceSnapshot.findUnique({
    where: {
      sourceId_kind: { sourceId, kind },
    },
  });
  const nowIso = new Date().toISOString();
  const existingMeta = (existing?.metaJson ?? {}) || {};
  const existingLastRun = existingMeta.lastRun || {};
  await prisma.externalSourceSnapshot.upsert({
    where: {
      sourceId_kind: { sourceId, kind },
    },
    update: {
      ttlMs,
      metaJson: {
        ...existingMeta,
        lastAttemptAt: nowIso,
        lastRun: {
          fetchedItems: 0,
          upsertedItems: 0,
          ...existingLastRun,
        },
        ...hint,
        lastError: {
          at: nowIso,
          message: safeMessage,
        },
      },
    },
    create: {
      sourceId,
      kind,
      lastSyncedAt: new Date(0),
      ttlMs,
      metaJson: {
        lastAttemptAt: nowIso,
        lastRun: {
          fetchedItems: 0,
          upsertedItems: 0,
        },
        ...hint,
        lastError: {
          at: nowIso,
          message: safeMessage,
        },
      },
    },
  });
}

async function main() {
  await initPrisma();

  const args = parseArgs(process.argv.slice(2));
  if (args.inspect) {
    console.log("[datago:sync] inspect mode is disabled");
    return;
  }
  if (args.kind !== "deposit" && args.kind !== "all") {
    console.log("[datago:sync] currently only deposit is supported");
    return;
  }

  try {
    const batch = args.fromFile
      ? await fetchKdbFromFile(args.fromFile)
      : await fetchKdb(args.from, args.to, { maxPages: args.maxPages, pageNoStart: args.pageNoStart, numOfRows: args.numOfRows });
    const run = await saveBatch(batch, args.ttlMs);
    console.log(`[datago:sync] ${batch.sourceId}/${batch.kind} done`);
    if (args.fromFile) console.log(`- replayFile: ${args.fromFile}`);
    console.log(`- fetched: ${batch.items.length}`);
    console.log(`- upserted: ${run.upserted}`);
    console.log(`- touched: ${run.touchedItems}`);
    console.log(`- created: ${run.createdItems}`);
    console.log(`- updated: ${run.updatedItems}`);
    if (typeof batch.totalCount === "number") console.log(`- totalCount: ${batch.totalCount}`);
    if (typeof batch.resultCode === "string") console.log(`- resultCode: ${batch.resultCode}`);
    if (typeof batch.resultMsg === "string") console.log(`- resultMsg: ${batch.resultMsg}`);
    console.log(`- matchedHighConfidence: 0 (CLI stores raw; matching runs in app sync module)`);
    console.log(`- pageCount: ${batch.pageCount}`);
  } catch (error) {
    await recordSyncFailure(
      "datago_kdb",
      "deposit",
      args.ttlMs,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

main()
  .catch((error) => {
    console.error("[datago:sync] failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
