# API Utilization Draft (MVP)

## 공통 원칙
- 모든 외부 API 호출은 서버 Route Handler(`app/api/**/route.ts`)에서만 수행한다.
- 키는 서버 env만 사용하며, 클라이언트/응답/로그에 키 원문을 노출하지 않는다.
- 응답은 정규화 타입으로 변환해 플래너/추천에서 재사용한다.
- 결과는 참고 지표이며 확정 수익/확정 절감 표현을 사용하지 않는다.

## [조건부] guidedoc adoption 메모
- `Idempotency-Key`는 중복 클릭, 재시도, 네트워크 재전송 위험이 큰 write API에서만 검토한다. 현재 조회 중심 API에는 기본 규칙으로 올리지 않는다.
- `preview_token` 기반 저장은 preview -> accept 구조와 비영속 계산 결과를 분리하는 도메인에만 한정한다.
- active 1개 규칙은 versioned plan, run, draft처럼 사용자별 활성 엔티티를 하나로 제한해야 하는 도메인에만 조건부 적용한다.
- 월마감 또는 read-only 시간 경계는 실제 제품 운영 규칙과 기준 시점이 확정된 경우에만 반영한다.
- 이벤트 로그와 운영지표 연결은 추후 계측 작업 시 참고 기준으로만 두고, 현재 API 계약의 필수 전제로 고정하지 않는다.

## Phase Now (현재 단계)
- P0(필수): FINLIFE 서버 프록시(`/api/finlife/*`) + `baseList/optionList` 정규화 + 키/로그 보안.
- P1(필수): 추천 결과에 점수 구성요소(금리/기간/유동성/금융권 선호)와 가중치 표시.
- P2(다음): 플래너 규칙 기반 실행계획 + 가정값(금리/물가/세금/수익률) 편집 UI.
- 현재 단계에서는 신규 외부 소스 확장보다 P0/P1 완성도를 우선한다.
- 화면/내비 기준의 최신 경로 목록은 `docs/current-screens.md`를 기준으로 관리한다.

## 구현 시 막힘 방지 규칙
- FINLIFE 응답 스키마를 추측하지 않는다. `pageNo=1` 샘플 호출 후 실제 JSON 키로 타입/정규화를 확정한다.
- 에러 처리는 분리한다: 사용자 응답은 안전하고 친절한 메시지, 원인/스택/업스트림 응답은 서버 로그에만 남긴다.
- 계산 결과에는 `assumptions`(가정값/기준일/버전)을 함께 반환하고, UI에서 사용자가 가정값을 수정할 수 있어야 한다.

## DoD 검증 루틴 (Quick Checks)
1. 키/클라이언트 노출 점검:
   - `rg -n "FINLIFE_API_KEY|NEXT_PUBLIC_.*FINLIFE|crtfc_key|serviceKey" src`
2. FINLIFE 직접 호출 금지 점검(클라이언트 코드):
   - `rg -n "finlife\\.fss\\.or\\.kr|depositProductsSearch|savingProductsSearch" src/app src/components`
3. 정규화 결합 점검:
   - `rg -n "baseList|optionList|fin_prdt_cd" src/lib/finlife src/app/api/finlife`
4. 추천/플래너 설명가능성 점검:
   - `rg -n "weight|score|assumptions|근거|참고 지표" src/lib/recommend src/lib/planner src/app/recommend src/app/planning`
5. 회귀 확인:
   - `pnpm lint`
   - `pnpm test`

## 재무설계 대시보드 (초안)
- 메인(`/`)은 재무설계 중심 대시보드로 구성한다: 플래너 시작, 오늘의 기준값(환율), 주거/혜택/청약 바로가기, 데이터 소스 상태.
- 외부 데이터가 미설정이어도 UI는 깨지지 않고 설정 안내를 노출한다.
- 데이터 소스 상태 페이지: `/settings/data-sources` (`/api/data-sources/status` 기반, 키 값 비노출).

