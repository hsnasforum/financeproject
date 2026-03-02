"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";

type GitAction = "status" | "pull" | "push";

type GitCommandResult = {
  ok: boolean;
  action: GitAction;
  command: string;
  code: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  ranAt: string;
  durationMs: number;
};

function actionLabel(action: GitAction): string {
  if (action === "status") return "상태 조회";
  if (action === "pull") return "git pull";
  return "git push";
}

export function DevGitAdminClient() {
  const [loadingAction, setLoadingAction] = useState<GitAction | null>(null);
  const [result, setResult] = useState<GitCommandResult | null>(null);
  const [error, setError] = useState("");

  const execute = useCallback(async (action: GitAction) => {
    setLoadingAction(action);
    setError("");
    try {
      const res = await fetch("/api/dev/git", {
        method: action === "status" ? "GET" : "POST",
        headers: { "content-type": "application/json" },
        body: action === "status" ? undefined : JSON.stringify({ action }),
      });
      const json = await res.json() as GitCommandResult | { error?: { message?: string } };
      if (!res.ok) {
        setResult(null);
        setError(json && typeof json === "object" && "error" in json ? (json.error?.message ?? "Git 명령 실행에 실패했습니다.") : "Git 명령 실행에 실패했습니다.");
        return;
      }
      setResult(json as GitCommandResult);
    } catch {
      setResult(null);
      setError("요청 중 오류가 발생했습니다.");
    } finally {
      setLoadingAction(null);
    }
  }, []);

  useEffect(() => {
    void execute("status");
  }, [execute]);

  const ranAtLabel = useMemo(() => {
    if (!result?.ranAt) return "-";
    return new Date(result.ranAt).toLocaleString("ko-KR");
  }, [result?.ranAt]);

  return (
    <main className="py-8">
      <Container>
        <SectionHeader title="Git 관리자 (Dev)" subtitle="브라우저에서 현재 레포의 pull/push/status를 실행합니다." />
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void execute("status")} disabled={loadingAction !== null}>
                {loadingAction === "status" ? "조회 중..." : "상태 조회"}
              </Button>
              <Button variant="outline" onClick={() => void execute("pull")} disabled={loadingAction !== null}>
                {loadingAction === "pull" ? "pull 실행 중..." : "git pull"}
              </Button>
              <Button variant="outline" onClick={() => void execute("push")} disabled={loadingAction !== null}>
                {loadingAction === "push" ? "push 실행 중..." : "git push"}
              </Button>
            </div>
            <p className="mt-3 text-xs text-slate-500">주의: 인증이 필요한 원격 push/pull은 실패할 수 있습니다. (`GIT_TERMINAL_PROMPT=0`으로 실행)</p>
            {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
          </Card>

          <Card>
            <h3 className="text-base font-semibold">최근 실행 결과</h3>
            {!result ? (
              <p className="mt-2 text-sm text-slate-500">실행 결과가 없습니다.</p>
            ) : (
              <div className="mt-2 space-y-2 text-sm">
                <p>명령: <code>{result.command}</code></p>
                <p>작업: {actionLabel(result.action)} / 성공: {String(result.ok)} / 종료코드: {result.code ?? "-"}</p>
                <p>실행시각: {ranAtLabel} / 소요시간: {result.durationMs}ms / timeout: {String(result.timedOut)}</p>

                <div>
                  <p className="font-medium text-slate-800">stdout</p>
                  <pre className="mt-1 max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{result.stdout || "(empty)"}</pre>
                </div>
                <div>
                  <p className="font-medium text-slate-800">stderr</p>
                  <pre className="mt-1 max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{result.stderr || "(empty)"}</pre>
                </div>
              </div>
            )}
          </Card>
        </div>
      </Container>
    </main>
  );
}

