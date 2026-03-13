# 2026-03-12 planning-v3 drafts remote-host 및 preview fallback closeout

## 변경 파일
- `src/app/api/planning/v3/drafts/route.ts`
- `src/app/api/planning/v3/drafts/[id]/route.ts`
- `src/app/api/planning/v3/draft/preview/route.ts`
- `tests/planning-v3-draft-create-profile-api.test.ts`
- `tests/planning-v3-drafts-remote-host-api.test.ts`
- `tests/planning-v3-write-route-guards.test.ts`

## 사용 skill
- `planning-gate-selector`: drafts/profile 배치에 맞는 최소 검증 세트를 고르기 위해 사용
- `work-log-closeout`: 오늘 closeout note 형식을 저장소 규칙에 맞추기 위해 사용

## 변경 이유
- `/planning/v3/drafts`와 draft preview 사용자 경로가 remote same-origin 환경에서도 동작해야 하는데, write guard 회귀 근거가 부족했고 legacy draft id로 preview를 열면 404가 날 수 있었습니다.

## 핵심 변경
- `drafts` POST와 `drafts/[id]` DELETE guard를 `assertSameOrigin + requireCsrf(..., { allowWhenCookieMissing: true })` 계약으로 정렬했습니다.
- `tests/planning-v3-drafts-remote-host-api.test.ts`를 추가해 drafts list/detail/create, draft preview, draft delete의 same-origin success와 cross-origin `ORIGIN_MISMATCH`를 고정했습니다.
- `draft/preview` route가 v3 preview draft store에서 못 찾은 id를 legacy `drafts` store에서도 다시 조회하도록 fallback을 추가했습니다.
- legacy draft record를 preview route가 읽을 수 있도록 최소 adapter를 넣어 detail 화면에서 넘어오는 draft id 404를 막았습니다.
- `tests/planning-v3-draft-create-profile-api.test.ts`에 `drafts/[id]/create-profile`의 same-origin remote-host `EXPORT_ONLY` 유지와 cross-origin `ORIGIN_MISMATCH` 차단을 추가했습니다.
- `tests/planning-v3-write-route-guards.test.ts` runtime target에 `draft/preview POST`, `drafts POST`, `drafts/[id] DELETE`, `drafts/[id]/create-profile POST`를 추가했습니다.
- 관련 사용자 경로, current-screens, 운영 runbook 계약은 바뀌지 않아 문서 업데이트는 하지 않았습니다.

## 검증
- `pnpm test tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3/api-drafts-route.test.ts tests/planning-v3/api-drafts-id-route.test.ts tests/planning-v3-draft-preview-api.test.ts tests/planning-v3-write-route-guards.test.ts`
  - 1차 FAIL: test seed가 잘못된 store를 써서 drafts list에 fixture가 안 보임
  - 2차 FAIL: `draft/preview`가 legacy draft id를 못 읽어 404 반환
  - 3차 PASS
- `pnpm exec eslint src/app/api/planning/v3/drafts/route.ts src/app/api/planning/v3/drafts/[id]/route.ts src/app/api/planning/v3/draft/preview/route.ts tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
- `pnpm build`
- `pnpm test tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-write-route-guards.test.ts`
- `pnpm exec eslint tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-write-route-guards.test.ts`
- `git diff --check -- src/app/api/planning/v3/drafts/route.ts src/app/api/planning/v3/drafts/[id]/route.ts src/app/api/planning/v3/draft/preview/route.ts tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
- `git diff --check -- src/app/api/planning/v3/drafts/route.ts src/app/api/planning/v3/drafts/[id]/route.ts src/app/api/planning/v3/draft/preview/route.ts tests/planning-v3-draft-create-profile-api.test.ts tests/planning-v3-drafts-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts work/3/12/2026-03-12-planning-v3-drafts-remote-host-and-preview-fallback-closeout.md`
- `pnpm multi-agent:guard`

## 남은 리스크
- `draft/preview` fallback adapter는 현재 legacy draft shape를 preview 계산에 필요한 최소 필드만 맞춥니다. legacy/v3 draft 모델이 더 벌어지면 adapter 필드 drift를 다시 점검해야 합니다.
- `multi-agent:guard`의 `latestWorkNote`는 tracked note 기준이라 이번 closeout이 최신 note로 바로 잡히지 않을 수 있습니다. 현재 guard PASS라 운영 blocker는 아닙니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