## A. 한국수출입은행 환율 (P0)
- 사용자 가치: 외화 자산/여행 예산을 원화 기준으로 합산하고 변동성 가정을 반영한다.
- 플래너 반영: 환율 기준일(asOfDate) + 통화별 환산표 + 총 원화합계를 표시한다.
- UI 위치: `/planning` 환율 모듈, (선택) `/tools/fx`.
- 입력값: `pairs=USD:1000,JPY:50000`, `date`.
- 캐싱/주의: TTL 12h, 키 `fx + sorted params`; 비영업일 fallback 시 기준일을 명시.
- 신규 정규화 라우트: `GET /api/public/exchange?date=YYYYMMDD` → `{ base:\"KRW\", asOf, rates }`.
- 환율 API base URL은 코드 하드코딩 없이 `EXIM_EXCHANGE_API_URL` env에서만 읽는다.
- 실패 코드 분기:
  - `ENV_MISSING`: 키/URL 미설정
  - `ENV_INVALID_URL`: `https://` 미포함 또는 URL 형식 오류
  - `FETCH_FAILED`/`UPSTREAM_ERROR`: 업스트림 호출 실패
  - `NO_DATA`: 해당 날짜 데이터 없음(최근 7일 fallback 시도)
  - `SCHEMA_MISMATCH`: 응답 형식 변경으로 파싱 실패

## A-1. FINLIFE 서버 프록시 (P0)
- 원칙: 클라이언트는 `/api/finlife/*` 서버 프록시만 호출하고 FINLIFE 원본 API를 직접 호출하지 않는다.
- 지원 라우트:
  - `GET /api/finlife/company`
  - `GET /api/finlife/deposit`
  - `GET /api/finlife/saving`
  - `GET /api/finlife/pension`
  - `GET /api/finlife/mortgage-loan`
  - `GET /api/finlife/rent-house-loan`
  - `GET /api/finlife/credit-loan`
- UI 경로:
  - `/products/deposit`, `/products/saving`
  - `/products/mortgage-loan`
  - `/products/rent-house-loan`
  - `/products/credit-loan`
  - 연금저축은 현재 UI 페이지를 제공하지 않고 API(`GET /api/finlife/pension`)만 유지한다.
- 필수/선택 env:
  - `FINLIFE_API_KEY` (권장, 없으면 mock 모드)
  - `FINLIFE_BASE_URL` (optional, 기본 `https://finlife.fss.or.kr/finlifeapi`)
  - `FINLIFE_MODE` (optional: `auto|mock|live|fixture`)
  - `FINLIFE_FAIL_OPEN_TO_MOCK` (optional: `1|0`)
  - `FINLIFE_CACHE_TTL_SECONDS` (optional)
  - `FINLIFE_FIXTURE_DIR` (optional, 기본 `tmp/finlife-fixtures`)
  - `FINLIFE_RECORD_FIXTURES` (optional, `1`이면 live 성공 응답을 fixture로 저장)
- 정규화 원칙:
  - product 계열은 `result.baseList` + `result.optionList`를 `fin_prdt_cd`로 결합
  - 금리 필드(`intr_rate`,`intr_rate2`)가 없으면 `best`를 계산하지 않음
  - company는 별도 정규화(`companyId`,`companyName`,`raw`)
- 스키마 확정 절차:
  1. 각 라우트를 `pageNo=1`로 호출
  2. `raw.result`의 실제 키(baseList/optionList/필드명) 확인
  3. 키가 다르면 정규화 매핑/endpoint 파일명을 즉시 수정

### FINLIFE Record & Replay (오프라인 개발)
1. 네트워크 가능한 환경에서 `.env.local`에 `FINLIFE_API_KEY`를 설정한다.
2. `node scripts/smoke/finlife-sample.mjs --record`를 실행해 fixture를 저장한다.
3. `.env.local`에서 `FINLIFE_MODE=fixture`로 변경하고 앱을 실행한다.
4. 오프라인 환경에서도 `/api/finlife/*`가 fixture를 재생해 동일한 정규화 흐름으로 개발/테스트 가능하다.
5. 위 UI 경로(`/products/*`)에 접속해 목록/정렬/옵션 상세 렌더를 검증한다.

