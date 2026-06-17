const TOP_LEVEL_PATH_LABELS: Record<string, string> = {
  currentAge: "현재 나이",
  birthYear: "출생연도",
  gender: "성별",
  sido: "지역",
  sigungu: "시군구",
  monthlyIncomeNet: "월 소득",
  monthlyEssentialExpenses: "월 필수지출",
  monthlyDiscretionaryExpenses: "월 변동지출",
  liquidAssets: "현금성 자산",
  investmentAssets: "투자자산",
  debts: "부채",
  goals: "재무 목표",
  cashflow: "현금흐름",
  tax: "세금 기준",
  pensionsDetailed: "연금 정보",
  defaultsApplied: "기본값 적용 내역",
};

const NESTED_FIELD_LABELS: Record<string, string> = {
  id: "번호",
  name: "이름",
  balance: "잔액",
  minimumPayment: "최소 상환액",
  aprPct: "연 이자율",
  apr: "연 이자율",
  remainingMonths: "남은 상환 개월",
  repaymentType: "상환 방식",
  targetAmount: "목표 금액",
  currentAmount: "현재 모은 금액",
  targetMonth: "목표 시점",
  priority: "우선순위",
  minimumMonthlyContribution: "월 최소 적립액",
  monthlyIncomeKrw: "월 소득",
  monthlyFixedExpensesKrw: "월 고정지출",
  monthlyVariableExpensesKrw: "월 변동지출",
  phases: "소득/지출 구간",
  pensions: "연금 수입",
  contributions: "저축/투자 이체",
  rules: "현금흐름 규칙",
  title: "이름",
  range: "기간",
  startMonth: "시작 월",
  endMonth: "종료 월",
  monthlyPayoutKrw: "월 수령액",
  from: "출발 자금",
  to: "도착 자금",
  monthlyAmountKrw: "월 이체액",
  phaseOverlapPolicy: "구간 겹침 처리",
  regime: "기준 국가",
  filingStatus: "신고 유형",
  dependents: "부양가족 수",
  notes: "메모",
  nationalPension: "국민연금",
  retirementPension: "퇴직연금",
  personalPension: "개인연금",
  expectedMonthlyPayoutKrw: "예상 월 수령액",
  startAge: "시작 나이",
  type: "유형",
  version: "버전",
  items: "적용 항목",
  assumptions: "가정",
  emergencyMonths: "비상자금 개월",
  goalPriority: "목표 우선순위",
  missingFieldsPolicy: "누락 항목 처리",
  appliedAt: "적용일",
};

export type ProfileOption = {
  profileId: string;
  name?: string;
  updatedAt?: string;
};

type TargetProfileLabelOptions = {
  emptyLabel?: string;
  unknownPrefix?: string;
};

function isDisplayRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asDisplayString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readProfileDraftApiErrorMessage(payload: unknown): string {
  if (!isDisplayRecord(payload) || !isDisplayRecord(payload.error)) return "";
  return asDisplayString(payload.error.message);
}

export function formatProfileOptionLabel(profile: ProfileOption): string {
  const name = asDisplayString(profile.name);
  if (name.toLowerCase() === "default") return "기본 상담 정보";
  if (name) return name;
  const profileId = asDisplayString(profile.profileId);
  return profileId ? `상담 정보 ${profileId}` : "이름 없는 상담 정보";
}

export function formatTargetProfileLabel(
  profileId: string | null | undefined,
  profiles: ProfileOption[] = [],
  options: TargetProfileLabelOptions = {},
): string {
  const normalized = asDisplayString(profileId);
  if (!normalized) return options.emptyLabel ?? "새 상담 정보";
  const matchedProfile = profiles.find((profile) => profile.profileId === normalized);
  if (matchedProfile) return formatProfileOptionLabel(matchedProfile);
  return `${options.unknownPrefix ?? "상담 정보"} ${normalized}`;
}

