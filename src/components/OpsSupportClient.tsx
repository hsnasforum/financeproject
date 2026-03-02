"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

type OpsSupportClientProps = {
  csrf: string;
};

export function OpsSupportClient({ csrf }: OpsSupportClientProps) {
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function handleExport(): Promise<void> {
    if (!csrf) {
      setError("CSRF 토큰이 없어 내보내기를 실행할 수 없습니다.");
      return;
    }
    setExporting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/ops/support/export.zip?csrf=${encodeURIComponent(csrf)}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? "진단 번들 생성에 실패했습니다.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="?([^\";]+)"?/i.exec(disposition);
      const fileName = (match?.[1] ?? "planning-support-bundle.zip").trim();

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setNotice(`진단 번들을 다운로드했습니다. (${fileName})`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "진단 번들 생성에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Ops Support Bundle"
        description="민감정보를 제거한 진단 번들을 zip으로 내보냅니다."
        action={(
          <div className="flex items-center gap-2">
            <Link href="/ops">
              <Button size="sm" type="button" variant="outline">Ops 허브</Button>
            </Link>
          </div>
        )}
      />

      {error ? <ErrorState className="mb-4" message={error} /> : null}
      {notice ? (
        <Card className="mb-4 border border-emerald-200 bg-emerald-50">
          <p className="text-sm font-semibold text-emerald-800">{notice}</p>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-black text-slate-900">진단 번들 내보내기</h2>
          <p className="mt-2 text-sm text-slate-700">
            doctor/migration/policy/audit/metrics 요약만 포함한 zip을 생성합니다.
          </p>
          <div className="mt-4">
            <Button
              disabled={exporting || !csrf}
              onClick={() => {
                void handleExport();
              }}
              size="sm"
              type="button"
              variant="primary"
            >
              {exporting ? "생성 중..." : "진단 번들 내보내기"}
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-black text-slate-900">포함 / 제외 항목</h2>
          <div className="mt-3 grid gap-4 text-sm text-slate-700 md:grid-cols-2">
            <div>
              <p className="font-semibold text-slate-900">포함</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>OPS Doctor 요약 리포트</li>
                <li>Migration 상태 요약</li>
                <li>Planning/Ops 정책 스냅샷</li>
                <li>최근 Audit 이벤트 요약</li>
                <li>최근 Metrics 이벤트/윈도우 요약</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-900">제외</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>프로필 원본 값</li>
                <li>Run raw/blob 데이터</li>
                <li>토큰/키/패스프레이즈</li>
                <li>환경변수 값</li>
                <li>원문 upstream payload</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
