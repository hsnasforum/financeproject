"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";

type DraftListItem = {
  draftId: string;
  id: string;
  batchId: string;
  createdAt: string;
  stats?: {
    months: number;
    transfersExcluded?: boolean;
    unassignedCount?: number;
  };
};

type Props = {
  initialRows?: DraftListItem[];
  disableAutoLoad?: boolean;
};

type ListResponse = {
  ok: true;
  data: DraftListItem[];
};

type CreateResponse = {
  ok: true;
  data: {
    id: string;
    batchId: string;
    createdAt: string;
    stats?: DraftListItem["stats"];
  };
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
  return Math.round(parsed);
}

function toStats(value: unknown): DraftListItem["stats"] | undefined {
  if (!isRecord(value)) return undefined;
  const months = asNumber(value.months);
  if (months === undefined) return undefined;
  const transfersExcluded = value.transfersExcluded === true ? true : undefined;
  const unassignedCount = asNumber(value.unassignedCount);
  return {
    months,
    ...(transfersExcluded ? { transfersExcluded } : {}),
    ...(unassignedCount !== undefined ? { unassignedCount } : {}),
  };
}

function isDraftListItem(value: unknown): value is DraftListItem {
  if (!isRecord(value)) return false;
  const id = asString(value.id);
  const draftId = asString(value.draftId);
  if (!(id || draftId) || !asString(value.batchId) || !asString(value.createdAt)) return false;
  if (value.stats !== undefined && !toStats(value.stats)) return false;
  return true;
}

function isListResponse(value: unknown): value is ListResponse {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.data)) return false;
  return value.data.every(isDraftListItem);
}

function isCreateResponse(value: unknown): value is CreateResponse {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return false;
  if (!asString(value.data.id) || !asString(value.data.batchId) || !asString(value.data.createdAt)) return false;
  if (value.data.stats !== undefined && !toStats(value.data.stats)) return false;
  return true;
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

function normalizeRows(rows: DraftListItem[]): DraftListItem[] {
  return rows.map((row) => ({
    ...row,
    draftId: asString(row.draftId) || asString(row.id),
    id: asString(row.id) || asString(row.draftId),
  }));
}

export function ProfileDraftsListClient({ initialRows = [], disableAutoLoad = false }: Props) {
  const [rows, setRows] = useState<DraftListItem[]>(normalizeRows(initialRows));
  const [loading, setLoading] = useState(!disableAutoLoad && initialRows.length < 1);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [draftBatchId, setDraftBatchId] = useState("");
  const [message, setMessage] = useState("");

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/planning/v3/profile/drafts${buildCsrfQuery()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isListResponse(json)) {
        setRows([]);
        setMessage("초안 목록을 불러오지 못했습니다.");
        return;
      }
      setRows(normalizeRows(json.data));
    } catch {
      setRows([]);
      setMessage("초안 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (disableAutoLoad) return;
    void loadDrafts();
  }, [disableAutoLoad, loadDrafts]);

  async function handleCreate() {
    const batchId = asString(draftBatchId);
    if (!batchId || creating) return;
    setCreating(true);
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
      if (!response.ok || !isCreateResponse(json)) {
        const errorMessage = isRecord(json) && isRecord(json.error)
          ? asString(json.error.message)
          : "";
        setMessage(errorMessage || "초안 생성에 실패했습니다.");
        return;
      }
      setDraftBatchId("");
      await loadDrafts();
      window.location.href = `/planning/v3/profile/drafts/${encodeURIComponent(json.data.id)}`;
    } catch {
      setMessage("초안 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(draftId: string) {
    const normalized = asString(draftId);
    if (!normalized || deletingId) return;
    const confirmed = window.confirm("이 초안을 삭제하시겠습니까?");
    if (!confirmed) return;

    setDeletingId(normalized);
    setMessage("");
    try {
      const response = await fetch(`/api/planning/v3/profile/drafts/${encodeURIComponent(normalized)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({})),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        const errorMessage = isRecord(json) && isRecord(json.error)
          ? asString(json.error.message)
          : "";
        setMessage(errorMessage || "초안 삭제에 실패했습니다.");
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
          <h1 className="text-xl font-black text-slate-900">Planning v3 Profile Drafts</h1>
          <p className="text-sm text-slate-600">배치 기반 초안을 로컬에 저장하고 review 할 수 있습니다.</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="v3-profile-draft-batch-id">
              batchId
            </label>
            <input
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm sm:w-80"
              id="v3-profile-draft-batch-id"
              onChange={(event) => {
                setDraftBatchId(event.target.value);
              }}
              placeholder="batch id"
              value={draftBatchId}
            />
            <Button
              disabled={creating || asString(draftBatchId).length < 1}
              onClick={() => {
                void handleCreate();
              }}
              size="sm"
              type="button"
            >
              {creating ? "생성 중..." : "초안 생성"}
            </Button>
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
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-emerald-700">
            <Link className="underline underline-offset-2" href="/planning/v3/import/csv">
              CSV 업로드
            </Link>
            <Link className="underline underline-offset-2" href="/planning/v3/batches">
              Batches
            </Link>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
        </Card>

        <Card className="space-y-3">
          {loading ? <p className="text-sm text-slate-600">목록을 불러오는 중...</p> : null}
          {!loading && rows.length < 1 ? <p className="text-sm text-slate-600">저장된 profile draft가 없습니다.</p> : null}

          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="v3-drafts-list">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">createdAt</th>
                    <th className="px-3 py-2 text-left">batchId</th>
                    <th className="px-3 py-2 text-left">draftId</th>
                    <th className="px-3 py-2 text-right">months</th>
                    <th className="px-3 py-2 text-right">unassigned</th>
                    <th className="px-3 py-2 text-left">action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr data-testid={`v3-draft-row-${row.draftId}`} key={row.draftId}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{formatDateTime(row.createdAt)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-800">{row.batchId}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-800">{row.draftId}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{row.stats?.months ?? "-"}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{row.stats?.unassignedCount ?? "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Link
                            className="text-sm font-semibold text-emerald-700 underline underline-offset-2"
                            href={`/planning/v3/profile/drafts/${encodeURIComponent(row.draftId)}`}
                          >
                            열기
                          </Link>
                          <Button
                            disabled={Boolean(deletingId)}
                            onClick={() => {
                              void handleDelete(row.draftId);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {deletingId === row.draftId ? "삭제 중..." : "삭제"}
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
