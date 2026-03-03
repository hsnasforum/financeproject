"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";

type BatchListRow = {
  batchId: string;
  createdAt?: string;
  stats?: {
    months?: number;
    txns?: number;
    unassignedCategory?: number;
    transfers?: number;
  };
};

type ListResponse = {
  ok: true;
  data: BatchListRow[];
};

type DraftCreateResponse = {
  ok: true;
  data: {
    id: string;
    batchId: string;
    createdAt: string;
    stats?: {
      months: number;
      transfersExcluded?: boolean;
      unassignedCount?: number;
    };
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isListResponse(value: unknown): value is ListResponse {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.data)) return false;
  return true;
}

function isDraftCreateResponse(value: unknown): value is DraftCreateResponse {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return false;
  return asString(value.data.id).length > 0;
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
}

type Props = {
  initialRows?: BatchListRow[];
};

export function BatchesCenterClient({ initialRows = [] }: Props) {
  const [loading, setLoading] = useState(initialRows.length < 1);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<BatchListRow[]>(initialRows);
  const [createLoadingBatchId, setCreateLoadingBatchId] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/planning/v3/batches${buildCsrfQuery()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isListResponse(json)) {
        setRows([]);
        setMessage("배치 목록을 불러오지 못했습니다.");
        return;
      }
      const normalized = json.data
        .map((row) => ({
          batchId: asString(row.batchId),
          ...(asString(row.createdAt) ? { createdAt: asString(row.createdAt) } : {}),
          ...(isRecord(row.stats)
            ? {
                stats: {
                  ...(Number.isFinite(Number(row.stats.months)) ? { months: asNumber(row.stats.months) } : {}),
                  ...(Number.isFinite(Number(row.stats.txns)) ? { txns: asNumber(row.stats.txns) } : {}),
                  ...(Number.isFinite(Number(row.stats.unassignedCategory)) ? { unassignedCategory: asNumber(row.stats.unassignedCategory) } : {}),
                  ...(Number.isFinite(Number(row.stats.transfers)) ? { transfers: asNumber(row.stats.transfers) } : {}),
                },
              }
            : {}),
        }))
        .filter((row) => row.batchId.length > 0)
        .sort((left, right) => {
          const leftTs = Date.parse(left.createdAt ?? "");
          const rightTs = Date.parse(right.createdAt ?? "");
          if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
            return rightTs - leftTs;
          }
          return left.batchId.localeCompare(right.batchId);
        });
      setRows(normalized);
    } catch {
      setRows([]);
      setMessage("배치 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  async function handleCreateDraft(batchId: string): Promise<void> {
    setCreateLoadingBatchId(batchId);
    setMessage("");
    try {
      const response = await fetch("/api/planning/v3/profile/drafts", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({ batchId })),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isDraftCreateResponse(json)) {
        setMessage("초안 생성에 실패했습니다.");
        return;
      }
      window.location.href = `/planning/v3/profile/drafts/${encodeURIComponent(json.data.id)}`;
    } catch {
      setMessage("초안 생성에 실패했습니다.");
    } finally {
      setCreateLoadingBatchId("");
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Batch Center</h1>
          <p className="text-sm text-slate-600">배치 목록과 통계를 확인하고 바로 Profile 초안 생성으로 이어집니다.</p>
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-emerald-700">
            <Link className="underline underline-offset-2" href="/planning/v3/transactions/batches">
              Transaction Batches
            </Link>
            <Link className="underline underline-offset-2" href="/planning/v3/import/csv">
              CSV 업로드
            </Link>
            <Link className="underline underline-offset-2" href="/planning/v3/profile/drafts">
              Draft 목록
            </Link>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => { void loadRows(); }} size="sm" type="button" variant="outline">
              새로고침
            </Button>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
          {loading ? <p className="text-sm text-slate-600">배치 목록을 불러오는 중...</p> : null}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="v3-batches-list">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">batchId</th>
                  <th className="px-3 py-2 text-left">createdAt</th>
                  <th className="px-3 py-2 text-right">months</th>
                  <th className="px-3 py-2 text-right">txns</th>
                  <th className="px-3 py-2 text-right">unassigned</th>
                  <th className="px-3 py-2 text-right">transfers</th>
                  <th className="px-3 py-2 text-left">actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!loading && rows.length < 1 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                      저장된 배치가 없습니다.
                    </td>
                  </tr>
                ) : null}
                {rows.map((row) => (
                  <tr key={row.batchId}>
                    <td className="px-3 py-2 font-mono text-xs">{row.batchId}</td>
                    <td className="px-3 py-2 text-xs">{row.createdAt ? formatDateTime(row.createdAt) : "-"}</td>
                    <td className="px-3 py-2 text-right">{asNumber(row.stats?.months ?? 0)}</td>
                    <td className="px-3 py-2 text-right">{asNumber(row.stats?.txns ?? 0)}</td>
                    <td className="px-3 py-2 text-right">{asNumber(row.stats?.unassignedCategory ?? 0)}</td>
                    <td className="px-3 py-2 text-right">{asNumber(row.stats?.transfers ?? 0)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          className="text-xs font-semibold text-emerald-700 underline underline-offset-2"
                          href={`/planning/v3/batches/${encodeURIComponent(row.batchId)}`}
                        >
                          요약 보기
                        </Link>
                        <Button
                          disabled={createLoadingBatchId === row.batchId}
                          onClick={() => {
                            void handleCreateDraft(row.batchId);
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {createLoadingBatchId === row.batchId ? "생성 중..." : "초안 생성"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
