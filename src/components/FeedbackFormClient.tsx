"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
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

const CATEGORY_OPTIONS: Array<{ value: FeedbackCategory; label: string }> = [
  { value: "bug", label: "버그" },
  { value: "improve", label: "개선 제안" },
  { value: "question", label: "질문" },
];

export function FeedbackFormClient() {
  const [category, setCategory] = useState<FeedbackCategory>("improve");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const messageLength = useMemo(() => message.trim().length, [message]);

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
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          message: normalized,
        }),
      });
      const payload = (await response.json().catch(() => null)) as SubmitPayload | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error?.message ?? "피드백 저장 중 오류가 발생했습니다.");
        return;
      }
      setMessage("");
      setNotice("의견이 접수되었습니다. 운영 기록과 첨부 진단 정보는 로컬 운영자만 확인할 수 있습니다.");
    } catch {
      setError("네트워크 오류로 저장하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="의견과 도움 요청 남기기"
        description="문제 상황이나 개선 아이디어를 안전하게 접수합니다. 운영 기록은 로컬 운영 환경에서만 확인할 수 있습니다."
        action={
          <ButtonLink href="/dashboard" variant="outline" size="sm">대시보드로 이동</ButtonLink>
        }
      />

      <Card className="rounded-[2rem] p-8 shadow-sm">
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="rounded-[1.5rem] border border-slate-100 bg-surface-muted/70 p-5">
            <p className="text-sm font-black text-slate-800">무엇을 남기나요?</p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
              이 화면은 즉시 답변을 받는 곳이 아니라, 문제 상황과 개선 아이디어를 운영자에게 전달하는 support entry 화면입니다.
            </p>
            <p className="mt-3 text-xs font-bold leading-relaxed text-slate-500">
              제출 응답에는 운영 메모나 첨부 진단 정보가 포함되지 않습니다. 오류 재현에 필요한 기본 진단 정보는 서버에서 함께 기록됩니다.
            </p>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700 tracking-tight">카테고리</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none"
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
              className="w-full rounded-[2rem] border border-slate-200 bg-white p-5 text-sm font-medium leading-relaxed text-slate-700 shadow-sm focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none"
              placeholder="문제 상황 또는 개선 아이디어를 구체적으로 적어 주세요."
              disabled={submitting}
            />
            <div className="mt-2 flex justify-end">
              <span className={cn("text-[10px] font-black uppercase tracking-widest", messageLength > 1900 ? "text-rose-500" : "text-slate-400")}>
                {messageLength.toLocaleString()} / 2,000
              </span>
            </div>
          </label>

          {notice ? <p role="status" aria-live="polite" className="text-sm font-black text-primary bg-primary/5 p-4 rounded-2xl">{notice}</p> : null}
          {error ? <p role="alert" className="text-sm font-black text-rose-600 bg-rose-50 p-4 rounded-2xl">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" variant="primary" className="h-11 px-8 rounded-2xl font-black shadow-md" disabled={submitting}>
              {submitting ? "저장 중..." : "내용 저장하기"}
            </Button>
            <p className="ml-2 text-xs font-bold text-slate-400">비밀번호, 인증번호, 계좌번호 전체 등 민감정보는 메시지에 남기지 마세요.</p>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
