# Planning v2 Developer Guide

## Catalog SSOT
- 경로: `src/lib/planning/catalog/`
- 단일 기준 소스:
  - `warningCatalog.ts`: 경고 코드 -> 사람말/권장 actionId
  - `actionCatalog.ts`: actionId -> 설명/실행 단계/링크
  - `planningPolicy.ts`: 판정 기준 임계치
  - `copyTemplates.ts`: 단위/톤/문구 템플릿

## 새 Warning 코드 추가 방법
1. 코드가 실제 엔진/파이프라인에서 발생하도록 구현합니다.
2. `src/lib/planning/catalog/warningCatalog.ts`에 엔트리를 추가합니다.
3. `suggestedActionId`가 있으면 `actionCatalog.ts`에 해당 action이 존재해야 합니다.
4. 새 코드가 엔진/파이프라인 emitted 코드면 `PLANNING_EMITTED_WARNING_CODES`에 추가합니다.
5. `pnpm test tests/planning/catalog/catalog-ssot.test.ts`로 매핑 누락 여부를 확인합니다.

## 새 Action 추가 방법
1. `src/lib/planning/catalog/actionCatalog.ts`에 action id/설명/steps를 추가합니다.
2. 경고와 연결할 경우 `warningCatalog.ts`의 `suggestedActionId`에 매핑합니다.
3. 액션은 실행 단계 중심으로 작성하고, 상품 추천/단정 문구는 넣지 않습니다.

## Copy 템플릿 규칙
- 단위 표기는 템플릿 기반으로만 출력합니다.
  - `%`: `unit.percent`
  - `KRW`: `unit.krw`
  - `months`: `unit.months`
- 플레이스홀더는 `{{name}}` 형식이며 누락 시 렌더 함수가 오류를 발생시킵니다.

## 적용 포인트
- `buildReportVM` / `buildInterpretationVM`은 경고/액션/판정 문구를 카탈로그에서만 조회합니다.
- 새 문구를 추가할 때는 하드코딩 대신 `copyTemplates.ts`를 사용합니다.

