import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  BodyActionLink,
  bodyActionLinkGroupClassName,
  BodyInset,
  BodySectionHeading,
  BodyStatusInset,
  BodyTableFrame,
  bodyChoiceRowClassName,
  bodyCompactFieldClassName,
  bodyDenseActionRowClassName,
  bodyFieldClassName,
} from "@/components/ui/BodyTone";
import { Card } from "@/components/ui/Card";
import type { TransactionBatchDetailController } from "./useTransactionBatchDetailController";
import {
  asNumber,
  asString,
  formatEvidenceInputs,
  formatDateTime,
  formatKrw,
  pickMonth,
  type TransactionCategory,
  type TransactionKindOverride,
} from "./shared";

type TopSurfaceProps = Pick<TransactionBatchDetailController, "topSurface">;
type OverviewProps = Pick<TransactionBatchDetailController, "overview" | "transferOverview" | "accountBinding">;
type AccountBindingProps = Pick<TransactionBatchDetailController, "overview" | "accountBinding">;
type OverridesProps = Pick<TransactionBatchDetailController, "overview" | "overrides">;
type CashflowProps = Pick<TransactionBatchDetailController, "overview" | "cashflow">;
type DraftReviewProps = Pick<TransactionBatchDetailController, "draftReview">;

export function TransactionBatchDetailTopSurfaceSection({ topSurface }: TopSurfaceProps) {
  return (
    <>
      <Card className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-navy">Import-to-Planning Beta</p>
          <h1 className="text-xl font-black text-navy">Planning v3 Batch Detail</h1>
          <p className="text-sm text-slate-600">
            id: <span className="font-mono">{topSurface.id}</span>
          </p>
          <p className="max-w-3xl text-sm text-slate-600">
            이 화면은 deep-link only 배치 상세/보정 surface입니다. 현재 배치를 확인하고 보정한 뒤,
            <span className="font-semibold text-slate-800"> balances 확인</span>으로 projection을 읽고
            <span className="font-semibold text-slate-800"> profile drafts 검토</span>로 넘어가는 follow-through를 우선합니다.
          </p>
        </div>

        <div className={bodyActionLinkGroupClassName}>
          <BodyActionLink href="/planning/v3/transactions">
            official entry로 돌아가기
          </BodyActionLink>
          <BodyActionLink href="/planning/v3/balances">
            balances 확인
          </BodyActionLink>
          <BodyActionLink href="/planning/v3/profile/drafts">
            profile drafts 검토
          </BodyActionLink>
        </div>

        <div className="space-y-2 rounded-2xl border border-dashed border-slate-200 bg-surface-muted px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Support / Internal</p>
          <div className={bodyActionLinkGroupClassName}>
            <BodyActionLink className="text-xs text-slate-600" href="/planning/v3/accounts">
              계좌 관리
            </BodyActionLink>
            <BodyActionLink className="text-xs text-slate-600" href="/planning/v3/categories/rules">
              카테고리 룰
            </BodyActionLink>
            <BodyActionLink className="text-xs text-slate-600" href="/planning/v3/import/csv">
              raw CSV Import
            </BodyActionLink>
          </div>
        </div>

        <BodyStatusInset>
          <p className="text-sm font-semibold">stable report는 이 화면의 직접 entry가 아닙니다.</p>
          <p className="mt-1 text-xs">
            balances 확인과 profile draft 검토, preflight/apply를 거친 뒤 stable{" "}
            <BodyActionLink className="text-xs" href="/planning/reports">
              `/planning/reports`
            </BodyActionLink>{" "}
            에서 결과를 확인합니다.
          </p>
        </BodyStatusInset>
        {topSurface.message ? <p className="text-sm font-semibold text-rose-700">{topSurface.message}</p> : null}
      </Card>

      {topSurface.loading ? (
        <Card>
          <p className="text-sm text-slate-600">상세를 불러오는 중...</p>
        </Card>
      ) : null}
    </>
  );
}

