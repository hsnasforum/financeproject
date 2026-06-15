# 2026-05-30 OpsAssumptionsHistoryClient React Compiler 경고 축소

## 변경 파일
- `src/components/OpsAssumptionsHistoryClient.tsx`
- `work/5/30/2026-05-30-ops-assumptions-history-client-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 구현 라운드의 기본 skill 조합과 조건부 skill 필요 여부를 확인했습니다.
- `planning-gate-selector`: React 훅 컴포넌트와 ops assumptions history 화면 변경에 맞는 검증 범위를 정했습니다.
- `work-log-closeout`: 실제 실행한 명령과 남은 리스크를 `/work` 형식에 맞춰 기록했습니다.

## 변경 이유
- `OpsAssumptionsHistoryClient`가 mount 직후 `loadHistory`, `loadLatestRef`를 effect 본문에서 바로 호출하고, `selectedId` 변경 effect에서도 `loadDetail`을 바로 호출해 `react-hooks/set-state-in-effect` 경고 2건을 만들었습니다.
- `/ops/assumptions/history`의 히스토리 조회, latest pointer 조회, 선택 스냅샷 상세 조회, 비교/롤백 흐름은 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 최초 히스토리 목록 조회와 latest pointer 조회를 `window.setTimeout(..., 0)`으로 다음 macrotask에 넘겼습니다.
- 선택된 snapshot 상세 조회도 같은 방식으로 예약해 effect 본문에서 직접 상태 커밋이 시작되지 않도록 했습니다.
- 컴포넌트 unmount 또는 `selectedId` 변경 시 예약된 조회를 `window.clearTimeout`으로 정리하도록 했습니다.
- 수동 새로고침, row 재선택, diff 선택, `Set as latest` 흐름은 변경하지 않았습니다.
- route, href, API path, 사용자 노출 문구, 데이터 payload 계약은 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/OpsAssumptionsHistoryClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `react-hooks/set-state-in-effect` 2건.
  - 변경 후 PASS. `warningCount: 0`.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-ops-assumptions-history-client.json`
  - PASS. 전체 잔여 경고: 20건 / 17개 파일.
  - 이번 대상 파일 `src/components/OpsAssumptionsHistoryClient.tsx` 경고 없음.
- `corepack pnpm exec vitest run tests/planning-assumptions-ops-route.test.ts tests/planning-assumptions/storage-history.test.ts tests/planning-security-csrf.test.ts tests/ops-error-contract.test.ts tests/planning/components/snapshotPicker.test.tsx`
  - PASS. 5개 파일 / 19개 테스트 통과.
- `pnpm lint`
  - PASS.
- `git diff --check`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 `/ops/assumptions/history`, `/api/ops/assumptions/history`, `/api/ops/assumptions/history/[id]`, `/api/ops/assumptions/set-latest`, `/api/ops/assumptions/latest` 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' \) -print`
  - 출력 없음. 임시 Next 산출물 누수 없음.

## 남은 리스크
- 최초 히스토리 목록, latest pointer, 선택 snapshot 상세 결과가 기존보다 한 macrotask 늦게 반영됩니다.
- 실제 롤백 성공 여부는 CSRF 쿠키, snapshot history 파일, local-only ops guard 상태에 의존합니다.
- 이번 변경은 route, href, selector, API 계약, 사용자 문구를 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
- 다음 React Compiler 경고 축소 후보는 `src/components/OpsDataQualityCard.tsx`입니다.
