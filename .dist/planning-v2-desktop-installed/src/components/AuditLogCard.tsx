"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type AuditItem = {
  id: string;
  createdAt: string;
  event: string;
  route: string;
  summary: string;
  details?: unknown;
};

type AuditRecentPayload = {
  ok?: boolean;
  data?: AuditItem[];
  error?: {
    message?: string;
  };
};

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { hour12: false });
}

function detailsPreview(value: unknown): string {
  if (value === undefined) return "-";
  try {
    const text = JSON.stringify(value);
    if (!text) return "-";
    return text.length > 120 ? `${text.slice(0, 120)}...` : text;
  } catch {
    return "-";
  }
}

type AuditLogCardProps = {
  limit?: number;
};

export function AuditLogCard({ limit = 50 }: AuditLogCardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<AuditItem[]>([]);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dev/audit/recent?limit=${encodeURIComponent(String(limit))}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as AuditRecentPayload | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        throw new Error(payload?.error?.message ?? "감사 로그를 불러오지 못했습니다.");
      }
      setItems(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "감사 로그 조회 중 오류가 발생했습니다.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900">최근 Dev Audit Log</h2>
          <p className="mt-1 text-sm text-slate-600">설정/복구/백업 관련 Dev 변경 이력을 보여줍니다.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadAudit()} disabled={loading}>
          {loading ? "로딩 중..." : "새로고침"}
        </Button>
      </div>

      {error ? <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">시각</th>
              <th className="px-3 py-2 font-semibold">이벤트</th>
              <th className="px-3 py-2 font-semibold">Route</th>
              <th className="px-3 py-2 font-semibold">요약</th>
              <th className="px-3 py-2 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-500">불러오는 중...</td>
              </tr>
            ) : items.length < 1 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-500">기록이 없습니다.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-slate-200 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatDateTime(item.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-800">{item.event}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{item.route}</td>
                  <td className="px-3 py-2 text-slate-700">{item.summary}</td>
                  <td className="max-w-[320px] px-3 py-2 text-slate-500">{detailsPreview(item.details)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
