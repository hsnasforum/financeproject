# 2026-05-30 recommend page React Compiler 경고 축소

## 요약
- `src/app/recommend/page.tsx`의 `react-hooks/set-state-in-effect` 경고 2건을 제거했습니다.
- 초기 `localStorage`/query/profile 적용과 autorun 시작을 microtask 이후 active guard 안에서 처리하도록 조정했습니다.
- 추천 결과 source status reset/fetch 상태 갱신도 microtask 이후 active/abort guard를 거치도록 정리했습니다.
- route, href, 사용자 노출 문구, API 계약 변경은 없습니다.

## 사용 skill
- `finance-skill-routing`: 이번 라운드에 필요한 skill 범위를 확인했습니다.
- `planning-gate-selector`: page/build 영향이 있는 hook 변경에 맞춰 검증 세트를 선택했습니다.
- `work-log-closeout`: 변경 내역, 검증, 리스크를 `/work` 종료 기록으로 남겼습니다.
- `route-ssot-check`, `dart-data-source-hardening`, `planning-v3-batch-contract-narrowing`: route/DART/batch-family 계약 변경이 없어 사용하지 않았습니다.

## 변경 파일
- `src/app/recommend/page.tsx`

## 검증
- `corepack pnpm exec eslint src/app/recommend/page.tsx --rule react-hooks/set-state-in-effect:warn -f json` PASS, messages `[]`
- `corepack pnpm exec vitest run tests/recommend-api.test.ts tests/recommend-score.test.ts tests/recommend-unified-adapter.test.ts tests/recommend-unified-vs-legacy.test.ts tests/saved-runs-store.test.ts tests/compare-store.test.ts` PASS, 6 files / 22 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-recommend-page.json` PASS
- one-off scan 결과: 37 warnings / 31 files, target 포함 여부 `false`
- `git diff --check` PASS
- `corepack pnpm lint` PASS
- `corepack pnpm test` PASS, 663 files / 2035 tests
- `corepack pnpm build` PASS
- `.next-build-*` 잔여 디렉터리 없음

## 남은 리스크
- 초기 추천 프로필 복원과 query autorun이 microtask 뒤로 이동하므로 첫 paint 직후 상태 적용 순서가 아주 짧게 달라질 수 있습니다.
- source status reset/fetch readiness도 microtask 이후 갱신되지만, abort guard를 유지해 stale fetch 반영은 막았습니다.
- DOM, selector, route 변경이 없어 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드
- 잔여 `react-hooks/set-state-in-effect` 첫 후보는 `src/components/AuditLogCard.tsx` 1건입니다.
