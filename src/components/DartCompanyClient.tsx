"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { parseDartCompanyResponse } from "@/lib/publicApis/dart/apiSchema";
import { type CorpIndexItem, type DartCompany } from "@/lib/publicApis/dart/types";

type SortKey = "nameAsc" | "nameDesc" | "stockFirst";
type CorpIndexMissingPayload = {
  error?: string;
  message?: string;
  hintCommand?: string;
  hintCommandWithPath?: string;
  primaryPath?: string;
  triedPaths?: string[];
  canAutoBuild?: boolean;
  autoBuildDisabledReason?: string;
  buildEndpoint?: string;
  statusEndpoint?: string;
};

type CorpIndexStatusPayload = {
  exists: boolean;
  primaryPath?: string;
  triedPaths?: string[];
  meta?: {
    loadedPath?: string;
    mtimeMs?: number;
    generatedAt?: string;
    count?: number;
  };
};

type CorpIndexBuildResult = {
  ok?: boolean;
  outPath?: string;
  tookMs?: number;
  status?: CorpIndexStatusPayload;
  message?: string;
  error?: string;
  stdoutTail?: string;
  stderrTail?: string;
};

export function DartCompanyClient() {
  const [queryInput, setQueryInput] = useState("삼성");
  const [query, setQuery] = useState("삼성");
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [items, setItems] = useState<CorpIndexItem[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("nameAsc");
  const [missingIndex, setMissingIndex] = useState<CorpIndexMissingPayload | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusResult, setStatusResult] = useState<CorpIndexStatusPayload | null>(null);
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState("");
  const [buildResult, setBuildResult] = useState<CorpIndexBuildResult | null>(null);
  const [buildNotice, setBuildNotice] = useState("");

  const [selectedCode, setSelectedCode] = useState("");
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [companyError, setCompanyError] = useState("");
  const [company, setCompany] = useState<DartCompany | null>(null);

  async function search(options?: { preserveBuildState?: boolean }) {
    const preserveBuildState = options?.preserveBuildState === true;
    setLoadingSearch(true);
    setSearchError("");
    setMissingIndex(null);
    setStatusError("");
    setStatusResult(null);
    if (!preserveBuildState) {
      setBuildError("");
      setBuildResult(null);
      setBuildNotice("");
    }
    setCompany(null);
    setSelectedCode("");

    try {
      const params = new URLSearchParams({
        query: queryInput.trim(),
        sort: sortKey === "nameAsc" ? "name" : sortKey === "nameDesc" ? "name_desc" : "stock_first",
        limit: "50",
      });
      const res = await fetch(`/api/public/disclosure/corpcodes/search?${params.toString()}`, { cache: "no-store" });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const missing = raw as CorpIndexMissingPayload;
        if (res.status === 409 || missing.error === "CORPCODES_INDEX_MISSING") {
          setMissingIndex(missing);
          setSearchError(missing.message ?? "corpCodes 인덱스가 없습니다.");
          setItems([]);
          return;
        }
        const message = typeof raw?.message === "string" ? raw.message : "검색에 실패했습니다.";
        setSearchError(message);
        setItems([]);
        return;
      }
      const rows = Array.isArray(raw?.items) ? raw.items : [];
      const normalized: CorpIndexItem[] = rows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const data = row as Record<string, unknown>;
          const corp_code = typeof data.corpCode === "string" ? data.corpCode : "";
          const corp_name = typeof data.corpName === "string" ? data.corpName : "";
          if (!corp_code || !corp_name) return null;
          return {
            corp_code,
            corp_name,
            stock_code: typeof data.stockCode === "string" ? data.stockCode : undefined,
          };
        })
        .filter((v): v is CorpIndexItem => Boolean(v));
      setQuery(queryInput.trim());
      setItems(normalized);
    } catch (error) {
      setSearchError("검색 결과를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      console.error("[dart-ui] search failed", error);
      setItems([]);
    } finally {
      setLoadingSearch(false);
    }
  }

  async function fetchCompany(corpCode: string) {
    setSelectedCode(corpCode);
    setLoadingCompany(true);
    setCompanyError("");

    try {
      const res = await fetch(`/api/public/dart/company?corpCode=${encodeURIComponent(corpCode)}`, { cache: "no-store" });
      const raw = await res.json();
      const parsed = parseDartCompanyResponse(raw);
      if (!parsed.ok) {
        setCompanyError(parsed.error.message);
        setCompany(null);
        return;
      }
      setCompany(parsed.data);
    } catch (error) {
      setCompanyError("기업개황을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      console.error("[dart-ui] company failed", error);
      setCompany(null);
    } finally {
      setLoadingCompany(false);
    }
  }

  async function fetchIndexStatus() {
    if (!missingIndex) return;
    const endpoint = missingIndex.statusEndpoint ?? "/api/public/disclosure/corpcodes/status";
    console.info("[dart-ui] calling status endpoint", endpoint);

    setStatusLoading(true);
    setStatusError("");
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const raw = (await res.json()) as CorpIndexStatusPayload & { message?: string };
      if (!res.ok) {
        setStatusError(raw.message ?? "인덱스 상태를 불러오지 못했습니다.");
        return;
      }
      setStatusResult(raw);
    } catch (error) {
      setStatusError("인덱스 상태를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      console.error("[dart-ui] status failed", error);
    } finally {
      setStatusLoading(false);
    }
  }

  async function buildCorpIndex() {
    if (!missingIndex) return;
    const endpoint = missingIndex.buildEndpoint ?? "/api/public/disclosure/corpcodes/build";
    console.info("[dart-ui] calling build endpoint", endpoint);

    setBuildLoading(true);
    setBuildError("");
    setBuildResult(null);
    setBuildNotice("");
    setStatusResult(null);

    try {
      const res = await fetch(endpoint, { method: "POST", cache: "no-store" });
      const raw = (await res.json()) as CorpIndexBuildResult;
      setBuildResult(raw);

      if (!res.ok || raw.ok !== true) {
        const message = typeof raw.message === "string" ? raw.message : "인덱스 자동 생성에 실패했습니다.";
        setBuildError(message);
        return;
      }

      const count = typeof raw.status?.meta?.count === "number" ? raw.status.meta.count : null;
      const generatedAt = typeof raw.status?.meta?.generatedAt === "string" ? raw.status.meta.generatedAt : null;
      const countText = count !== null ? `count=${count}` : "count=-";
      const generatedText = generatedAt ?? "-";
      setBuildNotice(`인덱스 생성 완료 (${countText}, generatedAt=${generatedText})`);

      await search({ preserveBuildState: true });
      await fetchIndexStatus();
    } catch (error) {
      setBuildError("인덱스 자동 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
      console.error("[dart-ui] build failed", error);
    } finally {
      setBuildLoading(false);
    }
  }

  const sorted = useMemo(() => {
    const base = [...items];
    if (sortKey === "nameAsc") return base.sort((a, b) => a.corp_name.localeCompare(b.corp_name));
    if (sortKey === "nameDesc") return base.sort((a, b) => b.corp_name.localeCompare(a.corp_name));
    return base.sort((a, b) => Number(Boolean(b.stock_code)) - Number(Boolean(a.stock_code)));
  }, [items, sortKey]);

  return (
    <main className="py-8">
      <Container>
        <SectionHeader title="OpenDART 기업개황 조회" subtitle="회사명 검색 → corp_code 선택 → 기업개황 조회" />

        <Card>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <label className="text-sm">
              회사명 검색
              <input
                className="mt-1 block h-10 rounded-xl border border-border bg-surface px-3 text-sm"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="예: 삼성"
              />
            </label>
            <label className="text-sm">
              정렬
              <select className="mt-1 block h-10 rounded-xl border border-border bg-surface px-3 text-sm" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                <option value="nameAsc">회사명 가나다순</option>
                <option value="nameDesc">회사명 역순</option>
                <option value="stockFirst">상장사 우선</option>
              </select>
            </label>
            <Button type="submit" variant="primary">검색</Button>
          </form>
          {query ? <p className="mt-2 text-xs text-slate-600">검색어: {query} · {sorted.length}건</p> : null}
          {buildNotice ? <p className="mt-2 text-xs text-green-700">{buildNotice}</p> : null}
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="text-base font-semibold">회사 목록</h2>

            {loadingSearch ? <p className="mt-3 text-sm text-slate-600">로딩 중...</p> : null}
            {!loadingSearch && searchError ? <p className="mt-3 text-sm text-red-700">{searchError}</p> : null}
            {!loadingSearch && missingIndex ? (
              <div className="mt-3 rounded-xl border border-border bg-surface-muted p-3">
                <p className="text-xs text-slate-700">corpCodes 인덱스가 아직 생성되지 않아 검색이 불가능합니다(1회 생성 필요).</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void fetchIndexStatus()} disabled={statusLoading}>
                    {statusLoading ? "인덱스 상태 확인 중..." : "인덱스 상태 확인"}
                  </Button>
                  <Button size="sm" onClick={() => void buildCorpIndex()} disabled={buildLoading || missingIndex.canAutoBuild === false}>
                    {buildLoading ? "인덱스 생성 중..." : "인덱스 자동 생성(1회)"}
                  </Button>
                </div>
                {missingIndex.canAutoBuild === false && missingIndex.autoBuildDisabledReason ? (
                  <p className="mt-1 text-xs text-amber-700">{missingIndex.autoBuildDisabledReason}</p>
                ) : null}
                {buildError ? <p className="mt-1 text-xs text-red-700">{buildError}</p> : null}
                {statusError ? <p className="mt-1 text-xs text-red-700">{statusError}</p> : null}
                {missingIndex.hintCommand ? <p className="mt-1 text-xs text-slate-600">수동 생성: {missingIndex.hintCommand}</p> : null}
                {missingIndex.hintCommandWithPath ? <p className="mt-1 text-xs text-slate-600">경로 지정: {missingIndex.hintCommandWithPath}</p> : null}
                <details className="mt-2 text-xs text-slate-600">
                  <summary>상태/빌드 자세히(개발)</summary>
                  <p>primaryPath: {missingIndex.primaryPath ?? "-"}</p>
                  <p>triedPaths: {Array.isArray(missingIndex.triedPaths) ? missingIndex.triedPaths.join(" | ") : "-"}</p>
                  <p>status.exists: {typeof statusResult?.exists === "boolean" ? String(statusResult.exists) : "-"}</p>
                  <p>status.count: {typeof statusResult?.meta?.count === "number" ? String(statusResult.meta.count) : "-"}</p>
                  <p>status.generatedAt: {statusResult?.meta?.generatedAt ?? "-"}</p>
                  <p>status.loadedPath: {statusResult?.meta?.loadedPath ?? "-"}</p>
                  <p>build.ok: {typeof buildResult?.ok === "boolean" ? String(buildResult.ok) : "-"}</p>
                  <p>build.outPath: {buildResult?.outPath ?? "-"}</p>
                  <p>build.tookMs: {typeof buildResult?.tookMs === "number" ? String(buildResult.tookMs) : "-"}</p>
                  <p>build.count: {typeof buildResult?.status?.meta?.count === "number" ? String(buildResult.status.meta.count) : "-"}</p>
                  <p>build.generatedAt: {buildResult?.status?.meta?.generatedAt ?? "-"}</p>
                </details>
              </div>
            ) : null}
            {!loadingSearch && !searchError && sorted.length === 0 ? <p className="mt-3 text-sm text-slate-600">검색 결과가 없습니다.</p> : null}

            {!loadingSearch && !searchError && sorted.length > 0 ? (
              <ul className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
                {sorted.map((item) => (
                  <li key={item.corp_code} className="rounded-xl border border-border bg-surface-muted p-3">
                    <p className="text-sm font-medium">{item.corp_name}</p>
                    <p className="text-xs text-slate-600">corp_code {item.corp_code} {item.stock_code ? `· 종목코드 ${item.stock_code}` : "· 비상장"}</p>
                    <Button className="mt-2" size="sm" onClick={() => void fetchCompany(item.corp_code)}>기업개황 조회</Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card>
            <h2 className="text-base font-semibold">기업개황 상세</h2>
            {selectedCode ? <p className="mt-1 text-xs text-slate-500">선택 corp_code: {selectedCode}</p> : null}

            {loadingCompany ? <p className="mt-3 text-sm text-slate-600">로딩 중...</p> : null}
            {!loadingCompany && companyError ? <p className="mt-3 text-sm text-red-700">{companyError}</p> : null}
            {!loadingCompany && !companyError && !company ? <p className="mt-3 text-sm text-slate-600">왼쪽 목록에서 회사를 선택하세요.</p> : null}

            {!loadingCompany && !companyError && company ? (
              <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
                <div><dt className="text-slate-500">회사명</dt><dd className="font-medium text-slate-900">{company.corp_name ?? "-"}</dd></div>
                <div><dt className="text-slate-500">영문명</dt><dd>{company.corp_name_eng ?? "-"}</dd></div>
                <div><dt className="text-slate-500">종목코드</dt><dd>{company.stock_code ?? "-"}</dd></div>
                <div><dt className="text-slate-500">대표자</dt><dd>{company.ceo_nm ?? "-"}</dd></div>
                <div><dt className="text-slate-500">법인구분</dt><dd>{company.corp_cls ?? "-"}</dd></div>
                <div><dt className="text-slate-500">주소</dt><dd>{company.adres ?? "-"}</dd></div>
                <div><dt className="text-slate-500">홈페이지</dt><dd>{company.hm_url ?? "-"}</dd></div>
                <div><dt className="text-slate-500">업종코드</dt><dd>{company.induty_code ?? "-"}</dd></div>
                <div><dt className="text-slate-500">설립일</dt><dd>{company.est_dt ?? "-"}</dd></div>
                <div><dt className="text-slate-500">결산월</dt><dd>{company.acc_mt ?? "-"}</dd></div>
              </dl>
            ) : null}
          </Card>
        </div>
      </Container>
    </main>
  );
}
