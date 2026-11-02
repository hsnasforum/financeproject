import { formatFinlifeCollectedAt, formatFinlifeDisclosureMonth } from "@/lib/finlife/disclosure";
import { cn } from "@/lib/utils";

type Props = {
  disclosureMonth?: unknown;
  collectedAt?: string | null;
  className?: string;
};

export function ProductDisclosureMeta({ disclosureMonth, collectedAt, className }: Props) {
  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium leading-relaxed text-slate-500", className)}>
      <span data-testid="product-disclosure-month">원문 공시월: {formatFinlifeDisclosureMonth(disclosureMonth)}</span>
      <span data-testid="product-collection-time">수집 시각: {formatFinlifeCollectedAt(collectedAt)}</span>
    </div>
  );
}
