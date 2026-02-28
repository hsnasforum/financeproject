"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  resetAutoMergePolicyAction,
  saveAutoMergePolicyAction,
} from "@/app/ops/auto-merge/policy/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import type { AutoMergePolicy } from "@/lib/ops/autoMergePolicy";

type AutoMergePolicyClientProps = {
  csrf: string;
  envEnabledFlag: boolean;
  initialPolicy: AutoMergePolicy;
};

type EffectiveState = {
  envEnabledFlag: boolean;
  policyEnabled: boolean;
  enabled: boolean;
};

function parseChecksText(value: string): string[] {
  const dedup = new Set<string>();
  const out: string[] = [];
  const rows = value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  for (const name of rows) {
    const key = name.toLowerCase();
    if (dedup.has(key)) continue;
    dedup.add(key);
    out.push(name);
  }
  return out;
}

function parseIntInput(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function toChecksText(checks: string[]): string {
  return checks.join("\n");
}

export function AutoMergePolicyClient(props: AutoMergePolicyClientProps) {
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(props.initialPolicy.enabled);
  const [mergeMethod, setMergeMethod] = useState<AutoMergePolicy["mergeMethod"]>(props.initialPolicy.mergeMethod);
  const [requiredLabel, setRequiredLabel] = useState(props.initialPolicy.requiredLabel);
  const [requiredChecksText, setRequiredChecksText] = useState(toChecksText(props.initialPolicy.requiredChecks));
  const [minApprovals, setMinApprovals] = useState(String(props.initialPolicy.minApprovals));
  const [requireClean, setRequireClean] = useState(props.initialPolicy.requireClean);
  const [defaultPollSeconds, setDefaultPollSeconds] = useState(String(props.initialPolicy.arm.defaultPollSeconds));
  const [maxConcurrentPolls, setMaxConcurrentPolls] = useState(String(props.initialPolicy.arm.maxConcurrentPolls));
  const [updatedAt, setUpdatedAt] = useState(props.initialPolicy.updatedAt);
  const [updatedBy, setUpdatedBy] = useState(props.initialPolicy.updatedBy);
  const [errors, setErrors] = useState<string[]>([]);
  const [effective, setEffective] = useState<EffectiveState>({
    envEnabledFlag: props.envEnabledFlag,
    policyEnabled: props.initialPolicy.enabled,
    enabled: props.envEnabledFlag && props.initialPolicy.enabled,
  });

  const hasCsrf = props.csrf.trim().length > 0;
  const parsedChecks = useMemo(() => parseChecksText(requiredChecksText), [requiredChecksText]);

  function buildPayload(): AutoMergePolicy {
    return {
      version: 1,
      enabled,
      mergeMethod,
      requiredLabel: requiredLabel.trim(),
      requiredChecks: parsedChecks,
      minApprovals: parseIntInput(minApprovals, 0),
      requireClean,
      arm: {
        defaultPollSeconds: parseIntInput(defaultPollSeconds, 15),
        maxConcurrentPolls: parseIntInput(maxConcurrentPolls, 3),
      },
      updatedAt,
      updatedBy: updatedBy.trim() || "local",
    };
  }

  function applySavedPolicy(next: AutoMergePolicy, nextEffective?: EffectiveState) {
    setEnabled(next.enabled);
    setMergeMethod(next.mergeMethod);
    setRequiredLabel(next.requiredLabel);
    setRequiredChecksText(toChecksText(next.requiredChecks));
    setMinApprovals(String(next.minApprovals));
    setRequireClean(next.requireClean);
    setDefaultPollSeconds(String(next.arm.defaultPollSeconds));
    setMaxConcurrentPolls(String(next.arm.maxConcurrentPolls));
    setUpdatedAt(next.updatedAt);
    setUpdatedBy(next.updatedBy);
    setEffective(nextEffective ?? {
      envEnabledFlag: effective.envEnabledFlag,
      policyEnabled: next.enabled,
      enabled: effective.envEnabledFlag && next.enabled,
    });
  }

  function onSave() {
    if (!hasCsrf) {
      window.alert("Dev unlock/CSRF가 필요합니다. /ops/rules에서 unlock 후 다시 시도해 주세요.");
      return;
    }
    const payload = buildPayload();
    setErrors([]);
    startTransition(() => {
      void saveAutoMergePolicyAction({
        csrf: props.csrf,
        updatedBy: "local",
        policy: payload,
      }).then((result) => {
        if (!result.ok || !result.data) {
          setErrors(result.errors && result.errors.length > 0 ? result.errors : [result.error?.message ?? "정책 저장 실패"]);
          window.alert(result.error?.message ?? "정책 저장에 실패했습니다.");
          return;
        }
        applySavedPolicy(result.data, result.effective);
        setErrors([]);
        window.alert("Auto-Merge 정책을 저장했습니다.");
      }).catch((error) => {
        const message = error instanceof Error ? error.message : "정책 저장 중 오류가 발생했습니다.";
        setErrors([message]);
        window.alert(message);
      });
    });
  }

  function onReset() {
    if (!hasCsrf) {
      window.alert("Dev unlock/CSRF가 필요합니다. /ops/rules에서 unlock 후 다시 시도해 주세요.");
      return;
    }
    setErrors([]);
    startTransition(() => {
      void resetAutoMergePolicyAction({
        csrf: props.csrf,
        updatedBy: "local",
      }).then((result) => {
        if (!result.ok || !result.data) {
          setErrors(result.errors && result.errors.length > 0 ? result.errors : [result.error?.message ?? "초기화 실패"]);
          window.alert(result.error?.message ?? "기본값 초기화에 실패했습니다.");
          return;
        }
        applySavedPolicy(result.data, result.effective);
        setErrors([]);
        window.alert("기본 정책으로 초기화했습니다.");
      }).catch((error) => {
        const message = error instanceof Error ? error.message : "초기화 중 오류가 발생했습니다.";
        setErrors([message]);
        window.alert(message);
      });
    });
  }

  return (
    <PageShell>
      <PageHeader
        title="Auto Merge Policy"
        description="Auto-Merge 런타임 정책을 수정하고 즉시 반영합니다. (Dev only)"
        action={(
          <div className="flex items-center gap-2">
            <Link href="/ops/auto-merge">
              <Button variant="outline" size="sm">Auto Merge</Button>
            </Link>
            <Link href="/ops">
              <Button variant="outline" size="sm">Ops Hub</Button>
            </Link>
          </div>
        )}
      />

      <Card>
        <h2 className="text-base font-black text-slate-900">Effective Status</h2>
        <p className="mt-2 text-sm text-slate-700">env kill switch (`AUTO_MERGE_ENABLED`): <span className="font-semibold">{effective.envEnabledFlag ? "true" : "false"}</span></p>
        <p className="mt-1 text-sm text-slate-700">policy.enabled: <span className="font-semibold">{effective.policyEnabled ? "true" : "false"}</span></p>
        <p className="mt-1 text-sm text-slate-700">effective enabled(env AND policy): <span className="font-semibold">{effective.enabled ? "true" : "false"}</span></p>
        {!hasCsrf ? (
          <p className="mt-2 text-sm font-semibold text-amber-700">Dev unlock/CSRF가 없어 저장은 차단됩니다.</p>
        ) : null}
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-black text-slate-900">Policy Form</h2>
        <p className="mt-2 text-sm text-slate-600">저장 위치: 로컬 ops policy 저장소(JSON)</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            enabled
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">mergeMethod</span>
            <select
              className="h-11 w-full rounded-xl border border-slate-300 px-3"
              value={mergeMethod}
              onChange={(event) => setMergeMethod(event.target.value as AutoMergePolicy["mergeMethod"])}
            >
              <option value="squash">squash</option>
              <option value="merge">merge</option>
              <option value="rebase">rebase</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">requiredLabel</span>
            <input
              className="h-11 w-full rounded-xl border border-slate-300 px-3"
              value={requiredLabel}
              onChange={(event) => setRequiredLabel(event.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">minApprovals</span>
            <input
              className="h-11 w-full rounded-xl border border-slate-300 px-3"
              value={minApprovals}
              onChange={(event) => setMinApprovals(event.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={requireClean} onChange={(event) => setRequireClean(event.target.checked)} />
            requireClean (mergeable_state=clean)
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">arm.defaultPollSeconds</span>
            <input
              className="h-11 w-full rounded-xl border border-slate-300 px-3"
              value={defaultPollSeconds}
              onChange={(event) => setDefaultPollSeconds(event.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">arm.maxConcurrentPolls</span>
            <input
              className="h-11 w-full rounded-xl border border-slate-300 px-3"
              value={maxConcurrentPolls}
              onChange={(event) => setMaxConcurrentPolls(event.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">updatedBy</span>
            <input
              className="h-11 w-full rounded-xl border border-slate-300 px-3"
              value={updatedBy}
              onChange={(event) => setUpdatedBy(event.target.value)}
            />
          </label>
        </div>

        <label className="mt-4 block space-y-1 text-sm">
          <span className="font-semibold text-slate-700">requiredChecks (newline/comma separated)</span>
          <textarea
            className="h-32 w-full rounded-xl border border-slate-300 p-3 font-mono text-xs"
            value={requiredChecksText}
            onChange={(event) => setRequiredChecksText(event.target.value)}
          />
        </label>

        <p className="mt-2 text-xs text-slate-500">updatedAt: {updatedAt}</p>

        {errors.length > 0 ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {errors.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onSave} disabled={pending || !hasCsrf}>
            {pending ? "저장 중..." : "저장"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onReset} disabled={pending || !hasCsrf}>
            {pending ? "처리 중..." : "Reset to defaults"}
          </Button>
          <Link href="/settings/backup">
            <Button type="button" variant="outline" size="sm">Backup / Import</Button>
          </Link>
        </div>
      </Card>
    </PageShell>
  );
}
