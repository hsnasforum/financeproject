"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { type FinlifeKind, type FinlifeSourceResult, type NormalizedProduct } from "@/lib/finlife/types";
import { parseFinlifeApiResponse } from "@/lib/finlife/apiSchema";
import { scoreProducts, type RecommendProfile } from "@/lib/recommend/score";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/ui/LoadingState";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { ProviderChips } from "@/components/ui/ProviderChips";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterField } from "@/components/ui/FilterField";

type KindTab = FinlifeKind | "all";

interface ProductWithKind extends NormalizedProduct {
  kind: FinlifeKind;
}

export function RecommendHubClient() {
  const [activeTab, setActiveTab] = useState<KindTab>("all");
  const [selectedProviderId, setSelectedProviderId] = useState<string>("전체");

  const [savingTerms, setSavingTerms] = useState("12,24");
  const [savingLiquidity, setSavingLiquidity] = useState<RecommendProfile["liquidityNeed"]>("medium");
  const [savingRate, setSavingRate] = useState<RecommendProfile["ratePreference"]>("balanced");

  const [loanTerms, setLoanTerms] = useState("12,24,36");
  const [loanPurpose, setLoanPurpose] = useState("주택구입");

  const [allProducts, setProducts] = useState<ProductWithKind[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const endpoints = [
        "/api/finlife/deposit?topFinGrpNo=020000",
        "/api/finlife/saving?topFinGrpNo=020000",
        "/api/finlife/mortgage-loan?topFinGrpNo=020000",
        "/api/finlife/rent-house-loan?topFinGrpNo=020000",
        "/api/finlife/credit-loan?topFinGrpNo=020000",
      ];

      const responses = await Promise.all(endpoints.map(url => fetch(url)));
      const jsons = await Promise.all(responses.map(r => r.json()));

      const merged: ProductWithKind[] = [];
      jsons.forEach(json => {
        const parsed = parseFinlifeApiResponse(json) as FinlifeSourceResult;
        if (parsed.data) {
          const kind = parsed.meta.kind;
          merged.push(...parsed.data.map(p => ({ ...p, kind })));
        }
      });

      setProducts(merged);
    } catch {
      setError("금융상품 정보를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredByTab = useMemo(() => {
    if (activeTab === "all") return allProducts;
    return allProducts.filter(p => p.kind === activeTab);
  }, [allProducts, activeTab]);

  const providers = useMemo(() => {
    const set = new Set<string>();
    filteredByTab.forEach(p => set.add(p.kor_co_nm || "미상"));
    const names = ["전체", ...Array.from(set).sort()];
    return names.map(name => ({ id: name, name }));
  }, [filteredByTab]);

  const finalResults = useMemo(() => {
    let base = filteredByTab;
    if (selectedProviderId !== "전체") {
      base = base.filter(p => p.kor_co_nm === selectedProviderId);
    }

    const profile: RecommendProfile = {
      purpose: activeTab.includes("loan") ? loanPurpose : "목돈마련",
      preferredTerms: (activeTab.includes("loan") ? loanTerms : savingTerms).split(",").map(s => s.trim()).filter(Boolean),
      liquidityNeed: savingLiquidity,
      ratePreference: savingRate,
      topN: 20
    };

    return scoreProducts(base, profile);
  }, [activeTab, filteredByTab, selectedProviderId, loanPurpose, loanTerms, savingTerms, savingLiquidity, savingRate]);

  return (
    <main className="min-h-screen bg-slate-50 py-8 md:py-12">
      <Container>
        <PageHeader
          title="추천 허브"
          description="모든 금융상품을 실시간으로 분석하여 최적의 선택을 제안합니다."
        />

        <div className="mb-8 space-y-6">
          <SegmentedTabs
            options={[
              { id: "all", label: "전체" },
              { id: "deposit", label: "예금" },
              { id: "saving", label: "적금" },
              { id: "mortgage-loan", label: "주택담보" },
              { id: "rent-house-loan", label: "전세자금" },
              { id: "credit-loan", label: "개인신용" },
            ]}
            activeTab={activeTab}
            onChange={(id) => {
              setActiveTab(id as KindTab);
              setSelectedProviderId("전체");
            }}
          />

          <Card className="rounded-[2.5rem] border-slate-200/60 p-8 shadow-sm">
            <div className="space-y-8">
              <section>
                <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">금융 기관</p>
                <ProviderChips
                  providers={providers}
                  selectedId={selectedProviderId}
                  onSelect={setSelectedProviderId}
                />
              </section>

              <div className="h-px bg-slate-100" />

              <section>
                <p className="mb-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {activeTab.includes("loan") ? "대출 선호 조건" : "저축 선호 조건"}
                </p>

                {activeTab.includes("loan") ? (
                  <div className="grid gap-6 sm:grid-cols-2">
                    <FilterField
                      label="대출 기간(개월)"
                      labelPosition="vertical"
                      value={loanTerms}
                      onChange={(e) => setLoanTerms(e.target.value)}
                      placeholder="예: 12,24,36"
                      className="h-11 rounded-2xl"
                    />
                    <FilterSelect
                      label="대출 목적"
                      labelPosition="vertical"
                      size="md"
                      value={loanPurpose}
                      onChange={(e) => setLoanPurpose(e.target.value)}
                    >
                      <option value="주택구입">주택 구입</option>
                      <option value="생활안정">생활 안정</option>
                      <option value="사업자금">사업 자금</option>
                    </FilterSelect>
                  </div>
                ) : (
                  <div className="grid gap-6 sm:grid-cols-3">
                    <FilterField
                      label="저축 기간(개월)"
                      labelPosition="vertical"
                      value={savingTerms}
                      onChange={(e) => setSavingTerms(e.target.value)}
                      placeholder="예: 12,24"
                      className="h-11 rounded-2xl"
                    />
                    <FilterSelect
                      label="유동성 필요도"
                      labelPosition="vertical"
                      size="md"
                      value={savingLiquidity}
                      onChange={(e) => setSavingLiquidity(e.target.value as RecommendProfile["liquidityNeed"])}
                    >
                      <option value="low">낮음</option>
                      <option value="medium">보통</option>
                      <option value="high">높음</option>
                    </FilterSelect>
                    <FilterSelect
                      label="금리 성향"
                      labelPosition="vertical"
                      size="md"
                      value={savingRate}
                      onChange={(e) => setSavingRate(e.target.value as RecommendProfile["ratePreference"])}
                    >
                      <option value="balanced">안정(균형)</option>
                      <option value="aggressive">수익(최고금리)</option>
                    </FilterSelect>
                  </div>
                )}
              </section>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">분석 결과 <span className="ml-1 text-emerald-600">{finalResults.length}</span></h2>
            <Button variant="ghost" size="sm" className="rounded-full text-slate-400 font-bold" onClick={() => void loadData()}>실시간 갱신</Button>
          </div>

          {loading ? (
            <LoadingState description="최적의 금융상품을 분석하고 있습니다." />
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2.5rem] border border-slate-200">
              <p className="text-sm font-bold text-slate-400">{error}</p>
              <Button variant="ghost" className="mt-4 text-xs font-bold text-red-600 hover:bg-red-100" onClick={() => setError("")}>오류 메시지 닫기</Button>
            </div>
          ) : finalResults.length === 0 ? (
            <Card className="flex h-64 items-center justify-center rounded-[2.5rem] border-slate-200 shadow-sm">
              <p className="text-sm font-bold text-slate-400">조건에 맞는 상품이 없습니다.</p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {finalResults.map((res) => (
                <Card key={res.product.fin_prdt_cd + res.product.kor_co_nm} className="group flex flex-col rounded-[2.5rem] border-slate-200/60 bg-white p-6 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="relative h-8 w-8 overflow-hidden rounded-full border border-slate-100 bg-slate-50">
                      <Image src={`/logos/${res.product.kor_co_nm}.png`} alt="" fill className="object-contain p-1" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">{res.product.kor_co_nm}</span>
                    <Badge variant="secondary" className="ml-auto text-[9px] font-bold px-2 py-0 border-none bg-slate-100 text-slate-500 uppercase">
                      {(res.product as ProductWithKind).kind}
                    </Badge>
                  </div>

                  <h3 className="text-base font-black text-slate-900 group-hover:text-emerald-600 transition-colors line-clamp-1 mb-2">
                    {res.product.fin_prdt_nm}
                  </h3>

                  <div className="mt-auto space-y-4 pt-4 border-t border-slate-50">
                    <div className="flex items-end justify-between">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">최고 금리</p>
                        <p className="text-xl font-black text-emerald-600 tabular-nums">{res.explain.pickedOption.intr_rate2}%</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">적합도</p>
                        <p className="text-lg font-black text-slate-700 tabular-nums">{res.explain.finalPoints.toFixed(1)}<span className="text-xs text-slate-300">/10</span></p>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full rounded-2xl h-10 text-xs font-bold bg-slate-50/50 border-slate-100 hover:bg-emerald-50 hover:border-emerald-100 hover:text-emerald-700">
                      상세 분석 보기
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Container>
    </main>
  );
}
