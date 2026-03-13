# 2026-03-09 대시보드/내비 사용자 중심 정리

## 변경 파일
- `src/components/DashboardClient.tsx`
- `src/app/dashboard/page.tsx`
- `src/components/SiteHeader.tsx`
- `src/components/ui/MobileBottomNav.tsx`
- `src/components/home/QuickTiles.tsx`

## 변경 이유
- `/dashboard`가 사용자용 화면인데 실제로는 `/api/dev/*` 중심 운영 화면 성격이 강해 기대와 맞지 않았음
- 헤더와 모바일 내비에서 사용자 경로와 운영 경로가 섞여 비전문가 사용자가 길을 잃기 쉬웠음
- 현재 저장소의 플래닝 실행 기록, 혜택 스냅샷, 환율, 데이터 소스 freshness를 사용자 관점에서 바로 활용할 수 있는 허브가 필요했음

## 적용 내용
- `/dashboard`를 사용자용 브리핑 화면으로 재구성
- 최근 플랜 요약, 다음 행동, 혜택/환율 상태, 데이터 연결 상태, 최근 실행 기록을 한 화면에 배치
- 헤더/모바일 내비에서 `/dashboard`를 사용자용 `브리핑`으로 노출하고 `/ops` 기본 노출은 제거
- 공개 대시보드에서는 `onlyDev()` 가드가 있는 `/api/planning/v2/runs`, `/api/products/candidates` 직접 호출을 제거
- 최근 실행 기록은 서버에서 직접 주입하고, 상품 후보는 저장된 run outputs 안의 action candidates를 안전하게 재사용

## 검증
- `pnpm exec eslint src/components/DashboardClient.tsx src/app/dashboard/page.tsx src/components/SiteHeader.tsx src/components/ui/MobileBottomNav.tsx`
- `pnpm test`
- `pnpm build`

## 남은 리스크
- 최신 run outputs 안에 candidate 정보가 없는 경우 대시보드 상품 후보 영역은 빈 상태 CTA로만 동작함
- planning/report 계열 다른 화면 일부는 아직 `/api/products/candidates` 같은 local-only 라우트를 직접 쓰고 있을 수 있음
- `/ops`는 직접 경로 진입 기준으로는 계속 사용 가능하므로 완전한 권한 분리는 별도 과제

## 2차 후속 정리: user-facing planning API same-origin 전환

### 추가 변경 파일
- `src/app/api/products/candidates/route.ts`
- `src/app/api/planning/v2/profiles/route.ts`
- `src/app/api/planning/v2/profiles/[id]/route.ts`
- `src/app/api/planning/v2/assumptions/snapshots/route.ts`
- `src/app/api/planning/v2/runs/route.ts`
- `src/app/api/planning/v2/runs/[id]/route.ts`
- `src/app/api/planning/v2/runs/[id]/action-plan/route.ts`
- `src/app/api/planning/v2/runs/[id]/action-progress/route.ts`
- `src/app/api/planning/v2/runs/[id]/blob/[name]/route.ts`
- `src/app/api/planning/v2/runs/[id]/export/route.ts`
- `src/app/api/planning/v2/runs/[id]/report/route.ts`
- `src/app/api/planning/v2/runs/[id]/report.pdf/route.ts`
- `src/app/api/planning/v2/reports/route.ts`
- `src/app/api/planning/v2/reports/[id]/route.ts`
- `src/app/api/planning/v2/reports/[id]/download/route.ts`
- `src/app/api/planning/v2/trash/route.ts`
- `src/app/api/planning/v2/trash/restore/route.ts`
- `src/app/api/planning/v2/trash/empty/route.ts`
- `src/app/api/planning/v2/actions/route.ts`
- `src/app/api/planning/v2/simulate/route.ts`
- `src/app/api/planning/v2/scenarios/route.ts`
- `src/app/api/planning/v2/debt-strategy/route.ts`
- `src/app/api/planning/v2/optimize/route.ts`
- `src/app/api/planning/v2/share-report/route.ts`
- `src/app/api/planning/v2/share-report/[id]/download/route.ts`

### 변경 이유
- `/planning`, `/planning/reports`, `/planning/runs` 같은 실제 사용자 화면이 여전히 `onlyDev()` 또는 `assertLocalHost()`에 묶인 v2 API를 직접 호출하고 있었음
- localhost 전용 제약 때문에 same-origin production 환경에서도 저장/조회/계산/공유 흐름이 끊길 수 있었음
- 운영/디버그 전용 API와 달리, 위 경로들은 사용자 핵심 흐름에 속하므로 `same-origin + csrf` 기준으로 노출하는 편이 제품 의도에 맞음

### 적용 내용
- user-facing 읽기 API는 `assertSameOrigin()` 기준으로 전환
- user-facing 쓰기 API는 `assertSameOrigin()`을 기본으로 두고, 기존 csrf 쿠키 흐름은 유지
- `onlyDev()`와 `assertLocalHost()`에 묶여 있던 profiles/runs/reports/trash/share-report/products-candidates 경로를 same-origin으로 열었음
- `/planning` 워크스페이스의 계산 경로인 `simulate`, `scenarios`, `actions`, `debt-strategy`, `optimize`도 same-origin 기준으로 전환
- 회귀 테스트는 예전 `LOCAL_ONLY` 기대 대신 `same-origin 허용 / cross-origin 차단` 기준으로 갱신

### 추가 검증
- `pnpm test`
- `pnpm lint`
- `pnpm build`

### 남은 리스크
- `share-report`와 계산 API는 사용자 경로 기준으로 열었지만, 장기적으로는 페이지/서버 경계 주입으로 더 줄일 수 있음
- `planning/v3` 계열과 일부 실험/debug 경로는 여전히 local-only/dev-only가 남아 있으며, 사용자 공개 범위와 분리 기준을 더 정리해야 함
- `/ops`, `/api/dev/*`는 그대로 남아 있으므로 사용자/운영 완전 분리는 계속 과제임

## 3차 후속 정리: planning/v3 사용자 경로 same-origin 전환

### 추가 변경 파일
- `src/app/api/planning/v3/profile/drafts/route.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/route.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/apply/route.ts`
- `src/app/api/planning/v3/profile/drafts/[id]/preflight/route.ts`
- `src/app/api/planning/v3/profile/draft/route.ts`
- `src/app/api/planning/v3/profiles/route.ts`
- `src/app/api/planning/v3/accounts/route.ts`
- `src/app/api/planning/v3/accounts/[id]/route.ts`
- `src/app/api/planning/v3/accounts/[id]/starting-balance/route.ts`
- `src/app/api/planning/v3/opening-balances/route.ts`
- `src/app/api/planning/v3/balances/monthly/route.ts`
- `src/app/api/planning/v3/drafts/route.ts`
- `src/app/api/planning/v3/drafts/[id]/route.ts`
- `src/app/api/planning/v3/drafts/[id]/create-profile/route.ts`
- `src/app/api/planning/v3/draft/apply/route.ts`
- `src/app/api/planning/v3/draft/preview/route.ts`
- `src/app/api/planning/v3/draft/scenario/route.ts`
- `src/app/api/planning/v3/batches/route.ts`
- `src/app/api/planning/v3/batches/[id]/summary/route.ts`
- `src/app/api/planning/v3/batches/import/csv/route.ts`
- `src/app/api/planning/v3/transactions/batches/route.ts`
- `src/app/api/planning/v3/transactions/batches/[id]/route.ts`
- `src/app/api/planning/v3/transactions/batches/import-csv/route.ts`
- `src/app/api/planning/v3/transactions/import/csv/route.ts`

### 변경 이유
- `/planning/v3/profile/drafts`, `/planning/v3/accounts`, `/planning/v3/balances`, `/planning/v3/import/csv`, `/planning/v3/transactions/batches` 같은 실제 사용자 화면이 여전히 localhost/dev-only guard에 묶여 있었음
- v3는 온보딩 이후 실제 데이터 정리와 프로필 초안 생성 흐름을 담당하므로, same-origin production 환경에서도 사용자 흐름이 유지돼야 함

### 적용 내용
- 위 user-facing v3 route에서 `onlyDev()`와 `assertLocalHost()`를 제거
- 읽기/쓰기 모두 `assertSameOrigin()` + 기존 `requireCsrf(..., { allowWhenCookieMissing: true })` 흐름으로 통일
- profile draft/detail/preflight/apply, accounts/opening balances/monthly balances, drafts/import/batches 경로를 same-origin 사용자 경로로 전환
- 회귀 테스트도 `LOCAL_ONLY` 대신 `same-origin 허용 / cross-origin 차단` 기준으로 갱신

