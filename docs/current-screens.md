# 현재 제공 화면/기능 카탈로그 (v1.0 RC)

기준일: 2026-08-24
기준 소스: `src/app/**/page.tsx`
최근 검증: page route 95개, `pnpm planning:current-screens:guard`, `pnpm planning:ssot:check`

## Public IA 기준 (2026-03-16)
- 코드 기준: `src/lib/navigation/routeRegistry.ts`
- 상위 메뉴는 아래 5개 축으로 고정한다.
- `홈/대시보드` → 대표 경로 `/dashboard`, 첫 방문용 public landing은 `/`
- `재무진단` → 대표 경로 `/planning`
- `상품추천` → 대표 경로 `/recommend`
- `금융탐색` → 대표 경로 `/products` (`/products/catalog`, `/public/dart`, `/benefits`, `/housing/*`, `/tools/fx` 포함)
- `내 설정` → 대표 경로 `/settings` (`/settings/data-sources`, `/settings/backup`, `/settings/alerts` 포함)
- 위 기준은 Public navigation/홈 바로가기의 상위 IA 기준이며, 개별 세부 경로 분류와 노출 정책은 별도 route policy에서 관리한다.
- Header와 MobileBottomNav는 같은 navigation registry를 소비한다. Ops/Dev/Debug 경로는 public nav source에 넣지 않는다.
- primary navigation owner는 `<768px`에서 MobileBottomNav, `768~1023px`에서 header horizontal strip, `>=1024px`에서 desktop header다. public 경로의 `<768px` header는 브랜드만 유지하며 fixed bottom nav 높이와 safe area는 같은 CSS contract로 본문 뒤 공간에 예약한다.

## Route Policy 분류 기준
- `src/lib/navigation/routeRegistry.ts`의 route policy registry가 아래 95개 page를 `page` 또는 `redirect`로 빠짐없이 명시 분류한다.
- 등록되지 않은 runtime pathname은 `internal/unknown`으로 fail closed하며 Public Stable로 추정하지 않는다.
- navigation prefix는 정확히 같은 경로이거나 다음 `/` segment로 이어질 때만 일치한다. 예를 들어 `/planning`은 `/planning/runs`와 일치하지만 `/planning-v3`와는 일치하지 않는다.
- redirect entry는 `canonicalHref`를 가지며 목적지가 실존하는 명시 분류 page인지 guard에서 확인한다.
- `Public Stable`: 사용자 문서, 헤더, 홈 바로가기에서 기본 노출 가능한 공식 경로
- `Public Beta`: 실험 또는 preview 성격이 남아 있어 기본 메뉴에는 올리지 않되 공개 검토가 가능한 경로
- `Legacy Redirect`: 공식 경로가 아니며 안정 경로로 즉시 보내는 호환용 진입점
- `Local-only Ops`: 운영자나 로컬 실행 환경 전용 경로
- `Dev/Debug`: 개발 확인용 경로. production 사용자 노출 금지

## Public 화면 (Public Stable / production 노출)
- `/` (public landing, 제품 설명/시작 CTA/샘플 결과 미리보기 제공, 저장 실행 조회 없음)
- `/dashboard` (메인 진입점, 저장 실행/데이터 상태/혜택 흐름을 상태별로 표시)
- `/benefits` (공공혜택 canonical search, Gov24와 같은 표시 contract 사용)
- `/compare`
- `/gov24` (공공혜택 guided finder, `/benefits`와 같은 fallback/error 표시 정책 공유)
- `/help`
- `/housing/afford`
- `/housing/subscription`
- `/invest/companies`
- `/feedback`
- `/planning`
- `/planning/runs`
- `/planning/runs/[id]`
- `/planning/reports`
- `/planning/reports/[id]`
- `/planning/trash`
- `/products`
- `/products/catalog`
- `/products/catalog/[id]`
- `/products/deposit` (compatibility, `/products/catalog?kind=deposit` preset)
- `/products/saving` (compatibility, `/products/catalog?kind=saving` preset)
- `/products/pension`
- `/products/mortgage-loan`
- `/products/rent-house-loan`
- `/products/credit-loan`
- `/products/compare`
- `/public/dart`
- `/public/dart/company`
- `/recommend`
- `/recommend/history`
- `/settings`
- `/settings/alerts`
- `/settings/backup`
- `/settings/data-sources`
- `/settings/maintenance`
- `/settings/recovery`
- `/tools/fx`

