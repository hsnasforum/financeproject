"use client";

import { useState } from "react";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type SearchItem = {
  corpCode: string;
  corpName: string;
  stockCode?: string;
};

type SortKey = "name" | "name_desc" | "stock_first";

type CompanySummary = {
  corpCode?: string;
  corpName?: string;
  stockCode?: string;
  industry?: string;
  ceo?: string;
  homepage?: string;
  address?: string;
  source?: string;
  fetchedAt?: string;
};

type IndexMeta = {
  loadedPath?: string;
  count?: number;
  generatedAt?: string;
};

type IndexStatus = {
  exists: boolean;
  primaryPath: string;
  triedPaths: string[];
  meta?: {
    loadedPath?: string;
    mtimeMs?: number;
    generatedAt?: string;
    count?: number;
  };
};

const INDEX_HINT = "python3 scripts/dart_corpcode_build.py";
const INDEX_HINT_WITH_PATH = "DART_CORPCODES_INDEX_PATH=tmp/dart/corpCodes.index.json python3 scripts/dart_corpcode_build.py";

export function InvestCompaniesClient() {
  const [queryInput, setQueryInput] = useState("삼성");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchItems, setSearchItems] = useState<SearchItem[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [indexMeta, setIndexMeta] = useState<IndexMeta | null>(null);
  const [indexMissing, setIndexMissing] = useState(false);
  const [canAutoBuild, setCanAutoBuild] = useState(false);
  const [autoBuildDisabledReason, setAutoBuildDisabledReason] = useState("");
  const [buildEndpoint, setBuildEndpoint] = useState("/api/public/disclosure/corpcodes/build");
  const [statusEndpoint, setStatusEndpoint] = useState("/api/public/disclosure/corpcodes/status");
  const [primaryPath, setPrimaryPath] = useState("");
  const [triedPaths, setTriedPaths] = useState<string[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [buildDone, setBuildDone] = useState("");
  const [selectedCode, setSelectedCode] = useState("");

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detail, setDetail] = useState<CompanySummary | null>(null);

  async function searchCompanies() {
    const query = queryInput.trim();
    if (!query) {
      setSearchError("회사명 검색어를 입력하세요.");
      setSearchItems([]);
      setSearchTotal(0);
      return;
    }

    setSearchLoading(true);
    setSearchError("");
    setBuildError("");
    setBuildDone("");
    setCanAutoBuild(false);
    setAutoBuildDisabledReason("");
    setIndexMissing(false);
    setStatusError("");
    setPrimaryPath("");
    setTriedPaths([]);
    setDetail(null);
    setDetailError("");
    setSelectedCode("");

    try {
      const params = new URLSearchParams({
        query,
        sort: sortKey,
        limit: "50",
      });
      if (process.env.NODE_ENV !== "production") {
        params.set("debug", "1");
      }
      const res = await fetch(`/api/public/disclosure/corpcodes/search?${params.toString()}`, { cache: "no-store" });
      const raw = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        const message = typeof raw.message === "string" ? raw.message : "회사 검색에 실패했습니다.";
        const code = typeof raw.error === "string" ? raw.error : "";
        if (res.status === 409 || code === "CORPCODES_INDEX_MISSING") {
          setIndexMissing(true);
          setSearchError(`${message} 기본: ${INDEX_HINT} / 경로 지정: ${INDEX_HINT_WITH_PATH}`);
          setCanAutoBuild(Boolean(raw.canAutoBuild));
          setAutoBuildDisabledReason(typeof raw.autoBuildDisabledReason === "string" ? raw.autoBuildDisabledReason : "");
          setBuildEndpoint(typeof raw.buildEndpoint === "string" ? raw.buildEndpoint : "/api/public/disclosure/corpcodes/build");
          setStatusEndpoint(typeof raw.statusEndpoint === "string" ? raw.statusEndpoint : "/api/public/disclosure/corpcodes/status");
          setPrimaryPath(typeof raw.primaryPath === "string" ? raw.primaryPath : "");
          setTriedPaths(Array.isArray(raw.triedPaths) ? raw.triedPaths.filter((x): x is string => typeof x === "string") : []);
        } else {
          setSearchError(message);
        }
        setSearchItems([]);
        setSearchTotal(0);
        setIndexMeta(null);
        return;
      }

      const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
      const items = (itemsRaw as unknown[])
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const item = row as Record<string, unknown>;
          const corpCode = typeof item.corpCode === "string" ? item.corpCode : "";
          const corpName = typeof item.corpName === "string" ? item.corpName : "";
          if (!corpCode || !corpName) return null;
          const result: SearchItem = {
            corpCode,
            corpName,
          };
          if (typeof item.stockCode === "string") {
            result.stockCode = item.stockCode;
          }
          return result;
        })
        .filter((value): value is SearchItem => value !== null);

      setSearchItems(items);
      setSearchTotal(typeof raw.total === "number" ? raw.total : items.length);
      setIndexMeta(typeof raw.indexMeta === "object" && raw.indexMeta !== null ? (raw.indexMeta as IndexMeta) : null);
    } catch (error) {
      console.error("[invest-companies] search failed", error);
      setSearchError("회사 검색에 실패했습니다. 잠시 후 다시 시도하세요.");
      setSearchItems([]);
      setSearchTotal(0);
      setIndexMeta(null);
      setIndexMissing(false);
    } finally {
      setSearchLoading(false);
    }
  }

  async function fetchIndexStatus() {
    setStatusLoading(true);
    setStatusError("");
    try {
      const res = await fetch(statusEndpoint, { cache: "no-store" });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setStatusError(typeof raw.message === "string" ? raw.message : "인덱스 상태 조회에 실패했습니다.");
        return;
      }
      const exists = raw.exists === true;
      const nextStatus: IndexStatus = {
        exists,
        primaryPath: typeof raw.primaryPath === "string" ? raw.primaryPath : "",
        triedPaths: Array.isArray(raw.triedPaths) ? raw.triedPaths.filter((x): x is string => typeof x === "string") : [],
        meta: typeof raw.meta === "object" && raw.meta !== null ? (raw.meta as IndexStatus["meta"]) : undefined,
      };
      setPrimaryPath(nextStatus.primaryPath);
      setTriedPaths(nextStatus.triedPaths);
      setIndexStatus(nextStatus);
    } catch (error) {
      console.error("[invest-companies] status failed", error);
      setStatusError("인덱스 상태 조회에 실패했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setStatusLoading(false);
    }
  }

  async function autoBuildIndex() {
    setBuildLoading(true);
    setBuildError("");
    setBuildDone("");
    try {
      const res = await fetch(buildEndpoint, {
        method: "POST",
        cache: "no-store",
      });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!res.ok || raw.ok !== true) {
        const message = typeof raw.message === "string" ? raw.message : "인덱스 자동 생성에 실패했습니다.";
        const stderrTail = typeof raw.stderrTail === "string" ? raw.stderrTail : "";
        setBuildError(stderrTail ? `${message} (${stderrTail})` : message);
        if (typeof raw.status === "object" && raw.status !== null) {
          const status = raw.status as IndexStatus;
          setIndexStatus(status);
          setPrimaryPath(status.primaryPath ?? "");
          setTriedPaths(Array.isArray(status.triedPaths) ? status.triedPaths : []);
        }
        return;
      }

      if (typeof raw.status === "object" && raw.status !== null) {
        const status = raw.status as IndexStatus;
        setIndexStatus(status);
        setPrimaryPath(status.primaryPath ?? "");
        setTriedPaths(Array.isArray(status.triedPaths) ? status.triedPaths : []);
      }
      const count = typeof (raw.status as Record<string, unknown> | undefined)?.meta === "object"
        ? ((raw.status as Record<string, unknown>).meta as Record<string, unknown>)?.count
        : undefined;
      const countText = typeof count === "number" ? ` (count=${count})` : "";
      setBuildDone(`인덱스 생성이 완료되었습니다${countText}. 검색을 다시 시도합니다.`);
      await searchCompanies();
    } catch (error) {
      console.error("[invest-companies] auto build failed", error);
      setBuildError("인덱스 자동 생성에 실패했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBuildLoading(false);
    }
  }

  async function loadCompany(corpCode: string) {
    setSelectedCode(corpCode);
    setDetailLoading(true);
    setDetailError("");

    try {
      const res = await fetch(`/api/public/disclosure/company?corpCode=${encodeURIComponent(corpCode)}`, { cache: "no-store" });
      const raw = (await res.json()) as Record<string, unknown>;

      if (!res.ok || raw.ok !== true || typeof raw.data !== "object" || raw.data === null) {
        const err = (raw.error as Record<string, unknown> | undefined) ?? undefined;
        const message = typeof err?.message === "string" ? err.message : "기업개황 조회에 실패했습니다.";
        setDetailError(message);
        setDetail(null);
        return;
      }

      const data = raw.data as Record<string, unknown>;
      setDetail({
        corpCode: typeof data.corpCode === "string" ? data.corpCode : undefined,
        corpName: typeof data.corpName === "string" ? data.corpName : undefined,
        stockCode: typeof data.stockCode === "string" ? data.stockCode : undefined,
        industry: typeof data.industry === "string" ? data.industry : undefined,
        ceo: typeof data.ceo === "string" ? data.ceo : undefined,
        homepage: typeof data.homepage === "string" ? data.homepage : undefined,
        address: typeof data.address === "string" ? data.address : undefined,
        source: typeof data.source === "string" ? data.source : undefined,
        fetchedAt: typeof data.fetchedAt === "string" ? data.fetchedAt : undefined,
      });
    } catch (error) {
      console.error("[invest-companies] company failed", error);
      setDetailError("기업개황 조회에 실패했습니다. 잠시 후 다시 시도하세요.");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <main className="py-8">
      <Container>
        <SectionHeader 
          title="기업개황 보조정보" 
          subtitle="회사명 검색 → corp_code 선택 → 기업개황 조회" 
          icon="/icons/ic-dashboard.png"
        />

        <Card>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void searchCompanies();
            }}
          >
            <label className="text-sm">
              회사명 검색
              <input
                className="mt-1 block h-10 rounded-xl border border-border px-3"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="예: 삼성"
              />
            </label>
            <label className="text-sm">
              정렬
              <select className="mt-1 block h-10 rounded-xl border border-border bg-surface px-3" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                <option value="name">회사명 가나다순</option>
                <option value="name_desc">회사명 역순</option>
                <option value="stock_first">상장사 우선</option>
              </select>
            </label>
            <Button type="submit">검색</Button>
          </form>
          <p className="mt-2 text-xs text-slate-600">결과 {searchItems.length}건 / 총 {searchTotal}건</p>
          {process.env.NODE_ENV !== "production" && indexMeta ? (
            <details className="mt-2 text-xs text-slate-500">
              <summary>자세히(개발)</summary>
              <p>loadedPath: {indexMeta.loadedPath ?? "-"}</p>
              <p>count: {indexMeta.count ?? "-"}</p>
              <p>generatedAt: {indexMeta.generatedAt ?? "-"}</p>
            </details>
          ) : null}
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="text-base font-semibold">회사 목록</h2>
            {searchLoading ? <p className="mt-3 text-sm text-slate-600">검색 중...</p> : null}
            {!searchLoading && searchError ? <p className="mt-3 text-sm text-red-700">{searchError}</p> : null}
            {!searchLoading && indexMissing ? (
              <div className="mt-2 rounded-xl border border-border bg-surface-muted p-2">
                <p className="text-xs text-slate-600">OpenDART corpCode ZIP/XML을 내려받아 로컬 인덱스를 생성합니다. 수 초~수 분 걸릴 수 있어요.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void fetchIndexStatus()} disabled={statusLoading}>
                    {statusLoading ? "인덱스 상태 확인 중..." : "인덱스 상태 확인"}
                  </Button>
                  <Button className="" size="sm" onClick={() => void autoBuildIndex()} disabled={buildLoading || !canAutoBuild}>
                    {buildLoading ? "인덱스 생성 중..." : "인덱스 자동 생성(1회)"}
                  </Button>
                </div>
                {!canAutoBuild && autoBuildDisabledReason ? <p className="mt-1 text-xs text-amber-700">{autoBuildDisabledReason}</p> : null}
                {primaryPath ? <p className="mt-1 text-xs text-slate-500">primaryPath: {primaryPath}</p> : null}
                {triedPaths.length > 0 ? <p className="mt-1 text-xs text-slate-500">triedPaths: {triedPaths.join(" | ")}</p> : null}
                {statusError ? <p className="mt-1 text-xs text-red-700">{statusError}</p> : null}
                {indexStatus ? (
                  <details className="mt-1 text-xs text-slate-600">
                    <summary>status 응답(개발)</summary>
                    <p>exists: {String(indexStatus.exists)}</p>
                    <p>loadedPath: {indexStatus.meta?.loadedPath ?? "-"}</p>
                    <p>mtimeMs: {typeof indexStatus.meta?.mtimeMs === "number" ? String(indexStatus.meta?.mtimeMs) : "-"}</p>
                    <p>count: {typeof indexStatus.meta?.count === "number" ? String(indexStatus.meta?.count) : "-"}</p>
                    <p>generatedAt: {indexStatus.meta?.generatedAt ?? "-"}</p>
                  </details>
                ) : null}
                {buildError ? <p className="mt-1 text-xs text-red-700">{buildError}</p> : null}
                {buildDone ? <p className="mt-1 text-xs text-green-700">{buildDone}</p> : null}
              </div>
            ) : null}
            {!searchLoading && !searchError && searchItems.length === 0 ? <p className="mt-3 text-sm text-slate-600">검색 결과가 없습니다.</p> : null}

            {!searchLoading && !searchError && searchItems.length > 0 ? (
              <ul className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
                {searchItems.map((item) => (
                  <li key={item.corpCode} className="rounded-xl border border-border bg-surface-muted p-3">
                    <p className="text-sm font-medium">{item.corpName}</p>
                    <p className="text-xs text-slate-600">
                      corp_code {item.corpCode}
                      {item.stockCode ? ` · 종목코드 ${item.stockCode}` : " · 비상장"}
                    </p>
                    <Button className="mt-2" size="sm" onClick={() => void loadCompany(item.corpCode)}>
                      기업개황 조회
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card>
            <h2 className="text-base font-semibold">기업개황 상세</h2>
            {selectedCode ? <p className="mt-1 text-xs text-slate-500">선택 corp_code: {selectedCode}</p> : null}

            {detailLoading ? <p className="mt-3 text-sm text-slate-600">로딩 중...</p> : null}
            {!detailLoading && detailError ? <p className="mt-3 text-sm text-red-700">{detailError}</p> : null}
            {!detailLoading && !detailError && !detail ? <p className="mt-3 text-sm text-slate-600">왼쪽 목록에서 회사를 선택하세요.</p> : null}

            {!detailLoading && !detailError && detail ? (
              <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
                <div><dt className="text-slate-500">회사명</dt><dd className="font-medium text-slate-900">{detail.corpName ?? "-"}</dd></div>
                <div><dt className="text-slate-500">corp_code</dt><dd>{detail.corpCode ?? "-"}</dd></div>
                <div><dt className="text-slate-500">종목코드</dt><dd>{detail.stockCode ?? "-"}</dd></div>
                <div><dt className="text-slate-500">대표자</dt><dd>{detail.ceo ?? "-"}</dd></div>
                <div><dt className="text-slate-500">업종코드</dt><dd>{detail.industry ?? "-"}</dd></div>
                <div><dt className="text-slate-500">홈페이지</dt><dd>{detail.homepage ?? "-"}</dd></div>
                <div><dt className="text-slate-500">주소</dt><dd>{detail.address ?? "-"}</dd></div>
                <div><dt className="text-slate-500">출처</dt><dd>{detail.source ?? "-"}</dd></div>
              </dl>
            ) : null}
          </Card>
        </div>
      </Container>
    </main>
  );
}
