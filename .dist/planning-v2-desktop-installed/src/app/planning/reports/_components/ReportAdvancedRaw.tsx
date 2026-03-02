import { type PlanningInterpretationPolicy } from "@/lib/planning/catalog/planningPolicy";
import { Card } from "@/components/ui/Card";

type Props = {
  reproducibility?: {
    runId: string;
    createdAt: string;
    assumptionsSnapshotId?: string;
    staleDays?: number;
    appVersion: string;
    engineVersion: string;
    profileHash: string;
    assumptionsHash?: string;
    policy: PlanningInterpretationPolicy;
  };
  raw?: {
    reportMarkdown?: string;
    runJson?: unknown;
  };
};

function profileHashPrefix(value: string): string {
  const text = value.trim();
  if (!text) return "-";
  return text.slice(0, 12);
}

export default function ReportAdvancedRaw({ reproducibility, raw }: Props) {
  if (!reproducibility && !raw?.reportMarkdown && !raw?.runJson) return null;

  return (
    <Card className="space-y-3 p-5" data-testid="report-advanced-raw">
      <h2 className="text-base font-bold text-slate-900">Advanced (원문)</h2>
      {reproducibility ? (
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Reproducibility</summary>
          <div className="mt-3 space-y-2 text-xs text-slate-700">
            <p><span className="font-semibold text-slate-900">runId</span>: {reproducibility.runId}</p>
            <p><span className="font-semibold text-slate-900">createdAt</span>: {reproducibility.createdAt}</p>
            <p><span className="font-semibold text-slate-900">assumptionsSnapshotId</span>: {reproducibility.assumptionsSnapshotId ?? "-"}</p>
            <p><span className="font-semibold text-slate-900">staleDays</span>: {typeof reproducibility.staleDays === "number" ? reproducibility.staleDays : "-"}</p>
            <p><span className="font-semibold text-slate-900">appVersion</span>: {reproducibility.appVersion}</p>
            <p><span className="font-semibold text-slate-900">engineVersion</span>: {reproducibility.engineVersion}</p>
            <p><span className="font-semibold text-slate-900">profileHash</span>: {profileHashPrefix(reproducibility.profileHash)}</p>
            <p><span className="font-semibold text-slate-900">assumptionsHash</span>: {reproducibility.assumptionsHash ? profileHashPrefix(reproducibility.assumptionsHash) : "-"}</p>
            <div>
              <p className="font-semibold text-slate-900">policy thresholds</p>
              <pre className="mt-1 overflow-auto rounded-lg bg-slate-900 p-2 text-[11px] text-slate-100">
                {JSON.stringify(reproducibility.policy, null, 2)}
              </pre>
            </div>
          </div>
        </details>
      ) : null}
      {raw.reportMarkdown ? (
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">report markdown 원문</summary>
          <pre className="mt-3 max-h-[40vh] overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
            {raw.reportMarkdown}
          </pre>
        </details>
      ) : null}
      {raw.runJson ? (
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">run raw json</summary>
          <pre className="mt-3 max-h-[40vh] overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(raw.runJson, null, 2)}
          </pre>
        </details>
      ) : null}
    </Card>
  );
}
