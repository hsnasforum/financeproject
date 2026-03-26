"use client";

import { motion, type Variants } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BodyActionLink, BodySectionHeading, BodyTableFrame, bodyDenseActionRowClassName } from "@/components/ui/BodyTone";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";

type BatchListRow = {
  batchId: string;
  // `/api/planning/v3/batches` follows summary-style omission for hidden createdAt.
  createdAt?: string;
  stats?: {
    months?: number;
    txns?: number;
    unassignedCategory?: number;
    transfers?: number;
  };
};

type ListResponse = {
  ok: true;
  data: BatchListRow[];
};

type DraftCreateResponse = {
  ok: true;
  data: {
    id: string;
    batchId: string;
    createdAt: string;
    stats?: {
      months: number;
      transfersExcluded?: boolean;
      unassignedCount?: number;
    };
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isListResponse(value: unknown): value is ListResponse {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.data)) return false;
  return true;
}

function isDraftCreateResponse(value: unknown): value is DraftCreateResponse {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return false;
  return asString(value.data.id).length > 0;
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
}

const BATCHES_STAGGER_REVEAL: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
      duration: 0.32,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const BATCHES_SECTION_REVEAL: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const batchesTopLinkClassName =
  "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900";

type Props = {
  initialRows?: BatchListRow[];
};