### 추가 검증
- `pnpm test`
- `pnpm lint`
- `pnpm build`

### 남은 리스크
- `planning/v3/news`, `journal`, `exposure`, `indicators/settings` 계열은 아직 local-only/dev-only가 남아 있음
- v3 내부에서도 사용자 경로와 운영/실험 경로가 완전히 분리된 것은 아니므로, 다음 단계는 news/journal 쪽 실제 사용자 공개 범위를 다시 나눠야 함
- 일부 화면은 여전히 client fetch 중심이라, 장기적으로는 page/server 경계 주입으로 더 줄일 수 있음

## 4차 후속 정리: news/journal/exposure same-origin 전환 + 사용자형 UI 재구성

### 추가 변경 파일
- `src/app/api/planning/v3/exposure/profile/route.ts`
- `src/app/api/planning/v3/journal/entries/route.ts`
- `src/app/api/planning/v3/journal/entries/[id]/route.ts`
- `src/app/api/planning/v3/routines/daily/route.ts`
- `src/app/api/planning/v3/news/settings/route.ts`
- `src/app/api/planning/v3/news/sources/route.ts`
- `src/app/api/planning/v3/indicators/specs/route.ts`
- `src/app/api/planning/v3/news/today/route.ts`
- `src/app/api/planning/v3/news/digest/route.ts`
- `src/app/api/planning/v3/news/scenarios/route.ts`
- `src/app/api/planning/v3/news/search/route.ts`
- `src/app/api/planning/v3/news/trends/route.ts`
- `src/app/api/planning/v3/news/alerts/route.ts`
- `src/app/api/planning/v3/news/refresh/route.ts`
- `src/app/api/planning/v3/news/recovery/route.ts`
- `src/app/api/planning/v3/news/weekly-plan/route.ts`
- `src/app/api/planning/v3/news/_components/NewsTodayClient.tsx`
- `src/app/planning/v3/news/_components/NewsSettingsClient.tsx`
- `src/app/planning/v3/journal/JournalClient.tsx`
- `src/app/planning/v3/exposure/_components/ExposureProfileClient.tsx`
- `src/app/api/planning/v3/news/exposure/route.ts`
- `src/app/api/planning/v3/news/items/route.ts`
- `src/app/api/planning/v3/news/notes/route.ts`
- `src/app/api/planning/v3/news/notes/[noteId]/route.ts`
- `src/app/api/planning/v3/news/alerts/rules/route.ts`
- `tests/planning-v3-write-route-guards.test.ts`
- `tests/planning-v3-exposure-api.test.ts`
- `tests/planning-v3-journal-api.test.ts`
- `tests/planning-v3-routines-api.test.ts`
- `tests/planning-v3-news-api.test.ts`
- `tests/planning-v3-news-search-api.test.ts`
- `tests/planning-v3-news-alerts-api.test.ts`
- `tests/planning-v3-news-weekly-plan-api.test.ts`

### 변경 이유
- `/planning/v3/news`, `/planning/v3/news/settings`, `/planning/v3/journal`, `/planning/v3/exposure`가 실제 사용자 페이지인데도 일부 API가 localhost/dev-only guard에 묶여 있어 same-origin production 흐름이 끊길 수 있었음
- 네 화면 모두 상태 요약보다 긴 폼과 세부 설정이 먼저 보여 비전문가 사용자가 “지금 뭘 해야 하는지”를 파악하기 어려웠음
- 반대로 `news/items`, `news/notes`, `news/exposure`, `news/alerts/rules` 같은 비사용/실험 경로는 사용자 공개 범위에 포함시키면 범위가 과도하게 넓어짐

### 적용 내용
- 실제 사용자 화면이 직접 호출하는 news/journal/exposure/settings API는 `same-origin + requireCsrf(..., { allowWhenCookieMissing: true })` 기준으로 전환
- `news/items`, `news/notes`, `news/exposure`, `news/alerts/rules`는 다시 `onlyDev + assertLocalHost + dev unlock` 쪽으로 되돌려 사용자 공개 범위를 좁힘
- `NewsTodayClient`는 상단을 `오늘 요약 → 다음 행동 → 상세 watch/scenario → 고급 작업` 순서로 재배치하고, 요약 카드와 빠른 이동을 추가
- `NewsSettingsClient`, `JournalClient`, `ExposureProfileClient`는 이미 준비된 요약 카드/앵커 구조를 유지하면서 사용자 문구와 단계 구분을 강화
- 회귀 테스트는 `LOCAL_ONLY/UNAUTHORIZED` 기대를 사용자 경로 기준 `same-origin 허용 / cross-origin 차단 / dev 경로는 유지`로 갱신

### 추가 검증
- `pnpm test tests/planning-v3-write-route-guards.test.ts tests/planning-v3-exposure-api.test.ts tests/planning-v3-journal-api.test.ts tests/planning-v3-routines-api.test.ts tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts tests/news-exposure-api.test.ts tests/planning-v3-news-notes-api.test.ts`
- `pnpm lint`
- `pnpm build`
- `pnpm test`

### 남은 리스크
- `next build`는 성공했지만 standalone trace 복사 단계에서 `.data/planning/runs/index.json` 누락 경고가 여전히 남음. 현재도 exit code는 0이지만 배포 번들 완결성 관점에서는 별도 정리가 필요함
- `planning/v3/news/explore`, `trends`, `alerts`는 API 경계는 열렸지만 화면 자체는 아직 요약형 UX 개편을 덜 받았음
- `planning/v3/news` 일부 고급 작업은 여전히 일반 사용자에게는 어렵기 때문에, 장기적으로는 관리자성 기능을 더 숨기거나 `/ops`로 분리하는 편이 맞음

## 5차 후속 정리: finlife schema-report trace 경고 제거 + news settings 저장 UX 보정

