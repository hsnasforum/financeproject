"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  BodyActionLink,
  bodyActionLinkGroupClassName,
  BodyDialogSurface,
  BodyTableFrame,
  bodyDenseActionRowClassName,
  bodyDialogActionsClassName,
  bodyFieldClassName,
  bodyLabelClassName,
} from "@/components/ui/BodyTone";
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
  initialDeleteTargetId?: string;
  initialLoadFailed?: boolean;
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

export function ProfileDraftsListClient({
  initialRows = [],
  disableAutoLoad = false,
  initialDeleteTargetId = "",
  initialLoadFailed = false,
}: Props) {
  const [rows, setRows] = useState<DraftListItem[]>(normalizeRows(initialRows));
  const [loading, setLoading] = useState(!disableAutoLoad && initialRows.length < 1 && !initialLoadFailed);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState(initialDeleteTargetId);
  const [loadFailed, setLoadFailed] = useState(initialLoadFailed);
  const [draftBatchId, setDraftBatchId] = useState("");
  const [message, setMessage] = useState("");

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setMessage("");
    try {
      const response = await fetch(`/api/planning/v3/profile/drafts${buildCsrfQuery()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isListResponse(json)) {
        setRows([]);
        setLoadFailed(true);
        return;
      }
      setRows(normalizeRows(json.data));
      setLoadFailed(false);
    } catch {
      setRows([]);
      setLoadFailed(true);
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
      setDeleteTargetId("");
    } catch {
      setMessage("초안 삭제에 실패했습니다.");
    } finally {
      setDeletingId("");
    }
  }

  function openDeleteDialog(draftId: string): void {
    if (deletingId) return;
    const normalized = asString(draftId);
    if (!normalized) return;
    setDeleteTargetId(normalized);
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Import-to-Planning Beta</p>
            <h1 className="text-xl font-black text-slate-900">Planning v3 Profile Drafts</h1>
            <p className="text-sm text-slate-600">
              배치 기반 초안을 로컬에 저장하고 review 할 수 있습니다. 이 화면은 stable planning handoff 직전 검토 축입니다.
            </p>
            <p className="text-xs text-slate-500">
              개별 초안 상세에서 preflight/apply를 거친 뒤 stable `/planning/reports`로 결과를 확인합니다.
            </p>
          </div>
          <div className={bodyActionLinkGroupClassName}>
            <BodyActionLink href="/planning/v3/balances">
              balances 다시 확인
            </BodyActionLink>
            <BodyActionLink href="/planning/v3/transactions/batches">
              최근 배치 확인
            </BodyActionLink>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className={bodyLabelClassName} htmlFor="v3-profile-draft-batch-id">
              batchId
            </label>
            <input
              className={`${bodyFieldClassName} sm:w-80`}
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
          <div className="space-y-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Support / Internal</p>
            <div className={bodyActionLinkGroupClassName}>
              <BodyActionLink className="text-xs text-slate-600" href="/planning/v3/import/csv">
                raw CSV Import
              </BodyActionLink>
              <BodyActionLink className="text-xs text-slate-600" href="/planning/v3/batches">
                raw 배치 센터
              </BodyActionLink>
            </div>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
        </Card>

        <Card className="space-y-3">
          {loading ? <p className="text-sm text-slate-600">목록을 불러오는 중...</p> : null}
          {!loading && loadFailed ? (
            <p className="text-sm text-slate-600" data-testid="v3-profile-drafts-load-failure">
              초안 목록을 확인하지 못했습니다. 새로고침으로 다시 시도해 주세요.
            </p>
          ) : null}
          {!loading && !loadFailed && rows.length < 1 ? <p className="text-sm text-slate-600">저장된 profile draft가 없습니다.</p> : null}

          {rows.length > 0 ? (
            <BodyTableFrame>
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
                        <div className={bodyDenseActionRowClassName}>
                          <BodyActionLink href={`/planning/v3/profile/drafts/${encodeURIComponent(row.draftId)}`}>
                            열기
                          </BodyActionLink>
                          <Button
                            disabled={Boolean(deletingId)}
                            onClick={() => {
                              openDeleteDialog(row.draftId);
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
            </BodyTableFrame>
          ) : null}
        </Card>
      </div>
      {deleteTargetId ? (
        <div
          aria-labelledby="v3-profile-draft-delete-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-8"
          role="dialog"
        >
          <BodyDialogSurface data-testid="v3-profile-draft-delete-dialog">
            <h2 className="text-base font-black text-slate-900" id="v3-profile-draft-delete-title">초안 삭제 확인</h2>
            <p className="mt-2 text-sm text-slate-700">이 초안을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.</p>
            <div className={bodyDialogActionsClassName}>
              <Button
                disabled={Boolean(deletingId)}
                onClick={() => setDeleteTargetId("")}
                size="sm"
                type="button"
                variant="outline"
              >
                취소
              </Button>
              <Button
                disabled={Boolean(deletingId)}
                onClick={() => {
                  void handleDelete(deleteTargetId);
                }}
                size="sm"
                type="button"
              >
                {deletingId ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </BodyDialogSurface>
        </div>
      ) : null}
    </PageShell>
  );
}
