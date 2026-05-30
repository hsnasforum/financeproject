# 2026-05-30 MaintenanceSettingsClient React Compiler 경고 축소

## 변경 파일
- `src/components/MaintenanceSettingsClient.tsx`
- `work/5/30/2026-05-30-maintenance-settings-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 구현 라운드의 기본 skill 조합과 조건부 route/DART/planning-v3 skill 필요 여부를 확인했습니다.
- `planning-gate-selector`: React 훅 컴포넌트와 유지관리 설정 화면 변경에 맞는 검증 범위를 정했습니다.
- `work-log-closeout`: 실제 실행한 명령과 남은 리스크를 `/work` 형식에 맞춰 기록했습니다.

## 변경 이유
- `MaintenanceSettingsClient`가 mount 직후 sessionStorage에서 Dev unlock 상태를 복원하면서 effect 본문에서 `setUnlock`을 동기 호출해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- `/settings/maintenance` 화면의 unlock, retention policy, cleanup 동작과 API 계약은 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 최초 Dev unlock 상태 복원을 `window.setTimeout(..., 0)`으로 다음 macrotask에 넘겼습니다.
- 컴포넌트 unmount 시 예약된 복원을 `window.clearTimeout`으로 정리하도록 했습니다.
- retention policy 초기 로드, 정책 저장, 즉시 cleanup 실행, AuditLog 렌더링은 변경하지 않았습니다.
- `/api/dev/unlock`, `/api/dev/maintenance/retention`, `/api/dev/maintenance/cleanup` 요청 payload와 사용자 노출 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/MaintenanceSettingsClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `react-hooks/set-state-in-effect` 1건.
  - 변경 후: `warningCount: 0`.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-maintenance-settings.json`
  - PASS. 전체 잔여 경고: 25건 / 20개 파일.
  - 이번 대상 파일 `src/components/MaintenanceSettingsClient.tsx` 경고 없음.
- `corepack pnpm exec vitest run tests/retention-policy.test.ts tests/cleanup.test.ts tests/audit-log-store.test.ts`
  - PASS. 3개 파일 / 9개 테스트 통과.
- `corepack pnpm exec vitest run tests/dev-unlock-auth.test.ts tests/retention-policy.test.ts tests/cleanup.test.ts tests/audit-log-store.test.ts`
  - PASS. 4개 파일 / 13개 테스트 통과.
- `pnpm lint`
  - PASS.
- `git diff --check`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 `/settings/maintenance`, `/api/dev/maintenance/retention`, `/api/dev/maintenance/cleanup`, `/api/dev/unlock` 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' \) -print`
  - 출력 없음. 임시 Next 산출물 누수 없음.
- `rg -n -e MaintenanceSettingsClient -e /api/dev/maintenance -e /settings/maintenance src tests`
  - 영향 경로와 관련 테스트 위치를 확인했습니다.

## 남은 리스크
- 세션에 저장된 Dev unlock 상태가 기존보다 한 macrotask 늦게 화면에 반영됩니다.
- 실제 정책 저장과 cleanup 실행은 dev unlock/CSRF와 로컬 파일 권한 상태에 의존합니다.
- route, href, selector, API 계약을 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
- 다음 React Compiler 경고 축소 후보는 `src/components/OpenDartStatusCard.tsx`입니다.
