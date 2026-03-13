# 2026-03-14 planning-v3 draft-profile-drafts-route-contract reaudit plan

## 변경 파일
- 코드 변경 없음
- `work/3/14/2026-03-14-planning-v3-draft-profile-drafts-route-contract-reaudit-plan.md`

## 사용 skill
- `planning-gate-selector`: direct test 중심의 최소 검증 세트와 build 확대 조건을 분리하는 데 사용
- `route-ssot-check`: 이번 배치가 public route 변경이 아닌 API route contract 재감사라는 점을 확인하는 데 사용

## 변경 이유
- 사용자 요청은 `planning-v3 draft-profile-drafts-route-contract` 배치를 다시 audit하되, 구현은 필요한 경우에만 최소 수정하고 우선은 정적 audit + direct test 검증으로 끝내는 계획 제안이었다.
- 오늘 최신 `/work` 기준으로 이 배치의 실제 핵심 범위는 `profile/draft(s)` API route 5개와 direct API tests 3개로 이미 좁혀져 있다.

## 제안한 단계
1. 기준선 잠금
   - 목적: 최신 `/work` 메모, dirty subset, direct test 대상 파일을 다시 고정해서 범위 확장을 막는다.
   - 추천 에이전트 타입: `manager`
2. 정적 계약 audit
   - 목적: `assertSameOrigin`, `requireCsrf`, query/body csrf 위치, payload shape가 route source와 direct tests 사이에서 어긋나는지 확인한다.
   - 추천 에이전트 타입: `analyzer`
3. direct test 재검증
   - 목적: `tests/planning-v3-profile-drafts-api.test.ts`, `tests/planning-v3-profile-draft-preflight-api.test.ts`, `tests/planning-v3-profile-draft-apply-api.test.ts`와 필요 시 `tests/planning-v3-profile-draft-v2-api.test.ts`까지 좁게 돌려 실제 계약을 고정한다.
   - 추천 에이전트 타입: `tester`
4. mismatch 시 최소 수정
   - 목적: audit 또는 direct test에서 막히는 route/test만 최소 수정하고 같은 direct 세트만 재실행한다. code path 확장이 없으면 broader flow는 열지 않는다.
   - 추천 에이전트 타입: `developer`
5. closeout와 확대 조건 판정
   - 목적: 변경이 생긴 경우에만 메인 에이전트가 `pnpm build`까지 올릴지 판단하고, `pnpm e2e:rc`는 사용자 경로/셀렉터 영향이 드러날 때만 후속으로 남긴다.
   - 추천 에이전트 타입: `reviewer`

## 실행한 검증
- 없음

## 미실행 검증
- `pnpm exec vitest run tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
- [조건부] `pnpm exec vitest run tests/planning-v3-profile-draft-v2-api.test.ts`
- [조건부] `pnpm exec eslint src/app/api/planning/v3/profile/draft/route.ts src/app/api/planning/v3/profile/drafts/route.ts src/app/api/planning/v3/profile/drafts/[id]/route.ts src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts tests/planning-v3-profile-drafts-api.test.ts tests/planning-v3-profile-draft-preflight-api.test.ts tests/planning-v3-profile-draft-apply-api.test.ts`
- [코드 수정 시] `pnpm build`
- [사용자 경로 영향 확인 시] `pnpm e2e:rc`

## 이번 라운드 완료 항목
- 최신 `/work`와 관련 배치 메모를 확인했다.
- 재감사 범위를 `profile/draft(s)` API 5개와 direct test 축으로 다시 고정했다.
- 정적 audit 우선, mismatch 시 최소 수정, build/e2e는 조건부 확대라는 작업 순서를 제안했다.

## 남은 리스크
- 아직 실제 direct test는 다시 실행하지 않았으므로 현재 dirty state 기준 PASS/FAIL은 미확인이다.
- `profile/draft` 단일 route의 direct test 포함 여부는 재감사 중 실제 mismatch 신호를 보고 최종 결정해야 한다.

## 다음 라운드 우선순위
1. 정적 audit으로 route/test 계약 mismatch 유무를 먼저 확정
2. direct API tests 재실행
3. 실패가 있을 때만 최소 수정 후 같은 범위 재검증
