import { type FinlifeKind } from "@/lib/finlife/types";

export type LabeledItem = {
  label: string;
  value: string;
  help?: string;
};

type Formatter = (value: string) => string;

type FieldDescriptor = {
  label: string;
  help?: string;
  formatter?: Formatter;
  hiddenByDefault?: boolean;
};

const KIND_SUMMARY: Record<FinlifeKind, string> = {
  deposit: "목돈을 일정 기간 예치하고 이자를 받는 예금 상품입니다.",
  saving: "매달 돈을 납입해 만기에 목돈을 만드는 적금 상품입니다.",
  pension: "노후 준비를 위해 장기간 납입·운용하는 연금저축 상품입니다.",
  "mortgage-loan": "주택을 담보로 자금을 빌리는 대출 상품입니다. 금리방식과 상환방식에 따라 부담이 달라질 수 있습니다.",
  "rent-house-loan": "전세 보증금 마련을 위한 주거 목적 대출 상품입니다.",
  "credit-loan": "담보 없이 신용도를 바탕으로 이용하는 대출 상품입니다.",
};

const JOIN_DENY_MAP: Record<string, string> = {
  "1": "가입 제한 없음",
  "2": "서민전용 상품",
  "3": "일부 가입 제한 있음",
};

function normalizeKey(key: string): string {
  return key.replace(/[_\-\s]/g, "").toLowerCase();
}

function formatMonths(value: string): string {
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return value;
  return `${n}개월`;
}

function formatPercent(value: string): string {
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return value;
  return `${n}%`;
}

function formatYyyyMm(value: string): string {
  const digits = value.replace(/[^0-9]/g, "");
  if (!/^\d{6}$/.test(digits)) return value;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
}

const RAW_FIELD_MAP: Record<string, FieldDescriptor> = {
  save_trm: { label: "기간", formatter: formatMonths },
  intr_rate: { label: "기본금리(연)", formatter: formatPercent },
  intr_rate2: { label: "최고금리(연, 우대포함)", formatter: formatPercent },
  intr_rate_type_nm: { label: "이자 방식", help: "단리/복리 등 이자 계산 방식입니다." },
  lend_rate_min: { label: "최저금리(연)", formatter: formatPercent },
  lend_rate_max: { label: "최고금리(연)", formatter: formatPercent },
  crdt_grad_avg: { label: "평균금리(연)", formatter: formatPercent },
  lend_rate_type_nm: { label: "금리유형", help: "고정/변동 등 금리 적용 방식입니다." },
  crdt_lend_rate_type_nm: { label: "금리유형", help: "고정/변동 등 금리 적용 방식입니다." },
  rpym_type_nm: { label: "상환방식", help: "원리금균등/만기일시상환 등 상환 구조입니다." },
  crdt_rpym_type_nm: { label: "상환방식", help: "원리금균등/만기일시상환 등 상환 구조입니다." },
  loan_lmt: { label: "대출한도" },
  loan_limit: { label: "대출한도" },
  crdt_lend_lmt: { label: "대출한도" },
  join_way: { label: "가입방법", help: "영업점/비대면 등 가입 채널입니다." },
  join_member: { label: "가입대상", help: "가입 가능한 대상입니다." },
  spcl_cnd: { label: "우대조건", help: "추가 혜택을 받기 위한 조건입니다." },
  etc_note: { label: "유의사항", help: "중도해지, 수수료 등 확인이 필요한 안내입니다." },
  mtrt_int: { label: "만기후 이자", help: "만기 이후 적용되는 이자 안내입니다." },
  dcls_month: { label: "공시월", formatter: formatYyyyMm, hiddenByDefault: true },
};

const FIELD_MAP: Record<string, FieldDescriptor> = Object.fromEntries(
  Object.entries(RAW_FIELD_MAP).map(([key, value]) => [normalizeKey(key), value]),
);

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function findEntry(raw: Record<string, unknown>, keys: string[]): [string, unknown] | null {
  const entries = Object.entries(raw);
  for (const key of keys) {
    const hit = entries.find(([entryKey]) => normalizeKey(entryKey) === normalizeKey(key));
    if (hit && String(hit[1] ?? "").trim()) return hit;
  }
  return null;
}

function applyFormatting(key: string, value: string): string {
  const descriptor = FIELD_MAP[normalizeKey(key)];
  if (!descriptor?.formatter) return value;
  return descriptor.formatter(value);
}

export function getKindSummary(kind: FinlifeKind): string {
  return KIND_SUMMARY[kind];
}

export function getGlossaryDescriptor(key: string): FieldDescriptor | undefined {
  return FIELD_MAP[normalizeKey(key)];
}

export function getGlossaryLabel(key: string): string | undefined {
  return getGlossaryDescriptor(key)?.label;
}

export function formatGlossaryValue(key: string, value: unknown): string {
  const rendered = String(value ?? "").trim();
  if (!rendered) return "";
  return applyFormatting(key, rendered);
}

export function isGlossaryFieldVisibleByDefault(key: string): boolean {
  const desc = getGlossaryDescriptor(key);
  if (!desc) return false;
  return !desc.hiddenByDefault;
}

export function buildConsumerNotes(rawInput: unknown): LabeledItem[] {
  const raw = asRecord(rawInput);
  const out: LabeledItem[] = [];

  const joinDeny = findEntry(raw, ["join_deny", "joinDeny"]);
  if (joinDeny) {
    const parsed = JOIN_DENY_MAP[String(joinDeny[1]).trim()] ?? `${String(joinDeny[1]).trim()} (코드값)`;
    out.push({ label: "가입제한", value: parsed, help: "가입 제한 여부를 나타냅니다." });
  }

  const keys: Array<[string, string[]]> = [
    ["join_way", ["join_way", "joinWay"]],
    ["join_member", ["join_member", "joinMember"]],
    ["spcl_cnd", ["spcl_cnd", "specialCondition"]],
    ["etc_note", ["etc_note", "etcNote"]],
    ["mtrt_int", ["mtrt_int", "maturityInterest"]],
  ];

  for (const [baseKey, candidates] of keys) {
    const entry = findEntry(raw, candidates);
    if (!entry) continue;
    const desc = getGlossaryDescriptor(baseKey);
    if (!desc) continue;
    out.push({
      label: desc.label,
      value: formatGlossaryValue(baseKey, entry[1]),
      help: desc.help,
    });
  }

  return out.slice(0, 5);
}
