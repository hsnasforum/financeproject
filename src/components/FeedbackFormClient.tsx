"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { downloadText } from "@/lib/browser/download";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { cn } from "@/lib/utils";

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
      setNotice("의견이 저장되었습니다. 이후 피드백 목록과 상세 화면에서 접수 내용과 진행 상태를 다시 확인할 수 있습니다.");
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
      setNotice("진단 번들을 다운로드했습니다. 오류 재현이나 지원 대응에 직접 공유가 필요할 때만 함께 전달해 주세요.");
    } catch {
      setError("진단 번들 다운로드 중 오류가 발생했습니다.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="의견과 도움 요청 남기기"
        description="문제 상황이나 개선 아이디어를 기록으로 남기면 이후 목록과 상세 화면에서 다시 확인할 수 있습니다."
        action={
          <Link href="/dashboard">
            <Button variant="outline" size="sm">대시보드로 이동</Button>
          </Link>
        }
      />

      <Card className="rounded-[2rem] p-8 shadow-sm">
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50/70 p-5">
            <p className="text-sm font-black text-slate-800">무엇을 남기나요?</p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
              이 화면은 즉시 답변을 받는 곳이 아니라, 문제 상황과 개선 아이디어를 기록으로 남겨 두는 support entry 화면입니다.
            </p>
            <p className="mt-3 text-xs font-bold leading-relaxed text-slate-500">
              저장 뒤에는 피드백 목록과 상세 화면에서 접수 시각, 진행 상태, 첨부 진단 정보를 다시 볼 수 있습니다. 진단 번들은 오류 재현이나 지원 대응에 직접 공유가 필요할 때만 내려받으세요.
            </p>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700 tracking-tight">카테고리</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
              disabled={submitting}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700 tracking-tight">메시지</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={8}
              className="w-full rounded-[2rem] border border-slate-200 bg-white p-5 text-sm font-medium leading-relaxed text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
              placeholder="문제 상황 또는 개선 아이디어를 구체적으로 적어 주세요."
              disabled={submitting}
            />
            <div className="mt-2 flex justify-end">
              <span className={cn("text-[10px] font-black uppercase tracking-widest", messageLength > 1900 ? "text-rose-500" : "text-slate-400")}>
                {messageLength.toLocaleString()} / 2,000
              </span>
            </div>
          </label>

          {notice ? <p className="text-sm font-black text-emerald-600 bg-emerald-50 p-4 rounded-2xl">{notice}</p> : null}
          {error ? <p className="text-sm font-black text-rose-600 bg-rose-50 p-4 rounded-2xl">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" variant="primary" className="h-11 px-8 rounded-2xl font-black shadow-md" disabled={submitting}>
              {submitting ? "저장 중..." : "내용 저장하기"}
            </Button>
            <Button type="button" variant="outline" className="h-11 px-6 rounded-2xl font-black shadow-sm" onClick={() => void onDownloadBundle()} disabled={downloading || submitting}>
              {downloading ? "생성 중..." : "공유용 진단 번들"}
            </Button>
            <p className="ml-2 text-xs font-bold text-slate-400">진단 번들은 직접 공유가 필요할 때만 내려받고, 민감정보(비밀번호, 계좌번호 전체 등)는 남기지 마세요.</p>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
