export function formatKrwWithEok(value: number): string {
  if (!Number.isFinite(value)) return "-";

  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  const sign = rounded < 0 ? "-" : "";

  if (abs < 100_000_000) {
    return `${sign}${abs.toLocaleString()}원`;
  }

  const eok = abs / 100_000_000;
  const eokText = Number.isInteger(eok) ? `${eok.toFixed(0)}억원` : `${eok.toFixed(1)}억원`;
  return `${sign}${eokText} (${abs.toLocaleString()}원)`;
}

export function formatAreaWithPyeong(areaM2: number): string {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return "-";
  const pyeong = areaM2 / 3.305785;
  return `${areaM2}㎡ (약 ${pyeong.toFixed(1)}평)`;
}