주의:
- fixture 파일에는 API 키/요청 URL 쿼리/토큰을 저장하지 않는다.
- fixture 저장은 개발 환경에서만 허용한다(`NODE_ENV=production`에서는 write 금지).
- 실응답 스키마가 변하면 fixture 재녹화가 필요하다.

### FINLIFE 스키마 리포트 (오프라인)
- dev route: `GET /api/dev/finlife/schema-report?topN=30` (production에서는 404)
- dev page: `/dev/finlife/schema`
- fixture 디렉토리(`FINLIFE_FIXTURE_DIR` 또는 `tmp/finlife-fixtures`)의 JSON만 읽어 kind별 `baseList/optionList` key 빈도를 반환한다.
- 리포트는 raw 원문 전체를 반환하지 않고 key/빈도만 제공하며, 민감 키명(`service|key|token|auth`)은 제외한다.

### FINLIFE 핵심 필드 승격
1. `/dev/finlife/schema`에서 kind별 빈도 상위 key를 확인한다.
2. `src/lib/finlife/fieldConfig.ts`에 `label/keys`를 추가한다.
3. 상품 row의 Highlights가 config를 우선 사용하고, 부족한 경우 휴리스틱 fallback으로 보강한다.
4. 실응답 필드가 확정되면 해당 key를 전용 컬럼으로 승격하고 fixture 테스트를 함께 갱신한다.

### FINLIFE 결과가 적어 보일 때 체크리스트
1. 상품 목록 헤더에서 `총건수 / 현재페이지 / 최대페이지 / 모드(live|fixture|mock)`를 먼저 확인한다.
2. fixture 모드라면 `node scripts/smoke/finlife-sample.mjs --record --all-groups --all-pages --delay-ms=200`로 권역/페이지를 넓게 녹화한다.
3. 특정 kind에서 `totalCount=0` 권역은 기본 UI에서 숨김 처리된다. 필요하면 `고급: 전체 권역`으로 확인한다.
4. fixture 미녹화 권역은 선택지에서 숨기고 안내 문구로만 노출한다.

### FINLIFE 사용자 표시 원칙
- 상품 상세의 `핵심 요약/가입·유의사항`은 소비자 라벨과 단위(개월, %)만 노출한다.
- 코드키(`intr_rate_type`, `fin_prdt_cd`, `fin_co_no`, `dcls_month`)는 기본 화면에서 숨긴다.
- `_nm` 필드가 있으면 코드 필드는 표시하지 않는다.
- 디버그/Raw JSON은 일반 사용자 UI에서 노출하지 않고, 개발자 도구 페이지(`/dev/data`, `/dev/public-apis`, `/dev/finlife/schema`)와 fixture로만 확인한다.
- 상품 상세는 `상세 보기` Drawer에서 `상품 안내 / 우대조건·유의사항 / 금리·옵션 / 계산기(예금·적금)` 섹션으로 제공한다.
- 필터는 실제 동작하며, 상품유형/우대조건은 자동 분류(키워드) 기반이다.
- 연금/대출 옵션 필드는 `/dev/finlife/schema` 확인 후 `fieldConfig/glossary`에 지속 보강한다.

