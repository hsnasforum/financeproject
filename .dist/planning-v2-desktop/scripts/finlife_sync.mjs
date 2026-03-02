import { createRequire } from "node:module";
import path from "node:path";
import {
  ensureFetchAvailable,
  getFinlifeConfig,
  parsePositiveInt,
  fetchFinlifePage,
  parseFinlifePaging,
  extractBaseAndOption,
  mergeProducts,
  mergeAcrossGroups,
  writeSnapshot,
  parseStatusFromError,
} from "./finlife_cli_common.mjs";
import {
  FINLIFE_DUMP_SCHEMA_VERSION,
  makeDumpFilePath,
  readDumpFile,
  writeDumpFile,
} from "./finlife_dump_utils.mjs";

ensureFetchAvailable();
const require = createRequire(import.meta.url);
let prismaClient = null;
const SUPPORTED_KINDS = ["deposit", "saving", "pension", "mortgage-loan", "rent-house-loan", "credit-loan"];
const PRIORITY_KIND_ORDER = ["saving", "pension", "mortgage-loan", "rent-house-loan", "credit-loan", "deposit"];
const KIND_PRIORITY = new Map(PRIORITY_KIND_ORDER.map((kind, index) => [kind, index + 1]));

function parseArgs(argv) {
  const out = {
    kind: "all",
    inspect: false,
    fromFile: "",
    gzip: false,
    out: "",
    maxPages: Number.POSITIVE_INFINITY,
    pageNoStart: 1,
    pageSize: 50,
    topFinGrpNo: "",
  };
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [k, v = ""] = token.slice(2).split("=");
    if (k === "kind" && (v === "all" || SUPPORTED_KINDS.includes(v))) out.kind = v;
    if (k === "inspect" && (v === "1" || v === "true" || v === "")) out.inspect = true;
    if (k === "fromFile" && v) out.fromFile = v;
    if (k === "gzip" && (v === "1" || v === "true" || v === "")) out.gzip = true;
    if (k === "out" && v) out.out = v;
    if (k === "maxPages" && Number.isFinite(Number(v)) && Number(v) > 0) out.maxPages = Math.trunc(Number(v));
    if (k === "pageNoStart" && Number.isFinite(Number(v)) && Number(v) > 0) out.pageNoStart = Math.trunc(Number(v));
    if (k === "pageSize" && Number.isFinite(Number(v)) && Number(v) > 0) out.pageSize = Math.trunc(Number(v));
    if (k === "topFinGrpNo" && /^\d{6}$/.test(v)) out.topFinGrpNo = v;
  }
  return out;
}

