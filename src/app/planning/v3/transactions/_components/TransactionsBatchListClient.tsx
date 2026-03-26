"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  BodyActionLink,
  bodyActionLinkGroupClassName,
  BodySectionHeading,
  BodyStatusInset,
  BodyTableFrame,
  bodyCompactFieldClassName,
  bodyDenseActionRowClassName,
} from "@/components/ui/BodyTone";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";

type BatchRow = {
  id: string;
  // `/api/planning/v3/transactions/batches` keeps a string createdAt contract.
  // Hidden public createdAt arrives as "" and this client renders it as "-".
  createdAt: string;
  kind: "csv";
  fileName?: string;
  total: number;
  ok: number;
  failed: number;
};

type Account = {
  id: string;
  name: string;
  kind: "checking" | "saving" | "card" | "cash" | "other";
  currency: "KRW";
  note?: string;
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

type Props = {
  initialRows?: BatchRow[];
  initialAccounts?: Account[];
  disableAutoLoad?: boolean;
  initialLoadFailed?: boolean;
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
  if (!asString(value.id)) return false;
  if (value.kind !== "csv") return false;
  return true;
}

function isAccount(value: unknown): value is Account {
  if (!isRecord(value)) return false;
  if (!asString(value.id) || !asString(value.name)) return false;
  const kind = asString(value.kind);
  return ["checking", "saving", "card", "cash", "other"].includes(kind);
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
    if (field === "accountId") {
      return "업로드 전에 거래 계좌를 선택해 주세요.";
    }
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

export function TransactionsBatchListClient({
  initialRows = [],
  initialAccounts = [],
  disableAutoLoad = false,
  initialLoadFailed = false,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(!disableAutoLoad && initialRows.length < 1 && !initialLoadFailed);
  const [loadFailed, setLoadFailed] = useState(initialLoadFailed);
  const [rows, setRows] = useState<BatchRow[]>(initialRows);
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [accountLoading, setAccountLoading] = useState(!disableAutoLoad && initialAccounts.length < 1);
  const [selectedAccountId, setSelectedAccountId] = useState(() => initialAccounts[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setMessage("");

    try {
      const response = await fetch(`/api/planning/v3/transactions/batches?limit=50${buildCsrfQuery()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isListResponse(json)) {
        setRows([]);
        setLoadFailed(true);
        return;
      }

      setLoadFailed(false);
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
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setAccountLoading(true);
    try {
      const response = await fetch(`/api/planning/v3/accounts${buildCsrfQuery()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !Array.isArray(payload.items)) {
        setAccounts([]);
        return;
      }
      const items = payload.items.filter(isAccount);
      setAccounts(items);
      if (items.length > 0) {
        setSelectedAccountId((prev) => prev || items[0].id);
      }
    } catch {
      setAccounts([]);
    } finally {
      setAccountLoading(false);
    }
  }, []);

  const recentBatch = useMemo(() => rows[0] ?? null, [rows]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || uploading) return;
    if (!selectedAccountId) {
      setUploadError("업로드 전에 거래 계좌를 먼저 선택해 주세요.");
      return;
    }

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
          accountId: selectedAccountId,
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
  }, [router, selectedFile, selectedAccountId, uploading]);

  useEffect(() => {
    if (disableAutoLoad) return;
    void loadRows();
    void loadAccounts();
  }, [disableAutoLoad, loadRows, loadAccounts]);

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Import-to-Planning Beta</p>
            <h1 className="text-2xl font-black text-slate-900">거래내역 가져오기 시작</h1>
            <p className="max-w-3xl text-sm text-slate-600">
              이 화면은 official beta entry 기준의 시작 surface입니다. CSV를 배치로 가져오고, 최근 배치를 확인한 뒤
              <span className="font-semibold text-slate-800"> balances 확인</span>,
              <span className="font-semibold text-slate-800"> profile drafts 확인</span>으로 이어지는 1차 funnel만 먼저 정리합니다.
            </p>
          </div>

          <div className={bodyActionLinkGroupClassName}>
            <a
              className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 no-underline shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100"
              href="#transactions-upload"
            >
              CSV 업로드
            </a>
            {recentBatch ? (
              <BodyActionLink href={`/planning/v3/transactions/batches/${encodeURIComponent(recentBatch.id)}`}>
                최근 배치 확인
              </BodyActionLink>
            ) : (
              <a
                className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 no-underline shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                href="#transactions-batch-list"
              >
                최근 배치 확인
              </a>
            )}
            <BodyActionLink href="/planning/v3/balances">
              balances 확인
            </BodyActionLink>
            <BodyActionLink href="/planning/v3/profile/drafts">
              profile drafts 확인
            </BodyActionLink>
          </div>

          <BodyStatusInset>
            <p className="text-sm font-semibold">stable report는 직접 entry가 아니라 handoff 도착점입니다.</p>
            <p className="mt-1 text-xs">
              이 화면에서는 import와 batch 확인까지만 시작하고, preflight/apply 이후에 stable
              {" "}
              <BodyActionLink className="text-xs" href="/planning/reports">
                `/planning/reports`
              </BodyActionLink>
              {" "}로 결과를 확인합니다.
            </p>
          </BodyStatusInset>
        </Card>

        <Card className="space-y-3" id="transactions-upload">
          <BodySectionHeading
            description="로컬 CSV 파일을 읽어 새 배치를 만듭니다. 원문 CSV와 원문 거래 설명은 화면에 그대로 노출하지 않습니다."
            title="1. CSV 업로드"
          />

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-semibold text-slate-700">
              거래 계좌
              <select
                className={`${bodyCompactFieldClassName} ml-2`}
                data-testid="v3-upload-account-select"
                disabled={accountLoading || accounts.length < 1}
                onChange={(event) => {
                  setSelectedAccountId(event.currentTarget.value);
                }}
                value={selectedAccountId}
              >
                <option value="">선택</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.kind})
                  </option>
                ))}
              </select>
            </label>
            <BodyActionLink className="text-xs text-slate-500" href="/planning/v3/accounts">
              계좌 관리
            </BodyActionLink>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              accept=".csv,text/csv"
              className={bodyCompactFieldClassName}
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
              disabled={!selectedFile || uploading || !selectedAccountId}
              onClick={() => {
                void handleUpload();
              }}
              size="sm"
              type="button"
            >
              {uploading ? "업로드 중..." : "CSV 업로드"}
            </Button>
          </div>

          {uploadStatus ? <p className="text-sm text-slate-700">{uploadStatus}</p> : null}

          {uploadError ? (
            <BodyStatusInset tone="warning">
              <p className="font-semibold">{uploadError}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                <li>date + amount(또는 inflow/outflow) 컬럼이 있는지 확인해 주세요.</li>
                <li>CSV 헤더명이 맞지 않으면 /planning/v3/import/csv에서 매핑 UI로 먼저 검증해 주세요.</li>
              </ul>
              <div className={`${bodyDenseActionRowClassName} mt-3`}>
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
            </BodyStatusInset>
          ) : null}
        </Card>

        <Card className="space-y-3" id="transactions-batch-list">
          <BodySectionHeading
            action={(
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
            )}
            description="가져온 배치에서 바로 상세 확인으로 들어가고, 이후 balances와 profile drafts handoff를 이어갑니다."
            title="2. 최근 배치 확인"
          />

          <div className={bodyActionLinkGroupClassName}>
            {recentBatch ? (
              <BodyActionLink href={`/planning/v3/transactions/batches/${encodeURIComponent(recentBatch.id)}`}>
                최근 배치 확인
              </BodyActionLink>
            ) : null}
            <BodyActionLink href="/planning/v3/balances">
              balances 확인
            </BodyActionLink>
            <BodyActionLink href="/planning/v3/profile/drafts">
              profile drafts 확인
            </BodyActionLink>
          </div>

          <div className="space-y-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Support / Internal</p>
            <div className={`${bodyActionLinkGroupClassName} text-xs`}>
              <BodyActionLink className="text-xs text-slate-500" href="/planning/v3/accounts">
                계좌 관리
              </BodyActionLink>
              <BodyActionLink className="text-xs text-slate-500" href="/planning/v3/batches">
                Batch Center
              </BodyActionLink>
              <BodyActionLink className="text-xs text-slate-500" href="/planning/v3/import/csv">
                raw CSV Import
              </BodyActionLink>
            </div>
          </div>

          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
          {loading ? <p className="text-sm text-slate-600">목록을 불러오는 중...</p> : null}
          {!loading && loadFailed ? <p className="text-sm text-slate-600">배치 목록을 불러오지 못했습니다.</p> : null}
          {!loading && !loadFailed && rows.length < 1 ? <p className="text-sm text-slate-600">저장된 배치가 없습니다.</p> : null}

          <div className="rounded-2xl border border-slate-100 bg-white/70 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">다음 handoff</p>
            <p className="mt-1 text-sm text-slate-600">
              최근 배치를 확인한 뒤
              {" "}
              <span className="font-semibold text-slate-800">balances</span>
              {" "}에서 월별 흐름을 보고,
              {" "}
              <span className="font-semibold text-slate-800">profile drafts</span>
              {" "}에서 초안을 검토한 다음 preflight/apply를 거쳐 stable report로 이동합니다.
            </p>
          </div>

          {rows.length > 0 ? (
            <BodyTableFrame>
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
                      <td className="px-3 py-2 font-mono text-xs text-slate-800">{row.createdAt ? formatDateTime(row.createdAt) : "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{row.fileName ?? "-"}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{row.total.toLocaleString("ko-KR")}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{row.ok.toLocaleString("ko-KR")}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{row.failed.toLocaleString("ko-KR")}</td>
                      <td className="px-3 py-2">
                        <BodyActionLink href={`/planning/v3/transactions/batches/${encodeURIComponent(row.id)}`}>
                          보기
                        </BodyActionLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BodyTableFrame>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
}