function decodePointerToken(value: string): string {
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

function parseJsonPointer(path: string): string[] {
  const normalized = path.trim();
  if (!normalized || normalized === "/") return [];
  return normalized
    .replace(/^\/+/, "")
    .split("/")
    .map(decodePointerToken)
    .filter((segment) => segment.length > 0);
}

function isIndexToken(value: string | undefined): value is string {
  return Boolean(value && /^\d+$/.test(value));
}

function formatIndex(value: string): string {
  return `${Number(value) + 1}`;
}

function fieldLabel(segment: string | undefined): string {
  if (!segment) return "";
  return NESTED_FIELD_LABELS[segment] ?? TOP_LEVEL_PATH_LABELS[segment] ?? segment;
}

function formatIndexedPath(collectionLabel: string, index: string | undefined, field: string | undefined): string {
  if (!isIndexToken(index)) return field ? `${collectionLabel} > ${fieldLabel(field)}` : collectionLabel;
  const rowLabel = `${collectionLabel} ${formatIndex(index)}`;
  return field ? `${rowLabel}의 ${fieldLabel(field)}` : rowLabel;
}

function formatRemainingPath(segments: string[]): string {
  const labels: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    if (isIndexToken(segment)) {
      const previous = labels.pop() ?? "항목";
      labels.push(`${previous} ${formatIndex(segment)}`);
      continue;
    }
    labels.push(fieldLabel(segment));
  }
  return labels.join(" > ");
}

function stringifyPreflightValue(value: unknown): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "예" : "아니요";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length > 0 ? `항목 ${value.length.toLocaleString("ko-KR")}개` : "항목 없음";
  if (typeof value === "object") {
    const count = Object.keys(value).length;
    return count > 0 ? `세부 정보 ${count.toLocaleString("ko-KR")}개` : "세부 정보 없음";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatPreflightValue(path: string, value: unknown): string {
  if (value === undefined) return "-";
  const normalizedPath = path.toLowerCase();
  const parsed = typeof value === "number"
    ? value
    : (typeof value === "string" && value.trim() ? Number(value.trim()) : Number.NaN);

  if (Number.isFinite(parsed)) {
    const rounded = Math.round(parsed);
    if (normalizedPath.includes("pct") || normalizedPath.includes("apr")) {
      return `${parsed.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
    }
    if (normalizedPath.includes("age")) return `${rounded.toLocaleString("ko-KR")}세`;
    if (normalizedPath.includes("year")) return `${rounded}년`;
    if (
      normalizedPath.includes("krw")
      || normalizedPath.includes("amount")
      || normalizedPath.includes("income")
      || normalizedPath.includes("expense")
      || normalizedPath.includes("payment")
    ) {
      return `${rounded.toLocaleString("ko-KR")}원`;
    }
    if (normalizedPath.includes("month")) return `${rounded.toLocaleString("ko-KR")}개월`;
    if (normalizedPath.includes("count") || normalizedPath.includes("rows")) return `${rounded.toLocaleString("ko-KR")}건`;
    return parsed.toLocaleString("ko-KR");
  }

  return stringifyPreflightValue(value);
}

export function formatPreflightPathLabel(path: string): string {
  const segments = parseJsonPointer(path);
  if (segments.length < 1) return "상담 정보 전체";

  const [root, index, field, ...rest] = segments;
  if (root === "goals") {
    return formatRemainingPath([formatIndexedPath("재무 목표", index, field), ...rest]);
  }
  if (root === "debts") {
    return formatRemainingPath([formatIndexedPath("부채", index, field), ...rest]);
  }
  if (root === "cashflow" && (index === "phases" || index === "pensions" || index === "contributions")) {
    const collectionLabel = fieldLabel(index);
    const collectionIndex = field;
    const collectionField = rest[0];
    return formatRemainingPath(["현금흐름", formatIndexedPath(collectionLabel, collectionIndex, collectionField), ...rest.slice(1)]);
  }

  return formatRemainingPath(segments) || "상담 정보 전체";
}
