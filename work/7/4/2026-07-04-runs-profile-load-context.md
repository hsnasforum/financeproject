# 2026-07-04 runs profile load context

## 변경 파일
- `src/lib/planning/store/profileStore.ts`
- `src/lib/planning/server/profiles/repository.ts`
- `src/lib/planning/server/pages/planningRscLoaders.ts`
- `tests/planning-store.test.ts`
- `tests/planning-reports-page-fallback.test.tsx`
- `work/7/4/2026-07-04-runs-profile-load-context.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 확인과 이번 라운드 skill 범위 선정
- `planning-gate-selector`: profile store/RSC loader 변경에 필요한 검증 세트 선정
- `work-log-closeout`: closeout 문서 형식과 필수 기록 정리
- `github:github`: PR #147/#148/#149 및 Issue #116/#117 상태 확인
- `manager subagent`: PR #149 이후 다음 작은 PR 후보 재분해

## 변경 이유
- `/planning/runs` 초기 로더는 filter profile이 없을 때 default profile id 조회와 profile 목록 조회를 별도로 호출했습니다.
- 두 호출 모두 profile store의 startup migration gate와 profile scan/default resolution 흐름을 통과할 수 있어, PR #149 이후 남은 profile read path slow-path 후보로 남아 있었습니다.
- public route 응답 shape를 바꾸지 않고, store/repository 내부에 profiles+default 단일 로드 helper를 추가해 같은 요청의 중복 profile load를 줄였습니다.

## 핵심 변경
- `profileStore`에 `listProfilesWithDefault`를 추가해 profile records와 resolved default id를 한 번의 load/default resolution으로 반환합니다.
- 기존 `listProfiles`, `listProfileMetas`, `getDefaultProfileId`는 새 내부 helper를 재사용하도록 정리했습니다.
- current-user profile repository에 `listCurrentUserProfilesWithDefault`를 추가했습니다.
- `/planning/runs` RSC loader가 `listCurrentUserProfilesWithDefault`를 사용해 profiles와 filter default id를 함께 정합니다.
- RSC loader 테스트는 `/planning/runs`에서 별도 default profile repository 호출이 사라진 것을 검증합니다.

## 검증
- `corepack pnpm test tests/planning-store.test.ts tests/planning-reports-page-fallback.test.tsx tests/planning/store/planningStoreNamespace.test.ts tests/planning/migrations/compat-fixtures.test.ts tests/planning/startupMigrationGate.test.ts`: PASS, 5 files / 34 tests
- `git diff --check && git diff --cached --check`: PASS
- `corepack pnpm lint`: PASS
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm test`: PASS, 770 files / 2546 tests
- `DATABASE_URL=postgresql://finance:finance@localhost:5432/finance corepack pnpm build`: PASS
- `corepack pnpm cleanup:next-artifacts`: PASS
- `corepack pnpm planning:v2:complete`: PASS
- `corepack pnpm planning:v2:compat --keep-sandbox`: PASS, sandbox `/tmp/planning-v2-compat-J2EyX6`
- `corepack pnpm planning:v2:regress`: PASS
- `corepack pnpm multi-agent:guard`: PASS

## 남은 리스크
- startup migration 실행 자체는 기존 promise cache에 계속 의존합니다.
- 이번 변경은 `/planning/runs` 초기 loader의 profile/default 중복 load를 줄이는 범위이며, run read fallback 또는 trash/legacy fallback 경계는 다루지 않았습니다.
- PR #147/#148/#149 위에 쌓는 후속 PR이므로 선행 PR merge 순서에 따라 rebase 또는 base 변경이 필요할 수 있습니다.

## 다음 라운드 우선순위
- #116: run read wrapper 또는 legacy fallback diagnostics를 작은 단위로 재검토합니다.
- #116: trash/legacy fallback 전체 재작성은 compat 계약을 먼저 고정한 뒤 별도 PR로 분리합니다.
- #117: persistence adapter 후속은 열린 stack 충돌 위험이 낮아진 뒤 진행합니다.
