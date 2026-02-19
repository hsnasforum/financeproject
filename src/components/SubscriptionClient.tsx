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
};

export function SubscriptionClient({ initialRegion = "서울" }: { initialRegion?: string }) {
  const [region, setRegion] = useState(initialRegion);
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [assumption, setAssumption] = useState("");

  const run = useCallback(async (nextRegion?: string) => {
    const regionValue = (nextRegion ?? region).trim();
    setLoading(true);
    setError("");
    const res = await fetch(`/api/public/housing/subscription?region=${encodeURIComponent(regionValue)}`, { cache: "no-store" });
    const json = await res.json();
    if (!json?.ok) {
      setError(json?.error?.message ?? "청약 공고 조회 실패");
      setLoading(false);
      return;
    }
    setItems(Array.isArray(json.data?.items) ? json.data.items : []);
    setAssumption(typeof json.data?.assumptions?.note === "string" ? json.data.assumptions.note : "");
    setLoading(false);
  }, [region]);

  useEffect(() => {
    if (!initialRegion.trim()) return;
    const timer = window.setTimeout(() => {
      void run(initialRegion.trim());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialRegion, run]);

  return (
    <main className="py-8">
      <Container>
        <SectionHeader title="청약 공고 조회" subtitle="청약홈 분양정보 · 지역별 참고 일정" />
        <Card>
          <div className="flex gap-2">
            <input className="h-10 rounded-xl border border-border px-3" value={region} onChange={(e) => setRegion(e.target.value)} />
            <Button onClick={() => void run()}>{loading ? "로딩..." : "조회"}</Button>
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
              </li>
            ))}
          </ul>
        </Card>
      </Container>
    </main>
  );
}
