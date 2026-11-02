"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { SearchPill } from "@/components/ui/SearchPill";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { createLatestRequestCoordinator } from "@/lib/browser/latestRequest";
import { formatFinlifeCollectedAt } from "@/lib/finlife/disclosure";
import {
  PENSION_GUARANTEED_AREA_OPTIONS,
  PENSION_GUARANTEED_CHANNELS,
  PENSION_GUARANTEED_SORTS,
  PENSION_PRODUCT_AREA_OPTIONS,
  PENSION_PRODUCT_SORTS,
} from "@/lib/products/pensionOptions";
import type {
  PensionFreshness,
  PensionGuaranteedResponseData,
  PensionGuaranteedRow,
  PensionProductRow,
  PensionProductsResponseData,
} from "@/lib/products/pensionQuery";
import { cn } from "@/lib/utils";

export type PensionTab = "guaranteed" | "products";

const TABS: Array<{ id: PensionTab; label: string }> = [
  { id: "guaranteed", label: "원리금보장 연금저축보험" },
  { id: "products", label: "상품별 수익률·수수료율" },
];

type FetchState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; code: string; message: string };

type ApiPayload<T> = { ok: true; data: T } | { ok: false; error?: { code?: string; message?: string } };

const GUARANTEED_DEFAULTS = { area: "all", channel: "all", sort: "nameAsc", q: "" };
const PRODUCTS_DEFAULTS = { area: "all", sells: "Y", guarantees: "all", productType: "all", sort: "feeAsc", q: "", page: 1 };

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "공시 없음";
  // Published values keep up to three decimals; never round them away.
  return `${value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%`;
}

function formatReserve(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "공시 없음";
  return `${value.toLocaleString("ko-KR")}백만원`;
}

function usePensionDataset<T>(params: Record<string, string | number>) {
  const [state, setState] = useState<FetchState<T>>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const requestsRef = useRef<ReturnType<typeof createLatestRequestCoordinator> | null>(null);
  if (requestsRef.current == null) requestsRef.current = createLatestRequestCoordinator();
  const queryString = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();

  useEffect(() => {
    const requests = requestsRef.current!;
    const lease = requests.start();
    setState({ status: "loading" });
    fetch(`/api/products/pension?${queryString}`, { cache: "no-store", signal: lease.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as ApiPayload<T> | null;
        if (!lease.finish()) return;
        if (payload?.ok) {
          setState({ status: "ok", data: payload.data });
          return;
        }
        const error = payload && !payload.ok ? payload.error : undefined;
        setState({
          status: "error",
          code: error?.code ?? `HTTP_${response.status}`,
          message: error?.message ?? "연금저축 자료를 불러오지 못했습니다.",
        });
      })
      .catch(() => {
        if (!lease.finish()) return;
        setState({ status: "error", code: "NETWORK", message: "연금저축 자료를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해주세요." });
      });
    return () => requests.cancel();
  }, [queryString, reloadKey]);

  return { state, reload: useCallback(() => setReloadKey((key) => key + 1), []) };
}

function SourceLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-black text-primary underline-offset-2 hover:underline">
      통합연금포털 원문 보기
    </a>
  );
}

