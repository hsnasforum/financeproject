export type DraftUploadPreview = {
  cashflow: Array<{
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    netKrw: number;
    txCount: number;
  }>;
  draftPatch: Record<string, unknown>;
  meta: {
    rows: number;
    months: number;
  };
  draftSummary: {
    rows: number;
    columns: number;
  };
};

export type DraftUploadSavedMeta = {
  id: string;
  createdAt: string;
};

export type DraftUploadListItem = {
  id: string;
  createdAt: string;
  source: {
    kind: "csv";
    rows?: number;
    months?: number;
  };
  summary: {
    medianIncomeKrw?: number;
    medianExpenseKrw?: number;
    avgNetKrw?: number;
  };
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ImportDraftResponse = {
  ok: true;
  cashflow: DraftUploadPreview["cashflow"];
  draftPatch: DraftUploadPreview["draftPatch"];
  meta: DraftUploadPreview["meta"];
  draftSummary: DraftUploadPreview["draftSummary"];
};

type SaveDraftResponse = {
  ok: true;
  id?: string;
  createdAt?: string;
  data?: {
    id?: string;
    createdAt?: string;
  };
};

type ListDraftResponse = {
  ok: true;
  drafts: DraftUploadListItem[];
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

function buildQuery(csrfToken?: string): string {
  if (!csrfToken) return "";
  return `?csrf=${encodeURIComponent(csrfToken)}`;
}

function buildImportPreviewPath(csrfToken?: string): string {
  const params = new URLSearchParams();
  params.set("persist", "0");
  if (csrfToken) params.set("csrf", csrfToken);
  return `/api/planning/v3/import/csv?${params.toString()}`;
}

function toResponseMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload) && isRecord(payload.error)) {
    const message = asString(payload.error.message);
    if (message) return message;
  }
  return fallback;
}

function isImportDraftResponse(payload: unknown): payload is ImportDraftResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  if (!Array.isArray(payload.cashflow) || !isRecord(payload.draftPatch) || !isRecord(payload.meta)) return false;
  if (!isRecord(payload.draftSummary)) return false;
  return true;
}

function isSaveDraftResponse(payload: unknown): payload is SaveDraftResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  const id = asString(payload.id) || asString(isRecord(payload.data) ? payload.data.id : "");
  const createdAt = asString(payload.createdAt) || asString(isRecord(payload.data) ? payload.data.createdAt : "");
  return id.length > 0 && createdAt.length > 0;
}

function isDraftListItem(payload: unknown): payload is DraftUploadListItem {
  if (!isRecord(payload)) return false;
  if (!asString(payload.id) || !asString(payload.createdAt)) return false;
  if (!isRecord(payload.source) || payload.source.kind !== "csv") return false;
  return isRecord(payload.summary);
}

function isListDraftResponse(payload: unknown): payload is ListDraftResponse {
  if (!isRecord(payload) || payload.ok !== true || !Array.isArray(payload.drafts)) return false;
  return payload.drafts.every(isDraftListItem);
}

export async function fetchCsvDraftPreview(
  csvText: string,
  fetchImpl: FetchLike,
  csrfToken?: string,
): Promise<DraftUploadPreview> {
  const response = await fetchImpl(buildImportPreviewPath(csrfToken), {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "text/csv",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: csvText,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !isImportDraftResponse(payload)) {
    throw new Error(toResponseMessage(payload, "CSV 업로드에 실패했습니다."));
  }
  return {
    cashflow: payload.cashflow.map((row) => ({
      ym: asString(isRecord(row) ? row.ym : ""),
      incomeKrw: asNumber(isRecord(row) ? row.incomeKrw : 0),
      expenseKrw: asNumber(isRecord(row) ? row.expenseKrw : 0),
      netKrw: asNumber(isRecord(row) ? row.netKrw : 0),
      txCount: asNumber(isRecord(row) ? row.txCount : 0),
    })),
    draftPatch: payload.draftPatch,
    meta: {
      rows: asNumber(payload.meta.rows),
      months: asNumber(payload.meta.months),
    },
    draftSummary: {
      rows: asNumber(payload.draftSummary.rows),
      columns: asNumber(payload.draftSummary.columns),
    },
  };
}

export async function saveCsvDraftPreview(
  preview: DraftUploadPreview,
  source: { filename?: string },
  fetchImpl: FetchLike,
  csrfToken?: string,
): Promise<DraftUploadSavedMeta> {
  const response = await fetchImpl("/api/planning/v3/drafts", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: JSON.stringify({
      ...(csrfToken ? { csrf: csrfToken } : {}),
      source: {
        kind: "csv",
        ...(source.filename ? { filename: source.filename } : {}),
      },
      payload: {
        cashflow: preview.cashflow,
        draftPatch: preview.draftPatch,
      },
      meta: preview.draftSummary,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !isSaveDraftResponse(payload)) {
    throw new Error(toResponseMessage(payload, "드래프트 저장에 실패했습니다."));
  }
  const id = asString(payload.id) || asString(isRecord(payload.data) ? payload.data.id : "");
  const createdAt = asString(payload.createdAt) || asString(isRecord(payload.data) ? payload.data.createdAt : "");
  return { id, createdAt };
}

export async function fetchDraftList(
  fetchImpl: FetchLike,
  csrfToken?: string,
): Promise<DraftUploadListItem[]> {
  const response = await fetchImpl(`/api/planning/v3/drafts${buildQuery(csrfToken)}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !isListDraftResponse(payload)) {
    throw new Error(toResponseMessage(payload, "초안 목록을 불러오지 못했습니다."));
  }
  return payload.drafts;
}
