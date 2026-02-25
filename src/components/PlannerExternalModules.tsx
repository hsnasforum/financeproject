"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RegionSelector } from "@/components/housing/RegionSelector";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatAreaWithPyeong, formatKrwWithEok } from "@/lib/format/krw";
import { findSidoByLawdCd } from "@/lib/housing/lawdRegions";

type HousingBenchmark = {
  regionCode: string;
  month: string;
  areaBand: string;
  dealType: "SALE" | "RENT";
  rentType?: "JEONSE" | "WOLSE" | "ALL";
  count: number;
  min: number;
  median: number;
  p75: number;
  max: number;
  monthlyMin?: number;
  monthlyMedian?: number;
  monthlyP75?: number;
  monthlyMax?: number;
  unit: string;
  source: string;
};

type PlannerAssumptions = {
  fx?: {
    asOf: string;
    base: "KRW";
    rates: Record<string, number>;
  };
};

const AREA_PRESETS = [59, 84, 114];

function currentYyyyMm() {
  const now = new Date();
  now.setDate(1);
  now.setMonth(now.getMonth() - 1);
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

function parseNumberInput(value: string): number {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function describeDiff(current: number, benchmark: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(benchmark) || benchmark <= 0) return "비교를 위해 입력값을 확인해 주세요.";
  const diff = current - benchmark;
  const sign = diff > 0 ? "+" : "";
  const pct = (diff / benchmark) * 100;
  return `차이: ${sign}${formatKrwWithEok(diff)} (중앙값 대비 ${pct.toFixed(1)}%)`;
}

export function PlannerExternalModules() {
  const [regionCode, setRegionCode] = useState("11680");
  const [month, setMonth] = useState(currentYyyyMm());
  const [areaM2, setAreaM2] = useState(84);
  const [goalAmount, setGoalAmount] = useState(900000000);
  const [housing, setHousing] = useState<HousingBenchmark | null>(null);
  const [housingError, setHousingError] = useState("");
  const [housingLoading, setHousingLoading] = useState(false);
  const [rentType, setRentType] = useState<"all" | "jeonse" | "wolse">("all");
  const [rent, setRent] = useState<HousingBenchmark | null>(null);
  const [rentError, setRentError] = useState("");
  const [rentLoading, setRentLoading] = useState(false);
  const [currentJeonseDeposit, setCurrentJeonseDeposit] = useState(0);
  const [currentMonthlyRent, setCurrentMonthlyRent] = useState(0);

  const [assumptions, setAssumptions] = useState<PlannerAssumptions | null>(null);
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [foreignAmount, setForeignAmount] = useState(1000);
  const [assumptionNotes, setAssumptionNotes] = useState<string[]>([]);
  const [benefitCount, setBenefitCount] = useState<number | null>(null);
  const [subscriptionCount, setSubscriptionCount] = useState<number | null>(null);

  const selectedRegionName = useMemo(() => {
    const found = findSidoByLawdCd(regionCode);
    return found ? `${found.sidoName} ${found.sigunguName}` : `코드 ${regionCode}`;
  }, [regionCode]);

  useEffect(() => {
    let aborted = false;

    async function loadEvidence() {
      try {
        const [assumptionRes, benefitRes, subscriptionRes] = await Promise.all([
          fetch("/api/planner/assumptions", { cache: "no-store" }),
          fetch("/api/public/benefits/search?query=%EC%A3%BC%EA%B1%B0", { cache: "no-store" }),
          fetch("/api/public/housing/subscription?region=%EC%84%9C%EC%9A%B8", { cache: "no-store" }),
        ]);

        const assumptionJson = await assumptionRes.json();
        const benefitJson = await benefitRes.json();
        const subscriptionJson = await subscriptionRes.json();

        if (aborted) return;

        setAssumptions((assumptionJson?.ok ? assumptionJson.data : null) as PlannerAssumptions | null);
        const incomingRates = (assumptionJson?.ok ? assumptionJson.data?.fx?.rates : null) as Record<string, number> | null;
        if (incomingRates && typeof incomingRates === "object") {
          setFxRates({
            USD: Number(incomingRates.USD ?? 0),
            JPY: Number(incomingRates.JPY ?? 0),
            EUR: Number(incomingRates.EUR ?? 0),
          });
        }
        setAssumptionNotes(Array.isArray(assumptionJson?.notes) ? assumptionJson.notes : []);
        setBenefitCount(Array.isArray(benefitJson?.data?.items) ? benefitJson.data.items.length : null);
        setSubscriptionCount(Array.isArray(subscriptionJson?.data?.items) ? subscriptionJson.data.items.length : null);
      } catch {
        if (aborted) return;
        setAssumptions(null);
        setAssumptionNotes(["외부 근거 데이터를 자동으로 불러오지 못했습니다. 각 화면에서 개별 확인해 주세요."]);
      }
    }

    void loadEvidence();

    return () => {
      aborted = true;
    };
  }, []);

  async function loadHousing() {
    setHousingLoading(true);
    setHousingError("");
    try {
      const params = new URLSearchParams({ regionCode, month, areaBand: String(areaM2) });
      const res = await fetch(`/api/public/housing/sales?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) {
        setHousingError(json?.error?.message ?? "주거 벤치마크를 불러오지 못했습니다.");
        return;
      }
      setHousing(json.data as HousingBenchmark);
    } catch (error) {
      setHousingError("주거 벤치마크를 불러오지 못했습니다.");
      console.error("[planner] housing module failed", error);
    } finally {
      setHousingLoading(false);
    }
  }

  async function loadRent() {
    setRentLoading(true);
    setRentError("");
    try {
      const params = new URLSearchParams({ regionCode, month, areaBand: String(areaM2), rentType });
      const res = await fetch(`/api/public/housing/rent?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) {
        setRentError(json?.error?.message ?? "전월세 벤치마크를 불러오지 못했습니다.");
        return;
      }
      setRent(json.data as HousingBenchmark);
    } catch (error) {
      setRentError("전월세 벤치마크를 불러오지 못했습니다.");
      console.error("[planner] rent module failed", error);
    } finally {
      setRentLoading(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <h3 className="text-base font-semibold">외부 근거 데이터</h3>
        <p className="mt-1 text-xs text-slate-500">플래너 계산에 참고하는 대외 지표입니다. 모든 값은 참고용이며 사용자가 가정값을 조정할 수 있습니다.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 text-sm">
          <div className="rounded-xl border border-border bg-surface-muted p-3">
            <p className="text-xs text-slate-500">환율 가정(기준일)</p>
            {assumptions?.fx ? (
              <>
                <p className="font-semibold">{assumptions.fx.asOf}</p>
                <p className="text-xs text-slate-600">USD {fxRates.USD || "-"} · JPY {fxRates.JPY || "-"} · EUR {fxRates.EUR || "-"}</p>
              </>
            ) : (
              <p className="text-xs text-amber-700">환율 설정 필요 또는 호출 실패</p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-surface-muted p-3">
            <p className="text-xs text-slate-500">혜택 후보</p>
            <p className="font-semibold">{typeof benefitCount === "number" ? `${benefitCount}건` : "조회 필요"}</p>
            <p className="text-[11px] text-slate-500">기준 키워드: 주거</p>
            <Link href="/benefits?query=주거" className="text-xs text-primary underline underline-offset-4">보조금24 보기</Link>
          </div>
          <div className="rounded-xl border border-border bg-surface-muted p-3">
            <p className="text-xs text-slate-500">청약 공고</p>
            <p className="font-semibold">{typeof subscriptionCount === "number" ? `${subscriptionCount}건` : "조회 필요"}</p>
            <p className="text-[11px] text-slate-500">기준 지역: 서울 · 최근 조회</p>
            <Link href="/housing/subscription?region=서울" className="text-xs text-primary underline underline-offset-4">청약홈 보기</Link>
          </div>
        </div>
        {assumptions?.fx ? (
          <div className="mt-3 rounded-xl border border-border bg-surface-muted p-3">
            <p className="text-xs font-semibold text-slate-700">환율 가정값(수정 가능)</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              {["USD", "JPY", "EUR"].map((currency) => (
                <label key={currency} className="text-xs">
                  {currency}
                  <input
                    className="mt-1 h-9 w-full rounded border border-slate-300 px-2"
                    value={fxRates[currency] || ""}
                    onChange={(e) =>
                      setFxRates((prev) => ({
                        ...prev,
                        [currency]: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0,
                      }))
                    }
                  />
                </label>
              ))}
              <label className="text-xs">
                외화 금액
                <input
                  className="mt-1 h-9 w-full rounded border border-slate-300 px-2"
                  value={foreignAmount}
                  onChange={(e) => setForeignAmount(Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)}
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              환산 예시: {foreignAmount.toLocaleString()} USD ≈ {formatKrwWithEok((fxRates.USD ?? 0) * foreignAmount)}
            </p>
          </div>
        ) : null}
        {assumptionNotes.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-slate-500">
            {assumptionNotes.map((note) => (
              <li key={note}>- {note}</li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card>
        <h3 className="text-base font-semibold">실거래 벤치마크(내집마련)</h3>
        <p className="mt-1 text-xs text-slate-500">
          사용 순서: 1) 시/도 2) 시군구 3) 거래월(YYYYMM) 4) 면적 5) 목표금액 입력 후 조회. 결과는 참고 지표이며, 국토부 원자료(만원)를 원 단위로 환산해 보여줍니다.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <RegionSelector lawdCd={regionCode} onChangeLawdCd={setRegionCode} />
          <label className="text-sm">거래월(YYYYMM)
            <input className="mt-1 block h-10 w-full rounded-xl border border-border px-3" value={month} onChange={(e) => setMonth(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} />
          </label>
          <label className="text-sm">면적
            <select className="mt-1 block h-10 w-full rounded-xl border border-border px-3" value={areaM2} onChange={(e) => setAreaM2(Number(e.target.value) || 84)}>
              {AREA_PRESETS.map((area) => (
                <option key={area} value={area}>{formatAreaWithPyeong(area)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">목표금액(원)
            <input className="mt-1 block h-10 w-full rounded-xl border border-border px-3" value={goalAmount} onChange={(e) => setGoalAmount(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} />
          </label>
        </div>

        <p className="mt-2 text-xs text-slate-500">입력 해석: {formatKrwWithEok(goalAmount)}</p>

        <Button className="mt-3" type="button" size="sm" onClick={() => void loadHousing()} disabled={housingLoading}>{housingLoading ? "로딩..." : "최근 실거래 요약 보기"}</Button>

        {housingError ? <p className="mt-2 text-sm text-red-700">{housingError}</p> : null}

        {housing ? (
          <div className="mt-3 rounded-xl border border-border bg-surface-muted p-3 text-sm">
            <p>건수: {housing.count}건 · 중앙값: {formatKrwWithEok(housing.median)} · 범위: {formatKrwWithEok(housing.min)} ~ {formatKrwWithEok(housing.max)}</p>
            <p className="text-xs text-slate-500">기준: {selectedRegionName} · 월 {housing.month} · 면적 {formatAreaWithPyeong(Number(housing.areaBand))}</p>
            <p className="mt-1 text-xs text-slate-600">활용 가이드: {describeDiff(goalAmount, housing.median)}</p>
            {housing.count < 5 ? <p className="mt-1 text-xs text-amber-700">표본 건수가 적어 참고 오차가 커질 수 있습니다.</p> : null}
          </div>
        ) : null}
      </Card>

      <Card>
        <h3 className="text-base font-semibold">주거비 벤치마크(전월세)</h3>
        <p className="mt-1 text-xs text-slate-500">
          시/도와 시군구를 선택한 뒤 거래월·면적·유형으로 조회합니다. 보증금/월세 중앙값과 현재 입력값 차이를 함께 비교해 현재 주거비 수준을 점검하세요.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <RegionSelector lawdCd={regionCode} onChangeLawdCd={setRegionCode} />
          <label className="text-sm">거래월(YYYYMM)
            <input className="mt-1 block h-10 w-full rounded-xl border border-border px-3" value={month} onChange={(e) => setMonth(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} />
          </label>
          <label className="text-sm">면적
            <select className="mt-1 block h-10 w-full rounded-xl border border-border px-3" value={areaM2} onChange={(e) => setAreaM2(Number(e.target.value) || 84)}>
              {AREA_PRESETS.map((area) => (
                <option key={area} value={area}>{formatAreaWithPyeong(area)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">거래유형
            <select className="mt-1 block h-10 w-full rounded-xl border border-border px-3" value={rentType} onChange={(e) => setRentType(e.target.value as "all" | "jeonse" | "wolse")}>
              <option value="all">전월세 전체</option>
              <option value="jeonse">전세 중심</option>
              <option value="wolse">월세 중심</option>
            </select>
          </label>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-sm">현재 전세보증금(선택)
            <input
              className="mt-1 block h-10 w-full rounded-xl border border-border px-3"
              value={currentJeonseDeposit || ""}
              onChange={(e) => setCurrentJeonseDeposit(parseNumberInput(e.target.value))}
              placeholder="예: 350000000"
            />
          </label>
          <label className="text-sm">현재 월세(선택)
            <input
              className="mt-1 block h-10 w-full rounded-xl border border-border px-3"
              value={currentMonthlyRent || ""}
              onChange={(e) => setCurrentMonthlyRent(parseNumberInput(e.target.value))}
              placeholder="예: 1200000"
            />
          </label>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          입력 해석: 전세보증금 {currentJeonseDeposit > 0 ? formatKrwWithEok(currentJeonseDeposit) : "-"} · 월세 {currentMonthlyRent > 0 ? formatKrwWithEok(currentMonthlyRent) : "-"}
        </p>

        <Button className="mt-3" type="button" size="sm" onClick={() => void loadRent()} disabled={rentLoading}>
          {rentLoading ? "로딩..." : "최근 전월세 요약 보기"}
        </Button>

        {rentError ? <p className="mt-2 text-sm text-red-700">{rentError}</p> : null}

        {rent ? (
          <div className="mt-3 rounded-xl border border-border bg-surface-muted p-3 text-sm">
            <p>
              건수: {rent.count}건 · 보증금 중앙값: {formatKrwWithEok(rent.median)} · 보증금 범위: {formatKrwWithEok(rent.min)} ~ {formatKrwWithEok(rent.max)}
            </p>
            <p>
              월세 중앙값: {typeof rent.monthlyMedian === "number" ? formatKrwWithEok(rent.monthlyMedian) : "-"} · 월세 범위: {typeof rent.monthlyMin === "number" && typeof rent.monthlyMax === "number" ? `${formatKrwWithEok(rent.monthlyMin)} ~ ${formatKrwWithEok(rent.monthlyMax)}` : "-"}
            </p>
            <p className="text-xs text-slate-500">
              기준: {selectedRegionName} · 월 {rent.month} · 면적 {formatAreaWithPyeong(Number(rent.areaBand))} · 유형 {rent.rentType ?? "ALL"}
            </p>
            <p className="mt-1 text-xs text-slate-600">전세 비교: {currentJeonseDeposit > 0 ? describeDiff(currentJeonseDeposit, rent.median) : "입력 필요"}</p>
            <p className="text-xs text-slate-600">월세 비교: {currentMonthlyRent > 0 && typeof rent.monthlyMedian === "number" ? describeDiff(currentMonthlyRent, rent.monthlyMedian) : "입력 필요"}</p>
            {rent.count < 5 ? <p className="mt-1 text-xs text-amber-700">표본 건수가 적어 참고 오차가 커질 수 있습니다.</p> : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">현재 전세보증금/월세를 입력하면 벤치마크 대비 수준을 문장으로 안내합니다.</p>
        )}
      </Card>
    </div>
  );
}
