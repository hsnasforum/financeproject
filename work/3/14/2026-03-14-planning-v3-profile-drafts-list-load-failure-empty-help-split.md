# 2026-03-14 planning-v3 profile-drafts-list-load-failure-empty-help-split

## 변경 파일
- `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
- `tests/planning-v3-profile-drafts-ui.test.tsx`
- `tests/e2e/v3-draft-apply.spec.ts`

## 사용 skill
- `planning-gate-selector`: 이번 배치를 `list client + direct UI test + narrow e2e`로 닫을지, 언제 `build`와 e2e를 추가할지 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: load-failure/empty split 결과와 실행 검증을 `/work` 형식으로 남기는 데 사용

## 변경 이유
- latest `txn-accounts-batches surface` note가 다음 우선순위 1번으로 `[가정] planning-v3 profile-drafts list load-failure empty/help split`을 남겼다.
- 직전 `draft-profile user-facing surface` note도 `ProfileDraftsListClient`의 목록 실패와 진짜 empty/help 혼선을 잔여 user-facing 후보로 남겼다.
- 현재 `ProfileDraftsListClient`는 목록 fetch 실패 시 `rows=[]`가 되기 때문에, 실패 상태를 분리하지 않으면 `저장된 profile draft가 없습니다.`와 같은 empty 의미로 오해될 여지가 있었다.

## 핵심 변경
- `ProfileDraftsListClient`에서 loading은 `목록을 불러오는 중...`, failure는 `loadFailed`, empty/help는 `!loading && !loadFailed && rows.length < 1`로 갈라서 같은 의미가 섞이지 않게 정리했다.
- failure guidance는 `data-testid="v3-profile-drafts-load-failure"`와 함께 `초안 목록을 확인하지 못했습니다. 새로고침으로 다시 시도해 주세요.`만 노출해 create/delete 메시지와 섞이지 않게 정리했다.
- `tests/planning-v3-profile-drafts-ui.test.tsx`에 loading 상태가 empty/failure보다 먼저 보이는지, failure 상태에서 empty copy가 보이지 않는지 각각 direct UI test로 고정했다.
- `tests/e2e/v3-draft-apply.spec.ts`에 `/planning/v3/profile/drafts` 목록 GET 실패 시 failure guidance는 보이고 `저장된 profile draft가 없습니다.`는 보이지 않는 narrow e2e 1건을 추가했다.
- 조건부 포함 여부: `src/app/planning/v3/profile/drafts/page.tsx`, `src/app/api/planning/v3/profile/drafts/route.ts`, `tests/planning-v3-profile-drafts-api.test.ts`는 열지 않았다.

## 검증
- 실행: `pnpm exec vitest run tests/planning-v3-profile-drafts-ui.test.tsx`
- 실행: `pnpm exec eslint src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx tests/planning-v3-profile-drafts-ui.test.tsx tests/e2e/v3-draft-apply.spec.ts`
- 실행: `pnpm build`
- 실행: `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/v3-draft-apply.spec.ts --workers=1`
- 미실행: `src/app/planning/v3/profile/drafts/page.tsx` prop wiring 확인
- 미실행 이유: list client 내부 상태 분기만으로 원인이 닫혔고, page shell reopen이 필요하지 않았다.
- 미실행: `src/app/api/planning/v3/profile/drafts/route.ts`, `tests/planning-v3-profile-drafts-api.test.ts`
- 미실행 이유: route payload shape 문제는 보이지 않았고, 이번 라운드는 list client surface 분리에 집중했다.

## 남은 리스크
- current dirty subset 안의 다른 변경은 이번 배치와 직접 관련 없는 기존 diff가 섞여 있으므로, 다음 라운드에서는 포함 파일을 다시 subset lock 해야 한다.
- profile draft detail/preflight/apply semantics는 이번 라운드 범위 밖이라 reopen하지 않았다.
- news follow-through/copy residue와 txn/accounts/batches helper 계산층은 실제 blocker가 다시 확인될 때만 reopen하는 편이 안전하다.

## 다음 라운드 우선순위
1. news follow-through/copy residue는 blocker가 다시 확인될 때만 reopen
2. txn/accounts/batches helper 계산층은 실제 mismatch가 다시 확인될 때만 reopen
3. [가정] profile draft list 외의 새 user-facing residue가 다시 확인되면 그때 다음 batch로 분리
