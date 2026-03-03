import { type CsvMappingConfidence, type CsvMappingInferResult } from "./types";

const DATE_ALIASES = [
  "date", "transaction date", "posting date",
  "거래일", "거래일자", "거래일시", "승인일", "승인일자", "입금일", "출금일",
];
const AMOUNT_ALIASES = [
  "amount", "amt", "거래금액", "금액", "이용금액", "결제금액", "승인금액", "거래 금액",
];
const INFLOW_ALIASES = [
  "inflow", "deposit", "credit", "입금", "수입", "입금액", "입금 금액",
];
const OUTFLOW_ALIASES = [
  "outflow", "withdraw", "debit", "출금", "지출", "출금액", "출금 금액",
];
const DESC_ALIASES = [
  "desc", "description", "memo", "note", "적요", "내용", "거래내용", "가맹점", "메모",
];

function normalizeHeader(value: string): string {
  return value
    .trim()
    .replace(/[()[\]{}]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeAlias(value: string): string {
  return normalizeHeader(value);
}

type Candidate = {
  key?: string;
  confidence: CsvMappingConfidence;
  reason?: string;
  score: number;
};

function confidenceFromScore(score: number): CsvMappingConfidence {
  if (score >= 3) return "high";
  if (score >= 2) return "mid";
  return "low";
}

function pickCandidate(headers: string[], aliases: string[], label: string): Candidate {
  const normalizedAliases = aliases.map((alias) => normalizeAlias(alias));
  let best: Candidate = { confidence: "low", score: 0 };

  for (const rawHeader of headers) {
    const header = normalizeHeader(rawHeader);
    if (!header) continue;

    for (const alias of normalizedAliases) {
      let score = 0;
      let rule = "";
      if (header === alias) {
        score = 3;
        rule = "exact";
      } else if (header.includes(alias) || alias.includes(header)) {
        score = 2;
        rule = "contains";
      }
      if (score > best.score) {
        best = {
          key: rawHeader,
          confidence: confidenceFromScore(score),
          reason: `${label}: ${rawHeader} (${rule})`,
          score,
        };
      }
    }
  }

  return best;
}

export function inferCsvMapping(headers: string[]): CsvMappingInferResult {
  const dateCandidate = pickCandidate(headers, DATE_ALIASES, "date");
  const amountCandidate = pickCandidate(headers, AMOUNT_ALIASES, "amount");
  const inflowCandidate = pickCandidate(headers, INFLOW_ALIASES, "inflow");
  const outflowCandidate = pickCandidate(headers, OUTFLOW_ALIASES, "outflow");
  const descCandidate = pickCandidate(headers, DESC_ALIASES, "desc");

  const reasons = [
    dateCandidate.reason,
    amountCandidate.reason,
    inflowCandidate.reason,
    outflowCandidate.reason,
    descCandidate.reason,
  ].filter((reason): reason is string => typeof reason === "string" && reason.length > 0);

  const shouldPreferInOut = inflowCandidate.score >= 3 && outflowCandidate.score >= 3;
  const usesInOut = shouldPreferInOut || (!amountCandidate.key && inflowCandidate.key && outflowCandidate.key);
  const amountConfidence = usesInOut
    ? confidenceFromScore(Math.min(inflowCandidate.score, outflowCandidate.score))
    : amountCandidate.confidence;

  const result: CsvMappingInferResult = {
    ...(dateCandidate.key ? { dateKey: dateCandidate.key } : {}),
    ...(usesInOut
      ? {
          ...(inflowCandidate.key ? { inflowKey: inflowCandidate.key } : {}),
          ...(outflowCandidate.key ? { outflowKey: outflowCandidate.key } : {}),
        }
      : (amountCandidate.key ? { amountKey: amountCandidate.key } : {})),
    ...(descCandidate.key ? { descKey: descCandidate.key } : {}),
    confidence: {
      date: dateCandidate.confidence,
      amount: amountConfidence,
      desc: descCandidate.confidence,
    },
    reasons,
  };

  if (result.dateKey && result.descKey && result.dateKey === result.descKey) {
    result.reasons = [...result.reasons, "date/desc conflict detected"];
  }
  if (result.dateKey && result.amountKey && result.dateKey === result.amountKey) {
    result.reasons = [...result.reasons, "date/amount conflict detected"];
  }
  if (result.inflowKey && result.outflowKey && result.inflowKey === result.outflowKey) {
    result.reasons = [...result.reasons, "inflow/outflow conflict detected"];
  }

  return result;
}

