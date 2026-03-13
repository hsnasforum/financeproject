"use client";

import { useState } from "react";
import { scoreProducts, type RecommendProfile, type ScoredProduct } from "@/lib/recommend/score";
import { type FinlifeSourceResult, type NormalizedProduct } from "@/lib/finlife/types";
import { parseFinlifeApiResponse } from "@/lib/finlife/apiSchema";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AssumptionsCallout } from "@/components/ui/AssumptionsCallout";
import { cn } from "@/lib/utils";

export function RecommendClient() {
  const [preferredTermsText, setPreferredTermsText] = useState("12,24");
  const [liquidityNeed, setLiquidityNeed] = useState<RecommendProfile["liquidityNeed"]>("medium");
  const [ratePreference, setRatePreference] = useState<RecommendProfile["ratePreference"]>("balanced");
  const [purpose, setPurpose] = useState("목돈 마련");
  const [results, setResults] = useState<ScoredProduct[]>([]);
  const [sourceMode, setSourceMode] = useState<string>("-");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

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
        topN: 10,
      };

      setSourceMode(`${toModeLabel(dep.mode)}/${toModeLabel(sav.mode)}`);
      setResults(scoreProducts(products, profile));
      setStep(3);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <PageShell className="bg-surface-muted">
      <PageHeader 
        title="맞춤형 상품 추천" 
        description="고객님의 투자 성향과 목적에 가장 적합한 금융상품을 추천해드립니다."
      />

      <div className="max-w-4xl mx-auto space-y-8">
        {/* Step Navigation */}
        <div className="flex items-center justify-between relative px-4">
          <div className="absolute left-0 top-1/2 w-full h-px bg-border -z-10" />
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex flex-col items-center gap-2 bg-surface-muted px-2">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors",
                step === s ? "bg-primary text-white ring-4 ring-primary/20" : 
                step > s ? "bg-emerald-100 text-emerald-700" : "bg-surface border border-border text-slate-400"
              )}>
                {step > s ? "✓" : s}
              </div>
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-widest",
                step === s ? "text-primary" : step > s ? "text-emerald-700" : "text-slate-400"
              )}>
                {s === 1 ? "목적 설정" : s === 2 ? "상세 조건" : "추천 결과"}
              </span>
            </div>
          ))}
        </div>

        {/* Step 1: Purpose */}
        {step === 1 && (
          <Card className="p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">어떤 목적으로 저축하시나요?</h2>
            <div className="max-w-md mx-auto space-y-6">
              <input 
                className="w-full h-14 rounded-2xl border border-border bg-surface px-6 text-center text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm" 
                value={purpose} 
                onChange={(e) => setPurpose(e.target.value)} 
                placeholder="예: 내 집 마련, 결혼 자금, 비상금" 
              />
              <div className="flex flex-wrap justify-center gap-2">
                {["목돈 마련", "비상금", "결혼 자금", "여행 자금"].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setPurpose(preset)}
                    className="px-4 py-2 rounded-full border border-border text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <Button 
                variant="primary" 
                size="lg" 
                className="w-full h-14 rounded-full text-lg shadow-card" 
                onClick={() => setStep(2)}
                disabled={!purpose.trim()}
              >
                다음 단계로
              </Button>
            </div>
          </Card>
        )}

        {/* Step 2: Preferences */}
        {step === 2 && (
          <Card className="p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-border/50">
              <h2 className="text-xl font-bold text-slate-900">상세 선호 조건</h2>
              <button onClick={() => setStep(1)} className="text-sm font-bold text-slate-400 hover:text-primary transition-colors">← 이전으로</button>
            </div>
            
            <div className="grid gap-8 md:grid-cols-2 max-w-3xl mx-auto">
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">선호 기간 (개월)</label>
                <input
                  className="w-full h-12 rounded-xl border border-border bg-surface px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                  value={preferredTermsText}
                  onChange={(e) => setPreferredTermsText(e.target.value)}
                  placeholder="예: 12, 24, 36"
                />
                <p className="text-[10px] text-slate-400 italic">콤마(,)로 구분하여 입력하세요.</p>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">자금 유동성 필요도</label>
                <select 
                  className="w-full h-12 rounded-xl border border-border bg-surface px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none shadow-sm cursor-pointer" 
                  value={liquidityNeed} 
                  onChange={(e) => setLiquidityNeed(e.target.value as RecommendProfile["liquidityNeed"])}
                >
                  <option value="low">낮음 (장기 예치 가능)</option>
                  <option value="medium">보통 (일반적)</option>
                  <option value="high">높음 (언제든 인출 필요)</option>
                </select>
              </div>

              <div className="space-y-3 md:col-span-2 max-w-md mx-auto w-full">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block text-center">금리 선호도</label>
                <div className="grid grid-cols-2 gap-3 p-1.5 bg-surface-muted rounded-2xl border border-border">
                  <button
                    onClick={() => setRatePreference("balanced")}
                    className={cn(
                      "py-3 rounded-xl text-sm font-bold transition-all",
                      ratePreference === "balanced" ? "bg-surface shadow-sm text-primary" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    안정 추구 (균형)
                  </button>
                  <button
                    onClick={() => setRatePreference("aggressive")}
                    className={cn(
                      "py-3 rounded-xl text-sm font-bold transition-all",
                      ratePreference === "aggressive" ? "bg-surface shadow-sm text-primary" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    수익 추구 (최고 금리)
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-10 max-w-md mx-auto">
              <Button 
                variant="primary" 
                size="lg" 
                className="w-full h-14 rounded-full text-lg shadow-card hover:shadow-card-hover transition-all" 
                onClick={() => void onSubmit()}
                disabled={isLoading}
              >
                {isLoading ? "AI 분석 중..." : "최적 상품 추천받기"}
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Results */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">AI 추천 결과</h2>
              <button onClick={() => setStep(2)} className="text-sm font-bold text-slate-400 hover:text-primary transition-colors">조건 재설정</button>
            </div>

            <AssumptionsCallout title="추천 근거 요약">
              <p>
                <strong>{purpose}</strong> 목적으로 입력하신 조건(기간 <strong>{preferredTermsText}</strong>개월, 
                유동성 <strong>{liquidityNeed === 'low' ? '낮음' : liquidityNeed === 'medium' ? '보통' : '높음'}</strong>, 
                성향 <strong>{ratePreference === 'balanced' ? '안정 추구' : '수익 추구'}</strong>)을 
                바탕으로 전체 상품을 분석한 결과입니다. 데이터 기준: {sourceMode}
              </p>
            </AssumptionsCallout>

            {results.length === 0 ? (
               <div className="py-20 text-center bg-surface rounded-2xl border border-border shadow-sm">
                 <p className="text-slate-500 font-bold">조건에 맞는 상품을 찾지 못했습니다.</p>
               </div>
            ) : (
               <div className="space-y-6">
                 {/* Top 3 Cards */}
                 <div className="grid gap-6 md:grid-cols-3">
                   {results.slice(0, 3).map((row, idx) => (
                     <Card key={row.product.fin_prdt_cd} className={cn(
                       "relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300",
                       idx === 0 ? "border-primary/30 ring-2 ring-primary/20 shadow-lg shadow-primary/10" : ""
                     )}>
                       {idx === 0 && <div className="absolute top-0 right-0 bg-primary text-white text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-widest z-10">Best Match</div>}
                       <div className="flex items-center gap-3 mb-4">
                         <div className={cn(
                           "flex h-8 w-8 items-center justify-center rounded-full text-xs font-black",
                           idx === 0 ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
                         )}>
                           {idx + 1}
                         </div>
                         <p className="text-xs font-bold text-slate-500">{row.product.kor_co_nm}</p>
                       </div>
                       
                       <h3 className="text-lg font-black text-slate-900 leading-tight mb-6 line-clamp-2 h-11">
                         {row.product.fin_prdt_nm}
                       </h3>
                       
                       <div className="flex items-end justify-between border-t border-border/50 pt-4">
                         <div>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">최적 금리</p>
                           <p className="text-2xl font-black text-emerald-600 tabular-nums">{row.explain.pickedOption.intr_rate2}%</p>
                         </div>
                         <div className="text-right">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">적합도</p>
                           <p className="text-lg font-black text-slate-700 tabular-nums">{row.explain.finalPoints.toFixed(1)}<span className="text-xs text-slate-400">/10</span></p>
                         </div>
                       </div>
                     </Card>
                   ))}
                 </div>

                 {/* Remaining List */}
                 {results.length > 3 && (
                   <Card className="p-0 overflow-hidden border-border/50 shadow-sm">
                     <div className="bg-surface-muted px-6 py-4 border-b border-border/50 flex items-center justify-between">
                       <h3 className="font-bold text-sm text-slate-700 uppercase tracking-widest">차순위 추천 상품</h3>
                     </div>
                     <div className="divide-y divide-border/50">
                       {results.slice(3).map((row, idx) => (
                         <div key={row.product.fin_prdt_cd} className="flex items-center gap-4 p-4 px-6 hover:bg-slate-50 transition-colors">
                           <span className="w-6 text-center text-sm font-bold text-slate-400">{idx + 4}</span>
                           <div className="flex-1 min-w-0">
                             <div className="flex items-center gap-2">
                               <span className="text-[10px] font-bold text-slate-500">{row.product.kor_co_nm}</span>
                             </div>
                             <p className="font-bold text-slate-900 truncate">{row.product.fin_prdt_nm}</p>
                           </div>
                           <div className="text-right whitespace-nowrap">
                             <p className="text-[10px] text-slate-400 font-bold mb-0.5">{row.explain.pickedOption.save_trm}개월 최고</p>
                             <p className="font-black text-emerald-600 tabular-nums">{row.explain.pickedOption.intr_rate2}%</p>
                           </div>
                           <div className="w-16 text-right hidden sm:block">
                              <Badge variant="outline" className="text-[10px] font-bold">{row.explain.finalPoints.toFixed(1)}점</Badge>
                           </div>
                         </div>
                       ))}
                     </div>
                   </Card>
                 )}

                 <div className="flex justify-center mt-10">
                   <Button variant="outline" className="rounded-full px-8 bg-surface shadow-sm h-12 text-sm font-bold" onClick={() => window.open('/products/compare', '_blank')}>
                     추천 상품들 비교함 담기
                   </Button>
                 </div>
               </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
