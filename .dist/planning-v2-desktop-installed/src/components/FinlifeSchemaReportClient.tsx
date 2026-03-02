"use client";

import { useEffect, useMemo, useState } from "react";
import { type FinlifeKind } from "@/lib/finlife/types";

type KeyRows = Array<[string, number]>;

type ProductReport = {
  baseKeys: KeyRows;
  optionKeys: KeyRows;
};

type SchemaReportResponse =
  | {
      ok: true;
      meta: { fixtureDir: string; fileCount: number; topN: number };
      report: {
        product: Partial<Record<FinlifeKind, ProductReport>>;
        company: { keys: KeyRows };
      };
    }
  | {
      ok: false;
      error: { code: string; message: string };
    };

const PRODUCT_KINDS: FinlifeKind[] = [
  "deposit",
  "saving",
  "pension",
  "mortgage-loan",
  "rent-house-loan",
  "credit-loan",
];

function KindTable({ title, rows, query }: { title: string; rows: KeyRows; query: string }) {
  const filtered = rows.filter(([key]) => key.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {filtered.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">표시할 키가 없습니다.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-4 font-semibold">Key</th>
                <th className="py-1 pr-4 font-semibold">Count</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(([key, count]) => (
                <tr key={`${title}-${key}`} className="border-t border-slate-100 text-slate-700">
                  <td className="py-1.5 pr-4 font-mono">{key}</td>
                  <td className="py-1.5 pr-4">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FinlifeSchemaReportClient() {
  const [topN, setTopN] = useState(30);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<FinlifeKind>("pension");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [payload, setPayload] = useState<SchemaReportResponse | null>(null);

  useEffect(() => {
    let aborted = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/dev/finlife/schema-report?topN=${topN}`, { cache: "no-store" });
        const raw = (await res.json()) as SchemaReportResponse;
        if (aborted) return;
        setPayload(raw);
        if (!raw.ok) setError(raw.error.message);
      } catch {
        if (aborted) return;
        setError("스키마 리포트를 불러오지 못했습니다.");
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    void load();

    return () => {
      aborted = true;
    };
  }, [topN]);

  const selected = useMemo(() => {
    if (!payload?.ok) return { baseKeys: [] as KeyRows, optionKeys: [] as KeyRows };
    return payload.report.product[kind] ?? { baseKeys: [], optionKeys: [] };
  }, [payload, kind]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h1 className="text-lg font-semibold text-slate-900">FINLIFE Fixture Schema Report</h1>
          <p className="mt-1 text-sm text-slate-500">FINLIFE_MODE=fixture와 --record로 만든 fixture의 key 빈도를 확인합니다.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <label className="text-xs text-slate-600">
              kind
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as FinlifeKind)}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
              >
                {PRODUCT_KINDS.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              검색
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="키 이름 필터"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-700"
              />
            </label>
            <label className="text-xs text-slate-600">
              topN
              <input
                type="number"
                min={1}
                max={200}
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value) || 30)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-700"
              />
            </label>
          </div>
          {payload?.ok ? (
            <p className="mt-2 text-xs text-slate-500">
              fixtureDir: <span className="font-mono">{payload.meta.fixtureDir}</span> | files: {payload.meta.fileCount}
            </p>
          ) : null}
        </div>

        {loading ? <p className="text-sm text-slate-500">로딩 중...</p> : null}
        {!loading && error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {!loading && payload?.ok ? (
          <div className="grid gap-4 md:grid-cols-2">
            <KindTable title={`${kind} baseList`} rows={selected.baseKeys} query={query} />
            <KindTable title={`${kind} optionList`} rows={selected.optionKeys} query={query} />
            <div className="md:col-span-2">
              <KindTable title="company" rows={payload.report.company.keys} query={query} />
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
