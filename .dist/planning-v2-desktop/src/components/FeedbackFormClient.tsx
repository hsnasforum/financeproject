"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { downloadText } from "@/lib/browser/download";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

type FeedbackCategory = "bug" | "improve" | "question";

type SubmitPayload = {
  ok?: boolean;
  error?: {
    message?: string;
  };
};

type LocalStateSummary = Record<string, { exists: boolean; savedAt: string | null }>;

type DiagnosticsSnapshot = {
  generatedAt: string;
  appVersion: string | null;
  page: {
    url: string | null;
    userAgent: string | null;
  };
  recentErrors: Array<{
    time: string;
    traceId: string;
    route: string;
    source: string;
    code: string;
    message: string;
    status: number;
    elapsedMs: number;
  }>;
  dailyRefresh: {
    generatedAt: string | null;
    ok: boolean;
    steps: Array<{ name: string; status: "ok" | "skipped" | "failed"; tookMs: number }>;
  } | null;
  dartArtifacts: {
    dirExists: boolean;
    items: Array<{ name: string; exists: boolean; updatedAt: string | null }>;
  };
  localStateSummary: LocalStateSummary | null;
};

type SnapshotPayload = {
  ok?: boolean;
  data?: DiagnosticsSnapshot;
};

const CATEGORY_OPTIONS: Array<{ value: FeedbackCategory; label: string }> = [
  { value: "bug", label: "버그" },
  { value: "improve", label: "개선 제안" },
  { value: "question", label: "질문" },
];

const LOCAL_STATE_KEYS = [
  "planner_last_snapshot_v1",
  "recommend_last_result_v1",
  "recommend_profile_v1",
] as const;

function parseSavedAtFromJson(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const savedAt = (parsed as Record<string, unknown>).savedAt;
    if (typeof savedAt !== "string") return null;
    const time = Date.parse(savedAt);
    if (!Number.isFinite(time)) return null;
    return new Date(time).toISOString();
  } catch {
    return null;
  }
}

function collectLocalStateSummary(): LocalStateSummary | null {
  if (typeof window === "undefined") return null;
  const out: LocalStateSummary = {};
  try {
    for (const key of LOCAL_STATE_KEYS) {
      const raw = window.localStorage.getItem(key);
      if (raw === null) {
        out[key] = { exists: false, savedAt: null };
        continue;
      }
      out[key] = {
        exists: true,
        savedAt: parseSavedAtFromJson(raw),
      };
    }
  } catch {
    for (const key of LOCAL_STATE_KEYS) {
      out[key] = { exists: false, savedAt: null };
    }
  }
  return out;
}

export function FeedbackFormClient() {
  const [category, setCategory] = useState<FeedbackCategory>("improve");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [snapshotCache, setSnapshotCache] = useState<DiagnosticsSnapshot | null>(null);

  const messageLength = useMemo(() => message.trim().length, [message]);

  async function fetchDiagnosticsSnapshot(): Promise<DiagnosticsSnapshot | null> {
    try {
      const localStateSummary = collectLocalStateSummary();
      const localStateHeader = localStateSummary ? encodeURIComponent(JSON.stringify(localStateSummary)) : "";
      const response = await fetch("/api/diagnostics/snapshot", {
        method: "GET",
        headers: {
          "x-page-url": window.location.href,
          ...(localStateHeader ? { "x-local-state-summary": localStateHeader } : {}),
        },
      });
      const payload = (await response.json().catch(() => null)) as SnapshotPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) return null;
      setSnapshotCache(payload.data);
      return payload.data;
    } catch {
      return null;
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    const normalized = message.trim();
    if (normalized.length < 5 || normalized.length > 2000) {
      setError("메시지는 5~2000자 사이로 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const snapshot = await fetchDiagnosticsSnapshot();
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          message: normalized,
          ...(snapshot ? { snapshot } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as SubmitPayload | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error?.message ?? "피드백 저장 중 오류가 발생했습니다.");
        return;
      }
      setMessage("");
      setNotice("피드백이 저장되었습니다. 감사합니다.");
    } catch {
      setError("네트워크 오류로 저장하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDownloadBundle() {
    setNotice("");
    setError("");
    setDownloading(true);
    try {
      const snapshot = snapshotCache ?? await fetchDiagnosticsSnapshot();
      if (!snapshot) {
        setError("진단 스냅샷을 생성하지 못했습니다.");
        return;
      }
      downloadText("diagnostics_bundle.json", JSON.stringify(snapshot, null, 2), "application/json;charset=utf-8");
      setNotice("진단 번들을 다운로드했습니다.");
    } catch {
      setError("진단 번들 다운로드 중 오류가 발생했습니다.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="사용자 피드백"
        description="개선 아이디어, 버그, 질문을 남겨 주세요."
        action={
          <Link href="/dashboard">
            <Button variant="outline" size="sm">대시보드로 이동</Button>
          </Link>
        }
      />

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700">카테고리</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              disabled={submitting}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-700">메시지</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={8}
              className="w-full rounded-md border border-slate-300 p-3 text-sm"
              placeholder="문제 상황 또는 개선 아이디어를 구체적으로 적어 주세요."
              disabled={submitting}
            />
            <p className="mt-1 text-xs text-slate-500">{messageLength}/2000</p>
          </label>

          {notice ? <p className="text-sm font-semibold text-emerald-700">{notice}</p> : null}
          {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={submitting}>
              {submitting ? "저장 중..." : "피드백 제출"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void onDownloadBundle()} disabled={downloading || submitting}>
              {downloading ? "생성 중..." : "진단 번들 다운로드"}
            </Button>
            <p className="text-xs text-slate-500">민감정보는 입력하지 마세요.</p>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
