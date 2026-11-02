export function parseExchangeRate(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeExchangeCurrencyUnit(raw) {
  const text = raw.trim().toUpperCase();
  const plain = text.match(/^([A-Z]{3})$/);
  if (plain) return { code: plain[1], scale: 1 };

  const scaled = text.match(/^([A-Z]{3})\s*\(\s*(\d+)\s*\)$/);
  if (!scaled) return null;
  const scale = Number(scaled[2]);
  if (!Number.isSafeInteger(scale) || scale <= 0) return null;
  return { code: scaled[1], scale };
}

export function normalizeExchangeQuoteDate(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const matched = text.match(/^(\d{4})(\d{2})(\d{2})$/)
    ?? text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (!Number.isInteger(year) || year < 1 || month < 1 || month > 12 || day < 1) return null;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) return null;

  return `${matched[1]}-${matched[2]}-${matched[3]}`;
}

export function extractEximExchangeRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  for (const key of ["data", "rows", "items", "result", "response"]) {
    const value = raw[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      for (const nestedKey of ["data", "rows", "items", "list"]) {
        if (Array.isArray(value[nestedKey])) return value[nestedKey];
      }
    }
  }
  return [];
}

function firstPresent(row, keys) {
  const key = keys.find((candidate) => Object.hasOwn(row, candidate));
  return key === undefined ? undefined : row[key];
}

/**
 * AP01 has no response date: a successful batch belongs to its explicit searchdate.
 * Dated legacy inputs remain usable without request context; they may omit result.
 * No calendar/business-day fallback or current-date inference occurs here.
 */
export function validateEximExchangeRows(raw, context = {}) {
  const requestedDate = context?.requestedDate;
  const hasRequestedDate = requestedDate !== undefined;
  const requestedAsOf = hasRequestedDate ? normalizeExchangeQuoteDate(requestedDate) : null;
  if (hasRequestedDate && !requestedAsOf) return null;

  const rows = extractEximExchangeRows(raw);
  if (rows.length === 0) return null;
  const rates = {};
  let asOf = requestedAsOf;
  let batchHasSourceDate = null;

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    if (row.result !== 1 && row.result !== "1") {
      if (hasRequestedDate || row.result !== undefined) return null;
    }

    const currencyRaw = hasRequestedDate ? row.cur_unit : firstPresent(row, ["cur_unit", "curUnit", "currency"]);
    if (typeof currencyRaw !== "string") return null;
    const currency = normalizeExchangeCurrencyUnit(currencyRaw);
    if (!currency || Object.hasOwn(rates, currency.code)) return null;

    const rateRaw = hasRequestedDate
      ? row.deal_bas_r
      : firstPresent(row, ["deal_bas_r", "dealBasR", "kftcDealBasR", "rate", "baseRate", "tts", "ttb"]);
    if (typeof rateRaw !== "number" && typeof rateRaw !== "string") return null;
    if (typeof rateRaw === "string" && !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(rateRaw.trim())) return null;
    const rate = parseExchangeRate(rateRaw);
    if (rate === null || rate <= 0) return null;
    const unitRate = rate / currency.scale;
    if (!Number.isFinite(unitRate) || unitRate <= 0) return null;

    const dateKeys = ["deal_bas_dt", "dealBasDt", "asOf"].filter((key) => Object.hasOwn(row, key));
    const hasSourceDate = dateKeys.length > 0;
    if (batchHasSourceDate !== null && batchHasSourceDate !== hasSourceDate) return null;
    batchHasSourceDate = hasSourceDate;
    if (!hasSourceDate && !hasRequestedDate) return null;
    for (const key of dateKeys) {
      const rowAsOf = normalizeExchangeQuoteDate(row[key]);
      if (!rowAsOf || (asOf !== null && rowAsOf !== asOf)) return null;
      asOf = rowAsOf;
    }

    rates[currency.code] = unitRate;
  }

  return asOf === null ? null : { asOf, rates, rowCount: rows.length };
}