function FreshnessNotice({ freshness, sourcePageUrl, attribution }: { freshness: PensionFreshness; sourcePageUrl: string; attribution: string }) {
  const periodWord = freshness.periodUnit === "quarter" ? "분기" : "개월";
  return (
    <Card className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" data-testid="pension-source-notice">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-600">
        <span data-testid="pension-as-of">공시 기준: <strong className="font-black text-navy">{freshness.asOfLabel}</strong></span>
        <span data-testid="pension-collected-at">수집 시각: {formatFinlifeCollectedAt(freshness.collectedAt)}</span>
        <span>출처: {attribution}</span>
        <SourceLink href={sourcePageUrl} />
      </div>
      <div className="mt-3 space-y-2" role="status">
        {freshness.collectionStale ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800" data-testid="pension-collection-stale">
            오래된 자료: 수집한 지 {freshness.collectionAgeDays}일이 지났습니다(기준 {freshness.maxAgeDays}일). 최신 공시가 반영되지 않았을 수 있으니 원문에서 다시 확인하세요.
          </p>
        ) : null}
        {freshness.periodStale ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800" data-testid="pension-period-stale">
            공시 기준이 최근 기준보다 {freshness.periodsBehind}{periodWord} 늦습니다. 최근 상품 조건과 다를 수 있습니다.
          </p>
        ) : null}
        {freshness.unpublishedPeriods.length > 0 ? (
          <p className="rounded-xl border border-slate-200 bg-surface-muted px-3 py-2 text-xs font-medium text-slate-600" data-testid="pension-unpublished">
            수집 시점에 {freshness.unpublishedPeriods.join(", ")} 자료가 아직 공시되지 않아 {freshness.asOfLabel} 자료를 보여줍니다.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function DatasetError({ code, message, sourcePageUrl, onRetry }: { code: string; message: string; sourcePageUrl: string; onRetry: () => void }) {
  if (code === "SNAPSHOT_MISSING") {
    return (
      <Card className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm" data-testid="pension-snapshot-missing">
        <p className="text-sm font-black text-navy">연금저축 공시 자료가 아직 준비되지 않았습니다.</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          자료가 수집되면 이곳에 표시됩니다. 그동안은 <SourceLink href={sourcePageUrl} />에서 같은 공시를 확인할 수 있습니다.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      <ErrorState
        title={code === "SNAPSHOT_INVALID" ? "자료를 읽지 못했습니다" : "자료를 불러오지 못했습니다"}
        message={message}
        onRetry={onRetry}
        retryLabel="다시 시도"
        testId="pension-dataset-error"
      />
      <p className="text-xs text-slate-500">
        같은 공시는 <SourceLink href={sourcePageUrl} />에서 확인할 수 있습니다.
      </p>
    </div>
  );
}

function GuaranteedCard({ row }: { row: PensionGuaranteedRow }) {
  return (
    <Card as="li" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" data-testid="pension-guaranteed-item">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-[11px] font-black text-slate-500">{row.company} · {row.area}</p>
          <h3 className="mt-1 break-keep break-words text-base font-black text-navy">{row.product}</h3>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400">공시이율(매월 바뀔 수 있음)</p>
          <p className="text-xl font-black tabular-nums text-primary">{formatPercent(row.publishedInterestRate)}</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-black text-slate-400">최저보증이율</dt>
          <dd className="mt-1 break-keep break-words font-bold text-slate-700">{row.guaranteedInterestRate ?? "공시 없음"}</dd>
        </div>
        <div>
          <dt className="font-black text-slate-400">가입 경로</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {row.channels.length > 0
              ? row.channels.map((channel) => <Badge key={channel} variant="secondary">{channel}</Badge>)
              : <span className="font-bold text-slate-500">공시 없음</span>}
          </dd>
        </div>
      </dl>
      <details className="mt-4 rounded-xl border border-slate-100 bg-surface-muted/40 px-4 py-3">
        <summary className="cursor-pointer text-xs font-black text-slate-600">가입 경로별 수수료 부과구조 보기</summary>
        <ul className="mt-3 space-y-3">
          {row.fees.map((fee) => (
            <li key={fee.channel} className="text-xs leading-relaxed text-slate-700">
              <p className="font-black text-slate-500">{fee.label}</p>
              {fee.acquisition || fee.maintenance ? (
                <>
                  <p>계약체결비용: {fee.acquisition ?? "공시 없음"}</p>
                  <p>계약관리비용: {fee.maintenance ?? "공시 없음"}</p>
                </>
              ) : (
                <p className="text-slate-500">공시 없음</p>
              )}
            </li>
          ))}
        </ul>
      </details>
      {row.tel ? <p className="mt-3 text-[11px] text-slate-500">문의: {row.tel}</p> : null}
    </Card>
  );
}

function GuaranteedPanel({ sourcePageUrl }: { sourcePageUrl: string }) {
  const [filters, setFilters] = useState(GUARANTEED_DEFAULTS);
  const [searchInput, setSearchInput] = useState("");
  const { state, reload } = usePensionDataset<PensionGuaranteedResponseData>({ dataset: "guaranteed", ...filters });
  const update = (patch: Partial<typeof GUARANTEED_DEFAULTS>) => setFilters((current) => ({ ...current, ...patch }));
  const reset = () => {
    setFilters(GUARANTEED_DEFAULTS);
    setSearchInput("");
  };

  return (
    <section aria-labelledby="pension-guaranteed-heading" className="space-y-5">
      <h2 id="pension-guaranteed-heading" className="sr-only">원리금보장 연금저축보험</h2>
      <Card className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5 text-xs leading-relaxed text-amber-900" data-testid="pension-guaranteed-caution">
        <p className="font-black">가입 전에 알아두세요</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>보험료에서 수수료(계약체결비용·계약관리비용)를 먼저 뺀 금액에 공시이율을 적용합니다. 가입 후 일정 기간(예: 7년)까지는 적립금이 낸 돈보다 적을 수 있습니다.</li>
          <li>공시이율은 매월 바뀔 수 있고, 최저보증이율은 공시이율이 내려가도 보장하는 최소 이율입니다.</li>
          <li>수수료 구조는 매월 일정액을 내는 적립형 기준입니다. 자세한 내용은 보험사 상품요약서를 확인하세요.</li>
        </ul>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <FilterSelect id="pension-guaranteed-area" label="권역" labelPosition="vertical" size="md" value={filters.area} onChange={(event) => update({ area: event.target.value })}>
          <option value="all">전체</option>
          {PENSION_GUARANTEED_AREA_OPTIONS.map((area) => <option key={area.value} value={area.value}>{area.label}</option>)}
        </FilterSelect>
        <FilterSelect id="pension-guaranteed-channel" label="가입 경로" labelPosition="vertical" size="md" value={filters.channel} onChange={(event) => update({ channel: event.target.value })}>
          <option value="all">전체</option>
          {PENSION_GUARANTEED_CHANNELS.map((channel) => <option key={channel.id} value={channel.id}>{channel.label}</option>)}
        </FilterSelect>
        <FilterSelect id="pension-guaranteed-sort" label="정렬" labelPosition="vertical" size="md" value={filters.sort} onChange={(event) => update({ sort: event.target.value })}>
          {PENSION_GUARANTEED_SORTS.map((sort) => <option key={sort.id} value={sort.id}>{sort.label}</option>)}
        </FilterSelect>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: searchInput.trim() });
          }}
        >
          <label htmlFor="pension-guaranteed-search" className="ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">회사·상품 검색</label>
          <SearchPill
            id="pension-guaranteed-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onClear={() => {
              setSearchInput("");
              update({ q: "" });
            }}
            placeholder="예: 농협, 하이브리드"
          />
        </form>
      </div>

      {state.status === "loading" ? <LoadingState title="원리금보장 연금저축보험을 불러오는 중입니다" testId="pension-loading" /> : null}
      {state.status === "error" ? <DatasetError code={state.code} message={state.message} sourcePageUrl={sourcePageUrl} onRetry={reload} /> : null}
      {state.status === "ok" ? (
        <>
          <FreshnessNotice freshness={state.data.freshness} sourcePageUrl={state.data.source.pageUrl} attribution={state.data.source.attribution} />
          <p className="text-xs font-bold text-slate-500" data-testid="pension-result-count">
            {state.data.total}개 상품 · {state.data.areas.map((area) => `${area.label} ${area.rowCount ?? "자료 없음"}개`).join(" · ")}
          </p>
          {state.data.items.length === 0 ? (
            <EmptyState title="조건에 맞는 상품이 없습니다" description="권역이나 가입 경로를 바꾸거나 검색어를 지워 보세요." icon="search" actionLabel="조건 초기화" onAction={reset} />
          ) : (
            <ul className="space-y-4">
              {state.data.items.map((row) => <GuaranteedCard key={`${row.company}|${row.product}|${row.tel ?? ""}`} row={row} />)}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}

function ProductCard({ row }: { row: PensionProductRow }) {
  const metrics: Array<{ label: string; value: string; emphasis?: boolean }> = [
    { label: "연평균 수수료율", value: formatPercent(row.avgFeeRate), emphasis: true },
    { label: "3년 연평균 수익률", value: formatPercent(row.earnRate3) },
    { label: "5년 연평균 수익률", value: formatPercent(row.earnRate5) },
    { label: "7년 연평균 수익률", value: formatPercent(row.earnRate7) },
    { label: "10년 연평균 수익률", value: formatPercent(row.earnRate10) },
    { label: "누적 연평균 수익률", value: formatPercent(row.avgTotalEarRate) },
  ];
  return (
    <Card as="li" className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" data-testid="pension-product-item">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-[11px] font-black text-slate-500">{row.company} · {row.area}</p>
          <h3 className="mt-1 break-keep break-words text-base font-black text-navy">{row.product}</h3>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="secondary">{row.productType}</Badge>
            <Badge variant={row.principalGuaranteed ? "success" : "outline"}>{row.principalGuaranteed ? "원금보장" : "원금 비보장"}</Badge>
            <Badge variant={row.selling ? "outline" : "warning"}>{row.selling ? "판매 중" : "판매 중단"}</Badge>
          </div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt className="font-black text-slate-400">{metric.label}</dt>
            <dd className={cn("mt-1 tabular-nums font-black", metric.emphasis ? "text-primary" : "text-slate-700")}>{metric.value}</dd>
          </div>
        ))}
      </dl>
      {row.avgFeeRate !== null && row.avgFeeRate < 0 ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800" data-testid="pension-negative-fee">
          연평균 수수료율 공시값이 음수입니다. 공시값을 고치지 않고 그대로 보여 주므로 원문에서 다시 확인하세요.
        </p>
      ) : null}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        최초 판매일 {row.launchDate} · 수령기간 {row.rcvMethod ?? "공시 없음"} · 수수료 구조(적립금 증가 시) {row.feeType} · 적립금 {formatReserve(row.reserve)}
      </p>
    </Card>
  );
}

