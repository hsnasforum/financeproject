import { roundKrw } from "../calc/roundingPolicy";

export type CopyTemplateId =
  | "warning.unknown.title"
  | "warning.unknown.description"
  | "warning.fallback.message"
  | "verdict.GOOD.label"
  | "verdict.GOOD.headline"
  | "verdict.CAUTION.label"
  | "verdict.CAUTION.headline"
  | "verdict.RISK.label"
  | "verdict.RISK.headline"
  | "verdict.UNKNOWN.label"
  | "verdict.UNKNOWN.headline"
  | "unit.percent"
  | "unit.krw"
  | "unit.months";

const COPY_TEMPLATES: Record<CopyTemplateId, string> = {
  "warning.unknown.title": "알 수 없는 경고({{code}})",
  "warning.unknown.description": "해당 경고 코드는 카탈로그에 없습니다. 원문 메시지와 입력값을 함께 점검하세요.",
  "warning.fallback.message": "{{code}} 경고가 감지되었습니다.",
  "verdict.GOOD.label": "양호",
  "verdict.GOOD.headline": "지금 구조는 비교적 안정적입니다. 정기 점검만 이어가면 됩니다.",
  "verdict.CAUTION.label": "주의",
  "verdict.CAUTION.headline": "당장 위험하진 않지만, 몇 가지만 조정하면 훨씬 안정적으로 갈 수 있습니다.",
  "verdict.RISK.label": "위험",
  "verdict.RISK.headline": "지금 구조로는 버거운 구간이 보여서, 우선순위 조정이 필요합니다.",
  "verdict.UNKNOWN.label": "확인 필요",
  "verdict.UNKNOWN.headline": "입력 정보가 부족해 아직 또렷한 판단을 내리기 어렵습니다.",
  "unit.percent": "{{value}}%",
  "unit.krw": "{{value}}원",
  "unit.months": "{{value}}개월",
};

const PLACEHOLDER_PATTERN = /\{\{([a-zA-Z0-9_]+)\}\}/g;

function toTemplateValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

export function renderCopyTemplate(
  id: CopyTemplateId,
  params?: Record<string, unknown>,
): string {
  const template = COPY_TEMPLATES[id];
  const keys = Array.from(template.matchAll(PLACEHOLDER_PATTERN)).map((match) => match[1]);

  let output = template;
  for (const key of keys) {
    const raw = params?.[key];
    const value = toTemplateValue(raw);
    if (value.length < 1) {
      throw new Error(`Missing copy template param: ${id}.${key}`);
    }
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

export function formatPercentUnit(value: number, digits = 1): string {
  const rounded = Number.isFinite(value) ? value.toFixed(Math.max(0, Math.trunc(digits))) : "-";
  return renderCopyTemplate("unit.percent", { value: rounded });
}

export function formatKrwUnit(value: number): string {
  const rounded = Number.isFinite(value) ? roundKrw(value).toLocaleString("ko-KR") : "-";
  return renderCopyTemplate("unit.krw", { value: rounded });
}

export function formatMonthsUnit(value: number, digits = 1): string {
  const rounded = Number.isFinite(value) ? value.toFixed(Math.max(0, Math.trunc(digits))) : "-";
  return renderCopyTemplate("unit.months", { value: rounded });
}

export function templateIds(): CopyTemplateId[] {
  return Object.keys(COPY_TEMPLATES) as CopyTemplateId[];
}
