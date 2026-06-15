# 2026-05-30 AuditLogCard React Compiler 경고 축소

## 요약
- `src/components/AuditLogCard.tsx`의 `react-hooks/set-state-in-effect` 경고 1건을 제거했습니다.
- mount effect의 자동 감사 로그 로드를 microtask 이후 active guard 안에서 호출하도록 조정했습니다.
- 수동 새로고침, fetch 대상 `/api/dev/audit/recent`, limit query, 표시 문구, route/href는 바꾸지 않았습니다.
- 전체 one-off scan 기준 잔여 경고는 36 warnings / 30 files입니다.

## 사용 skill
- `finance-skill-routing`: 이번 라운드에 필요한 skill 범위와 조건부 skill 제외 여부를 확인했습니다.
- `planning-gate-selector`: shared client component hook 변경에 맞는 최소/공통 검증 세트를 선택했습니다.
- `work-log-closeout`: 변경 내역, 검증, 리스크를 `/work` 종료 기록으로 남겼습니다.
- `route-ssot-check`, `dart-data-source-hardening`, `planning-v3-batch-contract-narrowing`: route/DART/batch-family 계약 변경이 없어 사용하지 않았습니다.

## 변경 파일
- `src/components/AuditLogCard.tsx`

## 검증
- `corepack pnpm exec eslint src/components/AuditLogCard.tsx --rule react-hooks/set-state-in-effect:warn -f json` PASS, messages `[]`
- `corepack pnpm exec vitest run tests/audit-log-store.test.ts tests/planning/ops/audit-route.test.ts` PASS, 2 files / 5 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-audit-log-card.json` PASS
- one-off scan 결과: 36 warnings / 30 files, target 포함 여부 `false`
- `git diff --check` PASS
- `corepack pnpm lint` PASS
- `corepack pnpm test` PASS, 663 files / 2035 tests
- `corepack pnpm build` PASS
- `.next-build-*` 잔여 디렉터리 없음

## 남은 리스크
- 자동 감사 로그 첫 조회가 microtask 뒤로 이동하므로 첫 paint 직후 로딩 시작 타이밍이 아주 짧게 늦어질 수 있습니다.
- 이 컴포넌트는 `MaintenanceSettingsClient`와 `OpsHubClient`에서 사용되지만 DOM 문구와 selector를 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.
- `/api/dev/audit/recent` route 자체와 audit storage 계약은 변경하지 않았습니다.

## 다음 라운드
- 잔여 `react-hooks/set-state-in-effect` 첫 후보는 `src/components/AutoMergeClient.tsx` 1건입니다.
