"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { bodyFieldClassName, bodyLabelClassName } from "@/components/ui/BodyTone";
import {
  DIAGNOSIS_WARNING_CONFIRM_ID,
  type PlanningDiagnosisWizardController,
} from "@/components/planning/workspace/usePlanningDiagnosisWizard";
import {
  DIAGNOSIS_FIELD_LABELS,
  DIAGNOSIS_STAGE_LABELS,
  DIAGNOSIS_STEPS,
  buildDiagnosisResultLinks,
  diagnosisDebtFieldId,
  diagnosisFieldId,
  diagnosisGoalFieldId,
  estimateDiagnosisDebtPayment,
  type DiagnosisChoice,
  type DiagnosisDebtDraft,
  type DiagnosisGoalDraft,
  type DiagnosisIssue,
  type DiagnosisSubmissionState,
  type DiagnosisTextField,
} from "@/lib/planning/ui/planningDiagnosisWizard";
import { SIDO_ADMIN_2025, SIGUNGU_BY_SIDO_CODE_2025 } from "@/lib/regions/kr_admin_2025";
import { cn } from "@/lib/utils";

type WizardProps = {
  wizard: PlanningDiagnosisWizardController;
};

const FIELD_CLASS = cn(bodyFieldClassName, "h-10 rounded-xl");
const REQUIRED_FIELD_CLASS = "border-primary/50";
const INVALID_FIELD_CLASS = "border-rose-500 focus:border-rose-500 focus:ring-rose-100";
const LINK_CLASS = "inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline";
// aria-disabled, not disabled: the click still has to reach the handler that moves focus to the first gap.
const BLOCKED_BUTTON_CLASS = "aria-disabled:opacity-60";

