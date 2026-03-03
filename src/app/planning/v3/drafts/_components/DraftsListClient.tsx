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
  source: "csv";
  meta: {
    rows: number;
    months: number;
  };
};

type ListResponse = {
  ok: true;
  drafts: DraftListItem[];
};

type GetDraftResponse = {
  ok: true;
  draft: Record<string, unknown>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDraftListItem(value: unknown): value is DraftListItem {
  if (!isRecord(value)) return false;
  if (!asString(value.id)) return false;
  if (!asString(value.createdAt)) return false;
  if (value.source !== "csv") return false;
  if (!isRecord(value.meta)) return false;
  return isFiniteNumber(value.meta.rows) && isFiniteNumber(value.meta.months);
}

function isListResponse(payload: unknown): payload is ListResponse {
  if (!isRecord(payload)) return false;
  if (payload.ok !== true) return false;
  if (!Array.isArray(payload.drafts)) return false;
  return payload.drafts.every(isDraftListItem);
}

function isGetDraftResponse(payload: unknown): payload is GetDraftResponse {
  if (!isRecord(payload)) return false;
  if (payload.ok !== true) return false;
  return isRecord(payload.draft);
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function downloadJson(filename: string, payload: unknown): void {
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DraftsListClient() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DraftListItem[]>([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

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

  async function handleDownload(id: string) {
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/planning/v3/drafts/${encodeURIComponent(id)}${buildCsrfQuery()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isGetDraftResponse(json)) {
        setMessage("다운로드에 실패했습니다.");
        return;
      }
      downloadJson(`draft-${id}.json`, json.draft);
    } catch {
      setMessage("다운로드에 실패했습니다.");
    } finally {
      setBusyId("");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("이 초안을 삭제할까요?")) return;
    setBusyId(id);
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
        setMessage("삭제에 실패했습니다.");
        return;
      }
      await loadDrafts();
    } catch {
      setMessage("삭제에 실패했습니다.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Drafts</h1>
          <p className="text-sm text-slate-600">CSV import 결과를 수동 저장한 초안 목록입니다.</p>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
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
            <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/import">
              CSV 가져오기로 이동
            </Link>
          </div>
        </Card>

        <Card className="space-y-3">
          {loading ? <p className="text-sm text-slate-600">목록을 불러오는 중...</p> : null}
          {!loading && rows.length < 1 ? (
            <p className="text-sm text-slate-600">저장된 초안이 없습니다.</p>
          ) : null}
          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="v3-drafts-table">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">생성일</th>
                    <th className="px-3 py-2 text-right">rows</th>
                    <th className="px-3 py-2 text-right">months</th>
                    <th className="px-3 py-2 text-left">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr data-testid="v3-draft-row" key={row.id}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-800">{formatDateTime(row.createdAt)}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{row.meta.rows.toLocaleString("ko-KR")}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{row.meta.months.toLocaleString("ko-KR")}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            className="text-sm font-semibold text-emerald-700 underline underline-offset-2"
                            href={`/planning/v3/drafts/${encodeURIComponent(row.id)}`}
                          >
                            열기
                          </Link>
                          <Button
                            disabled={busyId === row.id}
                            onClick={() => {
                              void handleDownload(row.id);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            다운로드
                          </Button>
                          <Button
                            disabled={busyId === row.id}
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
