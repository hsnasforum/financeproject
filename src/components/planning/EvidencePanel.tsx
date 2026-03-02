import { type EvidenceItem } from "@/lib/planning/v2/insights/evidence";
import { formatKrw, formatMonths, formatPct } from "@/lib/planning/i18n/format";
import { type Locale } from "@/lib/planning/i18n";

type Props = {
  item?: EvidenceItem;
  items?: EvidenceItem[];
  locale?: Locale;
  formatNumber?: (value: unknown) => string;
  className?: string;
};

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

export default function EvidencePanel({ item, items, className, locale = "ko-KR", formatNumber }: Props) {
  const rows = Array.isArray(items)
    ? items
    : (item ? [item] : []);
  if (rows.length < 1) return null;
  const cls = className ? ` ${className}` : "";
  return (
    <div className={`space-y-2${cls}`}>
      {rows.map((entry) => (
        <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" key={entry.id}>
          <summary className="cursor-pointer font-semibold text-slate-900" data-testid={`evidence-toggle-${entry.id}`}>
            근거 보기
          </summary>
          <div className="mt-2 space-y-2" data-testid={`evidence-panel-${entry.id}`}>
            <p className="font-semibold text-slate-900">{entry.title}</p>
            <p className="text-[11px] text-slate-600">공식: {entry.formula}</p>
            <div>
              <p className="text-[11px] text-slate-600">입력:</p>
              <ul className="list-disc pl-4">
                {entry.inputs.map((input, index) => (
                  <li key={`${entry.id}:input:${index}`}>{input.label}: {formatInputValue(input, locale, formatNumber)}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] text-slate-600">가정:</p>
              <ul className="list-disc pl-4">
                {entry.assumptions.map((assumption, index) => (
                  <li key={`${entry.id}:assumption:${index}`}>{assumption}</li>
                ))}
              </ul>
            </div>
            {entry.notes && entry.notes.length > 0 ? (
              <div>
                <p className="text-[11px] text-slate-600">참고:</p>
                <ul className="list-disc pl-4">
                  {entry.notes.map((note, index) => (
                    <li key={`${entry.id}:note:${index}`}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}