## 경계 메모
- `/planning/reports`, `/planning/reports/[id]`, `/planning/runs`는 공식 planning run/report 경로다.
- `/settings/recovery`는 production 사용자에게 브라우저 화면 설정 초기화와 백업 복원·데이터 소스 상태 진입만 제공한다. Dev unlock, 서버 tmp 삭제, 오프라인 스크립트 실행은 공개 복구 화면에 노출하지 않는다.
- `/report`는 legacy redirect 경로이며 공식 planning report 경로와 구분해서 다룬다.
- `/report` 진입은 현재 `/planning/reports` 또는 `/planning/reports?runId=...`로 `permanentRedirect` 된다.
- `/compare`, `/products/deposit`, `/products/saving`, `/planning/v3/transactions`도 route policy에서 공개 redirect entry와 canonical destination을 별도로 유지한다.
- `/planning/v3/balances`, `/planning/v3/profile/drafts`, `/planning/v3/transactions`, `/planning/v3/transactions/batches`와 `/planning/reports/prototype`는 공개 검토가 필요한 `Public Beta`로 취급한다. 그 밖의 현재 v3 page 21개는 `Internal`이다.
- `/planner/[...slug]`는 route policy에 등록된 planning route로만 하위 경로를 보존한다. 등록된 redirect면 canonical page로 보내고 미등록 목적지는 `/planning`으로 보낸다.
- `/ops/*`, `/dashboard/artifacts`, `/debug/*`, `/dev/*`는 사용자 문서/헤더/홈 바로가기 노출 대상이 아니다.

## Planning 공식 route/API 정책
- 코드 기준: `src/lib/planning/routes.ts`
- 공식 사용자 경로는 `PLANNING_CANONICAL_ROUTES.user`의 `/planning`, `/planning/runs`, `/planning/runs/[id]`, `/planning/reports`, `/planning/reports/[id]`다.
- 공식 run 생성/목록 API는 `PLANNING_CANONICAL_ROUTES.api`의 `/api/planning/v2/runs`다.
- `/api/planning/run`, `/api/planning/v2/run`, `/api/planner/compute`는 `PLANNING_DEPRECATED_API_ROUTES`에 등록된 deprecated alias/compatibility API다.
- deprecated API는 `Deprecation: true`, `X-Planning-Canonical-Route`, `X-Planning-Route-Status` 헤더와 `meta.deprecatedApi` 또는 `meta.legacyApi`를 반환해 호출자가 canonical route를 식별할 수 있게 한다.
- deprecated API와 legacy redirect 제거 여부는 telemetry/access log와 외부 사용처 확인 전까지 확정하지 않는다.
- Planning v3의 official beta entry overlay는 `/planning/v3/transactions`, `/planning/v3/transactions/batches`, `/planning/v3/balances`, `/planning/v3/profile/drafts` 4개로만 읽는다. 다른 v3 경로는 deep-link/internal/non-entry 후보로 유지한다.

## Legacy/Redirect 화면
- `/report` (legacy redirect, `/planning/reports`로 영구 이동)
- `/planner` (legacy redirect, `/planning`으로 이동)
- `/planner/[...slug]` (legacy redirect, 지원되는 planning 하위 경로는 suffix 유지, 그 외는 `/planning`으로 이동)

## Prototype/Preview 화면 (Public Beta)
- `/planning/reports/prototype` (기본 진입은 `/planning/reports`로 리다이렉트, `preview=1`일 때만 프로토타입 표시)

## Planning v3 화면 (Public Beta / experimental / in-progress)
- `/planning/v3/accounts`
- `/planning/v3/balances`
- `/planning/v3/batches`
- `/planning/v3/batches/[id]`
- `/planning/v3/categories/rules`
- `/planning/v3/drafts`
- `/planning/v3/drafts/[id]`
- `/planning/v3/drafts/profile`
- `/planning/v3/exposure`
- `/planning/v3/import/csv`
- `/planning/v3/journal`
- `/planning/v3/news`
- `/planning/v3/news/alerts`
- `/planning/v3/news/explore`
- `/planning/v3/news/settings`
- `/planning/v3/news/trends`
- `/planning/v3/profile/draft`
- `/planning/v3/profile/drafts`
- `/planning/v3/profile/drafts/[id]`
- `/planning/v3/profile/drafts/[id]/preflight`
- `/planning/v3/scenarios`
- `/planning/v3/start`
- `/planning/v3/transactions`
- `/planning/v3/transactions/batches`
- `/planning/v3/transactions/batches/[id]`

