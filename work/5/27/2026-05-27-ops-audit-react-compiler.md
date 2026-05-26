# 2026-05-27 Ops Audit React Compiler 경고 축소

## 변경 파일
- `src/app/ops/audit/page.tsx`
- `src/components/OpsAuditClient.tsx`
- `work/5/27/2026-05-27-ops-audit-react-compiler.md`

## 사용 skill
- planning-gate-selector: `/ops/audit` 클라이언트 hook 변경에 필요한 one-off lint, route 인접 테스트, 전체 lint/test/build 검증 세트를 골랐습니다.
- work-log-closeout: 실제 변경 파일, 실행한 명령, 실패 후 재검증 결과, 잔여 리스크를 `/work` 표준 형식으로 남겼습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `OpsAuditClient`의 URL query hydrate effect와 초기 audit load effect 2건이 남아 있었습니다.
- `/ops/audit` 화면은 route-local 클라이언트라 공유 hook보다 영향 범위가 작고, 인접 route/catalog 테스트로 기본 계약을 확인할 수 있었습니다.

## 핵심 변경
- `/ops/audit` page가 `searchParams`의 `eventType`, `taskName`을 정규화해 client 초기값으로 전달하도록 바꿨습니다.
- client mount effect에서 URL query를 읽어 `setState`하던 경로를 제거했습니다.
- 초기 audit load는 fetch 전용 함수와 payload 반영 함수를 분리해 `await fetch` 이후에만 상태를 갱신하도록 바꿨습니다.
- query 파라미터 정규화, fetch payload, audit table 렌더링 계약은 유지했습니다.
- one-off 잔여 경고는 60 warnings / 52 files에서 58 warnings / 51 files로 줄었고, `OpsAuditClient.tsx`는 0 warnings가 됐습니다.

## 검증
- `corepack pnpm exec eslint src/components/OpsAuditClient.tsx --rule react-hooks/set-state-in-effect:error` 통과
- `corepack pnpm exec eslint src/components/OpsAuditClient.tsx src/app/ops/audit/page.tsx --rule react-hooks/set-state-in-effect:error` 통과
- `corepack pnpm exec vitest run tests/planning/ops/audit-route.test.ts tests/planning/catalog/currentScreens.opsRoutes.test.ts` 통과: 2 files / 4 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-ops-audit.json` 최초 실행 timeout, 제한을 늘려 재실행 통과: 잔여 58 warnings / 51 files, `OpsAuditClient.tsx` 0 warnings
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-ops-audit.json` 구현 보정 후 재실행 통과: 잔여 58 warnings / 51 files, `OpsAuditClient.tsx` 및 `/ops/audit/page.tsx` 0 warnings
- `corepack pnpm lint` 통과
- `corepack pnpm test` 최초 실패: `tests/planning/ops/backup-api.test.ts`의 delta backup 기대값이 1회 불일치
- `corepack pnpm exec vitest run tests/planning/ops/backup-api.test.ts` 통과: 1 file / 11 tests
- `corepack pnpm test` 재실행 통과: 663 files / 2035 tests
- `corepack pnpm build` 사용자 중단 후 새로 재실행 통과
- `corepack pnpm multi-agent:guard` 통과
- `git diff --check` 통과

## 남은 리스크
- [사실] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [사실] 첫 `pnpm test`의 `backup-api` delta backup 실패는 이번 변경 파일과 직접 연결되지 않았고, 단독 재실행 및 전체 재실행에서 통과했습니다. 다만 전체 병렬 실행에서 드물게 다시 나타날 수 있는 비결정성 후보입니다.
- [미확인] `/ops/audit` 브라우저 조작 e2e는 이번 라운드에서 실행하지 않았습니다. 인접 API/catalog 테스트와 build로 route 계약을 확인했습니다.
- [미확인] 원격 GitHub Actions는 계정 과금/사용 한도 문제로 최신 head의 원격 PASS를 확인하지 못할 수 있습니다.

## 다음 라운드
- manager 권고에 따라 `planning/v3`의 route-local 단일 warning client를 우선 확인합니다.
- 1순위 후보는 `src/app/planning/v3/accounts/_components/AccountsClient.tsx`, `src/app/planning/v3/categories/rules/_components/RulesClient.tsx`, `src/app/planning/v3/batches/_components/BatchesCenterClient.tsx`입니다.
- 공유 hook, workspace controller, recommend page는 영향 범위가 넓어 경고 원인과 테스트 매핑을 먼저 분리한 뒤 접근합니다.