## Data Sources Registry (P0/P1 토대)
- 코드: `src/lib/dataSources/registry.ts`
- P0: FINLIFE, MOLIT(매매/전월세), MOIS, REB, EXIM
- P1 토대: NPS, 실손보험, 퇴직연금(금융위/KDB), 금융회사기본정보, ECOS, FRED, KOSIS
- 각 소스는 `id/label/priority/env/status()`를 가지며 상태는 `configured|missing|error`.
- 스키마 미확정 API는 샘플 호출 후 normalize/필드 라벨을 확정한다.
- `/settings/data-sources`에서 P0 소스별 `연결 테스트`를 실행해 실제 호출 성공/실패와 요약(`asOf`, `count`)을 확인한다.
- dev에서는 최근 연결 확인 결과를 카드 안에 저장해, 확인 시각과 주요 기준값을 새로고침 뒤에도 다시 볼 수 있게 한다.
- 같은 dev 확인 결과를 `사용자 도움 연결` 카드에도 read-only로 묶어, 어떤 사용자 질문 축이 최근에 실제 호출로 확인됐는지 한 화면에서 같이 판단한다.
- 같은 화면에서 각 API가 어떤 사용자 질문을 돕는지와, 직접 노출 전 확장 후보가 무엇인지 함께 설명한다.
- 같은 화면의 사용자 도움 카드에는 `활용 기준`과 `기준 시점`을 같이 노출해, 참고용 데이터인지와 언제 기준인지 한 번에 이해되게 한다.
- ping 버튼이 없는 OPENDART/planning 카드는 `/api/dev/data-sources/health`를 바탕으로 저장된 최신 기준 시각(read-only)을 같이 보여준다.
- production에서는 `운영 최신 기준`만 유지하고, `최근 연결 확인`과 fallback/쿨다운 진단은 dev 운영 화면으로 제한한다.
- 확장 후보 카드에는 `노출 전 체크`를 붙여 운영 검토 없이 바로 사용자 화면에 올리지 않도록 한다.
- optional-only 소스는 값이 비어 있으면 `configured`로 보지 않고 `선택 ENV 미설정`으로 표시한다.
- 연결 테스트는 개발 환경 전용 라우트(`/api/dev/data-sources/ping`)를 사용하며, production에서는 비활성화된다.
- 운영 순서는 `docs/data-sources-settings-ops.md`를 단일 체크리스트로 유지한다.
- `/settings/data-sources` 회귀는 기본 RC 묶음(`pnpm e2e:rc`)에 포함하고, 화면만 빠르게 다시 확인할 때는 `pnpm e2e:rc:data-sources`를 사용한다.

### 환율이 안 뜰 때 체크리스트
1. `EXIM_EXCHANGE_API_URL`은 샘플 URL 전체가 아니라 `origin + pathname`만 입력한다(쿼리 제거).
2. `.env.local` 수정 후 `pnpm dev`를 재시작한다.
3. `/settings/data-sources`에서 `국토부 실거래(매매)` 연결 테스트를 실행한다.
4. 주말/공휴일에는 최근 7일 내 영업일 데이터로 자동 fallback될 수 있다.

### 실거래·주거비 벤치마크 UX
- 지역 선택은 `시/도 → 시군구` 2단계로 제공한다.
- 지원 범위: 서울특별시, 부산/대구/인천/광주/대전/울산 광역시, 세종특별자치시.
- 결과 카드는 `입력 대비 중앙값 차이`를 문장으로 안내하고, 표본 건수가 적으면 경고를 표시한다.
- 국토부 실거래 금액은 원자료의 만원 단위를 원으로 환산해(`*10,000`) 화면/비교 계산 단위를 통일한다.

### FINLIFE 로고/404 노이즈
- `/providers/*.svg|png` 정적 파일 요청은 기본 비활성화하고 텍스트 아바타(권역 약칭/초성)로 대체한다.
- 개발 로그에서 provider 이미지 404가 반복되면 이미지 요청 경로가 다시 생겼는지 확인한다.

## B. 국토부 아파트 매매 실거래 (P0)
- 사용자 가치: 내집마련 목표금액의 현실성(중앙값 대비 괴리)을 점검한다.
- 플래너 반영: 지역/월/면적대 기준 `min/median/p75/max` 카드 표시.
- UI 위치: `/planning` 벤치마크 모듈(전용 매매 화면 경로는 현재 미제공).
- 입력값: `regionCode`, `month(YYYYMM)`, `areaBand`.
- 캐싱/주의: TTL 14d~30d, 트래픽 절감을 위해 파라미터별 캐시 강제.
- 엔드포인트: `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade` + `getRTMSDataSvcAptTrade`.
- 성공 코드 처리: `resultCode`는 `00`뿐 아니라 `000`(all-zero 계열)도 성공으로 처리한다.
- 면적대 가정: `areaBand`는 대표 전용면적(㎡)으로 해석하고 `±10㎡` 허용 범위를 적용한다.

