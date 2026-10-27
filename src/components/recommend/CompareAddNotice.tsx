import { ButtonLink } from "@/components/ui/Button";
import { compareIdKey } from "@/lib/products/compareStore";

export type CompareAddResult = {
  // The product just added; the notice is shown next to its button so it is visible where the user tapped.
  id: string;
  status: "added" | "duplicate" | "replaced";
  count: number;
  max: number;
  // Products the basket dropped (oldest first) to make room for the new one.
  droppedLabels: string[];
};

const UNKNOWN_DROPPED_LABEL = "이전에 담은 상품";

// Reads what addCompareIdToStorage did by comparing the basket before and after; the store's
// FIFO limit and duplicate policy stay the single source of truth.
export function describeCompareAdd(input: {
  before: string[];
  after: string[];
  id: string;
  max: number;
  labelFor: (id: string) => string | null | undefined;
}): CompareAddResult {
  const id = input.id.trim();
  const key = compareIdKey(id);
  const afterKeys = new Set(input.after.map(compareIdKey));
  // Compared by the store's key: an alias of the pressed product is a duplicate, a product stored under two aliases
  // is named once, and an alias the store merged away is not reported as a removed product.
  const droppedKeys = new Set<string>();
  const dropped: string[] = [];
  for (const entry of input.before) {
    const entryKey = compareIdKey(entry);
    if (afterKeys.has(entryKey) || droppedKeys.has(entryKey)) continue;
    droppedKeys.add(entryKey);
    dropped.push(entry);
  }
  const status = input.before.some((entry) => compareIdKey(entry) === key) ? "duplicate" : dropped.length > 0 ? "replaced" : "added";
  return {
    id,
    status,
    count: input.after.length,
    max: input.max,
    droppedLabels: dropped.map((entry) => input.labelFor(entry)?.trim() || UNKNOWN_DROPPED_LABEL),
  };
}

export function formatCompareAddMessage(result: CompareAddResult): { lead: string; count: string } {
  const count = `현재 비교함 ${result.count}/${result.max}개입니다.`;
  if (result.status === "duplicate") return { lead: "이미 비교함에 있는 상품입니다.", count };
  if (result.status === "replaced") {
    return {
      lead: `비교함은 최대 ${result.max}개까지라 먼저 담은 ${result.droppedLabels.join(", ")}을(를) 빼고 새 상품을 담았습니다.`,
      count,
    };
  }
  return { lead: "상품이 비교함에 담겼습니다.", count };
}

// Stays until the next add or close so keyboard users can reach the link (no auto-dismiss timer).
export function CompareAddNotice({ result, onClose, className }: {
  result: CompareAddResult;
  onClose: () => void;
  className?: string;
}) {
  const message = formatCompareAddMessage(result);
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="compare-add-notice"
      data-compare-status={result.status}
      className={`rounded-2xl border border-primary/10 bg-primary/10 p-4 ${className ?? ""}`}
    >
      <p className="break-words text-sm font-black text-navy">
        <span>{message.lead}</span> <span data-testid="compare-add-count">{message.count}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ButtonLink href="/products/compare" variant="outline" className="min-h-11 rounded-2xl border-slate-200 bg-white px-5 font-black text-slate-700 hover:bg-surface-muted">
          비교함에서 나란히 보기
        </ButtonLink>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-2xl px-4 text-xs font-bold text-slate-600 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          안내 닫기
        </button>
      </div>
    </div>
  );
}
