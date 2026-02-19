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

export function RecommendClient() {
  const [preferredTermsText, setPreferredTermsText] = useState("12,24");
  const [liquidityNeed, setLiquidityNeed] = useState<RecommendProfile["liquidityNeed"]>("medium");
  const [ratePreference, setRatePreference] = useState<RecommendProfile["ratePreference"]>("balanced");
  const [purpose, setPurpose] = useState("목돈 마련");
  const [results, setResults] = useState<ScoredProduct[]>([]);
  const [sourceMode, setSourceMode] = useState<string>("-");

  function toModeLabel(mode: string): string {
    if (mode === "mock") return "모의";
    if (mode === "live") return "실시간";
    return mode;
  }

  async function onSubmit() {
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
  }

  return (
    <main className="py-8">
      <Container>
        <SectionHeader title="프로필 기반 추천" subtitle="점수는 후보군 내 상대평가이며 가정 기반입니다." />

        <Card className="bg-surface-muted">
          <details className="text-sm text-slate-700">
            <summary className="cursor-pointer font-semibold">{uiTextKo.recommend.scoreHelpTitle}</summary>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {uiTextKo.recommend.scoreHelpBody.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        </Card>

        <Card className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="h-10 rounded-xl border border-border px-3 py-2" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="목적" />
            <input
              className="h-10 rounded-xl border border-border px-3 py-2"
              value={preferredTermsText}
              onChange={(e) => setPreferredTermsText(e.target.value)}
              placeholder="선호기간 (예: 12,24)"
            />
            <select className="h-10 rounded-xl border border-border px-3 py-2" value={liquidityNeed} onChange={(e) => setLiquidityNeed(e.target.value as RecommendProfile["liquidityNeed"])}>
              <option value="low">유동성 낮음</option>
              <option value="medium">유동성 보통</option>
              <option value="high">유동성 높음</option>
            </select>
            <select className="h-10 rounded-xl border border-border px-3 py-2" value={ratePreference} onChange={(e) => setRatePreference(e.target.value as RecommendProfile["ratePreference"])}>
              <option value="balanced">금리 선호 보통</option>
              <option value="aggressive">금리 선호 높음</option>
            </select>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => void onSubmit()}>{uiTextKo.recommend.calc}</Button>
            <p className="text-sm text-slate-600">{uiTextKo.recommend.dataMode}: {sourceMode}</p>
          </div>
        </Card>

        <div className="mt-4 grid gap-4">
          {results.map((row) => (
            <Card key={row.product.fin_prdt_cd}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{row.product.fin_prdt_nm ?? row.product.fin_prdt_cd}</h2>
                  <p className="text-sm text-slate-600">{row.product.kor_co_nm}</p>
                </div>
                <div className="rounded-xl bg-surface-muted px-3 py-2 text-right">
                  <p className="text-xs text-slate-500">최종점수</p>
                  <p className="text-xl font-semibold text-primary">{row.explain.finalPoints.toFixed(1)}점</p>
                </div>
              </div>
              <p className="mt-2 text-sm">
                {uiTextKo.recommend.breakdownLabel}: {uiTextKo.recommend.contribRate} {row.explain.contributions.ratePoints.toFixed(1)}점 +{" "}
                {uiTextKo.recommend.contribTerm} {row.explain.contributions.termPoints.toFixed(1)}점 + {uiTextKo.recommend.contribLiq} {" "}
                {row.explain.contributions.liquidityPoints.toFixed(1)}점 = {row.explain.finalPoints.toFixed(1)}점
              </p>
              <p className="text-xs text-slate-500">
                {uiTextKo.recommend.weights}: 금리 {(row.explain.weights.rate * 100).toFixed(0)}% · 기간 {(row.explain.weights.term * 100).toFixed(0)}% · 유동성 {(row.explain.weights.liquidity * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-slate-500">
                {uiTextKo.recommend.pickedOptionLabel}: {row.explain.pickedOption.save_trm ?? "-"}개월 · 최고금리 {row.explain.pickedOption.intr_rate2 ?? "-"}%
              </p>
              <p className="text-xs text-slate-500">{row.explain.assumptions.note}</p>
            </Card>
          ))}
        </div>
      </Container>
    </main>
  );
}
