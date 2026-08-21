import { type FinlifeKind, type FinlifeParams } from "@/lib/finlife/types";
import { ExternalApiError, fetchExternal, type FetchExternalResult } from "@/lib/http/fetchExternal";

const ENDPOINTS: Record<FinlifeKind, string> = {
  deposit: "depositProductsSearch.json",
  saving: "savingProductsSearch.json",
  pension: "annuitySavingProductsSearch.json",
  "mortgage-loan": "mortgageLoanProductsSearch.json",
  "rent-house-loan": "rentHouseLoanProductsSearch.json",
  "credit-loan": "creditLoanProductsSearch.json",
};

function maskKey(value: string): string {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

function requireJsonBody(fetched: FetchExternalResult): unknown {
  if (fetched.kind === "json") return fetched.body;
  throw new ExternalApiError(
    { code: "UPSTREAM", message: "FINLIFE 응답 형식이 올바르지 않습니다." },
    {
      status: fetched.status,
      retryAfterSeconds: fetched.retryAfterSeconds,
    },
  );
}

export async function fetchLiveFinlife(kind: FinlifeKind, params: Required<FinlifeParams>): Promise<unknown> {
  const detailed = await fetchLiveFinlifeDetailed(kind, params);
  return detailed.raw;
}

export async function fetchLiveFinlifeDetailed(
  kind: FinlifeKind,
  params: Required<FinlifeParams>,
): Promise<{ raw: unknown; status: number; elapsedMs: number; cacheKey: string }> {
  const auth = process.env.FINLIFE_API_KEY;
  const baseUrl = process.env.FINLIFE_BASE_URL ?? "https://finlife.fss.or.kr/finlifeapi";

  if (!auth) {
    throw new Error("FINLIFE_API_KEY missing");
  }

  const url = new URL(`${baseUrl}/${ENDPOINTS[kind]}`);
  url.searchParams.set("auth", auth);
  url.searchParams.set("topFinGrpNo", params.topFinGrpNo);
  url.searchParams.set("pageNo", String(params.pageNo));
  const safeUrl = new URL(url.toString());
  safeUrl.searchParams.delete("auth");

  try {
    const startedAt = Date.now();
    const fetched = await fetchExternal(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      retries: 0,
      sourceKey: "finlife",
      timeoutMs: 10_000,
    });
    const elapsedMs = Math.max(0, Date.now() - startedAt);

    return {
      raw: requireJsonBody(fetched),
      status: fetched.status,
      elapsedMs,
      cacheKey: safeUrl.toString(),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[finlife-live] request failed", {
      kind,
      pageNo: params.pageNo,
      topFinGrpNo: params.topFinGrpNo,
      auth: maskKey(auth),
      message: msg,
    });
    throw error;
  }
}

export async function fetchLiveFinlifeCompany(params: Required<FinlifeParams>): Promise<unknown> {
  const auth = process.env.FINLIFE_API_KEY;
  const baseUrl = process.env.FINLIFE_BASE_URL ?? "https://finlife.fss.or.kr/finlifeapi";

  if (!auth) {
    throw new Error("FINLIFE_API_KEY missing");
  }

  const url = new URL(`${baseUrl}/companySearch.json`);
  url.searchParams.set("auth", auth);
  url.searchParams.set("topFinGrpNo", params.topFinGrpNo);
  url.searchParams.set("pageNo", String(params.pageNo));

  try {
    const fetched = await fetchExternal(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      retries: 0,
      sourceKey: "finlife-company",
      timeoutMs: 10_000,
    });
    return requireJsonBody(fetched);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[finlife-live-company] request failed", {
      pageNo: params.pageNo,
      topFinGrpNo: params.topFinGrpNo,
      auth: maskKey(auth),
      message: msg,
    });
    throw error;
  }
}
