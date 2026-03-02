"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type OpenDartStatusPayload = {
  exists?: boolean;
  primaryPath?: string;
  triedPaths?: string[];
  meta?: {
    loadedPath?: string;
    generatedAt?: string;
    count?: number;
  };
  error?: string;
  message?: string;
  canAutoBuild?: boolean;
  autoBuildDisabledReason?: string;
  buildEndpoint?: string;
};

type BuildResponse = {
  ok?: boolean;
  message?: string;
  status?: OpenDartStatusPayload;
};

function formatDateTime(value: string | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR");
}

export function OpenDartStatusCard({ configured }: { configured: boolean }) {
  const isDev = process.env.NODE_ENV !== "production";
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<OpenDartStatusPayload | null>(null);
  const [error, setError] = useState("");
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildNotice, setBuildNotice] = useState("");
  const [buildError, setBuildError] = useState("");

  async function fetchStatus() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/public/disclosure/corpcodes/status", { cache: "no-store" });
      const raw = (await res.json()) as OpenDartStatusPayload;
      if (!res.ok && res.status !== 409) {
        setError(raw.message ?? "상태를 불러오지 못했습니다.");
        setStatus(null);
        return;
      }
      setStatus(raw);
    } catch {
      setError("상태를 불러오지 못했습니다.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  async function buildIndex() {
    setBuildLoading(true);
    setBuildNotice("");
    setBuildError("");
    const endpoint = status?.buildEndpoint ?? "/api/public/disclosure/corpcodes/build";
    try {
      const res = await fetch(endpoint, { method: "POST", cache: "no-store" });
      const raw = (await res.json()) as BuildResponse;
      if (!res.ok || raw.ok !== true) {
        setBuildError(raw.message ?? "인덱스 생성에 실패했습니다.");
        return;
      }
      setBuildNotice("인덱스 생성이 완료되었습니다.");
      setStatus(raw.status ?? null);
      await fetchStatus();
    } catch {
      setBuildError("인덱스 생성 중 오류가 발생했습니다.");
    } finally {
      setBuildLoading(false);
    }
  }

  useEffect(() => {
    void fetchStatus();
  }, []);

  const exists = status?.exists === true;

  return (
    <Card className="mt-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">OpenDART</p>
          <p className="text-xs text-slate-500">corpCodes 인덱스 및 키 상태</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          key {configured ? "configured" : "missing"}
        </span>
      </div>

      {loading ? <p className="mt-2 text-xs text-slate-500">상태 로딩 중...</p> : null}
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}

      {status ? (
        <div className="mt-2 text-xs text-slate-700">
          <p>indexExists: {exists ? "yes" : "no"}</p>
          <p>primaryPath: {status.primaryPath ?? "-"}</p>
          <p>loadedPath: {status.meta?.loadedPath ?? "-"}</p>
          <p>generatedAt: {formatDateTime(status.meta?.generatedAt)}</p>
          <p>count: {typeof status.meta?.count === "number" ? status.meta.count : "-"}</p>
          {Array.isArray(status.triedPaths) ? <p>triedPaths: {status.triedPaths.join(" | ")}</p> : null}
          {!exists && status.message ? <p className="mt-1 text-amber-700">{status.message}</p> : null}
        </div>
      ) : null}

      {isDev ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void fetchStatus()} disabled={loading}>
            상태 새로고침
          </Button>
          <Button
            size="sm"
            onClick={() => void buildIndex()}
            disabled={buildLoading || status?.canAutoBuild === false}
          >
            {buildLoading ? "인덱스 생성 중..." : "인덱스 생성"}
          </Button>
          {status?.canAutoBuild === false && status.autoBuildDisabledReason ? (
            <p className="text-xs text-amber-700">{status.autoBuildDisabledReason}</p>
          ) : null}
        </div>
      ) : null}

      {buildNotice ? <p className="mt-2 text-xs text-emerald-700">{buildNotice}</p> : null}
      {buildError ? <p className="mt-2 text-xs text-rose-700">{buildError}</p> : null}
    </Card>
  );
}
