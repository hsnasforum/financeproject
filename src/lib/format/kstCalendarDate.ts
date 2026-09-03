const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type KstCalendarParts = {
  year: number;
  month: number;
  day: number;
};

function getKstCalendarParts(date: Date): KstCalendarParts {
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("유효한 날짜가 필요합니다.");
  }

  const parts = KST_DATE_FORMATTER.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new RangeError("한국 시간 날짜를 계산하지 못했습니다.");
  }

  return { year, month, day };
}

function formatParts({ year, month, day }: KstCalendarParts): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatKstIsoDate(date = new Date()): string {
  return formatParts(getKstCalendarParts(date));
}

export function formatKstCompactDate(date = new Date()): string {
  return formatKstIsoDate(date).replaceAll("-", "");
}

export function shiftKstIsoDate(date: Date, days: number): string {
  if (!Number.isInteger(days)) {
    throw new RangeError("날짜 이동 일수는 정수여야 합니다.");
  }

  const { year, month, day } = getKstCalendarParts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatParts({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}
