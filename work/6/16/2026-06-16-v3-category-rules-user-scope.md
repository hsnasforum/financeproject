# 2026-06-16 v3 category rules user scope

## 변경 파일
- `src/app/api/planning/v3/categories/rules/route.ts`
- `src/app/api/planning/v3/categories/rules/[id]/route.ts`
- `src/lib/planning/v3/store/categoryRulesStore.ts`
- `tests/planning-v3-category-rules-user-scope.test.ts`
- `work/6/16/2026-06-16-v3-category-rules-user-scope.md`

## 사용 skill
- `work-artifact-intake`: PR #32 merge 이후 최신 `/work` 기록과 원본 dirty diff를 대조해 `categories/rules` route-family로 범위를 좁혔습니다.
- `planning-gate-selector`: Planning v3 App Router API route, category rules store namespace, categorized 소비자 영향에 맞는 검증 세트를 골랐습니다.
- `work-log-closeout`: 변경 파일, 실제 검증 결과, 남은 리스크, 다음 라운드 후보를 종료 기록으로 남겼습니다.

## 변경 이유
- category rules 저장소가 공용 `planning-v3/category-rules.json` 경로를 쓰면 사용자별 룰이 섞여 categorized 결과에 영향을 줄 수 있습니다.
- route에서 store 호출이 인증 사용자 scope 안에서 실행되어야 list/upsert/delete가 같은 사용자 namespace를 읽고 씁니다.
- 인증 이후 `INPUT`/`INTERNAL` 오류 응답에는 실제 인증 사용자 meta를 유지해야 후속 UI와 운영 로그가 같은 기준으로 판단할 수 있습니다.

## 핵심 변경
- `categoryRulesStore` 기본 저장 경로를 `resolvePlanningV3DataDir(cwd)/category-rules.json`으로 바꿔 namespace enabled 환경에서 사용자별 저장소를 따르게 했습니다.
- category rules GET/POST route의 store 호출을 `withPlanningRouteUser` callback 안에서 실행하고 인증 이후 오류 응답에 meta를 붙였습니다.
- category rules DELETE route도 같은 callback 안에서 `deleteRule`을 실행하도록 맞췄습니다.
- Alice/Bob 룰 fixture로 list 격리, cross-user delete no-op, owner delete, invalid 입력 meta를 검증하는 테스트를 추가했습니다.

## 검증
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm install`
- PASS: `git diff --check -- src/app/api/planning/v3/categories/rules/route.ts src/app/api/planning/v3/categories/rules/[id]/route.ts src/lib/planning/v3/store/categoryRulesStore.ts tests/planning-v3-category-rules-user-scope.test.ts`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm exec vitest run tests/planning-v3-category-rules-user-scope.test.ts tests/planning-v3-categories-rules-api.test.ts tests/planning-v3-categoryRulesStore.test.ts tests/planning-v3-categorized-api.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` - 6개 파일, 16개 테스트 통과.
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm lint`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm build`
- PASS: closeout 파일 추가 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard` - `latestWorkNoteTracking=untracked`를 확인했습니다.
- PASS: staging 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard` 재실행. `latestWorkNoteTracking=tracked`를 확인했습니다.
- PASS: staging 후 `git diff --cached --check -- src/app/api/planning/v3/categories/rules/route.ts src/app/api/planning/v3/categories/rules/[id]/route.ts src/lib/planning/v3/store/categoryRulesStore.ts tests/planning-v3-category-rules-user-scope.test.ts work/6/16/2026-06-16-v3-category-rules-user-scope.md`

## 남은 리스크
- `PLANNING_V3_CATEGORY_RULES_PATH`를 명시한 운영 환경은 기존 override path 의미를 유지하므로 사용자 namespace 적용 대상에서 제외됩니다.
- `transactions/batches/[id]/categorized`/`cashflow` route-family의 helper refactor와 route meta/user-scope는 이번 PR에 포함하지 않았습니다.
- 브라우저 e2e는 실행하지 않았습니다. 이번 변경은 API route와 file-store namespace 검증 중심입니다.

## 다음 라운드
- `transactions/batches/[id]/categorized`/`cashflow` helper refactor를 contract narrowing PR로 분리할지 검토합니다.
- `profile/draft`, `scenarios/library`, `indicators/specs`, `import/csv` 같은 남은 non-news route-family user-scope/meta 후보를 계속 작은 단위로 나눕니다.
