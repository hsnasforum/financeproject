"use client";

import { useCallback, useEffect, useState } from "react";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type SubscriptionItem = {
  id: string;
  title: string;
  region?: string;
  applyStart?: string;
  applyEnd?: string;
  supplyType?: string;
  sizeHints?: string;
  address?: string;
  totalHouseholds?: string;
  contact?: string;
  details?: Record<string, string>;
  link?: string;
};

type SearchMeta = {
  scannedPages?: number;
  scannedRows?: number;
  upstreamTotalCount?: number;
  matchedRows?: number;
  rawMatched?: number;
  normalizedCount?: number;
  dropStats?: { missingTitle?: number; generatedId?: number };
  truncated?: boolean;
  availableRegionsTop?: string[];
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function SubscriptionClient({ initialRegion = "전국" }: { initialRegion?: string }) {
  const [region, setRegion] = useState(initialRegion);
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [assumption, setAssumption] = useState("");
  const [meta, setMeta] = useState<SearchMeta>({});
  const [from, setFrom] = useState(daysAgoIsoDate(90));
  const [to, setTo] = useState(todayIsoDate());
  const [houseType, setHouseType] = useState<"apt" | "urbty" | "remndr">("apt");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SubscriptionItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = useCallback(async (item: SubscriptionItem) => {
    setSelected(item);
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({ id: item.id, region: region || "전국", houseType });
      const res = await fetch(`/api/public/housing/subscription/item?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (json?.ok && json.data?.item) {
        setSelected(json.data.item as SubscriptionItem);
      }
    } finally {
      setDetailLoading(false);
    }
  }, [houseType, region]);

  const run = useCallback(async (nextRegion?: string, options?: { mode?: "search" | "all"; deep?: boolean }) => {
    const regionValue = (nextRegion ?? region).trim() || "전국";
    setLoading(true);
    setError("");
    setMeta({});
    try {
      const params = new URLSearchParams();
      if (regionValue) params.set("region", regionValue);
      if (options?.mode === "all") params.set("mode", "all");
      if (options?.deep) params.set("scan", "deep");
      if (from.trim()) params.set("from", from.trim());
      if (to.trim()) params.set("to", to.trim());
      if (query.trim()) params.set("q", query.trim());
      params.set("houseType", houseType);
      const res = await fetch(`/api/public/housing/subscription?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error?.message ?? "청약 공고 조회 실패");
        setLoading(false);
        return;
      }
      setItems(Array.isArray(json.data?.items) ? json.data.items : []);
      setAssumption(typeof json.data?.assumptions?.note === "string" ? json.data.assumptions.note : "");
      setMeta(typeof json.meta === "object" && json.meta ? json.meta : {});
    } catch {
      setError("청약 공고 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [region, from, to, query, houseType]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void run(initialRegion.trim() || "전국", { mode: "all" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialRegion, run]);

  return (
    <main className="py-8">
      <Container>
        <SectionHeader title="청약 공고 조회" subtitle="청약홈 분양정보 · 지역별 참고 일정" />
        <Card>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <select className="h-10 rounded-xl border border-border px-3" value={region} onChange={(e) => setRegion(e.target.value)}>
              {["전국", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"].map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <input type="date" className="h-10 rounded-xl border border-border px-3" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="h-10 rounded-xl border border-border px-3" value={to} onChange={(e) => setTo(e.target.value)} />
            <select className="h-10 rounded-xl border border-border px-3" value={houseType} onChange={(e) => setHouseType(e.target.value as "apt" | "urbty" | "remndr")}>
              <option value="apt">APT</option>
              <option value="urbty">오피스텔/도시형</option>
              <option value="remndr">잔여세대</option>
            </select>
            <input className="h-10 rounded-xl border border-border px-3" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="주택명 키워드(선택)" />
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" onClick={() => { setFrom(daysAgoIsoDate(7)); setTo(todayIsoDate()); }}>최근 7일</Button>
            <Button variant="outline" onClick={() => { setFrom(daysAgoIsoDate(30)); setTo(todayIsoDate()); }}>최근 30일</Button>
            <Button variant="outline" onClick={() => { setFrom(daysAgoIsoDate(90)); setTo(todayIsoDate()); }}>최근 90일</Button>
          </div>
          <div className="mt-2 flex gap-2">
            <Button onClick={() => void run()}>{loading ? "로딩..." : "조회"}</Button>
            <Button variant="outline" onClick={() => { setRegion("전국"); setQuery(""); setFrom(daysAgoIsoDate(90)); setTo(todayIsoDate()); void run("전국", { mode: "all" }); }}>전체 보기</Button>
          </div>
          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
          {assumption ? <p className="mt-2 text-xs text-slate-500">{assumption}</p> : null}
          <p className="mt-1 text-xs text-slate-500">공고 일정/상태는 변경될 수 있으므로 최종 공고문을 확인하세요.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-surface-muted p-2">
                <p className="font-medium">{item.title}</p>
                <p className="text-slate-600">지역 {item.region ?? "-"}</p>
                <p className="text-slate-600">신청 {item.applyStart ?? "-"} ~ {item.applyEnd ?? "-"}</p>
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => void openDetail(item)}>상세 보기</Button>
                </div>
              </li>
            ))}
          </ul>
          {!loading && !error && items.length === 0 ? (
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p>
                {(meta.rawMatched ?? meta.matchedRows ?? 0) > 0 && (meta.normalizedCount ?? 0) === 0
                  ? `원본 후보 ${meta.rawMatched ?? meta.matchedRows ?? 0}건을 찾았지만 정규화 결과는 0건입니다. 필수 필드 매핑을 확인해 주세요.`
                  : (meta.scannedRows ?? 0) === 0
                  ? "업스트림 데이터가 0건이거나 연결/인증/스키마 문제일 수 있습니다. 설정 페이지에서 연결 테스트를 확인하세요."
                  : typeof meta.upstreamTotalCount === "number" && meta.upstreamTotalCount === 0
                  ? "API 자체가 0건을 반환했습니다. 기간/공고 갱신 여부를 확인하세요."
                  : `API에서 ${meta.scannedRows ?? 0}건(페이지 ${meta.scannedPages ?? 0})을 받아 지역 매칭 0건입니다.`}
              </p>
              {meta.dropStats?.missingTitle ? (
                <p className="text-xs text-amber-700">정규화 드롭 사유: 제목 누락 {meta.dropStats.missingTitle}건</p>
              ) : null}
              {Array.isArray(meta.availableRegionsTop) && meta.availableRegionsTop.length > 0 ? (
                <p className="text-xs text-slate-500">가능한 지역 예: {meta.availableRegionsTop.join(", ")}</p>
              ) : null}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void run(region, { mode: "all" })}>전체 보기(필터 없이)</Button>
                <Button size="sm" variant="outline" onClick={() => void run(region, { deep: true })}>더 깊게 검색</Button>
              </div>
            </div>
          ) : null}
          {!loading && !error && items.length > 0 && meta.truncated ? (
            <p className="mt-2 text-xs text-amber-700">스캔 상한에 도달해 일부 결과만 표시했습니다. 더 깊게 검색을 사용하세요.</p>
          ) : null}
        </Card>
      </Container>
      {selected ? (
        <div className="fixed inset-0 z-50 bg-black/30 p-4" onClick={() => setSelected(null)}>
          <div className="mx-auto mt-10 max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{selected.title}</h3>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>닫기</Button>
            </div>
            <details open className="mt-3 rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold">공고 요약</summary>
              <p className="mt-2 text-sm text-slate-700">지역: {selected.region ?? "-"}</p>
              <p className="mt-1 text-sm text-slate-700">접수: {selected.applyStart ?? "-"} ~ {selected.applyEnd ?? "-"}</p>
            </details>
            <details className="mt-2 rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold">추가 정보</summary>
              {detailLoading ? <p className="mt-2 text-xs text-slate-500">로딩 중...</p> : null}
              {!detailLoading ? (
                <dl className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  {selected.supplyType ? <><dt className="text-slate-500">공급유형</dt><dd>{selected.supplyType}</dd></> : null}
                  {selected.sizeHints ? <><dt className="text-slate-500">주택형/면적</dt><dd>{selected.sizeHints}</dd></> : null}
                  {selected.address ? <><dt className="text-slate-500">공급위치</dt><dd>{selected.address}</dd></> : null}
                  {selected.totalHouseholds ? <><dt className="text-slate-500">모집세대수</dt><dd>{selected.totalHouseholds}</dd></> : null}
                  {selected.contact ? <><dt className="text-slate-500">문의처</dt><dd>{selected.contact}</dd></> : null}
                  {selected.link ? <><dt className="text-slate-500">상세링크</dt><dd><a className="text-primary underline" href={selected.link} target="_blank" rel="noreferrer">공고 보기</a></dd></> : null}
                </dl>
              ) : null}
              {!detailLoading && selected.details && Object.keys(selected.details).length > 0 ? (
                <div className="mt-3 rounded-lg border border-slate-200 p-2">
                  {Object.entries(selected.details).map(([label, value]) => (
                    <p key={label} className="text-xs text-slate-600">{label}: {value}</p>
                  ))}
                </div>
              ) : null}
            </details>
          </div>
        </div>
      ) : null}
    </main>
  );
}
