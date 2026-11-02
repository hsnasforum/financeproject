# Planning v2 Developer Guide

## Dashboard stale 플랜 재실행

- 기존 `POST /api/planning/v2/runs`에 선택적 `rerunOfRunId`로 이전 완료 run을 지정합니다. `profileId`는 현재 기본 프로필 ID, `input`은 해당 run의 저장 input 그대로 보냅니다. 저장 schema는 바꾸지 않습니다.
- parser는 기존 지원 입력을 정규화하고, input context는 같은 사용자·프로필·완료 source 및 지원 설정 일치를 확인합니다. snapshot ID가 없거나 `latest`인 source, 재현 hash가 없거나 legacy scenario만 있는 source는 조건 검토로 보냅니다.
- 명시 snapshot을 읽은 뒤 snapshot/최종 가정 hash를 이전 기록과 비교합니다. 누락은 기존 `SNAPSHOT_NOT_FOUND`, 조건 불일치는 `RERUN_CONDITIONS_CHANGED`(409)로 응답하며 계산 단계와 run 저장 전에 중단합니다. 프로필별 저장 override 변경도 이 검사에 포함됩니다.
- 기존 idempotency-key 계약과 workspace의 요청 helper를 재사용합니다. 동시 클릭은 client ref로 막고, 응답 유실·수동 재시도는 같은 key/body를 유지합니다. 완료 요청 replay는 조건 재검사보다 먼저 저장된 같은 run을 돌려줍니다.
- 대시보드 진입·새로고침·프로필 저장에는 POST가 없습니다. stale 버튼만 실행하며 성공 시 `/planning/reports?runId=<new>&profileId=<current>`로 이동합니다. 기존 run/action progress는 수정하지 않습니다.
- 시나리오가 있으면 기존 생성 계약대로 patch 적용 후 profileHash를 비교합니다. 이는 현재 프로필 원본을 변경하지 않으며 가정의 최신성을 보증하지 않습니다.
- 회귀: `pnpm test tests/dashboard-view-model.test.tsx tests/planning-v2-api/create-run-input-context.test.ts tests/planning-v2-api/persistence-routes.test.ts tests/planning-v2-api/create-run-idempotency.test.ts`, `pnpm e2e:pw tests/e2e/dashboard-current-state.spec.ts --workers=1`.

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