## C. 국토부 아파트 전월세 실거래 (P0)
- 사용자 가치: 현재 주거비/보증금이 유사 조건 대비 과다인지 점검한다.
- 플래너 반영: 전월세 유형 벤치마크와 현재값 비교 경고를 제공한다.
- UI 위치: 플래너 주거비 점검 카드(전용 전월세 화면 경로는 현재 미제공).
- 입력값: `regionCode`, `month`, `areaBand`, `rentType`.
- 캐싱/주의: TTL 14d~30d, 비교값은 참고치이며 개별 계약 조건 반영 필요.
- 현재 구현: 플래너 3단계에서 전세/월세 선택 + 보증금/월세 분리 요약(중앙값/범위) + 선택 입력 대비 괴리율(%)을 제공.
- 엔드포인트: `https://apis.data.go.kr/1613000/RTMSDataSvcAptRent` + `getRTMSDataSvcAptRent`.
- 성공 코드 처리: `resultCode`는 `00`뿐 아니라 `000`(all-zero 계열)도 성공으로 처리한다.
- 면적대 가정: `areaBand`는 대표 전용면적(㎡)으로 해석하고 `±10㎡` 허용 범위를 적용한다.
- XML 파싱 주의: 네트워크 제한 환경에서는 외부 XML 라이브러리 없이 경량 MOLIT 전용 파서를 사용하며, CDATA/엔티티/self-closing 태그를 방어적으로 처리한다.
- 면적 키 변형 대응: `AREA_KEYS` 우선 + 키 패턴 fallback(`전용|면적|exclu|exclusive|area`)을 사용한다.
- 운영 가이드: 응답 필드명이 추가 변형되면 `AREA_KEYS`를 확장하고 fixture 테스트를 함께 추가한다.

## D. 행안부 보조금24 공공서비스 (P0)
- 사용자 가치: 지출 절감/현금흐름 개선 후보(혜택)를 제시한다.
- 플래너 반영: 혜택 적용 여부를 가정값으로 노출하고 월 영향액을 사용자가 조정한다.
- UI 위치: `/benefits` 검색 + 플래너 추천 카드.
- 입력값: `query`, (추후) 가구/연령/지역 필터.
- 캐싱/주의: TTL 1d~7d, 응답 항목 변경 대비 런타임 파서 검증 필요.
- 현재 구현: `/benefits?q=주거` 형태로 직접 진입 가능하며, 쿼리 우선으로 카테고리/지역 프리셋을 반영한다.
- 검색 전략: 업스트림 `cond[서비스명::LIKE]` 우선, 0건 시 `cond[서비스분야::LIKE]` 재시도, 이후 로컬 스캔 fallback.
- 0건 분기: `업스트림 0건` vs `매칭 0건` vs `오류(error.code)`를 분리 표시.
- 상세: `/api/public/benefits/item?serviceId=...` 기반 Drawer 제공.

### Planner -> Benefits/Subscription 매핑 규칙 (P1-1)
- 플래너 액션 딥링크는 쿼리 표준을 고정한다.
- 혜택: `q`, `category`, `region`, `ageBand`, `incomeBand` (예: `/benefits?q=주거비&category=housing&region=전국`).
- 청약: `region`, `type`, `priority` (예: `/housing/subscription?region=서울&type=apt&priority=housing-cost`).
- 쿼리 파라미터는 각 페이지의 기본값/저장값보다 우선 적용한다.
- 두 페이지 모두 결과 상단에 조건 요약(3줄)과 다음 행동 체크리스트를 표시한다.
- 실패는 `ok:false + error.code/message(+debug)` 규격을 유지하고, 0건은 설정/필터 완화 안내로 degrade 한다.

