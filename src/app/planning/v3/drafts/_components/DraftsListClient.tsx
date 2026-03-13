"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  BodyActionLink,
  BodyDialogSurface,
  BodyInset,
  BodyTableFrame,
  bodyDenseActionRowClassName,
  bodyDialogActionsClassName,
  bodyFieldClassName,
} from "@/components/ui/BodyTone";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken } from "@/lib/dev/clientCsrf";
import {
  fetchCsvDraftPreview,
  fetchDraftList,
  saveCsvDraftPreview,
  type DraftUploadListItem,
  type DraftUploadPreview,
} from "./draftsUploadFlow";

type Props = {
  initialRows?: DraftUploadListItem[];
  disableAutoLoad?: boolean;
  initialDeleteTargetId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
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

function pickPatchNumber(value: unknown): number {
  return Math.round(Number(value) || 0);
}

export function DraftsListClient({
  initialRows = [],
  disableAutoLoad = false,
  initialDeleteTargetId = "",
}: Props) {
  const [loading, setLoading] = useState(!disableAutoLoad && initialRows.length < 1);
  const [rows, setRows] = useState<DraftUploadListItem[]>(initialRows);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState(initialDeleteTargetId);

  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<DraftUploadPreview | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState("");

  const csrfToken = useMemo(() => readDevCsrfToken(), []);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const list = await fetchDraftList(fetch, csrfToken);
      setRows(list);
    } catch (error) {
      setRows([]);
      setMessage(error instanceof Error ? error.message : "초안 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [csrfToken]);

  useEffect(() => {
    if (disableAutoLoad) return;
    void loadDrafts();
  }, [disableAutoLoad, loadDrafts]);

  async function handleImportPreview() {
    if (!file || importing) return;
    setImporting(true);
    setMessage("");

    try {
      const csvText = await file.text();
      const result = await fetchCsvDraftPreview(csvText, fetch, csrfToken);
      setPreview(result);
      setSelectedDraftId("");
      setMessage("미리보기를 생성했습니다. 저장을 누르면 로컬 Draft로 보관됩니다.");
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : "CSV 미리보기를 만들지 못했습니다.");
    } finally {
      setImporting(false);
    }
  }

  async function handleSavePreview() {
    if (!preview || saving) return;
    setSaving(true);
    setMessage("");

    try {
      const saved = await saveCsvDraftPreview(preview, { filename: file?.name }, fetch, csrfToken);
      setSelectedDraftId(saved.id);
      await loadDrafts();
      setMessage(`초안을 저장했습니다: ${saved.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "초안 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function openDeleteDialog(id: string): void {
    if (deletingId) return;
    setDeleteTargetId(id);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setMessage("");

    try {
      const response = await fetch(`/api/planning/v3/drafts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify(csrfToken ? { csrf: csrfToken } : {}),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isRecord(json) || json.ok !== true) {
        setMessage("초안 삭제에 실패했습니다.");
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

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Drafts</h1>
          <p className="text-sm text-slate-600">CSV 업로드 후 draft 미리보기를 확인하고, 저장 버튼으로 로컬에 보관합니다.</p>

          <BodyInset className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">CSV 업로드</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                accept=".csv,text/csv,text/plain"
                className={`${bodyFieldClassName} sm:w-96`}
                data-testid="v3-csv-upload-input"
                onChange={(event) => {
                  const picked = event.target.files?.[0] ?? null;
                  setFile(picked);
                }}
                type="file"
              />
              <Button
                data-testid="v3-csv-upload-preview"
                disabled={!file || importing}
                onClick={() => {
                  void handleImportPreview();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {importing ? "미리보기 생성 중..." : "미리보기"}
              </Button>
              <Button
                data-testid="v3-csv-upload-save"
                disabled={!preview || saving}
                onClick={() => {
                  void handleSavePreview();
                }}
                size="sm"
                type="button"
              >
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>

            {preview ? (
              <div className="rounded-lg border border-emerald-200 bg-white p-2 text-xs text-slate-700" data-testid="v3-csv-draft-preview">
                <p>rows: {preview.draftSummary.rows.toLocaleString("ko-KR")}</p>
                <p>columns: {preview.draftSummary.columns.toLocaleString("ko-KR")}</p>
                <p>months: {preview.meta.months.toLocaleString("ko-KR")}</p>
                <p>income: {formatKrw(pickPatchNumber(preview.draftPatch.monthlyIncomeNet))}</p>
                <p>
                  expense: {formatKrw(
                    pickPatchNumber(preview.draftPatch.monthlyEssentialExpenses)
                    + pickPatchNumber(preview.draftPatch.monthlyDiscretionaryExpenses),
                  )}
                </p>
              </div>
            ) : null}

            {selectedDraftId ? (
              <BodyActionLink href={`/planning/v3/drafts/${encodeURIComponent(selectedDraftId)}`}>
                새로 저장한 Draft 열기
              </BodyActionLink>
            ) : null}
          </BodyInset>

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
            <BodyActionLink href="/planning/v3/drafts/profile">
              Profile 초안 생성
            </BodyActionLink>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
        </Card>

        <Card className="space-y-3">
          {loading ? <p className="text-sm text-slate-600">목록을 불러오는 중...</p> : null}
          {!loading && rows.length < 1 ? <p className="text-sm text-slate-600">저장된 초안이 없습니다.</p> : null}

          {rows.length > 0 ? (
            <BodyTableFrame>
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
                    <tr
                      className={selectedDraftId === row.id ? "bg-emerald-50" : undefined}
                      data-testid={`v3-draft-row-${row.id}`}
                      key={row.id}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-slate-800">{formatDateTime(row.createdAt)}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{asNumber(row.source.months) ?? "-"}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{asNumber(row.source.rows) ?? "-"}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.summary.medianIncomeKrw))}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.summary.medianExpenseKrw))}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatKrw(asNumber(row.summary.avgNetKrw))}</td>
                      <td className="px-3 py-2">
                        <div className={bodyDenseActionRowClassName}>
                          <BodyActionLink href={`/planning/v3/drafts/${encodeURIComponent(row.id)}`}>
                            상세
                          </BodyActionLink>
                          <Button
                            data-testid={`v3-draft-delete-${row.id}`}
                            disabled={deletingId === row.id}
                            onClick={() => {
                              openDeleteDialog(row.id);
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
            </BodyTableFrame>
          ) : null}
        </Card>
      </div>
      {deleteTargetId ? (
        <div
          aria-labelledby="v3-draft-delete-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-8"
          role="dialog"
        >
          <BodyDialogSurface data-testid="v3-draft-delete-dialog">
            <h2 className="text-base font-black text-slate-900" id="v3-draft-delete-title">초안 삭제 확인</h2>
            <p className="mt-2 text-sm text-slate-700">이 초안을 삭제할까요? 삭제 후 복구할 수 없습니다.</p>
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
