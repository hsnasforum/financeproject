# 2026-06-22 news items repository boundary

## 변경 파일
- `src/app/api/planning/v3/news/items/route.ts`
- `src/lib/planning/v3/service/newsItemsRepository.ts`
- `tests/planning-v3-news-api.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기준으로 이번 라운드가 Repository/Data Ownership 구현 라운드인지 판단하는 데 사용했습니다.
- `planning-gate-selector`: API route와 service/repository 변경에 맞는 타깃 테스트, lint, build 검증 범위를 고르는 데 사용했습니다.
- `work-log-closeout`: 종료 기록 형식과 필수 항목 확인에 사용했습니다.

## 변경 이유
- `src/app/api/planning/v3/news/items/route.ts`가 SQLite query, trend artifact read, row mapping을 직접 소유해 route/data ownership 경계가 약했습니다.
- route는 auth, guard, query normalize, response mapping만 담당하고, DB 접근은 service/repository 계층으로 이동해야 합니다.

## 핵심 변경
- `newsItemsRepository`를 추가해 news sqlite query, burst trend lookup, item/topic/source facet mapping을 담당하게 했습니다.
- `news/items` route에서 `openNewsDatabase`, `closeNewsDatabase`, `readNewsTopicTrends`, raw SQL query를 제거했습니다.
- 기존 `GET items` 필터/whitelist 응답 계약은 유지했습니다.
- news API 테스트에 items route가 repository query boundary 뒤에 있는지 확인하는 정적 계약을 추가했습니다.
- planning route coverage에 direct DB query 대표 패턴(`openNewsDatabase`, `db.prepare`, `FROM news_items` 등)을 금지 목록으로 추가했습니다.

## 검증
- PASS `corepack pnpm test tests/planning-v3-news-api.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- PASS `corepack pnpm lint`
- PASS `corepack pnpm build`
- PASS `corepack pnpm planning:auth:check`

## 남은 리스크
- Spark 정적 확인 기준으로 `/api/planning/v3/news/items`의 비테스트 frontend 소비자는 보이지 않았습니다.
- `search/route.ts`처럼 일부 news route에는 아직 `lib/planning/v3/news/*` 도메인 모듈 직접 import와 service import가 섞여 있습니다.
- `ops/doctor`, `ops/runs`, `ops/planning-cache/*`의 운영자용 direct repository/namespace import는 여전히 후속 ownership 후보입니다.
- 사용자 흐름이나 셀렉터 변경은 없어 e2e는 실행하지 않았습니다.

## 다음 라운드
- 이어지는 작업자는 이 기록의 남은 리스크와 검증 필요 항목을 기준으로 후속 scope를 좁힙니다.
