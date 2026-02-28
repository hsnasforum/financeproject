"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { copyToClipboard } from "@/lib/browser/clipboard";
import { downloadText } from "@/lib/browser/download";

type ArtifactOption = {
  name: string;
  label: string;
  isJson: boolean;
};

type ArtifactData = {
  name: string;
  path: string;
  content: string;
  truncated: boolean;
};

type ArtifactApiPayload = {
  ok?: boolean;
  data?: ArtifactData | null;
  error?: {
    code?: string;
    message?: string;
  };
};

const ARTIFACT_OPTIONS: ArtifactOption[] = [
  { name: "brief_md", label: "brief_md", isJson: false },
  { name: "alerts_md", label: "alerts_md", isJson: false },
  { name: "digest_md", label: "digest_md", isJson: false },
  { name: "refresh_json", label: "refresh_json", isJson: true },
  { name: "refresh_log", label: "refresh_log", isJson: false },
  { name: "alerts_json", label: "alerts_json", isJson: true },
  { name: "digest_json", label: "digest_json", isJson: true },
  { name: "brief_json", label: "brief_json", isJson: true },
  { name: "rules_eval_md", label: "rules_eval_md", isJson: false },
  { name: "rules_quality_md", label: "rules_quality_md", isJson: false },
  { name: "rules_suggest_md", label: "rules_suggest_md", isJson: false },
  { name: "rules_patch_diff_md", label: "rules_patch_diff_md", isJson: false },
  { name: "rules_labeled_md", label: "rules_labeled_md", isJson: false },
  { name: "rules_eval_json", label: "rules_eval_json", isJson: true },
  { name: "rules_labeled_json", label: "rules_labeled_json", isJson: true },
  { name: "rules_suggest_json", label: "rules_suggest_json", isJson: true },
  { name: "rules_patch_json", label: "rules_patch_json", isJson: true },
  { name: "rules_pr_patch", label: "rules_pr_patch", isJson: false },
];

const ARTIFACT_FILENAMES: Record<string, string> = {
  brief_md: "dart-daily-brief.md",
  alerts_md: "dart-disclosure-alerts.md",
  digest_md: "dart-disclosure-digest.md",
  refresh_json: "daily_refresh_result.json",
  refresh_log: "daily_refresh.log",
  alerts_json: "disclosure_alerts.json",
  digest_json: "disclosure_digest.json",
  brief_json: "daily_brief.json",
  rules_eval_md: "dart-rules-eval-report.md",
  rules_quality_md: "dart-rules-quality-report.md",
  rules_suggest_md: "dart-rules-suggestions.md",
  rules_patch_diff_md: "dart-rules-patch-diff.md",
  rules_labeled_md: "dart-rules-labeled-report.md",
  rules_eval_json: "rules_eval.json",
  rules_labeled_json: "rules_labeled_eval.json",
  rules_suggest_json: "rules_suggestions.json",
  rules_patch_json: "rules_patch.json",
  rules_pr_patch: "rules_pr.patch",
};

