"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";

type BatchRow = {
  id: string;
  createdAt: string;
  kind: "csv";
  fileName?: string;
  total: number;
  ok: number;
  failed: number;
};

type ListResponse = {
  ok: true;
  items: BatchRow[];
  nextCursor?: string;
};

type ImportSuccessResponse = {
  ok: true;
  batchId?: string;
  batch?: {
    id?: string;
    createdAt?: string;
    total?: number;
    ok?: number;
    failed?: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isBatchRow(value: unknown): value is BatchRow {
  if (!isRecord(value)) return false;
  if (!asString(value.id) || !asString(value.createdAt)) return false;
  if (value.kind !== "csv") return false;
  return true;
}

function isListResponse(payload: unknown): payload is ListResponse {
  if (!isRecord(payload)) return false;
  if (payload.ok !== true || !Array.isArray(payload.items)) return false;
  return payload.items.every(isBatchRow);
}

function isImportSuccessResponse(payload: unknown): payload is ImportSuccessResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  return true;
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `&csrf=${encodeURIComponent(csrf)}`;
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function firstFriendlyField(details: unknown): string {
  if (!Array.isArray(details)) return "";
  for (const detail of details) {
    if (!isRecord(detail)) continue;
    const field = asString(detail.field);
    if (field) return field;
  }
  return "";
}

function toFriendlyUploadError(payload: unknown): string {
  if (!isRecord(payload)) {
    return "업로드를 완료하지 못했습니다. CSV 형식을 확인한 뒤 다시 시도해 주세요.";
  }

  const error = isRecord(payload.error) ? payload.error : null;
  const code = asString(error?.code).toUpperCase();
  const field = firstFriendlyField(payload.details);

  if (code === "CSV_ENCODING") {
    return "파일 인코딩을 읽지 못했습니다. CSV를 UTF-8로 저장한 뒤 다시 시도해 주세요.";
  }

  if (code === "INPUT") {
    if (field === "csvEncoding" || field === "encoding") {
      return "파일 인코딩을 읽지 못했습니다. CSV를 UTF-8로 저장한 뒤 다시 시도해 주세요.";
    }
    if (field === "csvText" || field === "headers") {
      return "CSV 헤더를 읽지 못했습니다. 파일 내용과 구분자를 확인해 주세요.";
    }
    if (field === "dateKey" || field === "amount" || field === "amountKey" || field === "inflowKey" || field === "outflowKey") {
      return "컬럼 매핑을 확인해 주세요. date + amount(또는 inflow/outflow) 컬럼이 필요합니다.";
    }
    return "CSV 형식을 확인해 주세요. 날짜/금액 컬럼을 인식하지 못했습니다.";
  }

  if (code === "CSRF_MISMATCH" || code === "ORIGIN_MISMATCH" || code === "LOCAL_ONLY") {
    return "로컬 보안 정책으로 요청이 차단되었습니다. 같은 브라우저 탭에서 다시 시도해 주세요.";
  }

  return "업로드를 완료하지 못했습니다. CSV 형식을 확인한 뒤 다시 시도해 주세요.";
}

function resolveImportedBatchId(payload: ImportSuccessResponse): string {
  const direct = asString(payload.batchId);
  if (direct) return direct;
  if (isRecord(payload.batch)) {
    const nested = asString(payload.batch.id);
    if (nested) return nested;
  }
  return "";
}

export function TransactionsBatchListClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/planning/v3/transactions/batches?limit=50${buildCsrfQuery()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isListResponse(json)) {
        setRows([]);
        setMessage("배치 목록을 불러오지 못했습니다.");
        return;
      }

      setRows(json.items.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        kind: "csv",
        ...(asString(item.fileName) ? { fileName: asString(item.fileName) } : {}),
        total: asNumber(item.total),
        ok: asNumber(item.ok),
        failed: asNumber(item.failed),
      })));
    } catch {
      setRows([]);
      setMessage("배치 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const recentBatch = useMemo(() => rows[0] ?? null, [rows]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || uploading) return;

    setUploadError("");
    setUploadStatus("CSV 파일을 읽는 중입니다...");
    setUploading(true);

    try {
      const csvText = await selectedFile.text();
      if (!csvText.trim()) {
        setUploadError("비어 있는 CSV 파일입니다. 샘플 형식을 확인해 주세요.");
        return;
      }

      setUploadStatus("배치를 생성하는 중입니다...");
      const response = await fetch("/api/planning/v3/transactions/import/csv", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          csvText,
          fileName: selectedFile.name,
        })),
      });

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isImportSuccessResponse(payload)) {
        setUploadError(toFriendlyUploadError(payload));
        return;
      }

      const batchId = resolveImportedBatchId(payload);
      if (!batchId) {
        setUploadError("배치 ID를 확인하지 못했습니다. 다시 시도해 주세요.");
        return;
      }

      setUploadStatus("업로드가 완료되어 상세 페이지로 이동합니다.");
      router.push(`/planning/v3/transactions/batches/${encodeURIComponent(batchId)}`);
    } catch {
      setUploadError("업로드 중 오류가 발생했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setUploading(false);
    }
  }, [router, selectedFile, uploading]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Transaction Batches</h1>
          <p className="text-sm text-slate-600">CSV 업로드 후 로컬 배치로 저장하고, 월별 집계 상태를 확인할 수 있습니다.</p>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">CSV 업로드</h2>
          <p className="text-sm text-slate-600">로컬 CSV 파일을 읽어 새 배치를 만듭니다. 원문 CSV/원문 거래 설명은 화면에 표시하지 않습니다.</p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              accept=".csv,text/csv"
              className="max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              data-testid="v3-upload-input"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                setSelectedFile(file);
                setUploadError("");
                setUploadStatus(file ? `선택 파일: ${file.name}` : "");
              }}
              type="file"
            />
            <Button
              data-testid="v3-upload-submit"
              disabled={!selectedFile || uploading}
              onClick={() => {
                void handleUpload();
              }}
              size="sm"
              type="button"
            >
              {uploading ? "업로드 중..." : "업로드"}
            </Button>
          </div>

          {uploadStatus ? <p className="text-sm text-slate-700">{uploadStatus}</p> : null}

          {uploadError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">{uploadError}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                <li>date + amount(또는 inflow/outflow) 컬럼이 있는지 확인해 주세요.</li>
                <li>CSV 헤더명이 맞지 않으면 /planning/v3/import에서 매핑 UI로 먼저 검증해 주세요.</li>
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  className="text-xs font-semibold underline underline-offset-2"
                  download
                  href="/planning-v3/sample.csv"
                >
                  샘플 CSV 다운로드
                </a>
                <Button
                  onClick={() => {
                    void handleUpload();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  다시 시도
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">가져온 배치 목록</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                void loadRows();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              새로고침
            </Button>
            {recentBatch ? (
              <Link
                className="text-sm font-semibold text-emerald-700 underline underline-offset-2"
                href={`/planning/v3/transactions/batches/${encodeURIComponent(recentBatch.id)}`}
              >
                최근 배치로 이동
              </Link>
            ) : null}
            <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/import">
              CSV Import
            </Link>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
          {loading ? <p className="text-sm text-slate-600">목록을 불러오는 중...</p> : null}
          {!loading && rows.length < 1 ? <p className="text-sm text-slate-600">저장된 배치가 없습니다.</p> : null}

          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="v3-batch-list">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">생성일</th>
                    <th className="px-3 py-2 text-left">file</th>
                    <th className="px-3 py-2 text-right">total</th>
                    <th className="px-3 py-2 text-right">ok</th>
                    <th className="px-3 py-2 text-right">failed</th>
                    <th className="px-3 py-2 text-left">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr data-testid={`v3-batch-row-${row.id}`} key={row.id}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-800">{formatDateTime(row.createdAt)}</td>
                      <td className="px-3 py-2 text-slate-700">{row.fileName ?? "-"}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{row.total.toLocaleString("ko-KR")}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{row.ok.toLocaleString("ko-KR")}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{row.failed.toLocaleString("ko-KR")}</td>
                      <td className="px-3 py-2">
                        <Link
                          className="text-sm font-semibold text-emerald-700 underline underline-offset-2"
                          href={`/planning/v3/transactions/batches/${encodeURIComponent(row.id)}`}
                        >
                          보기
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
}