## Planning v3 노출 overlay 메모 (2026-03-26)
- 위 `Planning v3 화면` 목록은 route 존재 사실 기준의 `Public Beta` inventory다.
- official beta entry overlay는 `/planning/v3/transactions`, `/planning/v3/transactions/batches`, `/planning/v3/balances`, `/planning/v3/profile/drafts` 4개로만 읽는다.
- deep-link only는 `/planning/v3/transactions/batches/[id]`, `/planning/v3/profile/drafts/[id]`, `/planning/v3/profile/drafts/[id]/preflight`로 유지한다.
- stable destination tier는 `Public Stable`인 `/planning`, `/planning/runs`, `/planning/reports`, `/planning/reports/[id]`다.
- `/planning/v3/start`, `/planning/v3/news*`, `/planning/v3/journal`, `/planning/v3/exposure`, `/planning/v3/scenarios`, raw `/planning/v3/batches`, `/planning/v3/batches/[id]`, `/planning/v3/import/csv`, `/planning/v3/drafts*`, `/planning/v3/accounts`는 current official entry policy 밖의 non-entry/internal 또는 onboarding wrapper 후보로 둔다.

## Ops/Admin 화면 (Local-only Ops / local-only 또는 packaged runtime)
- `src/middleware.ts`가 `src/app`과 같은 레벨에서 production 보안 헤더와 local-only 경계를 적용한다. 피드백 관리 및 `/ops/*`, `/api/ops/*`는 prefetch 헤더가 있어도 가드를 통과해야 한다.
- 아래 피드백 관리 2개 경로는 개발 local-ops 전용이며 packaged production 지원 범위에 포함하지 않는다.
- `/feedback/list` (개발 로컬 직접 연결 + Dev unlock 피드백 관리 capability 필요, production 404)
- `/feedback/[id]` (개발 로컬 직접 연결 + Dev unlock 피드백 관리 capability 필요, production 404)
- `/ops`
- `/ops/about`
- `/ops/assumptions`
- `/ops/assumptions/history`
- `/ops/audit`
- `/ops/auto-merge`
- `/ops/auto-merge/policy`
- `/ops/backup`
- `/ops/doctor`
- `/ops/feedback/planning`
- `/ops/labels`
- `/ops/metrics`
- `/ops/planning`
- `/ops/planning-cache`
- `/ops/planning-cleanup`
- `/ops/planning-eval`
- `/ops/rules`
- `/ops/runs`
- `/ops/security`
- `/ops/support`

## Dev/Debug 화면 (production 404)
- `/dashboard/artifacts`
- `/debug/planning-v2`
- `/debug/unified`
- `/dev/data`
- `/dev/finlife/schema`
- `/dev/git`
- `/dev/public-apis`

