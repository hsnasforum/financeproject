# Contributing: Planning SSOT Rules

Planning v2/v3 변경 시 아래 SSOT(single source of truth) 규칙을 따릅니다.

## 1) Warning/Action 추가 방법

### Warning 코드 추가
1. 엔진/파이프라인에서 warning code를 emit 합니다.
2. 카탈로그에 매핑을 추가합니다.
   - `src/lib/planning/catalog/warningCatalog.ts`
   - `PLANNING_EMITTED_WARNING_CODES` 배열 포함
3. 사용자 문구/설명은 카탈로그/템플릿만 사용합니다.
   - `src/lib/planning/catalog/copyTemplates.ts`
4. UI/리포트에서 warning code -> 문구 변환은 카탈로그 resolver만 사용합니다.
   - `resolveWarningCatalog`, `warningFallbackMessage`

### Action 추가
1. 액션 id/code를 정의합니다.
2. 카탈로그에 title/description/steps/href를 추가합니다.
   - `src/lib/planning/catalog/actionCatalog.ts`
3. warning -> suggestedActionId 연결이 필요하면 warning catalog에서 연결합니다.
4. “단정 추천” 문구는 금지하고 비교/행동 단계만 제공합니다.

## 2) Metric + Evidence 추가 방법

### 원칙
- 계산 로직은 `src/lib/planning/calc/*` 에만 둡니다.
- 리포트/해석/UI는 calc 결과를 소비만 합니다.
- metric에는 evidence를 함께 제공합니다.

### 절차
1. 계산/반올림/세율 규칙을 SSOT에 추가
   - `src/lib/planning/calc/` (`interest.ts`, `amortization.ts`, `roundingPolicy.ts`, `taxPolicy.ts`)
2. evidence builder 추가
   - `src/lib/planning/calc/evidence.ts`
3. VM 계층에서 evidence 연결
   - `src/app/planning/reports/_lib/reportViewModel.ts`
   - `src/lib/planning/v2/insights/interpretationVm.ts`
4. UI는 evidence 객체를 렌더링만 수행 (공식/입력/가정 표시)

## 3) Required tests/gates

기본:
- `pnpm test`
- `pnpm planning:v2:complete`
- `pnpm planning:v2:compat`

SSOT 규칙:
- `pnpm planning:v2:ssot:guard`

권장(변경 영향 시):
- 리포트: `pnpm planning:v2:report:test`
- 해석 가이드: `pnpm planning:v2:guide:test`
- 회귀: `pnpm planning:v2:regress`

## 4) 금지 규칙 (lint-like guard 대상)

- 카탈로그 외부에서 warning 문구 하드코딩 금지
  - 예: `"경고가 감지되었습니다."`, `"알 수 없는 경고(...)"`
- calc SSOT 외부에서 핵심 계산식 중복 구현 금지
  - 월잉여/DSR/비상금개월/이자추정식
- warning source(`warningGlossary.ko`, `warningsCatalog.ko`) 직접 참조 금지
  - catalog/core 계층만 허용

## 5) 체크리스트 (PR 전)

- [ ] warning/action/policy/copy 변경이 SSOT 파일에만 반영됨
- [ ] metric 변경 시 evidence와 함께 제공됨
- [ ] `pnpm planning:v2:ssot:guard` 통과
- [ ] required gates(`test`, `complete`, `compat`) 통과 로그 확보

