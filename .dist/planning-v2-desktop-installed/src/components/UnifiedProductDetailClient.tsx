"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addCompareIdToStorage, compareStoreConfig } from "@/lib/products/compareStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";

type UnifiedOption = {
  sourceId?: string;
  termMonths: number | null;
  saveTrm?: string;
  intrRate: number | null;
  intrRate2: number | null;
};

type UnifiedItem = {
  stableId: string;
  sourceId: string;
  sourceIds?: string[];
  kind: string;
  externalKey: string;
  providerName: string;
  productName: string;
  summary?: string;
  badges?: string[];
  signals?: {
    depositProtection?: "matched" | "unknown";
    kdbMatched?: boolean;
  };
  options?: UnifiedOption[];
  updatedAt?: string;
};

type UnifiedItemResponse = {
  ok?: boolean;
  data?: {
    item?: UnifiedItem;
  };
  meta?: {
    generatedAt?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { hour12: false });
}

function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function optionLabel(option: UnifiedOption): string {
  if (typeof option.termMonths === "number" && Number.isFinite(option.termMonths) && option.termMonths > 0) {
    return `${Math.trunc(option.termMonths)}개월`;
  }
  const saveTrm = (option.saveTrm ?? "").trim();
  return saveTrm || "기간 미상";
}

function optionKey(option: UnifiedOption, index: number): string {
  return `${option.sourceId ?? "na"}:${option.termMonths ?? "na"}:${option.saveTrm ?? ""}:${index}`;
}

