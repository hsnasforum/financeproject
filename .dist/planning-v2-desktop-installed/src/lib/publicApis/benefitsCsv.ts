export function csvEscape(value: unknown): string {
  const text = String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[,"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