## E. 한국부동산원 청약홈 분양정보 (P1)
- 사용자 가치: 청약 목표 사용자의 일정/공고 확인 루틴을 강화한다.
- 플래너 반영: 청약 목표일 때 실행 체크리스트와 최근 공고를 노출한다.
- UI 위치: `/housing/subscription`.
- 입력값: `region`, `dateRange`.
- 캐싱/주의: TTL 6h~24h, 일정 변동 가능성을 문구로 고지.
- 현재 구현: `/housing/subscription?region=서울` 형태로 직접 진입 가능하며, 플래너 4단계에서 청약/분양 일정 보기 액션 제공.
- 지역 매칭: 지역명 + 코드(예: `11000 -> 서울`) 혼합 대응 후 2차 필터링.
- 조회 파라미터: `region`, `houseType(apt|urbty|remndr)`, `from`, `to`, `q`.
- 0건 분기: `업스트림 0건` vs `매칭 0건`을 구분하고 `availableRegionsTop` 예시 제공.

## F. 금융감독원 공시정보 기업개황 (P1)
- 사용자 가치: 투자/관심 기업의 기본 개황(업종/대표/홈페이지)을 조회한다.
- 플래너 반영: 투자자산 보조정보 패널에서 기업 기본정보 제공.
- UI 위치: `/invest/companies` (내부적으로 `/api/public/disclosure/company` 사용).
- 입력값: `corpCode`.
- 캐싱/주의: TTL 30d~90d, 투자 판단 유도 문구 금지.

## 정규화 데이터 계약 (초안)
- `ExchangeRateQuote { asOfDate, currency, base:"KRW", rate, source, fetchedAt }`
- `HousingBenchmark { regionCode, month, areaBand, dealType, count, min, median, p75, max, unit:"KRW", rentType?, monthlyMedian?, source, fetchedAt }`
- `BenefitCandidate { id, title, summary, eligibilityHints, applyHow?, org?, lastUpdated?, source, fetchedAt }`
- `SubscriptionNotice { id, title, region, applyStart?, applyEnd?, supplyType?, sizeHints?, link?, source, fetchedAt }`
- `CompanyProfile { corpCode, corpName, stockCode?, industry?, ceo?, homepage?, address?, updatedAt?, source, fetchedAt }`

## 가정값/근거 노출 방식
- 플래너 카드마다 `assumptions.note`를 표시한다.
- 데이터 기준일(`asOfDate`/`month`/`fetchedAt`)을 함께 노출한다.
- 모든 계산 결과는 “참고 지표”임을 명시한다.

## 캐시 정책
- 키: `sha256(apiName + stableSortedParams + version)`
- TTL 제안:
  - 환율 12h
  - 매매/전월세 14d
  - 혜택 2d
  - 청약 12h
  - 기업개황 24h(현재 route) / 향후 30d+
- 캐시 스토어:
  - 기본(dev): memory + file(hybrid), 파일 경로 `tmp/api-cache/**`
  - 기본(prod): memory
  - override: `API_CACHE_STORE=file|memory|hybrid`

## Dev 진단 페이지
- 경로: `/dev/public-apis` (dev 전용, production에서는 404)
- 상태 API: `GET /api/dev/public-apis/status`
  - env 상태는 `present/missing`만 표시(키 값 비노출)
  - `.env.local` 파일 존재 여부, 파일 기준 missing 키, 재시작 필요 키(`keysNotLoadedYet`) 표시
  - `urlValidation`으로 `*_API_URL` 형태 검증(프로토콜/쿼리/키파라미터 흔적) 경고 표시
  - cache mode/dir/file count/size 요약 표시
- 샘플 API: `POST /api/dev/public-apis/sample`
  - body: `{ "apiName": "...", "params": { ... } }`
  - 성공 시 정규화 payload + cache hit/miss + 샘플 파일 경로 반환
