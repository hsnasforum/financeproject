"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";

type DraftListItem = {
  id: string;
  createdAt: string;
  source: {
    kind: "csv";
    rows?: number;
    months?: number;
  };
  summary: {
    medianIncomeKrw?: number;
    medianExpenseKrw?: number;
    avgNetKrw?: number;
  };
};

type ListResponse = {
  ok: true;
  drafts: DraftListItem[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function isDraftListItem(value: unknown): value is DraftListItem {
  if (!isRecord(value)) return false;
  if (!asString(value.id) || !asString(value.createdAt)) return false;
  if (!isRecord(value.source) || value.source.kind !== "csv") return false;
  return isRecord(value.summary);
}

function isListResponse(payload: unknown): payload is ListResponse {
  if (!isRecord(payload)) return false;
  if (payload.ok !== true || !Array.isArray(payload.drafts)) return false;
  return payload.drafts.every(isDraftListItem);
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
}

function formatDateTime(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Date(time).toLocaleString("ko-KR", { hour12: false });
}

function formatKrw(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function DraftsListClient() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DraftListItem[]>([]);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/planning/v3/drafts${buildCsrfQuery()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isListResponse(json)) {
        setRows([]);
        setMessage("초안 목록을 불러오지 못했습니다.");
        return;
      }
      setRows(json.drafts);
    } catch {
      setRows([]);
      setMessage("초안 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  async function handleDelete(id: string) {
    if (!window.confirm("이 초안을 삭제할까요?")) return;
    setDeletingId(id);
    setMessage("");

    try {
      const response = await fetch(`/api/planning/v3/drafts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({})),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isRecord(json) || json.ok !== true) {
        setMessage("초안 삭제에 실패했습니다.");
        return;
      }
      await loadDrafts();
    } catch {
      setMessage("초안 삭제에 실패했습니다.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Drafts</h1>
          <p className="text-sm text-slate-600">로컬 파일로 저장된 v3 draft 목록입니다.</p>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                void loadDrafts();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              새로고침
            </Button>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
        </Card>

        <Card className="space-y-3">
          {loading ? <p className="text-sm text-slate-600">목록을 불러오는 중...</p> : null}
          {!loading && rows.length < 1 ? <p className="text-sm text-slate-600">저장된 초안이 없습니다.</p> : null}

          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="v3-drafts-list">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">생성일</th>
                    <th className="px-3 py-2 text-right">months</th>
                    <th className="px-3 py-2 text-right">rows</th>
                    <th className="px-3 py-2 text-right">medianIncome</th>
                    <th className="px-3 py-2 text-right">medianExpense</th>
                    <th className="px-3 py-2 text-right">avgNet</th>
                    <th className="px-3 py-2 text-left">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr data-testid={`v3-draft-row-${row.id}`} key={row.id}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-800">{formatDateTime(row.createdAt)}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{asNumber(row.source.months) ?? "-"}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{asNumber(row.source.rows) ?? "-"}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.summary.medianIncomeKrw))}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.summary.medianExpenseKrw))}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatKrw(asNumber(row.summary.avgNetKrw))}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            className="text-sm font-semibold text-emerald-700 underline underline-offset-2"
                            href={`/planning/v3/drafts/${encodeURIComponent(row.id)}`}
                          >
                            상세
                          </Link>
                          <Button
                            data-testid={`v3-draft-delete-${row.id}`}
                            disabled={deletingId === row.id}
                            onClick={() => {
                              void handleDelete(row.id);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
}