function normalizeSearchText(input) {
  return String(input || "")
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("주식회사", "")
    .replaceAll("(주)", "")
    .replaceAll("㈜", "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

async function getPrismaClient() {
  if (prismaClient) return prismaClient;
  const [{ PrismaClient }, adapterPkg] = await Promise.all([
    import("@prisma/client"),
    Promise.resolve(require("@prisma/adapter-better-sqlite3")),
  ]);
  const Adapter = adapterPkg.PrismaBetterSqlite3 ?? adapterPkg.PrismaBetterSQLite3;
  if (!Adapter) throw new Error("Prisma SQLite adapter not found");
  prismaClient = new PrismaClient({
    adapter: new Adapter({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
    log: ["error"],
  });
  return prismaClient;
}

async function syncFinlifeProductsToDb(kind, items, options = {}) {
  const prisma = await getPrismaClient();
  const priorityByKind = options.priorityByKind instanceof Map ? options.priorityByKind : KIND_PRIORITY;
  const currentPriority = priorityByKind.get(kind) ?? Number.MAX_SAFE_INTEGER;
  const normalizedItems = [];
  const seenCodes = new Set();
  for (const item of items) {
    const code = String(item?.fin_prdt_cd || "").trim();
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);
    normalizedItems.push(item);
  }
  const existingRows = normalizedItems.length > 0
    ? await prisma.product.findMany({
        where: { finPrdtCd: { in: normalizedItems.map((row) => row.fin_prdt_cd) } },
        select: { finPrdtCd: true, kind: true },
      })
    : [];
  const existingByCode = new Map(existingRows.map((row) => [row.finPrdtCd, row.kind]));
  let providersUpserted = 0;
  let productsUpserted = 0;
  let optionsWritten = 0;
  let skippedCrossKindDuplicates = 0;
  let replacedCrossKindDuplicates = 0;

  for (const item of normalizedItems) {
    const finPrdtCd = String(item.fin_prdt_cd || "").trim();
    const existingKind = existingByCode.get(finPrdtCd);
    if (existingKind && existingKind !== kind) {
      const existingPriority = priorityByKind.get(existingKind) ?? Number.MAX_SAFE_INTEGER;
      if (existingPriority <= currentPriority) {
        skippedCrossKindDuplicates += 1;
        continue;
      }
      replacedCrossKindDuplicates += 1;
    }

    const providerName = String(item.kor_co_nm || "").trim();
    const productName = String(item.fin_prdt_nm || "").trim();
    const providerNameNorm = normalizeSearchText(providerName);
    const productNameNorm = normalizeSearchText(productName);
    const searchTextNorm = normalizeSearchText(`${providerName} ${productName}`);
    const providerCodeRaw = String(item.fin_co_no || "").trim();
    const providerCode = providerCodeRaw || `finlife:${providerNameNorm || "unknown"}`;
    const safeProviderName = providerName || providerCode;

    const provider = await prisma.provider.upsert({
      where: { code: providerCode },
      update: { name: safeProviderName },
      create: { code: providerCode, name: safeProviderName },
    });
    providersUpserted += 1;

    const product = await prisma.product.upsert({
      where: { finPrdtCd },
      update: {
        kind,
        name: productName || null,
        providerId: provider.id,
        providerNameNorm: providerNameNorm || null,
        productNameNorm: productNameNorm || null,
        searchTextNorm: searchTextNorm || null,
        raw: item.raw ?? null,
      },
      create: {
        finPrdtCd,
        kind,
        name: productName || null,
        providerId: provider.id,
        providerNameNorm: providerNameNorm || null,
        productNameNorm: productNameNorm || null,
        searchTextNorm: searchTextNorm || null,
        raw: item.raw ?? null,
      },
    });
    productsUpserted += 1;

    await prisma.productOption.deleteMany({ where: { productId: product.id } });
    if (Array.isArray(item.options) && item.options.length > 0) {
      await prisma.productOption.createMany({
        data: item.options.map((opt) => ({
          productId: product.id,
          saveTrm: opt.save_trm == null ? null : String(opt.save_trm),
          intrRate: typeof opt.intr_rate === "number" ? opt.intr_rate : null,
          intrRate2: typeof opt.intr_rate2 === "number" ? opt.intr_rate2 : null,
          raw: opt.raw ?? null,
        })),
      });
      optionsWritten += item.options.length;
    }
  }

  return { providersUpserted, productsUpserted, optionsWritten, skippedCrossKindDuplicates, replacedCrossKindDuplicates };
}

function normalizeDumpProducts(products) {
  if (!Array.isArray(products)) return [];
  return products.map((row) => {
    const item = (row && typeof row === "object") ? row : {};
    const options = Array.isArray(item.options) ? item.options : [];
    return {
      fin_prdt_cd: String(item.fin_prdt_cd || item.finPrdtCd || "").trim(),
      fin_co_no: String(item.fin_co_no || item.finCoNo || "").trim() || undefined,
      kor_co_nm: String(item.kor_co_nm || item.providerNameRaw || "").trim() || undefined,
      fin_prdt_nm: String(item.fin_prdt_nm || item.productNameRaw || "").trim() || undefined,
      options: options.map((opt) => ({
        save_trm: opt?.save_trm == null ? undefined : String(opt.save_trm),
        intr_rate: typeof opt?.intr_rate === "number" ? opt.intr_rate : null,
        intr_rate2: typeof opt?.intr_rate2 === "number" ? opt.intr_rate2 : null,
        raw: (opt && typeof opt === "object" && opt.raw && typeof opt.raw === "object") ? opt.raw : null,
      })),
      raw: (item.raw && typeof item.raw === "object") ? item.raw : {},
    };
  }).filter((row) => row.fin_prdt_cd);
}

function writeInspectDump(kind, products, options = {}, meta = {}) {
  const { gzip = false, out = "" } = options;
  const optionCount = products.reduce((sum, row) => sum + (Array.isArray(row.options) ? row.options.length : 0), 0);
  const payload = {
    schemaVersion: FINLIFE_DUMP_SCHEMA_VERSION,
    meta: {
      dumpedAt: new Date().toISOString(),
      kind,
      productCount: products.length,
      optionCount,
      source: "finlife_sync_normalized_dump",
      ...meta,
    },
    products,
  };
  const filePath = makeDumpFilePath(kind, { gzip, out });
  writeDumpFile(filePath, payload, gzip);
  return { filePath, productCount: products.length, optionCount };
}

function loadReplayDump(filePath) {
  const loaded = readDumpFile(filePath);
  const kind = typeof loaded.payload?.meta?.kind === "string" && SUPPORTED_KINDS.includes(loaded.payload.meta.kind)
    ? loaded.payload.meta.kind
    : null;
  const products = normalizeDumpProducts(loaded.payload?.products);
  return { abs: loaded.absolute, kind, products, schemaVersion: loaded.payload.schemaVersion };
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function computeCompletion({ groups, pagesFetchedByGroup, maxPageByGroup, lastHasNextByGroup, hardCapPages }) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return { completionRate: 0, truncatedByHardCap: false };
  }
  const rates = [];
  let truncatedByHardCap = false;
  for (const group of groups) {
    const pagesFetched = pagesFetchedByGroup[group] ?? 0;
    const maxPage = maxPageByGroup[group];
    const lastHasNext = lastHasNextByGroup[group] ?? false;
    let groupTruncated = false;
    if (typeof maxPage === "number" && Number.isFinite(maxPage) && maxPage > 0) {
      groupTruncated = maxPage > hardCapPages && pagesFetched >= hardCapPages;
      rates.push(clamp01(pagesFetched / maxPage));
    } else {
      groupTruncated = pagesFetched >= hardCapPages && lastHasNext;
      rates.push(groupTruncated ? 0.9 : 1);
    }
    if (groupTruncated) truncatedByHardCap = true;
  }
  return {
    completionRate: rates.length > 0 ? Math.min(...rates) : 0,
    truncatedByHardCap,
  };
}

function parseGroups() {
  const raw = (process.env.FINLIFE_TOPFIN_GRP_LIST || "").trim();
  if (!raw) {
    console.error("[finlife:sync] FINLIFE_TOPFIN_GRP_LIST가 비어 있습니다.");
    console.error("[finlife:sync] 먼저 pnpm finlife:probe로 유효 그룹을 찾고 Recommended 값을 설정하세요.");
    process.exit(2);
  }
  return [...new Set(raw.split(",").map((v) => v.replace(/\D/g, "").padStart(6, "0").slice(0, 6)).filter((v) => /^\d{6}$/.test(v)))];
}

export async function runSyncKinds(kinds = PRIORITY_KIND_ORDER, options = {}) {
  const fromFile = typeof options.fromFile === "string" ? options.fromFile : "";
  const inspect = Boolean(options.inspect);
  const gzip = Boolean(options.gzip);
  const out = typeof options.out === "string" ? options.out : "";
  const maxPages = Number.isFinite(Number(options.maxPages)) && Number(options.maxPages) > 0
    ? Math.trunc(Number(options.maxPages))
    : Number.POSITIVE_INFINITY;
  const pageNoStart = Number.isFinite(Number(options.pageNoStart)) && Number(options.pageNoStart) > 0
    ? Math.trunc(Number(options.pageNoStart))
    : 1;
  const pageSize = Number.isFinite(Number(options.pageSize)) && Number(options.pageSize) > 0
    ? Math.trunc(Number(options.pageSize))
    : 50;
  const topFinGrpNo = typeof options.topFinGrpNo === "string" && /^\d{6}$/.test(options.topFinGrpNo) ? options.topFinGrpNo : "";

  const groups = fromFile ? [] : (topFinGrpNo ? [topFinGrpNo] : parseGroups());
  const config = fromFile ? null : getFinlifeConfig();
  const ttlMs = parsePositiveInt(process.env.FINLIFE_SNAPSHOT_TTL_SECONDS, 43_200, 60, 7 * 24 * 60 * 60) * 1000;
  const hardCapPagesEnv = parsePositiveInt(process.env.FINLIFE_SCAN_HARD_CAP_PAGES, 200, 1, 10_000);
  const hardCapPages = Number.isFinite(maxPages) ? Math.min(hardCapPagesEnv, maxPages) : hardCapPagesEnv;
  const replay = fromFile ? loadReplayDump(fromFile) : null;
  const replayKinds = replay?.kind ? [replay.kind] : kinds;

  for (const kind of replayKinds) {
    const pagesFetchedByGroup = {};
    const maxPageByGroup = {};
    const lastHasNextByGroup = {};
    const groupRows = [];
    let lastUpstreamStatus = null;
    let merged = { items: [], duplicateAcrossGroupsCount: 0 };
    let totalProducts = 0;
    let totalOptions = 0;
    let completion = { completionRate: 1, truncatedByHardCap: false };

    if (replay) {
      merged = { items: replay.products, duplicateAcrossGroupsCount: 0 };
      totalProducts = merged.items.length;
      totalOptions = merged.items.reduce((sum, item) => sum + item.options.length, 0);
    } else {
      for (const group of groups) {
        let pageNo = pageNoStart;
        let totalCount;
        const products = [];
        let pagesFetched = 0;

        while (pageNo <= hardCapPages) {
          let raw;
          try {
            raw = await fetchFinlifePage({
              baseUrl: config.baseUrl,
              apiKey: config.apiKey,
              kind,
              topFinGrpNo: group,
              pageNo,
              pageSize,
            });
          } catch (error) {
            lastUpstreamStatus = parseStatusFromError(error);
            throw error;
          }

          const paging = parseFinlifePaging(raw);
          const lists = extractBaseAndOption(raw);
          if (pageNo === 1 && typeof paging.totalCount === "number") totalCount = paging.totalCount;
          const mergedRows = mergeProducts(lists.baseList, lists.optionList, group);
          products.push(...mergedRows);

          pagesFetched += 1;
          pagesFetchedByGroup[group] = pagesFetched;
          const hasNext = typeof paging.nowPage === "number" && typeof paging.maxPage === "number"
            ? paging.nowPage < paging.maxPage
            : mergedRows.length > 0;
          if (typeof paging.maxPage === "number") maxPageByGroup[group] = paging.maxPage;
          lastHasNextByGroup[group] = hasNext;
          if (!hasNext) break;
          pageNo += 1;
        }

        if (maxPageByGroup[group] === undefined) maxPageByGroup[group] = null;
        groupRows.push({ group, items: products, totalCount });
      }

      merged = mergeAcrossGroups(groupRows);
      totalProducts = merged.items.length;
      totalOptions = merged.items.reduce((sum, item) => sum + item.options.length, 0);
      completion = computeCompletion({
        groups,
        pagesFetchedByGroup,
        maxPageByGroup,
        lastHasNextByGroup,
        hardCapPages,
      });
    }

    const meta = {
      generatedAt: new Date().toISOString(),
      ttlMs,
      configuredGroups: groups,
      groupsScanned: groups,
      pagesFetchedByGroup,
      totalProducts,
      totalOptions,
      completionRate: completion.completionRate,
      truncatedByHardCap: completion.truncatedByHardCap,
      source: "finlife",
      fallbackUsed: false,
      lastUpstreamStatus,
      duplicateAcrossGroupsCount: merged.duplicateAcrossGroupsCount,
      note: replay ? `fromFile replay (schemaVersion=${replay.schemaVersion})` : (groups.length <= 1 ? "업권 범위가 좁을 수 있음. pnpm finlife:probe 권장" : undefined),
    };

    writeSnapshot(kind, { meta, items: merged.items });
    if (inspect) {
      const dumped = writeInspectDump(kind, merged.items, { gzip, out }, { groupsScanned: replay ? [] : groups });
      console.log(`[finlife:sync] inspect dump saved: ${path.relative(process.cwd(), dumped.filePath)}`);
    }
    const dbSync = await syncFinlifeProductsToDb(kind, merged.items, { priorityByKind: KIND_PRIORITY });

    console.log(`[finlife:sync] ${kind} done`);
    if (replay) console.log(`- replayFile: ${path.relative(process.cwd(), replay.abs)}`);
    else console.log(`- groupsScanned: ${groups.join(",")}`);
    console.log(`- totalProducts: ${totalProducts}`);
    console.log(`- totalOptions: ${totalOptions}`);
    console.log(`- completionRate: ${(completion.completionRate * 100).toFixed(1)}%`);
    console.log(`- truncatedByHardCap: ${completion.truncatedByHardCap}`);
    console.log(`- db providersUpserted: ${dbSync.providersUpserted}`);
    console.log(`- db productsUpserted: ${dbSync.productsUpserted}`);
    console.log(`- db optionsWritten: ${dbSync.optionsWritten}`);
    console.log(`- db skippedCrossKindDuplicates: ${dbSync.skippedCrossKindDuplicates}`);
    console.log(`- db replacedCrossKindDuplicates: ${dbSync.replacedCrossKindDuplicates}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const kinds = args.kind === "all" ? PRIORITY_KIND_ORDER : [args.kind];
  runSyncKinds(kinds, {
    inspect: args.inspect,
    fromFile: args.fromFile,
    gzip: args.gzip,
    out: args.out,
    maxPages: args.maxPages,
    pageNoStart: args.pageNoStart,
    pageSize: args.pageSize,
    topFinGrpNo: args.topFinGrpNo,
  }).catch((error) => {
    const status = parseStatusFromError(error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("Unsupported finlife dump schemaVersion=")) {
      console.error(`[finlife:sync] failed: ${msg}`);
      process.exit(2);
    }
    console.error(`[finlife:sync] failed: ${msg}${status ? ` (${status})` : ""}`);
    process.exit(1);
  }).finally(async () => {
    if (prismaClient) await prismaClient.$disconnect();
  });
}
