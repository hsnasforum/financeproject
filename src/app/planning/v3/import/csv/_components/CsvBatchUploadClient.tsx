"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken } from "@/lib/dev/clientCsrf";

type ImportResponse = {
  ok: true;
  data: {
    batchId: string;
    createdAt: string;
    summary: {
      months: number;
      txns: number;
      transfers: number;
      unassignedCategory: number;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isImportResponse(value: unknown): value is ImportResponse {
  return isRecord(value)
    && value.ok === true
    && isRecord(value.data)
    && asString(value.data.batchId).length > 0;
}

export function CsvBatchUploadClient() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function handleUpload(): Promise<void> {
    if (!file || loading) {
      if (!file) setError("CSV 파일을 선택해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("업로드 중...");
    try {
      const form = new FormData();
      form.append("file", file);
      const csrf = readDevCsrfToken();
      if (csrf) form.append("csrf", csrf);

      const response = await fetch("/api/planning/v3/batches/import/csv", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isImportResponse(payload)) {
        setError("CSV 업로드에 실패했습니다. 파일 형식을 확인해 주세요.");
        setStatus("");
        return;
      }

      setStatus("배치를 생성했습니다. 요약 페이지로 이동합니다.");
      router.push(`/planning/v3/batches/${encodeURIComponent(payload.data.batchId)}`);
    } catch {
      setError("CSV 업로드에 실패했습니다. 다시 시도해 주세요.");
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-5" data-testid="v3-csv-upload-page">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 CSV Upload</h1>
          <p className="text-sm text-slate-600">CSV 파일을 배치로 저장한 뒤 요약 페이지로 이동합니다.</p>
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-emerald-700">
            <Link className="underline underline-offset-2" href="/planning/v3/batches">
              Batch Center
            </Link>
            <Link className="underline underline-offset-2" href="/planning/v3/profile/drafts">
              Draft 목록
            </Link>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              accept=".csv,text/csv"
              data-testid="v3-csv-file-input"
              onChange={(event) => {
                setFile(event.currentTarget.files?.[0] ?? null);
                setError("");
                setStatus("");
              }}
              type="file"
            />
            <Button
              data-testid="v3-csv-upload-submit"
              disabled={!file || loading}
              onClick={() => { void handleUpload(); }}
              size="sm"
              type="button"
            >
              {loading ? "업로드 중..." : "업로드"}
            </Button>
          </div>
          {status ? <p className="text-sm text-slate-700">{status}</p> : null}
          {error ? (
            <p className="text-sm font-semibold text-rose-700" data-testid="v3-csv-upload-error">
              {error}
            </p>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
}

