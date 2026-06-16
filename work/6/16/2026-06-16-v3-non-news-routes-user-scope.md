# 2026-06-16 v3 non-news routes user scope

## 변경 파일
- `planning/v3/scenarios/library.ts`
- `src/app/api/planning/v3/import/csv/route.ts`
- `src/app/api/planning/v3/indicators/specs/route.ts`
- `src/app/api/planning/v3/scenarios/library/route.ts`
- `tests/planning-v3-non-news-routes-user-scope.test.ts`
- `work/6/16/2026-06-16-v3-non-news-routes-user-scope.md`

## 사용 skill
- `work-artifact-intake`: PR #33 merge 이후 최신 `/work` 기록과 원본 dirty diff를 대조해 non-news route-family로 범위를 좁혔습니다.
- `planning-gate-selector`: Planning v3 App Router API route, scenario override namespace, indicator/import route meta 영향에 맞는 검증 세트를 골랐습니다.
- `work-log-closeout`: 변경 파일, 실제 검증 결과, 남은 리스크, 다음 라운드 후보를 종료 기록으로 남겼습니다.

## 변경 이유
- scenario library override 저장소가 공용 `.data/scenarios` 경로를 쓰면 사용자별 시나리오 라이브러리 설정이 섞일 수 있습니다.
- scenarios/library, indicators/specs, import/csv route는 인증 이후 오류 응답에 실제 사용자 meta를 유지해야 합니다.
- route에서 read/write 동작을 인증 사용자 scope 안에서 실행해야 namespace enabled 환경의 사용자별 저장소를 일관되게 읽고 씁니다.

## 핵심 변경
- scenario library 기본 override 경로를 namespace enabled 환경에서 `getPlanningUserDir(resolvePlanningUserId(), cwd)/scenarios`로 바꿨습니다.
- scenarios/library GET/POST route를 `withPlanningRouteUser` callback 안에서 실행하고 POST 입력 오류에 인증 사용자 meta를 붙였습니다.
- indicators/specs GET/POST route를 인증 사용자 callback 안에서 실행하고 POST 입력 오류에 meta를 붙였습니다.
- import/csv POST route를 인증 사용자 callback 안에서 실행하고 body/parse/import 오류에 meta를 붙였습니다.
- Alice/Bob scenario override 격리, invalid non-news route meta, indicator specs read 유지 테스트를 추가했습니다.

## 검증
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm install`
- PASS: `git diff --check -- planning/v3/scenarios/library.ts src/app/api/planning/v3/import/csv/route.ts src/app/api/planning/v3/indicators/specs/route.ts src/app/api/planning/v3/scenarios/library/route.ts tests/planning-v3-non-news-routes-user-scope.test.ts`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm exec vitest run tests/planning-v3-non-news-routes-user-scope.test.ts tests/planning-v3-indicators-specs-import-api.test.ts tests/planning/auth/currentUser.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` - 4개 파일, 11개 테스트 통과.
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm lint`
- PASS: `DATABASE_URL="file:./prisma/dev.db" corepack pnpm build`
- PASS: closeout 파일 추가 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard` - `latestWorkNoteTracking=untracked`를 확인했습니다.
- PASS: staging 후 `DATABASE_URL="file:./prisma/dev.db" corepack pnpm multi-agent:guard` 재실행. `latestWorkNoteTracking=tracked`를 확인했습니다.
- PASS: staging 후 `git diff --cached --check -- planning/v3/scenarios/library.ts src/app/api/planning/v3/import/csv/route.ts src/app/api/planning/v3/indicators/specs/route.ts src/app/api/planning/v3/scenarios/library/route.ts tests/planning-v3-non-news-routes-user-scope.test.ts work/6/16/2026-06-16-v3-non-news-routes-user-scope.md`

## 남은 리스크
- `readScenarioLibraryOverrides(dataDir)`처럼 명시 dataDir을 넘기는 호출은 기존 명시 경로 의미를 유지하므로 namespace 기본 경로 적용 대상에서 제외됩니다.
- profile draft route-family와 `transactions/batches/[id]/categorized`/`cashflow` helper refactor는 이번 PR에 포함하지 않았습니다.
- 브라우저 e2e는 실행하지 않았습니다. 이번 변경은 API route와 file-store namespace 검증 중심입니다.

## 다음 라운드
- profile draft route-family user-scope/meta 후보를 다음 작은 PR로 검토합니다.
- categorized/cashflow route-family는 helper refactor가 섞여 있으므로 별도 contract narrowing PR로 분리합니다.
