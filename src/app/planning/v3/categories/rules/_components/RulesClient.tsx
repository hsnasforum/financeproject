"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";

type CategoryId =
  | "income"
  | "transfer"
  | "fixed"
  | "variable"
  | "debt"
  | "tax"
  | "insurance"
  | "housing"
  | "food"
  | "transport"
  | "shopping"
  | "health"
  | "education"
  | "etc"
  | "unknown";

type RuleRow = {
  id: string;
  categoryId: CategoryId;
  match: { type: "contains"; value: string };
  priority: number;
  enabled: boolean;
  note?: string;
};

const CATEGORY_OPTIONS: CategoryId[] = [
  "income",
  "transfer",
  "fixed",
  "variable",
  "debt",
  "tax",
  "insurance",
  "housing",
  "food",
  "transport",
  "shopping",
  "health",
  "education",
  "etc",
  "unknown",
];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRuleRow(value: unknown): value is RuleRow {
  if (!isRecord(value)) return false;
  if (!asString(value.id) || !isRecord(value.match)) return false;
  if (asString(value.match.type) !== "contains" || !asString(value.match.value)) return false;
  if (!CATEGORY_OPTIONS.includes(asString(value.categoryId) as CategoryId)) return false;
  return true;
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
}

export function RulesClient() {
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const [ruleId, setRuleId] = useState("");
  const [categoryId, setCategoryId] = useState<CategoryId>("variable");
  const [keyword, setKeyword] = useState("");
  const [priority, setPriority] = useState(50);
  const [enabled, setEnabled] = useState(true);
  const [note, setNote] = useState("");

  async function loadRules() {
    setLoading(true);
    try {
      const response = await fetch(`/api/planning/v3/categories/rules${buildCsrfQuery()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !Array.isArray(payload.items)) {
        setRows([]);
        setMessage("룰 목록 조회에 실패했습니다.");
        return;
      }
      setRows(payload.items.filter(isRuleRow).map((row) => ({
        id: row.id,
        categoryId: row.categoryId,
        match: { type: "contains", value: asString(row.match.value) },
        priority: asNumber(row.priority),
        enabled: row.enabled !== false,
        ...(asString(row.note) ? { note: asString(row.note) } : {}),
      })));
    } catch {
      setRows([]);
      setMessage("룰 목록 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRules();
  }, []);

  async function saveRule() {
    if (saving) return;
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/planning/v3/categories/rules", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          ...(asString(ruleId) ? { id: asString(ruleId) } : {}),
          categoryId,
          match: {
            type: "contains",
            value: asString(keyword),
          },
          priority: asNumber(priority),
          enabled,
          ...(asString(note) ? { note: asString(note) } : {}),
        })),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true) {
        setMessage("룰 저장에 실패했습니다.");
        return;
      }
      setRuleId("");
      setKeyword("");
      setPriority(50);
      setEnabled(true);
      setNote("");
      await loadRules();
      setMessage("룰을 저장했습니다.");
    } catch {
      setMessage("룰 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRule(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/planning/v3/categories/rules/${encodeURIComponent(id)}${buildCsrfQuery()}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true) {
        setMessage("룰 삭제에 실패했습니다.");
        return;
      }
      await loadRules();
      setMessage("룰을 삭제했습니다.");
    } catch {
      setMessage("룰 삭제에 실패했습니다.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-2">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Category Rules</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/transactions">
              배치 목록
            </Link>
            <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/accounts">
              계좌 관리
            </Link>
          </div>
          {message ? <p className="text-sm font-semibold text-slate-700">{message}</p> : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">룰 추가/수정</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              rule id (optional)
              <input
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onChange={(event) => {
                  setRuleId(event.currentTarget.value);
                }}
                placeholder="rule_custom_1"
                value={ruleId}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              category
              <select
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onChange={(event) => {
                  setCategoryId(event.currentTarget.value as CategoryId);
                }}
                value={categoryId}
              >
                {CATEGORY_OPTIONS.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              contains keyword
              <input
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onChange={(event) => {
                  setKeyword(event.currentTarget.value);
                }}
                placeholder="월세"
                value={keyword}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              priority
              <input
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onChange={(event) => {
                  setPriority(asNumber(event.currentTarget.value));
                }}
                type="number"
                value={priority}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              note
              <input
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onChange={(event) => {
                  setNote(event.currentTarget.value);
                }}
                placeholder="optional"
                value={note}
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                checked={enabled}
                onChange={(event) => {
                  setEnabled(event.currentTarget.checked);
                }}
                type="checkbox"
              />
              enabled
            </label>
          </div>
          <Button data-testid="v3-rule-save" disabled={saving} onClick={() => { void saveRule(); }} type="button" variant="primary">
            {saving ? "저장 중..." : "룰 저장"}
          </Button>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">룰 목록</h2>
          {loading ? <p className="text-sm text-slate-600">불러오는 중...</p> : null}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">id</th>
                  <th className="px-3 py-2 text-left">category</th>
                  <th className="px-3 py-2 text-left">keyword</th>
                  <th className="px-3 py-2 text-right">priority</th>
                  <th className="px-3 py-2 text-left">enabled</th>
                  <th className="px-3 py-2 text-left">action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length > 0 ? rows.map((row) => (
                  <tr data-testid={`v3-rule-row-${row.id}`} key={row.id}>
                    <td className="px-3 py-2 font-mono text-xs text-slate-800">{row.id}</td>
                    <td className="px-3 py-2 text-slate-800">{row.categoryId}</td>
                    <td className="px-3 py-2 text-slate-800">{row.match.value}</td>
                    <td className="px-3 py-2 text-right text-slate-800">{row.priority}</td>
                    <td className="px-3 py-2 text-slate-800">{row.enabled ? "Y" : "N"}</td>
                    <td className="px-3 py-2">
                      <Button
                        disabled={deletingId === row.id}
                        onClick={() => { void removeRule(row.id); }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        삭제
                      </Button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td className="px-3 py-2 text-slate-500" colSpan={6}>룰이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}

