export type EcosKeyStatRow = {
  CLASS_NAME: string;
  KEYSTAT_NAME: string;
  DATA_VALUE: string;
  CYCLE: string;
  UNIT_NAME?: string;
};

type FetchEcosKeyStatisticListOptions = {
  apiKey?: string;
  lang?: string;
  startRow?: number;
  endRow?: number;
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("ECOS client is server-only.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveApiKey(explicit?: string): string {
  const value = explicit ?? process.env.ECOS_API_KEY ?? process.env.BOK_ECOS_API_KEY ?? "";
  return value.trim();
}

function resolveLanguage(explicit?: string): string {
  const value = explicit ?? process.env.ECOS_LANGUAGE ?? "kr";
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : "kr";
}

function resolveEndRow(explicit?: number): number {
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 1) {
    return Math.trunc(explicit);
  }
  const envValue = Number.parseInt(process.env.ECOS_MAX_ROWS ?? "100", 10);
  if (Number.isFinite(envValue) && envValue >= 1) {
    return Math.trunc(envValue);
  }
  return 100;
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseRows(payload: unknown): EcosKeyStatRow[] {
  if (!isRecord(payload)) return [];
  const keyStatisticList = payload.KeyStatisticList;
  if (!isRecord(keyStatisticList)) return [];
  const rawRows = keyStatisticList.row;
  if (!Array.isArray(rawRows)) return [];

  return rawRows
    .filter((row): row is Record<string, unknown> => isRecord(row))
    .map((row) => ({
      CLASS_NAME: toStringValue(row.CLASS_NAME),
      KEYSTAT_NAME: toStringValue(row.KEYSTAT_NAME),
      DATA_VALUE: toStringValue(row.DATA_VALUE),
      CYCLE: toStringValue(row.CYCLE),
      ...(toStringValue(row.UNIT_NAME).length > 0 ? { UNIT_NAME: toStringValue(row.UNIT_NAME) } : {}),
    }));
}

function hasResultMessage(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.MESSAGE === "string" && value.MESSAGE.trim().length > 0;
}

function hasErrorCode(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const code = typeof value.CODE === "string" ? value.CODE.trim().toUpperCase() : "";
  if (!code) return false;
  return !code.startsWith("INFO");
}

export async function fetchEcosKeyStatisticList(opts: FetchEcosKeyStatisticListOptions = {}): Promise<EcosKeyStatRow[]> {
  assertServerOnly();

  const apiKey = resolveApiKey(opts.apiKey);
  if (!apiKey) {
    throw new Error("ECOS API key is missing.");
  }

  const lang = resolveLanguage(opts.lang);
  const startRow = Number.isFinite(opts.startRow) && (opts.startRow ?? 0) >= 1 ? Math.trunc(opts.startRow ?? 1) : 1;
  const endRow = resolveEndRow(opts.endRow);

  const endpoint = `https://ecos.bok.or.kr/api/KeyStatisticList/${apiKey}/json/${lang}/${startRow}/${endRow}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "finance-planning-assumptions-sync/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`ECOS request failed (HTTP ${response.status}).`);
  }

  const payload = await response.json() as unknown;
  if (hasErrorCode((payload as Record<string, unknown>)?.RESULT) || hasResultMessage((payload as Record<string, unknown>)?.RESULT)) {
    throw new Error("ECOS API returned an error response.");
  }

  const list = isRecord(payload) ? payload.KeyStatisticList : null;
  if (hasErrorCode(isRecord(list) ? list.RESULT : null) || hasResultMessage(isRecord(list) ? list.RESULT : null)) {
    throw new Error("ECOS KeyStatisticList returned an error response.");
  }

  return parseRows(payload);
}
