# 2026-03-13 planning-v3 user-facing page follow-up

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 작업 축이 달라졌음. 이번 라운드는 같은 dirty 브랜치에서 `categories / journal / scenarios` user-facing page만 분리해 닫았다.

## 실제 mismatch 여부
- 있었다.
- route 응답 shape와 same-origin/CSRF 계약은 이미 client 소비와 맞았고, 남아 있던 문제는 `JournalClient`와 `ScenarioLibraryClient`의 hero 요약 카드가 조회 실패 뒤에도 `0건` 또는 `0개`처럼 읽히는 점이었다.

## 실제 포함 파일
- `src/app/planning/v3/journal/JournalClient.tsx`
- `src/app/planning/v3/scenarios/_components/ScenarioLibraryClient.tsx`
- `work/3/13/2026-03-13-planning-v3-user-facing-contract-followup.md`

## audit에 포함했지만 수정하지 않은 파일
- `src/app/planning/v3/categories/rules/_components/RulesClient.tsx`
- `src/app/api/planning/v3/categories/rules/route.ts`
- `src/app/api/planning/v3/categories/rules/[id]/route.ts`
- `src/app/api/planning/v3/journal/entries/route.ts`
- `src/app/api/planning/v3/journal/entries/[id]/route.ts`
- `src/app/api/planning/v3/scenarios/library/route.ts`
- `tests/planning-v3-categories-rules-api.test.ts`
- `tests/planning-v3-journal-api.test.ts`
- `tests/planning-v3-user-facing-remote-host-api.test.ts`
- `tests/planning-v3-write-route-guards.test.ts`

## 제외 파일
- `news/settings` 전체
- `transactions/accounts` 전체
- `balances` 전체
- `drafts/profile` 전체
- `import/csv` 전체
- `store/helper` 전체
- `quickstart/home/reports`
- 새 route 추가
- 저장모델 변경
- docs 대량 수정
- `pnpm e2e:rc`
- `pnpm release:verify`

## client 소비와 API 계약 정리
- `RulesClient`는 기존 `GET /api/planning/v3/categories/rules`의 `{ ok, items }` 계약과 여전히 맞았고, 이번 라운드에서는 추가 오해 지점을 찾지 못해 수정하지 않았다.
- `JournalClient`는 기존 `GET/POST /api/planning/v3/journal/entries` 계약과 맞았고, 이번에는 엔트리 조회 실패 뒤 hero 카드가 실제 저장 수를 모르는 상태인데도 `0건`처럼 보이던 부분만 보정했다.
- `ScenarioLibraryClient`는 기존 `GET/POST /api/planning/v3/scenarios/library`의 `{ ok, data }` 계약과 맞았고, 이번에는 라이브러리 재조회 실패 뒤 템플릿 수와 활성 수가 `0개`처럼 보이던 부분만 `확인 필요` 쪽으로 낮췄다.
- same-origin + CSRF 기준은 기존 route/test 계약 그대로 유지했고, user-facing route를 local-only/dev-only로 되돌리는 변경은 넣지 않았다.

## 핵심 변경
- `JournalClient`: 저장된 엔트리 재조회에 실패한 경우 hero 카드의 `저장된 기록` 값을 `-`로 바꾸고, 설명도 `다시 불러와 확인` 의미로 낮췄다.
- `ScenarioLibraryClient`: 라이브러리 조회 실패 시 hero 카드의 `전체 템플릿`, `활성 템플릿` 값을 `-`로 바꾸고, 설명도 현재 수치를 확정하지 않는 문구로 맞췄다.
- `RulesClient`, route 5개, guard 테스트 4개는 audit 결과 현재 계약과 의미가 충분히 맞아 수정하지 않았다.

## 실행한 검증
- `pnpm exec vitest run tests/planning-v3-categories-rules-api.test.ts tests/planning-v3-journal-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
- `pnpm exec eslint src/app/planning/v3/journal/JournalClient.tsx src/app/planning/v3/scenarios/_components/ScenarioLibraryClient.tsx`
- `pnpm build`
- `git diff --check -- src/app/planning/v3/journal/JournalClient.tsx src/app/planning/v3/scenarios/_components/ScenarioLibraryClient.tsx work/3/13/2026-03-13-planning-v3-user-facing-contract-followup.md`

## 미실행 검증
- `pnpm exec vitest run tests/planning-v3-routines-api.test.ts tests/planning-v3-indicators-specs-import-api.test.ts`
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- `JournalClient`의 연결 시나리오 조회는 여전히 `/api/planning/v3/news/scenarios`에 의존한다. 이번 라운드는 `categories / journal / scenarios` page 상태 의미만 정리했고, 그 route 자체는 다시 열지 않았다.
- 별도 UI 전용 테스트는 추가하지 않았다. 회귀 확인은 API 계약 테스트, `eslint`, `build`에 의존했다.

## 사용 skill
- `planning-gate-selector`: 이번 라운드의 최소 검증 세트 선정
- `work-log-closeout`: `/work` 종료 노트 구조 정리

## 다음 라운드 우선순위
- 다른 planning-v3 bucket으로 이동하되, 이미 닫은 `quickstart/home`, `news/settings`, `txn-overrides follow-through`는 새 runtime 이슈가 없으면 다시 열지 않는다.