export function TransactionBatchDetailAccountBindingSection({
  overview,
  accountBinding,
}: AccountBindingProps) {
  if (!overview.detail) return null;

  return (
    <Card className="space-y-3">
      <BodySectionHeading
        description="배치 집계와 초안 생성은 거래 배치에 연결된 계좌가 있어야 진행됩니다. 계좌를 연결하면 아래 캐시플로우를 자동으로 다시 계산합니다."
        title="계좌 선택"
      />
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-72 text-sm font-semibold text-slate-700">
          거래 계좌
          <select
            className={bodyFieldClassName}
            data-testid="v3-batch-account-select"
            disabled={accountBinding.accountLoading || accountBinding.accounts.length < 1}
            onChange={(event) => {
              accountBinding.onSelectedAccountIdChange(event.currentTarget.value);
            }}
            value={accountBinding.selectedAccountId}
          >
            <option value="">선택</option>
            {accountBinding.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.kind})
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={!accountBinding.selectedAccountId || accountBinding.accountSaveLoading}
          onClick={() => {
            void accountBinding.onSaveBatchAccount();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {accountBinding.accountSaveLoading ? "연결 중..." : "이 배치에 연결"}
        </Button>
        <BodyActionLink href="/planning/v3/accounts">
          계좌 관리
        </BodyActionLink>
      </div>
      <p className="text-sm text-slate-700" data-testid="v3-batch-account-selected">
        선택 계좌: {accountBinding.selectedAccount ? `${accountBinding.selectedAccount.name} (${accountBinding.selectedAccount.id})` : "미선택"}
      </p>
      {accountBinding.accountMessage ? <p className="text-sm font-semibold text-slate-700">{accountBinding.accountMessage}</p> : null}
    </Card>
  );
}

export function TransactionBatchDetailOverviewSection({
  overview,
  transferOverview,
  accountBinding,
}: OverviewProps) {
  const detail = overview.detail;
  if (!detail) return null;

  return (
    <>
      <Card className="space-y-2" data-testid="v3-batch-meta">
        <h2 className="text-sm font-bold text-navy">업로드/집계 상태</h2>
        <p className="text-sm text-slate-700">
          총 거래 {asNumber(detail.stats.total).toLocaleString("ko-KR")}건 / 파싱 성공 {asNumber(detail.stats.ok).toLocaleString("ko-KR")}건 / 파싱 실패 {asNumber(detail.stats.failed).toLocaleString("ko-KR")}건
        </p>
        <p className="text-sm text-slate-700" data-testid="v3-batch-range">
          기간 {overview.batchMonthRange}
        </p>
        {asNumber(detail.stats.failed) > 0 ? (
          <p className="text-xs font-semibold text-amber-700">
            일부 행은 형식 불일치로 제외되었습니다. 컬럼 매핑/금액 형식을 확인해 주세요.
          </p>
        ) : (
          <p className="text-xs font-semibold text-navy">
            파싱 실패 없이 집계되었습니다.
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <BodySectionHeading title="Batch" />
        <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
          <div><dt className="font-semibold">createdAt</dt><dd>{detail.batch.createdAt ? formatDateTime(detail.batch.createdAt) : "-"}</dd></div>
          <div><dt className="font-semibold">file</dt><dd>{detail.batch.fileName ?? "-"}</dd></div>
          <div><dt className="font-semibold">accountId</dt><dd className="font-mono text-xs">{detail.batch.accountId ?? "-"}</dd></div>
          <div><dt className="font-semibold">sha256</dt><dd className="font-mono text-xs">{detail.batch.sha256 ?? "-"}</dd></div>
          <div><dt className="font-semibold">total</dt><dd>{asNumber(detail.batch.total).toLocaleString("ko-KR")}</dd></div>
          <div><dt className="font-semibold">ok</dt><dd>{asNumber(detail.batch.ok).toLocaleString("ko-KR")}</dd></div>
          <div><dt className="font-semibold">failed</dt><dd>{asNumber(detail.batch.failed).toLocaleString("ko-KR")}</dd></div>
        </dl>
      </Card>

      <Card className="space-y-3">
        <BodySectionHeading title="Sample (Redacted)" />
        <BodyTableFrame>
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">line</th>
                <th className="px-3 py-2 text-left">date</th>
                <th className="px-3 py-2 text-right">amount</th>
                <th className="px-3 py-2 text-left">desc(masked)</th>
                <th className="px-3 py-2 text-left">status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detail.sample.length > 0 ? detail.sample.map((row, index) => (
                <tr key={`sample-${index}-${row.line}`}>
                  <td className="px-3 py-2 text-slate-800">{asNumber(row.line)}</td>
                  <td className="px-3 py-2 text-slate-800">{asString(row.dateIso) || "-"}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{Number.isFinite(Number(row.amountKrw)) ? formatKrw(asNumber(row.amountKrw)) : "-"}</td>
                  <td className="px-3 py-2 text-slate-700">{asString(row.descMasked) || "-"}</td>
                  <td className="px-3 py-2">
                    <Badge variant={row.ok ? "success" : "destructive"}>{row.ok ? "OK" : "FAIL"}</Badge>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="px-3 py-2 text-slate-500" colSpan={5}>샘플이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </BodyTableFrame>
      </Card>

      <Card className="space-y-2" data-testid="v3-transfer-summary">
        <BodySectionHeading title="이체/계좌 매핑 요약" />
        <BodyInset>
          <p className="text-sm text-slate-700">
            transfers {transferOverview.transferCount.toLocaleString("ko-KR")}건 / unassigned {transferOverview.unassignedCount.toLocaleString("ko-KR")}건
          </p>
          <p className="mt-1 text-xs text-slate-600">
            expense(transfer 포함) {formatKrw(transferOverview.expenseInclTransfer)} / expense(transfer 제외) {formatKrw(transferOverview.expenseExclTransfer)}
          </p>
        </BodyInset>
      </Card>

      <Card className="space-y-3">
        <BodySectionHeading
          description="초기잔액을 입력하기 전에는 실제 잔액을 계산할 수 없어, 현재는 계좌별 월 순유입만 보여줍니다."
          title="계좌별 월별 Net (읽기 전용)"
        />
        <BodyTableFrame>
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">account</th>
                <th className="px-3 py-2 text-left">YYYY-MM</th>
                <th className="px-3 py-2 text-right">net</th>
                <th className="px-3 py-2 text-right">txCount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(detail.accountMonthlyNet ?? []).length > 0 ? (detail.accountMonthlyNet ?? []).map((row, index) => (
                <tr key={`${row.accountId}-${row.ym}-${index}`}>
                  <td className="px-3 py-2 text-slate-800">
                    {accountBinding.accounts.find((account) => account.id === row.accountId)?.name ?? row.accountId}
                  </td>
                  <td className="px-3 py-2 text-slate-800">{row.ym}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.netKrw))}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{asNumber(row.txCount).toLocaleString("ko-KR")}</td>
                </tr>
              )) : (
                <tr>
                  <td className="px-3 py-2 text-slate-500" colSpan={4}>계좌별 월 net 데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </BodyTableFrame>
      </Card>
    </>
  );
}

export function TransactionBatchDetailOverridesSection({
  overview,
  overrides,
}: OverridesProps) {
  const detail = overview.detail;
  if (!detail) return null;

  return (
    <>
      <Card className="space-y-3">
        <BodySectionHeading
          description="거래 분류, 계좌 매핑, 이체 판정은 먼저 오버라이드로 저장됩니다. 아래 카테고리 집계와 캐시플로우는 저장 뒤 자동으로 다시 계산됩니다."
          title="거래 목록 (수동 분류 정정)"
        />
        {overrides.txnOverrideMessage ? <p className="text-sm font-semibold text-slate-700">{overrides.txnOverrideMessage}</p> : null}
        <BodyTableFrame>
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">date</th>
                <th className="px-3 py-2 text-right">amount</th>
                <th className="px-3 py-2 text-left">desc</th>
                <th className="px-3 py-2 text-left">account</th>
                <th className="px-3 py-2 text-left">transfer</th>
                <th className="px-3 py-2 text-left">kind</th>
                <th className="px-3 py-2 text-left">category</th>
                <th className="px-3 py-2 text-left">action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(detail.transactions ?? []).length > 0 ? (detail.transactions ?? []).map((row) => (
                <tr data-testid={`v3-txn-row-${row.txnId}`} key={row.txnId}>
                  <td className="px-3 py-2 text-slate-800">{row.date}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatKrw(row.amountKrw)}</td>
                  <td className="px-3 py-2 text-slate-700">{asString(row.description) || "-"}</td>
                  <td className="px-3 py-2">
                    <div className={bodyDenseActionRowClassName}>
                      <select
                        className={bodyCompactFieldClassName}
                        data-testid={`v3-txn-account-${row.txnId}`}
                        onChange={(event) => {
                          overrides.onTxnAccountChange(row.txnId, event.currentTarget.value);
                        }}
                        value={overrides.txnAccountDrafts[row.txnId] ?? (asString(row.accountId) || "unassigned")}
                      >
                        <option value="unassigned">unassigned</option>
                        {overrides.accounts.map((account) => (
                          <option key={`${row.txnId}-account-${account.id}`} value={account.id}>{account.name}</option>
                        ))}
                      </select>
                      <Button
                        disabled={Boolean(overrides.txnAccountSavingId && overrides.txnAccountSavingId !== row.txnId)}
                        onClick={() => {
                          void overrides.onSaveTxnAccountOverride(row.txnId);
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {overrides.txnAccountSavingId === row.txnId ? "계좌 저장 중..." : "계좌 저장"}
                      </Button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      data-testid={`v3-txn-transfer-${row.txnId}`}
                      disabled={Boolean(overrides.txnTransferSavingId && overrides.txnTransferSavingId !== row.txnId)}
                      onClick={() => {
                        const isTransfer = row.kind === "transfer" || asString(row.transferGroupId).length > 0;
                        void overrides.onSaveTxnTransferOverride(row.txnId, !isTransfer);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {overrides.txnTransferSavingId === row.txnId
                        ? "저장 중..."
                        : overrides.getTransferOverrideButtonLabel(row)}
                    </Button>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={bodyCompactFieldClassName}
                      data-testid={`v3-txn-kind-${row.txnId}`}
                      onChange={(event) => {
                        overrides.onTxnKindChange(row.txnId, event.currentTarget.value as TransactionKindOverride);
                      }}
                      value={overrides.txnKindDrafts[row.txnId] ?? row.kind}
                    >
                      <option value="auto">auto</option>
                      <option value="income">income</option>
                      <option value="expense">expense</option>
                      <option value="transfer">transfer</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={bodyCompactFieldClassName}
                      data-testid={`v3-txn-category-${row.txnId}`}
                      onChange={(event) => {
                        overrides.onTxnCategoryChange(row.txnId, event.currentTarget.value as TransactionCategory);
                      }}
                      value={overrides.txnCategoryDrafts[row.txnId] ?? row.category}
                    >
                      {overrides.categoryOptions.map((option) => (
                        <option key={`${row.txnId}-${option}`} value={option}>{option}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      data-testid={`v3-txn-save-${row.txnId}`}
                      disabled={Boolean(overrides.txnOverrideSavingId && overrides.txnOverrideSavingId !== row.txnId)}
                      onClick={() => {
                        void overrides.onSaveTxnOverride(row.txnId);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {overrides.txnOverrideSavingId === row.txnId ? "분류 저장 중..." : "분류 저장"}
                    </Button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="px-3 py-2 text-slate-500" colSpan={8}>거래 목록이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </BodyTableFrame>
      </Card>

      <Card className="space-y-3">
        <BodySectionHeading
          description="카테고리 집계는 룰 기반 분류와 거래별 오버라이드 결과를 함께 반영합니다."
          title="카테고리 Breakdown (월별)"
        />
        {overrides.categorizedLoading ? <p className="text-sm text-slate-600">집계 갱신 중...</p> : null}
        {overrides.categorizedMessage ? <p className="text-sm font-semibold text-rose-700">{overrides.categorizedMessage}</p> : null}
        <BodyTableFrame>
          <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="v3-breakdown-table">
            <thead className="bg-surface-muted text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">ym</th>
                <th className="px-3 py-2 text-right">income</th>
                <th className="px-3 py-2 text-right">expense</th>
                <th className="px-3 py-2 text-right">transfer</th>
                <th className="px-3 py-2 text-right">fixed</th>
                <th className="px-3 py-2 text-right">variable</th>
                <th className="px-3 py-2 text-right">housing</th>
                <th className="px-3 py-2 text-right">food</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {overrides.breakdownRows.length > 0 ? overrides.breakdownRows.map((row) => (
                <tr key={`breakdown-${row.ym}`}>
                  <td className="px-3 py-2 font-semibold text-navy">{row.ym}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatKrw(row.incomeKrw)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatKrw(row.expenseKrw)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatKrw(row.transferKrw)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.byCategory.fixed))}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.byCategory.variable))}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.byCategory.housing))}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.byCategory.food))}</td>
                </tr>
              )) : (
                <tr>
                  <td className="px-3 py-2 text-slate-500" colSpan={8}>카테고리 breakdown 데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </BodyTableFrame>
      </Card>
    </>
  );
}

export function TransactionBatchDetailCashflowSection({
  overview,
  cashflow,
}: CashflowProps) {
  const detail = overview.detail;
  if (!detail) return null;

  return (
    <>
      <Card className="space-y-3">
        <BodySectionHeading title="월별 요약" />
        <BodyTableFrame>
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">YYYY-MM</th>
                <th className="px-3 py-2 text-right">income</th>
                <th className="px-3 py-2 text-right">expense</th>
                <th className="px-3 py-2 text-right">net</th>
                <th className="px-3 py-2 text-right">txCount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detail.monthsSummary.length > 0 ? detail.monthsSummary.map((row) => (
                <tr key={row.ym}>
                  <td className="px-3 py-2 font-semibold text-navy">{row.ym}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.incomeKrw))}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.expenseKrw))}</td>
                  <td className="px-3 py-2 text-right font-semibold text-navy">{formatKrw(asNumber(row.netKrw))}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{asNumber(row.txCount).toLocaleString("ko-KR")}</td>
                </tr>
              )) : (
                <tr>
                  <td className="px-3 py-2 text-slate-500" colSpan={5}>월별 요약이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </BodyTableFrame>
      </Card>

      {cashflow.cashflowLoading ? (
        <Card>
          <p className="text-sm text-slate-600">재집계 캐시플로우를 계산하는 중...</p>
        </Card>
      ) : null}

      {cashflow.cashflowMessage ? (
        <Card>
          <p className="text-sm font-semibold text-rose-700">{cashflow.cashflowMessage}</p>
        </Card>
      ) : null}

      {cashflow.cashflow ? (
        <>
          <Card className="space-y-3">
            <BodySectionHeading title="초안 생성 옵션" />
            <label className={bodyChoiceRowClassName}>
              <input
                checked={cashflow.excludeTransfers}
                data-testid="v3-toggle-exclude-transfers"
                onChange={(event) => {
                  cashflow.onExcludeTransfersChange(event.currentTarget.checked);
                }}
                type="checkbox"
              />
              이체 제외
            </label>
            <div className="space-y-2 text-sm text-slate-700">
              <label className={bodyChoiceRowClassName}>
                <input
                  checked={cashflow.splitMode === "byCategory"}
                  data-testid="v3-splitmode-byCategory"
                  name="v3-split-mode"
                  onChange={() => {
                    cashflow.onSplitModeChange("byCategory");
                  }}
                  type="radio"
                />
                자동 분류 기반
              </label>
              <label className={bodyChoiceRowClassName}>
                <input
                  checked={cashflow.splitMode === "byRatio"}
                  data-testid="v3-splitmode-byRatio"
                  name="v3-split-mode"
                  onChange={() => {
                    cashflow.onSplitModeChange("byRatio");
                  }}
                  type="radio"
                />
                수동 비율 입력
              </label>
              <label className={bodyChoiceRowClassName}>
                <input
                  checked={cashflow.splitMode === "noSplit"}
                  data-testid="v3-splitmode-noSplit"
                  name="v3-split-mode"
                  onChange={() => {
                    cashflow.onSplitModeChange("noSplit");
                  }}
                  type="radio"
                />
                분할 안 함(전체 지출)
              </label>
            </div>

            {cashflow.splitMode === "byRatio" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  fixed %
                  <input
                    className={bodyFieldClassName}
                    data-testid="v3-ratio-fixed"
                    max={100}
                    min={0}
                    onChange={(event) => {
                      cashflow.onFixedRatioChange(Number.parseInt(event.target.value, 10));
                    }}
                    type="number"
                    value={cashflow.fixedRatioPct}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  variable %
                  <input
                    className={bodyFieldClassName}
                    data-testid="v3-ratio-variable"
                    max={100}
                    min={0}
                    onChange={(event) => {
                      cashflow.onVariableRatioChange(Number.parseInt(event.target.value, 10));
                    }}
                    type="number"
                    value={cashflow.variableRatioPct}
                  />
                </label>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={cashflow.cashflowLoading || !cashflow.ratioValid}
                onClick={cashflow.onPreviewDraft}
                size="sm"
                type="button"
                variant="outline"
              >
                초안 미리보기
              </Button>
              {cashflow.ratioValid ? (
                <p className="text-xs font-semibold text-slate-600">선택한 옵션으로 집계가 반영됩니다.</p>
              ) : (
                <p className="text-xs font-semibold text-rose-700">비율 합계는 100%여야 합니다.</p>
              )}
            </div>
            <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
              <div>
                <dt className="font-semibold">income</dt>
                <dd data-testid="v3-summary-income">{formatKrw(cashflow.transferSummary.income)}</dd>
              </div>
              <div>
                <dt className="font-semibold">expense</dt>
                <dd data-testid="v3-summary-expense">{formatKrw(cashflow.transferSummary.expense)}</dd>
              </div>
              <div>
                <dt className="font-semibold">transfer</dt>
                <dd data-testid="v3-summary-transfer">
                  in {formatKrw(cashflow.transferSummary.transferIn)} / out {formatKrw(cashflow.transferSummary.transferOut)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="space-y-3" data-testid="v3-cashflow-table">
            <BodySectionHeading title="월별 캐시플로우 v2" />
            <BodyTableFrame>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-surface-muted text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">YYYY-MM</th>
                    <th className="px-3 py-2 text-right">inflow</th>
                    <th className="px-3 py-2 text-right">outflow</th>
                    <th className="px-3 py-2 text-right">net</th>
                    <th className="px-3 py-2 text-right">fixed</th>
                    <th className="px-3 py-2 text-right">variable</th>
                    <th className="px-3 py-2 text-right">transfer</th>
                    <th className="px-3 py-2 text-right">days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cashflow.cashflow.monthly.length > 0 ? cashflow.cashflow.monthly.map((row, index) => (
                    <tr key={`${pickMonth(row) || "month"}-${index}`}>
                      <td className="px-3 py-2 font-semibold text-navy">{pickMonth(row) || "-"}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.inflowKrw ?? row.incomeKrw))}</td>
                      <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.outflowKrw ?? Math.abs(asNumber(row.expenseKrw))))}</td>
                      <td className="px-3 py-2 text-right font-semibold text-navy">{formatKrw(asNumber(row.netKrw))}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{formatKrw(asNumber(row.fixedOutflowKrw))}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{formatKrw(asNumber(row.variableOutflowKrw))}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{formatKrw(asNumber(row.transferNetKrw))}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{typeof row.daysCovered === "number" ? row.daysCovered : "-"}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td className="px-3 py-2 text-slate-500" colSpan={8}>월별 캐시플로우가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </BodyTableFrame>
          </Card>

          <Card className="space-y-3" data-testid="v3-draftpatch-summary">
            <BodySectionHeading title="초안 패치 요약" />
            <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <div><dt className="font-semibold">추천 월 소득</dt><dd>{formatKrw(asNumber(cashflow.cashflow.draftPatch.suggestedMonthlyIncomeKrw))}</dd></div>
              <div><dt className="font-semibold">추천 필수지출</dt><dd>{formatKrw(asNumber(cashflow.cashflow.draftPatch.suggestedMonthlyEssentialSpendKrw))}</dd></div>
              <div><dt className="font-semibold">추천 재량지출</dt><dd>{formatKrw(asNumber(cashflow.cashflow.draftPatch.suggestedMonthlyDiscretionarySpendKrw))}</dd></div>
              <div><dt className="font-semibold">confidence</dt><dd className="uppercase">{asString(cashflow.cashflow.draftPatch.confidence) || "-"}</dd></div>
            </dl>

            <div className="space-y-2" data-testid="v3-draftpatch-evidence">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">evidence</h3>
              <ul className="space-y-1 text-sm text-slate-700">
                {cashflow.cashflow.draftPatch.evidence.length > 0 ? cashflow.cashflow.draftPatch.evidence.map((item, index) => (
                  <li key={`evidence-${index}-${item.key}`}>
                    <p className="font-semibold">{item.title}</p>
                    {asString(item.formula) ? <p className="text-xs text-slate-600">{item.formula}</p> : null}
                    <p className="text-xs text-slate-600">{formatEvidenceInputs(item.inputs)}</p>
                    {asString(item.assumption) ? <p className="text-xs text-slate-500">assumption: {item.assumption}</p> : null}
                  </li>
                )) : (
                  <li>근거가 없습니다.</li>
                )}
              </ul>
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}

