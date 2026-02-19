import { type FinlifeKind, type FinlifeParams } from "@/lib/finlife/types";

const ENDPOINTS: Record<FinlifeKind, string> = {
  deposit: "depositProductsSearch.json",
  saving: "savingProductsSearch.json",
};

function maskKey(value: string): string {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

export async function fetchLiveFinlife(kind: FinlifeKind, params: Required<FinlifeParams>): Promise<unknown> {
  const auth = process.env.FINLIFE_API_KEY;
  const baseUrl = process.env.FINLIFE_BASE_URL ?? "https://finlife.fss.or.kr/finlifeapi";

  if (!auth) {
    throw new Error("FINLIFE_API_KEY missing");
  }

  const url = new URL(`${baseUrl}/${ENDPOINTS[kind]}`);
  url.searchParams.set("auth", auth);
  url.searchParams.set("topFinGrpNo", params.topFinGrpNo);
  url.searchParams.set("pageNo", String(params.pageNo));

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return await res.json();
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
