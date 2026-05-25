"use client";

import { PageShell } from "@/components/ui/PageShell";
import {
  TransactionBatchDetailAccountBindingSection,
  TransactionBatchDetailCashflowSection,
  TransactionBatchDetailDraftReviewSection,
  TransactionBatchDetailOverviewSection,
  TransactionBatchDetailOverridesSection,
  TransactionBatchDetailTopSurfaceSection,
} from "@/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/sections";
import { useTransactionBatchDetailController } from "@/app/planning/v3/transactions/[id]/_components/transactionBatchDetail/useTransactionBatchDetailController";

export function TransactionBatchDetailClient({ id }: { id: string }) {
  const controller = useTransactionBatchDetailController({ id });

  return (
    <PageShell>
      <div className="space-y-5" data-testid="v3-batch-detail">
        <TransactionBatchDetailTopSurfaceSection topSurface={controller.topSurface} />
        <TransactionBatchDetailAccountBindingSection
          accountBinding={controller.accountBinding}
          overview={controller.overview}
        />
        <TransactionBatchDetailOverviewSection
          accountBinding={controller.accountBinding}
          overview={controller.overview}
          transferOverview={controller.transferOverview}
        />
        <TransactionBatchDetailOverridesSection
          overview={controller.overview}
          overrides={controller.overrides}
        />
        <TransactionBatchDetailCashflowSection
          cashflow={controller.cashflow}
          overview={controller.overview}
        />
        <TransactionBatchDetailDraftReviewSection draftReview={controller.draftReview} />
      </div>
    </PageShell>
  );
}
