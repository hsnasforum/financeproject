"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { reportHeroActionLinkClassName, ReportHeroCard, ReportHeroStatCard, ReportHeroStatGrid } from "@/components/ui/ReportTone";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";

type Account = {
  id: string;
  name: string;
  kind: "checking" | "saving" | "card" | "cash" | "other" | "bank" | "broker";
  currency: "KRW";
  note?: string;
  startingBalanceKrw?: number;
};

type OpeningBalance = {
  accountId: string;
  asOfDate: string;
  amountKrw: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAccount(value: unknown): value is Account {
  if (!isRecord(value)) return false;
  if (!asString(value.id) || !asString(value.name)) return false;
  const kind = asString(value.kind);
  if (!["checking", "saving", "card", "cash", "other", "bank", "broker"].includes(kind)) return false;
  return asString(value.currency || "KRW").toUpperCase() === "KRW";
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
}

function parseOpeningAmount(value: string): { ok: true; value: number } | { ok: false } {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return { ok: false };
  const numeric = Number(trimmed);
  if (!Number.isSafeInteger(numeric)) return { ok: false };
  return { ok: true, value: numeric };
}

function parseOpeningDate(value: string): { ok: true; value: string } | { ok: false } {
  const trimmed = value.trim();
  const matched = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return { ok: false };
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return { ok: false };
  }
  return { ok: true, value: trimmed };
}

