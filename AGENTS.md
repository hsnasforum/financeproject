# AGENTS.md — financeproject (Codex 작업 지침)

## 0) 이 프로젝트가 하는 일(제품 기준)
- 개인용 재무설계/플래닝 웹앱입니다. 사용자는 비전문가를 전제로 합니다.
- 목표: (1) 데이터 소스가 일부 미설정이어도 UI가 깨지지 않고 안내가 나온다 (2) 결과는 “참고 지표”로 설명 가능해야 한다.
- 금지: 확정 수익/확정 절감처럼 보이는 문구, 투자 판단을 유도하는 문구.

## 1) 기술 스택/실행 규칙
- Next.js(App Router) + TypeScript, 패키지 매니저는 pnpm.
- 개발 실행은 `pnpm dev`만 사용합니다(프로젝트의 안전한 host/port 선택 래퍼 포함).
- 기본 검증 루틴(PR 올리기 전 반드시):
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - E2E가 영향 받으면: `pnpm e2e:rc` (필요 시)

  - 작업 중(로컬 WIP) 최소 검증(속도 우선, 다만 “깨질 축”은 막기):
  - 순수 로직/타입/테스트 변경: `pnpm test`
  - Next route/page/build 관련 변경(특히 src/app/**): `pnpm build`
  - React 훅/린트 규칙 영향: `pnpm lint`
  - e2e 셀렉터/플로우 영향: `pnpm e2e:rc`

## 2) 화면/경로(링크 깨짐 방지)
- “실존 경로 목록”은 `docs/current-screens.md`가 소스 오브 트루스입니다.
- 헤더/홈/문서의 내부 링크(`href`)는 해당 문서에 적힌 경로만 가리켜야 합니다.
- `/api/dev/*` 및 Dev/Debug 화면은 production에서 기본 차단(404) 전제로 작업합니다.

## 3) 외부 API/보안(절대 규칙)
- 로컬 전용(local-only) 전제: 127.0.0.1 바인딩 + same-origin + CSRF 가드 유지, 외부 텔레메트리/트래킹 금지.
- 모든 외부 API 호출은 서버 Route Handler(`src/app/api/**/route.ts`)에서만 수행합니다.
- API 키/토큰은 서버 env(`.env.local`)에서만 사용합니다.
- 금지:
  - 클라이언트 번들/응답 JSON/로그에 키 원문 노출
  - `NEXT_PUBLIC_*`로 키 전달
  - 샘플 URL(쿼리 포함)을 그대로 `*_API_URL`에 넣는 행위
- 환경 세팅:
  - `.env.local` 생성: `pnpm env:setup`
  - 누락/형식 점검: `pnpm env:doctor` (실패 시 exit 1)

## 4) 데이터 소스 레지스트리/상태 표준
- 데이터 소스는 `src/lib/dataSources/registry.ts`의 `DATA_SOURCES`에 등록합니다.
- 상태는 `configured|missing|error`로 표준화하고, UI에서는 “키 값 자체”가 아닌 상태/요약만 노출합니다.
- 연결 테스트는 dev 전용 라우트를 사용하고, production에서는 비활성(404)되는 계약을 지킵니다.

## 5) 정규화/캐시/표시 원칙(UX 핵심)
- 외부 응답은 그대로 화면에 뿌리지 말고 “정규화 타입”으로 변환해서 재사용합니다.
- 일반 사용자 UI에서 Raw JSON은 숨깁니다.
  - Raw/스키마 확인은 Dev 페이지/fixture로만 확인합니다.
- 계산/추천/비교 결과는 “근거(assumptions/기준일/가중치)”가 같이 노출되어야 합니다.
- 캐시:
  - 파라미터별 캐시를 강제해 트래픽/지연을 줄입니다.
  - dev에서는 file/memory 하이브리드 캐시를 사용할 수 있고, prod는 memory 중심으로 가정합니다.
  - 캐시 키는 “정렬된 파라미터 + 버전” 기반으로 안정적으로 생성합니다.

## 6) FINLIFE(금융상품) 작업 규칙
- FINLIFE 응답 스키마를 추측하지 않습니다.
  - 먼저 `pageNo=1` 샘플 호출로 실제 키를 확인 후 타입/정규화를 확정합니다.
- product 계열은 `baseList` + `optionList`를 `fin_prdt_cd`로 결합하는 흐름을 유지합니다.
- 오프라인 개발:
  - fixture record/replay 플로우를 깨지 않도록 유지합니다(네트워크 불가 환경 대비).
- 사용자 표시:
  - 코드키(예: intr_rate_type, fin_prdt_cd 등)는 기본 화면에서 숨기고 `_nm` 계열 등 라벨 우선으로 보여줍니다.
  - 옵션/필드 라벨은 `src/lib/finlife/fieldConfig.ts`를 보강해 “용어/도움말”로 설명 가능하게 만듭니다.

## 7) OpenDART(공시) 작업 규칙
- corpCodes 인덱스는 빌드/런타임 경로 정책을 지킵니다(기본 tmp 경로 가정).
- production에서 인덱스 생성 같은 위험 동작은 토큰/헤더 게이트가 있는 경우에만 허용합니다.
- 업스트림 status → HTTP 매핑/에러 분기 규칙을 임의로 바꾸지 않습니다.

## 8) Planning v2 / 리포트 / 운영(해당 작업 시)
- Planning v2는 제공된 스크립트/게이트를 우선 사용합니다:
  - doctor/guard/smoke/acceptance/complete/ops 등
- “완료 판정”을 스크립트 기반으로 남기고, 리포트는 사람이 읽는 형태(요약→근거→다음 액션)로 유지합니다.
- 범위 밖 변경은 커밋/PR을 분리합니다.

## 8.5) Planning v3 (현재 진행)
- v3 개발 경로: `src/lib/planning/v3/**`, `src/app/api/planning/v3/**` (v2 코어 수정은 PR 분리)
- v3는 “draft only” 원칙:
- 자동 저장/자동 실행/기존 v2 store 자동 수정 금지 (이번 단계는 “초안 생성/반환”까지만)
- CSV/거래내역은 민감 데이터일 수 있음:
- 원문 CSV/원문 거래내역을 로그/metrics/support bundle/응답에 그대로 출력 금지
- 결정성(determinism):
- 파싱/집계/초안 생성은 vitest로 결정적으로 고정(시간/랜덤/환경 의존 제거)

## 9) 작업 방식(리뷰 가능 산출물)
- 변경 전:
  1) 바꿀 파일 목록
  2) 변경 이유(사용자 가치/버그/리스크)
  3) 검증 명령(로컬에서 무엇을 돌릴지)
- 변경 후:
  - 무엇이 바뀌었는지(핵심 5줄 이내)
  - 재현/검증 방법
  - 남은 리스크/엣지케이스

## 9.5) PR/CI 운영(최소)
- “머지”는 필수 체크가 전부 green + PR이 목표 범위를 만족할 때만.
- 작업 중인 PR은 Draft로 두고, 의미 있는 단위(리뷰 가능한 상태)에서만 Ready로 전환.
- e2e 안정성을 위해 UI 셀렉터는 가능하면 `data-testid` 기반으로 유지/추가(문구/레이아웃 변화에 덜 깨지게).

## 10) 빠른 점검(키 노출/직접 호출 방지)
- 키/토큰 노출 점검(예시): `rg -n "FINLIFE_API_KEY|NEXT_PUBLIC_.*FINLIFE|crtfc_key|serviceKey" src`
- FINLIFE 원본 직접 호출 금지 점검(예시): `rg -n "finlife\\.fss\\.or\\.kr|depositProductsSearch|savingProductsSearch" src/app src/components`
- 정규화 결합 점검(예시): `rg -n "baseList|optionList|fin_prdt_cd" src/lib/finlife src/app/api/finlife`

(끝)