- 권장 루프:
  0. `pnpm env:setup`으로 `.env.local.example`에서 `.env.local` 생성
  1. `.env.local`에 키/URL 설정
  2. `/dev/public-apis`에서 `present` 확인
  3. `pnpm dev` 재시작(Next는 시작 시 env 로드)
  4. 샘플 호출 버튼 실행
  5. `tmp/api-samples/**` 생성 파일 확인
- CLI 도구:
  - `pnpm env:setup`: `.env.local`이 없을 때만 템플릿 복사(덮어쓰기 없음)
  - `pnpm env:doctor`: 필수 키 missing + URL 형태 점검(누락/형식 오류 시 exit 1)
- URL 입력 실수 방지:
  - API_URL에는 `origin + pathname` 형태의 base URL만 입력한다(쿼리 금지).
  - 포털에서 복사한 샘플 URL은 `/dev/public-apis`의 URL Wizard에 붙여넣어 base URL로 변환 후 사용한다.
  - Wizard는 키/토큰성 쿼리 값(`serviceKey`, `crtfc_key`, `authkey`, `token`)을 자동 마스킹한다.
  - REB(청약홈 ODcloud) 기준: 포털 Base URL이 `api.odcloud.kr/api`로 보이면 env에는 반드시 `https://api.odcloud.kr/api`로 입력한다.
  - ODcloud 계열(MOIS/REB)은 base-only(`https://api.odcloud.kr/api`) 입력을 허용하며, 서버에서 endpoint를 자동 보완한다.
    - MOIS 자동 보완: `/gov24/v3/serviceList`
    - REB 자동 보완: `/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail`
  - MOLIT(실거래)은 ODcloud가 아니라 `apis.data.go.kr` 계열 base URL을 사용한다.
  - MOLIT `*_API_URL`은 base URL 입력을 권장하지만 full endpoint를 넣어도 suffix 중복 없이 동작한다.
  - MOLIT `serviceKey`는 Encoding/Decoding 키 모두 허용하며, 이미 인코딩된 값(`%xx`)은 재인코딩하지 않는다.

### URL 설정 런북 (REB/MOIS/MOLIT 공통)
1. Swagger UI에서 `Schemes`를 `HTTPS`로 선택한다.
2. 인증(자물쇠/Authorize)에서 API Key를 넣는다.
3. 임의 GET를 `Try it out` → `Execute` 해서 `Request URL`을 확인한다.
4. `Request URL`을 `/dev/public-apis`의 URL Wizard에 붙여넣는다.
5. Wizard가 추출한 base URL(`origin + pathname`, query 제거)을 `.env.local`의 `*_API_URL`에 넣는다.

예시 (`.env.local`):
```env
REB_SUBSCRIPTION_API_KEY=""
REB_SUBSCRIPTION_API_URL="https://api.odcloud.kr/api"

MOIS_BENEFITS_API_KEY=""
MOIS_BENEFITS_API_URL="https://api.odcloud.kr/api"

MOLIT_SALES_API_KEY=""
MOLIT_SALES_API_URL="https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade"

MOLIT_RENT_API_KEY=""
MOLIT_RENT_API_URL="https://apis.data.go.kr/1613000/RTMSDataSvcAptRent"
```

주의:
- Swagger 문서 URL(`.../api-docs`)은 호출 베이스 URL이 아니다.
- `infuser.odcloud.kr/.../api-docs`를 API_URL에 넣으면 `ENV_DOC_URL`로 차단하고 호출 URL 예시를 안내한다.
- 키 값은 `.env.local`에만 보관하고 로그/커밋/클라이언트에 노출하지 않는다.
- 키 목록 일관성:
  - `/api/dev/public-apis/status`, `/api/dev/public-apis/sample`, `scripts/smoke/public-apis-sample.mjs`는 같은 env 키명을 사용한다.