function ProductsPanel({ sourcePageUrl }: { sourcePageUrl: string }) {
  const [filters, setFilters] = useState(PRODUCTS_DEFAULTS);
  const [searchInput, setSearchInput] = useState("");
  const { state, reload } = usePensionDataset<PensionProductsResponseData>({ dataset: "products", ...filters });
  const update = (patch: Partial<typeof PRODUCTS_DEFAULTS>) => setFilters((current) => ({ ...current, page: 1, ...patch }));
  const reset = () => {
    setFilters(PRODUCTS_DEFAULTS);
    setSearchInput("");
  };
  const sortLabel = PENSION_PRODUCT_SORTS.find((sort) => sort.id === filters.sort)?.label ?? "";

  return (
    <section aria-labelledby="pension-products-heading" className="space-y-5">
      <h2 id="pension-products-heading" className="sr-only">상품별 수익률·수수료율</h2>
      <Card className="rounded-2xl border border-slate-100 bg-surface-muted/60 p-5 text-xs leading-relaxed text-slate-700" data-testid="pension-products-caution">
        <p className="font-black text-navy">숫자를 읽는 방법</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>수익률은 수수료를 뺀 뒤의 과거 연평균 수익률입니다. 앞으로의 수익을 보장하지 않는 참고 지표입니다.</li>
          <li>연평균 수수료율은 상품을 유지하는 동안 부과된 보수·비용의 합을 낸 돈의 합으로 나눈 값입니다. 오래 유지할수록 차이가 커지므로 기본 정렬을 수수료율 낮은 순으로 두었습니다.</li>
          <li>판매를 시작한 지 1년이 지나지 않은 상품은 공시 대상이 아닙니다. 연금저축신탁(은행)은 2018년 이후 신규 가입이 중단되었습니다.</li>
        </ul>
      </Card>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <FilterSelect id="pension-products-area" label="권역" labelPosition="vertical" size="md" value={filters.area} onChange={(event) => update({ area: event.target.value, productType: "all" })}>
          <option value="all">전체</option>
          {PENSION_PRODUCT_AREA_OPTIONS.map((area) => <option key={area.value} value={area.value}>{area.label}</option>)}
        </FilterSelect>
        <FilterSelect id="pension-products-sells" label="판매 여부" labelPosition="vertical" size="md" value={filters.sells} onChange={(event) => update({ sells: event.target.value })}>
          <option value="Y">판매 중만</option>
          <option value="all">판매 중단 포함</option>
        </FilterSelect>
        <FilterSelect id="pension-products-guarantees" label="원금보장" labelPosition="vertical" size="md" value={filters.guarantees} onChange={(event) => update({ guarantees: event.target.value })}>
          <option value="all">전체</option>
          <option value="Y">원금보장</option>
          <option value="N">원금 비보장</option>
        </FilterSelect>
        <FilterSelect id="pension-products-type" label="상품 유형" labelPosition="vertical" size="md" value={filters.productType} onChange={(event) => update({ productType: event.target.value })}>
          <option value="all">전체</option>
          {(state.status === "ok" ? state.data.productTypes : []).map((type) => (
            <option key={type.value} value={type.value}>{type.value} ({type.count})</option>
          ))}
          {filters.productType !== "all" && !(state.status === "ok" && state.data.productTypes.some((type) => type.value === filters.productType)) ? (
            <option value={filters.productType}>{filters.productType}</option>
          ) : null}
        </FilterSelect>
        <FilterSelect id="pension-products-sort" label="정렬" labelPosition="vertical" size="md" value={filters.sort} onChange={(event) => update({ sort: event.target.value })}>
          {PENSION_PRODUCT_SORTS.map((sort) => <option key={sort.id} value={sort.id}>{sort.label}</option>)}
        </FilterSelect>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: searchInput.trim() });
          }}
        >
          <label htmlFor="pension-products-search" className="ml-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">회사·상품 검색</label>
          <SearchPill
            id="pension-products-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onClear={() => {
              setSearchInput("");
              update({ q: "" });
            }}
            placeholder="예: 미래에셋, TDF"
          />
        </form>
      </div>

      {state.status === "loading" ? <LoadingState title="상품별 수익률·수수료율을 불러오는 중입니다" testId="pension-loading" /> : null}
      {state.status === "error" ? <DatasetError code={state.code} message={state.message} sourcePageUrl={sourcePageUrl} onRetry={reload} /> : null}
      {state.status === "ok" ? (
        <>
          <FreshnessNotice freshness={state.data.freshness} sourcePageUrl={state.data.source.pageUrl} attribution={state.data.source.attribution} />
          <div className="space-y-1 text-xs font-bold text-slate-500" data-testid="pension-result-count">
            <p>{state.data.total.toLocaleString("ko-KR")}개 상품 · {sortLabel} · {state.data.page}/{state.data.pageCount}쪽</p>
            {state.data.missingSortValueCount > 0 ? (
              <p className="font-medium">정렬 기준 값이 공시되지 않은 {state.data.missingSortValueCount.toLocaleString("ko-KR")}개 상품은 맨 뒤에 둡니다.</p>
            ) : null}
            {state.data.areas.some((area) => area.excludedRowsWithoutProductInfo > 0) ? (
              <p className="font-medium">
                {state.data.areas
                  .filter((area) => area.excludedRowsWithoutProductInfo > 0)
                  .map((area) => `${area.label} 원천 자료 중 상품 정보(판매 여부·수익률·수수료율)가 없는 ${area.excludedRowsWithoutProductInfo.toLocaleString("ko-KR")}행`)
                  .join(", ")}은 목록에서 제외했습니다.
              </p>
            ) : null}
          </div>
          {state.data.items.length === 0 ? (
            <EmptyState title="조건에 맞는 상품이 없습니다" description="권역·상품 유형을 바꾸거나 판매 중단 상품을 포함해 보세요." icon="search" actionLabel="조건 초기화" onAction={reset} />
          ) : (
            <>
              <ul className="space-y-4">
                {state.data.items.map((row) => <ProductCard key={`${row.company}|${row.product}|${row.launchDate}|${row.rcvMethod ?? ""}`} row={row} />)}
              </ul>
              <nav aria-label="상품 목록 페이지" className="flex items-center justify-center gap-4 pt-2">
                <Button variant="outline" size="sm" disabled={state.data.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, state.data.page - 1) }))}>
                  이전 페이지
                </Button>
                <span className="text-sm font-black text-slate-600 tabular-nums">{state.data.page} / {state.data.pageCount}</span>
                <Button variant="outline" size="sm" disabled={state.data.page >= state.data.pageCount} onClick={() => setFilters((current) => ({ ...current, page: state.data.page + 1 }))}>
                  다음 페이지
                </Button>
              </nav>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

