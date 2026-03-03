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

export type DraftUploadCreateResult = {
  draftId: string;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ImportCreateResponse = {
  ok: true;
  draftId?: unknown;
  data?: {
    draftId?: unknown;
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

function buildQuery(csrfToken?: string): string {
  if (!csrfToken) return "";
  return `?csrf=${encodeURIComponent(csrfToken)}`;
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

function isImportCreateResponse(payload: unknown): payload is ImportCreateResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  return true;
}

function extractErrorCode(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.error)) return "";
  return asString(payload.error.code).toUpperCase();
}

function extractErrorDetailCodes(payload: unknown): string[] {
  if (!isRecord(payload) || !isRecord(payload.error) || !Array.isArray(payload.error.details)) return [];
  return payload.error.details
    .map((detail) => (isRecord(detail) ? asString(detail.code).toUpperCase() : ""))
    .filter((detail) => detail.length > 0);
}

function toUploadErrorMessage(status: number, code: string, detailCodes: string[]): string {
  if (detailCodes.includes("MISSING_COLUMN")) {
    return "CSV 헤더에서 필수 컬럼(date/amount)을 찾지 못했습니다. 헤더 이름을 확인해 주세요.";
  }
  if (detailCodes.includes("INVALID_AMOUNT")) {
    return "금액 형식을 해석하지 못했습니다. 숫자/통화 표기를 확인해 주세요.";
  }
  if (detailCodes.includes("INVALID_DATE")) {
    return "날짜 형식을 해석하지 못했습니다. YYYY-MM-DD 형식으로 확인해 주세요.";
  }
  if (status === 400 || code === "INPUT") return "CSV 형식 또는 값에 문제가 있습니다. 파일 내용을 확인해 주세요.";
  if (status === 413 || code === "PAYLOAD_TOO_LARGE") return "파일 크기 제한(1MB)을 초과했습니다.";
  if (status === 415 || code === "UNSUPPORTED_MEDIA_TYPE") return "CSV 텍스트 형식만 지원합니다.";
  if (status === 403 || code === "CSRF_MISMATCH") return "보안 검증에 실패했습니다. 새로고침 후 다시 시도해 주세요.";
  return "초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function createDraftFromCsvUpload(
  csvText: string,
  fetchImpl: FetchLike,
  csrfToken?: string,
): Promise<DraftUploadCreateResult> {
  if (!csvText.trim()) {
    throw new Error("CSV 파일이 비어 있습니다.");
  }

  const response = await fetchImpl(`/api/planning/v3/import/csv${buildQuery(csrfToken)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "text/csv",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: csvText,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(toUploadErrorMessage(
      response.status,
      extractErrorCode(payload),
      extractErrorDetailCodes(payload),
    ));
  }

  if (!isImportCreateResponse(payload)) {
    throw new Error("초안 생성 응답 형식을 확인할 수 없습니다.");
  }

  const draftId = asString(payload.draftId) || asString(isRecord(payload.data) ? payload.data.draftId : "");
  if (!draftId) {
    throw new Error("초안 생성 응답 형식을 확인할 수 없습니다.");
  }

  return { draftId };
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
    throw new Error("초안 목록을 불러오지 못했습니다.");
  }
  return payload.drafts;
}