export function UnifiedProductDetailClient({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [item, setItem] = useState<UnifiedItem | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [selectedOptionKey, setSelectedOptionKey] = useState<string>("");
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [compareMessage, setCompareMessage] = useState("");

  useEffect(() => {
    let aborted = false;

    async function run() {
      setLoading(true);
      setError("");
      setCompareMessage("");
      try {
        const params = new URLSearchParams();
        params.set("id", id);
        const res = await fetch(`/api/products/unified/item?${params.toString()}`, { cache: "no-store" });
        const json = (await res.json()) as UnifiedItemResponse;
        if (aborted) return;
        if (!res.ok || !json.ok || !json.data?.item) {
          const code = json.error?.code ?? "UPSTREAM";
          const message = json.error?.message ?? "상품 상세를 불러오지 못했습니다.";
          setError(`${code}: ${message}`);
          setItem(null);
          return;
        }
        setItem(json.data.item);
        setGeneratedAt(json.meta?.generatedAt ?? "");
        const firstOption = json.data.item.options?.[0];
        const firstKey = firstOption ? optionKey(firstOption, 0) : "";
        setSelectedOptionKey(firstKey);
      } catch {
        if (!aborted) {
          setError("UPSTREAM: 상품 상세를 불러오는 중 오류가 발생했습니다.");
          setItem(null);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    void run();
    return () => {
      aborted = true;
    };
  }, [id]);

  const options = useMemo(() => item?.options ?? [], [item?.options]);
  const selectedOption = useMemo(() => {
    if (options.length === 0) return null;
    const foundIndex = options.findIndex((option, index) => optionKey(option, index) === selectedOptionKey);
    if (foundIndex >= 0) return options[foundIndex] ?? null;
    return options[0] ?? null;
  }, [options, selectedOptionKey]);
  const selectedOptionValue = useMemo(() => {
    if (options.length === 0) return "";
    const found = options.some((option, index) => optionKey(option, index) === selectedOptionKey);
    return found ? selectedOptionKey : optionKey(options[0]!, 0);
  }, [options, selectedOptionKey]);

  const appliedRate = selectedOption ? (selectedOption.intrRate2 ?? selectedOption.intrRate ?? null) : null;
  const baseRate = selectedOption?.intrRate ?? null;
  const maxRate = selectedOption?.intrRate2 ?? null;

  const conditions = useMemo(() => {
    const rows: string[] = [];
    if (item?.summary) rows.push(item.summary);
    if (selectedOption && selectedOption.intrRate2 !== null && selectedOption.intrRate !== null && selectedOption.intrRate2 > selectedOption.intrRate) {
      rows.push("최고금리는 우대조건 충족 시 적용됩니다.");
    }
    if (item?.signals?.depositProtection) rows.push(`예금자보호 신호: ${item.signals.depositProtection}`);
    if ((item?.badges ?? []).length > 0) rows.push(`배지: ${(item?.badges ?? []).join(", ")}`);
    return rows;
  }, [item, selectedOption]);

  return (
    <main className="min-h-screen bg-slate-50 py-8 md:py-12">
      <Container>
        <SectionHeader
          title="통합 상품 상세"
          subtitle="unified item API 기준 상세/비교 화면입니다."
        />

        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">ID: {id}</span>
            {generatedAt ? <span>응답시각: {formatDateTime(generatedAt)}</span> : null}
          </div>
        </Card>

        {loading ? (
          <Card>
            <p className="text-sm text-slate-600">상세 데이터를 불러오는 중입니다...</p>
          </Card>
        ) : null}

        {!loading && error ? (
          <Card>
            <p className="text-sm text-rose-700">{error}</p>
            <div className="mt-3">
              <Link href="/products/catalog" className="text-sm font-semibold text-slate-700 underline">통합 카탈로그로 이동</Link>
            </div>
          </Card>
        ) : null}

        {!loading && !error && item ? (
          <Card>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">{item.kind}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">{(item.sourceIds ?? [item.sourceId]).join(", ")}</span>
              {(item.badges ?? []).map((badge) => (
                <span key={`${item.stableId}-${badge}`} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">{badge}</span>
              ))}
            </div>
            <h1 className="mt-2 text-2xl font-black text-slate-900">{item.productName}</h1>
            <p className="mt-1 text-sm text-slate-600">{item.providerName}</p>
            <p className="mt-1 text-xs text-slate-500">stableId: {item.stableId}</p>
            <p className="mt-1 text-xs text-slate-500">기준시각: {formatDateTime(item.updatedAt ?? generatedAt)}</p>

            {options.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <label className="text-sm md:col-span-2">
                  기간 옵션
                  <select
                    className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3"
                    value={selectedOptionValue}
                    onChange={(event) => setSelectedOptionKey(event.target.value)}
                  >
                    {options.map((option, index) => {
                      const key = optionKey(option, index);
                      return (
                        <option key={key} value={key}>
                          {optionLabel(option)} / {option.sourceId ?? "-"}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="text-xs text-slate-500">적용금리</p>
                  <p className="mt-1 font-bold text-slate-900">{formatRate(appliedRate)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="text-xs text-slate-500">기본/최고</p>
                  <p className="mt-1 font-bold text-slate-900">{formatRate(baseRate)} / {formatRate(maxRate)}</p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">옵션 정보가 없습니다.</p>
            )}

            <div className="mt-4 rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setConditionsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800"
              >
                우대/조건
                <span className="text-xs text-slate-500">{conditionsOpen ? "접기" : "펼치기"}</span>
              </button>
              {conditionsOpen ? (
                <div className="border-t border-slate-100 px-4 py-3">
                  {conditions.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
                      {conditions.map((row, index) => (
                        <li key={`${item.stableId}-condition-${index}`}>{row}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">표시 가능한 우대/조건 정보가 없습니다.</p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  const next = addCompareIdToStorage(item.stableId || id, compareStoreConfig.max);
                  setCompareMessage(`비교함에 담았습니다. (${next.length}/${compareStoreConfig.max})`);
                }}
              >
                비교 담기
              </Button>
              <Link href="/products/compare" className="inline-flex h-10 items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700">
                비교 페이지로 이동
              </Link>
              {compareMessage ? <p className="text-xs text-slate-600">{compareMessage}</p> : null}
            </div>
          </Card>
        ) : null}
      </Container>
    </main>
  );
}
