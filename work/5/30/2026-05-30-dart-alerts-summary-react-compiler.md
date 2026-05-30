# 2026-05-30 DartAlertsSummaryCard React Compiler 경고 축소

## 요약
- `src/components/DartAlertsSummaryCard.tsx`의 초기 localStorage hydrate를 `window.setTimeout(..., 0)` 콜백으로 옮겨 `react-hooks/set-state-in-effect` 경고 1건을 제거했습니다.
- DART 알림 fetch, `EMPTY_ALERTS` fallback, `generatedAt` 표시, 사용자 문구, 링크, API 계약은 변경하지 않았습니다.
- 전체 one-off scan은 `34 warnings / 28 files`에서 `33 warnings / 27 files`로 줄었고, 대상 파일은 잔여 목록에서 빠졌습니다.
- 빌드는 통과했으며 성공한 isolated build `.next-build-2820794`는 `.next-build-info.json` 보존 대상으로 남았습니다.

## 사용 skill
- `finance-skill-routing`: 이번 라운드에 필요한 Finance Project 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: DART UI/hooks 변경에 맞춰 targeted ESLint, 관련 DART 알림 테스트, lint/test/build, guard를 검증 세트로 선택했습니다.
- `dart-data-source-hardening`: DART 알림 UI의 fetch 실패, empty/fallback, freshness 표시 계약이 유지되는지 확인했습니다.
- `work-log-closeout`: 변경 파일, 검증 결과, 잔여 리스크를 `/work` 종료 기록으로 남겼습니다.
- `route-ssot-check`, `planning-v3-batch-contract-narrowing`: route/href 또는 planning v3 batch-family 계약 변경이 없어 사용하지 않았습니다.

## 변경 파일
- `src/components/DartAlertsSummaryCard.tsx`
- `work/5/30/2026-05-30-dart-alerts-summary-react-compiler.md`

## 검증
- `corepack pnpm exec eslint src/components/DartAlertsSummaryCard.tsx --rule react-hooks/set-state-in-effect:warn -f json`: `messages: []`, `warningCount: 0`
- `corepack pnpm exec vitest run tests/alert-state-store.test.ts tests/alert-rules-store.test.ts tests/alert-rules-regex.test.ts tests/alert-preferences.test.ts tests/alerts-filter-stability.test.ts tests/disclosure-alerts-route.test.ts`: PASS, 6 files / 11 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-dart-alerts-summary.json`: `33 warnings / 27 files`, target 없음
- `git diff --check`: PASS
- `corepack pnpm lint`: PASS
- `corepack pnpm test`: PASS, 663 files / 2035 tests
- `corepack pnpm build`: 1차는 184초 제한으로 timeout, 2차는 420초 제한에서 PASS
- `corepack pnpm cleanup:next-artifacts`: PASS, 최신 성공 isolated build `.next-build-2820794`와 `.next-build-info.json` 보존
- `find . -maxdepth 1 -type d -name '.next-build-*' -print`: `.next-build-2820794`

## 남은 리스크
- 초기 규칙/선호/읽음 상태 hydrate가 다음 macrotask로 이동해 첫 paint 직후 아주 짧게 기본 필터 상태가 보일 수 있습니다.
- DART 알림 API와 fallback 분기는 변경하지 않았으므로 데이터 누락, 실패, stale 상태의 런타임 품질은 기존 보장 범위와 같습니다.
- `DartAlertsSummaryCard`의 실제 마운트 경로는 현재 검색 기준 자기 자신 외 참조가 없어 [미확인]입니다. route, selector, 사용자 문구 변경이 없어 `pnpm e2e:rc`는 이번 라운드에서 실행하지 않았습니다.

## 다음 라운드 우선순위
1. `src/components/DartCompanyPageClient.tsx`의 `react-hooks/set-state-in-effect` 잔여 경고 1건을 축소합니다.
