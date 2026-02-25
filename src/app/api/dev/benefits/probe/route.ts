import { NextResponse } from "next/server";
import { odcloudFetchWithAuth, resolveOdcloudEndpoint, setSearchParams } from "@/lib/publicApis/odcloud";
import { extractOdcloudRows } from "@/lib/publicApis/odcloudScan";

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-:/()[\].]/g, "");
}

function pickStableId(row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  const mapped = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) mapped.set(normalizeKey(key), value);
  const keys = ["serviceid", "svcid", "srvid", "id", "서비스id", "서비스아이디"];
  for (const key of keys) {
    const value = mapped.get(normalizeKey(key));
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

async function fetchPage(params: { endpoint: URL; apiKey: string; pageNo: number; perPage: number }) {
  const url = new URL(params.endpoint.toString());
  setSearchParams(url, { page: params.pageNo, perPage: params.perPage, returnType: "JSON" });
  const fetched = await odcloudFetchWithAuth(url, params.apiKey, undefined, { allowServiceKeyFallback: true });
  if (!fetched.response.ok) {
    return {
      ok: false as const,
      status: fetched.response.status,
      authMode: fetched.authMode,
      error: `upstream error (${fetched.response.status})`,
    };
  }
  const parsed = await fetched.response.json();
  const extracted = extractOdcloudRows(parsed);
  if ("error" in extracted) {
    return { ok: false as const, status: 502, authMode: fetched.authMode, error: extracted.error.message };
  }
  return {
    ok: true as const,
    authMode: fetched.authMode,
    rows: extracted.rows,
    meta: extracted.meta,
  };
}

export async function GET() {
  if ((process.env.NODE_ENV ?? "development") !== "development") {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const apiKey = (process.env.MOIS_BENEFITS_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "MOIS_BENEFITS_API_KEY is missing" }, { status: 400 });
  }

  const resolved = resolveOdcloudEndpoint(process.env.MOIS_BENEFITS_API_URL ?? "", "/gov24/v3/serviceList", {
    allowBaseOnly: true,
    allowDirOnly: true,
  });
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: 400 });
  }

  const [page1, page2] = await Promise.all([
    fetchPage({ endpoint: resolved.url, apiKey, pageNo: 1, perPage: 50 }),
    fetchPage({ endpoint: resolved.url, apiKey, pageNo: 2, perPage: 50 }),
  ]);

  if (!page1.ok || !page2.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          page1: page1.ok ? null : { status: page1.status, message: page1.error },
          page2: page2.ok ? null : { status: page2.status, message: page2.error },
        },
      },
      { status: 502 },
    );
  }

  const page1Ids = page1.rows.slice(0, 3).map((row) => pickStableId(row));
  const page2Ids = page2.rows.slice(0, 3).map((row) => pickStableId(row));
  const page1First = page1Ids[0] ?? null;
  const page2First = page2Ids[0] ?? null;
  const paginationSuspected = Boolean(page1First && page2First && page1First === page2First);
  const sampleKeys = Object.keys((page1.rows[0] ?? {}) as Record<string, unknown>).slice(0, 20);

  return NextResponse.json({
    ok: true,
    data: {
      endpoint: resolved.url.toString(),
      authMode: page1.authMode,
      totalCountDetected: {
        value: page1.meta.totalCount ?? page2.meta.totalCount ?? null,
        key: page1.meta.totalCountKey ?? page2.meta.totalCountKey ?? null,
      },
      pageDetected: {
        key: page1.meta.pageKey ?? page2.meta.pageKey ?? null,
        perPageKey: page1.meta.perPageKey ?? page2.meta.perPageKey ?? null,
      },
      page1: { rows: page1.rows.length, firstIds: page1Ids },
      page2: { rows: page2.rows.length, firstIds: page2Ids },
      paginationSuspected,
      sampleKeys,
    },
  });
}

