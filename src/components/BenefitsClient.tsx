"use client";

import { useCallback, useEffect, useState } from "react";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type BenefitItem = {
  id: string;
  title: string;
  summary: string;
  org?: string;
  applyHow?: string;
  eligibilityHints?: string[];
};

export function BenefitsClient({ initialQuery = "주거" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<BenefitItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [assumption, setAssumption] = useState("");

  const run = useCallback(async (nextQuery?: string) => {
    const queryValue = (nextQuery ?? query).trim();
    if (!queryValue) {
      setError("검색어를 입력하세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/public/benefits/search?query=${encodeURIComponent(queryValue)}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error?.message ?? "혜택 조회 실패");
        return;
      }
      setItems(Array.isArray(json.data?.items) ? json.data.items : []);
      setAssumption(typeof json.data?.assumptions?.note === "string" ? json.data.assumptions.note : "");
    } catch {
      setError("혜택 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (!initialQuery.trim()) return;
    const timer = window.setTimeout(() => {
      void run(initialQuery.trim());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialQuery, run]);

  return (
    <main className="py-8">
      <Container>
        <SectionHeader title="혜택 후보 검색" subtitle="보조금24 연계 · 조건 기반 참고 목록" />
        <Card>
          <div className="flex gap-2">
            <input className="h-10 rounded-xl border border-border px-3" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button onClick={() => void run()}>{loading ? "로딩..." : "검색"}</Button>
          </div>
          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
          {assumption ? <p className="mt-2 text-xs text-slate-500">{assumption}</p> : null}
          <p className="mt-1 text-xs text-slate-500">혜택은 자격/소득/가구/지역 조건에 따라 실제 적용 여부가 달라질 수 있습니다.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-surface-muted p-2">
                <p className="font-medium">{item.title}</p>
                <p className="text-slate-600">{item.summary}</p>
                {item.org ? <p className="mt-1 text-xs text-slate-500">기관: {item.org}</p> : null}
                {item.applyHow ? <p className="mt-1 text-xs text-slate-500">신청 방법: {item.applyHow}</p> : null}
                {Array.isArray(item.eligibilityHints) && item.eligibilityHints.length > 0 ? (
                  <p className="mt-1 text-xs text-slate-500">조건 힌트: {item.eligibilityHints.join(" · ")}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </Container>
    </main>
  );
}