export function PensionProductsClient({ initialTab, sourcePages }: { initialTab: PensionTab; sourcePages: Record<PensionTab, string> }) {
  const [tab, setTab] = useState<PensionTab>(initialTab);
  const router = useRouter();
  const pathname = usePathname();

  return (
    <PageShell>
      <PageHeader
        title="연금저축 상품"
        description="통합연금포털(금융감독원)이 공시한 연금저축 상품을 비교합니다. 참고용 정보이며, 가입 전 금융회사 상품요약서와 공시를 다시 확인하세요."
      />
      <p className="mb-6 text-xs font-medium leading-relaxed text-slate-500" data-testid="pension-compare-notice">
        연금저축은 상품 코드가 없는 공시 자료라 비교함·즐겨찾기를 지원하지 않습니다. 데이터 연동 상태는{" "}
        <Link href="/settings/data-sources" className="font-black text-primary hover:text-navy">내 설정 &gt; 데이터 신뢰 및 연동 상태</Link>
        에서 확인할 수 있습니다.
      </p>
      <SegmentedTabs
        className="mb-6"
        options={TABS}
        activeTab={tab}
        onChange={(id) => {
          const next = id === "products" ? "products" : "guaranteed";
          setTab(next);
          router.replace(next === "guaranteed" ? pathname : `${pathname}?tab=products`, { scroll: false });
        }}
      />
      {tab === "guaranteed" ? <GuaranteedPanel sourcePageUrl={sourcePages.guaranteed} /> : <ProductsPanel sourcePageUrl={sourcePages.products} />}
    </PageShell>
  );
}
