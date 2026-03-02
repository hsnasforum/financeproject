"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { copyToClipboard } from "@/lib/browser/clipboard";
import { downloadText } from "@/lib/browser/download";
import { buildIssueMarkdown } from "@/lib/feedback/issueTemplate";
import { isOpsTicket, parseOpsAction } from "@/lib/ops/opsTicketParser";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

const DEV_UNLOCKED_SESSION_KEY = "dev_action_unlocked_v1";
const DEV_CSRF_SESSION_KEY = "dev_action_csrf_v1";

type FeedbackCategory = "bug" | "improve" | "question";
type FeedbackStatus = "OPEN" | "DOING" | "DONE";
type FeedbackPriority = "P0" | "P1" | "P2" | "P3";
type FeedbackTask = {
  id: string;
  text: string;
  done: boolean;
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

type FeedbackDetail = {
  id: string;
  createdAt: string;
  category: FeedbackCategory;
  message: string;
  traceId: string | null;
  userAgent: string | null;
  url: string | null;
  appVersion: string | null;
  status: FeedbackStatus;
  tags: string[];
  note: string;
  priority: FeedbackPriority;
  dueDate: string | null;
  tasks: FeedbackTask[];
  snapshot?: DiagnosticsSnapshot;
};

type FeedbackDetailPayload = {
  ok?: boolean;
  data?: FeedbackDetail;
  error?: {
    code?: string;
    message?: string;
  };
};

type FeedbackPatchPayload = {
  ok?: boolean;
  data?: FeedbackDetail;
  error?: {
    code?: string;
    message?: string;
  };
};

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { hour12: false });
}

function categoryLabel(category: FeedbackCategory): string {
  if (category === "bug") return "버그";
  if (category === "improve") return "개선";
  return "질문";
}

type Props = {
  id: string;
};

function toTagsInput(tags: string[] | null | undefined): string {
  if (!Array.isArray(tags) || tags.length === 0) return "";
  return tags.join(", ");
}

function parseTagsInput(value: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const chunk of value.split(",")) {
    const trimmed = chunk.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function normalizeDateInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

type ChainPlan = {
  risk: "LOW" | "MEDIUM" | "HIGH";
  steps: string[];
  impact: string[];
};

function readDevCsrf(): string | null {
  if (typeof window === "undefined") return null;
  const unlocked = window.sessionStorage.getItem(DEV_UNLOCKED_SESSION_KEY) === "1";
  const csrf = (window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY) ?? "").trim();
  if (!unlocked || !csrf) return null;
  return csrf;
}

