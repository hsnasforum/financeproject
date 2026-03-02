"use client";

import { type NormalizationReport } from "@/lib/planning/v2/normalizationReport";

type DisclosuresPanelProps = {
  report: NormalizationReport;
  title?: string;
};

function formatValue(value: unknown): string {
  if (value === undefined) return "-";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function DisclosuresPanel({ report, title = "자동 교정/기본값 적용 내역" }: DisclosuresPanelProps) {
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700" data-testid="disclosures-panel">
      <summary className="cursor-pointer font-semibold text-slate-900">{title}</summary>
      <div className="mt-2 space-y-3">
        <section>
          <p className="font-semibold text-slate-800">자동 교정</p>
          <ul className="mt-1 list-disc space-y-1 pl-4" data-testid="disclosures-fixes">
            {report.fixesApplied.length < 1 ? (
              <li>없음</li>
            ) : report.fixesApplied.map((item, index) => (
              <li key={`${item.code}:${item.path}:${index}`}>
                [{item.code}] {item.path}
                {item.before !== undefined || item.after !== undefined
                  ? ` (${formatValue(item.before)} -> ${formatValue(item.after)})`
                  : ""}
                {item.note ? ` - ${item.note}` : ""}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="font-semibold text-slate-800">기본값 적용</p>
          <ul className="mt-1 list-disc space-y-1 pl-4" data-testid="disclosures-defaults">
            {report.defaultsApplied.length < 1 ? (
              <li>없음</li>
            ) : report.defaultsApplied.map((item, index) => (
              <li key={`${item.code}:${item.path}:${index}`}>
                [{item.code}] {item.path} = {formatValue(item.value)}
                {item.note ? ` - ${item.note}` : ""}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </details>
  );
}
