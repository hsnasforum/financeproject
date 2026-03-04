"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { copyToClipboard } from "@/lib/browser/clipboard";
import { downloadText } from "@/lib/browser/download";

export type ArtifactQuickActionName =
  | "brief_md"
  | "alerts_md"
  | "digest_md"
  | "refresh_json"
  | "refresh_log"
  | "alerts_json"
  | "digest_json"
  | "brief_json"
  | "news_brief_json"
  | "news_brief_md"
  | "news_scenarios_json"
  | "news_scenarios_md"
  | "news_topic_trends_json"
  | "news_digest_day_json"
  | "news_digest_day_md";

type ArtifactQuickActionsProps = {
  artifactName: ArtifactQuickActionName;
  label: string;
};

type ArtifactApiPayload = {
  ok?: boolean;
  data?: {
    name?: string;
    content?: string;
  } | null;
  error?: {
    message?: string;
  };
};

const FILENAME_MAP: Record<ArtifactQuickActionName, string> = {
  brief_md: "dart-daily-brief.md",
  alerts_md: "dart-disclosure-alerts.md",
  digest_md: "dart-disclosure-digest.md",
  refresh_json: "daily_refresh_result.json",
  refresh_log: "daily_refresh.log",
  alerts_json: "disclosure_alerts.json",
  digest_json: "disclosure_digest.json",
  brief_json: "daily_brief.json",
  news_brief_json: "news_brief.latest.json",
  news_brief_md: "news_brief.latest.md",
  news_scenarios_json: "news_scenarios.latest.json",
  news_scenarios_md: "news_scenarios.latest.md",
  news_topic_trends_json: "topic_trends.latest.json",
  news_digest_day_json: "digest_day.latest.json",
  news_digest_day_md: "digest_day.latest.md",
};

function inferMimeType(artifactName: ArtifactQuickActionName): string {
  if (artifactName.endsWith("_json")) return "application/json;charset=utf-8";
  if (artifactName.endsWith("_md")) return "text/markdown;charset=utf-8";
  return "text/plain;charset=utf-8";
}

export function ArtifactQuickActions({ artifactName, label }: ArtifactQuickActionsProps) {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const disabled = loading || !content;
  const filename = useMemo(() => FILENAME_MAP[artifactName] ?? `${artifactName}.txt`, [artifactName]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setFetchError(null);
      setActionMessage(null);
      setContent(null);
      try {
        const response = await fetch(`/api/dev/artifacts?name=${encodeURIComponent(artifactName)}`, { cache: "no-store" });
        const payload = (await response.json()) as ArtifactApiPayload;
        if (!response.ok || payload.ok !== true) {
          throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
        }
        if (!active) return;
        const rawContent = typeof payload.data?.content === "string" ? payload.data.content : null;
        setContent(rawContent);
      } catch {
        if (!active) return;
        setFetchError("산출물을 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [artifactName]);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    const result = await copyToClipboard(content);
    if (result.ok) {
      setActionMessage({ kind: "ok", text: "복사되었습니다." });
      return;
    }
    setActionMessage({ kind: "error", text: result.message ?? "복사에 실패했습니다." });
  }, [content]);

  const handleDownload = useCallback(() => {
    if (!content) return;
    downloadText(filename, content, inferMimeType(artifactName));
    setActionMessage({ kind: "ok", text: "다운로드를 시작했습니다." });
  }, [artifactName, content, filename]);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold text-slate-700">{label}</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => { void handleCopy(); }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            복사
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={handleDownload}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            다운로드
          </button>
        </div>
      </div>

      {fetchError ? (
        <p className="mt-2 text-[11px] text-rose-600">{fetchError}</p>
      ) : !loading && !content ? (
        <p className="mt-2 text-[11px] text-slate-500">dart:watch 또는 daily:refresh 실행 필요</p>
      ) : null}

      {actionMessage ? (
        <p className={`mt-2 text-[11px] ${actionMessage.kind === "ok" ? "text-emerald-700" : "text-rose-600"}`}>
          {actionMessage.text}
        </p>
      ) : null}
    </div>
  );
}
