"use client";

type Props = {
  sourceId: string;
};

export function SourceBadge({ sourceId }: Props) {
  const label = sourceId === "finlife" ? "FINLIFE" : sourceId === "datago_kdb" ? "KDB" : sourceId;
  const className = sourceId === "finlife"
    ? "bg-slate-100 text-slate-800 border-slate-300"
    : sourceId === "datago_kdb"
        ? "bg-amber-100 text-amber-900 border-amber-300"
        : "bg-zinc-100 text-zinc-700 border-zinc-300";

  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}>{label}</span>;
}
