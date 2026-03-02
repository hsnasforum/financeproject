import { isAllowedFixId, type AllowedFixId } from "../dev/fixCatalog";

export type FixFailureCause =
  | "MISSING_OPENDART_KEY"
  | "MISSING_CORP_INDEX"
  | "DB_NOT_READY"
  | "UPSTREAM_UNAVAILABLE"
  | "PERMISSION_DENIED"
  | "UNKNOWN";

export type FixFailureAnalysis = {
  cause: FixFailureCause;
  summary: string;
  suggestedFixIds: AllowedFixId[];
};

type AnalyzeFixFailureInput = {
  fixId?: string;
  stdoutTail?: string;
  stderrTail?: string;
};

type MatchRule = {
  cause: FixFailureCause;
  summary: string;
  patterns: RegExp[];
  suggestedFixIds: AllowedFixId[];
};

const RULES: MatchRule[] = [
  {
    cause: "PERMISSION_DENIED",
    summary: "권한 오류로 실행에 실패했습니다. 파일/폴더 권한을 확인하세요.",
    patterns: [/permission denied/i, /\beacces\b/i, /\beperm\b/i, /operation not permitted/i],
    suggestedFixIds: [],
  },
  {
    cause: "MISSING_OPENDART_KEY",
    summary: "OPENDART_API_KEY 설정이 없어 DART 관련 Fix를 진행할 수 없습니다.",
    patterns: [
      /opendart_api_key[\w\s:=-]*(missing|required|없|need)/i,
      /opendart[^.\n]{0,80}(key|설정)[^.\n]{0,80}(missing|required|없|필요)/i,
      /OpenDART 설정이 필요/i,
    ],
    suggestedFixIds: ["DART_WATCH", "DAILY_REFRESH"],
  },
  {
    cause: "MISSING_CORP_INDEX",
    summary: "corpCodes 인덱스가 없어 DART 조회가 실패했습니다.",
    patterns: [
      /corp(?:code|codes)[^.\n]{0,80}index[^.\n]{0,80}(missing|없|not found|required)/i,
      /corp index schema mismatch/i,
      /dart:ensure-corpindex/i,
      /인덱스가 없습니다/i,
    ],
    suggestedFixIds: ["DART_WATCH"],
  },
  {
    cause: "DB_NOT_READY",
    summary: "DB 준비 상태가 불완전합니다. 스키마/시드 적용이 필요합니다.",
    patterns: [
      /\bprisma\b/i,
      /database_url/i,
      /can't reach database server/i,
      /no such table/i,
      /\bP10\d{2}\b/,
      /sqlite/i,
      /db push/i,
    ],
    suggestedFixIds: ["PRISMA_DB_PUSH", "SEED_DEBUG", "DATA_DOCTOR"],
  },
  {
    cause: "UPSTREAM_UNAVAILABLE",
    summary: "외부 데이터 소스가 불안정하거나 일시적으로 응답하지 않습니다.",
    patterns: [
      /\benotfound\b/i,
      /\beconnrefused\b/i,
      /\beconnreset\b/i,
      /\betimedout\b/i,
      /request_timeout/i,
      /fetch failed/i,
      /service unavailable/i,
      /\b(502|503|504)\b/,
      /upstream/i,
    ],
    suggestedFixIds: ["DATA_DOCTOR", "DAILY_REFRESH"],
  },
];

function toLogText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asAllowedFixId(value: string | undefined): AllowedFixId | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return isAllowedFixId(normalized) ? normalized : null;
}

function uniqueFixIds(input: Array<AllowedFixId | null | undefined>): AllowedFixId[] {
  const set = new Set<AllowedFixId>();
  for (const fixId of input) {
    if (!fixId) continue;
    set.add(fixId);
  }
  return [...set];
}

export function analyzeFixFailure(input: AnalyzeFixFailureInput): FixFailureAnalysis {
  const stdoutTail = toLogText(input.stdoutTail);
  const stderrTail = toLogText(input.stderrTail);
  const merged = `${stderrTail}\n${stdoutTail}`.trim();
  const currentFix = asAllowedFixId(input.fixId);

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(merged))) {
      return {
        cause: rule.cause,
        summary: rule.summary,
        suggestedFixIds: uniqueFixIds([currentFix, ...rule.suggestedFixIds]),
      };
    }
  }

  return {
    cause: "UNKNOWN",
    summary: "실패 로그에서 명확한 원인을 분류하지 못했습니다. 로그를 확인해 수동 조치가 필요합니다.",
    suggestedFixIds: uniqueFixIds([currentFix]),
  };
}
