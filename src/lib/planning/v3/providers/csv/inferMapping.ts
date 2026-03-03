import { normalizeHeader } from "./headerNormalize";
import { type CsvMappingConfidence, type CsvMappingInferResult } from "./types";

type MatchKind = "exact" | "contains" | "none";

type HeaderMatch = {
  header: string;
  normalizedHeader: string;
  compactHeader: string;
  kind: MatchKind;
  alias: string;
  score: number;
  index: number;
};

type AliasEntry = {
  alias: string;
  normalized: string;
  compact: string;
};

const DATE_ALIASES = [
  "date",
  "transaction date",
  "posting date",
  "거래일",
  "거래일자",
  "거래일시",
  "승인일",
  "승인일자",
  "입금일",
  "출금일",
] as const;

const AMOUNT_ALIASES = [
  "amount",
  "amt",
  "거래금액",
  "금액",
  "이용금액",
  "결제금액",
  "승인금액",
  "거래 금액",
] as const;

const INFLOW_ALIASES = [
  "inflow",
  "deposit",
  "credit",
  "입금",
  "수입",
  "입금액",
  "입금 금액",
] as const;

const OUTFLOW_ALIASES = [
  "outflow",
  "withdraw",
  "debit",
  "출금",
  "지출",
  "출금액",
  "출금 금액",
] as const;

const DESC_ALIASES = [
  "desc",
  "description",
  "memo",
  "note",
  "적요",
  "내용",
  "거래내용",
  "가맹점",
  "메모",
] as const;

function confidenceFromKind(kind: MatchKind): CsvMappingConfidence {
  if (kind === "exact") return "high";
  if (kind === "contains") return "mid";
  return "low";
}

function compactText(value: string): string {
  return value.replace(/\s+/g, "");
}

function normalizeAliases(aliases: readonly string[]): AliasEntry[] {
  return aliases.map((alias) => {
    const normalized = normalizeHeader(alias);
    return {
      alias,
      normalized,
      compact: compactText(normalized),
    };
  });
}

function scoreHeader(
  normalizedHeader: string,
  compactHeader: string,
  alias: AliasEntry,
): { kind: MatchKind; score: number } {
  if (!normalizedHeader || !alias.normalized) {
    return { kind: "none", score: 0 };
  }

  if (normalizedHeader === alias.normalized || compactHeader === alias.compact) {
    return { kind: "exact", score: 3 };
  }

  if (
    normalizedHeader.includes(alias.normalized)
    || compactHeader.includes(alias.compact)
  ) {
    return { kind: "contains", score: 2 };
  }

  return { kind: "none", score: 0 };
}

function findBestMatch(headers: string[], aliases: readonly string[]): HeaderMatch | null {
  const normalizedAliases = normalizeAliases(aliases);
  let best: HeaderMatch | null = null;

  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index] ?? "";
    const normalizedHeader = normalizeHeader(header);
    if (!normalizedHeader) continue;
    const compactHeader = compactText(normalizedHeader);

    for (const alias of normalizedAliases) {
      const scored = scoreHeader(normalizedHeader, compactHeader, alias);
      if (scored.score < 1) continue;

      const candidate: HeaderMatch = {
        header,
        normalizedHeader,
        compactHeader,
        kind: scored.kind,
        alias: alias.alias,
        score: scored.score,
        index,
      };

      if (!best || candidate.score > best.score) {
        best = candidate;
        continue;
      }

      if (candidate.score === best.score) {
        if (candidate.normalizedHeader.length < best.normalizedHeader.length) {
          best = candidate;
          continue;
        }
        if (
          candidate.normalizedHeader.length === best.normalizedHeader.length
          && candidate.index < best.index
        ) {
          best = candidate;
        }
      }
    }
  }

  return best;
}

function pushReason(reasons: string[], message: string): void {
  if (reasons.includes(message)) return;
  reasons.push(message);
}

export function inferCsvMapping(headers: string[]): CsvMappingInferResult {
  const reasons: string[] = [];

  const dateMatch = findBestMatch(headers, DATE_ALIASES);
  const amountMatch = findBestMatch(headers, AMOUNT_ALIASES);
  const inflowMatch = findBestMatch(headers, INFLOW_ALIASES);
  const outflowMatch = findBestMatch(headers, OUTFLOW_ALIASES);
  const descMatch = findBestMatch(headers, DESC_ALIASES);

  const dateKey = dateMatch?.header;
  let amountKey = amountMatch?.header;
  let inflowKey: string | undefined;
  let outflowKey: string | undefined;
  const descKey = descMatch?.header;

  if (dateMatch) {
    pushReason(reasons, `date 추천: "${dateMatch.header}" (${dateMatch.kind})`);
  }

  if (descMatch) {
    pushReason(reasons, `desc 추천: "${descMatch.header}" (${descMatch.kind})`);
  }

  const hasInflowOutflowPair = Boolean(inflowMatch && outflowMatch);
  const inflowHigh = inflowMatch?.kind === "exact";
  const outflowHigh = outflowMatch?.kind === "exact";

  if (hasInflowOutflowPair && inflowHigh && outflowHigh) {
    inflowKey = inflowMatch?.header;
    outflowKey = outflowMatch?.header;
    amountKey = undefined;
    pushReason(reasons, `금액 모드 추천: inflow/outflow ("${inflowKey}", "${outflowKey}")`);
  } else if (amountMatch) {
    pushReason(reasons, `amount 추천: "${amountMatch.header}" (${amountMatch.kind})`);
  } else if (hasInflowOutflowPair) {
    inflowKey = inflowMatch?.header;
    outflowKey = outflowMatch?.header;
    pushReason(reasons, `금액 모드 추천: inflow/outflow ("${inflowKey}", "${outflowKey}")`);
  }

  const collisionMap = new Map<string, string[]>();
  const selected: Array<[string, string | undefined]> = [
    ["date", dateKey],
    ["amount", amountKey],
    ["inflow", inflowKey],
    ["outflow", outflowKey],
    ["desc", descKey],
  ];

  for (const [field, header] of selected) {
    if (!header) continue;
    const mappedFields = collisionMap.get(header) ?? [];
    mappedFields.push(field);
    collisionMap.set(header, mappedFields);
  }

  for (const [header, mappedFields] of collisionMap.entries()) {
    if (mappedFields.length > 1) {
      pushReason(reasons, `충돌: "${header}" 헤더가 ${mappedFields.join(", ")}에 중복 매핑되었습니다.`);
    }
  }

  const usingAmountMode = Boolean(amountKey);

  return {
    ...(dateKey ? { dateKey } : {}),
    ...(amountKey ? { amountKey } : {}),
    ...(inflowKey ? { inflowKey } : {}),
    ...(outflowKey ? { outflowKey } : {}),
    ...(descKey ? { descKey } : {}),
    confidence: {
      date: confidenceFromKind(dateMatch?.kind ?? "none"),
      amount: usingAmountMode
        ? confidenceFromKind(amountMatch?.kind ?? "none")
        : (hasInflowOutflowPair
          ? (inflowHigh && outflowHigh
            ? "high"
            : (inflowMatch?.kind === "contains" || outflowMatch?.kind === "contains")
              ? "mid"
              : "low")
          : "low"),
      desc: confidenceFromKind(descMatch?.kind ?? "none"),
    },
    reasons,
  };
}
