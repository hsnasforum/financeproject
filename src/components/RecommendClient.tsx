"use client";

import { useState } from "react";
import { scoreProducts, type RecommendProfile, type ScoredProduct } from "@/lib/recommend/score";
import { type FinlifeSourceResult, type NormalizedProduct } from "@/lib/finlife/types";
import { parseFinlifeApiResponse } from "@/lib/finlife/apiSchema";
import { uiTextKo } from "@/lib/uiText.ko";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function RecommendClient() {
  const [preferredTermsText, setPreferredTermsText] = useState("12,24");
  const [liquidityNeed, setLiquidityNeed] = useState<RecommendProfile["liquidityNeed"]>("medium");
  const [ratePreference, setRatePreference] = useState<RecommendProfile["ratePreference"]>("balanced");
  const [purpose, setPurpose] = useState("목돈 마련");
  const [results, setResults] = useState<ScoredProduct[]>([]);
  const [sourceMode, setSourceMode] = useState<string>("-");
  const [isLoading, setIsLoading] = useState(false);

  function toModeLabel(mode: string): string {
    if (mode === "mock") return "모의";
    if (mode === "live") return "실시간";
    return mode;
  }

  async function onSubmit() {
    setIsLoading(true);
    try {
      const [depRes, savRes] = await Promise.all([
        fetch("/api/finlife/deposit?topFinGrpNo=020000&pageNo=1"),
        fetch("/api/finlife/saving?topFinGrpNo=020000&pageNo=1"),
      ]);

      const dep = parseFinlifeApiResponse(await depRes.json()) as FinlifeSourceResult;
      const sav = parseFinlifeApiResponse(await savRes.json()) as FinlifeSourceResult;
      const products: NormalizedProduct[] = [...(dep.data ?? []), ...(sav.data ?? [])];

      const profile: RecommendProfile = {
        purpose,
        preferredTerms: preferredTermsText
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        liquidityNeed,
        ratePreference,
        topN: 5,
      };

      setSourceMode(`${toModeLabel(dep.mode)}/${toModeLabel(sav.mode)}`);
      setResults(scoreProducts(products, profile));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="py-10 bg-background min-h-screen">
      <Container>
        <SectionHeader 
          title="맞춤형 상품 추천" 
          subtitle="고객님의 투자 성향과 목적에 가장 적합한 금융상품을 추천해드립니다."
          className="mb-8"
        />

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-6">
            <Card className="p-0 overflow-hidden border-none shadow-md">
              <div className="bg-primary px-6 py-4 text-white">
                <h3 className="font-bold">내 프로필 설정</h3>
                <p className="text-xs text-primary-foreground/80 mt-1">정확한 추천을 위해 정보를 입력해주세요.</p>
              </div>
              <div className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">저축 목적</label>
                  <input 
                    className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all" 
                    value={purpose} 
                    onChange={(e) => setPurpose(e.target.value)} 
                    placeholder="예: 내 집 마련, 결혼 자금" 
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">선호 기간 (개월)</label>
                  <input
                    className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    value={preferredTermsText}
                    onChange={(e) => setPreferredTermsText(e.target.value)}
                    placeholder="예: 12, 24, 36"
                  />
                  <p className="text-[10px] text-slate-400 italic">콤마(,)로 구분하여 입력하세요.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">자금 유동성 필요도</label>
                  <select 
                    className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none" 
                    value={liquidityNeed} 
                    onChange={(e) => setLiquidityNeed(e.target.value as RecommendProfile["liquidityNeed"])}
                  >
                    <option value="low">낮음 (장기 투자 가능)</option>
                    <option value="medium">보통 (일반적)</option>
                    <option value="high">높음 (언제든 인출 필요)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">금리 선호도</label>
                  <select 
                    className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none" 
                    value={ratePreference} 
                    onChange={(e) => setRatePreference(e.target.value as RecommendProfile["ratePreference"])}
                  >
                    <option value="balanced">안정 추구 (균형)</option>
                    <option value="aggressive">수익 추구 (높은 금리)</option>
                  </select>
                </div>

                <Button 
                  variant="primary" 
                  size="lg" 
                  className="w-full shadow-lg shadow-primary/20 mt-4" 
                  onClick={() => void onSubmit()}
                  disabled={isLoading}
                >
                  {isLoading ? "분석 중..." : "추천 결과 보기"}
                </Button>
                
                <p className="text-[10px] text-center text-slate-400">
                   {uiTextKo.recommend.dataMode}: <span className="font-bold">{sourceMode}</span>
                </p>
              </div>
            </Card>

            <Card className="bg-slate-50 border-dashed border-2 border-slate-200">
               <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-2">
                 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                 {uiTextKo.recommend.scoreHelpTitle}
               </h4>
               <ul className="space-y-2">
                {uiTextKo.recommend.scoreHelpBody.slice(0, 3).map((line, i) => (
                  <li key={i} className="text-[11px] text-slate-600 leading-relaxed flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">•</span>
                    {line}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-dashed border-slate-300">
                <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a2 2 0 0 0-2-2l-7 7v11h12a2 2 0 0 0 2-2l1-6.5a2 2 0 0 0-2-2.5z"/><path d="M7 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900">맞춤 상품을 찾아보세요</h3>
                <p className="text-slate-500 mt-2 max-w-sm">좌측 폼에 고객님의 정보를 입력하고 추천 버튼을 눌러주세요.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                   <h3 className="text-lg font-bold text-slate-900">추천 순위 TOP {results.length}</h3>
                   <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider">상대 평가 기반</Badge>
                </div>
                
                {results.map((row, idx) => (
                  <Card key={row.product.fin_prdt_cd} className={`p-0 overflow-hidden transition-all hover:ring-2 hover:ring-primary/20 ${idx === 0 ? "border-primary/30 ring-1 ring-primary/10" : ""}`}>
                    <div className="flex flex-col sm:flex-row items-stretch">
                      <div className="flex-1 p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${idx === 0 ? "bg-primary text-white" : "bg-slate-200 text-slate-600"}`}>
                            {idx + 1}
                          </span>
                          <Badge variant="secondary" className="bg-slate-100 text-slate-600">{row.product.kor_co_nm}</Badge>
                        </div>
                        
                        <h2 className="text-xl font-bold text-slate-900 mb-2">{row.product.fin_prdt_nm ?? row.product.fin_prdt_cd}</h2>
                        
                        <div className="flex flex-wrap gap-4 mt-6">
                          <div>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">최적 옵션</p>
                             <p className="text-sm font-bold text-slate-900">{row.explain.pickedOption.save_trm ?? "-"}개월 / {row.explain.pickedOption.intr_rate2 ?? "-"}%</p>
                          </div>
                          <div>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">데이터 원천</p>
                             <p className="text-sm font-bold text-slate-900">{row.product.fin_prdt_cd.startsWith("DEPOSIT") ? "예금" : "적금"}</p>
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-50">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">적합도 분석</p>
                           <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-slate-500">금리</span>
                                  <span className="font-bold text-slate-700">{row.explain.contributions.ratePoints.toFixed(1)}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(row.explain.contributions.ratePoints / 4) * 100}%` }} />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-slate-500">기간</span>
                                  <span className="font-bold text-slate-700">{row.explain.contributions.termPoints.toFixed(1)}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(row.explain.contributions.termPoints / 3) * 100}%` }} />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-slate-500">유동성</span>
                                  <span className="font-bold text-slate-700">{row.explain.contributions.liquidityPoints.toFixed(1)}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(row.explain.contributions.liquidityPoints / 3) * 100}%` }} />
                                </div>
                              </div>
                           </div>
                        </div>
                      </div>

                      <div className="w-full sm:w-32 bg-slate-50 border-t sm:border-t-0 sm:border-l border-slate-100 flex flex-col items-center justify-center p-6 text-center">
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">매칭 점수</p>
                         <p className="text-3xl font-black text-primary tabular-nums">
                           {row.explain.finalPoints.toFixed(1)}
                         </p>
                         <p className="text-[10px] font-bold text-slate-400 mt-1">/ 10.0</p>
                      </div>
                    </div>
                    
                    <div className="bg-slate-900 p-3 px-6 text-[10px] text-slate-400">
                      <p className="line-clamp-1 italic">
                        <span className="text-slate-500 font-bold mr-2">NOTICE</span>
                        {row.explain.assumptions.note}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </Container>
    </main>
  );
}