export function BatchesCenterClient({ initialRows = [] }: Props) {
  const [loading, setLoading] = useState(initialRows.length < 1);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<BatchListRow[]>(initialRows);
  const [createLoadingBatchId, setCreateLoadingBatchId] = useState("");
  const featuredRow = rows[0] ?? null;

  const loadRows = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/planning/v3/batches${buildCsrfQuery()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isListResponse(json)) {
        setRows([]);
        setMessage("배치 목록을 불러오지 못했습니다.");
        return;
      }
      const normalized = json.data
        .map((row) => ({
          batchId: asString(row.batchId),
          ...(asString(row.createdAt) ? { createdAt: asString(row.createdAt) } : {}),
          ...(isRecord(row.stats)
            ? {
                stats: {
                  ...(Number.isFinite(Number(row.stats.months)) ? { months: asNumber(row.stats.months) } : {}),
                  ...(Number.isFinite(Number(row.stats.txns)) ? { txns: asNumber(row.stats.txns) } : {}),
                  ...(Number.isFinite(Number(row.stats.unassignedCategory)) ? { unassignedCategory: asNumber(row.stats.unassignedCategory) } : {}),
                  ...(Number.isFinite(Number(row.stats.transfers)) ? { transfers: asNumber(row.stats.transfers) } : {}),
                },
              }
            : {}),
        }))
        .filter((row) => row.batchId.length > 0)
        .sort((left, right) => {
          const leftTs = Date.parse(left.createdAt ?? "");
          const rightTs = Date.parse(right.createdAt ?? "");
          if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs !== rightTs) {
            return rightTs - leftTs;
          }
          return left.batchId.localeCompare(right.batchId);
        });
      setRows(normalized);
    } catch {
      setRows([]);
      setMessage("배치 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  async function handleCreateDraft(batchId: string): Promise<void> {
    setCreateLoadingBatchId(batchId);
    setMessage("");
    try {
      const response = await fetch("/api/planning/v3/profile/drafts", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({ batchId })),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !isDraftCreateResponse(json)) {
        setMessage("초안 생성에 실패했습니다.");
        return;
      }
      window.location.href = `/planning/v3/profile/drafts/${encodeURIComponent(json.data.id)}`;
    } catch {
      setMessage("초안 생성에 실패했습니다.");
    } finally {
      setCreateLoadingBatchId("");
    }
  }

  return (
    <PageShell className="bg-slate-100/80">
      <motion.div
        className="space-y-6 md:space-y-8"
        initial="hidden"
        animate="visible"
        variants={BATCHES_STAGGER_REVEAL}
      >
        <motion.section
          variants={BATCHES_SECTION_REVEAL}
          className="rounded-[2rem] border border-slate-200/90 bg-white px-5 py-5 shadow-sm shadow-slate-200/40 md:px-6 md:py-6"
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] xl:items-start">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-600">Batch Workspace</p>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">배치 목록에서 바로 다음 작업으로 이어집니다</h1>
              <p className="mt-3 text-sm font-medium leading-relaxed text-slate-500 md:text-base">
                저장된 배치를 확인하고, 가장 최근 작업 흐름을 기준으로 요약 확인이나 Profile 초안 생성을 바로 이어갑니다.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <BodyActionLink className={batchesTopLinkClassName} href="/planning/v3/transactions/batches">
                  Transaction Batches
                </BodyActionLink>
                <BodyActionLink className={batchesTopLinkClassName} href="/planning/v3/import/csv">
                  CSV 업로드
                </BodyActionLink>
                <BodyActionLink className={batchesTopLinkClassName} href="/planning/v3/profile/drafts">
                  Draft 목록
                </BodyActionLink>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-emerald-200/90 bg-emerald-50/90 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2.5 w-2.5 flex-none animate-pulse rounded-full bg-emerald-500" />
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">현재 시작점</p>
                  <p className="text-sm font-bold leading-relaxed tracking-tight text-slate-800">
                    {featuredRow
                      ? `${featuredRow.batchId} 배치가 가장 먼저 보이며, 요약 보기 또는 초안 생성으로 바로 이어질 수 있습니다.`
                      : "배치를 업로드하면 이 화면에서 목록, 요약, 다음 작업 시작점을 함께 확인할 수 있습니다."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          variants={BATCHES_SECTION_REVEAL}
          className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]"
        >
          <div className="space-y-4">
            <motion.div
              variants={BATCHES_SECTION_REVEAL}
              className="rounded-[2rem] border border-slate-200/90 bg-white px-5 py-5 shadow-sm shadow-slate-200/40 md:px-6"
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <BodySectionHeading
                title="배치 목록 workspace"
                description="목록 자체를 primary workspace로 두고, 우측에는 현재 목록을 읽는 데 필요한 요약과 보조 정보를 따로 분리했습니다."
                action={(
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                    핵심 작업영역
                  </span>
                )}
              />

              <div className="mt-5 rounded-[1.5rem] border border-slate-200/90 bg-slate-50/80 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                    <span className="rounded-full bg-white px-3 py-1.5">전체 배치 {rows.length}개</span>
                    <span className="rounded-full bg-white px-3 py-1.5">최근 배치 {featuredRow?.batchId ?? "-"}</span>
                  </div>
                  <Button onClick={() => { void loadRows(); }} size="sm" type="button" variant="outline">
                    새로고침
                  </Button>
                </div>

                {message ? <p className="mt-4 text-sm font-semibold text-rose-700">{message}</p> : null}
                {loading ? <p className="mt-4 text-sm text-slate-600">배치 목록을 불러오는 중...</p> : null}

                <div className="mt-4">
                  <BodyTableFrame className="rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
                    <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="v3-batches-list">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left">batchId</th>
                          <th className="px-3 py-2 text-left">createdAt</th>
                          <th className="px-3 py-2 text-right">months</th>
                          <th className="px-3 py-2 text-right">txns</th>
                          <th className="px-3 py-2 text-right">unassigned</th>
                          <th className="px-3 py-2 text-right">transfers</th>
                          <th className="px-3 py-2 text-left">actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {!loading && rows.length < 1 ? (
                          <tr>
                            <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                              저장된 배치가 없습니다.
                            </td>
                          </tr>
                        ) : null}
                        {rows.map((row, index) => {
                          const isFeatured = index === 0;
                          const isCreating = createLoadingBatchId === row.batchId;
                          return (
                            <tr
                              key={row.batchId}
                              className={isFeatured ? "bg-emerald-50/40 transition-colors hover:bg-emerald-50/70" : "transition-colors hover:bg-slate-50"}
                            >
                              <td className="px-3 py-2 font-mono text-xs text-slate-800">
                                <div className="flex items-center gap-2">
                                  <span>{row.batchId}</span>
                                  {isFeatured ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">latest</span> : null}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-xs text-slate-600">{row.createdAt ? formatDateTime(row.createdAt) : "-"}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{asNumber(row.stats?.months ?? 0)}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{asNumber(row.stats?.txns ?? 0)}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{asNumber(row.stats?.unassignedCategory ?? 0)}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{asNumber(row.stats?.transfers ?? 0)}</td>
                              <td className="px-3 py-2">
                                <div className={bodyDenseActionRowClassName}>
                                  <BodyActionLink href={`/planning/v3/batches/${encodeURIComponent(row.batchId)}`}>
                                    요약 보기
                                  </BodyActionLink>
                                  <Button
                                    disabled={isCreating}
                                    onClick={() => {
                                      void handleCreateDraft(row.batchId);
                                    }}
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                  >
                                    {isCreating ? "생성 중..." : "초안 생성"}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </BodyTableFrame>
                </div>
              </div>
            </motion.div>
          </div>

          <motion.aside variants={BATCHES_SECTION_REVEAL} className="space-y-4">
            <motion.div
              className="rounded-[2rem] border border-slate-200/90 bg-slate-50/90 px-5 py-5 shadow-sm shadow-slate-200/30"
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <BodySectionHeading
                title="현재 목록 요약"
                description="목록 우측에는 가장 먼저 확인할 통계와 다음 작업 방향만 남겼습니다."
              />

              <div className="mt-5 space-y-3 text-sm text-slate-600">
                <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">최근 배치</p>
                  <p className="mt-2 break-all text-sm font-bold text-slate-900">{featuredRow?.batchId ?? "아직 저장된 배치가 없습니다."}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">배치 수</p>
                    <p className="mt-2 text-lg font-black tracking-tight text-slate-900">{rows.length}개</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">최근 months</p>
                    <p className="mt-2 text-lg font-black tracking-tight text-slate-900">{asNumber(featuredRow?.stats?.months ?? 0)}</p>
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">다음 작업 권장</p>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600">
                    최근 배치를 먼저 열어 요약을 확인하고, 바로 계획 작업으로 이어갈 때만 초안 생성을 선택하는 흐름이 가장 빠릅니다.
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              variants={BATCHES_SECTION_REVEAL}
              className="rounded-[2rem] border border-slate-200/90 bg-slate-50/90 px-5 py-5 shadow-sm shadow-slate-200/30"
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <BodySectionHeading
                title="지원 메모"
                description="list pane 바깥에서만 필요한 보조 설명입니다."
              />
              <div className="mt-4 space-y-3">
                {[
                  "목록은 최근 createdAt 순서로 다시 정렬되어 가장 최신 배치가 먼저 보입니다.",
                  "요약 보기와 초안 생성 액션은 기존 링크/동작을 그대로 유지합니다.",
                  "모바일에서는 summary pane가 목록 아래로 내려가도 neutral tone 단계가 유지되도록 분리했습니다.",
                ].map((item) => (
                  <div key={item} className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm font-medium leading-relaxed text-slate-600 shadow-sm">
                    {item}
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.aside>
        </motion.section>
      </motion.div>
    </PageShell>
  );
}
