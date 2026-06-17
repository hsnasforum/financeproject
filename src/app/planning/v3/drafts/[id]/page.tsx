import { DraftDetailClient, type DraftDetail } from "./_components/DraftDetailClient";
import {
  toPlanningPageLoadMessage,
  withCurrentPlanningPageUser,
} from "@/lib/planning/server/pageAuth";
import { getCsvDraft } from "@/lib/planning/v3/draft/service";

type PageProps = {
  params: Promise<{ id: string }>;
};

type DraftRecord = NonNullable<Awaited<ReturnType<typeof getCsvDraft>>>;

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function summarizeDraft(cashflow: DraftRecord["monthlyCashflow"]): DraftDetail["summary"] {
  if (cashflow.length < 1) return {};
  const median = (rows: number[]): number => {
    const sorted = [...rows].sort((left, right) => left - right);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
    return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
  };
  const incomes = cashflow.map((row) => asNumber(row.incomeKrw));
  const expenses = cashflow.map((row) => Math.abs(asNumber(row.expenseKrw)));
  const avgNet = Math.round(cashflow.reduce((sum, row) => sum + asNumber(row.netKrw), 0) / cashflow.length);
  return {
    medianIncomeKrw: median(incomes),
    medianExpenseKrw: median(expenses),
    avgNetKrw: avgNet,
  };
}

function toDraftDetail(draft: DraftRecord): DraftDetail {
  return {
    id: draft.id,
    createdAt: draft.createdAt,
    source: {
      kind: "csv",
      ...(draft.source.filename ? { filename: draft.source.filename } : {}),
      rows: draft.meta.rowsParsed,
      months: draft.monthlyCashflow.length,
    },
    summary: summarizeDraft(draft.monthlyCashflow),
    cashflow: draft.monthlyCashflow,
    draftPatch: draft.draftPatch,
  };
}

export default async function PlanningV3DraftDetailPage({ params }: PageProps) {
  const { id } = await params;
  let initialDraft: DraftDetail | null = null;
  let disableAutoLoad = false;
  let initialMessage = "";

  try {
    const draft = await withCurrentPlanningPageUser(() => getCsvDraft(id));
    if (!draft) {
      disableAutoLoad = true;
      initialMessage = "상담 정보 초안 상세를 불러오지 못했습니다.";
    } else {
      initialDraft = toDraftDetail(draft);
    }
  } catch (error) {
    disableAutoLoad = true;
    initialMessage = toPlanningPageLoadMessage(error, "상담 정보 초안 상세를 불러오지 못했습니다.");
  }

  return (
    <DraftDetailClient
      disableAutoLoad={disableAutoLoad}
      id={id}
      initialDraft={initialDraft}
      initialMessage={initialMessage}
    />
  );
}
