import { ButtonLink } from "@/components/ui/Button";
import { formatCompareAddMessage } from "@/components/recommend/CompareAddNotice";
import { loadShelfFromSnapshot, productShelfConfig, type ProductShelfState } from "@/lib/state/productShelf";

export type CompareToggleResult = {
  // The product whose compare button was pressed; the notice is shown right after its card.
  id: string;
  status: "added" | "removed" | "replaced";
  count: number;
  max: number;
  // Products the basket dropped (oldest first) to make room for the pressed one.
  droppedLabels: string[];
};

const UNKNOWN_DROPPED_LABEL = "이전에 담은 상품";

// Reads what toggleCompare did by comparing the stored basket right before the click with the basket it
// returned. Ids are compared exactly, like toggleCompare itself; the store's FIFO limit stays the rule.
export function describeCompareToggle(input: {
  before: string[];
  after: string[];
  id: string;
  max: number;
  labelFor: (id: string) => string | null | undefined;
}): CompareToggleResult | null {
  const id = input.id.trim();
  if (!id) return null;
  const base = { id, count: input.after.length, max: input.max };
  if (input.before.includes(id)) return { ...base, status: "removed", droppedLabels: [] };
  const dropped = input.before.filter((entry) => !input.after.includes(entry));
  return {
    ...base,
    status: dropped.length > 0 ? "replaced" : "added",
    droppedLabels: dropped.map((entry) => input.labelFor(entry)?.trim() || UNKNOWN_DROPPED_LABEL),
  };
}

export function formatCompareToggleMessage(result: CompareToggleResult): { lead: string; count: string } {
  // Added and replaced reuse the recommend/catalog wording; only the removal has its own lead.
  if (result.status !== "removed") return formatCompareAddMessage({ ...result, status: result.status });
  return { lead: "비교함에서 뺐습니다.", count: formatCompareAddMessage({ ...result, status: "added" }).count };
}

// The stored basket as toggleCompare will see it, from the same two keys and the same pure loader; it reads
// only, so no migration write or event happens here.
export function readCompareBasketForToggle(storage: Pick<Storage, "getItem">): string[] {
  return loadShelfFromSnapshot(
    storage.getItem(productShelfConfig.storageKey),
    storage.getItem(productShelfConfig.legacyCompareStorageKey),
  ).compareBasket;
}

// Reads the stored basket and runs the existing toggle in the same synchronous turn, so the notice describes
// the toggle that actually ran and not the basket captured at render time.
export function toggleCompareWithNotice(input: {
  id: string;
  storage: Pick<Storage, "getItem">;
  toggle: (id: string) => ProductShelfState;
  max: number;
  labelFor: (id: string) => string | null | undefined;
}): CompareToggleResult | null {
  const before = readCompareBasketForToggle(input.storage);
  const after = input.toggle(input.id).compareBasket;
  return describeCompareToggle({ before, after, id: input.id, max: input.max, labelFor: input.labelFor });
}

// Rendered outside the card so a tap on it cannot open the detail drawer. It stays until the next toggle or
// close (no timer) and does not move focus.
export function ProductCompareToggleNotice({ result, onClose, className }: {
  result: CompareToggleResult;
  onClose: () => void;
  className?: string;
}) {
  const message = formatCompareToggleMessage(result);
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="product-compare-toggle-notice"
      data-compare-status={result.status}
      className={`rounded-2xl border border-primary/10 bg-primary/10 p-4 ${className ?? ""}`}
    >
      <p className="break-words text-sm font-black text-navy">
        <span>{message.lead}</span> <span data-testid="product-compare-toggle-count">{message.count}</span>
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
