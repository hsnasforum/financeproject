# 2026-09-07 거래 초안을 기존 프로필에 명시적으로 갱신

## 변경 파일

- `src/lib/planning/v3/service/applyDraftPatchToProfile.ts`: create 기본 계약 유지, update의 서버 재검증과 충돌 처리.
- `src/lib/planning/v3/service/profileRepository.ts`: 현재 사용자 범위의 무변경 snapshot 조회 경계.
- `src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts`: 명시적 mode, record/월 patch hash 반환, 기존 P0 오류 응답.
- `src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts`: update/create 요청 계약과 conflict 응답.
- `src/lib/planning/store/profileStore.ts`: 월 3개 필드의 조건부 atomic update, 기존 저장 필드 보존, 관련 writer/legacy/Vault 전환의 기존 lock 공유.
- `src/lib/planning/storage/atomicWrite.ts`: write/rename 실패 시 자기 임시 파일을 정리하고 원래 오류 유지.
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`: 갱신 primary, 신규 생성 secondary, 점검 상태와 중복 클릭 차단, 충돌 후 재점검.
- `tests/planning-v3-profile-draft-apply-api.test.ts`, `tests/planning-v3-profile-draft-update-api.test.ts`, `tests/planning-v3-profile-drafts-ui.test.tsx`: 실제 store/API 및 UI 안전 회귀.
- `tests/e2e/dashboard-current-state.spec.ts`: 기존 3개 유지, 실제 update/conflict → dashboard stale → rerun → report → current 사례 추가.
- `README.md`, `docs/planning-v3-boundary-adr.md`: 사용 흐름과 저장/API 계약 설명. 새 경로가 없어 `docs/current-screens.md` 목록 변경 없음.
- 이 작업 기록.

## 사용 skill

- `finance-skill-routing`: 필요한 로컬 skill 범위 선택.
- `planning-gate-selector`: draft/API/store/legacy/dashboard 영향에 맞는 집중·전체·build·complete·E2E 검증 선정.
- `planning-v3-batch-contract-narrowing`: 조사 시 draft stored-first/current-user 경계를 확인.
- `route-ssot-check`: 기존 planning/dashboard/report handoff 경로 확인.
- `work-log-closeout`: 실제 실행 결과와 보존 증거 기록.

## 변경 이유

수정 전 실제 preflight/apply API와 store를 사용하는 재현 테스트에서 A를 선택해 적용해도 A는 그대로이고 새 `Draft 적용본` B가 생겨 프로필 수가 1개 증가했습니다(`before`: 1 PASS, 선택 외 3 skip). 기존 API의 이 create-copy 동작은 호환성 검사로 유지했습니다.

목표는 사용자가 선택한 기존 stable 프로필을 한 번의 명시 클릭으로 갱신하고, 기존 dashboard freshness/rerun 기능에 연결하는 것입니다. 작업 시작 시 승인된 전체 파일 snapshot을 보관하고 이번 incremental diff만 비교했습니다.

## 핵심 변경

- `applyMode` 생략 또는 `"create"`는 기존 신규 생성입니다. `"update"`는 `profileId`, preflight의 `profileRevision`/`draftPatchHash`를 각각 `expectedProfileRevision`/`expectedDraftPatchHash`로 보내야 합니다. 두 mode 모두 성공 응답은 `data.profileId`입니다. update는 동일 ID를 반환합니다.
- 서버는 현재 사용자 범위의 draft와 profile을 다시 읽고 동일 월 patch로 preflight/validation을 수행합니다. 저장 경계에서 record hash를 다시 비교하며, 변경 시 409/`CONFLICT`와 `프로필이 변경되어 preflight를 다시 확인해야 합니다.`를 반환합니다. UI는 점검을 무효화하고 재점검을 허용합니다.
- 실제 제공된 월 소득·필수지출·재량지출만 병합합니다. raw 비대상 필드와 ID/name/createdAt/default, 자산·부채·목표·일정·세금·연금을 보존합니다. 기존 구형 월 별칭은 해당 논리 필드만 동기화합니다. 기존 reader가 허용한 비표준 updatedAt도 갱신할 수 있으며 정상 timestamp는 단조 증가합니다.
- 기존 `updateProfile`/atomic writer/hash utility/user-scoped store lock을 재사용합니다. legacy 이전과 Vault 전환은 lock 획득 후 현재 값을 재조회해 새 갱신을 오래된 값으로 덮지 않습니다. 단일 profile replacement 뒤 실패 가능한 registry/default 추가 쓰기는 하지 않습니다. list reader의 기존 metadata 갱신을 유지합니다.
- UI는 `선택한 프로필 갱신`과 `새 프로필로 만들기`를 구분합니다. 미선택·preflight 없음/실패/오류·대상 변경에는 update가 비활성입니다. 기존 warning-only UX를 유지합니다. 성공 후 `/planning?profileId=<동일 ID>`로 이동하며 자동 apply/rerun은 없습니다.

## 검증

Windows PowerShell에서 Ubuntu의 Linux Git/Node와 캐시된 pnpm 9.15.9를 사용했습니다. 기존 방식대로 `/tmp/finance-a-draft-update-20260907/execution`에 현재 소스를 복사하고 bwrap 안에서 원본 `/home`와 node_modules를 읽기 전용으로 두어 검증했습니다. 원본 dependency install/update나 config 변경은 없습니다. 명령·exit·source hash·로그는 같은 scratch의 각 label `.json`/`.log`, 변경 비교는 `incremental.diff`, 보존 결과는 `audit.json`입니다. scratch의 장기 보관은 보장하지 않습니다.

| 실행 명령 | 결과 / 증거 label |
| --- | --- |
| `pnpm run test tests/planning-v3-profile-draft-apply-api.test.ts -t "creates a new profile from base" --maxWorkers=2` | 수정 전 실제 store/API 복사 생성 재현, `before` |
| `pnpm run test tests/planning-v3-profile-draft-update-api.test.ts tests/planning-v3-profile-drafts-ui.test.tsx tests/planning/profileCorruption.test.ts tests/planning-store.test.ts --maxWorkers=2` | 4 files/183 PASS, `focused-store-final`. 이후 legacy alias 보완은 아래 focused/full에서 재검증 |
| `pnpm run test tests/planning-v3-profile-draft-update-api.test.ts tests/planning/profileCorruption.test.ts tests/planning-v2-api/profile-corruption-route.test.ts tests/planning-v3-profile-draft-user-scope.test.ts tests/planning-v3-profile-drafts-user-scope.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts tests/planning/auth/authConfigContract.test.ts tests/dashboard-view-model.test.tsx tests/planning-v2-api/create-run-input-context.test.ts tests/planning-v2-api/create-run-idempotency.test.ts --maxWorkers=2` | 10 files/273 PASS, `regression-focused` |
| `pnpm run test tests/planning-v3-profile-draft-update-api.test.ts --maxWorkers=2` | 최종 update API 25 PASS, `alias-vault-focused` |
| `pnpm typecheck` | PASS, `final-typecheck-after-runtime` |
| `pnpm lint` | PASS, `revised-lint`. 이후 E2E fixture 2줄 수정은 `pnpm exec eslint tests/e2e/dashboard-current-state.spec.ts` PASS, `late-fixture-lint` |
| `pnpm run test --maxWorkers=2` | 874 files/3,731 PASS, `full-test-final` |
| `pnpm build` | PASS, `final-build` |
| `pnpm planning:v2:compat` | PASS, `compat-complete`. legacy 월 별칭/이전과 Vault 전환 동시성 변경으로 1회 실행. 내부 `planning:v2:complete` PASS 및 fast E2E 8 PASS. complete를 별도 중복 실행하지 않음 |
| `pnpm e2e:pw tests/e2e/dashboard-current-state.spec.ts tests/e2e/v3-draft-apply.spec.ts --runtime=production --workers=1 --retries=0 --grep 'transaction profile draft\|planning v3 profile draft'` | 4 PASS, `draft-production-final` |
| `pnpm e2e:pw tests/e2e/dashboard-current-state.spec.ts --workers=1 --retries=0 --grep 'dashboard aligns\|dashboard rerun\|dashboard missing'` | 기존 dashboard E2E 3 PASS, `dashboard-regression-final` |
| `pnpm e2e:rc --runtime=production --grep 'dashboard\|planning workspace\|planning quickstart\|planning reports\|planning report detail\|planning runs\|history' --retries=0` | 관련 RC 17 PASS/1 skip, `rc-production`. 기존 unauthenticated-response 사례가 fixture 조건에 따라 skip됨 |
| `pnpm planning:current-screens:guard` | 5 files/11 PASS, `route-guard` |

실제 확인한 안전 계약:

- 정상 store fixture의 프로필 수는 1 → 1, ID/default 동일입니다. 월 값은 5,000,000/2,000,000/800,000 → 5,200,000/2,100,000/700,000입니다. liquid 10,000,000, investment 20,000,000, debts/goals, cashflow contributions, tax/pension 및 알려지지 않은 기존 optional sentinel을 보존했습니다. get/list와 새 Node 프로세스 조회 후에도 유지됐습니다.
- mode 생략/create는 별도 프로필 1개를 생성하고 A bytes를 보존합니다. update의 ID 누락, 대상 없음, 타 사용자, token 누락, 잘못된 mode, invalid/빈 draft, 변경된 profile/draft, target/sibling corruption, rename 실패는 no-write를 검사했습니다. corruption의 기존 P0 error code를 유지합니다. 동시 같은 revision apply는 200/409이며 생성 수가 늘지 않습니다.
- legacy 이동 reader와 apply의 atomic rename을 겹치는 재현에서 새 값이 유지됐습니다. 실제 nested cashflow 별칭은 partition/legacy × Vault on/off 네 경우 모두 새 canonical 월 값과 기존 일정 보존을 검사했습니다.
- 신규 production E2E는 저장된 합성 거래 초안 fixture를 실제 detail/preflight/apply API로 읽었습니다. 프로필 A의 preflight 후 별도 이름 PATCH → 409/bytes 불변 → 재점검 → 같은 A 갱신을 실제 클릭했습니다. 각 단계의 profile ID 목록이 동일했고 default와 비대상 필드를 보존했습니다.
- dashboard는 갱신 후 520만원 소득/280만원 생활지출을 표시하고 old run의 profileHash와 달라 stale이 됐습니다. 진입만으로 새 run은 없었습니다. 기존 rerun 버튼 클릭 → 동일 profileId/old input으로 새 run/report 생성 → 새 hash 일치 및 dashboard current를 확인했습니다. old run의 API record와 저장 bytes는 전 과정에서 동일했습니다.
- 기존 dashboard 중복 클릭/응답 유실 재시도는 같은 key와 한 개의 새 run을 유지했고, snapshot 누락은 400/no-write/stale 유지와 재시도·조건 검토 이동이 통과했습니다.

수정·복구한 검사 실패:

- 주입한 rename 실패에서 자기 tmp가 남는 문제를 수정하고 no-write 재검사 통과. legacy migration 변경 중 canonical 반환 계약을 깨뜨린 7개 P0 실패는 기존 canonical 변환을 복구하여 해결했습니다. SSR disabled 검사는 CSS의 `disabled:` 문자열을 실제 attribute로 오인하던 선택식을 바로잡았습니다.
- 첫 full의 direct-store route import 실패는 기존 current-user repository 경계로 옮겼습니다. 검증 복사본에서 빠진 공개 `.env.example`은 복사하여 auth contract 검사 입력을 복구했습니다. 최종 full 모두 PASS입니다.
- 최초 신규 dev E2E는 preflight가 JSON 대신 HTML 404를 반환해 실패했습니다. 실제 production API 흐름으로 검증을 완료했습니다. production fixture는 dev-only API 대신 v2 API를 사용하고 기존 초기 default와 구분해 대상 A를 명시적으로 default로 설정했습니다. 제품 보호 조건은 바꾸지 않았습니다.
- 기존 dashboard E2E의 첫 `--grep '^dashboard'`는 파일명이 포함된 full title과 맞지 않아 0 tests였으며 명시적 제목 선택식으로 3개 실행/PASS했습니다.
- fast E2E가 생성 중인 `.next-e2e*/dev/types/routes.d.ts`를 동시에 읽은 typecheck 1회가 실패했습니다. 런타임 종료 후 같은 최종 소스의 typecheck가 PASS했습니다. 제품 소스나 TS 설정을 변경하지 않았습니다.

보존 확인:

- branch `stage1/accuracy-safety-clean-ci-20260902`, HEAD `4d16f4f8516b7f4fb0b833e1b0c916a8607ed64a`, raw index SHA-256 `28d953eafaef0eb7130b6fbae2ef39f5eda3a46cf86c130e1a19d77a05d5d28c` 유지.
- 시작 snapshot 대비 기존 파일 12개 수정과 update API 테스트·이 기록 2개 추가만 이번 변경입니다. 기존 승인 변경은 그대로 보존하고 신규 preservation exception을 추가하지 않았습니다. package/lock/config와 dependency 검사 대상 hash/mtime은 동일합니다. `git --no-optional-locks diff --check`도 통과했습니다.
- 별도 worktree `finance-profile-corruption-preservation-c1cad28d`, `finance-dependency-audit-reliability-20260904`, `finance-dependency-audit-response-body-timeout-20260904`, `finance-pnpm-action-bootstrap-v6010-d8401041`의 branch/HEAD/index/status 및 검사 파일은 시작 snapshot과 동일했습니다.
- 최종 제품 코드 이후 build/lint/update focused가 PASS이고, 마지막 E2E fixture 보정까지 포함한 full/typecheck/E2E/RC가 PASS입니다. 이후 변경은 이 기록과 alias 계약 문서 보완뿐입니다. index 조작·Git 게시·의존성 설치·설정/skill 변경은 없습니다.

## 남은 리스크

- 실제 사용자 거래 데이터는 미확인입니다. 합성 저장 초안·프로필·snapshot으로 검증했으며 실제 거래 자동 import/추론 확대나 plan-vs-actual 계산을 추가하지 않았습니다.
- 신규 dev preflight의 HTML 404 원인은 미해결입니다. production의 실제 신규 흐름과 관련 RC는 통과했지만 dev 신규 흐름 PASS로 보고하지 않습니다. 격리 fixture DB의 외부 source snapshot 테이블 누락 로그도 있었으며 해당 외부 데이터 연동은 이 작업의 검증 대상이 아닙니다.
- 저장 lock은 기존 process-local 계약입니다. 여러 독립 서버 프로세스의 동시 파일 쓰기까지 보장하는 분산 revision 체계를 추가하지 않았습니다. 기본 프로필이 아닌 대상을 선택하면 같은 ID의 planning으로 이동하며 dashboard 기본 프로필 선택 계약은 유지합니다.
- Model requested: 이번 요청에 새 지정 없음(앞선 관련 요청의 Astra/high 맥락). 권장: GPT-6 Astra/high. Model effective: 정확한 모델/effort를 확인할 런타임 근거가 없어 미확인. 설정 변경이나 모델 전환을 수행하지 않았습니다.
- 이번 라운드는 기존 프로필 갱신 → stale → 기존 rerun 연결의 구현·검증·기록에서 종료합니다. plan-vs-actual은 다음 별도 CORE 범위이며 착수하지 않았습니다.