## API 노출 규칙
- `/api/dev/*`는 production에서 공통 차단(404)된다.
- 현재 코드에는 production 예외가 없다. `/api/dev/unlock`도 development local-ops에서만 사용하며 packaged production에서는 404를 유지한다.
- exact `POST /api/feedback`은 public 피드백 접수 경로이며 same-origin 요청만 허용하고 성공 시 `{ ok: true }`만 반환한다.
- `POST /api/planning/v2/feedback`은 `/planning` workspace의 구조화 피드백 접수 경로다. same-origin·CSRF와 routeAuth current-user scope를 요구하며, 성공한 피드백은 현재 사용자의 planning data namespace에 저장한다. `/api/ops/feedback/planning`은 개발용 관리 API로 남기고 production 404를 유지한다.
- `/api/settings/backup/status|export|export/finalize|preview|restore`는 desktop-local production의 사용자 백업 경로다. middleware와 route 양쪽에서 로컬 호스트·인증을 먼저 확인하고, same-origin·vault CSRF를 추가 검증한다. export/finalize JSON은 인증 성공 후 최대 32KiB만 읽고, 백업 다운로드만으로는 변경분 기준을 옮기지 않는다. 사용자가 파일 저장을 확인한 뒤 서명 receipt를 finalize해야 checkpoint가 확정된다. vault format v2 full 백업은 현재 사용자 profile/run과 Planning v3 13-owner whitelist를 암호화하며 shared assumptions·ops policy는 제외한다. 복원 요청은 제한된 multipart 크기와 같은 파일·암호로 발급한 preview token을 확인한 뒤에만 실행하고, Planning v3는 replace에서만 반영한다. 기존 `/api/dev/backup/*`는 개발 전용 404 경계를 유지한다.
- `/api/ops/backup/export|export/finalize`도 development local-ops에서 로컬 호스트·same-origin·현재 사용자 인증을 먼저 확인하고 같은 32KiB JSON·서명 receipt·저장 확인 후 checkpoint 계약을 적용한다. production에서는 `/api/ops/*` 경계에 따라 404를 유지한다.
- standalone `/api/diagnostics/snapshot` GET은 공개·로컬 공통으로 제공하지 않는다. `/feedback`은 이 route를 fetch·cache하거나 진단 번들을 다운로드하지 않으며, `POST /api/feedback`은 client-supplied snapshot과 `x-page-url`·`x-local-state-summary`를 신뢰하지 않고 서버 내부의 최소 진단 정보만 선택적으로 저장한다. 진단 생성 실패는 피드백 본문 저장을 막지 않으며, 피드백 관리 API의 권한과 admin DTO 경계는 그대로 유지한다.
- `/api/feedback/list`, `/api/feedback/recent`, `/api/feedback/[id]`는 피드백 관리 API다. development 로컬 직접 연결과 Dev unlock capability를 요구하며 production에서는 404를 반환한다.
- `/api/gov24/sync`와 `/api/sync/smoke`는 HTTP job 실행을 지원하지 않는다. development/test는 로컬 운영 명령 안내와 함께 403, production은 404를 반환하며 실제 실행은 문서화된 CLI/scheduler 경계만 사용한다.
- `/api/public/disclosure/corpcodes/status`와 `/api/public/disclosure/corpcodes/search`는 corpCodes 파일 존재 여부(`exists`)와 실제 파싱 가능 여부(`usable`)를 구분한다. 파일이 없거나 손상된 경우 모두 409로 핵심 흐름을 안전하게 제한하되, 각각 `CORPCODES_INDEX_MISSING`과 `CORPCODES_INDEX_INVALID`로 원인을 구분한다.
- `/api/auth/*`는 일반 웹의 Auth.js 로그인/콜백/session route로 취급한다. 이 phase의 provider는 GitHub/Google OAuth만 활성화하며, Credentials/Email provider는 후속 phase로 둔다. `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` 또는 `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` 묶음이 없으면 해당 provider는 비활성화된다. Prisma adapter는 Auth.js 테이블 마이그레이션 후 `AUTH_PRISMA_ADAPTER_ENABLED=true`에서만 활성화한다. 검증된 desktop-local에서는 외부 OAuth handler를 호출하지 않으며 `GET /api/auth/signin`만 `/planning`의 로컬 세션 확인으로 돌리고 나머지는 404로 처리한다. runtime/loopback 신뢰 경계 위반은 각각 503/403이며 이 복구 이동은 인증을 부여하지 않는다.
- `/api/planning/*`는 production에서 항상 인증을 요구한다. desktop-local은 검증된 launcher session으로만 기존 `users/default`를 사용한다. 일반 production 웹에서는 `PLANNING_AUTH_REQUIRED=false`를 설정해도 middleware와 routeAuth가 Auth.js session cookie 또는 내부 신뢰 auth header가 없는 요청을 401로 차단한다. 신뢰 auth header가 비활성화됐거나 원격 요청에서 쓰이면 403으로 차단한다. local/dev에서 임시 fallback을 쓰려면 `PLANNING_AUTH_REQUIRED=false`를 명시해야 한다. route handler에서는 routeAuth 계층의 current-user scope를 사용해 저장소 접근을 현재 사용자 경계 안에서 수행하고, public meta는 `meta.userId`와 `meta.authSource` 키를 유지한다.
- `/api/planning/run`과 `/api/planning/v2/run`은 `/api/planning/v2/runs`의 deprecated alias다. 제거 또는 redirect 전환은 telemetry/access log와 사용처 확인 후 별도 결정한다.
- `/api/planner/compute`는 legacy planner 계산 API지만 개인 재무 입력을 받으므로 same-origin 요청과 routeAuth current-user scope를 모두 요구한다. 성공 응답 meta는 `meta.userId`와 `meta.authSource`를 유지한다. `/api/planner/assumptions`는 저장소를 쓰지 않는 외부 가정값 조회 보조 API로 유지한다.
- `/api/recommend`는 추천 입력과 planning context를 받는 계산 API이므로 same-origin 요청과 routeAuth current-user scope를 모두 요구한다. 성공 응답 meta는 기존 추천 trace/source meta에 `meta.userId`와 `meta.authSource`를 함께 유지한다.
- 금융탐색의 상위 public 진입점은 `/products`다. 이 게이트웨이 안에서 예금/적금의 대표 비교 화면은 `/products/catalog`이며, catalog `kind` preset과 연금/대출 별도 상품군 화면의 노출 수준을 구분한다. `samplebank`는 production public catalog UI/API에서 노출하지 않는다.
- `/products/pension`은 금감원 통합연금포털 OpenAPI를 `pnpm pension:sync`로 수집한 `.data/fss_pension_*_snapshot.json`만 읽는 공개 GET `/api/products/pension`을 사용한다. 기본 탭은 원리금보장 연금저축보험, 상품별 탭은 판매 중·연평균 수수료율 낮은 순이 기본이다. 화면은 "통합연금포털(금융감독원) 콘텐츠"와 원문 링크, 공시 기준·수집 시각·오래된 자료(수집 7일 초과, 기준이 2분기/6개월 이상 뒤처짐)·미공시 분기를 표시하고, 스냅샷 없음(409 `SNAPSHOT_MISSING`)과 손상(500 `SNAPSHOT_INVALID`)을 빈 목록으로 숨기지 않는다. 연금저축은 비교함·즐겨찾기를 지원하지 않는다. 이전 `GET /api/finlife/pension`은 제거했고, 저장된 `finlife:pension:*` 비교·상세 id는 `GET /api/products/unified/item`이 410 `PRODUCT_RETIRED`로 거부해 새 화면을 안내한다.
- `/api/ops/actions/preview`와 `/api/ops/actions/run`처럼 planning 저장소 작업을 registry로 실행하는 ops action route도 local/dev unlock과 CSRF 외에 routeAuth current-user scope를 요구한다. 성공 응답 meta는 `meta.userId`와 `meta.authSource`를 유지한다.