export function TransactionBatchDetailDraftReviewSection({
  draftReview,
}: DraftReviewProps) {
  return (
    <Card className="space-y-3">
      <BodySectionHeading title="Draft 리뷰" />
      <p className="text-sm text-slate-700">
        현재 집계 결과로 profile draft를 생성한 뒤 초안 목록/상세에서 검토하고, preflight/apply 후 stable report로 넘어가는 representative funnel을 닫습니다.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-testid="v3-go-draft-review"
          disabled={!draftReview.ratioValid || draftReview.draftSaving || !draftReview.hasBatchAccount}
          onClick={() => {
            void draftReview.onCreateDraftAndGoToReview();
          }}
          size="sm"
          type="button"
        >
          {draftReview.draftSaving ? "Draft 생성 중..." : "Draft 리뷰로 이동"}
        </Button>
        <BodyActionLink href="/planning/v3/profile/drafts">
          profile drafts 검토
        </BodyActionLink>
        <BodyActionLink href="/planning/v3/balances">
          balances 다시 확인
        </BodyActionLink>
        {draftReview.draftMessage ? <p className="text-sm font-semibold text-slate-700">{draftReview.draftMessage}</p> : null}
      </div>
      <p className="text-xs text-slate-500">
        stable `/planning/reports`는 draft apply 이후 결과 확인용 도착점으로만 사용합니다.
      </p>
    </Card>
  );
}
