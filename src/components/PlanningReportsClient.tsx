"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { buildConfirmString } from "@/lib/ops/confirm";

type ReportListItem = {
  id: string;
  createdAt: string;
  kind: "run" | "manual";
  runId?: string;
};

type ReportDetail = ReportListItem & {
  markdown: string;
};

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

export function PlanningReportsClient() {
  const searchParams = useSearchParams();
  const selectedFromQuery = (searchParams.get("selected") ?? "").trim();

  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const effectiveSelectedId = useMemo(
    () => selectedId || selectedFromQuery,
    [selectedFromQuery, selectedId],
  );

  async function loadReports(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch("/api/planning/v2/reports?limit=100", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<ReportListItem[]> | null;
      if (!payload?.ok || !Array.isArray(payload.data)) {
        setReports([]);
        setSelected(null);
        return;
      }
      setReports(payload.data);
      const nextSelectedId = effectiveSelectedId || payload.data[0]?.id || "";
      setSelectedId(nextSelectedId);
    } catch {
      setReports([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadReportDetail(id: string): Promise<void> {
    if (!id) {
      setSelected(null);
      return;
    }
    try {
      const res = await fetch(`/api/planning/v2/reports/${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<ReportDetail> | null;
      if (!payload?.ok || !payload.data) {
        setSelected(null);
        return;
      }
      setSelected(payload.data);
    } catch {
      setSelected(null);
    }
  }

  async function deleteReportAction(id: string): Promise<void> {
    const expectedConfirm = buildConfirmString("DELETE report", id);
    const confirmText = window.prompt(
      `삭제 확인 문구를 입력하세요.\n${expectedConfirm}`,
      expectedConfirm,
    );
    if (!confirmText) return;

    try {
      const res = await fetch(`/api/planning/v2/reports/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmText }),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<{ deleted?: boolean }> | null;
      if (!res.ok || !payload?.ok) {
        window.alert(payload?.error?.message ?? "리포트 삭제에 실패했습니다.");
        return;
      }
      await loadReports();
      window.alert("리포트를 휴지통으로 이동했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "리포트 삭제 중 오류가 발생했습니다.");
    }
  }

  useEffect(() => {
    void loadReports();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadReportDetail(selectedId);
  }, [selectedId]);

  return (
    <PageShell>
      <PageHeader
        title="Planning Report"
        description="run 기반 markdown 리포트를 조회/다운로드/삭제합니다."
        action={(
          <div className="flex items-center gap-4 text-sm">
            <Link className="font-semibold text-emerald-700" href="/planning/trash">휴지통</Link>
            <Link className="font-semibold text-emerald-700" href="/planning/runs">실행 이력으로</Link>
          </div>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">리포트 목록</h2>
            <Button disabled={loading} onClick={() => void loadReports()} size="sm" variant="ghost">새로고침</Button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-700">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-2">id</th>
                  <th className="px-2 py-2">생성시각</th>
                  <th className="px-2 py-2">runId</th>
                  <th className="px-2 py-2">동작</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 ? (
                  <tr><td className="px-2 py-3" colSpan={4}>리포트가 없습니다.</td></tr>
                ) : reports.map((report) => (
                  <tr className="border-b border-slate-100" key={report.id}>
                    <td className="px-2 py-2">
                      <button
                        className="font-semibold text-emerald-700"
                        onClick={() => setSelectedId(report.id)}
                        type="button"
                      >
                        {report.id}
                      </button>
                    </td>
                    <td className="px-2 py-2">{formatDateTime(report.createdAt)}</td>
                    <td className="px-2 py-2">{report.runId ?? "-"}</td>
                    <td className="px-2 py-2">
                      <button
                        className="font-semibold text-rose-700"
                        onClick={() => void deleteReportAction(report.id)}
                        type="button"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-bold text-slate-900">리포트 보기</h2>
          {!selected ? (
            <p className="mt-3 text-xs text-slate-500">리포트를 선택하세요.</p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span>id: {selected.id}</span>
                <span>·</span>
                <span>createdAt: {formatDateTime(selected.createdAt)}</span>
                {selected.runId ? (<><span>·</span><span>runId: {selected.runId}</span></>) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  href={`/api/planning/v2/reports/${encodeURIComponent(selected.id)}/download`}
                >
                  Download MD
                </a>
              </div>
              <pre className="mt-4 max-h-[70vh] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                {selected.markdown}
              </pre>
            </>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

export default PlanningReportsClient;
