"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { buildConfirmString } from "@/lib/ops/confirm";

type TrashKind = "profiles" | "runs" | "reports";
type TrashKindOrAll = TrashKind | "all";

type TrashItem = {
  kind: TrashKind;
  id: string;
  deletedAt: string;
  sizeBytes: number;
};

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
  meta?: Record<string, unknown>;
};

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export function PlanningTrashClient() {
  const [kindFilter, setKindFilter] = useState<TrashKindOrAll>("all");
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadTrash(nextKind: TrashKindOrAll = kindFilter): Promise<void> {
    setLoading(true);
    try {
      const params = new URLSearchParams({ kind: nextKind, limit: "200" });
      const res = await fetch(`/api/planning/v2/trash?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<TrashItem[]> | null;
      if (!res.ok || !payload?.ok || !Array.isArray(payload.data)) {
        setItems([]);
        window.alert(payload?.error?.message ?? "휴지통 목록을 불러오지 못했습니다.");
        return;
      }
      setItems(payload.data);
    } catch (error) {
      setItems([]);
      window.alert(error instanceof Error ? error.message : "휴지통 목록 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function restoreItem(kind: TrashKind, id: string): Promise<void> {
    const expectedConfirm = buildConfirmString(`RESTORE ${kind}`, id);
    const confirmText = window.prompt(
      `복구 확인 문구를 입력하세요.\n${expectedConfirm}`,
      expectedConfirm,
    );
    if (!confirmText) return;

    try {
      const res = await fetch("/api/planning/v2/trash/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({ kind, id, confirmText })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<{ restored?: boolean }> | null;
      if (!res.ok || !payload?.ok) {
        window.alert(payload?.error?.message ?? "복구에 실패했습니다.");
        return;
      }
      await loadTrash();
      window.alert("휴지통 항목을 복구했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "복구 중 오류가 발생했습니다.");
    }
  }

  async function deletePermanently(kind: TrashKind, id: string): Promise<void> {
    const expectedConfirm = buildConfirmString(`DELETE ${kind}`, id);
    const confirmText = window.prompt(
      `영구 삭제 확인 문구를 입력하세요.\n${expectedConfirm}`,
      expectedConfirm,
    );
    if (!confirmText) return;

    try {
      const res = await fetch("/api/planning/v2/trash", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({ kind, id, confirmText })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<{ deleted?: boolean }> | null;
      if (!res.ok || !payload?.ok) {
        window.alert(payload?.error?.message ?? "영구 삭제에 실패했습니다.");
        return;
      }
      await loadTrash();
      window.alert("휴지통 항목을 영구 삭제했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "영구 삭제 중 오류가 발생했습니다.");
    }
  }

  async function emptyTrashAction(): Promise<void> {
    const expectedConfirm = buildConfirmString("EMPTY_TRASH", kindFilter);
    const confirmText = window.prompt(
      `휴지통 비우기 확인 문구를 입력하세요.\n${expectedConfirm}`,
      expectedConfirm,
    );
    if (!confirmText) return;

    try {
      const res = await fetch("/api/planning/v2/trash/empty", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({ kind: kindFilter, confirmText })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<{ deleted?: number }> | null;
      if (!res.ok || !payload?.ok) {
        window.alert(payload?.error?.message ?? "휴지통 비우기에 실패했습니다.");
        return;
      }
      await loadTrash();
      window.alert(`휴지통 비우기 완료: ${payload.data?.deleted ?? 0}건`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "휴지통 비우기 중 오류가 발생했습니다.");
    }
  }

  useEffect(() => {
    void loadTrash("all");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageShell>
      <PageHeader
        title="플래닝 휴지통"
        description="profiles/runs/reports 소프트 삭제 항목을 복구하거나 영구 삭제합니다."
        action={(
          <div className="flex items-center gap-4 text-sm">
            <Link className="font-semibold text-emerald-700" href="/planning/runs">실행 기록</Link>
            <Link className="font-semibold text-emerald-700" href="/planning">플래닝</Link>
          </div>
        )}
      />

      <Card className="mb-6 border border-amber-200 bg-amber-50">
        <p className="text-sm font-semibold text-amber-900">영구 삭제는 되돌릴 수 없습니다.</p>
        <p className="mt-1 text-xs text-amber-800">복구가 필요한 경우 먼저 복구 버튼을 사용하세요.</p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-700" htmlFor="trash-kind-filter">
            kind
          </label>
          <select
            id="trash-kind-filter"
            className="h-9 rounded-xl border border-slate-300 px-2 text-xs"
            value={kindFilter}
            onChange={(event) => {
              const next = event.target.value as TrashKindOrAll;
              setKindFilter(next);
              void loadTrash(next);
            }}
          >
            <option value="all">all</option>
            <option value="profiles">profiles</option>
            <option value="runs">runs</option>
            <option value="reports">reports</option>
          </select>

          <Button disabled={loading} onClick={() => void loadTrash()} size="sm" variant="ghost">새로고침</Button>
          <Button disabled={loading} onClick={() => void emptyTrashAction()} size="sm" variant="outline">휴지통 비우기</Button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs text-slate-700">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-2 py-2">kind</th>
                <th className="px-2 py-2">id</th>
                <th className="px-2 py-2">deletedAt</th>
                <th className="px-2 py-2">size</th>
                <th className="px-2 py-2">동작</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td className="px-2 py-3" colSpan={5}>휴지통이 비어 있습니다.</td></tr>
              ) : items.map((item) => (
                <tr className="border-b border-slate-100" key={`${item.kind}-${item.id}`}>
                  <td className="px-2 py-2">{item.kind}</td>
                  <td className="px-2 py-2">{item.id}</td>
                  <td className="px-2 py-2">{formatDateTime(item.deletedAt)}</td>
                  <td className="px-2 py-2">{formatBytes(item.sizeBytes)}</td>
                  <td className="px-2 py-2">
                    <button
                      className="font-semibold text-emerald-700"
                      onClick={() => void restoreItem(item.kind, item.id)}
                      type="button"
                    >
                      복구
                    </button>
                    <span className="mx-1 text-slate-300">|</span>
                    <button
                      className="font-semibold text-rose-700"
                      onClick={() => void deletePermanently(item.kind, item.id)}
                      type="button"
                    >
                      영구 삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageShell>
  );
}

export default PlanningTrashClient;
