# Planning v3 Migration Guide

이 문서는 Planning v2에서 v3로 확장할 때 바뀌지 않아야 할 계약과 확장 지점을 고정합니다.

## v2 고정 계약

- 입력 계약: `ProfileV2`, `horizonMonths`, `assumptions(override)`, `snapshotId(optional)`
- 출력 계약: `{ ok, meta, data }` 형태 유지
- 메타 계약:
  - `meta.generatedAt`
  - `meta.snapshot { id?, asOf?, fetchedAt?, missing, warningsCount?, sourcesCount? }`
  - `meta.health` / `meta.cache` (있는 경우)
- 저장 계약:
  - profile/run record는 `version` 필드 기반 관리
  - run은 `profileId` 참조 중심(프로필 중복 저장 금지)

## v3에서 확장 가능한 영역

- 계좌 연동(은행/증권/연금) 데이터 소스
- 세금/보험/공적급여 정밀 모델
- 고급 최적화(목표함수/제약식 기반 자산배분)
- 고도화된 리스크 모델(분포/상관구조)
- 운영 자동화(배치/리포트/대시보드)

## Provider / Service 확장 포인트

- Assumptions Provider:
  - 파일 스냅샷 기반 구현을 기본으로 유지
  - v3에서 외부 source를 추가해도 엔진 내부는 순수 함수 유지
- Product Candidates Provider:
  - 후보 비교만 반환(단정 추천 금지)
  - 서버 전용 호출 경계 유지
- Debt Strategy Provider:
  - 수학 비교 엔진을 인터페이스 뒤로 분리
- Tax/Pension Provider:
  - v2에서는 placeholder provider(`applied=false`)만 제공
  - `tax/pensionsDetailed` 입력은 저장/검증만 수행하고 계산에는 자동 반영하지 않음
  - v3에서 `computeNetIncome`, `computePensionFlows` 같은 함수로 확장 예정
- Planning Service:
  - API route는 service 호출만 수행하는 얇은 계층 유지
  - 공통 흐름(가정 주입, health, 캐시 키)을 한 경로로 유지

## Policy 경계선

- 기본 모드: `private-local`
- v2는 local-only 정책 유지
- v3 사용자 화면(`planning/v3/*`)이 직접 호출하는 API는 same-origin + CSRF를 기본 경계로 유지하고, local-only는 ops/admin 또는 명시적 내부 경로에만 둡니다.
- `public` 모드는 정책 정의만 존재하며, 실제 완화는 별도 보안 검토 후 적용

## 호환성 원칙

- `profiles/runs/assumptions`는 `version` 필드로 마이그레이션
- 하위호환 우선:
  - 기존 run 조회 실패를 유발하는 강제 변경 금지
  - 신규 필드는 optional 추가 우선
- 회귀 게이트(`planning:v2:regress`) 통과 없이 baseline 갱신 금지

## 정밀 세금/연금에 대한 현재 원칙(v2)

- v2 엔진은 여전히 입력 기반 근사(실수령/실지출) 모델입니다.
- 정밀 세금/연금 계산은 코어에 하드코딩하지 않습니다.
- 관련 입력(`ProfileV2.tax`, `ProfileV2.pensionsDetailed`)은 future-proof 저장 스키마로만 유지됩니다.
- 결과에는 “정밀 세금/연금 계산 미적용” 안내 note를 포함해 오해를 방지합니다.
