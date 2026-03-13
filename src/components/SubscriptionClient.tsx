"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorAnnouncer } from "@/components/forms/ErrorAnnouncer";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { FieldError } from "@/components/forms/FieldError";
import { announce, focusFirstError, scrollToErrorSummary } from "@/lib/forms/a11y";
import { pathToId } from "@/lib/forms/ids";
import { firstError, issuesToFieldMap } from "@/lib/forms/issueMap";
import { parseSubscriptionFilters, type SubscriptionHouseType, type SubscriptionMode } from "@/lib/schemas/subscriptionFilters";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FallbackBanner } from "@/components/FallbackBanner";
import { parseStringIssues, type Issue } from "@/lib/schemas/issueTypes";

const ERROR_SUMMARY_ID = "subscription_error_summary";

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
  fallback?: {
    mode?: string;
    reason?: string;
    generatedAt?: string;
    nextRetryAt?: string;
  };
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function houseTypeLabel(value: "apt" | "urbty" | "remndr"): string {
  if (value === "urbty") return "오피스텔/도시형";
  if (value === "remndr") return "잔여세대";
  return "APT";
}

type SubscriptionClientProps = {
  initialRegion?: string;
  initialFrom?: string;
  initialTo?: string;
  initialQuery?: string;
  initialHouseType?: SubscriptionHouseType;
  initialMode?: SubscriptionMode;
};

