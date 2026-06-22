# 2026-06-23 planning v3 news result meta/user scope

## 이번 라운드 완료 항목
- `/api/planning/v3/news/*` 결과성 route 10개 성공 응답에 `meta.userId/authSource`를 명시했습니다.
- `/api/planning/v3/news/exposure`를 legacy global `.data/exposure/profile.json` 대신 v3 namespace-aware exposure store로 연결했습니다.
- weekly plan, news exposure profile, scenario `personalImpact`가 Alice/Bob 사용자 범위를 넘지 않는 회귀 테스트를 추가했습니다.
- legacy news exposure API 테스트 입력 계약을 v3 exposure enum 계약(`hasDebt: "yes" | "no" | "unknown"`)에 맞췄습니다.

## 사용 skill
- `finance-skill-routing`: 이번 라운드에 필요한 Finance Project skill 범위를 확인했습니다.
- `planning-gate-selector`: route/auth/user-scope 변경에 맞는 최소 및 PR 전 검증 세트를 골랐습니다.
- `work-log-closeout`: 변경 파일, 검증, 남은 리스크를 `/work` closeout 형식으로 정리했습니다.

## 변경 파일
- `src/app/api/planning/v3/news/digest/route.ts`
- `src/app/api/planning/v3/news/items/route.ts`
- `src/app/api/planning/v3/news/recovery/route.ts`
- `src/app/api/planning/v3/news/refresh/route.ts`
- `src/app/api/planning/v3/news/scenarios/route.ts`
- `src/app/api/planning/v3/news/search/route.ts`
- `src/app/api/planning/v3/news/sources/route.ts`
- `src/app/api/planning/v3/news/today/route.ts`
- `src/app/api/planning/v3/news/trends/route.ts`
- `src/app/api/planning/v3/news/weekly-plan/route.ts`
- `src/lib/planning/v3/news/exposure.ts`
- `tests/news-exposure-api.test.ts`
- `tests/planning-v3-news-user-scope.test.ts`

## 실행한 검증
- `corepack pnpm test tests/news-exposure-api.test.ts tests/planning-v3-news-user-scope.test.ts tests/planning-v3-news-weekly-plan-api.test.ts tests/planning-v3-news-api.test.ts`
- `corepack pnpm planning:user-scope:check`
- `corepack pnpm planning:auth:check`
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm sec:check`
- `corepack pnpm planning:ssot:check`
- `corepack pnpm test`
- `corepack pnpm build`

## 남은 리스크
- `digest/scenarios` route는 아직 legacy `.data/news/*.latest.json` artifact를 읽습니다. 저장 artifact 타입이 v3 store 타입과 달라서 별도 adapter 설계 후 분리하는 편이 안전합니다.
- `news items/search`는 SQLite news DB라는 공유 read-model을 사용합니다. 사용자별 설정/상태와 공유 원천 데이터의 경계 문서화가 추가로 필요합니다.
- UI는 이미 `/api/planning/v3/exposure/profile`을 쓰므로 `news/exposure` 전환의 화면 영향은 작지만, 외부 호출자가 있었다면 v3 enum 계약으로 맞춰야 합니다.

## 다음 라운드 우선순위
- `digest/scenarios` legacy artifact와 v3 store artifact의 타입 차이를 adapter 단위로 좁힙니다.
- 공유 news DB와 사용자별 state/cache 경계를 repository 문서와 테스트 이름에 더 분명히 남깁니다.
- Auth/User Scope 이후 PostgreSQL readiness gate와 `.data/planning/users/{userId}` migration manifest를 이어갑니다.