## 정합성 체크 규칙
- runtime 문서의 `<main id="main-content">` owner는 root `src/app/layout.tsx` 하나다. `PageShell`과 page/client wrapper는 neutral element를 사용하고, 첫 keyboard focus는 `본문으로 건너뛰기` skip link로 main target에 이동한다.
- 헤더/홈/문서의 내부 링크(`href`)는 반드시 위 실존 경로만 가리킨다.
- Ops 계열 경로(`/ops/*`, `/feedback/list`, `/feedback/[id]`)는 public 기능 안내가 아니라 local-only 또는 packaged runtime 기준 운영 화면으로 취급한다.
- Dev/Debug 경로는 운영 문서/사용자 안내에서 기본 노출하지 않는다.
- `pnpm planning:current-screens:guard`는 이 문서와 실제 route 집합을 테스트로 비교하는 체크다.
- `pnpm planning:ssot:check`는 `node scripts/planning_ssot_guard.mjs && pnpm planning:current-screens:guard` 순서로 실행된다.
- `scripts/planning_ssot_guard.mjs`는 `src/lib/planning/**`에서 `Math.round/Math.floor` 직접 사용, `core/v2/debt/calc` 직접 import, `lib/finlife/calculators` 직접 import를 기본 금지한다.
- 현재 예외는 `src/lib/planning/calc/**` 전체와 `src/lib/planning/v2/debt/coreCalc.ts`의 `core/v2/debt/calc` import 1건만 허용한다.
