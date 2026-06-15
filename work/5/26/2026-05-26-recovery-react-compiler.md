# 2026-05-26 Recovery React Compiler 경고 축소

## 변경 파일
- `src/components/RecoveryClient.tsx`
- `tests/audit-log-store.test.ts`
- `tests/planning-store.test.ts`
- `tests/planning/ops/actions-preview-route.test.ts`
- `work/5/26/2026-05-26-recovery-react-compiler.md`

## 사용 skill
- planning-gate-selector: `/settings/recovery` 클라이언트 hook 변경과 검증 중 발견된 planning/ops 테스트 안정화에 필요한 targeted test, lint, test, build 검증 세트를 골랐습니다.
- work-log-closeout: 실제 변경 파일, 실행한 명령, 실패 후 재검증 결과, 남은 리스크를 `/work` 표준 형식으로 남겼습니다.

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `RecoveryClient`의 sessionStorage hydrate effect와 confirm text 기반 arm reset effect 2건이 남아 있었습니다.
- 검증 중 전체 테스트가 `audit-log-store`, `actions-preview-route`, `planning-store`의 무거운 fixture 때문에 병렬 부하에서 timeout을 반복해, 제품 계약은 유지하면서 테스트 fixture를 더 작고 직접적인 형태로 정리했습니다.

## 핵심 변경
- Recovery unlock session hydrate를 mount effect 대신 `useSyncExternalStore` 기반 `sessionCsrf`와 `effectiveUnlock` 파생 상태로 읽도록 바꿨습니다.
- confirm text가 `RESET`이 아닐 때 reset/offline repair arm 상태를 effect가 아니라 입력 이벤트 핸들러에서 즉시 해제하도록 바꿨습니다.
- reset/offline repair 요청 payload와 UI 인증 상태는 `effectiveUnlock`을 사용해 기존 unlock/session 복구 흐름을 유지했습니다.
- audit log cap 테스트는 520회 append 대신 519개 파일 fixture + 1회 append로 cap 경로를 검증하게 줄였습니다.
- ops action preview 테스트는 28개 run 생성 대신 run index fixture를 직접 구성해 sampleIds 20개 cap 계약만 검증하게 줄였습니다.
- planning store retention 테스트는 52개 입력/50개 보존 대신 5개 입력/3개 보존으로 같은 보존/delete/restore 계약을 검증하게 줄였습니다.
- one-off `react-hooks/set-state-in-effect` 잔여 경고는 62건/53파일에서 60건/52파일로 줄었고, `RecoveryClient.tsx`는 0건이 됐습니다.

## 검증
- `corepack pnpm exec eslint src/components/RecoveryClient.tsx --rule react-hooks/set-state-in-effect:error` 통과
- `corepack pnpm exec vitest run tests/recovery-reset.test.ts tests/doctor-fix-auth.test.ts tests/fix-chain.test.ts tests/fix-chain-dryrun.test.ts tests/planning/catalog/currentScreens.supportRoutes.test.ts` 통과: 5 files / 15 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-recovery.json` 통과: 잔여 60 warnings / 52 files, `RecoveryClient.tsx` 0 warnings
- `corepack pnpm exec vitest run tests/audit-log-store.test.ts tests/planning/ops/actions-preview-route.test.ts` 통과: 2 files / 6 tests
- `corepack pnpm exec vitest run tests/audit-log-store.test.ts tests/planning-store.test.ts tests/planning/ops/actions-preview-route.test.ts` 통과: 3 files / 21 tests
- `corepack pnpm exec vitest run tests/audit-log-store.test.ts tests/planning-store.test.ts tests/planning-v3-profiles-api.test.ts tests/planning-v2-api/profiles-route.test.ts tests/planning/ops/actions-preview-route.test.ts tests/planning/ops/backup-api.test.ts` 통과: 6 files / 35 tests
- `corepack pnpm lint` 통과
- `corepack pnpm test` 최초 실패: `audit-log-store` timeout 1건, 이후 targeted 재실행 통과
- `corepack pnpm test` 재실행 실패: `planning-store`, `actions-preview-route`, `audit-log-store` 등 timeout/상태 경합성 실패가 재현되어 테스트 fixture를 축소
- `corepack pnpm test` 최종 통과: 663 files / 2035 tests
- `corepack pnpm build` 통과
- `corepack pnpm multi-agent:guard` 통과
- `git diff --check` 통과

## 남은 리스크
- [미확인] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [미확인] `/settings/recovery` 브라우저 조작 e2e는 이번 라운드에서 실행하지 않았습니다. 관련 API/route 테스트와 build로 계약을 확인했습니다.
- [사실] 테스트 안정화는 제품 런타임 로직이 아니라 테스트 fixture만 줄인 변경입니다.
- [사실] 원격 GitHub Actions는 현재 계정 과금/사용 한도 문제로 job 시작 전 차단되어 최신 head의 원격 PASS를 확인할 수 없습니다.

## 다음 라운드
- `react-hooks/set-state-in-effect` 잔여 60건/52파일 중 다음 후보를 새로 스캔해 경고 수와 사용자 경로 위험이 낮은 컴포넌트부터 계속 줄입니다.
- planning/ops 저장소 테스트는 아직 전체 스위트 부하에 민감한 파일이 있으므로, 다음 회귀가 보이면 제품 계약을 유지한 fixture 축소를 우선 검토합니다.
