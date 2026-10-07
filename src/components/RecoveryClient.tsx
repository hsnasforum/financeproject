"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { CLIENT_STORAGE_WHITELIST } from "@/lib/backup/backupBundle";
import {
  isRecommendOwnerStorageKey,
  RECOMMEND_LEGACY_STORAGE_KEYS,
} from "@/lib/recommend/ownerNamespace";

const RESET_CONFIRM_TEXT = "초기화";

function collectBrowserStateKeys(): Set<string> {
  const keys = new Set<string>([
    ...CLIENT_STORAGE_WHITELIST,
    ...RECOMMEND_LEGACY_STORAGE_KEYS,
  ]);
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && isRecommendOwnerStorageKey(key)) keys.add(key);
    }
  } catch {
    // 열거가 제한된 브라우저에서는 알려진 키만 대상으로 계속 진행합니다.
  }
  return keys;
}

export function RecoveryClient() {
  const [confirmText, setConfirmText] = useState("");
  const [removedCount, setRemovedCount] = useState<number | null>(null);
  const [error, setError] = useState("");

  function resetBrowserState(): void {
    if (confirmText !== RESET_CONFIRM_TEXT) {
      setError(`확인 입력란에 '${RESET_CONFIRM_TEXT}'를 정확히 입력해 주세요.`);
      return;
    }

    let removed = 0;
    for (const key of collectBrowserStateKeys()) {
      try {
        if (window.localStorage.getItem(key) !== null) removed += 1;
        window.localStorage.removeItem(key);
      } catch {
        // 한 키의 삭제 실패가 다른 브라우저 상태 초기화를 막지 않도록 계속 진행합니다.
      }
    }
    setRemovedCount(removed);
    setConfirmText("");
    setError("");
  }

  return (
    <PageShell>
      <PageHeader
        title="복구 도움말"
        description="화면 설정을 초기화하거나 백업 파일에서 내 재무설계 기록을 복원할 수 있습니다."
        action={(
          <ButtonLink href="/settings" variant="outline">설정 홈</ButtonLink>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-black text-navy">백업 파일에서 데이터 복원</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            프로필이나 실행 기록이 보이지 않는다면 먼저 백업 및 복원 화면에서 암호화 백업 파일의 미리보기를 확인해 주세요.
          </p>
          <div className="mt-5">
            <ButtonLink href="/settings/backup" variant="primary">백업 및 복원 열기</ButtonLink>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-black text-navy">앱 실행 문제 확인</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            데이터가 늦게 갱신되거나 일부 카드가 비어 있다면 데이터 소스 상태를 먼저 확인하세요. 앱 자체가 열리지 않으면 앱을 완전히 종료한 뒤 공식 실행 아이콘으로 다시 시작해 주세요.
          </p>
          <div className="mt-5">
            <ButtonLink href="/settings/data-sources" variant="outline">데이터 소스 상태 보기</ButtonLink>
          </div>
        </Card>
      </div>

      <Card className="mt-6 border-amber-200 bg-amber-50/40">
        <h2 className="text-base font-black text-navy">이 브라우저의 화면 설정 초기화</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          필터, 비교 목록, 최근 추천 화면 상태처럼 이 브라우저에만 저장된 값을 삭제합니다. 서버에 저장된 프로필과 실행 기록은 삭제하지 않습니다.
        </p>
        <label className="mt-5 block text-xs font-semibold text-slate-700" htmlFor="browser-reset-confirm">
          계속하려면 <strong>{RESET_CONFIRM_TEXT}</strong> 입력
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="browser-reset-confirm"
            className="h-11 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={confirmText}
            onChange={(event) => {
              setConfirmText(event.target.value);
              setError("");
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={confirmText !== RESET_CONFIRM_TEXT}
            onClick={resetBrowserState}
          >
            브라우저 설정 초기화
          </Button>
        </div>
        {removedCount !== null ? (
          <p className="mt-3 text-sm font-semibold text-navy" role="status" aria-live="polite">
            브라우저 설정 {removedCount}개를 초기화했습니다. 새로고침하면 기본 화면으로 시작합니다.
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm font-semibold text-rose-700" role="alert">{error}</p> : null}
      </Card>
    </PageShell>
  );
}