### OpenDART corpCodes 인덱스 운영
- 인덱스 생성: `python3 scripts/dart_corpcode_build.py` (또는 `pnpm dart:corpindex`).
- 출력 경로 우선순위: `--out` > `DART_CORPCODES_INDEX_PATH` > 기본 `tmp/dart/corpCodes.index.json`.
- 런타임 로딩 우선순위: `DART_CORPCODES_INDEX_PATH` > `tmp/dart/corpCodes.index.json` > 레거시 `src/data/dart/corpCodes.json`.
- 검색 API: `GET /api/public/disclosure/corpcodes/search?query=삼성&sort=name&limit=50`.
- 상태 API: `GET /api/public/disclosure/corpcodes/status` → `{ exists, primaryPath, triedPaths, meta }`.
- 인덱스 미생성 시: `409 CORPCODES_INDEX_MISSING`는 “XML/ZIP이라 불가”가 아니라 “인덱스 1회 미생성/미로드” 상태이며, `buildEndpoint/statusEndpoint/primaryPath/triedPaths`를 함께 반환한다.
- UI 자동 생성: `/invest/companies`에서 409 상태일 때 `인덱스 자동 생성(1회)` 버튼을 항상 노출하고, 비활성 시 사유를 표시한다.
- 자동 생성 API: `POST /api/public/disclosure/corpcodes/build` (내부에서 `scripts/dart_corpcode_build.py --out <resolvedPath>` 실행).
- 빌드 후 즉시 반영: build 성공 직후 서버 `corpIndex` 캐시를 invalidate하여 다음 검색에서 재로딩되게 한다.
- 수동 생성 명령: `python3 scripts/dart_corpcode_build.py` 또는 `DART_CORPCODES_INDEX_PATH=tmp/dart/corpCodes.index.json python3 scripts/dart_corpcode_build.py`.
- (선택) dev 자동 보장: `pnpm dart:ensure-corpindex` (인덱스 없을 때만 생성 시도, 키/파이썬 미존재 시 skip).
- 운영 보호 정책: `NODE_ENV=production`에서는 `DART_INDEX_BUILD_TOKEN`이 설정되고 `x-build-token` 헤더가 일치할 때만 허용(그 외 403).
- 배포 주의: 인덱스를 `src/**`에 둘 경우 번들/파일 트레이싱 정책에 따라 포함/접근 이슈가 생길 수 있으므로 기본 `tmp/dart/**`를 권장.
- 키 관리: `OPENDART_API_KEY`는 `.env.local` 서버 env에서만 사용하고 커밋/클라이언트 노출 금지.

### OpenDART DS001 엔드포인트/파라미터 정합
- 기본 BASE URL: `OPENDART_BASE_URL` (기본값 `https://opendart.fss.or.kr`), 실제 호출은 `${BASE}/api/*` 경로 사용.
- 고유번호(corpCode): `GET /api/corpCode.xml?crtfc_key=...` (ZIP binary).
- 기업개황(company): `GET /api/company.json?crtfc_key=...&corp_code=...`.
- 공시검색(list): `GET /api/list.json?crtfc_key=...` + 옵션 `corp_code,bgn_de,end_de,last_reprt_at,pblntf_ty,pblntf_detail_ty,corp_cls,sort,sort_mth,page_no,page_count`.
- list 기간 정책: `corp_code` 미지정 시 서버가 `bgn_de`를 `end_de` 기준 3개월 이내로 자동 클램프하고 `assumptions`에 기록.

### OpenDART status → HTTP 매핑 정책
- `000`: 성공(200).
- `013`: 조회 데이터 없음. `company`는 404, `list`는 200 + 빈 목록(`items=[]`).
- `020`: 429(요청 제한 초과).
- `010`: 401(미등록 키).
- `011/012/901`: 403(권한 오류).
- `800`: 503(점검).
- `900/기타`: 502(업스트림 오류).
- 보안: `crtfc_key`는 서버 env(`.env.local`)에서만 사용, 로그/클라이언트/응답에 원문 노출 금지.
