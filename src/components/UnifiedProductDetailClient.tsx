"use client";

import { useEffect, useMemo, useState } from "react";
import { addCompareIdToStorage, compareStoreConfig } from "@/lib/products/compareStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";

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
    if (item?.signals?.depositProtection) rows.push(`예금자보호: ${item.signals.depositProtection === "matched" ? "보호 대상" : "별도 확인 필요"}`);
    return rows;
  }, [item, selectedOption]);

  return (
    <PageShell>
      <PageHeader
        title={item?.productName ?? "상품 상세"}
        description={item?.providerName ?? "금융상품 통합 상세 정보를 확인합니다."}
        action={
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black text-slate-400 uppercase tracking-widest tabular-nums">
              ID: {id.slice(0, 12)}...
            </span>
          </div>
        }
      />

      <div className="space-y-6">
        {loading ? (
          <div className="py-20">
            <LoadingState title="상품 정보를 불러오는 중입니다" />
          </div>
        ) : error ? (
          <EmptyState
            title="상품을 찾을 수 없습니다"
            description={error}
            icon="search"
            actionLabel="목록으로 이동"
            onAction={() => window.location.href = "/products/catalog"}
          />
        ) : item ? (
          <>
            <Card className="rounded-[2.5rem] p-8 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 mb-6">
                <span className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">{item.kind}</span>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Source: {(item.sourceIds ?? [item.sourceId]).join(", ")}</span>
                {(item.badges ?? []).map((badge) => (
                  <span key={`${item.stableId}-${badge}`} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">{badge}</span>
                ))}
              </div>

              <div className="grid gap-8 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-8">
                  <div className="space-y-4">
                    <SubSectionHeader title="금리 및 기간 옵션" description="가장 유리한 조건을 선택하여 비교해 보세요." />
                    {options.length > 0 ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">기간 선택</label>
                          <select
                            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 text-sm font-bold text-slate-700 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all"
                            value={selectedOptionValue}
                            onChange={(event) => setSelectedOptionKey(event.target.value)}
                          >
                            {options.map((option, index) => {
                              const key = optionKey(option, index);
                              return (
                                <option key={key} value={key}>
                                  {optionLabel(option)} ({option.sourceId ?? "-"})
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <div className="flex gap-4">
                          <div className="flex-1 rounded-2xl bg-emerald-50 p-4 border border-emerald-100">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">적용 금리</p>
                            <p className="mt-2 text-2xl font-black text-emerald-700 tabular-nums">{formatRate(appliedRate)}</p>
                          </div>
                          <div className="flex-1 rounded-2xl bg-slate-50 p-4 border border-slate-100">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">기본 / 최고</p>
                            <p className="mt-2 text-base font-black text-slate-700 tabular-nums">{formatRate(baseRate)} / {formatRate(maxRate)}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
                        <p className="text-sm font-bold text-slate-400">제공된 기간 옵션 정보가 없습니다.</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <SubSectionHeader title="우대 및 유의사항" />
                    <div className="rounded-[2rem] border border-slate-100 bg-slate-50/30 p-6 lg:p-8">
                      {conditions.length > 0 ? (
                        <ul className="space-y-4">
                          {conditions.map((row, index) => (
                            <li key={`${item.stableId}-condition-${index}`} className="flex items-start gap-3">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                              <p className="text-sm font-medium leading-relaxed text-slate-700">{row}</p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm font-bold text-slate-400 italic text-center py-4">공시된 우대조건 정보가 아직 없습니다.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <Card className="rounded-[2rem] p-8 shadow-sm border border-slate-100 bg-slate-50/50">
                    <SubSectionHeader
                      title="비교 및 저장"
                      description="상품을 비교함에 담고 나중에 다시 확인하세요."
                    />
                    <div className="mt-8 space-y-4">
                      <Button
                        variant="primary"
                        className="w-full h-14 rounded-2xl font-black shadow-lg shadow-emerald-900/20"
                        onClick={() => {
                          const next = addCompareIdToStorage(item.stableId || id, compareStoreConfig.max);
                          setCompareMessage(`비교함에 추가됨 (${next.length}/${compareStoreConfig.max})`);
                        }}
                      >
                        상품 비교함에 담기
                      </Button>
                      <Link href="/products/compare" className="block">
                        <Button variant="outline" className="w-full h-12 rounded-2xl border-slate-200 bg-white font-black text-slate-700 hover:bg-slate-100">
                          비교함 페이지로 이동
                        </Button>
                      </Link>
                      {compareMessage && (
                        <p className="text-center text-xs font-black text-emerald-600 animate-in fade-in slide-in-from-top-1">{compareMessage}</p>
                      )}
                    </div>
                  </Card>

                  <div className="rounded-[2rem] border border-slate-100 bg-white p-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">데이터 정보</p>
                    <dl className="space-y-3 text-[11px] font-bold">
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Stable ID</dt>
                        <dd className="font-mono text-slate-600">{item.stableId.slice(0, 16)}...</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">최종 갱신</dt>
                        <dd className="text-slate-600 tabular-nums">{formatDateTime(item.updatedAt ?? generatedAt)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}

import Link from "next/link";
