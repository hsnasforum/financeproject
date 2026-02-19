"use client";

import { useMemo, useState } from "react";
import lawdCodes from "@/data/molit/lawdCodes.sigungu.json";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatAreaWithPyeong, formatKrwWithEok } from "@/lib/format/krw";

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

type RegionOption = {
  code: string;
  name: string;
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

export function PlannerExternalModules() {
  const regions = lawdCodes as RegionOption[];

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

  const selectedRegionName = useMemo(() => {
    const found = regions.find((r) => r.code === regionCode);
    return found?.name ?? `코드 ${regionCode}`;
  }, [regionCode, regions]);

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

  const diffPct = housing ? ((goalAmount - housing.median) / housing.median) * 100 : null;
  const jeonseDiffPct = rent && currentJeonseDeposit > 0 && rent.median > 0 ? ((currentJeonseDeposit - rent.median) / rent.median) * 100 : null;
  const monthlyDiffPct = rent && currentMonthlyRent > 0 && (rent.monthlyMedian ?? 0) > 0 ? ((currentMonthlyRent - (rent.monthlyMedian ?? 0)) / (rent.monthlyMedian ?? 0)) * 100 : null;

  return (
    <div className="grid gap-4">
      <Card>
        <h3 className="text-base font-semibold">실거래 벤치마크(내집마련)</h3>
        <p className="mt-1 text-xs text-slate-500">
          선택한 지역/거래월/면적 기준으로 최근 실거래 가격 분포(건수/중앙값/범위)를 요약해 참고 지표로 제공합니다. 실제 매물/계약 조건에 따라 달라질 수 있습니다.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <label className="text-sm">지역
            <select className="mt-1 block h-10 w-full rounded-xl border border-border px-3" value={regionCode} onChange={(e) => setRegionCode(e.target.value)}>
              {regions.map((region) => (
                <option key={region.code} value={region.code}>{region.name}</option>
              ))}
            </select>
          </label>
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
            <p className="mt-1 text-xs text-slate-600">
              목표금액 괴리율: {diffPct === null ? "-" : `${diffPct.toFixed(1)}%`} (참고 지표, 확정 아님)
            </p>
          </div>
        ) : null}
      </Card>

      <Card>
        <h3 className="text-base font-semibold">주거비 벤치마크(전월세)</h3>
        <p className="mt-1 text-xs text-slate-500">
          선택 조건의 최근 전월세 실거래를 요약한 참고 지표입니다. 보증금/월세는 계약 조건에 따라 달라질 수 있으며 확정 값이 아닙니다.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <label className="text-sm">지역
            <select className="mt-1 block h-10 w-full rounded-xl border border-border px-3" value={regionCode} onChange={(e) => setRegionCode(e.target.value)}>
              {regions.map((region) => (
                <option key={region.code} value={region.code}>{region.name}</option>
              ))}
            </select>
          </label>
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
            <p className="mt-1 text-xs text-slate-600">
              현재값 비교: 전세 {jeonseDiffPct === null ? "입력 필요" : `${jeonseDiffPct.toFixed(1)}%`} · 월세 {monthlyDiffPct === null ? "입력 필요" : `${monthlyDiffPct.toFixed(1)}%`} (참고 지표, 확정 아님)
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">현재 전세보증금/월세를 입력하면 벤치마크 대비 수준(%)을 보여드립니다.</p>
        )}
      </Card>
    </div>
  );
}
