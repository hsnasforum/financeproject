import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_WATCHLIST_RELATIVE_PATH = path.join("config", "dart-watchlist.json");
const DEFAULT_RULES_RELATIVE_PATH = path.join("config", "dart-disclosure-rules.json");
const DEFAULT_ALERT_PREFS_RELATIVE_PATH = path.join("config", "dart-alert-preferences.json");
const DEFAULT_ALERT_PROFILE_RELATIVE_PATH = path.join("config", "dart-alert-profile.json");
const DEFAULT_DAYS = 30;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_PAGE_COUNT = 100;
const MAX_PAGE_LIMIT = 20;
const MAX_SEEN_PER_CORP = 500;
const TOP_HIGHLIGHT_LIMIT = 20;
const DAILY_BRIEF_DEFAULT_LINES = 10;
const DAILY_BRIEF_MAX_LINES = 15;
const DAILY_BRIEF_TOP_BUCKET_LIMIT = 3;
const DEFAULT_ALERT_PREFS = Object.freeze({
  minScore: 70,
  includeCategories: [],
  excludeFlags: ["정정", "첨부", "공시서류제출", "연결"],
  maxPerCorp: 2,
  maxItems: 20,
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toYyyymmdd(date) {
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function shiftDays(base, days) {
  const copy = new Date(base.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function parsePositiveInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toSafeInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function toSafeFloat(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(asString).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function parseArgs(argv) {
  let watchlist = DEFAULT_WATCHLIST_RELATIVE_PATH;
  let rules = DEFAULT_RULES_RELATIVE_PATH;
  let prefs = DEFAULT_ALERT_PREFS_RELATIVE_PATH;
  let profile = DEFAULT_ALERT_PROFILE_RELATIVE_PATH;
  let days = DEFAULT_DAYS;
  let finalOnly = false;
  let type = "";
  let strict = false;
  let strictHigh = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--finalOnly") {
      finalOnly = true;
      continue;
    }
    if (arg === "--strict") {
      strict = true;
      continue;
    }
    if (arg === "--strict-high") {
      strictHigh = true;
      continue;
    }
    if (arg.startsWith("--watchlist=")) {
      watchlist = arg.slice("--watchlist=".length).trim() || watchlist;
      continue;
    }
    if (arg === "--watchlist" && argv[i + 1]) {
      watchlist = String(argv[i + 1]).trim() || watchlist;
      i += 1;
      continue;
    }
    if (arg.startsWith("--rules=")) {
      rules = arg.slice("--rules=".length).trim() || rules;
      continue;
    }
    if (arg === "--rules" && argv[i + 1]) {
      rules = String(argv[i + 1]).trim() || rules;
      i += 1;
      continue;
    }
    if (arg.startsWith("--prefs=")) {
      prefs = arg.slice("--prefs=".length).trim() || prefs;
      continue;
    }
    if (arg === "--prefs" && argv[i + 1]) {
      prefs = String(argv[i + 1]).trim() || prefs;
      i += 1;
      continue;
    }
    if (arg.startsWith("--profile=")) {
      profile = arg.slice("--profile=".length).trim() || profile;
      continue;
    }
    if (arg === "--profile" && argv[i + 1]) {
      profile = String(argv[i + 1]).trim() || profile;
      i += 1;
      continue;
    }
    if (arg.startsWith("--days=")) {
      days = parsePositiveInt(arg.slice("--days=".length), DEFAULT_DAYS, 1, 365);
      continue;
    }
    if (arg === "--days" && argv[i + 1]) {
      days = parsePositiveInt(argv[i + 1], DEFAULT_DAYS, 1, 365);
      i += 1;
      continue;
    }
    if (arg.startsWith("--type=")) {
      type = arg.slice("--type=".length).trim();
      continue;
    }
    if (arg === "--type" && argv[i + 1]) {
      type = String(argv[i + 1]).trim();
      i += 1;
    }
  }

  return {
    watchlist,
    rules,
    prefs,
    profile,
    days,
    finalOnly,
    type,
    strict,
    strictHigh,
  };
}

export function normalizeWatchlist(raw) {
  const result = {
    version: 1,
    generatedAt: new Date(0).toISOString(),
    companies: [],
  };
  if (!isRecord(raw)) return result;

  if (Number.isInteger(raw.version)) {
    result.version = Number(raw.version);
  }
  const generatedAt = asString(raw.generatedAt);
  if (generatedAt) {
    const parsed = new Date(generatedAt);
    if (Number.isFinite(parsed.getTime())) {
      result.generatedAt = parsed.toISOString();
    }
  }

  const rows = Array.isArray(raw.companies) ? raw.companies : [];
  const seen = new Set();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const corpCode = asString(row.corpCode);
    if (!corpCode || seen.has(corpCode)) continue;
    seen.add(corpCode);

    const corpName = asString(row.corpName) || corpCode;
    const stockCode = asString(row.stockCode) || undefined;
    result.companies.push({
      corpCode,
      corpName,
      stockCode,
    });
  }

  return result;
}

function normalizeReceiptNo(value) {
  const receiptNo = asString(value);
  return receiptNo || null;
}

export function extractReceiptNo(item) {
  if (!isRecord(item)) return null;
  return normalizeReceiptNo(item.receiptNo ?? item.rcept_no);
}

function normalizeSeenReceiptNos(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const value of input) {
    const receiptNo = normalizeReceiptNo(value);
    if (!receiptNo || seen.has(receiptNo)) continue;
    seen.add(receiptNo);
    out.push(receiptNo);
  }
  return out;
}

export function extractNewDisclosures(previousSeenReceiptNos, items, options = {}) {
  const seenBefore = normalizeSeenReceiptNos(previousSeenReceiptNos);
  const maxSeenPerCorp = parsePositiveInt(options.maxSeenPerCorp, MAX_SEEN_PER_CORP, 1, 10_000);
  const seenBeforeSet = new Set(seenBefore);
  const dedupedItems = [];
  const dedupeSet = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    const receiptNo = extractReceiptNo(item);
    if (!receiptNo || dedupeSet.has(receiptNo)) continue;
    dedupeSet.add(receiptNo);
    dedupedItems.push(item);
  }

  const newItems = dedupedItems.filter((item) => {
    const receiptNo = extractReceiptNo(item);
    if (!receiptNo) return false;
    return !seenBeforeSet.has(receiptNo);
  });

  const nextSeen = [];
  const nextSeenSet = new Set();

  for (const item of dedupedItems) {
    const receiptNo = extractReceiptNo(item);
    if (!receiptNo || nextSeenSet.has(receiptNo)) continue;
    nextSeenSet.add(receiptNo);
    nextSeen.push(receiptNo);
  }
  for (const receiptNo of seenBefore) {
    if (nextSeenSet.has(receiptNo)) continue;
    nextSeenSet.add(receiptNo);
    nextSeen.push(receiptNo);
  }

  return {
    newItems,
    nextSeenReceiptNos: nextSeen.slice(0, maxSeenPerCorp),
  };
}

function mapItem(row) {
  if (!isRecord(row)) return null;
  const receiptNo = normalizeReceiptNo(row.rcept_no);
  if (!receiptNo) return null;

  const corpCode = asString(row.corp_code) || undefined;
  const corpName = asString(row.corp_name) || undefined;
  const stockCode = asString(row.stock_code) || undefined;
  const corpCls = asString(row.corp_cls) || undefined;
  const reportName = asString(row.report_nm) || undefined;
  const filerName = asString(row.flr_nm) || undefined;
  const receiptDate = asString(row.rcept_dt) || undefined;
  const remark = asString(row.rm) || undefined;

  return {
    corpCode,
    corpName,
    stockCode,
    corpCls,
    reportName,
    receiptNo,
    filerName,
    receiptDate,
    remark,
    viewerUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${receiptNo}`,
  };
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const dateA = asString(a.receiptDate);
    const dateB = asString(b.receiptDate);
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return asString(b.receiptNo).localeCompare(asString(a.receiptNo));
  });
}

function normalizeRules(raw) {
  if (!isRecord(raw)) {
    throw new Error("rules root must be an object");
  }

  const categoriesRaw = Array.isArray(raw.categories) ? raw.categories : [];
  const boostersRaw = Array.isArray(raw.boosters) ? raw.boosters : [];

  const categories = categoriesRaw
    .map((row) => {
      if (!isRecord(row)) return null;
      const id = asString(row.id);
      const label = asString(row.label);
      const baseScore = toSafeInt(row.baseScore, 50, 0, 100);
      const patterns = [...new Set((Array.isArray(row.patterns) ? row.patterns : []).map(asString).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
      if (!id || !label || patterns.length === 0) return null;
      return {
        id,
        label,
        baseScore,
        patterns,
      };
    })
    .filter((row) => row !== null)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (categories.length === 0) {
    throw new Error("rules.categories must include at least one valid category");
  }

  const boosters = boostersRaw
    .map((row) => {
      if (!isRecord(row)) return null;
      const pattern = asString(row.pattern);
      if (!pattern) return null;
      return {
        pattern,
        delta: toSafeInt(row.delta, 0, -100, 100),
      };
    })
    .filter((row) => row !== null)
    .sort((a, b) => a.pattern.localeCompare(b.pattern));

  const thresholds = isRecord(raw.thresholds) ? raw.thresholds : {};
  const high = toSafeInt(thresholds.high, 85, 1, 100);
  const mid = toSafeInt(thresholds.mid, 60, 0, 100);
  if (high <= mid) {
    throw new Error("rules.thresholds.high must be greater than thresholds.mid");
  }

  const normalization = isRecord(raw.normalization) ? raw.normalization : {};
  const clustering = isRecord(raw.clustering) ? raw.clustering : {};

  return {
    categories,
    boosters,
    thresholds: {
      high,
      mid,
    },
    maxHighlightsPerCorp: toSafeInt(raw.maxHighlightsPerCorp, 5, 1, 20),
    normalization: {
      prefixes: normalizeStringArray(normalization.prefixes),
      suffixes: normalizeStringArray(normalization.suffixes),
      noise: normalizeStringArray(normalization.noise),
    },
    clustering: {
      windowDays: toSafeInt(clustering.windowDays, 10, 1, 90),
      minTokenOverlap: toSafeFloat(clustering.minTokenOverlap, 0.34, 0, 1),
      maxClusterSize: toSafeInt(clustering.maxClusterSize, 8, 1, 50),
    },
  };
}

function loadRulesFromFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return normalizeRules(raw);
}

function classifyWithRules(reportName, rules) {
  const report = asString(reportName);
  const text = report.toLowerCase();
  const fallback = {
    categoryId: "other",
    categoryLabel: "기타",
    score: 40,
    level: "low",
    signals: [],
    reason: "no category pattern matched",
  };

  const matches = rules.categories
    .map((category) => {
      const matchedPatterns = category.patterns.filter((pattern) => text.includes(pattern.toLowerCase()));
      if (matchedPatterns.length === 0) return null;
      const categoryScore = Math.min(100, category.baseScore + (matchedPatterns.length - 1) * 3);
      return {
        category,
        matchedPatterns,
        categoryScore,
      };
    })
    .filter((row) => row !== null)
    .sort((a, b) => {
      if (a.categoryScore !== b.categoryScore) return b.categoryScore - a.categoryScore;
      return a.category.id.localeCompare(b.category.id);
    });

  const picked = matches[0] ?? null;
  const base = picked
    ? {
        categoryId: picked.category.id,
        categoryLabel: picked.category.label,
        score: picked.categoryScore,
        signals: picked.matchedPatterns.map((pattern) => `category:${picked.category.id}:${pattern}`),
        reason: picked.matchedPatterns.join(", "),
      }
    : fallback;

  let boosterDelta = 0;
  const boosterSignals = [];
  for (const booster of rules.boosters) {
    if (!text.includes(booster.pattern.toLowerCase())) continue;
    boosterDelta += booster.delta;
    boosterSignals.push(`booster:${booster.pattern}:${booster.delta >= 0 ? "+" : ""}${booster.delta}`);
  }

  const score = Math.max(0, Math.min(100, base.score + boosterDelta));
  const level = score >= rules.thresholds.high ? "high" : score >= rules.thresholds.mid ? "mid" : "low";
  return {
    categoryId: base.categoryId,
    categoryLabel: base.categoryLabel,
    score,
    level,
    signals: [...base.signals, ...boosterSignals].sort((a, b) => a.localeCompare(b)),
    reason: report
      ? `${base.categoryLabel}; matched=${base.reason || "none"}; booster=${boosterDelta}`
      : `${base.categoryLabel}; report title missing`,
  };
}

function cleanupSpacing(text) {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*([()[\]{}|,:;/\-])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function collapsePunctuation(text) {
  return text
    .replace(/[|·•ㆍ]+/g, " ")
    .replace(/[(){}\[\]]/g, " ")
    .replace(/[,:;]+/g, " ")
    .replace(/--+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function removeAllLiteral(text, token) {
  if (!token) return { next: text, removed: false };
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped, "g");
  const next = text.replace(pattern, " ");
  return { next, removed: next !== text };
}

function stripEdgeToken(text, token, mode) {
  if (!token) return { next: text, removed: false };
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = mode === "prefix"
    ? new RegExp(`^(?:${escaped})[\\s\\-:|·•]*`, "i")
    : new RegExp(`[\\s\\-:|·•]*(?:${escaped})$`, "i");
  const next = text.replace(pattern, "");
  return { next, removed: next !== text };
}

function normalizeTitleWithRules(rawTitle, rules) {
  let current = cleanupSpacing(asString(rawTitle));
  const flags = [];

  for (const noise of rules.normalization.noise) {
    const removed = removeAllLiteral(current, noise);
    if (removed.removed) {
      current = cleanupSpacing(removed.next);
      flags.push(`noise:${noise}`);
    }
  }
  for (const prefix of rules.normalization.prefixes) {
    let changed = true;
    while (changed) {
      const removed = stripEdgeToken(current, prefix, "prefix");
      changed = removed.removed;
      if (changed) {
        current = cleanupSpacing(removed.next);
        flags.push(`prefix:${prefix}`);
      }
    }
  }
  for (const suffix of rules.normalization.suffixes) {
    let changed = true;
    while (changed) {
      const removed = stripEdgeToken(current, suffix, "suffix");
      changed = removed.removed;
      if (changed) {
        current = cleanupSpacing(removed.next);
        flags.push(`suffix:${suffix}`);
      }
    }
  }

  return {
    normalized: collapsePunctuation(cleanupSpacing(current)),
    flags: [...new Set(flags)].sort((a, b) => a.localeCompare(b)),
  };
}

function tokenizeTitle(normalizedTitle) {
  const text = asString(normalizedTitle).toLowerCase();
  if (!text) return [];
  const tokens = text
    .replace(/[^0-9a-z가-힣]+/gi, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 || /^\d+$/.test(token));
  return [...new Set(tokens)].sort((a, b) => a.localeCompare(b));
}

function levelWeight(level) {
  if (level === "high") return 3;
  if (level === "mid") return 2;
  return 1;
}

export function sortHighlights(items) {
  return [...items].sort((a, b) => {
    const levelDiff = levelWeight(b.classification?.level) - levelWeight(a.classification?.level);
    if (levelDiff !== 0) return levelDiff;
    const scoreDiff = Number(b.classification?.score ?? 0) - Number(a.classification?.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const dateA = asString(a.receiptDate);
    const dateB = asString(b.receiptDate);
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const corpA = asString(a.corpCode);
    const corpB = asString(b.corpCode);
    if (corpA !== corpB) return corpA.localeCompare(corpB);
    const receiptA = asString(a.receiptNo);
    const receiptB = asString(b.receiptNo);
    if (receiptA !== receiptB) return receiptA.localeCompare(receiptB);
    return asString(a.normalizedTitle || a.reportName).localeCompare(asString(b.normalizedTitle || b.reportName));
  });
}

function parseDate(value) {
  const text = asString(value);
  if (!text) return null;
  if (/^\d{8}$/.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6)) - 1;
    const day = Number(text.slice(6, 8));
    const parsed = new Date(Date.UTC(year, month, day));
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function dateDiffDays(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return null;
  return Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24);
}

function tokenList(item) {
  if (!Array.isArray(item.tokens)) return [];
  return [...new Set(item.tokens.map(asString).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function jaccard(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const sa = new Set(tokensA);
  const sb = new Set(tokensB);
  let intersection = 0;
  for (const token of sa) {
    if (sb.has(token)) intersection += 1;
  }
  const union = sa.size + sb.size - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

function compareClusterItem(a, b) {
  const scoreDiff = Number(b.classification?.score ?? 0) - Number(a.classification?.score ?? 0);
  if (scoreDiff !== 0) return scoreDiff;
  const dateA = asString(a.receiptDate);
  const dateB = asString(b.receiptDate);
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  const receiptA = asString(a.receiptNo);
  const receiptB = asString(b.receiptNo);
  if (receiptA !== receiptB) return receiptA.localeCompare(receiptB);
  return asString(a.normalizedTitle || a.reportName).localeCompare(asString(b.normalizedTitle || b.reportName));
}

function itemLevel(item) {
  const level = asString(item.classification?.level).toLowerCase();
  if (level === "high" || level === "mid" || level === "low") return level;
  return "low";
}

function itemScore(item) {
  const score = Number(item.classification?.score ?? 0);
  if (!Number.isFinite(score)) return 0;
  return score;
}

function hasRepresentativePenalty(item) {
  const title = asString(item.normalizedTitle || item.reportName);
  return /정정|첨부|공시서류제출|연결/.test(title);
}

function compareRepresentative(a, b) {
  const levelDiff = levelWeight(itemLevel(b)) - levelWeight(itemLevel(a));
  if (levelDiff !== 0) return levelDiff;

  const penaltyA = hasRepresentativePenalty(a) ? 1 : 0;
  const penaltyB = hasRepresentativePenalty(b) ? 1 : 0;
  if (penaltyA !== penaltyB) return penaltyA - penaltyB;

  const scoreDiff = itemScore(b) - itemScore(a);
  if (scoreDiff !== 0) return scoreDiff;

  const dateA = asString(a.receiptDate);
  const dateB = asString(b.receiptDate);
  if (dateA !== dateB) return dateB.localeCompare(dateA);

  const receiptA = asString(a.receiptNo);
  const receiptB = asString(b.receiptNo);
  if (receiptA !== receiptB) return receiptA.localeCompare(receiptB);

  return asString(a.normalizedTitle || a.reportName).localeCompare(asString(b.normalizedTitle || b.reportName));
}

function pickRepresentative(items) {
  return [...items].sort(compareRepresentative)[0] ?? items[0];
}

function recencyBonus(receiptDate, nowDate = new Date()) {
  const target = parseDate(receiptDate);
  if (!target) return 0;
  const now = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
  const then = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const diffDays = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
  if (diffDays <= 1) return 6;
  if (diffDays <= 7) return 4;
  if (diffDays <= 30) return 2;
  return 0;
}

function clusterScoreOf(cluster) {
  const score = Number(cluster?.clusterScore);
  if (Number.isFinite(score)) return score;
  const fallback = Number(cluster?.representativeScore ?? 0);
  return Number.isFinite(fallback) ? fallback : 0;
}

function computeClusterScore(items, representative) {
  const safeItems = Array.isArray(items) && items.length > 0 ? items : [representative];
  const maxItemScore = safeItems.reduce((max, item) => Math.max(max, itemScore(item)), 0);
  const itemCountBonus = Math.log2(Math.max(1, safeItems.length)) * 3;
  const latestDate = safeItems
    .map((item) => asString(item.receiptDate))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] || representative?.receiptDate;
  return Math.round((maxItemScore + itemCountBonus + recencyBonus(latestDate)) * 100) / 100;
}

function clusterByCorp(items, options) {
  const clusters = [];
  const grouped = new Map();
  for (const item of items) {
    const corpCode = asString(item.corpCode);
    if (!corpCode) continue;
    const rows = grouped.get(corpCode) ?? [];
    rows.push(item);
    grouped.set(corpCode, rows);
  }

  const corpCodes = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
  for (const corpCode of corpCodes) {
    const rows = sortHighlights(grouped.get(corpCode) ?? []);
    const categoryGroups = new Map();
    for (const item of rows) {
      const categoryKey = asString(item.classification?.categoryId) || "unknown";
      const bucket = categoryGroups.get(categoryKey) ?? [];
      bucket.push(item);
      categoryGroups.set(categoryKey, bucket);
    }

    const categoryKeys = [...categoryGroups.keys()].sort((a, b) => a.localeCompare(b));
    for (const categoryKey of categoryKeys) {
      const categoryRows = sortHighlights(categoryGroups.get(categoryKey) ?? []);
      const corpClusters = [];

      for (const item of categoryRows) {
        let selected = -1;
        let selectedSimilarity = -1;

        for (let index = 0; index < corpClusters.length; index += 1) {
          const candidate = corpClusters[index];
          if (candidate.items.length >= options.maxClusterSize) continue;
          const representative = candidate.representative;
          const similarity = jaccard(tokenList(item), tokenList(representative));
          if (similarity < options.minTokenOverlap) continue;
          const gap = dateDiffDays(item.receiptDate, representative.receiptDate);
          if (gap !== null && gap > options.windowDays) continue;

          if (similarity > selectedSimilarity) {
            selectedSimilarity = similarity;
            selected = index;
            continue;
          }
          if (similarity === selectedSimilarity && selected >= 0) {
            const selectedRepresentative = corpClusters[selected].representative;
            if (compareRepresentative(representative, selectedRepresentative) < 0) {
              selected = index;
            }
          }
        }

        if (selected >= 0) {
          const cluster = corpClusters[selected];
          cluster.items = [...cluster.items, item].sort(compareClusterItem);
          cluster.representative = pickRepresentative(cluster.items);
        } else {
          corpClusters.push({
            items: [item],
            representative: item,
          });
        }
      }

      for (const cluster of corpClusters) {
        const sortedItems = [...cluster.items].sort(compareClusterItem);
        const representative = pickRepresentative(sortedItems);
        const clusterScore = computeClusterScore(sortedItems, representative);
        const dateList = sortedItems.map((item) => asString(item.receiptDate)).filter(Boolean).sort((a, b) => a.localeCompare(b));
        const clusterId = `${corpCode}:${asString(representative.receiptNo) || asString(representative.normalizedTitle || representative.reportName).replace(/\s+/g, "_")}`;
        clusters.push({
          clusterId,
          corpCode,
          corpName: asString(representative.corpName) || undefined,
          count: sortedItems.length,
          startDate: dateList[0] || undefined,
          endDate: dateList[dateList.length - 1] || undefined,
          representative,
          representativeTitle: asString(representative.normalizedTitle || representative.reportName) || "(제목 없음)",
          representativeScore: itemScore(representative),
          clusterScore,
          representativeLevel: itemLevel(representative),
          categoryId: asString(representative.classification?.categoryId) || undefined,
          categoryLabel: asString(representative.classification?.categoryLabel) || undefined,
          items: sortedItems,
        });
      }
    }
  }

  return clusters.sort((a, b) => {
    const clusterScoreDiff = clusterScoreOf(b) - clusterScoreOf(a);
    if (clusterScoreDiff !== 0) return clusterScoreDiff;
    const dateA = asString(a.endDate);
    const dateB = asString(b.endDate);
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    if (a.representativeScore !== b.representativeScore) return b.representativeScore - a.representativeScore;
    if (a.count !== b.count) return b.count - a.count;
    return a.clusterId.localeCompare(b.clusterId);
  });
}

export function buildCompanyFiveLineSummary(company, maxLines) {
  const limit = parsePositiveInt(maxLines, 5, 1, 10);
  const clusters = Array.isArray(company.clusters) ? company.clusters : [];
  const top = [...clusters]
    .sort((a, b) => {
      const scoreDiff = clusterScoreOf(b) - clusterScoreOf(a);
      if (scoreDiff !== 0) return scoreDiff;
      const dateA = asString(a.endDate);
      const dateB = asString(b.endDate);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return asString(a.clusterId).localeCompare(asString(b.clusterId));
    })
    .slice(0, limit);
  if (top.length === 0) {
    return ["신규 공시 없음"];
  }

  return top.map((cluster) => {
    const level = asString(cluster.representativeLevel).toUpperCase() || "LOW";
    const score = Number(cluster.representativeScore ?? 0);
    const title = asString(cluster.representativeTitle) || "(제목 없음)";
    return `[${level} ${score}] ${title} (${cluster.count}건)`;
  });
}

function addClassification(items, rules) {
  return items.map((item) => {
    const normalizedTitleResult = normalizeTitleWithRules(item.reportName, rules);
    const classification = classifyWithRules(item.reportName, rules);
    return {
      ...item,
      normalizedTitle: normalizedTitleResult.normalized,
      normalizeFlags: normalizedTitleResult.flags,
      tokens: tokenizeTitle(normalizedTitleResult.normalized),
      classification,
    };
  });
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      body,
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      status: 0,
      body: null,
      errorMessage: isAbort ? "request_timeout" : (error instanceof Error ? error.message : String(error)),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapOpenDartStatus(status, message) {
  const s = asString(status);
  const m = asString(message) || "OpenDART list 요청 실패";
  if (s === "013") return { noData: true, code: "NO_DATA", message: "조회된 공시가 없습니다." };
  if (s === "020") return { noData: false, code: "RATE_LIMIT", message: "요청 제한을 초과했습니다." };
  if (s === "010") return { noData: false, code: "AUTH", message: "등록되지 않은 API 키입니다." };
  if (s === "011" || s === "012" || s === "901") return { noData: false, code: "FORBIDDEN", message: "사용 권한이 없습니다." };
  if (s === "800") return { noData: false, code: "MAINTENANCE", message: "OpenDART 점검 중입니다." };
  return { noData: false, code: "UPSTREAM", message: m };
}

async function fetchCorpDisclosures(input) {
  const items = [];
  let pageNo = 1;
  let totalPage = 1;

  while (pageNo <= totalPage && pageNo <= MAX_PAGE_LIMIT) {
    const params = new URLSearchParams({
      crtfc_key: input.apiKey,
      corp_code: input.corpCode,
      bgn_de: input.from,
      end_de: input.to,
      page_no: String(pageNo),
      page_count: String(DEFAULT_PAGE_COUNT),
    });
    if (input.finalOnly) params.set("last_reprt_at", "Y");
    if (input.type) params.set("pblntf_ty", input.type);

    const url = `${input.baseUrl}/api/list.json?${params.toString()}`;
    const fetched = await fetchJsonWithTimeout(url, DEFAULT_TIMEOUT_MS);
    if (!fetched.ok) {
      return {
        ok: false,
        error: fetched.status === 0 ? `network_error: ${fetched.errorMessage ?? "unknown"}` : `HTTP ${fetched.status}`,
      };
    }
    if (!isRecord(fetched.body)) {
      return { ok: false, error: "invalid_json_body" };
    }

    const status = asString(fetched.body.status);
    const message = asString(fetched.body.message);
    if (status !== "000") {
      const mapped = mapOpenDartStatus(status, message);
      if (mapped.noData) {
        return { ok: true, items: [], status: status || "013" };
      }
      return { ok: false, error: `${mapped.code}: ${mapped.message}`, status: status || "unknown" };
    }

    const rows = Array.isArray(fetched.body.list) ? fetched.body.list : [];
    for (const row of rows) {
      const item = mapItem(row);
      if (!item) continue;
      items.push(item);
    }

    totalPage = parsePositiveInt(fetched.body.total_page, 1, 1, MAX_PAGE_LIMIT);
    if (rows.length === 0 || pageNo >= totalPage) break;
    pageNo += 1;
  }

  return {
    ok: true,
    items: sortItems(items),
    status: "000",
  };
}

function normalizeState(raw) {
  const state = {
    version: 1,
    generatedAt: null,
    lastRunAt: null,
    seenReceiptNos: {},
    lastCheckedAt: {},
  };
  if (!isRecord(raw)) return state;

  if (Number.isInteger(raw.version)) {
    state.version = Number(raw.version);
  }
  const generatedAt = asString(raw.generatedAt);
  if (generatedAt) state.generatedAt = generatedAt;
  const lastRunAt = asString(raw.lastRunAt);
  if (lastRunAt) state.lastRunAt = lastRunAt;

  if (isRecord(raw.seenReceiptNos)) {
    for (const [corpCodeRaw, listRaw] of Object.entries(raw.seenReceiptNos)) {
      const corpCode = asString(corpCodeRaw);
      if (!corpCode) continue;
      state.seenReceiptNos[corpCode] = normalizeSeenReceiptNos(listRaw).slice(0, MAX_SEEN_PER_CORP);
    }
  }
  if (isRecord(raw.lastCheckedAt)) {
    for (const [corpCodeRaw, checkedAtRaw] of Object.entries(raw.lastCheckedAt)) {
      const corpCode = asString(corpCodeRaw);
      const checkedAt = asString(checkedAtRaw);
      if (!corpCode || !checkedAt) continue;
      state.lastCheckedAt[corpCode] = checkedAt;
    }
  }

  return state;
}

function countLevels(items) {
  const counts = { high: 0, mid: 0, low: 0 };
  for (const item of items) {
    const level = asString(item.representativeLevel || item.classification?.level);
    if (level === "high" || level === "mid" || level === "low") {
      counts[level] += 1;
    }
  }
  return counts;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeAlertPrefsRaw(raw) {
  if (!isRecord(raw)) {
    return {
      minScore: DEFAULT_ALERT_PREFS.minScore,
      includeCategories: [...DEFAULT_ALERT_PREFS.includeCategories],
      excludeFlags: [...DEFAULT_ALERT_PREFS.excludeFlags],
      maxPerCorp: DEFAULT_ALERT_PREFS.maxPerCorp,
      maxItems: DEFAULT_ALERT_PREFS.maxItems,
    };
  }

  return {
    minScore: Math.max(0, Math.min(100, toSafeFloat(raw.minScore, DEFAULT_ALERT_PREFS.minScore, 0, 100))),
    includeCategories: normalizeStringArray(raw.includeCategories),
    excludeFlags: normalizeStringArray(raw.excludeFlags),
    maxPerCorp: toSafeInt(raw.maxPerCorp, DEFAULT_ALERT_PREFS.maxPerCorp, 1, 20),
    maxItems: toSafeInt(raw.maxItems, DEFAULT_ALERT_PREFS.maxItems, 1, 200),
  };
}

function loadAlertPrefsFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      prefs: normalizeAlertPrefsRaw(null),
      loadedFrom: "fallback",
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return {
      prefs: normalizeAlertPrefsRaw(parsed),
      loadedFrom: filePath,
    };
  } catch {
    return {
      prefs: normalizeAlertPrefsRaw(null),
      loadedFrom: "fallback",
    };
  }
}

function validateRegexPattern(pattern) {
  const trimmed = asString(pattern);
  if (!trimmed) return { ok: false, reason: "empty_pattern" };
  if (trimmed.length > 80) return { ok: false, reason: "pattern_too_long" };
  const dangerous = [
    /\(\s*\.\*\s*\)\s*[+*{]/,
    /\(\s*\.\+\s*\)\s*[+*{]/,
    /\(\s*\\w\+\s*\)\s*[+*{]/,
    /\((?:\\.|[^()])*(?:\*|\+|\{[0-9]+(?:,[0-9]*)?\})(?:\?|)?(?:\\.|[^()])*\)\s*(?:\+|\*|\{[0-9]+(?:,[0-9]*)?\})/,
  ];
  if (dangerous.some((rule) => rule.test(trimmed))) {
    return { ok: false, reason: "nested_repeat_risk" };
  }
  try {
    RegExp(trimmed);
  } catch {
    return { ok: false, reason: "invalid_regex" };
  }
  return { ok: true };
}

function normalizeKeywordMatch(value) {
  if (value === "contains" || value === "startsWith" || value === "regex") return value;
  return "contains";
}

function normalizeAlertRule(raw, index = 0) {
  if (!isRecord(raw)) return null;
  const kind = asString(raw.kind);
  const value = asString(raw.value);
  if (!value) return null;
  if (kind !== "cluster" && kind !== "corp" && kind !== "category" && kind !== "keyword") return null;
  const match = kind === "keyword" ? normalizeKeywordMatch(raw.match) : undefined;
  if (kind === "keyword" && match === "regex" && !validateRegexPattern(value).ok) return null;
  return {
    id: asString(raw.id) || `rule-${index + 1}`,
    kind,
    value,
    match,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    createdAt: asString(raw.createdAt) || new Date().toISOString(),
  };
}

function normalizeAlertRuleList(raw) {
  if (!Array.isArray(raw)) return [];
  const dedup = new Map();
  for (let index = 0; index < raw.length; index += 1) {
    const rule = normalizeAlertRule(raw[index], index);
    if (!rule) continue;
    const dedupKey = `${rule.kind}::${rule.kind === "keyword" ? normalizeKeywordMatch(rule.match) : ""}::${rule.value.toLowerCase()}`;
    if (!dedup.has(dedupKey)) {
      dedup.set(dedupKey, rule);
    }
  }
  return [...dedup.values()].sort((a, b) => {
    const dateDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (Number.isFinite(dateDiff) && dateDiff !== 0) return dateDiff;
    return asString(a.id).localeCompare(asString(b.id));
  });
}

function normalizeAlertPreset(raw, fallbackId = "default") {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id) || fallbackId;
  const name = asString(raw.name) || id;
  return {
    id,
    name,
    preferences: normalizeAlertPrefsRaw(raw.preferences),
    rules: normalizeAlertRuleList(raw.rules),
  };
}

function loadAlertProfileFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      preset: null,
      loadedFrom: "missing",
      profile: null,
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!isRecord(parsed)) throw new Error("invalid_root");
    const presetsRaw = Array.isArray(parsed.presets) ? parsed.presets : [];
    const presets = presetsRaw
      .map((preset, index) => normalizeAlertPreset(preset, `preset-${index + 1}`))
      .filter((preset) => preset !== null);
    if (presets.length === 0) throw new Error("empty_presets");
    const activePresetId = asString(parsed.activePresetId);
    const activePreset = presets.find((preset) => preset.id === activePresetId) ?? presets[0];
    return {
      preset: activePreset,
      loadedFrom: filePath,
      profile: {
        activePresetId: activePresetId || activePreset.id,
        presets,
      },
    };
  } catch {
    return {
      preset: null,
      loadedFrom: "invalid",
      profile: null,
    };
  }
}

function containsExcludedFlag(title, excludeFlags) {
  if (!excludeFlags.length) return false;
  const normalizedTitle = asString(title).toLowerCase();
  return excludeFlags.some((flag) => normalizedTitle.includes(asString(flag).toLowerCase()));
}

function compareAlertItem(a, b) {
  const scoreDiff = toNumber(b.clusterScore, 0) - toNumber(a.clusterScore, 0);
  if (scoreDiff !== 0) return scoreDiff;
  const corpA = asString(a.corpName);
  const corpB = asString(b.corpName);
  if (corpA !== corpB) return corpA.localeCompare(corpB);
  const titleA = asString(a.title);
  const titleB = asString(b.title);
  if (titleA !== titleB) return titleA.localeCompare(titleB);
  const categoryA = asString(a.categoryLabel);
  const categoryB = asString(b.categoryLabel);
  if (categoryA !== categoryB) return categoryA.localeCompare(categoryB);
  return asString(a.rceptNo).localeCompare(asString(b.rceptNo));
}

function compareAlertEntry(a, b) {
  const itemDiff = compareAlertItem(a.item, b.item);
  if (itemDiff !== 0) return itemDiff;
  return asString(a.bucket).localeCompare(asString(b.bucket));
}

function applyPrefsToAlerts(alerts, prefs) {
  const buckets = ["newHigh", "newMid", "updatedHigh", "updatedMid"];
  const entries = [];
  for (const bucket of buckets) {
    const rows = Array.isArray(alerts?.[bucket]) ? alerts[bucket] : [];
    for (const item of rows) {
      entries.push({ bucket, item });
    }
  }

  const includeSet = new Set((Array.isArray(prefs.includeCategories) ? prefs.includeCategories : [])
    .map((value) => asString(value).toLowerCase())
    .filter(Boolean));

  const filtered = entries
    .filter((entry) => toNumber(entry.item?.clusterScore, 0) >= toNumber(prefs.minScore, 0))
    .filter((entry) => {
      if (includeSet.size === 0) return true;
      return includeSet.has(asString(entry.item?.categoryLabel).toLowerCase());
    })
    .filter((entry) => !containsExcludedFlag(entry.item?.title, Array.isArray(prefs.excludeFlags) ? prefs.excludeFlags : []))
    .sort(compareAlertEntry);

  const perCorpCount = new Map();
  const limited = [];
  for (const entry of filtered) {
    const corpKey = asString(entry.item?.corpName) || "-";
    const count = perCorpCount.get(corpKey) ?? 0;
    if (count >= toNumber(prefs.maxPerCorp, DEFAULT_ALERT_PREFS.maxPerCorp)) continue;
    perCorpCount.set(corpKey, count + 1);
    limited.push(entry);
    if (limited.length >= toNumber(prefs.maxItems, DEFAULT_ALERT_PREFS.maxItems)) break;
  }

  const next = {
    generatedAt: asString(alerts.generatedAt) || null,
    newHigh: [],
    newMid: [],
    updatedHigh: [],
    updatedMid: [],
  };

  for (const entry of limited) {
    next[entry.bucket].push(entry.item);
  }
  for (const bucket of buckets) {
    next[bucket] = [...next[bucket]].sort(compareAlertItem);
  }

  return next;
}

function matchesAlertRule(item, rule) {
  if (!rule?.enabled) return false;
  if (rule.kind === "cluster") {
    return asString(item?.clusterKey) === asString(rule.value);
  }
  if (rule.kind === "corp") {
    return asString(item?.corpCode) === asString(rule.value);
  }
  if (rule.kind === "category") {
    return asString(item?.categoryId) === asString(rule.value);
  }
  const text = asString(item?.normalizedTitle || item?.title);
  const match = normalizeKeywordMatch(rule.match);
  if (match === "startsWith") {
    return text.toLowerCase().startsWith(asString(rule.value).toLowerCase());
  }
  if (match === "regex") {
    const validation = validateRegexPattern(asString(rule.value));
    if (!validation.ok) return false;
    try {
      return new RegExp(asString(rule.value)).test(text);
    } catch {
      return false;
    }
  }
  return text.toLowerCase().includes(asString(rule.value).toLowerCase());
}

function applyRulesToAlerts(alerts, rules) {
  const activeRules = Array.isArray(rules) ? rules.filter((rule) => rule?.enabled) : [];
  if (activeRules.length === 0) return {
    generatedAt: asString(alerts?.generatedAt) || null,
    newHigh: Array.isArray(alerts?.newHigh) ? [...alerts.newHigh] : [],
    newMid: Array.isArray(alerts?.newMid) ? [...alerts.newMid] : [],
    updatedHigh: Array.isArray(alerts?.updatedHigh) ? [...alerts.updatedHigh] : [],
    updatedMid: Array.isArray(alerts?.updatedMid) ? [...alerts.updatedMid] : [],
  };
  const buckets = ["newHigh", "newMid", "updatedHigh", "updatedMid"];
  const next = {
    generatedAt: asString(alerts?.generatedAt) || null,
    newHigh: [],
    newMid: [],
    updatedHigh: [],
    updatedMid: [],
  };
  for (const bucket of buckets) {
    const rows = Array.isArray(alerts?.[bucket]) ? alerts[bucket] : [];
    next[bucket] = rows
      .filter((item) => !activeRules.some((rule) => matchesAlertRule(item, rule)))
      .sort(compareAlertItem);
  }
  return next;
}

function alertCounts(alerts) {
  return {
    newHigh: Array.isArray(alerts?.newHigh) ? alerts.newHigh.length : 0,
    newMid: Array.isArray(alerts?.newMid) ? alerts.newMid.length : 0,
    updatedHigh: Array.isArray(alerts?.updatedHigh) ? alerts.updatedHigh.length : 0,
    updatedMid: Array.isArray(alerts?.updatedMid) ? alerts.updatedMid.length : 0,
    total: (Array.isArray(alerts?.newHigh) ? alerts.newHigh.length : 0)
      + (Array.isArray(alerts?.newMid) ? alerts.newMid.length : 0)
      + (Array.isArray(alerts?.updatedHigh) ? alerts.updatedHigh.length : 0)
      + (Array.isArray(alerts?.updatedMid) ? alerts.updatedMid.length : 0),
  };
}

function tokenizeForKey(text) {
  const normalized = asString(text).toLowerCase();
  if (!normalized) return [];
  const tokens = normalized
    .replace(/[^0-9a-z가-힣]+/gi, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 || /^\d+$/.test(token));
  return [...new Set(tokens)].sort((a, b) => a.localeCompare(b));
}

function receiptNoOf(item) {
  if (!isRecord(item)) return "";
  return asString(item.receiptNo || item.rcept_no);
}

function viewerUrlFromReceiptNo(receiptNo) {
  const safeReceiptNo = asString(receiptNo);
  if (!safeReceiptNo) return "";
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${safeReceiptNo}`;
}

function clusterKeySignature(cluster, representativeTitle, items) {
  const tokenBucket = [];
  for (const item of items) {
    if (Array.isArray(item.tokens)) {
      for (const token of item.tokens) {
        const normalized = asString(token).toLowerCase();
        if (normalized) tokenBucket.push(normalized);
      }
      continue;
    }
    tokenBucket.push(...tokenizeForKey(asString(item.normalizedTitle || item.reportName)));
  }

  if (tokenBucket.length === 0 && isRecord(cluster.representative)) {
    if (Array.isArray(cluster.representative.tokens)) {
      for (const token of cluster.representative.tokens) {
        const normalized = asString(token).toLowerCase();
        if (normalized) tokenBucket.push(normalized);
      }
    } else {
      tokenBucket.push(...tokenizeForKey(asString(cluster.representative.normalizedTitle || cluster.representative.reportName)));
    }
  }

  if (tokenBucket.length === 0) {
    tokenBucket.push(...tokenizeForKey(representativeTitle));
  }

  const signature = [...new Set(tokenBucket.map((token) => token.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 8);

  if (signature.length > 0) return signature.join("|");
  return asString(cluster.clusterId) || "cluster";
}

function maxScoreOfCluster(items, representativeScore) {
  const maxByItems = items.reduce((max, item) => {
    const score = toNumber(item?.classification?.score, 0);
    return Math.max(max, score);
  }, 0);
  return Math.max(maxByItems, representativeScore);
}

function diffClusterRows(digest) {
  const rows = [];
  const companies = Array.isArray(digest?.companies) ? digest.companies : [];
  for (const company of companies) {
    const clusters = Array.isArray(company?.clusters) ? company.clusters : [];
    for (const cluster of clusters) {
      const corpCode = asString(cluster?.corpCode || company?.corpCode);
      if (!corpCode) continue;
      const corpName = asString(cluster?.corpName || company?.corpName) || undefined;
      const categoryId = asString(cluster?.categoryId) || "unknown";
      const categoryLabel = asString(cluster?.categoryLabel) || undefined;
      const items = Array.isArray(cluster?.items) ? cluster.items : [];
      const representative = isRecord(cluster?.representative) ? cluster.representative : null;
      const representativeTitle =
        asString(cluster?.representativeTitle || representative?.normalizedTitle || representative?.reportName) || "(제목 없음)";
      const representativeLevel = asString(cluster?.representativeLevel || representative?.classification?.level).toLowerCase();
      const representativeScore = toNumber(cluster?.representativeScore ?? representative?.classification?.score, 0);
      const clusterScore = toNumber(cluster?.clusterScore, representativeScore);
      const itemsCount = Math.max(0, Math.round(toNumber(cluster?.count, items.length)));
      const representativeReceiptNo = receiptNoOf(representative) || receiptNoOf(items[0]) || "";
      const clusterKey = `${corpCode}::${categoryId}::${clusterKeySignature(cluster, representativeTitle, items)}`;
      const level =
        representativeLevel === "high" || representativeLevel === "mid" || representativeLevel === "low"
          ? representativeLevel
          : "low";

      rows.push({
        clusterKey,
        clusterId: asString(cluster?.clusterId) || undefined,
        corpCode,
        corpName,
        categoryId,
        categoryLabel,
        representativeTitle,
        representativeLevel: level,
        representativeScore,
        clusterScore,
        maxScore: maxScoreOfCluster(items, representativeScore),
        itemsCount,
        representativeReceiptNo: representativeReceiptNo || undefined,
        endDate: asString(cluster?.endDate) || undefined,
        viewerUrl: viewerUrlFromReceiptNo(representativeReceiptNo) || undefined,
      });
    }
  }
  return rows;
}

function compareDiffRow(a, b) {
  if (a.clusterScore !== b.clusterScore) return b.clusterScore - a.clusterScore;
  const dateA = asString(a.endDate);
  const dateB = asString(b.endDate);
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  if (a.representativeScore !== b.representativeScore) return b.representativeScore - a.representativeScore;
  return a.clusterKey.localeCompare(b.clusterKey);
}

function compareDiffEvent(a, b) {
  return compareDiffRow(a.current, b.current);
}

function updatedChanges(previous, current) {
  const representativeChanged =
    asString(previous.representativeReceiptNo) !== asString(current.representativeReceiptNo) ||
    asString(previous.representativeTitle) !== asString(current.representativeTitle);
  return {
    itemsCountIncreased: current.itemsCount > previous.itemsCount,
    representativeChanged,
    maxScoreIncreased: current.maxScore > previous.maxScore,
    clusterScoreIncreased: current.clusterScore > previous.clusterScore,
  };
}

export function diffDigest(prevDigest, currDigest) {
  const previousRows = diffClusterRows(prevDigest);
  const currentRows = diffClusterRows(currDigest);
  const previousMap = new Map();
  for (const row of previousRows) {
    previousMap.set(row.clusterKey, row);
  }

  const newClusters = [];
  const updatedClusters = [];

  for (const current of currentRows) {
    const previous = previousMap.get(current.clusterKey);
    if (!previous) {
      newClusters.push({
        clusterKey: current.clusterKey,
        previous: null,
        current,
        changes: {
          itemsCountIncreased: true,
          representativeChanged: false,
          maxScoreIncreased: true,
          clusterScoreIncreased: true,
        },
      });
      continue;
    }

    const changes = updatedChanges(previous, current);
    if (changes.itemsCountIncreased || changes.representativeChanged || changes.maxScoreIncreased || changes.clusterScoreIncreased) {
      updatedClusters.push({
        clusterKey: current.clusterKey,
        previous,
        current,
        changes,
      });
    }
  }

  const highlightsHighMid = [...newClusters, ...updatedClusters]
    .filter((event) => event.current.representativeLevel === "high" || event.current.representativeLevel === "mid")
    .sort((a, b) => {
      const levelDiff = levelWeight(b.current.representativeLevel) - levelWeight(a.current.representativeLevel);
      if (levelDiff !== 0) return levelDiff;
      return compareDiffEvent(a, b);
    });

  return {
    newClusters: newClusters.sort(compareDiffEvent),
    updatedClusters: updatedClusters.sort(compareDiffEvent),
    highlightsHighMid,
  };
}

export function hasNewHighAlerts(digestDiff) {
  return digestDiff.newClusters.some((event) => event.current.representativeLevel === "high");
}

function formatAlertItemLine(item, kindLabel, levelLabel) {
  const score = toNumber(item?.clusterScore, 0);
  const corp = asString(item?.corpName) || "-";
  const category = asString(item?.categoryLabel) || "기타";
  const title = asString(item?.title) || "(제목 없음)";
  const rceptNo = asString(item?.rceptNo);
  const viewerUrl = rceptNo ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}` : "-";
  return `- [${kindLabel}] [${levelLabel} ${score}] ${corp} | ${title} (${category}) | ${viewerUrl}`;
}

export function buildAlertsMarkdown(input) {
  const alerts = input?.alerts
    ? input.alerts
    : buildAlertsJson({
      generatedAt: input?.generatedAt,
      digestDiff: input?.digestDiff ?? { newClusters: [], updatedClusters: [], highlightsHighMid: [] },
    });
  const newEntries = [
    ...(Array.isArray(alerts.newHigh) ? alerts.newHigh : []).map((item) => ({ kind: "NEW", level: "HIGH", item })),
    ...(Array.isArray(alerts.newMid) ? alerts.newMid : []).map((item) => ({ kind: "NEW", level: "MID", item })),
  ].sort((a, b) => compareAlertItem(a.item, b.item));
  const updatedEntries = [
    ...(Array.isArray(alerts.updatedHigh) ? alerts.updatedHigh : []).map((item) => ({ kind: "UPD", level: "HIGH", item })),
    ...(Array.isArray(alerts.updatedMid) ? alerts.updatedMid : []).map((item) => ({ kind: "UPD", level: "MID", item })),
  ].sort((a, b) => compareAlertItem(a.item, b.item));
  const highMidEntries = [...newEntries, ...updatedEntries]
    .sort((a, b) => compareAlertItem(a.item, b.item));

  const lines = [];
  lines.push("# DART Disclosure Alerts");
  lines.push("");
  lines.push("## 요약");
  lines.push("");
  lines.push(`- Generated at: ${input.generatedAt}`);
  lines.push(`- Previous digest generatedAt: ${asString(input.previousGeneratedAt) || "-"}`);
  lines.push(`- Watchlist path: ${input.watchlistPath}`);
  lines.push(`- Rules path: ${input.rulesPath ?? "-"}`);
  if (asString(input.profilePath)) lines.push(`- Profile path: ${asString(input.profilePath)}`);
  if (asString(input.profileLoadedFrom)) lines.push(`- Profile loaded: ${asString(input.profileLoadedFrom)}`);
  if (asString(input.activePresetId)) lines.push(`- Active preset: ${asString(input.activePresetId)} (${asString(input.activePresetName) || "-"})`);
  if (asString(input.prefsPath)) lines.push(`- Prefs path: ${asString(input.prefsPath)}`);
  lines.push(`- Date range: ${input.from} ~ ${input.to}`);
  lines.push(`- 신규 알림: ${newEntries.length}`);
  lines.push(`- 업데이트 알림: ${updatedEntries.length}`);
  lines.push(`- High/Mid 알림: ${highMidEntries.length}`);
  if (input?.prefs && typeof input.prefs === "object") {
    const pref = input.prefs;
    lines.push(`- prefs: minScore=${pref.minScore}; maxPerCorp=${pref.maxPerCorp}; maxItems=${pref.maxItems}`);
  }
  if (Array.isArray(input?.rulesApplied)) {
    lines.push(`- rules: ${input.rulesApplied.length}`);
  }
  lines.push("");

  lines.push("## 신규 사건");
  lines.push("");
  if (newEntries.length === 0) {
    lines.push("- 없음");
  } else {
    for (const entry of newEntries) {
      lines.push(formatAlertItemLine(entry.item, entry.kind, entry.level));
    }
  }
  lines.push("");

  lines.push("## 업데이트 사건");
  lines.push("");
  if (updatedEntries.length === 0) {
    lines.push("- 없음");
  } else {
    for (const entry of updatedEntries) {
      lines.push(formatAlertItemLine(entry.item, entry.kind, entry.level));
    }
  }
  lines.push("");

  lines.push("## High/Mid 우선 알림");
  lines.push("");
  if (highMidEntries.length === 0) {
    lines.push("- 없음");
  } else {
    for (const entry of highMidEntries) {
      lines.push(formatAlertItemLine(entry.item, entry.kind, entry.level));
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function toAlertsJsonItem(event) {
  const current = event?.current ?? {};
  const title = asString(current.representativeTitle) || "(제목 없음)";
  return {
    id: asString(current.clusterKey),
    clusterKey: asString(current.clusterKey),
    corpCode: asString(current.corpCode),
    corpName: asString(current.corpName || current.corpCode) || "-",
    categoryId: asString(current.categoryId),
    categoryLabel: asString(current.categoryLabel) || "기타",
    title,
    normalizedTitle: title,
    rceptNo: asString(current.representativeReceiptNo),
    date: asString(current.endDate) || null,
    clusterScore: toNumber(current.clusterScore, toNumber(current.representativeScore, 0)),
  };
}

export function buildAlertsJson(input) {
  const digestDiff = input?.digestDiff ?? { newClusters: [], updatedClusters: [], highlightsHighMid: [] };
  const pickLevel = (events, level) =>
    events
      .filter((event) => asString(event?.current?.representativeLevel) === level)
      .map(toAlertsJsonItem);

  return {
    generatedAt: asString(input?.generatedAt) || null,
    newHigh: pickLevel(digestDiff.newClusters, "high"),
    newMid: pickLevel(digestDiff.newClusters, "mid"),
    updatedHigh: pickLevel(digestDiff.updatedClusters, "high"),
    updatedMid: pickLevel(digestDiff.updatedClusters, "mid"),
  };
}

function buildAlertsOutput(input) {
  return {
    generatedAt: input.alerts.generatedAt,
    prefs: input.prefs,
    rules: input.rulesApplied,
    meta: {
      prefsPath: input.prefsPath,
      prefsLoadedFrom: input.prefsLoadedFrom,
      profilePath: input.profilePath,
      profileLoadedFrom: input.profileLoadedFrom,
      activePresetId: input.activePresetId,
      activePresetName: input.activePresetName,
      rawCounts: input.rawCounts,
      filteredCounts: input.filteredCounts,
    },
    newHigh: input.alerts.newHigh,
    newMid: input.alerts.newMid,
    updatedHigh: input.alerts.updatedHigh,
    updatedMid: input.alerts.updatedMid,
  };
}

function toDateMillis(value) {
  const text = asString(value);
  if (!text) return 0;
  if (/^\d{8}$/.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6)) - 1;
    const day = Number(text.slice(6, 8));
    const parsed = Date.UTC(year, month, day);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBriefDate(value) {
  const text = asString(value);
  if (!text) return "-";
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  const parsed = toDateMillis(text);
  if (!parsed) return text;
  return new Date(parsed).toISOString().slice(0, 10);
}

function compareDailyBriefItem(a, b) {
  const pinDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
  if (pinDiff !== 0) return pinDiff;
  if (a.isPinned && b.isPinned) {
    const pinnedAtDiff = toDateMillis(b.pinnedAt) - toDateMillis(a.pinnedAt);
    if (pinnedAtDiff !== 0) return pinnedAtDiff;
  }
  if (a.bucketPriority !== b.bucketPriority) return a.bucketPriority - b.bucketPriority;
  const scoreDiff = toNumber(b.clusterScore, 0) - toNumber(a.clusterScore, 0);
  if (scoreDiff !== 0) return scoreDiff;
  const dateDiff = toDateMillis(b.date) - toDateMillis(a.date);
  if (dateDiff !== 0) return dateDiff;
  const corpDiff = asString(a.corpName).localeCompare(asString(b.corpName));
  if (corpDiff !== 0) return corpDiff;
  const titleDiff = asString(a.title).localeCompare(asString(b.title));
  if (titleDiff !== 0) return titleDiff;
  return asString(a.id).localeCompare(asString(b.id));
}

function toDailyBriefLine(item) {
  const pinLabel = item.isPinned ? "[PIN] " : "";
  const score = Math.round(toNumber(item.clusterScore, 0));
  const kind = asString(item.kind).toUpperCase();
  const level = asString(item.level).toUpperCase();
  return `[${pinLabel}${kind}/${level} ${score}] ${asString(item.corpName) || "-"} | ${asString(item.title) || "(제목 없음)"} (${asString(item.categoryLabel) || "기타"}, ${formatBriefDate(item.date)}, ${asString(item.rceptNo) || "-"})`;
}

function collectBriefEntries(alerts) {
  const buckets = [
    { key: "newHigh", kind: "new", level: "high", priority: 0 },
    { key: "newMid", kind: "new", level: "mid", priority: 1 },
    { key: "updatedHigh", kind: "updated", level: "high", priority: 2 },
    { key: "updatedMid", kind: "updated", level: "mid", priority: 3 },
  ];
  const entries = [];
  for (const bucket of buckets) {
    const rows = Array.isArray(alerts?.[bucket.key]) ? alerts[bucket.key] : [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = isRecord(rows[index]) ? rows[index] : {};
      const corpName = asString(row.corpName) || "-";
      const title = asString(row.title) || "(제목 없음)";
      const categoryLabel = asString(row.categoryLabel) || "기타";
      const clusterKey = asString(row.clusterKey) || `${corpName}::${categoryLabel}::${title}`;
      const rceptNo = asString(row.rceptNo);
      const id = asString(row.id) || (rceptNo ? `${clusterKey}::${rceptNo}` : `${clusterKey}::${index}`);
      const pinnedAt = asString(row.pinnedAt) || null;
      entries.push({
        id,
        clusterKey,
        corpCode: asString(row.corpCode),
        corpName,
        categoryId: asString(row.categoryId),
        categoryLabel,
        title,
        rceptNo,
        date: asString(row.date) || null,
        clusterScore: toNumber(row.clusterScore, 0),
        kind: bucket.kind,
        level: bucket.level,
        bucketPriority: bucket.priority,
        isPinned: Boolean(row.isPinned) || Boolean(pinnedAt),
        pinnedAt,
      });
    }
  }
  return entries;
}

export function buildDailyBrief(alertsJson, options = {}) {
  const entries = collectBriefEntries(alertsJson).sort(compareDailyBriefItem);
  const maxLines = Math.max(
    1,
    Math.min(
      DAILY_BRIEF_MAX_LINES,
      Math.round(toNumber(options.maxLines, DAILY_BRIEF_DEFAULT_LINES)) || DAILY_BRIEF_DEFAULT_LINES,
    ),
  );
  const topNew = entries
    .filter((item) => item.kind === "new")
    .slice(0, DAILY_BRIEF_TOP_BUCKET_LIMIT);
  const topUpdated = entries
    .filter((item) => item.kind === "updated")
    .slice(0, DAILY_BRIEF_TOP_BUCKET_LIMIT);
  const lines = entries.slice(0, maxLines).map(toDailyBriefLine);
  const counts = alertCounts(alertsJson);
  return {
    generatedAt: asString(alertsJson?.generatedAt) || null,
    stats: {
      newHigh: counts.newHigh,
      newMid: counts.newMid,
      updatedHigh: counts.updatedHigh,
      updatedMid: counts.updatedMid,
      total: counts.total,
      shown: lines.length,
      maxLines,
    },
    topNew,
    topUpdated,
    lines,
  };
}

function formatBriefTopLine(item) {
  const pinLabel = item.isPinned ? "PIN " : "";
  return `- [${pinLabel}${asString(item.level).toUpperCase()} ${Math.round(toNumber(item.clusterScore, 0))}] ${asString(item.corpName) || "-"} | ${asString(item.title) || "(제목 없음)"}`;
}

export function buildDailyBriefMarkdown(brief) {
  const lines = [];
  lines.push("# DART Daily Brief");
  lines.push("");
  lines.push("## 요약");
  lines.push(`- Generated at: ${asString(brief?.generatedAt) || "-"}`);
  lines.push(`- Alerts: newHigh=${toNumber(brief?.stats?.newHigh, 0)}, newMid=${toNumber(brief?.stats?.newMid, 0)}, updatedHigh=${toNumber(brief?.stats?.updatedHigh, 0)}, updatedMid=${toNumber(brief?.stats?.updatedMid, 0)}, total=${toNumber(brief?.stats?.total, 0)}`);
  lines.push(`- Brief lines: ${toNumber(brief?.stats?.shown, 0)}/${toNumber(brief?.stats?.maxLines, DAILY_BRIEF_DEFAULT_LINES)}`);
  lines.push("");
  lines.push("## Top New");
  if (!Array.isArray(brief?.topNew) || brief.topNew.length === 0) {
    lines.push("- 없음");
  } else {
    brief.topNew.forEach((item) => lines.push(formatBriefTopLine(item)));
  }
  lines.push("");
  lines.push("## Top Updated");
  if (!Array.isArray(brief?.topUpdated) || brief.topUpdated.length === 0) {
    lines.push("- 없음");
  } else {
    brief.topUpdated.forEach((item) => lines.push(formatBriefTopLine(item)));
  }
  lines.push("");
  lines.push("## 10줄 요약");
  if (!Array.isArray(brief?.lines) || brief.lines.length === 0) {
    lines.push("- 없음");
  } else {
    brief.lines.forEach((line) => lines.push(`- ${asString(line)}`));
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function buildDigestMarkdown(digest) {
  const lines = [];
  lines.push("# DART Disclosure Digest");
  lines.push("");
  lines.push("## 전체 요약");
  lines.push("");
  lines.push(`- Generated at: ${digest.generatedAt}`);
  lines.push(`- Watchlist path: ${digest.watchlistPath}`);
  lines.push(`- Rules path: ${digest.rulesPath ?? "-"}`);
  lines.push(`- Date range: ${digest.from} ~ ${digest.to}`);
  lines.push(`- finalOnly: ${digest.finalOnly ? "Y" : "N"}`);
  lines.push(`- type: ${digest.type || "(all)"}`);
  lines.push(`- companies: ${digest.summary.companies}`);
  lines.push(`- total items: ${digest.summary.totalItems}`);
  lines.push(`- total new: ${digest.summary.totalNew}`);
  lines.push(`- errors: ${digest.summary.errors}`);
  lines.push(`- levels(high/mid/low): ${digest.summary.levelCounts.high}/${digest.summary.levelCounts.mid}/${digest.summary.levelCounts.low}`);
  if (digest.summary.skippedReason) {
    lines.push(`- skipped: ${digest.summary.skippedReason}`);
  }
  lines.push("");

  lines.push("## 핵심 Top");
  lines.push("");
  if (!Array.isArray(digest.topHighlights) || digest.topHighlights.length === 0) {
    lines.push("- 핵심 공시 없음");
  } else {
    for (const cluster of digest.topHighlights) {
      const level = asString(cluster.representativeLevel).toUpperCase() || "LOW";
      const score = Number(cluster.representativeScore ?? 0);
      const category = asString(cluster.categoryLabel) || "기타";
      lines.push(`- [${level} ${score}] ${cluster.corpName ?? cluster.corpCode} | ${cluster.representativeTitle} (${cluster.count}건, ${category})`);
    }
  }
  lines.push("");

  lines.push("## 기업별 5줄 요약");
  lines.push("");
  for (const company of digest.companies) {
    lines.push(`### ${company.corpName} (${company.corpCode})`);
    if (company.error) {
      lines.push(`- 오류: ${company.error}`);
      lines.push("");
      continue;
    }
    lines.push(`- checkedAt: ${company.checkedAt}`);
    lines.push(`- total/new: ${company.totalCount}/${company.newCount}`);
    for (const line of company.summaryLines) {
      lines.push(`- ${line}`);
    }
    lines.push("");
  }

  lines.push("## 전체 목록");
  lines.push("");
  for (const company of digest.companies) {
    lines.push(`### ${company.corpName} (${company.corpCode})`);
    if (company.error) {
      lines.push(`- status: error`);
      lines.push(`- message: ${company.error}`);
      lines.push("");
      continue;
    }
    lines.push(`- checkedAt: ${company.checkedAt}`);
    lines.push(`- total: ${company.totalCount}`);
    lines.push(`- new: ${company.newCount}`);
    if (!Array.isArray(company.clusters) || company.clusters.length === 0) {
      lines.push("- 클러스터 없음");
      lines.push("");
      continue;
    }
    for (const cluster of company.clusters) {
      const level = asString(cluster.representativeLevel).toUpperCase() || "LOW";
      const score = Number(cluster.representativeScore ?? 0);
      const category = asString(cluster.categoryLabel) || "기타";
      lines.push(`- [${level} ${score}] ${cluster.representativeTitle} (${cluster.count}건, ${category})`);
      lines.push("<details>");
      lines.push(`<summary>상세 항목 ${cluster.count}건</summary>`);
      for (const item of cluster.items) {
        lines.push(`- ${item.receiptDate ?? "-"} | ${item.reportName ?? "(제목 없음)"} | ${item.receiptNo ?? "-"}`);
      }
      lines.push("</details>");
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function createEmptyDigest(input) {
  return {
    version: 3,
    generatedAt: input.generatedAt,
    watchlistPath: input.watchlistPath,
    rulesPath: input.rulesPath,
    from: input.from,
    to: input.to,
    finalOnly: input.finalOnly,
    type: input.type,
    rules: input.rulesMeta,
    summary: {
      companies: input.companyCount,
      totalItems: 0,
      totalNew: 0,
      errors: 0,
      levelCounts: { high: 0, mid: 0, low: 0 },
      skippedReason: input.skippedReason ?? "",
    },
    topHighlights: [],
    companies: [],
  };
}

async function run() {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const watchlistPath = path.isAbsolute(args.watchlist) ? args.watchlist : path.resolve(cwd, args.watchlist);
  const rulesPath = path.isAbsolute(args.rules) ? args.rules : path.resolve(cwd, args.rules);
  const prefsPath = path.isAbsolute(args.prefs) ? args.prefs : path.resolve(cwd, args.prefs);
  const profilePath = path.isAbsolute(args.profile) ? args.profile : path.resolve(cwd, args.profile);
  const statePath = path.join(cwd, "tmp", "dart", "disclosure_state.json");
  const digestJsonPath = path.join(cwd, "tmp", "dart", "disclosure_digest.json");
  const digestPrevJsonPath = path.join(cwd, "tmp", "dart", "disclosure_digest.prev.json");
  const alertsJsonPath = path.join(cwd, "tmp", "dart", "disclosure_alerts.json");
  const dailyBriefJsonPath = path.join(cwd, "tmp", "dart", "daily_brief.json");
  const digestMdPath = path.join(cwd, "docs", "dart-disclosure-digest.md");
  const alertsMdPath = path.join(cwd, "docs", "dart-disclosure-alerts.md");
  const dailyBriefMdPath = path.join(cwd, "docs", "dart-daily-brief.md");

  const now = new Date();
  const generatedAt = now.toISOString();
  const from = toYyyymmdd(shiftDays(now, -args.days));
  const to = toYyyymmdd(now);

  const watchlistRaw = readJson(watchlistPath, null);
  if (!watchlistRaw) {
    throw new Error(`watchlist file is missing or invalid: ${watchlistPath}`);
  }
  const watchlist = normalizeWatchlist(watchlistRaw);
  const rules = loadRulesFromFile(rulesPath);
  const loadedPrefs = loadAlertPrefsFromFile(prefsPath);
  const loadedProfile = loadAlertProfileFromFile(profilePath);
  const alertPrefs = loadedProfile.preset ? loadedProfile.preset.preferences : loadedPrefs.prefs;
  const alertRules = loadedProfile.preset ? loadedProfile.preset.rules : [];
  const prefsLoadedFrom = loadedProfile.preset ? `${profilePath}#${loadedProfile.preset.id}` : loadedPrefs.loadedFrom;
  const previousState = normalizeState(readJson(statePath, null));
  const previousDigest = readJson(digestJsonPath, null);
  const rulesMeta = {
    categories: rules.categories.length,
    boosters: rules.boosters.length,
    thresholds: rules.thresholds,
    maxHighlightsPerCorp: rules.maxHighlightsPerCorp,
    normalization: rules.normalization,
    clustering: rules.clustering,
  };

  const apiKey = asString(process.env.OPENDART_API_KEY);
  if (!apiKey) {
    const digest = createEmptyDigest({
      generatedAt,
      watchlistPath,
      rulesPath,
      from,
      to,
      finalOnly: args.finalOnly,
      type: args.type,
      companyCount: watchlist.companies.length,
      rulesMeta,
      skippedReason: "OPENDART_API_KEY is missing",
    });
    const nextState = {
      ...previousState,
      generatedAt,
      lastRunAt: generatedAt,
    };
    const digestDiff = diffDigest(previousDigest, digest);
    const rawAlerts = buildAlertsJson({ generatedAt, digestDiff });
    const prefsAppliedAlerts = applyPrefsToAlerts(rawAlerts, alertPrefs);
    const filteredAlerts = applyRulesToAlerts(prefsAppliedAlerts, alertRules);
    const alertsOutput = buildAlertsOutput({
      alerts: filteredAlerts,
      prefs: alertPrefs,
      rulesApplied: alertRules,
      prefsPath,
      prefsLoadedFrom,
      profilePath,
      profileLoadedFrom: loadedProfile.loadedFrom,
      activePresetId: loadedProfile.preset?.id || null,
      activePresetName: loadedProfile.preset?.name || null,
      rawCounts: alertCounts(rawAlerts),
      filteredCounts: alertCounts(filteredAlerts),
    });
    const dailyBrief = buildDailyBrief(filteredAlerts, { maxLines: DAILY_BRIEF_DEFAULT_LINES });
    if (previousDigest) {
      writeJson(digestPrevJsonPath, previousDigest);
    }
    writeJson(statePath, nextState);
    writeJson(digestJsonPath, digest);
    writeJson(alertsJsonPath, alertsOutput);
    writeJson(dailyBriefJsonPath, dailyBrief);
    ensureDir(digestMdPath);
    fs.writeFileSync(digestMdPath, buildDigestMarkdown(digest), "utf-8");
    ensureDir(alertsMdPath);
    fs.writeFileSync(alertsMdPath, buildAlertsMarkdown({
      generatedAt,
      previousGeneratedAt: asString(previousDigest?.generatedAt) || "",
      watchlistPath,
      rulesPath,
      profilePath,
      profileLoadedFrom: loadedProfile.loadedFrom,
      activePresetId: loadedProfile.preset?.id || "",
      activePresetName: loadedProfile.preset?.name || "",
      prefsPath,
      prefs: alertPrefs,
      rulesApplied: alertRules,
      from,
      to,
      alerts: filteredAlerts,
    }), "utf-8");
    ensureDir(dailyBriefMdPath);
    fs.writeFileSync(dailyBriefMdPath, buildDailyBriefMarkdown(dailyBrief), "utf-8");
    console.log("[dart:watch] skip: OPENDART_API_KEY is missing");
    console.log("[dart:watch] generated digest without network call");
    console.log(`[dart:watch] profile=${profilePath} (loaded=${loadedProfile.loadedFrom})`);
    console.log(`[dart:watch] preset=${loadedProfile.preset?.id ?? "-"} rules=${alertRules.length}`);
    console.log(`[dart:watch] prefs=${prefsPath} (loaded=${prefsLoadedFrom})`);
    console.log(`[dart:watch] alerts filtered total=${alertsOutput.meta.filteredCounts.total} raw=${alertsOutput.meta.rawCounts.total}`);
    console.log("[dart:watch] outputs:");
    console.log("  - docs/dart-disclosure-digest.md");
    console.log("  - docs/dart-disclosure-alerts.md");
    console.log("  - docs/dart-daily-brief.md");
    console.log("  - tmp/dart/disclosure_alerts.json");
    console.log("  - tmp/dart/daily_brief.json");
    if (args.strictHigh && hasNewHighAlerts(digestDiff)) {
      console.error("[dart:watch] strict-high mode failed due to 신규 HIGH alerts");
      process.exit(2);
    }
    return;
  }

  const baseUrl = asString(process.env.OPENDART_BASE_URL) || "https://opendart.fss.or.kr";
  const nextState = {
    version: 1,
    generatedAt,
    lastRunAt: generatedAt,
    seenReceiptNos: {},
    lastCheckedAt: {},
  };

  const companies = [];
  let totalItems = 0;
  let totalNew = 0;
  let errors = 0;
  const allClusters = [];

  for (const company of watchlist.companies) {
    const fetched = await fetchCorpDisclosures({
      apiKey,
      baseUrl: baseUrl.replace(/\/+$/, ""),
      corpCode: company.corpCode,
      from,
      to,
      finalOnly: args.finalOnly,
      type: args.type,
    });

    if (!fetched.ok) {
      errors += 1;
      nextState.seenReceiptNos[company.corpCode] = previousState.seenReceiptNos[company.corpCode] ?? [];
      nextState.lastCheckedAt[company.corpCode] = previousState.lastCheckedAt[company.corpCode] ?? "";
      companies.push({
        corpCode: company.corpCode,
        corpName: company.corpName,
        stockCode: company.stockCode,
        checkedAt: generatedAt,
        totalCount: 0,
        newCount: 0,
        summaryLines: ["조회 실패"],
        clusters: [],
        newItems: [],
        latestItems: [],
        error: fetched.error,
      });
      continue;
    }

    const classified = addClassification(sortItems(fetched.items), rules);
    const diff = extractNewDisclosures(previousState.seenReceiptNos[company.corpCode] ?? [], classified, {
      maxSeenPerCorp: MAX_SEEN_PER_CORP,
    });
    const newItems = addClassification(diff.newItems, rules);
    const poolForCluster = newItems.length > 0 ? newItems : classified;
    const clusters = clusterByCorp(poolForCluster, rules.clustering).slice(0, rules.maxHighlightsPerCorp);
    const summaryLines = buildCompanyFiveLineSummary({
      clusters,
    }, 5);

    nextState.seenReceiptNos[company.corpCode] = diff.nextSeenReceiptNos;
    nextState.lastCheckedAt[company.corpCode] = generatedAt;

    totalItems += classified.length;
    totalNew += newItems.length;

    companies.push({
      corpCode: company.corpCode,
      corpName: company.corpName,
      stockCode: company.stockCode,
      checkedAt: generatedAt,
      totalCount: classified.length,
      newCount: newItems.length,
      summaryLines,
      clusters,
      newItems: newItems.slice(0, 30),
      latestItems: classified.slice(0, 30),
      error: "",
    });
    allClusters.push(...clusters);
  }

  const topHighlights = [...allClusters]
    .sort((a, b) => {
      const scoreDiff = clusterScoreOf(b) - clusterScoreOf(a);
      if (scoreDiff !== 0) return scoreDiff;
      const dateA = asString(a.endDate);
      const dateB = asString(b.endDate);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return a.clusterId.localeCompare(b.clusterId);
    })
    .slice(0, TOP_HIGHLIGHT_LIMIT);
  const levelCounts = countLevels(topHighlights.length > 0 ? topHighlights : allClusters);

  const digest = {
    version: 3,
    generatedAt,
    watchlistPath,
    rulesPath,
    from,
    to,
    finalOnly: args.finalOnly,
    type: args.type,
    rules: rulesMeta,
    summary: {
      companies: watchlist.companies.length,
      totalItems,
      totalNew,
      errors,
      levelCounts,
      skippedReason: "",
    },
    topHighlights,
    companies,
  };

  const digestDiff = diffDigest(previousDigest, digest);
  const rawAlerts = buildAlertsJson({ generatedAt, digestDiff });
  const prefsAppliedAlerts = applyPrefsToAlerts(rawAlerts, alertPrefs);
  const filteredAlerts = applyRulesToAlerts(prefsAppliedAlerts, alertRules);
  const alertsOutput = buildAlertsOutput({
    alerts: filteredAlerts,
    prefs: alertPrefs,
    rulesApplied: alertRules,
    prefsPath,
    prefsLoadedFrom,
    profilePath,
    profileLoadedFrom: loadedProfile.loadedFrom,
    activePresetId: loadedProfile.preset?.id || null,
    activePresetName: loadedProfile.preset?.name || null,
    rawCounts: alertCounts(rawAlerts),
    filteredCounts: alertCounts(filteredAlerts),
  });
  const dailyBrief = buildDailyBrief(filteredAlerts, { maxLines: DAILY_BRIEF_DEFAULT_LINES });
  if (previousDigest) {
    writeJson(digestPrevJsonPath, previousDigest);
  }
  writeJson(statePath, nextState);
  writeJson(digestJsonPath, digest);
  writeJson(alertsJsonPath, alertsOutput);
  writeJson(dailyBriefJsonPath, dailyBrief);
  ensureDir(digestMdPath);
  fs.writeFileSync(digestMdPath, buildDigestMarkdown(digest), "utf-8");
  ensureDir(alertsMdPath);
  fs.writeFileSync(alertsMdPath, buildAlertsMarkdown({
    generatedAt,
    previousGeneratedAt: asString(previousDigest?.generatedAt) || "",
    watchlistPath,
    rulesPath,
    profilePath,
    profileLoadedFrom: loadedProfile.loadedFrom,
    activePresetId: loadedProfile.preset?.id || "",
    activePresetName: loadedProfile.preset?.name || "",
    prefsPath,
    prefs: alertPrefs,
    rulesApplied: alertRules,
    from,
    to,
    alerts: filteredAlerts,
  }), "utf-8");
  ensureDir(dailyBriefMdPath);
  fs.writeFileSync(dailyBriefMdPath, buildDailyBriefMarkdown(dailyBrief), "utf-8");

  console.log(`[dart:watch] watchlist=${watchlistPath}`);
  console.log(`[dart:watch] rules=${rulesPath}`);
  console.log(`[dart:watch] profile=${profilePath} (loaded=${loadedProfile.loadedFrom})`);
  console.log(`[dart:watch] preset=${loadedProfile.preset?.id ?? "-"} rules=${alertRules.length}`);
  console.log(`[dart:watch] prefs=${prefsPath} (loaded=${prefsLoadedFrom})`);
  console.log(`[dart:watch] companies=${watchlist.companies.length} totalItems=${totalItems} totalNew=${totalNew} errors=${errors}`);
  console.log(`[dart:watch] delta new=${digestDiff.newClusters.length} updated=${digestDiff.updatedClusters.length} highMid=${digestDiff.highlightsHighMid.length}`);
  console.log(`[dart:watch] alerts filtered total=${alertsOutput.meta.filteredCounts.total} raw=${alertsOutput.meta.rawCounts.total}`);
  console.log("[dart:watch] outputs:");
  console.log("  - docs/dart-disclosure-digest.md");
  console.log("  - docs/dart-disclosure-alerts.md");
  console.log("  - docs/dart-daily-brief.md");
  console.log("  - tmp/dart/disclosure_state.json");
  console.log("  - tmp/dart/disclosure_digest.json");
  console.log("  - tmp/dart/disclosure_alerts.json");
  console.log("  - tmp/dart/daily_brief.json");

  if (args.strictHigh && hasNewHighAlerts(digestDiff)) {
    console.error("[dart:watch] strict-high mode failed due to 신규 HIGH alerts");
    process.exit(2);
  }

  if (args.strict && errors > 0) {
    console.error("[dart:watch] strict mode failed due to upstream errors");
    process.exit(1);
  }
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dart:watch] failed: ${message}`);
    process.exit(1);
  });
}
