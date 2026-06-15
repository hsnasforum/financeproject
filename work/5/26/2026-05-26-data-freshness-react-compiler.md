# 2026-05-26 DataFreshness React Compiler 경고 축소

## 변경 파일
- `src/components/data/DataFreshnessBanner.tsx`
- `work/5/26/2026-05-26-next-round-data-freshness-plan.md`
- `work/5/26/2026-05-26-data-freshness-react-compiler.md`

## 사용 skill
- dart-data-source-hardening: freshness/status UI의 실패, 지연, stale 안내가 기존 동작과 어긋나지 않는지 확인했습니다.
- planning-gate-selector: React hook/UI/freshness 변경에 필요한 targeted ESLint, 관련 테스트, lint/test/build 검증 세트를 골랐습니다.
- work-log-closeout: 실제 변경 파일, 실행한 명령, 남은 리스크를 `/work` 표준 형식으로 남겼습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `DataFreshnessBanner`의 localStorage hydrate effect와 최초 status refresh effect 2건이 남아 있었습니다.
- freshness 배너는 데이터 누락, 실패, 오래된 상태를 사용자에게 보여주는 UI라 문구와 API 계약은 유지하고 hook 상태 갱신 방식만 최소 수정했습니다.

## 핵심 변경
- `freshness:autoSmoke` localStorage hydrate를 cleanup 가능한 0ms timer 안으로 옮겼습니다.
- 최초 `/api/sources/status` refresh 호출도 cleanup 가능한 0ms timer로 감싸 unmount 시 timer와 fetch abort를 함께 처리하게 했습니다.
- `/api/sources/status`, `/api/sync/smoke`, sessionStorage 세션당 1회 제한, 사용자 노출 문구는 변경하지 않았습니다.
- one-off `react-hooks/set-state-in-effect` 잔여 경고는 66건/55파일에서 64건/54파일로 줄었고, `DataFreshnessBanner.tsx`는 0건이 됐습니다.
- manager subagent가 남긴 후보 계획 메모 `2026-05-26-next-round-data-freshness-plan.md`를 함께 보존했습니다.

## 검증
- `corepack pnpm exec eslint src/components/data/DataFreshnessBanner.tsx --rule react-hooks/set-state-in-effect:error` 통과
- `corepack pnpm exec vitest run tests/data-freshness-banner-copy.test.tsx tests/sources-status.test.ts` 통과: 2 files / 2 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-data-freshness.json` 통과: 잔여 64 warnings / 54 files, `DataFreshnessBanner.tsx` 0 warnings
- `corepack pnpm lint` 통과
- `corepack pnpm test` 통과: 663 files / 2035 tests
- `corepack pnpm build` 1차 실행은 244초 제한으로 timeout되어 PASS/FAIL 판정에서 제외했습니다. 잔존 build 프로세스 종료를 확인한 뒤 같은 명령을 더 긴 제한으로 재실행했습니다.
- `corepack pnpm build` 재실행 통과
- `git diff --check` 통과
- `corepack pnpm multi-agent:guard` 1차 실행은 최신 `/work` 계획 메모의 `## 다음 라운드` 섹션 부재로 실패했습니다. 이 종료 기록을 추가한 뒤 재실행해야 합니다.
- `corepack pnpm multi-agent:guard` 재실행 통과

## 남은 리스크
- [미확인] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [미확인] `DataFreshnessBanner`는 copy 테스트와 source status 테스트는 있으나, localStorage/sessionStorage 자동 smoke 경로를 직접 검증하는 브라우저 테스트는 없습니다.
- [사실] 원격 GitHub Actions는 현재 계정 과금/사용 한도 문제로 job 시작 전 차단되어 최신 head의 원격 PASS를 확인할 수 없습니다.

## 다음 라운드
- 다음 안전 후보는 파일당 2건이 남은 `src/components/Gov24Client.tsx`, `src/components/DoctorSummaryCard.tsx`, `src/components/RecoveryClient.tsx` 중 실제 사용자 경로와 테스트 커버리지가 분명한 파일부터 고릅니다.
- `/recommend`는 public stable 핵심 경로라 같은 2건이어도 후순위로 두고, 수정 전 별도 영향 경로와 테스트를 먼저 확인합니다.
