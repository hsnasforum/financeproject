import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { readLatestEvalReport } from "@/lib/planning/regression/readLatestEval";

function formatDateTime(value: string | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function fmt(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("ko-KR");
  }
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export default async function OpsPlanningEvalPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const report = await readLatestEvalReport();
  const failedCases = (report?.cases ?? []).filter((row) => row.status === "FAIL");

  return (
    <PageShell>
      <PageHeader
        title="Planning Regression Eval"
        description="planning:v2:regress 최신 실행 리포트를 확인합니다."
        action={(
          <div className="flex items-center gap-2">
            <Link href="/ops">
              <Button size="sm" variant="outline" type="button">Ops Hub</Button>
            </Link>
            <Link href="/settings/backup">
              <Button size="sm" variant="outline" type="button">Backup</Button>
            </Link>
          </div>
        )}
      />

      {!report ? (
        <Card>
          <p className="text-sm text-slate-700">리포트가 없습니다. 먼저 `pnpm planning:v2:regress`를 실행하세요.</p>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-4">
              <div>generatedAt: <span className="font-semibold">{formatDateTime(report.generatedAt)}</span></div>
              <div>mode: <span className="font-semibold">{report.mode ?? "-"}</span></div>
              <div>pass/fail: <span className="font-semibold">{report.summary?.pass ?? 0} / {report.summary?.fail ?? 0}</span></div>
              <div>total: <span className="font-semibold">{report.summary?.total ?? 0}</span></div>
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-bold text-slate-900">Fail Cases ({failedCases.length})</h2>
            {failedCases.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">실패 케이스가 없습니다.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {failedCases.map((row) => (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3" key={row.id ?? row.title}>
                    <p className="text-sm font-semibold text-rose-800">{row.id ?? "-"} · {row.title ?? ""}</p>
                    <div className="mt-2 overflow-x-auto">
                      <table className="min-w-full text-left text-xs text-rose-900">
                        <thead>
                          <tr className="border-b border-rose-200">
                            <th className="px-2 py-1">path</th>
                            <th className="px-2 py-1">kind</th>
                            <th className="px-2 py-1">expected</th>
                            <th className="px-2 py-1">actual</th>
                            <th className="px-2 py-1">delta/tolerance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(row.diffs ?? []).map((diff, index) => (
                            <tr className="border-b border-rose-100" key={`${row.id ?? "case"}-${index}`}>
                              <td className="px-2 py-1">{diff.path ?? "-"}</td>
                              <td className="px-2 py-1">{diff.kind ?? "-"}</td>
                              <td className="px-2 py-1">{fmt(diff.expected)}</td>
                              <td className="px-2 py-1">{fmt(diff.actual)}</td>
                              <td className="px-2 py-1">{fmt(diff.diff)} / {fmt(diff.tolerance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </PageShell>
  );
}