function FieldShell(props: {
  id: string;
  label: string;
  required?: boolean;
  issue?: DiagnosisIssue;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={props.id} className={bodyLabelClassName}>
        {props.label}
        {props.required ? <span aria-hidden="true" className="ml-1 text-xs font-bold text-rose-700">필수</span> : null}
      </label>
      {props.children}
      {props.hint ? <p id={`${props.id}-hint`} className="mt-1 text-xs leading-5 text-slate-500">{props.hint}</p> : null}
      {props.issue ? <p id={`${props.id}-error`} className="mt-1 text-xs font-semibold leading-5 text-rose-700">{props.issue.message}</p> : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, issue?: DiagnosisIssue): string | undefined {
  const ids = [hint ? `${id}-hint` : "", issue ? `${id}-error` : ""].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function TextInput(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  numeric?: "numeric" | "decimal";
  issue?: DiagnosisIssue;
  hint?: string;
}) {
  return (
    <FieldShell id={props.id} label={props.label} required={props.required} issue={props.issue} hint={props.hint}>
      <input
        id={props.id}
        type="text"
        autoComplete="off"
        inputMode={props.numeric}
        aria-required={props.required ? true : undefined}
        aria-invalid={props.issue ? true : undefined}
        aria-describedby={describedBy(props.id, props.hint, props.issue)}
        className={cn(FIELD_CLASS, props.required && REQUIRED_FIELD_CLASS, props.issue && INVALID_FIELD_CLASS)}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FieldShell>
  );
}

function SelectInput(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  issue?: DiagnosisIssue;
  blankLabel: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <FieldShell id={props.id} label={props.label} required={props.required} issue={props.issue}>
      <select
        id={props.id}
        disabled={props.disabled}
        aria-required={props.required ? true : undefined}
        aria-invalid={props.issue ? true : undefined}
        aria-describedby={describedBy(props.id, undefined, props.issue)}
        className={cn(FIELD_CLASS, props.required && REQUIRED_FIELD_CLASS, props.issue && INVALID_FIELD_CLASS)}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">{props.blankLabel}</option>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </FieldShell>
  );
}

function ChoiceInput(props: {
  fieldId: string;
  name: string;
  legend: string;
  noneLabel: string;
  someLabel: string;
  value: DiagnosisChoice;
  onChange: (value: DiagnosisChoice) => void;
  issue?: DiagnosisIssue;
}) {
  const options: Array<{ value: DiagnosisChoice; label: string; id: string }> = [
    { value: "none", label: props.noneLabel, id: props.fieldId },
    { value: "some", label: props.someLabel, id: `${props.fieldId}-some` },
  ];
  return (
    <fieldset
      role="radiogroup"
      className="min-w-0"
      aria-labelledby={`${props.fieldId}-legend`}
      aria-required="true"
      aria-invalid={props.issue ? true : undefined}
      aria-describedby={describedBy(props.fieldId, undefined, props.issue)}
    >
      <legend id={`${props.fieldId}-legend`} className={bodyLabelClassName}>
        {props.legend}
        <span aria-hidden="true" className="ml-1 text-xs font-bold text-rose-700">필수</span>
      </legend>
      <div className="mt-2 flex flex-wrap gap-4">
        {options.map((option) => (
          <label key={option.value} htmlFor={option.id} className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-700">
            <input
              id={option.id}
              type="radio"
              name={props.name}
              checked={props.value === option.value}
              onChange={() => props.onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {props.issue ? <p id={`${props.fieldId}-error`} className="mt-1 text-xs font-semibold leading-5 text-rose-700">{props.issue.message}</p> : null}
    </fieldset>
  );
}

function BasicStep({ wizard, issueFor, textField }: StepProps) {
  const { draft } = wizard.state;
  const sidoCode = SIDO_ADMIN_2025.find((entry) => entry.name === draft.sido)?.code ?? "";
  const sigunguOptions = sidoCode ? SIGUNGU_BY_SIDO_CODE_2025[sidoCode] ?? [] : [];
  return (
    <div className="space-y-4">
      {textField("profileName", { required: true })}
      <details className="rounded-xl border border-slate-200 p-3" open={issueFor(diagnosisFieldId("birthYear")) ? true : undefined}>
        <summary className="cursor-pointer text-sm font-semibold text-navy">출생연도·성별·지역 (선택)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {textField("birthYear", { numeric: "numeric" })}
          <SelectInput
            id={diagnosisFieldId("gender")}
            label={DIAGNOSIS_FIELD_LABELS.gender}
            blankLabel="선택 안 함"
            value={draft.gender}
            options={[{ value: "F", label: "여성" }, { value: "M", label: "남성" }]}
            onChange={(value) => wizard.dispatch({ type: "setField", field: "gender", value })}
          />
          <SelectInput
            id={diagnosisFieldId("sido")}
            label={DIAGNOSIS_FIELD_LABELS.sido}
            blankLabel="선택 안 함"
            value={draft.sido}
            options={SIDO_ADMIN_2025.map((entry) => ({ value: entry.name, label: entry.name }))}
            onChange={(value) => wizard.dispatch({ type: "setField", field: "sido", value })}
          />
          <SelectInput
            id={diagnosisFieldId("sigungu")}
            label={DIAGNOSIS_FIELD_LABELS.sigungu}
            blankLabel="선택 안 함"
            disabled={!draft.sido}
            value={draft.sigungu}
            options={sigunguOptions.map((entry) => ({ value: entry.name, label: entry.name }))}
            onChange={(value) => wizard.dispatch({ type: "setField", field: "sigungu", value })}
          />
        </div>
      </details>
    </div>
  );
}

function CashflowStep({ textField }: StepProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {textField("monthlyIncomeNet", { required: true, numeric: "numeric" })}
      {textField("monthlyEssentialExpenses", { required: true, numeric: "numeric" })}
      {textField("monthlyDiscretionaryExpenses", { required: true, numeric: "numeric", hint: "없으면 0을 입력해 주세요." })}
    </div>
  );
}

function DebtRow({ wizard, issueFor, index, row }: StepProps & { index: number; row: DiagnosisDebtDraft }) {
  const update = (patch: Partial<DiagnosisDebtDraft>) => wizard.dispatch({ type: "updateDebt", index, patch });
  const estimate = estimateDiagnosisDebtPayment(row);
  const prefix = `부채 ${index + 1}`;
  return (
    <fieldset className="rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-bold text-navy">{prefix}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput id={diagnosisDebtFieldId(index, "name")} label={`${prefix} 이름`} required value={row.name} issue={issueFor(diagnosisDebtFieldId(index, "name"))} onChange={(name) => update({ name })} />
        <TextInput id={diagnosisDebtFieldId(index, "balance")} label={`${prefix} 잔액 (원)`} required numeric="numeric" value={row.balance} issue={issueFor(diagnosisDebtFieldId(index, "balance"))} onChange={(balance) => update({ balance })} />
        <TextInput id={diagnosisDebtFieldId(index, "aprPct")} label={`${prefix} 연이율 (%)`} required numeric="decimal" value={row.aprPct} issue={issueFor(diagnosisDebtFieldId(index, "aprPct"))} onChange={(aprPct) => update({ aprPct })} />
        <TextInput id={diagnosisDebtFieldId(index, "monthlyPayment")} label={`${prefix} 월상환액 (원)`} required numeric="numeric" value={row.monthlyPayment} issue={issueFor(diagnosisDebtFieldId(index, "monthlyPayment"))} onChange={(monthlyPayment) => update({ monthlyPayment })} />
        <TextInput id={diagnosisDebtFieldId(index, "remainingMonths")} label={`${prefix} 잔여개월`} required numeric="numeric" value={row.remainingMonths} issue={issueFor(diagnosisDebtFieldId(index, "remainingMonths"))} onChange={(remainingMonths) => update({ remainingMonths })} />
        <SelectInput
          id={diagnosisDebtFieldId(index, "repaymentType")}
          label={`${prefix} 상환방식`}
          required
          blankLabel="선택해 주세요"
          value={row.repaymentType}
          issue={issueFor(diagnosisDebtFieldId(index, "repaymentType"))}
          options={[{ value: "amortizing", label: "원리금균등" }, { value: "interestOnly", label: "이자만 납입" }]}
          onChange={(value) => update({ repaymentType: value as DiagnosisDebtDraft["repaymentType"] })}
        />
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-navy">상환액 추정 보조 (선택)</summary>
        {estimate === null ? (
          <p className="mt-2 text-sm text-slate-600">잔액·연이율·잔여개월·상환방식을 입력하면 예상 월상환액을 보여 드립니다.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-700">
            <span>예상 월상환액 {new Intl.NumberFormat("ko-KR").format(estimate)}원 · 실제 약정과 다를 수 있습니다.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => update({ monthlyPayment: new Intl.NumberFormat("ko-KR").format(estimate) })}>
              이 금액을 월상환액에 넣기
            </Button>
          </div>
        )}
      </details>
      <div className="mt-3">
        <Button type="button" size="sm" variant="ghost" onClick={() => wizard.dispatch({ type: "removeDebt", index })}>{prefix} 삭제</Button>
      </div>
    </fieldset>
  );
}

function AssetStep(props: StepProps) {
  const { wizard, issueFor, textField } = props;
  const { draft } = wizard.state;
  const addIssue = issueFor(diagnosisFieldId("debtAdd"));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {textField("liquidAssets", { required: true, numeric: "numeric" })}
        {textField("investmentAssets", { required: true, numeric: "numeric", hint: "없으면 0을 입력해 주세요." })}
      </div>
      <ChoiceInput
        fieldId={diagnosisFieldId("debtChoice")}
        name="diagnosis-debt-choice"
        legend="부채가 있나요?"
        noneLabel="부채 없음"
        someLabel="부채 있음"
        value={draft.debtChoice}
        issue={issueFor(diagnosisFieldId("debtChoice"))}
        onChange={(value) => wizard.dispatch({ type: "setDebtChoice", value })}
      />
      {draft.debtChoice === "some" ? (
        <div className="space-y-3">
          {draft.debts.map((row, index) => <DebtRow key={row.id} {...props} index={index} row={row} />)}
          <Button id={diagnosisFieldId("debtAdd")} type="button" size="sm" variant="outline" onClick={() => wizard.dispatch({ type: "addDebt" })}>부채 추가</Button>
          {addIssue ? <p className="text-xs font-semibold text-rose-700">{addIssue.message}</p> : null}
        </div>
      ) : null}
      {draft.debtChoice === "none" && draft.debts.length > 0 ? (
        <p className="text-sm text-slate-600">입력한 부채 {draft.debts.length}건은 저장에서 제외됩니다. &apos;부채 있음&apos;을 고르면 다시 나타납니다.</p>
      ) : null}
    </div>
  );
}

function GoalRow({ wizard, issueFor, index, row }: StepProps & { index: number; row: DiagnosisGoalDraft }) {
  const update = (patch: Partial<DiagnosisGoalDraft>) => wizard.dispatch({ type: "updateGoal", index, patch });
  const prefix = `목표 ${index + 1}`;
  const priorityIssue = issueFor(diagnosisGoalFieldId(index, "priority"));
  const minimumIssue = issueFor(diagnosisGoalFieldId(index, "minimumMonthlyContribution"));
  return (
    <fieldset className="rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-bold text-navy">{prefix}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput id={diagnosisGoalFieldId(index, "name")} label={`${prefix} 이름`} required value={row.name} issue={issueFor(diagnosisGoalFieldId(index, "name"))} onChange={(name) => update({ name })} />
        <TextInput id={diagnosisGoalFieldId(index, "targetAmount")} label={`${prefix} 목표액 (원)`} required numeric="numeric" value={row.targetAmount} issue={issueFor(diagnosisGoalFieldId(index, "targetAmount"))} onChange={(targetAmount) => update({ targetAmount })} />
        <TextInput id={diagnosisGoalFieldId(index, "currentAmount")} label={`${prefix} 현재액 (원)`} required numeric="numeric" value={row.currentAmount} issue={issueFor(diagnosisGoalFieldId(index, "currentAmount"))} onChange={(currentAmount) => update({ currentAmount })} />
        <TextInput id={diagnosisGoalFieldId(index, "targetMonth")} label={`${prefix} 기간 (개월)`} required numeric="numeric" value={row.targetMonth} issue={issueFor(diagnosisGoalFieldId(index, "targetMonth"))} onChange={(targetMonth) => update({ targetMonth })} />
      </div>
      <details className="mt-3" open={priorityIssue || minimumIssue ? true : undefined}>
        <summary className="cursor-pointer text-sm font-semibold text-navy">우선순위·최소납입 (선택)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextInput id={diagnosisGoalFieldId(index, "priority")} label={`${prefix} 우선순위 (1~5)`} numeric="numeric" value={row.priority} issue={priorityIssue} onChange={(priority) => update({ priority })} />
          <TextInput id={diagnosisGoalFieldId(index, "minimumMonthlyContribution")} label={`${prefix} 최소납입 (원)`} numeric="numeric" value={row.minimumMonthlyContribution} issue={minimumIssue} onChange={(minimumMonthlyContribution) => update({ minimumMonthlyContribution })} />
        </div>
      </details>
      <div className="mt-3">
        <Button type="button" size="sm" variant="ghost" onClick={() => wizard.dispatch({ type: "removeGoal", index })}>{prefix} 삭제</Button>
      </div>
    </fieldset>
  );
}

function GoalStep(props: StepProps) {
  const { wizard, issueFor } = props;
  const { draft } = wizard.state;
  const addIssue = issueFor(diagnosisFieldId("goalAdd"));
  return (
    <div className="space-y-4">
      <ChoiceInput
        fieldId={diagnosisFieldId("goalChoice")}
        name="diagnosis-goal-choice"
        legend="이루고 싶은 재무 목표가 있나요?"
        noneLabel="목표 없음"
        someLabel="목표 있음"
        value={draft.goalChoice}
        issue={issueFor(diagnosisFieldId("goalChoice"))}
        onChange={(value) => wizard.dispatch({ type: "setGoalChoice", value })}
      />
      {draft.goalChoice === "some" ? (
        <div className="space-y-3">
          {draft.goals.map((row, index) => <GoalRow key={row.id} {...props} index={index} row={row} />)}
          <Button id={diagnosisFieldId("goalAdd")} type="button" size="sm" variant="outline" onClick={() => wizard.dispatch({ type: "addGoal" })}>목표 추가</Button>
          {addIssue ? <p className="text-xs font-semibold text-rose-700">{addIssue.message}</p> : null}
        </div>
      ) : null}
      {draft.goalChoice === "none" && draft.goals.length > 0 ? (
        <p className="text-sm text-slate-600">입력한 목표 {draft.goals.length}건은 저장에서 제외됩니다. &apos;목표 있음&apos;을 고르면 다시 나타납니다.</p>
      ) : null}
    </div>
  );
}

function SummaryList({ rows }: { rows: PlanningDiagnosisWizardController["summary"] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="font-semibold text-slate-600">{row.label}</dt>
          <dd className="text-navy">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ConfirmStep({ wizard, textField }: StepProps) {
  const { guard, state } = wizard;
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface-muted p-4">
        <h3 className="mb-3 text-sm font-bold text-navy">저장할 내용</h3>
        <SummaryList rows={wizard.summary} />
      </div>
      {textField("horizonMonths", { required: true, numeric: "numeric", hint: "1~1200개월 사이로 입력해 주세요." })}
      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-navy">적용되는 계산 조건 (선택 사항 확인)</summary>
        <div className="mt-3 space-y-3">
          <SummaryList rows={wizard.conditions} />
          {wizard.appliedDefaults.length > 0 ? (
            <p className="text-sm text-slate-600">비워 둔 항목의 적용값: {wizard.appliedDefaults.join(" · ")}</p>
          ) : null}
          <p className="text-sm text-slate-600">
            조건을 바꾸려면 <Link href="/planning?view=full" className="font-semibold text-primary hover:underline">전체 입력 화면</Link>을 이용해 주세요.
          </p>
        </div>
      </details>
      {guard.blockers.length > 0 ? (
        <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-800">
          <p className="font-bold">실행 전에 해결해야 합니다.</p>
          <ul className="list-disc pl-5">{guard.blockers.map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      ) : null}
      {guard.warnings.length > 0 ? (
        <div className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <p className="font-bold">입력값 확인이 필요합니다.</p>
          <ul className="list-disc pl-5">{guard.warnings.map((message) => <li key={message}>{message}</li>)}</ul>
          <label className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold">
            <input
              id={DIAGNOSIS_WARNING_CONFIRM_ID}
              type="checkbox"
              checked={state.confirmedWarnings === guard.signature}
              onChange={(event) => wizard.dispatch({
                type: "confirmWarnings",
                signature: event.target.checked ? guard.signature : null,
              })}
            />
            위 내용을 확인했고 이대로 진행합니다
          </label>
        </div>
      ) : null}
      <p className="text-sm leading-6 text-slate-600">
        입력과 가정에 따른 참고용 계산입니다. 수익이나 목표 달성을 보장하지 않으며, 투자·대출 판단을 대신하지 않습니다.
      </p>
      <p className="text-sm leading-6 text-slate-600">
        아래 버튼을 한 번 누르면 새 프로필을 저장하고, 진단을 실행해 기록을 남긴 뒤, 리포트까지 보관합니다. 기존 프로필은 바뀌지 않습니다.
      </p>
    </div>
  );
}

function ConfirmedIds({ submission }: { submission: DiagnosisSubmissionState }) {
  const rows = [
    { label: "프로필 ID", value: submission.profileId },
    { label: "실행 기록 ID", value: submission.runId },
    { label: "리포트 ID", value: submission.reportId },
  ].filter((row) => row.value);
  return rows.length > 0 ? <SummaryList rows={rows} /> : <p className="text-sm text-slate-600">확정된 저장 기록이 없습니다.</p>;
}

function ResultPanel({ wizard }: WizardProps) {
  const { submission } = wizard.state;
  const [acknowledged, setAcknowledged] = useState(false);
  const links = buildDiagnosisResultLinks(submission);
  const stageLabel = submission.failedStage ? DIAGNOSIS_STAGE_LABELS[submission.failedStage] : "";

  if (submission.status === "complete") {
    return (
      <div className="space-y-4">
        <div role="status" className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
          <p className="text-base font-bold">저장 완료</p>
          <p>새 프로필, 실행 기록, 보관 리포트를 저장했습니다.</p>
          {submission.runStatus === "PARTIAL_SUCCESS" ? <p>일부 계산 단계는 완료되지 않았습니다. 리포트에서 내용을 확인해 주세요.</p> : null}
        </div>
        <p className="text-sm leading-6 text-slate-600">입력과 가정에 따른 참고용 계산입니다. 수익이나 목표 달성을 보장하지 않습니다.</p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={links.reportHref} variant="primary">저장된 리포트 열기</ButtonLink>
          <ButtonLink href={links.runHref} variant="outline">실행 기록 보기</ButtonLink>
          <Button type="button" variant="ghost" onClick={() => wizard.requestReset(false)}>새 진단 시작</Button>
        </div>
      </div>
    );
  }

  const unclear = submission.status === "unknown";
  return (
    <div className="space-y-4">
      <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <p className="text-base font-bold">{unclear ? `저장 여부 미확인 · ${stageLabel}` : `${stageLabel} 단계에서 멈췄습니다`}</p>
        <p>{submission.message}</p>
        <p>완료된 기록과 입력한 내용은 그대로 두었고, 자동으로 다시 보내거나 되돌리지 않았습니다.</p>
      </div>
      <ConfirmedIds submission={submission} />
      <div className="flex flex-wrap gap-x-6">
        <Link href={links.profileHref} className={LINK_CLASS}>저장된 프로필 확인</Link>
        <Link href={links.runHref} className={LINK_CLASS}>실행 기록 확인</Link>
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
          기존 저장 여부를 확인했습니다
        </label>
        <p className="text-sm text-slate-600">새 진단을 시작하면 이 화면의 입력은 지워지고, 이미 저장된 기록은 그대로 남습니다.</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn("mt-2", BLOCKED_BUTTON_CLASS)}
          aria-disabled={acknowledged ? undefined : true}
          onClick={() => wizard.requestReset(acknowledged)}
        >
          새 진단 시작
        </Button>
      </div>
    </div>
  );
}

type StepProps = WizardProps & {
  issueFor: (fieldId: string) => DiagnosisIssue | undefined;
  textField: (field: DiagnosisTextField, options?: { required?: boolean; numeric?: "numeric" | "decimal"; hint?: string }) => ReactNode;
};

export function PlanningDiagnosisWizard({ wizard }: WizardProps) {
  const { dirty, issues, showIssues, state } = wizard;
  const { draft, step, submission } = state;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStepRef = useRef(step);
  const stepTitle = DIAGNOSIS_STEPS.find((item) => item.step === step)?.title ?? "";
  const running = submission.status === "running";
  const finished = submission.status === "complete" || submission.status === "partial" || submission.status === "unknown";

  useEffect(() => {
    if (shownStepRef.current === step) return;
    shownStepRef.current = step;
    headingRef.current?.focus();
  }, [step]);

  const issueFor = (fieldId: string) => (showIssues ? issues.find((issue) => issue.fieldId === fieldId) : undefined);
  const textField: StepProps["textField"] = (field, options = {}) => (
    <TextInput
      id={diagnosisFieldId(field)}
      label={DIAGNOSIS_FIELD_LABELS[field]}
      value={draft[field]}
      issue={issueFor(diagnosisFieldId(field))}
      onChange={(value) => wizard.dispatch({ type: "setField", field, value })}
      {...options}
    />
  );
  const stepProps: StepProps = { wizard, issueFor, textField };
  const blocked = issues.length > 0;

  return (
    <section
      id="planning-input-section"
      data-testid="planning-diagnosis-wizard"
      data-planning-navigation-state="/planning"
      aria-label="단계별 새 진단"
      className="mb-6 scroll-mt-28"
    >
      <Card className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm font-semibold text-primary">
            {DIAGNOSIS_STEPS.length}단계 중 {step}단계 · {stepTitle}
          </p>
          {state.exampleLoaded ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">예시 데이터로 진행 중</span>
          ) : null}
        </div>
        <ol aria-label="진단 단계" className="flex flex-wrap gap-2 text-xs font-semibold">
          {DIAGNOSIS_STEPS.map((item) => (
            <li
              key={item.step}
              aria-current={item.step === step ? "step" : undefined}
              className={cn(
                "rounded-full px-3 py-1",
                item.step === step ? "bg-primary text-primary-foreground" : "bg-surface-muted text-slate-600",
              )}
            >
              {item.step}. {item.title}
            </li>
          ))}
        </ol>

        {finished ? (
          <ResultPanel wizard={wizard} />
        ) : (
          <form
            noValidate
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (step < 5) wizard.goNext();
            }}
          >
            {step === 1 ? (
              <div className="space-y-3 rounded-xl bg-surface-muted p-3">
                <div className="flex flex-wrap gap-x-6">
                  <Link href="/planning?view=full#planning-input-section" className={LINK_CLASS}>저장된 프로필 열기</Link>
                  <Link href="/planning?view=full" className={LINK_CLASS}>전체 입력 화면</Link>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" size="sm" variant="outline" onClick={wizard.loadExample}>테스트 프로필 불러오기</Button>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">예시 데이터</span>
                  <span className="text-xs text-slate-600">실제 정보가 아닌 합성 값이며, 불러오기만으로는 아무것도 저장되지 않습니다.</span>
                </div>
              </div>
            ) : null}

            <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-navy outline-none">{stepTitle}</h2>
            {step === 1 ? <BasicStep {...stepProps} /> : null}
            {step === 2 ? <CashflowStep {...stepProps} /> : null}
            {step === 3 ? <AssetStep {...stepProps} /> : null}
            {step === 4 ? <GoalStep {...stepProps} /> : null}
            {step === 5 ? <ConfirmStep {...stepProps} /> : null}

            {submission.status === "rejected" ? (
              <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-800">
                <p className="font-bold">프로필을 저장하지 못했습니다. 저장된 내용은 없습니다.</p>
                <p>{submission.message}</p>
              </div>
            ) : null}
            {running ? (
              <p role="status" className="text-sm font-semibold text-primary">
                {submission.stage ? `${DIAGNOSIS_STAGE_LABELS[submission.stage]} 중입니다.` : "저장 중입니다."} 끝날 때까지 이 창을 닫지 말아 주세요.
              </p>
            ) : null}
            {blocked ? (
              <p className="text-sm font-semibold leading-6 text-rose-700">
                {step < 5 ? "다음 단계로 가려면" : "실행하려면"} 입력이 필요합니다: {issues.map((issue) => issue.label).join(", ")}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" disabled={step === 1 || running} onClick={wizard.goPrevious}>이전</Button>
              {step < 5 ? (
                <Button type="submit" variant="primary" className={BLOCKED_BUTTON_CLASS} aria-disabled={blocked ? true : undefined}>다음</Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  className={BLOCKED_BUTTON_CLASS}
                  disabled={running}
                  aria-disabled={!running && !wizard.canSubmit ? true : undefined}
                  onClick={() => void wizard.submit()}
                >
                  {running ? "저장 중…" : "진단 실행·저장"}
                </Button>
              )}
              {dirty && !running ? (
                <Button type="button" variant="ghost" onClick={() => wizard.requestReset(false)}>입력 모두 지우기</Button>
              ) : null}
            </div>
            <p className="text-xs leading-5 text-slate-500">
              입력한 내용은 이 탭에만 임시로 남습니다. 새로고침하거나 창을 닫으면 사라지고, 다시 시작해야 합니다.
            </p>
          </form>
        )}
      </Card>
    </section>
  );
}
