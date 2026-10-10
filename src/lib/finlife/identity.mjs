// One identity contract for API joins, CLI snapshots and persistent product references.
// Disclosure month is a version, not a stable product identifier.
const DIVISIONS = { deposit: "D", saving: "S", pension: "P", "mortgage-loan": "M", "rent-house-loan": "R", "credit-loan": "C" };
const text = (value) => String(value ?? "").trim();
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export class FinlifeIntegrityError extends Error {
  constructor(message) { super("FINLIFE integrity: " + message); this.name = "FinlifeIntegrityError"; this.code = "FINLIFE_INTEGRITY_FAILED"; }
}
const fail = (message) => { throw new FinlifeIntegrityError(message); };
export function normalizeFinlifeCompany(value) {
  const valueText = text(value);
  return /^\d+$/.test(valueText) ? valueText.padStart(7, "0") : valueText;
}
function assertIdentity(row, kind) {
  if (!/^\d{7}$/.test(normalizeFinlifeCompany(row.fin_co_no)) || !text(row.fin_prdt_cd)) fail("missing company/product identity");
  if (kind === "credit-loan" && !text(row.crdt_prdt_type)) fail("missing credit-loan subtype");
}
export function finlifeIdentity(kind, value) {
  const row = record(value);
  if (!Object.hasOwn(DIVISIONS, kind)) fail("unknown product kind");
  assertIdentity(row, kind);
  const parts = [kind, normalizeFinlifeCompany(row.fin_co_no), text(row.fin_prdt_cd)];
  if (kind === "credit-loan") parts.push(text(row.crdt_prdt_type));
  return "finlife:" + parts.map(encodeURIComponent).join(":");
}
export function finlifeRowKey(value) {
  const row = record(value);
  return JSON.stringify([normalizeFinlifeCompany(row.fin_co_no), text(row.fin_prdt_cd), text(row.dcls_month), text(row.crdt_prdt_type)]);
}
export function canonicalFinlifeValue(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalFinlifeValue).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).filter(k => k !== "top_fin_grp_no").sort().map(k => JSON.stringify(k) + ":" + canonicalFinlifeValue(value[k])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
function assertRow(row, kind) {
  assertIdentity(row, kind);
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(text(row.dcls_month))) fail("missing/invalid disclosure month");
}
function assertBaseKind(row, kind) {
  // These fields describe the product itself. Never relabel an upstream loan as a pension.
  if (kind === "pension" && (!text(row.pnsn_kind) || !text(row.prdt_type) || text(row.loan_type) || text(row.crdt_prdt_type))) fail("pension product schema/kind mismatch");
  if (kind !== "credit-loan" && text(row.crdt_prdt_type)) fail("credit-loan product kind mismatch");
  if (kind !== "pension" && text(row.pnsn_kind)) fail("pension product kind mismatch");
}
export function joinFinlifeRows(baseList, optionList, { kind, strict = false } = {}) {
  if (!Array.isArray(baseList) || !Array.isArray(optionList)) fail("missing base/option arrays");
  const products = new Map();
  for (const value of baseList) {
    const raw = record(value);
    if (!text(raw.fin_prdt_cd)) fail("missing product code");
    if (strict) { assertRow(raw, kind); assertBaseKind(raw, kind); }
    const key = finlifeRowKey(raw), previous = products.get(key);
    if (previous) {
      if (canonicalFinlifeValue(previous.raw) !== canonicalFinlifeValue(raw)) fail("conflicting duplicate base identity");
      continue;
    }
    products.set(key, { raw, options: [] });
  }
  const seenOptions = new Set();
  for (const value of optionList) {
    const raw = record(value);
    if (strict) assertRow(raw, kind);
    const parent = products.get(finlifeRowKey(raw));
    if (!parent) fail("orphan option (company/product/month/subtype mismatch)");
    const key = canonicalFinlifeValue(raw);
    if (seenOptions.has(key)) continue;
    seenOptions.add(key);
    parent.options.push(raw);
  }
  return [...products.values()];
}
export function validateFinlifeResponse(kind, payload, { pageNo } = {}) {
  const result = record(record(payload).result);
  if (text(result.err_cd) && result.err_cd !== "000") {
    const error = new FinlifeIntegrityError("upstream result is not successful");
    error.code = "FINLIFE_UPSTREAM_FAILED";
    throw error;
  }
  if (result.err_cd !== "000") fail("missing upstream result code");
  if (result.prdt_div !== DIVISIONS[kind]) fail("response product division mismatch");
  const responseInteger = (value) => typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value.trim())) ? Number(value) : NaN;
  const now = responseInteger(result.now_page_no), max = responseInteger(result.max_page_no), total = responseInteger(result.total_count);
  if (!Number.isInteger(now) || now < 1 || !Number.isInteger(max) || max < 1 || now > max || (pageNo !== undefined && now !== pageNo) || !Number.isInteger(total) || total < 0) fail("response paging mismatch");
  const joined = joinFinlifeRows(result.baseList, result.optionList, { kind, strict: true });
  if (total > 0 && joined.length === 0) fail("empty page contradicts upstream count");
  if (now === 1 && max === 1 && joined.length !== total) fail("response count mismatch");
  return joined;
}
function productRaw(item) {
  return { ...record(item.raw), fin_co_no: item.fin_co_no ?? record(item.raw).fin_co_no, fin_prdt_cd: item.fin_prdt_cd };
}
export function mergeFinlifeProducts(items, { kind } = {}) {
  const products = new Map();
  for (const item of items) {
    const raw = productRaw(item);
    const key = JSON.stringify([kind ?? "", normalizeFinlifeCompany(raw.fin_co_no), text(raw.fin_prdt_cd), text(raw.crdt_prdt_type)]);
    const previous = products.get(key);
    if (!previous) { products.set(key, { ...item, options: [...item.options] }); continue; }
    const oldMonth = text(previous.raw?.dcls_month), newMonth = text(raw.dcls_month);
    if (newMonth > oldMonth) { products.set(key, { ...item, options: [...item.options] }); continue; }
    if (newMonth < oldMonth) continue;
    if (canonicalFinlifeValue(productRaw(previous)) !== canonicalFinlifeValue(raw)) fail("conflicting duplicate product identity");
    const options = new Map(previous.options.map(o => [canonicalFinlifeValue(o.raw ?? o), o]));
    for (const option of item.options) options.set(canonicalFinlifeValue(option.raw ?? option), option);
    previous.options = [...options.values()];
  }
  return [...products.values()];
}
export function validateFinlifeProducts(kind, items) {
  if (!Array.isArray(items)) fail("missing products");
  for (const item of items) {
    const raw = record(item.raw);
    if (item.identityKey !== undefined && item.identityKey !== finlifeIdentity(kind, raw)) fail("normalized identity key mismatch");
    if (text(item.fin_prdt_cd) !== text(raw.fin_prdt_cd) || normalizeFinlifeCompany(item.fin_co_no) !== normalizeFinlifeCompany(raw.fin_co_no)) fail("normalized/raw product identity mismatch");
    joinFinlifeRows([raw], (item.options ?? []).map(o => o.raw), { kind, strict: true });
  }
  const merged = mergeFinlifeProducts(items, { kind });
  // Duplicates are detected and consolidated only when their complete source data agrees.
  for (const item of merged) finlifeIdentity(kind, item.raw);
  return merged;
}
