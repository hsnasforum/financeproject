"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { formatKrwWithEok } from "@/lib/format/krw";

type FxRow = {
  currency: string;
  amount: number;
  rate: number | null;
  asOfDate: string | null;
  krw: number | null;
};

export function FxToolClient() {
  const [pairs, setPairs] = useState("USD:1000,JPY:50000");
  const [rows, setRows] = useState<FxRow[]>([]);
  const [totalKrw, setTotalKrw] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/public/fx?pairs=${encodeURIComponent(pairs)}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error?.message ?? "환율 데이터를 불러오지 못했습니다.");
        setRows([]);
        setTotalKrw(0);
        return;
      }
      setRows(Array.isArray(json.data?.items) ? (json.data.items as FxRow[]) : []);
      setTotalKrw(typeof json.data?.totalKrw === "number" ? json.data.totalKrw : 0);
    } catch (err) {
      console.error("[fx-tool] fetch failed", err);
      setError("환율 데이터를 불러오지 못했습니다.");
      setRows([]);
      setTotalKrw(0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="py-8">
      <Container>
        <SectionHeader title="환율 자동 반영" subtitle="외화 자산/지출을 기준 환율로 원화 환산하는 참고 도구" />
        <Card>
          <p className="text-xs text-slate-500">예: USD:1000,JPY:50000 형태로 입력하세요.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              외화 항목
              <input className="mt-1 block h-10 rounded-xl border border-border px-3" value={pairs} onChange={(e) => setPairs(e.target.value)} />
            </label>
            <Button type="button" size="sm" onClick={() => void run()} disabled={loading}>{loading ? "로딩..." : "환산"}</Button>
          </div>

          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}

          {rows.length > 0 ? (
            <div className="mt-3 space-y-2 text-sm">
              {rows.map((row) => (
                <div key={`${row.currency}-${row.amount}`} className="rounded-xl border border-border bg-surface-muted p-3">
                  <p>{row.currency} {row.amount.toLocaleString()} → {typeof row.krw === "number" ? formatKrwWithEok(row.krw) : "-"}</p>
                  <p className="text-xs text-slate-500">기준일: {row.asOfDate ?? "-"} · 환율: {row.rate ?? "-"}</p>
                </div>
              ))}
              <p className="font-medium">원화 합계: {formatKrwWithEok(totalKrw)}</p>
              <p className="text-xs text-slate-500">참고 지표입니다. 실제 환전/결제 시점 환율과 다를 수 있습니다.</p>
            </div>
          ) : null}
        </Card>
      </Container>
    </main>
  );
}
