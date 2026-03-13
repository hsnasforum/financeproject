# 2026-03-12 dev unlock shortcut links

## 변경 파일
- `src/components/DevUnlockShortcutLink.tsx`
- `src/components/ui/ErrorState.tsx`
- `src/lib/ops/errorFixHref.ts`
- `src/components/OpsPlanningCleanupClient.tsx`
- `src/components/OpsAssumptionsClient.tsx`
- `src/components/OpsAssumptionsHistoryClient.tsx`
- `src/components/OpsPlanningDashboardClient.tsx`
- `src/components/OpsRunsClient.tsx`
- `src/components/OpsAuditClient.tsx`
- `src/components/OpsDoctorClient.tsx`
- `tests/dev-unlock-shortcut.test.ts`
- `work/3/12/2026-03-12-dev-unlock-shortcut-links.md`

## 사용 skill
- `route-ssot-check`: Dev unlock/CSRF 경고의 복구 대상 경로가 실제 사용자 경로인지 `docs/current-screens.md` 기준으로 확인하는 데 사용.
- `planning-gate-selector`: 공통 UI, ops 경고, fix href 매핑 변경에 맞는 최소 검증 세트를 고르는 데 사용.
- `work-log-closeout`: 이번 라운드의 실제 변경, 실행한 검증, 남은 리스크를 `/work` 형식에 맞게 정리하는 데 사용.

## 변경 이유
- Dev unlock 또는 CSRF 관련 경고가 뜰 때 사용자가 다음 조치 화면을 바로 찾기 어렵고, 공통 오류 UI와 각 ops 경고 표면의 복구 경로가 분산돼 있었다.
- 운영 규칙과 Dev unlock 관련 안내는 `/ops/rules`가 기준 화면이므로, 해당 성격의 경고에서는 같은 바로가기를 일관되게 노출하는 쪽이 안전했다.

## 핵심 변경
- `src/components/DevUnlockShortcutLink.tsx`에 `/ops/rules` 고정 바로가기와 Dev unlock/CSRF 문구 판별 helper를 추가했다.
- `src/components/ui/ErrorState.tsx`가 Dev unlock/CSRF 성격의 에러 메시지일 때 공통적으로 `/ops/rules 바로가기`를 노출하도록 연결했다.
- `src/lib/ops/errorFixHref.ts`에서 `UNAUTHORIZED`, `CSRF`, `CSRF_MISMATCH`, `ORIGIN_MISMATCH`, `LOCAL_ONLY` 코드를 `/ops/rules`로 매핑했다.
- `OpsPlanningCleanupClient`, `OpsAssumptionsClient`, `OpsAssumptionsHistoryClient`, `OpsPlanningDashboardClient`, `OpsRunsClient`, `OpsAuditClient`, `OpsDoctorClient`의 CSRF/Dev unlock 경고 표면에 같은 바로가기를 추가했다.
- `tests/dev-unlock-shortcut.test.ts`로 error code 매핑과 문구 판별 회귀를 고정했다.
- `docs/current-screens.md`는 route SSOT 확인만 수행했고, 새 경로 추가는 없어 문서 수정은 하지 않았다.

## 검증
- `pnpm exec vitest run tests/dev-unlock-shortcut.test.ts`
  - PASS
- `pnpm planning:current-screens:guard`
  - PASS
- `pnpm lint`
  - PASS
- `pnpm build`
  - PASS

## 남은 리스크
- 이번 라운드는 공통 오류 UI와 주요 ops 경고 표면을 우선 정리했다. 동일 성격의 커스텀 경고가 다른 컴포넌트에 추가되면 같은 helper를 재사용해 일관성을 유지해야 한다.
- Dev unlock/CSRF 문구 판별은 현재 한국어/영문 혼합 경고문 기준의 문자열 매칭이다. 향후 문구가 크게 바뀌면 helper 조건도 함께 조정해야 한다.
- 저장소 전체 dirty worktree가 커서, 다음 라운드에서도 이 변경 묶음 외 파일은 분리해서 다루는 편이 안전하다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
