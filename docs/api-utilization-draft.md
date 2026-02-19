# API Utilization Draft (MVP)

## 공통 원칙
- 모든 외부 API 호출은 서버 Route Handler(`app/api/**/route.ts`)에서만 수행한다.
- 키는 서버 env만 사용하며, 클라이언트/응답/로그에 키 원문을 노출하지 않는다.
- 응답은 정규화 타입으로 변환해 플래너/추천에서 재사용한다.
- 결과는 참고 지표이며 확정 수익/확정 절감 표현을 사용하지 않는다.

## A. 한국수출입은행 환율 (P0)
- 사용자 가치: 외화 자산/여행 예산을 원화 기준으로 합산하고 변동성 가정을 반영한다.
- 플래너 반영: 환율 기준일(asOfDate) + 통화별 환산표 + 총 원화합계를 표시한다.
- UI 위치: `/planner` 환율 모듈, (선택) `/tools/fx`.
- 입력값: `pairs=USD:1000,JPY:50000`, `date`.
- 캐싱/주의: TTL 12h, 키 `fx + sorted params`; 비영업일 fallback 시 기준일을 명시.

## B. 국토부 아파트 매매 실거래 (P0)
- 사용자 가치: 내집마련 목표금액의 현실성(중앙값 대비 괴리)을 점검한다.
- 플래너 반영: 지역/월/면적대 기준 `min/median/p75/max` 카드 표시.
- UI 위치: `/planner` 벤치마크 모듈, (선택) `/housing/sales`.
- 입력값: `regionCode`, `month(YYYYMM)`, `areaBand`.
- 캐싱/주의: TTL 14d~30d, 트래픽 절감을 위해 파라미터별 캐시 강제.
- 엔드포인트: `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade` + `getRTMSDataSvcAptTrade`.
- 면적대 가정: `areaBand`는 대표 전용면적(㎡)으로 해석하고 `±10㎡` 허용 범위를 적용한다.

## C. 국토부 아파트 전월세 실거래 (P0)
- 사용자 가치: 현재 주거비/보증금이 유사 조건 대비 과다인지 점검한다.
- 플래너 반영: 전월세 유형 벤치마크와 현재값 비교 경고를 제공한다.
- UI 위치: (선택) `/housing/rent` + 플래너 주거비 점검 카드.
- 입력값: `regionCode`, `month`, `areaBand`, `rentType`.
- 캐싱/주의: TTL 14d~30d, 비교값은 참고치이며 개별 계약 조건 반영 필요.
- 현재 구현: 플래너 3단계에서 전세/월세 선택 + 보증금/월세 분리 요약(중앙값/범위) + 선택 입력 대비 괴리율(%)을 제공.
- 엔드포인트: `https://apis.data.go.kr/1613000/RTMSDataSvcAptRent` + `getRTMSDataSvcAptRent`.
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
- 현재 구현: `/benefits?query=주거` 형태로 직접 진입 가능하며, 플래너 4단계에서 추천 쿼리 버튼으로 빠른 보기/새 탭 연동.

## E. 한국부동산원 청약홈 분양정보 (P1)
- 사용자 가치: 청약 목표 사용자의 일정/공고 확인 루틴을 강화한다.
- 플래너 반영: 청약 목표일 때 실행 체크리스트와 최근 공고를 노출한다.
- UI 위치: `/housing/subscription`.
- 입력값: `region`, `dateRange`.
- 캐싱/주의: TTL 6h~24h, 일정 변동 가능성을 문구로 고지.
- 현재 구현: `/housing/subscription?region=서울` 형태로 직접 진입 가능하며, 플래너 4단계에서 청약/분양 일정 보기 액션 제공.

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
MOIS_BENEFITS_API_URL="https://(포털 Base URL)"

MOLIT_SALES_API_KEY=""
MOLIT_SALES_API_URL="https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade"

MOLIT_RENT_API_KEY=""
MOLIT_RENT_API_URL="https://apis.data.go.kr/1613000/RTMSDataSvcAptRent"
```

주의:
- Swagger 문서 URL(`.../api-docs`)은 호출 베이스 URL이 아니다.
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
