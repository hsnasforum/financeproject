import { type EvidenceItem } from "@/lib/planning/v2/insights/evidence";
import { formatKrw, formatMonths, formatPct } from "@/lib/planning/i18n/format";
import { type Locale } from "@/lib/planning/i18n";
import {
  reportSurfaceDetailClassName,
  reportSurfaceDisclosureClassName,
  reportSurfaceDisclosureSummaryClassName,
  reportSurfaceInsetClassName,
} from "@/components/ui/ReportTone";

type Props = {
  item?: EvidenceItem;
  items?: EvidenceItem[];
  locale?: Locale;
  formatNumber?: (value: unknown) => string;
  className?: string;
  tone?: "light" | "dark";
};

type InputRow = EvidenceItem["inputs"][number];

function formatInputValue(
  input: EvidenceItem["inputs"][number],
  locale: Locale,
  formatNumber?: (value: unknown) => string,
): string {
  if (typeof input.value === "string") return input.value;
  if (!Number.isFinite(input.value)) return "N/A";
  if (input.unitKind === "krw") return formatKrw(locale, input.value);
  if (input.unitKind === "pct") return formatPct(locale, input.value);
  if (input.unitKind === "months") return formatMonths(locale, input.value);
  if (typeof formatNumber === "function") return formatNumber(input.value);
  return input.value.toLocaleString(locale);
}

function findInput(entry: EvidenceItem, label: string): InputRow | undefined {
  return entry.inputs.find((input) => input.label === label);
}

function inputText(
  entry: EvidenceItem,
  label: string,
  locale: Locale,
  formatNumber?: (value: unknown) => string,
): string {
  const found = findInput(entry, label);
  if (!found) return "N/A";
  return formatInputValue(found, locale, formatNumber);
}

function buildPlainSummary(
  entry: EvidenceItem,
  locale: Locale,
  formatNumber?: (value: unknown) => string,
): { headline: string; bullets: string[] } {
  if (entry.id === "monthlySurplus") {
    const income = inputText(entry, "월 실수령", locale, formatNumber);
    const expenses = inputText(entry, "월 총지출(필수+선택)", locale, formatNumber);
    const debt = inputText(entry, "월 부채상환", locale, formatNumber);
    const surplus = inputText(entry, "월 잉여현금", locale, formatNumber);
    return {
      headline: `이번 계산에서는 한 달에 들어오는 돈이 ${income}, 생활지출이 ${expenses}, 대출 상환이 ${debt}라고 보고 매달 남는 돈을 ${surplus}로 계산했습니다.`,
      bullets: [
        "필수지출과 선택지출이 따로 없으면, 저장된 월 총지출 값을 기준으로 봅니다.",
        "숫자는 이해하기 쉽게 원 단위로 반올림해 보여줍니다.",
      ],
    };
  }

  if (entry.id === "dsrPct") {
    const debt = inputText(entry, "월 부채상환", locale, formatNumber);
    const income = inputText(entry, "월 실수령", locale, formatNumber);
    const dsr = inputText(entry, "DSR", locale, formatNumber);
    return {
      headline: `이번 결과에서는 월 실수령 ${income} 중 ${debt}를 대출 상환에 쓰는 것으로 보고, 상환 부담 비중을 ${dsr}로 해석했습니다.`,
      bullets: [
        "DSR은 소득 대비 대출 상환 비중이라 높을수록 다른 목표를 함께 챙기기 어려워질 수 있습니다.",
      ],
    };
  }

  if (entry.id === "emergency") {
    const cash = inputText(entry, "현금성 자산", locale, formatNumber);
    const monthlyExpenses = inputText(entry, "필수지출(월)", locale, formatNumber);
    const cover = inputText(entry, "비상금 커버", locale, formatNumber);
    const target = inputText(entry, "비상금 목표액", locale, formatNumber);
    return {
      headline: `현재 바로 쓸 수 있는 현금성 자산 ${cash}으로, 월 기준 지출 ${monthlyExpenses}를 약 ${cover} 동안 버틸 수 있다고 봤습니다. 권장 완충 자금 기준은 ${target}입니다.`,
      bullets: [
        "비상금은 갑작스러운 실직·질병·큰 수리비 같은 상황에서 버틸 시간을 뜻합니다.",
      ],
    };
  }

  return {
    headline: "이번 결과는 아래 입력값과 가정을 기준으로 계산했습니다.",
    bullets: [],
  };
}

