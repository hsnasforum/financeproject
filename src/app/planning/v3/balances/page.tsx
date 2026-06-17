import {
  BalancesClient,
  type Account,
  type BatchMeta,
  type MonthlyAccountBalance,
} from "./_components/BalancesClient";
import {
  getMonthlyBalanceProjection,
  MonthlyBalanceProjectionError,
} from "@/lib/planning/v3/service/monthlyBalancesProjection";
import { listCurrentUserAccounts } from "@/lib/planning/v3/service/accountsRepository";
import { listTransactionBatchRows } from "@/lib/planning/v3/service/transactionBatchListRows";
import {
  toPlanningPageLoadMessage,
  withCurrentPlanningPageUser,
} from "@/lib/planning/server/pageAuth";

type PageProps = {
  searchParams?: Promise<{
    batchId?: string | string[];
    includeTransfers?: string | string[];
  }>;
};

export const dynamic = "force-dynamic";

function pickString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}

function pickBoolean(value: string | string[] | undefined): boolean {
  const normalized = pickString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
}

function toBatchMeta(row: Awaited<ReturnType<typeof listTransactionBatchRows>>["data"][number]): BatchMeta {
  return {
    id: row.id,
    createdAt: row.createdAt,
    rowCount: Math.max(0, Math.trunc(Number(row.rowCount) || 0)),
    ...(row.ymMin ? { ymMin: row.ymMin } : {}),
    ...(row.ymMax ? { ymMax: row.ymMax } : {}),
  };
}

export default async function PlanningV3BalancesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requestedBatchId = pickString(params?.batchId);
  const includeTransfers = pickBoolean(params?.includeTransfers);
  let initialAccounts: Account[] = [];
  let initialBatches: BatchMeta[] = [];
  let initialRows: MonthlyAccountBalance[] = [];
  let initialWarnings: string[] = [];
  let initialSelectedBatchId = "";
  let initialMessage = "";

  try {
    const loaded = await withCurrentPlanningPageUser(async () => {
      const [accounts, batchRows] = await Promise.all([
        listCurrentUserAccounts(),
        listTransactionBatchRows({ limit: 100 }),
      ]);
      const batches = batchRows.data.map(toBatchMeta).filter((row) => row.id.length > 0);
      const selectedBatchId = batches.some((row) => row.id === requestedBatchId)
        ? requestedBatchId
        : batches[0]?.id ?? "";
      let rows: MonthlyAccountBalance[] = [];
      let warnings: string[] = [];
      let message = "";

      if (selectedBatchId) {
        try {
          const projection = await getMonthlyBalanceProjection({
            batchId: selectedBatchId,
            includeTransfers,
          });
          rows = projection.data;
          warnings = projection.warnings;
        } catch (error) {
          rows = [];
          warnings = [];
          message = error instanceof MonthlyBalanceProjectionError
            ? "선택한 상담 자료의 월별 잔액을 계산할 거래가 없습니다."
            : "월별 잔액을 불러오지 못했습니다.";
        }
      }

      return {
        accounts,
        batches,
        message,
        rows,
        selectedBatchId,
        warnings,
      };
    });
    initialAccounts = loaded.accounts;
    initialBatches = loaded.batches;
    initialRows = loaded.rows;
    initialWarnings = loaded.warnings;
    initialSelectedBatchId = loaded.selectedBatchId;
    initialMessage = loaded.message;
  } catch (error) {
    initialAccounts = [];
    initialBatches = [];
    initialRows = [];
    initialWarnings = [];
    initialSelectedBatchId = "";
    initialMessage = toPlanningPageLoadMessage(error, "월별 잔액 초기 데이터를 불러오지 못했습니다.");
  }

  return (
    <div className="bg-surface-muted/80">
      <BalancesClient
        disableAutoLoad
        initialAccounts={initialAccounts}
        initialBatches={initialBatches}
        initialIncludeTransfers={includeTransfers}
        initialMessage={initialMessage}
        initialRows={initialRows}
        initialSelectedBatchId={initialSelectedBatchId}
        initialWarnings={initialWarnings}
      />
    </div>
  );
}
