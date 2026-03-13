"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DevUnlockShortcutMessage } from "@/components/DevUnlockShortcutLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { downloadText } from "@/lib/browser/download";

const DEV_UNLOCKED_SESSION_KEY = "dev_action_unlocked_v1";
const DEV_CSRF_SESSION_KEY = "dev_action_csrf_v1";

type RuleAction =
  | "EVAL_ALL"
  | "EVAL_LABELED"
  | "SUGGEST"
  | "PATCH_MAKE"
  | "PATCH_DRY"
  | "PATCH_APPLY"
  | "GATE";

type UnlockState = {
  loading: boolean;
  unlocked: boolean;
  csrf: string | null;
  error: string | null;
};

type RulesRunPayload = {
  ok?: boolean;
  tookMs?: number;
  stdoutTail?: string;
  stderrTail?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

type ArtifactPayload = {
  ok?: boolean;
  data?: {
    content?: string;
  } | null;
  error?: {
    message?: string;
  };
};

type DispatchPayload = {
  ok?: boolean;
  runUrl?: string | null;
  pollUrl?: string | null;
  workflow?: string;
  ref?: string;
  since?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

type RunsLatestPayload = {
  ok?: boolean;
  runUrl?: string | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type PrLatestPayload = {
  ok?: boolean;
  prUrl?: string | null;
  number?: number | null;
  title?: string | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type PrChecksPayload = {
  ok?: boolean;
  state?: "RUNNING" | "PASSED" | "FAILED";
  total?: number;
  completed?: number;
  failed?: number;
  detailsUrl?: string | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type RunResult = {
  action: RuleAction;
  ok: boolean;
  tookMs: number;
  stdoutTail: string;
  stderrTail: string;
  errorCode: string;
  errorMessage: string;
};

const ACTIONS: Array<{ action: RuleAction; label: string; description: string }> = [
  { action: "EVAL_ALL", label: "Eval All", description: "코퍼스 수집 + 룰 평가를 실행합니다." },
  { action: "EVAL_LABELED", label: "Eval Labeled", description: "라벨 샘플 기준 정확도 평가를 실행합니다." },
  { action: "SUGGEST", label: "Suggest", description: "오분류 기반 토큰 추천을 생성합니다." },
  { action: "PATCH_MAKE", label: "Patch Make", description: "suggestions 기반 rules_patch.json을 생성합니다." },
  { action: "PATCH_DRY", label: "Patch Dry", description: "룰 적용 없이 diff 리포트만 생성합니다." },
  { action: "PATCH_APPLY", label: "Patch Apply (+Gate)", description: "백업 후 패치 적용 + 게이트를 실행합니다." },
  { action: "GATE", label: "Gate", description: "품질 게이트를 실행합니다." },
];

function toTail(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function toErrorMessage(payload: RulesRunPayload | null, fallback: string): string {
  const fromPayload = typeof payload?.error?.message === "string" ? payload.error.message.trim() : "";
  return fromPayload || fallback;
}

export function RulesOpsClient() {
  const [unlockToken, setUnlockToken] = useState("");
  const [unlock, setUnlock] = useState<UnlockState>({
    loading: false,
    unlocked: false,
    csrf: null,
    error: null,
  });
  const [runningAction, setRunningAction] = useState<RuleAction | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [prRunning, setPrRunning] = useState(false);
  const [prResult, setPrResult] = useState<{
    ok: boolean;
    tookMs: number;
    stdoutTail: string;
    stderrTail: string;
    errorCode: string;
    errorMessage: string;
  } | null>(null);
  const [dispatchRunning, setDispatchRunning] = useState(false);
  const [dispatchRef, setDispatchRef] = useState("main");
  const [dispatchMessage, setDispatchMessage] = useState("");
  const [dispatchRunUrl, setDispatchRunUrl] = useState("");
  const [dispatchPrUrl, setDispatchPrUrl] = useState("");
  const [dispatchPrTitle, setDispatchPrTitle] = useState("");
  const [dispatchPrNumber, setDispatchPrNumber] = useState<number | null>(null);
  const [prChecksState, setPrChecksState] = useState<"RUNNING" | "PASSED" | "FAILED" | null>(null);
  const [prChecksTotal, setPrChecksTotal] = useState(0);
  const [prChecksCompleted, setPrChecksCompleted] = useState(0);
  const [prChecksFailed, setPrChecksFailed] = useState(0);
  const [prChecksDetailsUrl, setPrChecksDetailsUrl] = useState("");
  const checksPollSeqRef = useRef(0);

  async function pollWorkflowRunUrl(pollUrl: string): Promise<string | null> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const response = await fetch(pollUrl, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as RunsLatestPayload | null;
      if (!response.ok || !payload?.ok) {
        continue;
      }
      if (typeof payload.runUrl === "string" && payload.runUrl.trim()) {
        return payload.runUrl.trim();
      }
    }
    return null;
  }

  async function pollLatestPrUrl(
    csrf: string,
    head = "bot/rules-tune",
  ): Promise<{ url: string; title: string; number: number | null } | null> {
    const endpoint = `/api/dev/github/pr/latest?head=${encodeURIComponent(head)}&csrf=${encodeURIComponent(csrf)}`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as PrLatestPayload | null;
      if (!response.ok || !payload?.ok) {
        continue;
      }
      const prUrl = typeof payload.prUrl === "string" ? payload.prUrl.trim() : "";
      if (!prUrl) continue;
      const number =
        typeof payload.number === "number" && Number.isFinite(payload.number) && payload.number > 0
          ? Math.trunc(payload.number)
          : null;
      return {
        url: prUrl,
        title: typeof payload.title === "string" ? payload.title.trim() : "",
        number,
      };
    }
    return null;
  }

  async function pollPrChecks(csrf: string, prNumber: number, pollSeq: number): Promise<void> {
    const endpoint = `/api/dev/github/pr/checks?number=${encodeURIComponent(String(prNumber))}&csrf=${encodeURIComponent(csrf)}`;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (checksPollSeqRef.current !== pollSeq) {
        return;
      }

      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as PrChecksPayload | null;
        if (response.ok && payload?.ok && payload.state) {
          if (checksPollSeqRef.current !== pollSeq) {
            return;
          }
          setPrChecksState(payload.state);
          setPrChecksTotal(typeof payload.total === "number" ? payload.total : 0);
          setPrChecksCompleted(typeof payload.completed === "number" ? payload.completed : 0);
          setPrChecksFailed(typeof payload.failed === "number" ? payload.failed : 0);
          setPrChecksDetailsUrl(typeof payload.detailsUrl === "string" ? payload.detailsUrl.trim() : "");
          if (payload.state === "PASSED" || payload.state === "FAILED") {
            return;
          }
        }
      } catch {
        // Keep polling; dispatch can succeed before checks endpoint becomes available.
      }

      if (attempt < 59) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  useEffect(() => {
    const unlocked = window.sessionStorage.getItem(DEV_UNLOCKED_SESSION_KEY) === "1";
    const csrf = window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY);
    if (unlocked && csrf) {
      setUnlock((prev) => ({ ...prev, unlocked: true, csrf }));
    }
  }, []);

  const canRun = useMemo(
    () => unlock.unlocked && Boolean(unlock.csrf) && !runningAction && !prRunning && !dispatchRunning,
    [dispatchRunning, prRunning, runningAction, unlock.csrf, unlock.unlocked],
  );

  async function handleUnlock() {
    const token = unlockToken.trim();
    if (!token) return;

    setUnlock((prev) => ({ ...prev, loading: true, error: null }));
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/dev/unlock", {
        method: "POST",
        headers: { "x-dev-token": token },
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; csrf?: string; error?: { message?: string } } | null;
      if (response.ok && payload?.ok && payload.csrf) {
        window.sessionStorage.setItem(DEV_UNLOCKED_SESSION_KEY, "1");
        window.sessionStorage.setItem(DEV_CSRF_SESSION_KEY, payload.csrf);
        setUnlock({
          loading: false,
          unlocked: true,
          csrf: payload.csrf,
          error: null,
        });
        setNotice("Dev 잠금 해제가 완료되었습니다.");
        return;
      }
      setUnlock((prev) => ({
        ...prev,
        loading: false,
        error: payload?.error?.message ?? "잠금 해제에 실패했습니다.",
      }));
    } catch {
      setUnlock((prev) => ({
        ...prev,
        loading: false,
        error: "잠금 해제 요청 중 오류가 발생했습니다.",
      }));
    }
  }

  async function runAction(action: RuleAction) {
    const csrf = unlock.csrf || window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY);
    if (!csrf) {
      setError("실행 전 Dev unlock/CSRF 확인이 필요합니다.");
      return;
    }

    setNotice("");
    setError("");
    setDispatchMessage("");
    setResult(null);
    setRunningAction(action);
    try {
      const response = await fetch("/api/dev/dart/rules/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, csrf }),
      });
      const payload = (await response.json().catch(() => null)) as RulesRunPayload | null;
      const ok = Boolean(response.ok && payload?.ok);
      const nextResult: RunResult = {
        action,
        ok,
        tookMs: typeof payload?.tookMs === "number" ? payload.tookMs : 0,
        stdoutTail: toTail(payload?.stdoutTail),
        stderrTail: toTail(payload?.stderrTail),
        errorCode: typeof payload?.error?.code === "string" ? payload.error.code : "",
        errorMessage: typeof payload?.error?.message === "string" ? payload.error.message : "",
      };
      setResult(nextResult);

      if (!ok) {
        setError(toErrorMessage(payload, `${action} 실행에 실패했습니다.`));
        return;
      }
      setNotice(`${action} 실행이 완료되었습니다.`);
    } catch {
      setError(`${action} 실행 중 오류가 발생했습니다.`);
    } finally {
      setRunningAction(null);
    }
  }

  async function handlePreparePr() {
    const csrf = unlock.csrf || window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY);
    if (!csrf) {
      setError("실행 전 Dev unlock/CSRF 확인이 필요합니다.");
      return;
    }

    setNotice("");
    setError("");
    setDispatchMessage("");
    setPrResult(null);
    setPrRunning(true);
    try {
      const response = await fetch("/api/dev/git/prepare-pr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "both",
          includeTmpPatch: 1,
          csrf,
        }),
      });
      const payload = (await response.json().catch(() => null)) as RulesRunPayload | null;
      const ok = Boolean(response.ok && payload?.ok);
      setPrResult({
        ok,
        tookMs: typeof payload?.tookMs === "number" ? payload.tookMs : 0,
        stdoutTail: toTail(payload?.stdoutTail),
        stderrTail: toTail(payload?.stderrTail),
        errorCode: typeof payload?.error?.code === "string" ? payload.error.code : "",
        errorMessage: typeof payload?.error?.message === "string" ? payload.error.message : "",
      });
      if (!ok) {
        setError(toErrorMessage(payload, "PR 준비 실행에 실패했습니다."));
        return;
      }
      setNotice("PR 준비(브랜치+커밋+patch)가 완료되었습니다.");
    } catch {
      setError("PR 준비 실행 중 오류가 발생했습니다.");
    } finally {
      setPrRunning(false);
    }
  }

  async function handleDownloadPrPatch() {
    setError("");
    setDispatchMessage("");
    try {
      const response = await fetch("/api/dev/artifacts?name=rules_pr_patch", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ArtifactPayload | null;
      if (!response.ok || !payload?.ok || typeof payload.data?.content !== "string") {
        throw new Error(payload?.error?.message ?? "rules_pr_patch를 불러오지 못했습니다.");
      }
      downloadText("rules_pr.patch", payload.data.content, "text/plain;charset=utf-8");
      setNotice("rules_pr.patch 다운로드를 시작했습니다.");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "patch 다운로드에 실패했습니다.");
    }
  }

  async function handleDispatchWorkflow() {
    const csrf = unlock.csrf || window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY);
    if (!csrf) {
      setError("실행 전 Dev unlock/CSRF 확인이 필요합니다.");
      return;
    }
    const ref = dispatchRef.trim();
    if (!ref) {
      setError("dispatch ref를 입력해 주세요. (예: main)");
      return;
    }

    setNotice("");
    setError("");
    setDispatchMessage("");
    setDispatchRunUrl("");
    setDispatchPrUrl("");
    setDispatchPrTitle("");
    setDispatchPrNumber(null);
    setPrChecksState(null);
    setPrChecksTotal(0);
    setPrChecksCompleted(0);
    setPrChecksFailed(0);
    setPrChecksDetailsUrl("");
    checksPollSeqRef.current += 1;
    const pollSeq = checksPollSeqRef.current;
    setDispatchRunning(true);
    try {
      const response = await fetch("/api/dev/github/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workflow: "rules-tune-pr.yml",
          ref,
          csrf,
        }),
      });
      const payload = (await response.json().catch(() => null)) as DispatchPayload | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message ?? "workflow_dispatch 호출에 실패했습니다.");
      }
      setNotice(`PR 자동 생성 Workflow 실행을 요청했습니다. (ref: ${ref})`);
      setDispatchMessage("Workflow dispatch 성공. Actions/PR 링크를 찾는 중입니다...");

      const csrfToken = csrf;
      void (async () => {
        const runUrlFromPayload = typeof payload.runUrl === "string" ? payload.runUrl.trim() : "";
        let resolvedRunUrl = runUrlFromPayload;
        if (!resolvedRunUrl) {
          const pollUrl = typeof payload.pollUrl === "string" ? payload.pollUrl.trim() : "";
          if (pollUrl) {
            const polledRunUrl = await pollWorkflowRunUrl(pollUrl);
            if (polledRunUrl) {
              resolvedRunUrl = polledRunUrl;
            }
          }
        }
        if (resolvedRunUrl) {
          setDispatchRunUrl(resolvedRunUrl);
        }

        const pr = await pollLatestPrUrl(csrfToken, "bot/rules-tune");
        if (pr?.url) {
          if (checksPollSeqRef.current !== pollSeq) return;
          setDispatchPrUrl(pr.url);
          setDispatchPrTitle(pr.title);
          setDispatchPrNumber(pr.number);
          if (typeof pr.number === "number" && pr.number > 0) {
            setPrChecksState("RUNNING");
            await pollPrChecks(csrfToken, pr.number, pollSeq);
          }
        }

        if (resolvedRunUrl && pr?.url) {
          setDispatchMessage("Actions Run 링크와 PR 링크를 찾았습니다.");
          return;
        }
        if (resolvedRunUrl) {
          setDispatchMessage("Actions Run 링크를 찾았습니다. PR 링크는 아직 확인되지 않았습니다.");
          return;
        }
        if (pr?.url) {
          setDispatchMessage("PR 링크를 찾았습니다. Actions Run 링크는 아직 확인되지 않았습니다.");
          return;
        }
        setDispatchMessage("Workflow는 실행되었지만 링크를 아직 찾지 못했습니다. 잠시 후 다시 시도해 주세요.");
      })();
    } catch (dispatchError) {
      setError(dispatchError instanceof Error ? dispatchError.message : "Workflow dispatch 요청 중 오류가 발생했습니다.");
    } finally {
      setDispatchRunning(false);
    }
  }

  const prSummary = useMemo(() => {
    const stdout = prResult?.stdoutTail ?? "";
    const branch = stdout.match(/\[rules:pr:prepare\]\s+branch=([^\n]+)/)?.[1]?.trim() ?? "";
    const commit = stdout.match(/\[rules:pr:prepare\]\s+commit=([^\n]+)/)?.[1]?.trim() ?? "";
    const next = stdout.match(/\[rules:pr:prepare\]\s+next=([^\n]+)/)?.[1]?.trim() ?? "";
    return { branch, commit, next };
  }, [prResult?.stdoutTail]);

  return (
    <PageShell>
      <PageHeader
        title="DART Rules Ops"
        description="룰 평가/제안/패치/게이트를 Dev 환경에서 안전하게 실행합니다."
        action={(
          <div className="flex items-center gap-2">
            <Link href="/dashboard/artifacts">
              <Button type="button" variant="outline" size="sm">Artifacts 보기</Button>
            </Link>
            <Link href="/ops">
              <Button type="button" variant="outline" size="sm">Ops Hub</Button>
            </Link>
            <Link href="/ops/auto-merge">
              <Button type="button" variant="outline" size="sm">Auto Merge</Button>
            </Link>
          </div>
        )}
      />

      <Card>
        <h2 className="text-base font-black text-slate-900">Dev Unlock</h2>
        <p className="mt-2 text-sm text-slate-600">실행(POST) 전에 unlock이 필요합니다.</p>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none ring-emerald-200 transition focus:border-emerald-400 focus:ring"
            type="password"
            placeholder="DEV_TOKEN"
            value={unlockToken}
            onChange={(event) => setUnlockToken(event.target.value)}
          />
          <Button type="button" variant="outline" size="md" onClick={handleUnlock} disabled={unlock.loading}>
            {unlock.loading ? "해제 중..." : unlock.unlocked ? "해제됨" : "잠금 해제"}
          </Button>
        </div>
        {unlock.error ? <p className="mt-2 text-sm font-semibold text-rose-600">{unlock.error}</p> : null}
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-black text-slate-900">Actions</h2>
        <p className="mt-2 text-sm text-slate-600">허용된 action만 서버에서 실행됩니다.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {ACTIONS.map((row) => (
            <div key={row.action} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { void runAction(row.action); }}
                  disabled={!canRun}
                >
                  {runningAction === row.action ? "실행 중..." : "실행"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-600">{row.description}</p>
            </div>
          ))}
        </div>

        {error ? (
          <DevUnlockShortcutMessage
            className="mt-4 text-sm font-semibold text-rose-600"
            linkClassName="text-rose-600"
            message={error}
          />
        ) : null}
        {notice ? <p className="mt-4 text-sm font-semibold text-emerald-700">{notice}</p> : null}
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-black text-slate-900">Result</h2>
        {!result ? (
          <p className="mt-3 text-sm text-slate-500">아직 실행 결과가 없습니다.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-700">
              action: <span className="font-semibold">{result.action}</span>
              {" / "}
              ok: <span className={`font-semibold ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.ok ? "true" : "false"}</span>
              {" / "}
              tookMs: <span className="font-semibold">{result.tookMs}</span>
            </p>
            {!result.ok ? (
              <p className="text-sm text-rose-600">
                {result.errorCode || "ERROR"}: {result.errorMessage || "-"}
              </p>
            ) : null}
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">stdoutTail</p>
                <pre className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-3 text-xs leading-5 text-slate-100">
                  {result.stdoutTail || "(empty)"}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">stderrTail</p>
                <pre className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-3 text-xs leading-5 text-slate-100">
                  {result.stderrTail || "(empty)"}
                </pre>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-black text-slate-900">PR 준비</h2>
        <p className="mt-2 text-sm text-slate-600">룰/라벨 변경을 브랜치+커밋+patch까지 준비합니다. (push/PR 생성은 미포함)</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => { void handlePreparePr(); }} disabled={!canRun}>
            {prRunning ? "준비 중..." : "PR 준비(브랜치+커밋)"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { void handleDownloadPrPatch(); }}>
            patch 다운로드
          </Button>
        </div>

        {!prResult ? (
          <p className="mt-3 text-sm text-slate-500">아직 PR 준비 결과가 없습니다.</p>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-slate-700">
              ok: <span className={`font-semibold ${prResult.ok ? "text-emerald-700" : "text-rose-700"}`}>{prResult.ok ? "true" : "false"}</span>
              {" / "}
              tookMs: <span className="font-semibold">{prResult.tookMs}</span>
            </p>
            {prSummary.branch ? <p className="text-slate-700">branch: <span className="font-semibold">{prSummary.branch}</span></p> : null}
            {prSummary.commit ? <p className="text-slate-700">commit: <span className="font-semibold">{prSummary.commit}</span></p> : null}
            {prSummary.next ? <p className="text-slate-700">next: <code>{prSummary.next}</code></p> : null}
            {!prResult.ok ? (
              <p className="text-rose-600">
                {prResult.errorCode || "ERROR"}: {prResult.errorMessage || "-"}
              </p>
            ) : null}
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">stdoutTail</p>
                <pre className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-3 text-xs leading-5 text-slate-100">
                  {prResult.stdoutTail || "(empty)"}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">stderrTail</p>
                <pre className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-3 text-xs leading-5 text-slate-100">
                  {prResult.stderrTail || "(empty)"}
                </pre>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-black text-slate-900">GitHub PR 자동 생성</h2>
        <p className="mt-2 text-sm text-slate-600">`workflow_dispatch`로 rules-tune-pr workflow를 실행합니다. (Dev 전용)</p>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[220px] flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">Dispatch ref</span>
            <input
              type="text"
              value={dispatchRef}
              onChange={(event) => setDispatchRef(event.target.value)}
              placeholder="main"
              className="h-9 rounded-xl border border-slate-300 px-3 text-sm text-slate-900"
              disabled={dispatchRunning}
            />
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => { void handleDispatchWorkflow(); }} disabled={!canRun}>
            {dispatchRunning ? "요청 중..." : "PR 자동 생성(Workflow 실행)"}
          </Button>
        </div>
        {dispatchMessage ? <p className="mt-3 text-sm font-semibold text-emerald-700">{dispatchMessage}</p> : null}
        {dispatchRunUrl ? (
          <p className="mt-3 text-sm">
            <a href={dispatchRunUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline">
              Actions Run 링크 열기
            </a>
          </p>
        ) : null}
        {dispatchPrUrl ? (
          <p className="mt-2 text-sm">
            <a href={dispatchPrUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline">
              PR 열기{dispatchPrTitle ? `: ${dispatchPrTitle}` : ""}
            </a>
          </p>
        ) : null}
        {dispatchPrNumber ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">CI 체크:</span>
            {prChecksState ? (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                  prChecksState === "PASSED"
                    ? "bg-emerald-100 text-emerald-700"
                    : prChecksState === "FAILED"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-800"
                }`}
              >
                {prChecksState}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                조회 중...
              </span>
            )}
            <span className="text-xs text-slate-600">
              ({prChecksCompleted}/{prChecksTotal}, failed {prChecksFailed})
            </span>
            {prChecksDetailsUrl ? (
              <a href={prChecksDetailsUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline">
                checks 링크
              </a>
            ) : null}
          </div>
        ) : null}
      </Card>
    </PageShell>
  );
}