function defaultAsOfDate(): string {
  const now = new Date();
  const year = String(now.getUTCFullYear()).padStart(4, "0");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function AccountsClient() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<Account[]>([]);
  const [openingByAccount, setOpeningByAccount] = useState<Record<string, OpeningBalance>>({});

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Account["kind"]>("bank");
  const [note, setNote] = useState("");

  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState<Account["kind"]>("bank");
  const [editNote, setEditNote] = useState("");

  const [openingDateDrafts, setOpeningDateDrafts] = useState<Record<string, string>>({});
  const [openingAmountDrafts, setOpeningAmountDrafts] = useState<Record<string, string>>({});
  const [savingOpeningId, setSavingOpeningId] = useState("");
  const openingCount = rows.filter((row) => Boolean(openingByAccount[row.id])).length;
  const notedCount = rows.filter((row) => asString(row.note).length > 0).length;

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [accountsResponse, openingResponse] = await Promise.all([
        fetch(`/api/planning/v3/accounts${buildCsrfQuery()}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch(`/api/planning/v3/opening-balances${buildCsrfQuery()}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);
      const accountsPayload = await accountsResponse.json().catch(() => null);
      const openingPayload = await openingResponse.json().catch(() => null);

      if (!accountsResponse.ok || !isRecord(accountsPayload) || accountsPayload.ok !== true || !Array.isArray(accountsPayload.items)) {
        setRows([]);
        setMessage("계좌 목록을 불러오지 못했습니다.");
        return;
      }

      const accounts = accountsPayload.items.filter(isAccount);
      const openingData = (
        openingResponse.ok
        && isRecord(openingPayload)
        && openingPayload.ok === true
        && isRecord(openingPayload.data)
      ) ? openingPayload.data : {};

      const openings: Record<string, OpeningBalance> = {};
      for (const account of accounts) {
        const opening = openingData[account.id];
        if (!isRecord(opening)) continue;
        const asOfDate = asString(opening.asOfDate);
        const amountKrw = Number(opening.amountKrw);
        if (!asOfDate || !Number.isFinite(amountKrw) || !Number.isInteger(amountKrw)) continue;
        openings[account.id] = {
          accountId: account.id,
          asOfDate,
          amountKrw,
        };
      }

      setRows(accounts);
      setOpeningByAccount(openings);
      setOpeningDateDrafts(Object.fromEntries(
        accounts.map((account) => [account.id, openings[account.id]?.asOfDate ?? defaultAsOfDate()]),
      ));
      setOpeningAmountDrafts(Object.fromEntries(
        accounts.map((account) => {
          const existing = openings[account.id]?.amountKrw;
          if (Number.isInteger(existing)) return [account.id, String(existing)];
          if (Number.isInteger(account.startingBalanceKrw)) return [account.id, String(account.startingBalanceKrw)];
          return [account.id, ""];
        }),
      ));
    } catch {
      setRows([]);
      setOpeningByAccount({});
      setMessage("계좌 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    setMessage("");
    try {
      const response = await fetch("/api/planning/v3/accounts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          name,
          kind,
          ...(note.trim() ? { note } : {}),
        })),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !isAccount(payload.account)) {
        setMessage("계좌를 생성하지 못했습니다.");
        return;
      }
      setName("");
      setKind("bank");
      setNote("");
      await loadAccounts();
    } catch {
      setMessage("계좌를 생성하지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setMessage("");
    try {
      const response = await fetch(`/api/planning/v3/accounts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({})),
      });
      if (!response.ok) {
        setMessage("계좌를 삭제하지 못했습니다.");
        return;
      }
      await loadAccounts();
      if (editingId === id) setEditingId("");
    } catch {
      setMessage("계좌를 삭제하지 못했습니다.");
    }
  }

  async function handleUpdate(id: string) {
    setMessage("");
    try {
      const response = await fetch(`/api/planning/v3/accounts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          name: editName,
          kind: editKind,
          note: editNote,
        })),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !isAccount(payload.account)) {
        setMessage("계좌를 수정하지 못했습니다.");
        return;
      }
      setEditingId("");
      await loadAccounts();
    } catch {
      setMessage("계좌를 수정하지 못했습니다.");
    }
  }

  async function handleSaveOpeningBalance(id: string) {
    if (savingOpeningId) return;
    setMessage("");

    const parsedDate = parseOpeningDate(openingDateDrafts[id] ?? "");
    if (!parsedDate.ok) {
      setMessage("기준일은 YYYY-MM-DD 형식이어야 합니다.");
      return;
    }
    const parsedAmount = parseOpeningAmount(openingAmountDrafts[id] ?? "");
    if (!parsedAmount.ok) {
      setMessage("초기잔액은 정수(원 단위)로 입력해 주세요.");
      return;
    }

    setSavingOpeningId(id);
    try {
      const response = await fetch("/api/planning/v3/opening-balances", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          accountId: id,
          asOfDate: parsedDate.value,
          amountKrw: parsedAmount.value,
        })),
      });
      if (!response.ok) {
        setMessage("초기잔액을 저장하지 못했습니다.");
        return;
      }
      await loadAccounts();
    } catch {
      setMessage("초기잔액을 저장하지 못했습니다.");
    } finally {
      setSavingOpeningId("");
    }
  }

  return (
    <PageShell>
      <div className="space-y-5" data-testid="v3-accounts-root">
        <ReportHeroCard
          kicker="Account Registry"
          title="계좌와 기준 잔액을 먼저 정리합니다"
          description="입출금, 카드, 현금 계정을 한곳에서 정리하고 월별 잔액 계산에 쓰일 기준일 초기잔액까지 연결합니다."
          action={(
            <>
              <Link className={reportHeroActionLinkClassName} href="/planning/v3/transactions/batches">
                배치 목록
              </Link>
              <Link className={reportHeroActionLinkClassName} href="/planning/v3/import/csv">
                CSV Import
              </Link>
              <Link className={reportHeroActionLinkClassName} href="/planning/v3/balances">
                Balance Timeline
              </Link>
            </>
          )}
        >
          <ReportHeroStatGrid>
            <ReportHeroStatCard label="등록 계좌" value={`${rows.length}개`} description="현재 저장된 계좌 수" />
            <ReportHeroStatCard label="기준 잔액 입력" value={`${openingCount}개`} description="opening balance 연결 완료" />
            <ReportHeroStatCard label="메모 포함" value={`${notedCount}개`} description="설명/식별 노트가 있는 계좌" />
            <ReportHeroStatCard label="현재 상태" value={loading ? "불러오는 중" : "편집 가능"} description={message ? "처리 메시지 확인 필요" : "바로 추가/수정할 수 있습니다."} />
          </ReportHeroStatGrid>
          {message ? <p className="text-xs font-semibold text-rose-300">{message}</p> : null}
        </ReportHeroCard>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">계좌 추가</h2>
          <div className="grid gap-2 sm:grid-cols-4">
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              data-testid="v3-account-name"
              onChange={(event) => {
                setName(event.currentTarget.value);
              }}
              placeholder="계좌 이름"
              value={name}
            />
            <select
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              data-testid="v3-account-kind"
              onChange={(event) => {
                setKind(event.currentTarget.value as Account["kind"]);
              }}
              value={kind}
            >
              <option value="bank">bank</option>
              <option value="card">card</option>
              <option value="cash">cash</option>
              <option value="broker">broker</option>
              <option value="checking">checking</option>
              <option value="saving">saving</option>
              <option value="other">other</option>
            </select>
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-2"
              onChange={(event) => {
                setNote(event.currentTarget.value);
              }}
              placeholder="노트(선택)"
              value={note}
            />
          </div>
          <Button
            data-testid="v3-create-account"
            disabled={!name.trim() || creating}
            onClick={() => {
              void handleCreate();
            }}
            size="sm"
            type="button"
          >
            {creating ? "생성 중..." : "계좌 생성"}
          </Button>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">계좌 목록</h2>
          {loading ? <p className="text-sm text-slate-600">불러오는 중...</p> : null}
          {!loading && rows.length < 1 ? <p className="text-sm text-slate-600">등록된 계좌가 없습니다.</p> : null}

          {rows.length > 0 ? (
            <div className="space-y-2">
              {rows.map((row) => (
                <div
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  data-testid={`v3-account-row-${row.id}`}
                  key={row.id}
                >
                  {editingId === row.id ? (
                    <div className="space-y-2">
                      <div className="grid gap-2 sm:grid-cols-4">
                        <input
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          onChange={(event) => {
                            setEditName(event.currentTarget.value);
                          }}
                          value={editName}
                        />
                        <select
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          onChange={(event) => {
                            setEditKind(event.currentTarget.value as Account["kind"]);
                          }}
                          value={editKind}
                        >
                          <option value="bank">bank</option>
                          <option value="card">card</option>
                          <option value="cash">cash</option>
                          <option value="broker">broker</option>
                          <option value="checking">checking</option>
                          <option value="saving">saving</option>
                          <option value="other">other</option>
                        </select>
                        <input
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-2"
                          onChange={(event) => {
                            setEditNote(event.currentTarget.value);
                          }}
                          value={editNote}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          onClick={() => {
                            void handleUpdate(row.id);
                          }}
                          size="sm"
                          type="button"
                        >
                          저장
                        </Button>
                        <Button
                          onClick={() => {
                            setEditingId("");
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                        <p className="text-xs text-slate-600">{row.kind} / {row.currency}</p>
                        {row.note ? <p className="text-xs text-slate-500">{row.note}</p> : null}
                        {openingByAccount[row.id] ? (
                          <p className="text-xs font-semibold text-emerald-700">
                            opening: {openingByAccount[row.id].asOfDate} / {openingByAccount[row.id].amountKrw.toLocaleString("ko-KR")}원
                          </p>
                        ) : (
                          <p className="text-xs font-semibold text-amber-700">초기잔액 미설정</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            data-testid={`v3-opening-date-${row.id}`}
                            onChange={(event) => {
                              const next = event.currentTarget.value;
                              setOpeningDateDrafts((prev) => ({ ...prev, [row.id]: next }));
                            }}
                            placeholder="YYYY-MM-DD"
                            value={openingDateDrafts[row.id] ?? defaultAsOfDate()}
                          />
                          <input
                            className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            data-testid={`v3-opening-amount-${row.id}`}
                            inputMode="numeric"
                            onChange={(event) => {
                              const next = event.currentTarget.value;
                              setOpeningAmountDrafts((prev) => ({ ...prev, [row.id]: next }));
                            }}
                            placeholder="초기잔액 (KRW)"
                            value={openingAmountDrafts[row.id] ?? ""}
                          />
                          <Button
                            data-testid={`v3-opening-save-${row.id}`}
                            disabled={Boolean(savingOpeningId && savingOpeningId !== row.id)}
                            onClick={() => {
                              void handleSaveOpeningBalance(row.id);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {savingOpeningId === row.id ? "저장 중..." : "초기잔액 저장"}
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            onClick={() => {
                              setEditingId(row.id);
                              setEditName(row.name);
                              setEditKind(row.kind);
                              setEditNote(row.note ?? "");
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            수정
                          </Button>
                          <Button
                            onClick={() => {
                              void handleDelete(row.id);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            삭제
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
}