### 추가 변경 파일
- `src/app/api/dev/finlife/schema-report/route.ts`
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`

### 변경 이유
- `/api/dev/finlife/schema-report`가 standalone build에서 `.data/*` 전체를 trace하면서 `.data/planning/runs/index.json` 누락 경고를 유발하고 있었음
- `NewsSettingsClient`는 저장 기준선이 기본값 기준으로 계산돼, 이미 저장된 override가 있어도 dirty 상태가 남을 수 있었음
- 같은 화면에서 `내 상황 프로필`보다 소스/토픽이 먼저 나오고, 저장 버튼이 상단에만 있어 긴 편집 흐름에 비해 사용자 피로가 컸음

### 적용 내용
- `schema-report` route에서 공용 `onlyDev`/`schemaReport` import를 제거하고, route 내부에 필요한 최소 로직만 인라인해 build trace 범위를 축소
- fixture 경로도 dev route 기준의 고정 fallback(`tmp/finlife-fixtures`)을 사용하도록 단순화
- `NewsSettingsClient`에 `initialSourceDrafts`, `initialTopicDrafts` 기준선을 추가해 실제 저장된 상태와 현재 입력을 비교하도록 수정
- 저장 순서가 `뉴스 기준 -> 내 상황 프로필`인 점을 사용자에게 드러내도록 부분 성공 문구를 분리
- 편집 섹션 순서를 `내 상황 프로필 -> 소스 우선순위 -> 토픽 키워드 -> 고급 관리`로 재배치하고, 하단 저장 바를 추가

### 추가 검증
- `pnpm test tests/finlife-schema-report.test.ts`
- `pnpm test tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts tests/planning-v3-news-weekly-plan-api.test.ts`
- `pnpm lint`
- `pnpm build`
- `.next/server/app/api/dev/finlife/schema-report/route.js.nft.json` 확인: `.data/*` trace `0`

### 남은 리스크
- `NewsSettingsClient`의 저장은 여전히 두 API를 순차 호출하므로, 장기적으로는 서버 단일 endpoint 또는 transaction성 응답으로 합치는 편이 더 명확함
- `planning/v3/news/explore`, `trends`, `alerts`는 이번 라운드의 저장 UX 정리 범위에는 포함되지 않았음

## 6차 후속 정리: news explore/trends/alerts 사용자형 요약 UX 적용

### 추가 변경 파일
- `src/app/planning/v3/news/_components/NewsExploreClient.tsx`
- `src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx`
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`

### 변경 이유
- 세 화면 모두 API는 same-origin 사용자 경로로 열려 있지만, 제목/설명/결과 표현이 내부 분석 도구 관점에 가까워 비전문가 사용자가 바로 이해하기 어려웠음
- 결과 없음 상태에서 다음 행동이 없어 탐색 흐름이 끊겼음
- score, burst grade, targetId 같은 내부 성격 값이 사용자 해석보다 앞에 노출되고 있었음

### 적용 내용
- `explore`는 상단 제목과 문구를 사용자 언어로 바꾸고, 결과 수/적용 필터/자주 잡힌 흐름 요약 카드를 추가
- `explore` 검색 결과는 제목 위에 한 줄 해석을 두고, 내부 점수는 보조 정보로 뒤로 이동
- `trends`는 `최근 이슈 흐름` 기준의 상단 요약 카드와 빈 상태 CTA를 추가하고, 표의 burst 문구를 `급증 강함/보통/약함`으로 정리
- `alerts`는 중요도 상 건수/누적 이벤트/최근 알림 요약 카드를 추가하고, 각 이벤트에 한 줄 해석을 넣어 먼저 읽을 포인트를 명확히 함
- 세 화면 모두 빈 상태에서 바로 `흐름 보기`, `뉴스 탐색`, `설정`으로 이어지는 CTA를 추가

### 추가 검증
- `pnpm test tests/planning-v3-news-api.test.ts tests/planning-v3-news-search-api.test.ts tests/planning-v3-news-alerts-api.test.ts`
- `pnpm lint`
- `pnpm build`

### 남은 리스크
- `trends`는 여전히 표 중심 화면이라, 장기적으로는 `NewsTrendsClient` 계열을 정리해 단일 컴포넌트로 합치는 편이 관리에 유리함
- `alerts`는 읽기 전용이므로, 추후에는 확인 완료/숨김 같은 사용자 액션이 필요할 수 있음

## 7차 후속 정리: trends 진입점 단일화 + alerts 로컬 필터 추가

### 추가 변경 파일
- `src/app/planning/v3/news/_components/NewsTrendsClient.tsx`
- `src/app/planning/v3/news/trends/page.tsx`
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`

### 변경 이유
- `/planning/v3/news/trends`는 실제 페이지에서 `NewsTrendsTableClient`를 쓰는데, 별도로 `NewsTrendsClient`가 같은 API를 다시 감싸고 있어 유지보수 지점이 이원화돼 있었음
- `alerts`는 요약은 좋아졌지만 여전히 긴 목록을 그대로 읽어야 해서, 사용자가 중요도/출처 기준으로 바로 좁혀보기가 어려웠음

### 적용 내용
- `NewsTrendsClient`를 `NewsTrendsTableClient` 래퍼로 축소하고, 실제 page도 `NewsTrendsClient`를 사용하도록 바꿔 trends 진입점을 하나로 통일
- `alerts`에 중요도/출처 기준의 빠른 필터를 추가하고, 필터 결과 건수를 상단에 표시
- 필터 적용 후 결과가 없는 경우를 별도 빈 상태로 분리해 `필터 전체 해제`와 `최근 흐름 보기` CTA를 제공

### 추가 검증
- `pnpm test tests/planning-v3-news-api.test.ts tests/planning-v3-news-alerts-api.test.ts`
- `pnpm lint`
- `pnpm build`

### 남은 리스크
- `alerts`는 아직 로컬 필터만 있고 서버 저장 상태(확인 완료/보관/숨김)는 없음
- `NewsTrendsTableClient` 자체는 단일 진입점이 됐지만, 장기적으로는 차트/표/요약 블록을 더 작은 하위 컴포넌트로 분리할 여지가 있음

## 8차 후속 정리: alerts 확인 완료/숨김 상태 저장 추가

### 추가 변경 파일
- `src/lib/news/alerts.ts`
- `src/app/api/planning/v3/news/alerts/route.ts`
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
- `src/app/planning/v3/news/alerts/page.tsx`
- `tests/planning-v3-news-alerts-api.test.ts`
- `tests/planning-v3-write-route-guards.test.ts`

### 변경 이유
- `alerts`는 빠른 필터까지는 생겼지만, 사용자가 이미 본 알림과 나중에 볼 알림을 구분해 두는 저장 동작이 없어 같은 목록을 반복해서 읽게 됐음
- 같은 화면에서 `확인 완료`, `숨김`, `숨김 해제` 같은 최소 액션이 없어서 실제 브리핑 도구로 쓰기에는 정리감이 부족했음

### 적용 내용
- alerts 데이터 디렉터리에 `event-state.json` 저장소를 추가하고, 이벤트 `id` 기준으로 `acknowledgedAt`, `hiddenAt` 상태를 저장하도록 구현
- `/api/planning/v3/news/alerts`는 GET 응답에 상태를 병합해 내려주고, same-origin + csrf 기준의 POST로 `ack/unack/hide/unhide`를 처리하도록 확장
- `NewsAlertsClient`는 `표시중 / 미확인 / 확인 완료 / 숨김` 상태 필터를 추가하고, 각 알림에서 바로 `확인 완료`, `미확인으로 되돌리기`, `숨기기`, `숨김 해제`를 실행할 수 있게 수정
- alerts page에서 csrf 쿠키를 클라이언트로 전달해 session storage가 비어 있어도 쓰기 액션이 막히지 않도록 연결
- API 테스트에 상태 저장 회귀를 추가하고, write route guard 테스트에 `news/alerts`를 same-origin 사용자 write route로 등록

### 추가 검증
- `pnpm test tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-api.test.ts`
- `pnpm lint`
- `pnpm build`

### 남은 리스크
- 알림 상태는 현재 단일 로컬 저장소 기준이라 사용자 계정 단위 동기화는 없음
- `alerts`는 상태 저장이 붙었지만, 상단 카드/카운트는 여전히 로컬 집계라 장기적으로는 서버 요약 필드로 분리할 수 있음

## 9차 후속 정리: alerts 상태 저장 범위 보강 + 서버 summary 응답화

### 추가 변경 파일
- `src/lib/news/alerts.ts`
- `src/app/api/planning/v3/news/alerts/route.ts`
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
- `tests/news-alerts.test.ts`
- `tests/planning-v3-news-alerts-api.test.ts`

### 변경 이유
- alerts 상태 저장은 이전 라운드까지 전역 로컬 파일 기준이라, planning user namespace를 쓰는 환경에서는 사용자 구분이 약했음
- alerts 상단 카드 집계가 전부 클라이언트 계산이라, 서버 응답과 화면 표시가 분리돼 유지보수 포인트가 남아 있었음

### 적용 내용
- `event-state.json`은 planning namespace가 활성화된 경우 `.data/planning/users/{userId}/news/alerts` 아래에 저장되도록 바꾸고, 기존 전역 파일은 읽기 fallback 후 새 경로로 자동 rewrite 하도록 호환 처리
- `/api/planning/v3/news/alerts` 응답에 `summary` 블록을 추가해 `high/pending/acknowledged/hidden/latestVisible` 집계를 서버에서 함께 계산
- `NewsAlertsClient`는 상단 카드 표시를 서버 `summary` 기준으로 전환해, 화면 집계와 API 결과가 어긋나지 않도록 정리
- 테스트에 namespace migration과 summary 응답 회귀를 추가

### 추가 검증
- `pnpm test tests/news-alerts.test.ts tests/planning-v3-news-alerts-api.test.ts tests/planning-v3-news-api.test.ts`
- `pnpm lint`
- `pnpm build`

### 남은 리스크
- namespace가 꺼진 기본 환경에서는 여전히 단일 사용자 로컬 저장소로 동작함
- alerts 상태는 user namespace 기준까지는 정리됐지만, 별도 로그인 계정/원격 동기화 기능 자체를 새로 추가한 것은 아님

## 10차 후속 정리: report 화면 기준 UI 톤 통일

### 추가 변경 파일
- `src/components/ui/ReportTone.tsx`
- `src/components/HomePortalClient.tsx`
- `src/components/DashboardClient.tsx`
- `src/app/planning/v3/news/_components/NewsTodayClient.tsx`
- `src/app/planning/v3/news/_components/NewsExploreClient.tsx`
- `src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx`
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `src/app/planning/v3/exposure/_components/ExposureProfileClient.tsx`
- `src/app/planning/v3/journal/JournalClient.tsx`

### 변경 이유
- 홈, 브리핑, 뉴스, 저널, 노출 프로필 화면이 각각 다른 배경/카드/액션 스타일을 사용하고 있어 report 화면 대비 통일성이 약했음
- 사용자가 `리포트에서 보던 기준선`을 다른 페이지에서도 그대로 따라갈 수 있도록 상단 정보 구조와 톤을 맞출 필요가 있었음

### 적용 내용
- report 계열 hero 패턴을 재사용할 수 있도록 `ReportHeroCard`, `ReportHeroStatGrid`, `ReportHeroStatCard` 공용 컴포넌트를 추가
- `dashboard` 상단은 `PageHeader + StatCard + 별도 hero` 조합을 없애고, report 톤 hero 하나에서 최근 실행, 핵심 수치, 연결 상태, 경고를 함께 보이도록 정리
- `home`, `news today/explore/trends/alerts`, `news settings`, `exposure`, `journal` 상단을 같은 dark hero + glass stat card 패턴으로 맞춤
- hero 내부 액션 링크와 버튼은 흰색 기준으로 다시 조정해, 밝은 배경용 녹색/회색 액션이 섞여 보이던 문제를 정리

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- report 톤은 상단 정보 구조 중심으로 통일했고, 각 페이지의 하단 카드/표/폼까지 전부 같은 시각 언어로 재정리한 것은 아님
- `planning/reports` 자체의 세부 토큰을 별도 theme object로 추출하지는 않았으므로, 장기적으로는 공용 design token 층으로 한 번 더 묶을 수 있음

## 11차 후속 정리: planning v3 보조 화면 상단 톤 보강

### 추가 변경 파일
- `src/app/planning/v3/accounts/_components/AccountsClient.tsx`
- `src/app/planning/v3/balances/_components/BalancesClient.tsx`
- `src/app/planning/v3/scenarios/_components/ScenarioLibraryClient.tsx`

### 변경 이유
- report 톤 통일 이후에도 `accounts`, `balances`, `scenario library`는 여전히 예전 단순 카드 헤더와 직접 작성한 버튼/입력 스타일을 유지하고 있어 사용자 흐름 안에서 톤이 튀었음

### 적용 내용
- 세 화면의 상단을 `ReportHeroCard + ReportHeroStatGrid` 기준으로 재구성해 핵심 수치와 다음 이동 경로를 같은 문법으로 정리
- `accounts`는 계좌 수, opening balance 입력 수, 메모 포함 수를 요약하고 본문 input/row 스타일을 `rounded-xl` 기준으로 정돈
- `balances`는 조회 조건을 hero 아래 별도 카드로 분리하고, 상단에서는 계좌 수/배치 수/선택 배치/행 수를 먼저 보이도록 정리
- `scenario library`는 활성 템플릿 수와 저장 상태를 hero에 올리고, 순서 이동 버튼도 공용 `Button` 규칙으로 통일

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- `planning/v3/drafts`, `import`, `transactions detail` 계열은 아직 본문 하단에 직접 작성한 light card/underline action 패턴이 남아 있음
- 다음 라운드에서는 상단 hero 이후의 본문 section/card 규칙까지 공용 층으로 묶는 편이 좋음

## 12차 후속 정리: 본문 공용 tone 레이어 시작

### 추가 변경 파일
- `src/components/ui/BodyTone.tsx`
- `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`
- `src/app/planning/v3/import/_components/ImportCsvClient.tsx`
- `src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx`

### 변경 이유
- 상단 hero는 맞췄지만, drafts/import/transaction detail 본문에서는 underline 링크, light inset panel, table wrapper를 각 파일마다 직접 반복하고 있어 통일감이 약했음

### 적용 내용
- `BodyActionLink`, `BodyInset`, `BodyTableFrame` 공용 컴포넌트를 추가해 본문용 최소 tone 레이어를 시작
- `drafts`의 CSV 업로드 블록, 상세 링크, 목록 테이블 wrapper를 공용 본문 컴포넌트로 전환
- `import`의 업로드/검증/실패요약 블록과 배치/초안 이동 링크, 미리보기/결과 테이블 wrapper를 공용 본문 규칙으로 전환
- `transaction batch detail`의 상단 이동 링크와 주요 표 wrapper, 요약 inset을 공용 본문 규칙으로 전환

### 추가 검증
- `pnpm test`
- `pnpm build`
- `pnpm lint`

### 남은 리스크
- `transactions detail` 내부에는 여전히 개별 select/input row 스타일이 많이 남아 있어, 다음 단계는 form control 레벨 공용화가 필요함
- `draft detail`, `profile drafts`, `import result` 일부 섹션도 아직 완전히 같은 본문 규칙으로 묶이지 않았음

## 13차 후속 정리: 본문 입력 필드와 섹션 헤더 톤 정리

### 추가 변경 파일
- `src/components/ui/BodyTone.tsx`
- `src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx`
- `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
- `src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx`

### 변경 이유
- 상단 hero와 일부 본문 래퍼는 맞췄지만, 실제 사용자가 많이 만지는 입력 필드, select, section heading은 화면마다 밀도와 톤이 달라 여전히 들쭉날쭉해 보였음

### 적용 내용
- `BodyTone`에 `BodySectionHeading`과 본문용 `field/compact-field/label/choice-row` 토큰을 추가
- `draft detail`의 돌아가기 링크, 기준 프로필 select, diff inset, section heading을 공용 본문 규칙으로 전환
- `profile drafts`의 batchId 입력, 상단 액션 링크, 목록 table frame, row action link를 공용 본문 규칙으로 전환하고 삭제 dialog 패널 밀도를 정리
- `transaction batch detail`의 계좌 선택, 거래별 select, split mode radio/checkbox, ratio input, 주요 section heading을 공용 본문 규칙으로 전환

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 이번 라운드는 form control과 heading 중심 정리이며, 본문 card 내부의 세부 spacing 규칙까지 전부 공용화한 것은 아님
- `import result`, `profile draft preflight`, 일부 modal/empty state는 아직 같은 기준의 surface/spacing 토큰으로 완전히 묶이지 않았음

## 14차 후속 정리: import 결과와 preflight 빈 상태 정리

### 추가 변경 파일
- `src/components/ui/BodyTone.tsx`
- `src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx`
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
- `src/app/planning/v3/import/_components/ImportCsvClient.tsx`
- `src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx`

### 변경 이유
- `import 결과`와 `preflight` 계열 화면은 아직 실행 전/결과 없음/변경 없음 상태를 각자 다른 문법으로 보여주고 있어 report 기준의 본문 톤이 끊겼음

### 적용 내용
- `BodyTone`에 본문용 경량 빈 상태 컴포넌트 `BodyEmptyState`를 추가
- `profile draft preflight` 전용 페이지는 상단 이동 링크, 프로필 입력 필드, 오류/경고 surface, 변경 표 wrapper, 실행 전/변경 없음 상태를 공용 본문 규칙으로 전환
- `profile draft detail` 내부 preflight 요약도 같은 방식으로 맞춰 summary / errors / warnings / changes 블록의 톤을 전용 페이지와 통일
- `import 결과` 화면은 결과 요약과 월별 cashflow 섹션에 section heading과 빈 상태 규칙을 적용했고, `csv upload` 상단 이동 링크도 공용 액션 링크로 정리

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- `import` 본문 상단의 매핑 편집 영역과 textarea/input 조합은 아직 개별 spacing 규칙이 남아 있음
- `preflight` 계열의 badge/alert 색상 표현은 통일됐지만, 장기적으로는 severity token 수준으로 한 번 더 묶을 수 있음

## 15차 후속 정리: import 매핑 입력과 severity token 정리

### 추가 변경 파일
- `src/components/ui/BodyTone.tsx`
- `src/app/planning/v3/import/_components/ImportCsvClient.tsx`
- `src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx`
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`

### 변경 이유
- `import` 상단 매핑 편집은 여전히 textarea/select/radio 밀도가 제각각이었고, `preflight`의 오류/경고 박스도 페이지별로 직접 색상을 써서 token 레벨 통일이 부족했음

### 적용 내용
- `BodyTone`에 `bodyTextAreaClassName`과 severity용 `BodyStatusInset`을 추가
- `import` 화면의 파일 선택, CSV textarea, 매핑 select, 금액 모드 radio row, 저장 계좌 select를 공용 field/choice token으로 정리
- `import`의 direct import 에러, 매핑 검증 결과, preview 실패 요약을 `BodyStatusInset` 기준으로 전환
- `profile draft preflight` 전용 페이지와 상세 페이지 내부 preflight 모두 오류/경고 블록을 같은 severity token으로 전환

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 현재 가장 큰 불일치는 일부 dialog/card 내부의 spacing과 action row 배치임
- 다음 라운드에서는 modal, confirm panel, dense table action row를 `BodyTone`의 마지막 공용 층으로 묶는 편이 좋음

## 16차 후속 정리: modal surface와 dense action row 정리

### 추가 변경 파일
- `src/components/ui/BodyTone.tsx`
- `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
- `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`
- `src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx`

### 변경 이유
- 사용자형 `planning v3` 화면에서 남은 시각적 불일치가 삭제 확인 dialog와 표 내부 action row 묶음에 집중돼 있었음

### 적용 내용
- `BodyTone`에 `BodyDialogSurface`, `bodyDialogActionsClassName`, `bodyDenseActionRowClassName`을 추가
- `profile drafts`와 `drafts list`의 삭제 dialog를 같은 modal surface와 버튼 정렬 규칙으로 통일
- `profile drafts`, `drafts list`, `transaction batch detail`의 dense action row를 같은 wrapping/spacing 규칙으로 정리

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- user-facing 화면 기준으로는 이제 큰 surface 불일치보다 세부 link 문법과 일부 micro spacing이 더 많이 남음
- 다음 라운드는 `/planning/v3/profile/draft`, `/planning/v3/batches`, `/planning/v3/transactions` 계열의 남은 raw link와 본문 spacing을 정리하는 편이 좋음

## 17차 후속 정리: profile draft/batches/transactions raw link와 wrapper 정리

### 추가 변경 파일
- `src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx`
- `src/app/planning/v3/batches/_components/BatchesCenterClient.tsx`
- `src/app/planning/v3/batches/[id]/_components/BatchSummaryClient.tsx`
- `src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx`

### 변경 이유
- 남아 있던 들쭉날쭉함이 개별 페이지의 raw underline link, 표 wrapper, dense action row에 집중돼 있었음

### 적용 내용
- `profile draft from batch`의 상단 이동 링크와 evidence 표 wrapper를 `BodyActionLink`, `BodyTableFrame`으로 전환
- `batch center`의 상단 이동 링크, 배치 목록 wrapper, 행 액션 묶음을 공용 본문 규칙으로 정리
- `batch summary`의 상단 이동 링크, 생성/새로고침 action row, 섹션 제목, 월별 요약 표, 빈 상태를 공용 토큰으로 통일
- `transactions batch list`의 업로드 폼 field, 에러 안내, 배치 표 wrapper, 이동 링크를 `BodyTone` 기준으로 정리

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- user-facing `planning v3` 기준의 큰 톤 차이는 많이 줄었지만, 일부 보조 페이지와 hero 내부 white link 계열은 아직 전용 스타일이 남아 있을 수 있음
- 다음 라운드는 남은 raw link를 전수 탐색하기보다, 공용 surface를 우선 적용하지 않은 보조 화면부터 좁혀서 정리하는 편이 안전함

## 18차 후속 정리: body link group과 news hero white-link 통일

### 추가 변경 파일
- `src/components/ui/BodyTone.tsx`
- `src/components/ui/ReportTone.tsx`
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
- `src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx`
- `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
- `src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx`
- `src/app/planning/v3/batches/[id]/_components/BatchSummaryClient.tsx`
- `src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx`
- `src/app/planning/v3/news/_components/NewsTodayClient.tsx`
- `src/app/planning/v3/news/_components/NewsExploreClient.tsx`
- `src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx`
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`

### 변경 이유
- user-facing `planning v3`에서 detail/preflight 화면의 링크 그룹과 news hero 내부 white-link가 페이지별 개별 클래스에 묶여 있어 통일감이 남아 있지 않았음

### 적용 내용
- `BodyTone`에 `bodyActionLinkGroupClassName`을 추가하고 `profile draft`, `profile draft detail`, `preflight`, `batch summary`, `drafts list` 상단 링크 그룹에 적용
- `ProfileDraftClient`의 raw underline link를 `BodyActionLink`로 바꾸고 action row도 공용 dense row로 정리
- `ReportTone`에 `reportHeroActionLinkClassName`, `reportHeroAnchorLinkClassName`을 추가
- `news today`, `explore`, `trends`, `alerts`의 hero 내부 이동 링크와 anchor chip을 report 기준 white-link 문법으로 통일

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- news hero의 기간/필터 토글 버튼은 여전히 화면별 상태 버튼 문법이 남아 있음
- 다음 라운드는 `dashboard`와 `news` hero 안의 stateful button/chip도 같은 규칙으로 추출하면 상단 UX 일관성이 더 좋아짐

## 19차 후속 정리: dashboard/news hero stateful button-chips 공통화

### 추가 변경 파일
- `src/components/ui/ReportTone.tsx`
- `src/components/DashboardClient.tsx`
- `src/app/planning/v3/news/_components/NewsTodayClient.tsx`
- `src/app/planning/v3/news/_components/NewsTrendsTableClient.tsx`
- `src/app/planning/v3/news/_components/NewsAlertsClient.tsx`

### 변경 이유
- hero 상단의 상태 버튼과 summary chip은 여전히 화면별 개별 클래스가 남아 있어 report 기준선과 완전히 맞지 않았음

### 적용 내용
- `ReportTone`에 `reportHeroPrimaryActionClassName`, `reportHeroMetaChipClassName`, `reportHeroToggleButtonClassName`, `reportHeroFilterChipClassName`을 추가
- `dashboard`의 새로고침/주요 CTA/meta chip을 공용 hero 토큰으로 정리
- `news today`의 갱신 버튼, `trends`의 기간 전환 버튼, `alerts`의 기간 전환/빠른 필터 chip을 같은 hero 토큰으로 통일

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 동일 계열의 hero/body 링크 패턴이 `accounts`, `balances`, `exposure`, `news settings`, `journal`, `scenario library`, `rules`, `news digest` 쪽에 일부 남아 있었음
- 다음 라운드는 이 잔여 패턴을 같은 `ReportTone`/`BodyTone` 규칙으로 정리하면 현재 추적 중인 user-facing 통일성 리스크를 닫을 수 있음

## 20차 후속 정리: 남은 user-facing hero/body 링크 패턴 정리

### 추가 변경 파일
- `src/app/planning/v3/accounts/_components/AccountsClient.tsx`
- `src/app/planning/v3/balances/_components/BalancesClient.tsx`
- `src/app/planning/v3/exposure/_components/ExposureProfileClient.tsx`
- `src/app/planning/v3/news/settings/_components/NewsSettingsClient.tsx`
- `src/app/planning/v3/journal/JournalClient.tsx`
- `src/app/planning/v3/scenarios/_components/ScenarioLibraryClient.tsx`
- `src/app/planning/v3/categories/rules/_components/RulesClient.tsx`
- `src/app/planning/v3/news/_components/NewsDigestClient.tsx`

### 변경 이유
- 동일한 사용자 경로 안에서 hero white-link, hero 저장 버튼, body 상단 raw underline link가 몇몇 보조 화면에 남아 있었음

### 적용 내용
- `accounts`, `balances`, `exposure`, `news settings`, `journal`, `scenario library`의 hero action을 `ReportTone` 토큰으로 전환
- `news settings`의 hero anchor chip도 `reportHeroAnchorLinkClassName`으로 통일
- `rules`, `news digest`의 상단 raw underline link를 `BodyActionLink`와 공용 action row로 전환
- 동일 패턴 grep을 다시 실행해 이번에 추적하던 user-facing 클래스 문법이 남지 않는 것을 확인

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 이번에 추적한 user-facing `planning v3` 상단 링크/hero 버튼/chip 클래스 불일치는 grep 기준으로 잔존 패턴이 없음
- 이후 개선 과제는 새로운 시각 리스크라기보다, 더 넓은 design system 확장 여부를 결정하는 제품 차원의 선택에 가까움

## 21차 후속 정리: planning reports/result guide/product candidates 본문 통일

### 추가 변경 파일
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/components/planning/ResultGuideSections.tsx`
- `src/components/planning/ProductCandidatesPanel.tsx`

### 변경 이유
- 멀티 에이전트 탐색 결과와 로컬 grep 기준으로, `planning reports`와 플래닝 결과 보조 패널 쪽에 raw field/table/empty-state/surface가 반복되고 있었음

### 적용 내용
- `PlanningReportsDashboardClient`의 실행 선택/기준 실행 select를 공용 compact field로 전환하고, 상세 링크/비교 섹션/delta 카드/summary 카드/warnings/goals/top-actions/advanced toggle을 `BodyTone` 기준으로 정리
- `ResultGuideSections`의 summary stat, top-actions inset, warnings/goals/timeline empty-state와 table wrapper를 공용 `BodyInset`, `BodyTableFrame`, `BodyEmptyState`로 전환
- `ProductCandidatesPanel`의 금액/정렬 필드, checkbox row, 후보 테이블 wrapper, empty-state를 공용 본문 토큰으로 정리

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 메인 플래닝 허브 기준으로는 `PlanningWorkspaceClient`와 `PlanningRunsClient`에 반복 raw surface/field가 아직 많이 남아 있음
- 제품 전역 기준으로는 `recommend/products` 계열을 다음 별도 라운드로 묶는 편이 ROI가 높음

## 22차 후속 정리: planning runs/workspace 상단 입력 흐름 공용 본문 토큰 적용

### 추가 변경 파일
- `src/components/PlanningRunsClient.tsx`
- `src/components/PlanningWorkspaceClient.tsx`

### 변경 이유
- 메인 사용자 흐름인 `실행 기록`과 `플래닝 워크스페이스` 상단 입력 구간에 raw select, bespoke dialog, plain empty-state, 반복 surface가 남아 있어 이전 라운드의 본문 토큰 기준과 어긋나고 있었음
- 멀티 에이전트 탐색 기준으로도 두 파일이 현재 남은 통일성 개선 ROI가 가장 큰 묶음이었음

### 적용 내용
- `PlanningRunsClient`의 필터 select, 실행 기록 표 wrapper, 빈 상태, 상세 요약, action center item/card/input, 비교 설명, 삭제/복구 dialog를 `BodyTableFrame`, `BodyInset`, `BodyEmptyState`, `BodyDialogSurface`, 공용 field/action-row 토큰으로 정리
- 실행 기록 행 액션과 상세 액션의 링크/다운로드 버튼도 같은 본문 액션 문법으로 맞춤
- `PlanningWorkspaceClient`의 header action row, toast/error/notice/disclaimer, quick start chip/stat, beginner 안내, 프로필 선택/이름, 혜택 기본 조건, 월 현금흐름, 자산, 부채 리스트/빈 상태/상세 입력을 공용 `BodyTone` 기준으로 전환
- 구조와 계산 로직은 그대로 두고, 상단 사용자 입력 동선에서 가장 눈에 띄는 surface/field 불일치만 우선 정리

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- `PlanningWorkspaceClient` 하단의 목표/실행 옵션/고급 JSON/제안 저장/결과 패널 일부는 아직 raw field와 상태 surface가 남아 있음
- 제품 전역 기준 다음 후보는 `recommend/products` 계열과 `PlanningWorkspaceClient` 하단 폼·결과 보조 패널 묶음임

## 23차 후속 정리: planning workspace 하단 폼 + recommend/products catalog 본문 통일

### 추가 변경 파일
- `src/components/PlanningWorkspaceClient.tsx`
- `src/app/recommend/page.tsx`
- `src/app/products/catalog/page.tsx`

### 변경 이유
- 메인 플래닝 화면 하단의 목표/실행 옵션/건강도 경고/JSON 편집기는 아직 상단과 다른 field·surface 규칙을 쓰고 있었음
- 사용자용 상품 화면인 `recommend`와 `products/catalog`도 같은 저장소 안에서 별도 입력/empty-state/table 문법을 유지하고 있어 사용 경험이 들쭉날쭉했음

### 적용 내용
- `PlanningWorkspaceClient`의 목표 목록, 요약/오류/경고 상태, Profile JSON 편집기, 정규화 제안, 실행 옵션 필드, assumptions override, Monte Carlo/action/debt 입력, refinance 제안, optimizer/고급 JSON, health/preflight 상태를 `BodyTone` 기준으로 정리
- `recommend/page.tsx`의 주요 select/number field, 고급 옵션 안내, radio row, 실행 action row, 오류/안내 배너, 저장 기록 empty-state, 변화 요약 카드, 비교 표 wrapper, 후보 empty-state, breakdown 카드에 공용 본문 토큰 적용
- `products/catalog/page.tsx`의 필터 field, debug checkbox row, 메타 row, 오류 안내, 상품 action row, 옵션 표 wrapper, 옵션 없음/검색 결과 없음 상태를 같은 토큰으로 정리

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- `PlanningWorkspaceClient`의 더 아래 결과 패널과 what-if 섹션 일부는 여전히 raw surface/table/action row가 남아 있을 수 있음
- 제품 쪽 다음 후보는 `products/compare`, 개별 `products/*` 상세, 그리고 `recommend/history` 화면 묶음임

## 24차 후속 정리: products compare/recommend history + planning workspace 안전 구간 통일

### 추가 변경 파일
- `src/app/products/compare/page.tsx`
- `src/components/RecommendHistoryClient.tsx`
- `src/components/PlanningWorkspaceClient.tsx`

### 변경 이유
- 추천 후반 사용자 흐름인 `상품 비교`와 `추천 히스토리`는 비교/선택/empty-state/table 패턴이 아직 별도 문법을 쓰고 있었음
- `PlanningWorkspaceClient` 하단 전체를 한 번에 건드리면 회귀 범위가 커서, 이번 라운드는 `What-if`, `Pipeline`, 저장 관련 모달처럼 안전한 구간만 먼저 공용 토큰으로 맞추는 편이 적절했음

### 적용 내용
- `products/compare`의 상단 요약 카드, empty-state, 경고 안내, 비교표 wrapper, 상품 추가 링크를 `BodyInset`, `BodyEmptyState`, `BodyTableFrame`, `BodyActionLink` 기준으로 정리
- `RecommendHistoryClient`의 상단 이동 링크, 실행 목록 카드, 선택 실행 empty-state, 비교 담기 select, 실행 목록/비교 테이블 wrapper, 비교 요약 stat 카드를 공용 본문 토큰으로 정리
- `PlanningWorkspaceClient`에서는 `What-if 시나리오`, `Pipeline`, 저장 체크박스/action row, 프로필 삭제 모달, 피드백 모달을 `BodySectionHeading`, `BodyInset`, `BodyDialogSurface`, 공용 field/action-row 토큰으로 맞춤

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- `PlanningWorkspaceClient`의 결과 탭 본문(`summary / scenarios / monteCarlo / actions / debt`)은 여전히 raw summary card, table wrapper, helper banner가 남아 있음
- 제품 쪽 다음 후보는 `products/catalog/[id]`, `products/*` 개별 상세, 그리고 `recommend` 상세 drawer 주변 보조 surface 묶음임

## 25차 후속 정리: product shared detail/list + planning result tabs 본문 통일

### 추가 변경 파일
- `src/components/UnifiedProductDetailClient.tsx`
- `src/components/ProductListPage.tsx`
- `src/components/PlanningWorkspaceClient.tsx`

### 변경 이유
- `products/catalog/[id]` 상세와 `deposit/saving/catalog` 공용 리스트는 여전히 별도 input/surface/error/table 문법을 유지하고 있었음
- `PlanningWorkspaceClient` 결과 탭 본문도 요약 카드, 상태 배너, 빈 상태, 표 wrapper가 report/body 기준선과 다르게 흩어져 있었음

### 적용 내용
- `UnifiedProductDetailClient`의 메타 요약, 오류 안내, 옵션 선택 field, 금리 stat 카드, 조건 섹션, 비교 이동 링크를 `BodyInset`, `BodyStatusInset`, `BodyEmptyState`, `BodyActionLink`, 공용 field/action-row 토큰 기준으로 정리
- `ProductListPage`의 스냅샷 상태 박스, 검색/정렬/즐겨찾기/비교함 row, 오류 상태, 옵션 그룹 카드, 그룹 표 wrapper, 페이지네이션 action row를 같은 `BodyTone` 문법으로 통일
- `PlanningWorkspaceClient`의 결과 해석 가이드, `summary / warningsGoals / scenarios / monteCarlo / actions / debt` 탭 내부 helper box, stat 카드, 상태 배너, empty-state, 표 wrapper, 저장 후 이동 링크를 `BodyInset`, `BodyStatusInset`, `BodyEmptyState`, `BodyTableFrame`, `BodyActionLink`로 정리

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 현재 user-facing 주요 플래닝/상품 흐름의 surface/field/table 불일치는 대부분 공용 토큰으로 정리했음
- 다음 라운드는 버그 리스크 해소라기보다, 전역 card density/hero language를 더 강하게 묶는 디자인 시스템 확장 작업에 가까움

## 26차 후속 정리: recommend/history + planning reports 상단 톤 수렴

### 추가 변경 파일
- `src/app/recommend/page.tsx`
- `src/components/RecommendHistoryClient.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`

### 변경 이유
- 추천 메인/히스토리와 플래닝 리포트 상단에는 여전히 화면별 전용 heading, section wrapper, 링크/액션 문법이 남아 있어 같은 제품 안에서도 톤 차이가 느껴졌음
- 이미 도입한 `BodyTone`을 다시 쓰면 로직을 건드리지 않고도 사용자용 흐름의 상단 정보 구조와 CTA 문법을 더 자연스럽게 맞출 수 있었음

### 적용 내용
- `recommend/page.tsx`의 상단 설정 카드, 메타/저장/히스토리/result empty-state 섹션을 `BodySectionHeading`, `BodyActionLink`, `BodyEmptyState`, `BodyInset`, `BodyTableFrame` 기준으로 정리
- `RecommendHistoryClient.tsx`의 페이지 헤더, 섹션 제목, 상단 액션 버튼, 빈 상태를 같은 공용 본문 톤으로 정리하고 `planning/reports` 공식 링크 기준을 유지
- `PlanningReportsDashboardClient.tsx`의 페이지 상단 링크, 빈 상태 안내, 실행 선택 header, 해석 불가/리포트 구성 실패 상태, 고급 보기 wrapper를 `BodyActionLink`, `BodySectionHeading`, `BodyInset`, `BodyStatusInset` 기준으로 수렴

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 지금 남는 차이는 주로 추천 상세 drawer, 비교 테이블 미세 간격, 일부 page-header 전용 타이포그래피처럼 더 미시적인 디자인 시스템 확장 영역임
- 기능 회귀 리스크 관점에서 추적하던 user-facing 주요 surface/CTA 불일치는 현재 범위에서 사실상 닫힘

## 27차 후속 정리: product detail drawer + compare micro surface 정리

### 추가 변경 파일
- `src/components/products/ProductDetailDrawer.tsx`
- `src/app/products/compare/page.tsx`

### 변경 이유
- 추천 결과 상세 drawer는 여전히 별도 modal/input/table 문법을 사용하고 있어, 메인 상품/추천 화면과 톤이 미세하게 어긋나 있었음
- 상품 비교 화면도 핵심 표는 정리됐지만, 헤더 내부 상세 링크와 보조 surface 일부에 raw 액션 문법이 남아 있었음

### 적용 내용
- `ProductDetailDrawer`를 `BodyDialogSurface`, `BodySectionHeading`, `BodyInset`, `BodyEmptyState`, `BodyTableFrame`, 공용 field 토큰 기준으로 정리해 modal/옵션표/계산기까지 같은 문법으로 맞춤
- 옵션 없음, 우대조건 없음 상태도 공용 empty-state로 바꿔 데이터가 비어 있을 때의 안내 톤을 통일
- `products/compare`의 컬럼별 상세 이동 링크를 `BodyActionLink` 기준으로 바꿔 비교 화면 내부 CTA 문법도 동일하게 정리

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 현재 남는 차이는 `planning reports` 내부 dark compare section이나 일부 page-header 타이포그래피처럼, 디자인 확장 여부를 별도로 판단해야 하는 영역임
- 이번 라운드까지로 사용자용 상품/추천/플래닝 주요 흐름의 본문 surface/CTA 불일치는 실질적으로 마무리 단계에 들어감

## 28차 후속 정리: planning reports dark surface + report dialog 토큰 수렴

### 추가 변경 파일
- `src/components/ui/ReportTone.tsx`
- `src/app/planning/reports/_components/CandidateComparisonSection.tsx`
- `src/components/PlanningReportsClient.tsx`

### 변경 이유
- `planning reports` 내부의 후보 비교 섹션은 dark report 톤을 쓰면서도 입력/select/button/table wrapper가 개별 클래스에 머물러 있어 같은 화면 안에서도 밀도와 포커스 규칙이 제각각이었음
- 리포트 목록/상세 화면도 삭제 dialog, 상태 배너, summary/table wrapper 일부가 `BodyTone` 기준과 분리되어 있어 제품 전반의 본문 문법과 미세하게 어긋났음

### 적용 내용
- `ReportTone`에 dark report surface 전용 field, inset, table frame, detail, button 토큰을 추가해 `CandidateComparisonSection`의 필터 입력, 이자 추정 근거, 페이지네이션, assumptions 블록을 같은 규칙으로 수렴
- `CandidateComparisonSection`의 fetchedAt chip도 기존 report hero 메타 chip 규칙을 재사용해 dark report 계열 내부 CTA/메타 톤을 일관되게 맞춤
- `PlanningReportsClient`는 상태 안내, 기준정보/Executive Summary 요약 inset, Action Plan 보조 안내, scenarios/monte/debt table wrapper, 삭제 dialog를 `BodySectionHeading`, `BodyInset`, `BodyStatusInset`, `BodyTableFrame`, `BodyDialogSurface` 기준으로 정리

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 현재 남는 차이는 `ReportBenefitsSection`, `ReportRecommendationsSection` 같은 dark report 하위 블록의 세밀한 typography/spacing 정도로, 기능 회귀 리스크가 아니라 추가 디자인 시스템 확장 범주임
- 이번 라운드까지로 `planning reports`의 user-facing 주요 compare/dialog/state surface 불일치는 현재 범위에서 사실상 닫힘

## 29차 후속 정리: planning reports dark CTA 토큰 정리

### 추가 변경 파일
- `src/app/planning/reports/_components/ReportBenefitsSection.tsx`
- `src/app/planning/reports/_components/ReportRecommendationsSection.tsx`

### 변경 이유
- `planning reports` 하위 dark section은 카드/배지/설명은 이미 같은 톤이었지만, `내용 상세보기`, `신청하기`, `후보 비교표로 이동`, `전체 추천 보기` CTA와 `fetchedAt` chip 일부가 raw 클래스에 머물러 있었음
- 이 구간은 로직 변경 없이도 공용 `ReportTone` 액션 토큰으로 정리 가능한 작은 안전 범위였음

### 적용 내용
- `ReportRecommendationsSection`의 `fetchedAt` chip을 공용 hero meta chip으로 바꾸고, 하단 이동/추천 CTA를 report hero action/primary action 토큰 기준으로 수렴
- `ReportBenefitsSection`의 상세 보기 버튼은 dark surface button 토큰으로, 외부 신청 링크는 report hero primary action 토큰으로 맞춰 같은 report 안의 CTA 문법을 통일

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 현재 남는 차이는 dark report 하위 블록의 typography/spacing 미세 조정 수준이며, 기능 회귀 리스크보다는 추가 디자인 확장 범주임
- 이번 라운드까지로 `planning reports` user-facing CTA 불일치도 현재 범위에서는 사실상 닫힘

## 30차 후속 정리: advanced raw + report dashboard 고급 wrapper 정리

### 추가 변경 파일
- `src/app/planning/reports/_components/ReportAdvancedRaw.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`

### 변경 이유
- dark report 안의 advanced raw 영역은 `details`, `더 보기` 버튼, JSON 원문 wrapper가 아직 개별 클래스를 쓰고 있어 report 내부 세부 surface 밀도가 미세하게 갈렸음
- report dashboard의 `고급 보기` toggle도 wrapper와 내부 inset이 다른 body surface보다 조금 가볍게 보여 같은 제품 안에서 톤 차이가 남아 있었음

### 적용 내용
- `ReportAdvancedRaw`의 markdown/json/reproducibility `details`를 report dark inset 기준으로 정리하고, `더 보기`, `더 불러오기` 버튼도 공용 dark button 토큰으로 통일
- `PlanningReportsDashboardClient`의 고급 보기 wrapper에 shadow와 inset padding을 보강해 body surface 문법을 다른 report 본문 카드와 더 가깝게 맞춤

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 현재 남는 차이는 dark report 내부의 매우 미세한 typography/spacing 보정 수준이며, 기능 리스크보다는 디자인 시스템 확장 범주임
- 이번 라운드까지로 `planning reports`의 user-facing advanced/raw surface 불일치도 현재 범위에서는 사실상 닫힘

## 31차 후속 정리: report dashboard core metrics + evidence dock 토큰 수렴

### 추가 변경 파일
- `src/components/ui/ReportTone.tsx`
- `src/app/planning/reports/_components/ReportDashboard.tsx`

### 변경 이유
- `ReportDashboard` 상단 core metrics는 dark report 안에서도 stat card와 meta chip이 개별 클래스에 머물러 있었고, evidence dock 내부 detail 카드도 별도 surface를 쓰고 있어 같은 섹션 안에서 미세한 톤 차이가 남아 있었음
- 이 구간은 로직 변경 없이 공용 report stat/meta/detail 토큰으로 수렴시키기 쉬운 작은 안전 범위였음

### 적용 내용
- `ReportTone`의 stat card가 보조 콘텐츠를 받을 수 있게 최소 확장해서 core metrics 안에서도 같은 stat card 문법을 재사용할 수 있게 함
- `ReportDashboard`의 `summary snapshot` chip을 공용 meta chip으로 바꾸고, 상단 4개 핵심 수치를 공용 stat grid/stat card로 정리
- evidence dock 내부의 inputs/assumptions/notes surface도 dark report detail 토큰 기준으로 맞춤

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 현재 남는 차이는 dark report 전반의 미세한 typography/spacing 조정 정도이며, 기능 회귀 리스크보다는 추가 디자인 시스템 정리 범주임
- 이번 라운드까지로 `planning reports` core metrics와 evidence dock의 user-facing surface 불일치도 현재 범위에서는 사실상 닫힘

## 32차 후속 정리: report dashboard core metrics 후속 tone 수렴

### 추가 변경 파일
- `src/app/planning/reports/_components/ReportDashboard.tsx`

### 변경 이유
- `ReportDashboard` 상단 core metrics는 공용 stat card로 옮겼지만, 그 안의 evidence detail 카드와 meta chip은 여전히 개별 dark wrapper가 남아 있어 같은 섹션 안에서도 미세한 톤 차이가 이어졌음
- 이 구간은 공용 report meta/detail/stat 패턴으로 다시 맞추기 쉬운 작은 범위였고, 로직 변경이 필요하지 않았음

### 적용 내용
- `ReportDashboard`의 `summary snapshot` chip을 공용 report meta chip으로 수렴
- 상단 4개 핵심 수치를 `ReportHeroStatGrid`와 `ReportHeroStatCard` 기준으로 정리하고, evidence dock 내부 inputs/assumptions/notes 카드도 공용 report detail 토큰으로 맞춤

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 현재 남는 차이는 `InterpretationGuide` 같은 별도 report 소비 화면의 미세 spacing/typography 수준이며, 기능 회귀 리스크보다는 추가 디자인 확장 범주임
- `planning reports` 내부 대시보드 계열의 핵심 dark surface 불일치는 현재 범위에서 사실상 닫힘

## 33차 후속 정리: interpretation guide + report disclosure 토큰 수렴

### 추가 변경 파일
- `src/components/ui/ReportTone.tsx`
- `src/app/planning/reports/_components/ReportDashboard.tsx`
- `src/components/planning/InterpretationGuide.tsx`

### 변경 이유
- report 소비 화면 전반은 대부분 공용 dark 토큰으로 맞췄지만, `InterpretationGuide`의 월수입 운영 권장안 헤더와 전문 경고 상세 disclosure, `ReportDashboard`의 evidence popover와 disclosure 2곳은 여전히 raw dark wrapper를 쓰고 있었음
- 이 구간은 로직 영향 없이 공용 report disclosure/popover 토큰으로 수렴시키기 좋은 작은 안전 범위였음

### 적용 내용
- `ReportTone`에 dark report 전용 disclosure/popup 토큰을 추가해 summary disclosure와 evidence popover에서 같은 문법을 재사용할 수 있게 함
- `ReportDashboard`의 evidence toggle/panel, `적용된 가정 오버라이드`, `자동 보정/기본값 적용 내역` disclosure를 공용 토큰으로 정리
- `InterpretationGuide`의 월수입 운영 권장안 상단 박스와 전문 경고 내부 `고급(코드 보기)` disclosure를 같은 report surface 기준으로 맞춤

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 현재 남는 차이는 dark report 소비 화면의 매우 미세한 typography/spacing 조정 수준이며, 기능 회귀 리스크보다는 추가 디자인 시스템 확장 범주임
- 이번 라운드까지로 `InterpretationGuide`와 report disclosure 계열의 user-facing surface 불일치도 현재 범위에서는 사실상 닫힘

## 34차 후속 정리: evidence panel dark variant 분리

### 추가 변경 파일
- `src/components/planning/EvidencePanel.tsx`
- `src/components/planning/InterpretationGuide.tsx`

### 변경 이유
- `EvidencePanel`은 `PlanningWorkspaceClient`의 light 본문과 `InterpretationGuide`의 dark report 본문에서 함께 쓰이는데, 기존 구현은 light slate 스타일 고정이라 report 안에서만 밝게 튀는 문제가 남아 있었음
- 기본 스타일을 뒤집으면 light 본문 회귀 위험이 있어서, report 화면에서만 opt-in하는 dark variant가 더 안전했음

### 적용 내용
- `EvidencePanel`에 `tone="light" | "dark"` variant를 추가하고, dark 모드에서는 report disclosure/detail/inset 토큰을 재사용하도록 정리
- 기본값은 기존과 같은 `light`로 유지해서 `PlanningWorkspaceClient` 흐름은 바꾸지 않음
- `InterpretationGuide`에서만 `tone="dark"`를 넘겨 report 안의 근거 패널을 같은 dark surface 문법으로 맞춤

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 현재 남는 차이는 report 소비 화면의 미세 typography/spacing 조정 수준이며, 기능 회귀 리스크보다는 추가 디자인 확장 범주임
- `EvidencePanel`의 light/dark 혼용 구간은 이번 라운드로 현재 사용 범위 기준 정리 완료

## 35차 후속 정리: storage journal append race 보강

### 추가 변경 파일
- `src/lib/planning/storage/journal.ts`

### 변경 이유
- `EvidencePanel` dark variant 검증 중 전체 테스트를 다시 돌리다가 `ops actions preview route`에서 `journal.ndjson` 디렉터리 생성 타이밍이 겹치며 `ENOENT`가 재발했음
- 이번 UI 변경과 직접 관계는 없지만, 병렬 테스트와 실제 저장 흐름 모두에서 안전성을 위해 작은 보강이 필요했음

### 적용 내용
- `appendLine()`의 `mkdir -> appendFile`를 하나의 재시도 루프로 묶어, 디렉터리가 순간적으로 사라진 경우 `ENOENT` 1회는 다시 생성 후 재시도하도록 보강
- 다른 에러는 그대로 throw해서 원인 은닉 없이 기존 동작을 유지

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 이번 보강은 journal append의 디렉터리 생성 레이스를 줄이는 범위이며, 저장소 전반의 동시성 정책을 바꾸는 수정은 아님
- user-facing 화면 기준 통일성 작업은 유지되며, 이번 항목은 검증 안정성 회귀 차단 성격임

## 36차 후속 정리: quick start + recommend history 액션 톤 수렴

### 추가 변경 파일
- `src/components/ui/BodyTone.tsx`
- `src/components/PlanningWorkspaceClient.tsx`
- `src/components/RecommendHistoryClient.tsx`

### 변경 이유
- 메인 `/planning`의 Quick Start 상단 상태 칩과 `/recommend/history`의 실행 액션 row는 여전히 raw chip/button/link 스타일이 남아 있어, 이미 body 토큰을 많이 쓰는 주변 카드 대비 문법 차이가 체감됐음
- 두 화면 모두 사용자 노출 빈도가 높고, 공용 body 토큰으로 정리하기 쉬운 작은 범위였음

### 적용 내용
- `BodyTone`에 body 메타 칩과 작은 액션 링크 토큰을 추가해 반복되는 상태 pill/link 스타일을 재사용 가능하게 함
- `PlanningWorkspaceClient`의 Quick Start 상태 칩 4개를 공용 body 메타 칩으로 정리
- `RecommendHistoryClient`의 상단 복귀 링크, 저장 개수 표시, 실행 목록 액션 button/link, 상위 N개 비교 담기 버튼을 body/button 문법으로 수렴

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- 이번 라운드까지로 메인 planning/recommend history의 상단 raw chip/action 불일치는 현재 범위 기준 대부분 정리됨
- 남는 차이는 다른 보조 사용자 화면의 미세 spacing/typography 조정 수준이며, 기능 회귀 리스크보다는 추가 디자인 확장 범주임

## 37차 후속 정리: gov24 step/result 본문 톤 수렴

### 추가 변경 파일
- `src/components/Gov24Client.tsx`

### 변경 이유
- `Gov24` 간편 찾기 화면은 사용자 노출 빈도가 높지만, 단계형 입력과 결과 요약/카드가 여전히 page-local raw field/surface를 많이 써서 planning/recommend 계열과 톤 차이가 컸음
- 이 화면은 로직보다 본문 surface와 action 문법만 정리해도 체감 통일성이 바로 좋아지는 범위였음

### 적용 내용
- 상단 동기화 상태를 body 메타 칩과 status inset으로 정리하고, sync note/error/loading 안내를 공용 본문 status 문법으로 수렴
- STEP 1~6 입력 구간의 제목, 입력 블록, 지역 선택 surface, 생년월일 input, 소득 표 wrapper를 `BodyInset`, `BodySectionHeading`, `BodyTableFrame`, body field 토큰으로 정리
- STEP 7 결과 화면의 조건 요약, 재검색 input, org filter select, 에러 안내, 결과 카드, 외부 `바로가기` 링크를 같은 body 톤으로 맞춤

### 추가 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`

### 남은 리스크
- `Gov24`의 결과 카드 안 badge와 텍스트 위계는 이번 라운드로 본문 문법을 맞춘 수준이고, 더 세밀한 정보 밀도 조정은 다음 디자인 확장 범주임
- 사용자 흐름 기준 큰 raw field/surface 차이는 줄었고, 남는 차이는 다른 보조 탐색 화면의 미세 spacing/typography 수준임

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
