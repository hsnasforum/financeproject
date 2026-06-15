# 2026-05-30 DoctorSummaryCard React Compiler 경고 축소

## 변경 파일
- `src/components/DoctorSummaryCard.tsx`
- `work/5/30/2026-05-30-doctor-summary-card-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 구현 라운드의 기본 skill 조합과 조건부 skill 필요 여부를 확인했습니다.
- `planning-gate-selector`: React 훅 컴포넌트와 dev doctor API 소비 범위에 맞는 검증 명령을 정했습니다.
- `work-log-closeout`: 실제 실행한 명령과 잔여 리스크를 `/work` 형식에 맞춰 기록했습니다.

## 변경 이유
- `DoctorSummaryCard`의 최초 요약 조회와 Fix 히스토리 조회가 mount 직후 effect 본문에서 `loadSummary()`, `loadHistory()`를 바로 호출해 `react-hooks/set-state-in-effect` 경고 2건을 만들었습니다.
- `/ops`와 recovery 쪽에서 쓰는 doctor 요약 카드의 API 계약, 버튼 동작, 문구는 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 최초 `loadSummary()` 호출을 `window.setTimeout(..., 0)`으로 다음 macrotask에 넘겼습니다.
- 최초 `loadHistory()` 호출도 같은 방식으로 지연하고 cleanup에서 `window.clearTimeout`을 호출하게 했습니다.
- 수동 히스토리 새로고침, Fix 실행, 체인 preview/run, 성공 뒤 summary/history 재조회 흐름은 변경하지 않았습니다.
- `/api/dev/doctor/summary`, `/api/dev/doctor/fix/history`, `/api/dev/doctor/fix`, `/api/dev/doctor/fix/chain` 요청 payload와 사용자 노출 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/DoctorSummaryCard.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `react-hooks/set-state-in-effect` 2건.
  - 변경 후: `warningCount: 0`.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn --quiet false -f json -o tmp/eslint-react-hooks-set-state-after-doctor-summary-card.json`
  - FAIL. ESLint가 `false`를 파일 패턴으로 해석해 실행 자체가 실패했습니다.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-doctor-summary-card.json`
  - PASS. 전체 잔여 경고: 26건 / 21개 파일.
  - 이번 대상 파일 `src/components/DoctorSummaryCard.tsx` 경고 없음.
- `corepack pnpm exec vitest run tests/doctor-fix-auth.test.ts tests/fix-chain.test.ts tests/fix-chain-dryrun.test.ts tests/planning/ops/doctorIssues.test.ts tests/planning/ops/doctorPolicyChecks.test.ts tests/planning/ops/doctorChecks.test.ts tests/planning/ops/doctorMigrationCheck.test.ts tests/planning/ops/planningV3TransactionsDoctorChecks.test.ts tests/ops-error-contract.test.ts`
  - PASS. 9개 파일 / 33개 테스트 통과.
- `pnpm lint`
  - PASS.
- `git diff --check`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 doctor 관련 API/ops route 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' \) -print`
  - 출력 없음. 임시 Next 산출물 누수 없음.
- `rg -n -e DoctorSummaryCard -e /api/dev/doctor/summary -e /api/dev/doctor/fix -e /ops/doctor src tests`
  - 영향 consumer와 관련 doctor API 테스트를 확인했습니다.

## 남은 리스크
- 최초 doctor 요약과 Fix 히스토리 조회 결과가 기존보다 한 macrotask 늦게 반영됩니다.
- 실제 Fix 실행과 체인 실행은 dev unlock, CSRF, 로컬 권한과 현재 저장소 상태에 의존합니다.
- 이번 변경은 route, href, selector, API 계약을 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
- 다음 React Compiler 경고 축소 후보는 `src/components/MaintenanceSettingsClient.tsx`입니다.