function riskBadgeClass(risk: "LOW" | "MEDIUM" | "HIGH"): string {
  if (risk === "HIGH") return "border-rose-200 bg-rose-50 text-rose-700";
  if (risk === "MEDIUM") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function FeedbackDetailClient({ id }: Props) {
  const isDevEnv = process.env.NODE_ENV !== "production";
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<FeedbackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issueMarkdown, setIssueMarkdown] = useState("");
  const [status, setStatus] = useState<FeedbackStatus>("OPEN");
  const [priority, setPriority] = useState<FeedbackPriority>("P2");
  const [dueDate, setDueDate] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [note, setNote] = useState("");
  const [tasks, setTasks] = useState<FeedbackTask[]>([]);
  const [taskInput, setTaskInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [opsPlan, setOpsPlan] = useState<ChainPlan | null>(null);
  const [opsRunning, setOpsRunning] = useState(false);
  const [opsPlanLoading, setOpsPlanLoading] = useState(false);
  const [opsMessage, setOpsMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      setNotice(null);
      setIssueMarkdown("");
      try {
        const response = await fetch(`/api/feedback/${encodeURIComponent(id)}`, { cache: "no-store" });
        const payload = (await response.json()) as FeedbackDetailPayload;
        if (!response.ok || !payload.ok || !payload.data) {
          if (payload.error?.code === "NO_DATA") {
            throw new Error("요청한 피드백을 찾지 못했습니다.");
          }
          throw new Error(payload.error?.message ?? "상세 조회 실패");
        }
        if (!active) return;
        setItem(payload.data);
        setStatus(payload.data.status ?? "OPEN");
        setPriority(payload.data.priority ?? "P2");
        setDueDate(payload.data.dueDate ?? "");
        setTagsInput(toTagsInput(payload.data.tags));
        setNote(payload.data.note ?? "");
        setTasks(Array.isArray(payload.data.tasks) ? payload.data.tasks : []);
        setOpsPlan(null);
        setOpsMessage("");
      } catch (loadError) {
        if (!active) return;
        setItem(null);
        setError(loadError instanceof Error ? loadError.message : "피드백 상세를 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id]);

  const serialized = useMemo(() => (item ? JSON.stringify(item, null, 2) : ""), [item]);
  const snapshotPretty = useMemo(
    () => (item?.snapshot ? JSON.stringify(item.snapshot, null, 2) : ""),
    [item?.snapshot],
  );
  const opsAction = useMemo(() => {
    if (!item || !isOpsTicket(item)) return null;
    return parseOpsAction(item);
  }, [item]);

  async function handleCopy() {
    if (!serialized) return;
    const copied = await copyToClipboard(serialized);
    if (copied.ok) {
      setNotice("피드백 JSON을 복사했습니다.");
      return;
    }
    setNotice(copied.message ?? "복사에 실패했습니다.");
  }

  function handleDownload() {
    if (!serialized || !item) return;
    downloadText(`feedback_${item.id}.json`, serialized, "application/json;charset=utf-8");
    setNotice("피드백 JSON 다운로드를 시작했습니다.");
  }

  function handleGenerateIssueTemplate() {
    if (!item) return;
    const markdown = buildIssueMarkdown(item, {
      includeFullSnapshot: true,
      maxSnapshotChars: 30_000,
    });
    setIssueMarkdown(markdown);
    setNotice("Issue 템플릿을 생성했습니다.");
  }

  async function handleCopyIssueTemplate() {
    if (!issueMarkdown) return;
    const copied = await copyToClipboard(issueMarkdown);
    if (copied.ok) {
      setNotice("Issue 템플릿을 복사했습니다.");
      return;
    }
    setNotice(copied.message ?? "Issue 템플릿 복사에 실패했습니다.");
  }

  function handleDownloadIssueTemplate() {
    if (!issueMarkdown || !item) return;
    downloadText(`issue_${item.id}.md`, issueMarkdown, "text/markdown;charset=utf-8");
    setNotice("Issue 템플릿 다운로드를 시작했습니다.");
  }

  async function handleSave() {
    if (!item) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/feedback/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          priority,
          dueDate: normalizeDateInput(dueDate),
          tags: parseTagsInput(tagsInput),
          note: note.trim(),
          tasks,
        }),
      });
      const payload = (await response.json().catch(() => null)) as FeedbackPatchPayload | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error?.message ?? "저장에 실패했습니다.");
        return;
      }
      if (payload.data) {
        setItem(payload.data);
        setStatus(payload.data.status);
        setPriority(payload.data.priority);
        setDueDate(payload.data.dueDate ?? "");
        setTagsInput(toTagsInput(payload.data.tags));
        setNote(payload.data.note ?? "");
        setTasks(Array.isArray(payload.data.tasks) ? payload.data.tasks : []);
      }
      setNotice("저장되었습니다.");
    } catch {
      setError("네트워크 오류로 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function requestChainPlan(chainId: string, csrf: string): Promise<ChainPlan> {
    const response = await fetch("/api/dev/doctor/fix/chain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId, csrf, dryRun: true }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      dryRun?: boolean;
      chain?: {
        risk?: unknown;
        steps?: unknown;
        impact?: unknown;
      };
      error?: { message?: string };
    } | null;
    if (!response.ok || !payload?.ok || payload.dryRun !== true || !payload.chain) {
      throw new Error(payload?.error?.message ?? "복구 계획 조회에 실패했습니다.");
    }
    const risk = payload.chain.risk === "LOW" || payload.chain.risk === "MEDIUM" || payload.chain.risk === "HIGH"
      ? payload.chain.risk
      : "MEDIUM";
    const steps = Array.isArray(payload.chain.steps)
      ? payload.chain.steps.filter((step): step is string => typeof step === "string" && step.trim().length > 0)
      : [];
    const impact = Array.isArray(payload.chain.impact)
      ? payload.chain.impact.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
      : [];
    return { risk, steps, impact };
  }

  async function handleOpsPlan() {
    if (!item || !opsAction) return;
    if (!isDevEnv) return;
    const csrf = readDevCsrf();
    if (!csrf) {
      setOpsMessage("Dev unlock/CSRF 확인이 필요합니다.");
      return;
    }

    if (opsAction.kind === "FIX") {
      const suggested = opsAction.suggestedFixIds && opsAction.suggestedFixIds.length > 0
        ? ` (추천: ${opsAction.suggestedFixIds.join(", ")})`
        : "";
      setOpsPlan(null);
      setOpsMessage(`단일 Fix 실행 대상: ${opsAction.id}${suggested}`);
      return;
    }

    setOpsPlanLoading(true);
    setOpsMessage("");
    try {
      const plan = await requestChainPlan(opsAction.id, csrf);
      setOpsPlan(plan);
      setOpsMessage(`체인 계획 확인 완료 (risk=${plan.risk}, steps=${plan.steps.length})`);
    } catch (error) {
      setOpsMessage(error instanceof Error ? error.message : "복구 계획 조회 중 오류가 발생했습니다.");
    } finally {
      setOpsPlanLoading(false);
    }
  }

  async function handleOpsExecute() {
    if (!item || !opsAction) return;
    if (!isDevEnv) return;
    const csrf = readDevCsrf();
    if (!csrf) {
      setOpsMessage("Dev unlock/CSRF 확인이 필요합니다.");
      return;
    }

    setOpsRunning(true);
    setOpsMessage("");
    try {
      if (opsAction.kind === "FIX") {
        const response = await fetch("/api/dev/doctor/fix", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fixId: opsAction.id, csrf }),
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          tookMs?: number;
          historyId?: string;
          error?: { message?: string };
        } | null;
        const success = response.ok && payload?.ok === true;
        setOpsMessage(
          success
            ? `Fix 실행 완료 (${Number(payload?.tookMs ?? 0)}ms, id=${String(payload?.historyId ?? "-")})`
            : (payload?.error?.message ?? "Fix 실행에 실패했습니다."),
        );
        return;
      }

      const plan = await requestChainPlan(opsAction.id, csrf);
      setOpsPlan(plan);
      let confirmText = "";
      if (plan.risk === "HIGH") {
        const expected = `RUN ${opsAction.id}`;
        const typed = window.prompt(`HIGH 위험 체인입니다. 다음 문구를 정확히 입력하세요:\n${expected}`, expected);
        if ((typed ?? "").trim() !== expected) {
          setOpsMessage(`확인 문구 불일치로 실행이 중단되었습니다. (${expected})`);
          return;
        }
        confirmText = expected;
      }
      const response = await fetch("/api/dev/doctor/fix/chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chainId: opsAction.id, csrf, dryRun: false, confirmText }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        historyId?: string;
        steps?: unknown[];
        error?: { message?: string };
      } | null;
      const success = response.ok && payload?.ok === true;
      const stepCount = Array.isArray(payload?.steps) ? payload.steps.length : 0;
      setOpsMessage(
        success
          ? `체인 실행 완료 (steps=${stepCount}, id=${String(payload?.historyId ?? "-")})`
          : (payload?.error?.message ?? "체인 실행에 실패했습니다."),
      );
    } catch (error) {
      setOpsMessage(error instanceof Error ? error.message : "복구 실행 중 오류가 발생했습니다.");
    } finally {
      setOpsRunning(false);
    }
  }

  function handleAddTask() {
    const text = taskInput.trim().replace(/\s+/g, " ");
    if (text.length < 1 || text.length > 120) {
      setError("체크리스트 항목은 1~120자로 입력해 주세요.");
      return;
    }
    if (tasks.length >= 20) {
      setError("체크리스트는 최대 20개까지 추가할 수 있습니다.");
      return;
    }
    setError(null);
    setTasks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID().slice(0, 16),
        text,
        done: false,
      },
    ]);
    setTaskInput("");
  }

  function handleToggleTask(idValue: string) {
    setTasks((prev) =>
      prev.map((task) => (task.id === idValue ? { ...task, done: !task.done } : task)),
    );
  }

  function handleRemoveTask(idValue: string) {
    setTasks((prev) => prev.filter((task) => task.id !== idValue));
  }

  return (
    <PageShell>
      <PageHeader
        title="피드백 상세"
        description="제출 메시지와 첨부된 진단 스냅샷을 확인합니다."
        action={
          <div className="flex items-center gap-2">
            <Link href="/feedback/list">
              <Button size="sm" variant="outline">목록</Button>
            </Link>
            <Link href="/feedback">
              <Button size="sm" variant="ghost">작성</Button>
            </Link>
          </div>
        }
      />

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">상세 로딩 중...</p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : !item ? (
          <p className="text-sm text-slate-500">표시할 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{categoryLabel(item.category)}</span>
              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700">{item.status}</span>
              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700">{item.priority}</span>
              <span>{formatDateTime(item.createdAt)}</span>
              <span>id: {item.id}</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">{item.message}</p>
            </div>

            {opsAction ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-black text-rose-800">운영 이슈(OPS) 복구</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {isDevEnv ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => { void handleOpsPlan(); }} disabled={opsPlanLoading || opsRunning}>
                        {opsPlanLoading ? "계획 조회 중..." : "복구 계획 보기"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { void handleOpsExecute(); }} disabled={opsRunning}>
                        {opsRunning ? "복구 실행 중..." : "복구 실행"}
                      </Button>
                    </>
                  ) : (
                    <p className="text-[11px] text-slate-600">복구 버튼은 dev 환경에서만 표시됩니다.</p>
                  )}
                </div>
                {opsPlan ? (
                  <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskBadgeClass(opsPlan.risk)}`}>
                      {opsPlan.risk}
                    </span>
                    <p className="mt-1 text-[11px] text-slate-700">steps: {opsPlan.steps.join(" -> ")}</p>
                  </div>
                ) : null}
                {opsMessage ? (
                  <p className="mt-2 text-[11px] font-semibold text-slate-700">{opsMessage}</p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-2 text-xs text-slate-600">
              <p><span className="font-semibold text-slate-700">URL:</span> {item.url ?? "-"}</p>
              <p><span className="font-semibold text-slate-700">UserAgent:</span> {item.userAgent ?? "-"}</p>
              <p><span className="font-semibold text-slate-700">AppVersion:</span> {item.appVersion ?? "-"}</p>
              <p><span className="font-semibold text-slate-700">TraceId:</span> {item.traceId ?? "-"}</p>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs text-slate-600">
                  <span className="mb-1 block font-semibold text-slate-700">상태</span>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as FeedbackStatus)}
                    className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
                    disabled={saving}
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="DOING">DOING</option>
                    <option value="DONE">DONE</option>
                  </select>
                </label>
                <label className="block text-xs text-slate-600">
                  <span className="mb-1 block font-semibold text-slate-700">우선순위</span>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as FeedbackPriority)}
                    className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
                    disabled={saving}
                  >
                    <option value="P0">P0</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                    <option value="P3">P3</option>
                  </select>
                </label>
                <label className="block text-xs text-slate-600">
                  <span className="mb-1 block font-semibold text-slate-700">마감일</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
                    disabled={saving}
                  />
                </label>
                <label className="block text-xs text-slate-600">
                  <span className="mb-1 block font-semibold text-slate-700">태그 (콤마 구분)</span>
                  <input
                    value={tagsInput}
                    onChange={(event) => setTagsInput(event.target.value)}
                    className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
                    placeholder="ux,api,error"
                    disabled={saving}
                  />
                </label>
              </div>
              <label className="block text-xs text-slate-600">
                <span className="mb-1 block font-semibold text-slate-700">메모</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-slate-300 p-3 text-sm"
                  disabled={saving}
                />
              </label>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">체크리스트</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={taskInput}
                    onChange={(event) => setTaskInput(event.target.value)}
                    className="h-9 flex-1 rounded-md border border-slate-300 px-3 text-sm"
                    placeholder="할 일을 입력하세요"
                    disabled={saving}
                  />
                  <Button size="sm" variant="outline" onClick={handleAddTask} disabled={saving}>
                    추가
                  </Button>
                </div>
                {tasks.length === 0 ? (
                  <p className="text-xs text-slate-500">등록된 항목이 없습니다.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {tasks.map((task) => (
                      <li key={task.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={() => handleToggleTask(task.id)}
                          disabled={saving}
                        />
                        <span className={`flex-1 text-xs ${task.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{task.text}</span>
                        <button
                          type="button"
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                          onClick={() => handleRemoveTask(task.id)}
                          disabled={saving}
                        >
                          삭제
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="primary" onClick={() => { void handleSave(); }} disabled={saving}>
                  {saving ? "저장 중..." : "저장"}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => { void handleCopy(); }}>
                복사
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownload}>
                다운로드
              </Button>
              <Button size="sm" variant="outline" onClick={handleGenerateIssueTemplate}>
                Issue 템플릿 생성
              </Button>
              {notice ? <p className="text-xs text-slate-500">{notice}</p> : null}
            </div>

            {issueMarkdown ? (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700" htmlFor="issue_markdown">
                  Issue Markdown
                </label>
                <textarea
                  id="issue_markdown"
                  value={issueMarkdown}
                  onChange={(event) => setIssueMarkdown(event.target.value)}
                  rows={12}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs leading-5 text-slate-800"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => { void handleCopyIssueTemplate(); }}>
                    템플릿 복사
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDownloadIssueTemplate}>
                    템플릿 다운로드
                  </Button>
                </div>
              </div>
            ) : null}

            <details className="rounded-xl border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                진단 스냅샷 {item.snapshot ? "보기" : "(없음)"}
              </summary>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">
                {item.snapshot ? snapshotPretty : "첨부된 진단 스냅샷이 없습니다."}
              </pre>
            </details>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