export default function DashboardArtifactsPage() {
  const [selectedName, setSelectedName] = useState<string>(ARTIFACT_OPTIONS[0]?.name ?? "brief_md");
  const [prettyJson, setPrettyJson] = useState(true);
  const [actionState, setActionState] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [state, setState] = useState<{ loading: boolean; data: ArtifactData | null; error: string | null }>({
    loading: true,
    data: null,
    error: null,
  });

  const selectedOption = useMemo(
    () => ARTIFACT_OPTIONS.find((option) => option.name === selectedName) ?? ARTIFACT_OPTIONS[0],
    [selectedName],
  );

  useEffect(() => {
    let active = true;
    async function load() {
      setActionState(null);
      setState({ loading: true, data: null, error: null });
      try {
        const response = await fetch(`/api/dev/artifacts?name=${encodeURIComponent(selectedName)}`, { cache: "no-store" });
        const payload = (await response.json()) as ArtifactApiPayload;
        if (!response.ok || payload.ok !== true) {
          throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
        }
        if (!active) return;
        setState({ loading: false, data: payload.data ?? null, error: null });
      } catch {
        if (!active) return;
        setState({ loading: false, data: null, error: "산출물 파일을 불러오지 못했습니다." });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [selectedName]);

  const renderedContent = useMemo(() => {
    if (!state.data) return "";
    if (!selectedOption?.isJson || !prettyJson) return state.data.content;
    try {
      const parsed = JSON.parse(state.data.content) as unknown;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return state.data.content;
    }
  }, [prettyJson, selectedOption?.isJson, state.data]);

  const canAction = !state.loading && Boolean(state.data?.content);
  const canPrettyDownload = canAction && Boolean(selectedOption?.isJson);

  const handleCopy = async () => {
    if (!state.data) return;
    const result = await copyToClipboard(state.data.content);
    if (result.ok) {
      setActionState({ kind: "ok", message: "복사되었습니다." });
      return;
    }
    setActionState({ kind: "error", message: result.message ?? "복사에 실패했습니다." });
  };

  const handleDownload = () => {
    if (!state.data) return;
    const filename = ARTIFACT_FILENAMES[state.data.name] ?? `${state.data.name}.txt`;
    const mimeType = selectedOption?.isJson ? "application/json;charset=utf-8" : "text/plain;charset=utf-8";
    downloadText(filename, state.data.content, mimeType);
    setActionState({ kind: "ok", message: "다운로드를 시작했습니다." });
  };

  const handlePrettyJsonDownload = () => {
    if (!state.data || !selectedOption?.isJson) return;
    try {
      const parsed = JSON.parse(state.data.content) as unknown;
      const pretty = JSON.stringify(parsed, null, 2);
      const baseFilename = ARTIFACT_FILENAMES[state.data.name] ?? `${state.data.name}.json`;
      const prettyFilename = baseFilename.endsWith(".json")
        ? baseFilename.replace(/\.json$/i, ".pretty.json")
        : `${baseFilename}.pretty.json`;
      downloadText(prettyFilename, pretty, "application/json;charset=utf-8");
      setActionState({ kind: "ok", message: "Pretty JSON 다운로드를 시작했습니다." });
    } catch {
      setActionState({ kind: "error", message: "JSON 파싱에 실패해 Pretty 다운로드를 할 수 없습니다." });
    }
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] py-10 md:py-14">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4">
        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">산출물 뷰어</h1>
              <p className="mt-2 text-sm text-slate-600">daily refresh / dart watch 산출물 파일을 앱에서 확인합니다.</p>
            </div>
            <Link href="/dashboard" className="text-xs font-bold text-emerald-700 hover:text-emerald-800">
              대시보드로
            </Link>
          </div>
        </section>

        <Card className="rounded-2xl">
          <div className="flex flex-wrap gap-2">
            {ARTIFACT_OPTIONS.map((option) => (
              <button
                key={option.name}
                type="button"
                onClick={() => setSelectedName(option.name)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${selectedName === option.name ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {selectedOption?.isJson ? (
            <label className="mt-3 inline-flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={prettyJson}
                onChange={(event) => setPrettyJson(event.target.checked)}
              />
              JSON pretty
            </label>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { void handleCopy(); }}
              disabled={!canAction}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              복사
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!canAction}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              다운로드
            </button>
            <button
              type="button"
              onClick={handlePrettyJsonDownload}
              disabled={!canPrettyDownload}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Pretty JSON 다운로드
            </button>
          </div>
          {actionState ? (
            <p className={`mt-2 text-xs ${actionState.kind === "ok" ? "text-emerald-700" : "text-rose-600"}`}>
              {actionState.message}
            </p>
          ) : null}

          {state.loading ? (
            <p className="mt-4 text-sm text-slate-500">산출물 로딩 중...</p>
          ) : state.error ? (
            <p className="mt-4 text-sm text-rose-600">{state.error}</p>
          ) : !state.data ? (
            <p className="mt-4 text-sm text-slate-500">아직 생성되지 않음(daily:refresh 또는 dart:watch 실행 필요)</p>
          ) : (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-slate-500">path: {state.data.path}</p>
              {state.data.truncated ? (
                <p className="text-xs text-amber-700">파일 크기 제한으로 일부만 표시됩니다.</p>
              ) : null}
              <pre className="max-h-[65vh] overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-3 text-xs leading-5 text-slate-100">
                {renderedContent}
              </pre>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
