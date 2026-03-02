"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { copyToClipboard } from "@/lib/browser/clipboard";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";
import { buildPlanningFeedbackIssueTemplate } from "@/lib/ops/feedback/planningFeedbackIssueTemplate";
import type {
  PlanningFeedback,
  PlanningFeedbackPriority,
  PlanningFeedbackStatus,
} from "@/lib/ops/feedback/planningFeedbackTypes";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

type ListPayload = {
  ok?: boolean;
  data?: PlanningFeedback[];
  message?: string;
};

type DetailPayload = {
  ok?: boolean;
  data?: PlanningFeedback;
  message?: string;
  code?: string;
  meta?: { expectedConfirm?: string };
};

const STATUS_OPTIONS: PlanningFeedbackStatus[] = ["new", "triaged", "doing", "done"];
const PRIORITY_OPTIONS: PlanningFeedbackPriority[] = ["p0", "p1", "p2", "p3"];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return "-";
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function parseTags(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of text.split(",")) {
    const compact = asString(row).replace(/\s+/g, " ");
    if (!compact) continue;
    const key = compact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(compact);
  }
  return out;
}

function summarize(item: PlanningFeedback): string {
  if (item.content.message.length <= 72) return item.content.message;
  return `${item.content.message.slice(0, 72)}...`;
}

