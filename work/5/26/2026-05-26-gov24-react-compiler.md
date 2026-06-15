# 2026-05-26 Gov24 React Compiler 경고 축소

## 변경 파일
- `src/components/Gov24Client.tsx`
- `work/5/26/2026-05-26-gov24-react-compiler.md`

## 사용 skill
- dart-data-source-hardening: 정부24 public data UI의 sync/status 안내와 실패 처리 계약을 바꾸지 않는 범위인지 확인했습니다.
- planning-gate-selector: `/gov24` 클라이언트 hook 변경에 필요한 targeted ESLint, Gov24 관련 테스트, lint/test/build 검증 세트를 골랐습니다.
- work-log-closeout: 실제 변경 파일, 실행한 명령, 남은 리스크를 `/work` 표준 형식으로 남겼습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `Gov24Client`의 초기 snapshot 상태 확인 effect와 결과 화면 기관 필터 재검색 effect 2건이 남아 있었습니다.
- `/gov24`는 사용자 노출 public stable 경로라 API payload, sync 상태 문구, 검색 결과 렌더링은 유지하고 effect trigger만 취소 가능하게 정리했습니다.

## 핵심 변경
- mount 직후 `checkSnapshotStatus()` 호출을 cleanup 가능한 0ms timer 안으로 옮겼습니다.
- 결과 화면(`step === 7`)에서 기관 필터 변경 시 실행되는 `searchSimpleFind()` 호출도 cleanup 가능한 0ms timer로 감쌌습니다.
- `/api/gov24/search`, `/api/gov24/simple-find`, `/api/gov24/sync`, `/api/gov24/detail` payload와 사용자 문구는 변경하지 않았습니다.
- one-off `react-hooks/set-state-in-effect` 잔여 경고는 64건/54파일에서 62건/53파일로 줄었고, `Gov24Client.tsx`는 0건이 됐습니다.

## 검증
- `corepack pnpm exec eslint src/components/Gov24Client.tsx --rule react-hooks/set-state-in-effect:error` 통과
- `corepack pnpm exec vitest run tests/gov24-autosync-trigger.test.ts tests/gov24-simplefind-matcher.test.ts tests/gov24-search-pagination.test.ts tests/gov24-card-fields.test.ts tests/gov24-apply-link-safeurl.test.ts tests/external-api-error-contract.test.ts tests/planning/catalog/currentScreens.supportRoutes.test.ts` 통과: 7 files / 13 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-gov24.json` 통과: 잔여 62 warnings / 53 files, `Gov24Client.tsx` 0 warnings
- `corepack pnpm lint` 통과
- `corepack pnpm test` 통과: 663 files / 2035 tests
- `corepack pnpm build` 통과
- `corepack pnpm multi-agent:guard` 통과
- `git diff --check` 통과

## 남은 리스크
- [미확인] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [미확인] 현재 `tests/e2e`에는 `/gov24` 전용 브라우저 플로우가 보이지 않아 실제 wizard 클릭 흐름은 이번 라운드에서 e2e로 검증하지 못했습니다.
- [사실] 원격 GitHub Actions는 현재 계정 과금/사용 한도 문제로 job 시작 전 차단되어 최신 head의 원격 PASS를 확인할 수 없습니다.

## 다음 라운드
- manager 권고에 따라 다음 안전 후보는 `src/components/RecoveryClient.tsx`로 둡니다.
- `RecoveryClient`는 `/settings/recovery`의 sessionStorage hydrate와 confirm text 기반 arm reset 경로를 건드리므로 수정 전 관련 API 테스트와 경로 문서를 먼저 확인합니다.
