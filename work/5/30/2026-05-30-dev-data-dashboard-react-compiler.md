# 2026-05-30 DevDataDashboardClient React Compiler 경고 축소

## 변경 파일
- `src/components/DevDataDashboardClient.tsx`
- `work/5/30/2026-05-30-dev-data-dashboard-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 구현/검증 라운드의 기본 skill 조합과 조건부 public-data hardening 필요 여부를 확인했습니다.
- `planning-gate-selector`: React hook/UI 타이밍 변경에 맞춰 targeted ESLint, 보조금24/FINLIFE 축소 테스트, lint/test/build를 검증 범위로 정했습니다.
- `dart-data-source-hardening`: `/dev/data`가 보조금24, FINLIFE, coverage API를 읽는 public/open-data dev 화면이므로 실패/빈값/fallback 계약이 바뀌지 않는지 점검했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행 명령, 결과, 남은 리스크를 `/work` 종료 기록으로 정리했습니다.
- `route-ssot-check`, `planning-v3-batch-contract-narrowing`: route/href 또는 planning v3 batch-family 계약 변경이 없어 사용하지 않았습니다.

## 변경 이유
- `DevDataDashboardClient`의 초기 `useEffect`가 `load()`를 즉시 호출하고, `load()` 내부에서 `setLoading`, `setError`, `setBenefitsMeta`, `setCoverage`, `setFinlife`를 실행해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- `/dev/data`는 운영자용 dev 데이터 대시보드이므로 route, href, API 계약, 화면 문구를 바꾸지 않고 초기 로드 호출 타이밍만 최소 변경했습니다.

## 핵심 변경
- 초기 mount effect의 `load()` 호출을 `window.setTimeout(..., 0)` 콜백으로 옮겼습니다.
- cleanup에서 `window.clearTimeout(timeoutId)`를 호출해 언마운트 뒤 지연 로드가 남지 않게 했습니다.
- 수동 새로고침, 보조금24 스냅샷 강제 새로고침, FINLIFE 종류별 fetch, coverage/fallback 처리 로직은 변경하지 않았습니다.
- `/dev/data`, `/api/public/benefits/search`, `/api/dev/benefits/coverage`, `/api/finlife/[kind]`, `/api/dev/benefits/snapshot/refresh` 계약과 사용자 노출 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/DevDataDashboardClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`: 변경 전 `line 90` 경고 1건 확인
- `corepack pnpm exec eslint src/components/DevDataDashboardClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`: 변경 후 `messages: []`, `warningCount: 0`
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-dev-data-dashboard.json`: `29 warnings / 23 files`, target 없음
- `corepack pnpm exec vitest run tests/benefits-coverage.test.ts tests/benefits-snapshot.test.ts tests/benefits-refresh-effective-maxpages.test.ts tests/benefits-mode-all-compat.test.ts tests/finlife-mode.test.ts tests/finlife-fallback-mode.test.ts tests/finlife-products-http-cache.test.ts`: PASS, 7 files / 14 tests
- `corepack pnpm lint`: PASS
- `git diff --check`: PASS
- `corepack pnpm test`: PASS, 663 files / 2035 tests
- `corepack pnpm build`: PASS
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' \) -print`: 잔여 디렉터리 없음

## 남은 리스크
- 초기 `load()`가 다음 macrotask로 이동해 `/dev/data` 첫 paint 직후 아주 짧게 로딩 전 기본 상태가 보일 수 있습니다.
- public/open-data API 실패, 보조금24 스냅샷 부재, FINLIFE fallback/cooldown 분기는 변경하지 않았으므로 해당 잔여 리스크는 기존 범위와 같습니다.
- `tests/e2e/smoke.spec.ts`의 `/dev/data` 검사는 production에서 dev 화면이 숨겨지는 보안 케이스라 이번 hook 타이밍 변경 검증에는 추가 실행하지 않았습니다.

## 다음 라운드 우선순위
- 다음 one-off 후보는 `src/components/DevGitAdminClient.tsx` 1건입니다.