export function OpsPlanningFeedbackClient() {
  const [csrf, setCsrf] = useState("");
  const [rows, setRows] = useState<PlanningFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PlanningFeedbackStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | PlanningFeedbackPriority>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [triageStatus, setTriageStatus] = useState<PlanningFeedbackStatus>("new");
  const [triagePriority, setTriagePriority] = useState<PlanningFeedbackPriority>("p2");
  const [triageTags, setTriageTags] = useState("");
  const [triageDue, setTriageDue] = useState("");
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [issueConfirmText, setIssueConfirmText] = useState("");

  useEffect(() => {
    setCsrf(readDevCsrfToken());
  }, []);

  async function loadList(currentCsrf: string): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/ops/feedback/planning?csrf=${encodeURIComponent(currentCsrf)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ListPayload | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        throw new Error(payload?.message ?? "피드백 목록을 불러오지 못했습니다.");
      }
      setRows(payload.data);
      if (payload.data.length > 0 && !selectedId) {
        setSelectedId(payload.data[0].id);
      }
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "피드백 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!csrf) return;
    void loadList(csrf);
  }, [csrf]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (statusFilter !== "all" && row.triage.status !== statusFilter) return false;
    if (priorityFilter !== "all" && row.triage.priority !== priorityFilter) return false;
    if (tagFilter) {
      const needle = tagFilter.trim().toLowerCase();
      if (!needle) return true;
      const found = row.triage.tags.some((tag) => tag.toLowerCase().includes(needle));
      if (!found) return false;
    }
    return true;
  }), [priorityFilter, rows, statusFilter, tagFilter]);

  const selected = useMemo(
    () => filteredRows.find((row) => row.id === selectedId) ?? filteredRows[0] ?? null,
    [filteredRows, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setTriageStatus(selected.triage.status);
    setTriagePriority(selected.triage.priority);
    setTriageTags((selected.triage.tags ?? []).join(", "));
    setTriageDue(selected.triage.due ?? "");
    setIssueConfirmText("");
  }, [selected?.id]);

  async function refreshAndSelect(id?: string): Promise<void> {
    if (!csrf) return;
    await loadList(csrf);
    if (id) setSelectedId(id);
  }

  async function saveTriage(): Promise<void> {
    if (!selected || !csrf) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/ops/feedback/planning/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          triage: {
            status: triageStatus,
            priority: triagePriority,
            tags: parseTags(triageTags),
            due: triageDue.trim() || undefined,
          },
        })),
      });
      const payload = (await response.json().catch(() => null)) as DetailPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.message ?? "triage 저장에 실패했습니다.");
      }
      setNotice("triage 저장 완료");
      await refreshAndSelect(payload.data.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "triage 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelected(): Promise<void> {
    if (!selected || !csrf) return;
    const ok = window.confirm(`피드백 ${selected.id}를 삭제할까요?`);
    if (!ok) return;

    setDeleting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/ops/feedback/planning/${encodeURIComponent(selected.id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({})),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "삭제에 실패했습니다.");
      }
      setNotice("삭제 완료");
      setSelectedId("");
      await refreshAndSelect();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  async function copyIssueTemplate(): Promise<void> {
    if (!selected) return;
    const markdown = buildPlanningFeedbackIssueTemplate(selected);
    const copied = await copyToClipboard(markdown);
    if (copied.ok) {
      setNotice("Issue 템플릿을 클립보드에 복사했습니다.");
      return;
    }
    setError(copied.message ?? "템플릿 복사에 실패했습니다.");
  }

  function expectedConfirm(id: string): string {
    return `CREATE_ISSUE ${id}`;
  }

  async function createGithubIssueForSelected(): Promise<void> {
    if (!selected || !csrf) return;
    if (selected.triage.status === "new") {
      setError("triage 상태가 new인 피드백은 status를 triaged/doing/done으로 바꾼 뒤 생성하세요.");
      return;
    }
    if (selected.link?.githubIssue?.url) {
      setNotice("이미 GitHub 이슈가 연결되어 있습니다.");
      return;
    }

    setCreatingIssue(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/ops/feedback/planning/${encodeURIComponent(selected.id)}/create-issue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          confirmText: issueConfirmText,
        })),
      });
      const payload = (await response.json().catch(() => null)) as DetailPayload | null;
      if (!response.ok || !payload?.ok) {
        const expected = asString(payload?.meta?.expectedConfirm);
        const message = payload?.message ?? "GitHub Issue 생성에 실패했습니다.";
        throw new Error(expected ? `${message} (expected: ${expected})` : message);
      }

      const issue = payload.data?.link?.githubIssue;
      setNotice(issue?.number ? `GitHub Issue 생성 완료 #${issue.number}` : (payload.message ?? "GitHub Issue 생성 완료"));
      await refreshAndSelect(selected.id);
      setIssueConfirmText("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "GitHub Issue 생성에 실패했습니다.");
    } finally {
      setCreatingIssue(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Ops Planning Feedback"
        description="planning 화면에서 수집된 피드백을 triage하고 이슈 템플릿으로 변환합니다. (Dev only)"
        action={(
          <div className="flex items-center gap-2">
            <Link href="/ops/planning">
              <Button size="sm" variant="outline">/ops/planning</Button>
            </Link>
            <Link href="/planning">
              <Button size="sm" variant="outline">/planning</Button>
            </Link>
          </div>
        )}
      />

      {!csrf ? (
        <Card className="mb-6 border border-amber-200 bg-amber-50 text-sm text-amber-800">
          Dev unlock/CSRF 토큰이 없어 목록 조회/수정이 차단됩니다. 먼저 Dev unlock을 완료하세요.
        </Card>
      ) : null}

      {notice ? <p className="mb-3 text-sm font-semibold text-emerald-700">{notice}</p> : null}
      {error ? <p className="mb-3 text-sm font-semibold text-rose-700">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-600">
              상태
              <select
                className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | PlanningFeedbackStatus)}
              >
                <option value="all">all</option>
                {STATUS_OPTIONS.map((row) => <option key={row} value={row}>{row}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              우선순위
              <select
                className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value as "all" | PlanningFeedbackPriority)}
              >
                <option value="all">all</option>
                {PRIORITY_OPTIONS.map((row) => <option key={row} value={row}>{row}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              태그
              <input
                className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                placeholder="tag 검색"
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-3 max-h-[560px] overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2">시간</th>
                  <th className="px-3 py-2">분류</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">우선순위</th>
                  <th className="px-3 py-2">제목</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-3 py-4 text-slate-500" colSpan={5}>로딩 중...</td></tr>
                ) : filteredRows.length < 1 ? (
                  <tr><td className="px-3 py-4 text-slate-500" colSpan={5}>피드백이 없습니다.</td></tr>
                ) : filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-t border-slate-200 ${selected?.id === row.id ? "bg-emerald-50" : "bg-white hover:bg-slate-50"}`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="px-3 py-2">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-2">{row.content.category}</td>
                    <td className="px-3 py-2">{row.triage.status}</td>
                    <td className="px-3 py-2">{row.triage.priority}</td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-800">{row.content.title}</p>
                      <p className="mt-1 text-slate-600">{summarize(row)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          {!selected ? (
            <p className="text-sm text-slate-500">선택된 피드백이 없습니다.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="font-semibold text-slate-900">{selected.content.title}</p>
                <p className="mt-1 text-slate-700">{selected.content.message}</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">
                  status
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                    value={triageStatus}
                    onChange={(event) => setTriageStatus(event.target.value as PlanningFeedbackStatus)}
                  >
                    {STATUS_OPTIONS.map((row) => <option key={row} value={row}>{row}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  priority
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                    value={triagePriority}
                    onChange={(event) => setTriagePriority(event.target.value as PlanningFeedbackPriority)}
                  >
                    {PRIORITY_OPTIONS.map((row) => <option key={row} value={row}>{row}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                  tags (comma)
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                    value={triageTags}
                    onChange={(event) => setTriageTags(event.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                  due (YYYY-MM-DD)
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                    value={triageDue}
                    onChange={(event) => setTriageDue(event.target.value)}
                  />
                </label>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <p>snapshotRef: id={asString(selected.context.snapshot?.id) || "-"}, asOf={asString(selected.context.snapshot?.asOf) || "-"}, fetchedAt={asString(selected.context.snapshot?.fetchedAt) || "-"}, missing={String(selected.context.snapshot?.missing === true)}</p>
                <p>runId: {asString(selected.context.runId) || "-"}</p>
                <p>reportId: {asString(selected.context.reportId) || "-"}</p>
                <p>health: critical={typeof selected.context.health?.criticalCount === "number" ? selected.context.health.criticalCount : "-"}, warnings={selected.context.health?.warningsCodes?.join(", ") || "-"}</p>
                <p>linked issue: {selected.link?.githubIssue?.url ? (
                  <a className="font-semibold text-emerald-700 underline" href={selected.link.githubIssue.url} rel="noreferrer" target="_blank">
                    #{selected.link.githubIssue.number}
                  </a>
                ) : "-"}</p>
              </div>

              <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">Create GitHub Issue</p>
                <p className="mt-1">confirm: <span className="font-mono">{expectedConfirm(selected.id)}</span></p>
                {selected.triage.status === "new" ? (
                  <p className="mt-1 text-amber-700">status가 new이면 생성할 수 없습니다. 먼저 triage를 저장하세요.</p>
                ) : null}
                <input
                  className="mt-2 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                  placeholder={expectedConfirm(selected.id)}
                  value={issueConfirmText}
                  onChange={(event) => setIssueConfirmText(event.target.value)}
                  disabled={creatingIssue || selected.triage.status === "new" || Boolean(selected.link?.githubIssue?.url)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void saveTriage()} disabled={saving || deleting}>저장</Button>
                <Button size="sm" variant="outline" onClick={() => void copyIssueTemplate()}>Issue 템플릿 복사</Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void createGithubIssueForSelected()}
                  disabled={saving || deleting || creatingIssue || selected.triage.status === "new" || Boolean(selected.link?.githubIssue?.url)}
                >
                  {selected.link?.githubIssue?.url ? "Issue 연결됨" : (creatingIssue ? "생성 중..." : "Create GitHub Issue")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void deleteSelected()} disabled={saving || deleting}>
                  {deleting ? "삭제 중..." : "삭제"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

export default OpsPlanningFeedbackClient;
