type FallbackLike = {
  mode?: string;
  reason?: string;
  generatedAt?: string;
  nextRetryAt?: string;
};

type FallbackBannerProps = {
  fallback?: FallbackLike | null;
  className?: string;
};

function formatDateTime(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("ko-KR");
}

export function FallbackBanner({ fallback, className = "" }: FallbackBannerProps) {
  const info = fallback ?? null;
  if (!info) return null;

  const mode = info.mode;
  if (mode !== "CACHE" && mode !== "REPLAY") return null;

  const generatedAt = formatDateTime(info.generatedAt);
  const nextRetryAt = formatDateTime(info.nextRetryAt);
  const modeLabel = mode === "REPLAY" ? "리플레이 스냅샷" : "캐시 데이터";

  return (
    <div className={`rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 ${className}`.trim()}>
      <p className="font-semibold">{modeLabel}로 응답 중입니다.</p>
      <p className="mt-1">
        {generatedAt ? `기준시각: ${generatedAt}` : "기준시각 정보 없음"}
        {nextRetryAt ? ` · 다음 재시도: ${nextRetryAt}` : ""}
      </p>
    </div>
  );
}
