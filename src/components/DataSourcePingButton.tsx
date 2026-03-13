"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  createDataSourcePingSnapshot,
  formatDataSourcePingSummary,
  type DataSourcePingSnapshot,
  type PingSourceName,
} from "@/lib/dataSources/pingState";

type Props = {
  source: PingSourceName;
  onResult?: (snapshot: DataSourcePingSnapshot) => void;
  showInlineState?: boolean;
};

type PingState = { tone: "ok" | "error"; text: string } | null;

export function DataSourcePingButton({ source, onResult, showInlineState = true }: Props) {
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
        const text = `${code}: ${message}`;
        setState({ tone: "error", text });
        onResult?.({
          source,
          tone: "error",
          text,
          summaryText: text,
          statusLabel: "주의",
          fetchedAt: new Date().toISOString(),
        });
        return;
      }
      const success = json?.data?.success !== false;
      const snapshot = createDataSourcePingSnapshot({
        source,
        success,
        fetchedAt: json?.data?.fetchedAt,
        summary: typeof json?.data?.summary === "object" && json.data.summary !== null
          ? json.data.summary as Record<string, unknown>
          : undefined,
      });
      const text = snapshot?.text ?? `${success ? "연결 OK" : "연결 주의"} · ${formatDataSourcePingSummary(json?.data?.summary)}`;
      setState({ tone: success ? "ok" : "error", text });
      if (snapshot) onResult?.(snapshot);
    } catch {
      const text = "연결 테스트 요청 실패";
      setState({ tone: "error", text });
      onResult?.({
        source,
        tone: "error",
        text,
        summaryText: text,
        statusLabel: "주의",
        fetchedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2">
      <Button size="sm" variant="outline" onClick={onTest} disabled={loading}>
        {loading ? "테스트 중..." : "연결 테스트"}
      </Button>
      {showInlineState && state ? (
        <p className={`mt-2 text-xs ${state.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>{state.text}</p>
      ) : null}
    </div>
  );
}
