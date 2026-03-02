"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  source: "exim_exchange" | "mois_benefits" | "reb_subscription" | "finlife" | "molit_sales" | "molit_rent";
};

type PingState = { tone: "ok" | "error"; text: string } | null;

function toText(summary: Record<string, unknown> | undefined): string {
  if (!summary) return "연결 성공";
  const parts: string[] = [];
  if (typeof summary.asOf === "string") parts.push(`기준일 ${summary.asOf}`);
  if (typeof summary.rateCount === "number") parts.push(`${summary.rateCount}개 통화`);
  if (typeof summary.count === "number") parts.push(`${summary.count}건`);
  if (typeof summary.month === "string") parts.push(`${summary.month} 데이터`);
  if (typeof summary.mode === "string") parts.push(`mode=${summary.mode}`);
  if (typeof summary.endpointPath === "string") parts.push(summary.endpointPath);
  if (typeof summary.resolvedFrom === "string") parts.push(`resolved=${summary.resolvedFrom}`);
  if (typeof summary.authMode === "string") parts.push(`auth=${summary.authMode}`);
  if (typeof summary.scannedPages === "number") parts.push(`pages=${summary.scannedPages}`);
  if (typeof summary.scannedRows === "number") parts.push(`rows=${summary.scannedRows}`);
  if (typeof summary.matchedRows === "number") parts.push(`matched=${summary.matchedRows}`);
  if (typeof summary.rawMatched === "number") parts.push(`rawMatched=${summary.rawMatched}`);
  if (typeof summary.normalizedCount === "number") parts.push(`normalized=${summary.normalizedCount}`);
  if (summary.dropStats && typeof summary.dropStats === "object") {
    const dropStats = summary.dropStats as Record<string, unknown>;
    const missingTitle = typeof dropStats.missingTitle === "number" ? dropStats.missingTitle : undefined;
    if (typeof missingTitle === "number" && missingTitle > 0) parts.push(`drop.missingTitle=${missingTitle}`);
  }
  return parts.length ? parts.join(" · ") : "연결 성공";
}

export function DataSourcePingButton({ source }: Props) {
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<PingState>(null);

  const onTest = async () => {
    setLoading(true);
    setState(null);
    try {
      const res = await fetch(`/api/dev/data-sources/ping?source=${encodeURIComponent(source)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!json?.ok) {
        const code = typeof json?.error?.code === "string" ? json.error.code : "ERROR";
        const message = typeof json?.error?.message === "string" ? json.error.message : "연결 실패";
        setState({ tone: "error", text: `${code}: ${message}` });
        return;
      }
      const success = json?.data?.success !== false;
      setState({ tone: success ? "ok" : "error", text: `${success ? "연결 OK" : "연결 주의"} · ${toText(json?.data?.summary)}` });
    } catch {
      setState({ tone: "error", text: "연결 테스트 요청 실패" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2">
      <Button size="sm" variant="outline" onClick={onTest} disabled={loading}>
        {loading ? "테스트 중..." : "연결 테스트"}
      </Button>
      {state ? (
        <p className={`mt-2 text-xs ${state.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>{state.text}</p>
      ) : null}
    </div>
  );
}
