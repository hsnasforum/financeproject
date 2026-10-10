/** Read only the FINLIFE original month; collection/storage dates are not disclosure evidence. */
export function normalizeFinlifeDisclosureMonth(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const month = value.trim();
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) === 0) return null;
  return month;
}

export function formatFinlifeDisclosureMonth(value: unknown): string {
  const month = normalizeFinlifeDisclosureMonth(value);
  return month ? `${month.slice(0, 4)}년 ${Number(month.slice(4))}월` : "확인되지 않음";
}

export function formatFinlifeCollectedAt(value?: string | null): string {
  if (!value) return "확인되지 않음";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "확인되지 않음";
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", hour12: false,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