export function SubscriptionClient({
  initialRegion = "전국",
  initialFrom = daysAgoIsoDate(90),
  initialTo = todayIsoDate(),
  initialQuery = "",
  initialHouseType = "apt",
  initialMode = "all",
}: SubscriptionClientProps) {
  const initializedFromQueryRef = useRef(false);
  const [region, setRegion] = useState(initialRegion);
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [assumption, setAssumption] = useState("");
  const [meta, setMeta] = useState<SearchMeta>({});
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [houseType, setHouseType] = useState<SubscriptionHouseType>(initialHouseType);
  const [query, setQuery] = useState(initialQuery);
  const [formIssues, setFormIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState<SubscriptionItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const runInFlightRef = useRef(false);

  const summaryLines = useMemo(() => {
    return [
      `지역 ${region || "전국"} · 유형 ${houseTypeLabel(houseType)}`,
      `조회 기간 ${from || "-"} ~ ${to || "-"}`,
      `키워드 ${query.trim() || "-"}`,
    ];
  }, [from, houseType, query, region, to]);
  const fieldIssueMap = useMemo(() => issuesToFieldMap(formIssues), [formIssues]);

  const showValidationIssues = useCallback((issues: Issue[]) => {
    setFormIssues(issues);
    setError(firstError(issues) ?? "입력값을 확인해 주세요.");
    setTimeout(() => {
      scrollToErrorSummary(ERROR_SUMMARY_ID);
      focusFirstError(issues.map((entry) => entry.path));
      announce(`입력 오류 ${issues.length}건이 있습니다.`);
    }, 0);
  }, []);

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

  const run = useCallback(async (options?: {
    region?: string;
    from?: string;
    to?: string;
    query?: string;
    houseType?: "apt" | "urbty" | "remndr";
    mode?: "search" | "all";
    deep?: boolean;
  }) => {
    if (runInFlightRef.current) return;
    const modeValue = options?.mode ?? "search";
    const parsedFilters = parseSubscriptionFilters({
      region: options?.region ?? region,
      from: options?.from ?? from,
      to: options?.to ?? to,
      q: options?.query ?? query,
      houseType: options?.houseType ?? houseType,
      mode: modeValue,
      scan: options?.deep ? "deep" : "",
    });
    if (!parsedFilters.ok) {
      showValidationIssues(parsedFilters.issues);
      return;
    }

    const filters = parsedFilters.value;
    setRegion(filters.region);
    setFrom(filters.from);
    setTo(filters.to);
    setHouseType(filters.houseType);
    setQuery(filters.q);

    runInFlightRef.current = true;
    setLoading(true);
    setError("");
    setFormIssues([]);
    setMeta({});
    try {
      const params = new URLSearchParams();
      if (filters.region) params.set("region", filters.region);
      if (filters.mode === "all") params.set("mode", "all");
      if (filters.deep) params.set("scan", "deep");
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.q) params.set("q", filters.q);
      params.set("houseType", filters.houseType);
      const res = await fetch(`/api/public/housing/subscription?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) {
        const apiIssues = parseStringIssues(json?.error?.issues ?? []);
        if (apiIssues.length > 0) {
          showValidationIssues(apiIssues);
        } else {
          const message = json?.error?.message ?? "청약 공고 조회 실패";
          setError(message);
          announce(message);
        }
        return;
      }
      setItems(Array.isArray(json.data?.items) ? json.data.items : []);
      setAssumption(typeof json.data?.assumptions?.note === "string" ? json.data.assumptions.note : "");
      setMeta(typeof json.meta === "object" && json.meta ? json.meta : {});
    } catch {
      setError("청약 공고 조회 실패");
      announce("청약 공고 조회 실패");
    } finally {
      setLoading(false);
      runInFlightRef.current = false;
    }
  }, [region, from, to, query, houseType, showValidationIssues]);

  useEffect(() => {
    if (initializedFromQueryRef.current) return;
    initializedFromQueryRef.current = true;
    void run({ mode: initialMode });
  }, [initialMode, run]);

  return (
    <main className="py-8">
      <Container>
        <SectionHeader title="청약 공고 조회" subtitle="청약홈 분양정보 · 지역별 참고 일정" />
        <Card>
          <FallbackBanner fallback={meta.fallback} className="mb-3" />
          <ErrorSummary issues={formIssues} id={ERROR_SUMMARY_ID} className="mb-3" />
          <ErrorAnnouncer />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <select
                id={pathToId("region")}
                className="h-10 w-full rounded-xl border border-border px-3"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                aria-invalid={Boolean(fieldIssueMap.region?.[0])}
                aria-describedby={fieldIssueMap.region?.[0] ? `${pathToId("region")}_error` : undefined}
              >
                {["전국", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"].map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <FieldError id={`${pathToId("region")}_error`} message={fieldIssueMap.region?.[0]} />
            </div>
            <div>
              <input
                id={pathToId("from")}
                type="date"
                className="h-10 w-full rounded-xl border border-border px-3"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-invalid={Boolean(fieldIssueMap.from?.[0])}
                aria-describedby={fieldIssueMap.from?.[0] ? `${pathToId("from")}_error` : undefined}
              />
              <FieldError id={`${pathToId("from")}_error`} message={fieldIssueMap.from?.[0]} />
            </div>
            <div>
              <input
                id={pathToId("to")}
                type="date"
                className="h-10 w-full rounded-xl border border-border px-3"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-invalid={Boolean(fieldIssueMap.to?.[0])}
                aria-describedby={fieldIssueMap.to?.[0] ? `${pathToId("to")}_error` : undefined}
              />
              <FieldError id={`${pathToId("to")}_error`} message={fieldIssueMap.to?.[0]} />
            </div>
            <div>
              <select
                id={pathToId("houseType")}
                className="h-10 w-full rounded-xl border border-border px-3"
                value={houseType}
                onChange={(e) => setHouseType(e.target.value as "apt" | "urbty" | "remndr")}
                aria-invalid={Boolean(fieldIssueMap.houseType?.[0])}
                aria-describedby={fieldIssueMap.houseType?.[0] ? `${pathToId("houseType")}_error` : undefined}
              >
                <option value="apt">APT</option>
                <option value="urbty">오피스텔/도시형</option>
                <option value="remndr">잔여세대</option>
              </select>
              <FieldError id={`${pathToId("houseType")}_error`} message={fieldIssueMap.houseType?.[0]} />
            </div>
            <div>
              <input
                id={pathToId("q")}
                className="h-10 w-full rounded-xl border border-border px-3"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="주택명 키워드(선택)"
                aria-invalid={Boolean(fieldIssueMap.q?.[0])}
                aria-describedby={fieldIssueMap.q?.[0] ? `${pathToId("q")}_error` : undefined}
              />
              <FieldError id={`${pathToId("q")}_error`} message={fieldIssueMap.q?.[0]} />
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" onClick={() => { setFrom(daysAgoIsoDate(7)); setTo(todayIsoDate()); }} disabled={loading}>최근 7일</Button>
            <Button variant="outline" onClick={() => { setFrom(daysAgoIsoDate(30)); setTo(todayIsoDate()); }} disabled={loading}>최근 30일</Button>
            <Button variant="outline" onClick={() => { setFrom(daysAgoIsoDate(90)); setTo(todayIsoDate()); }} disabled={loading}>최근 90일</Button>
          </div>
          <div className="mt-2 flex gap-2">
            <Button onClick={() => void run()} disabled={loading}>{loading ? "로딩..." : "조회"}</Button>
            <Button variant="outline" disabled={loading} onClick={() => {
              const fallbackFrom = daysAgoIsoDate(90);
              const fallbackTo = todayIsoDate();
              setRegion("전국");
              setQuery("");
              setFrom(fallbackFrom);
              setTo(fallbackTo);
              void run({ region: "전국", from: fallbackFrom, to: fallbackTo, query: "", mode: "all" });
            }}>
              전체 보기
            </Button>
          </div>
          {error ? (
            <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p>{error}</p>
              <Link href="/settings/data-sources" className="mt-2 inline-block text-xs underline">
                데이터 소스 상태 확인
              </Link>
            </div>
          ) : null}
          {assumption ? <p className="mt-2 text-xs text-slate-500">{assumption}</p> : null}
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">조건 요약</p>
            <ul className="mt-1 space-y-1 text-xs text-slate-600">
              {summaryLines.map((line) => (
                <li key={line}>- {line}</li>
              ))}
            </ul>
          </div>
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
                <Button size="sm" variant="outline" onClick={() => void run({ region, mode: "all" })}>전체 보기(필터 없이)</Button>
                <Button size="sm" variant="outline" onClick={() => void run({ region, deep: true })}>더 깊게 검색</Button>
                <Link href="/settings/data-sources" className="inline-flex h-8 items-center rounded-xl border border-border px-2 text-xs">
                  설정 확인
                </Link>
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
                  {selected.link ? <><dt className="text-slate-500">상세링크</dt><dd><a className="text-primary underline" href={selected.link} target="_blank" rel="noopener noreferrer">공고 보기</a></dd></> : null}
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