export default function EvidencePanel({ item, items, className, locale = "ko-KR", formatNumber, tone = "light" }: Props) {
  const rows = Array.isArray(items)
    ? items
    : (item ? [item] : []);
  if (rows.length < 1) return null;
  const cls = className ? ` ${className}` : "";
  const rootClassName = tone === "dark"
    ? `${reportSurfaceDisclosureClassName} text-white/78`
    : "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700";
  const summaryClassName = tone === "dark"
    ? reportSurfaceDisclosureSummaryClassName
    : "cursor-pointer font-semibold text-slate-900";
  const plainSummaryClassName = tone === "dark"
    ? `${reportSurfaceInsetClassName} p-3 text-white`
    : "rounded-xl border border-slate-200 bg-white px-3 py-3";
  const sectionLabelClassName = tone === "dark" ? "text-[11px] font-semibold text-white/60" : "text-[11px] font-semibold text-slate-600";
  const inputItemClassName = tone === "dark" ? `${reportSurfaceDetailClassName} px-3 py-2` : "rounded-lg bg-white px-3 py-2";
  const nestedDetailsClassName = tone === "dark"
    ? `${reportSurfaceDisclosureClassName} p-3`
    : "rounded-lg border border-slate-200 bg-white px-3 py-2";
  const nestedBodyClassName = tone === "dark" ? "mt-2 space-y-2 text-white/80" : "mt-2 space-y-2";
  const nestedFormulaClassName = tone === "dark" ? "text-[11px] text-white/65" : "text-[11px] text-slate-600";
  return (
    <div className={`space-y-2${cls}`}>
      {rows.map((entry) => (
        <details className={rootClassName} key={entry.id}>
          <summary className={summaryClassName} data-testid={`evidence-toggle-${entry.id}`}>
            근거 보기
          </summary>
          <div className="mt-2 space-y-3" data-testid={`evidence-panel-${entry.id}`}>
            {(() => {
              const summary = buildPlainSummary(entry, locale, formatNumber);
              return (
                <div className={plainSummaryClassName}>
                  <p className={tone === "dark" ? "text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55" : "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"}>
                    쉽게 말하면
                  </p>
                  <p className={tone === "dark" ? "mt-2 leading-5 text-white/82" : "mt-2 leading-5 text-slate-800"}>{summary.headline}</p>
                  {summary.bullets.length > 0 ? (
                    <ul className={tone === "dark" ? "mt-2 list-disc space-y-1 pl-4 text-white/70" : "mt-2 list-disc space-y-1 pl-4 text-slate-600"}>
                      {summary.bullets.map((bullet, index) => (
                        <li key={`${entry.id}:plain:${index}`}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })()}

            <div>
              <p className={sectionLabelClassName}>이번 계산에 사용한 값</p>
              <ul className="mt-1 space-y-1">
                {entry.inputs.map((input, index) => (
                  <li className={inputItemClassName} key={`${entry.id}:input:${index}`}>
                    <span className={tone === "dark" ? "text-white/60" : "text-slate-500"}>{input.label}</span>
                    <span className={tone === "dark" ? "ml-2 font-semibold text-white" : "ml-2 font-semibold text-slate-900"}>
                      {formatInputValue(input, locale, formatNumber)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <details className={nestedDetailsClassName}>
              <summary className={summaryClassName}>자세한 계산 기준 보기</summary>
              <div className={nestedBodyClassName}>
                <p className={nestedFormulaClassName}>계산식: {entry.formula}</p>
                <div>
                  <p className={sectionLabelClassName}>가정</p>
                  <ul className="mt-1 list-disc pl-4">
                    {entry.assumptions.map((assumption, index) => (
                      <li key={`${entry.id}:assumption:${index}`}>{assumption}</li>
                    ))}
                  </ul>
                </div>
                {entry.notes && entry.notes.length > 0 ? (
                  <div>
                    <p className={sectionLabelClassName}>참고</p>
                    <ul className="mt-1 list-disc pl-4">
                      {entry.notes.map((note, index) => (
                        <li key={`${entry.id}:note:${index}`}>{note}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </details>
          </div>
        </details>
      ))}
    </div>
  );
}
