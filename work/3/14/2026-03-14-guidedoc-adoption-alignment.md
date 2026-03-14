# 2026-03-14 guidedoc adoption alignment

## 변경 파일
- `docs/frontend-design-spec.md`
- `docs/api-error-contract.md`
- `docs/api-utilization-draft.md`
- `work/3/14/2026-03-14-guidedoc-adoption-alignment.md`

## 사용 skill
- `work-log-closeout`: docs-only closeout note 형식과 검증/리스크 항목을 현재 저장소 규칙에 맞춰 남기기 위해 사용

## 변경 이유
- latest note `work/3/14/2026-03-14-planning-v3-complete-checkpoint.md`가 planning-v3 새 구현 batch 없음과 outside-scope 우선 원칙을 이미 고정했다.
- 현재 non-`GEMINI.md` dirty는 `guidedoc/` reference 파일군이었고, 이번 라운드 목적은 새 구현이 아니라 guidedoc의 재사용 가능한 규칙만 현재 문서에 안전하게 흡수하는 것이었다.
- guidedoc은 현재 프로젝트의 route truth나 API 구현 정본이 아니라 참고 자료이므로, 실존 경로 기준은 계속 `docs/current-screens.md`에 두고 재사용 가능한 상태 규칙과 실패 해석만 문서에 반영했다.

## 핵심 변경
- 참고한 guidedoc 파일은 `guidedoc/personal_finance_planner_screen_definition_v2_2_a.docx`, `guidedoc/personal_finance_planner_openapi_v2_2_c.yaml`, `guidedoc/personal_finance_planner_openapi_documentation_v2_2_c.docx`, `guidedoc/personal_finance_planner_qa_case_table_v2_2_c.xlsx` 4개로 제한했다.
- `docs/frontend-design-spec.md`에는 바로 적용 가능한 항목만 반영했다. 공통 `Loading` / `Empty` / `Error` / `Disabled` 상태, empty 기본 CTA, 모바일 card/list 우선 원칙, 화면별 QA 상태 분리 확인 기준을 추가했다.
- `docs/api-error-contract.md`에는 현재 공통 실패 응답 계약을 유지한 채 `traceId` 역할, `Unauthorized`와 `ValidationError`의 의미 구분, `issues` 우선 해석 원칙을 보강했다. top-level `traceId`나 인증 구현 세부는 새로 가정하지 않았다.
- `docs/api-utilization-draft.md`에는 `[조건부]` 항목만 짧게 남겼다. `Idempotency-Key`, `preview_token`, active 1개 규칙, 월마감/read-only 경계, 이벤트 로그/운영지표 연결은 실제 도메인 전제가 맞을 때만 검토하도록 정리했다.
- guidedoc 원본 `docx/pdf/xlsx`, OpenAPI 원본, `:Zone.Identifier` 파일은 모두 reference-only로 취급했고 commit 대상이나 route/API 정본으로 채택하지 않았다.

## 검증
- 실행: `find guidedoc -maxdepth 1 -type f | sort`
- 실행: `python3` stdlib(`zipfile`, `xml.etree`)로 `guidedoc/personal_finance_planner_screen_definition_v2_2_a.docx` 본문 추출 및 키워드 확인
- 실행: `rg -n "traceId|Unauthorized|ValidationError|issues|Idempotency-Key|preview_token|active|read-only" guidedoc/personal_finance_planner_openapi_v2_2_c.yaml`
- 실행: `python3` stdlib(`zipfile`, `xml.etree`)로 `guidedoc/personal_finance_planner_openapi_documentation_v2_2_c.docx` 본문 추출 및 키워드 확인
- 실행: `python3` stdlib(`zipfile`, `xml.etree`)로 `guidedoc/personal_finance_planner_qa_case_table_v2_2_c.xlsx` 시트/셀 본문 추출 및 상태 분리, validation, idempotency 관련 키워드 확인
- 실행: `sed -n '1,260p' docs/frontend-design-spec.md`
- 실행: `sed -n '1,220p' docs/api-error-contract.md`
- 실행: `sed -n '1,260p' docs/api-utilization-draft.md`
- 실행: `rg -n "QA|모바일|table|card|list|Loading|Empty|Error|Disabled" docs/frontend-design-spec.md`
- 실행: `rg -n "issues|debug|UNAUTHORIZED|traceId|Validation|Unauthorized|ValidationError" docs/api-error-contract.md`
- 실행: `rg -n "Idempotency|preview_token|active|read-only|계측|이벤트|운영지표" docs/api-utilization-draft.md`
- 미실행: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`
- 미실행 이유: 이번 라운드는 docs-only 정렬 작업이며, 사용자 지시상 코드 검증 재실행은 제외했다.

## 남은 리스크
- guidedoc은 현재 저장소와 route 체계, 인증 전제, 도메인 경계가 다르므로 route/API 정본으로 쓰면 오해가 생길 수 있다. 현재 정본은 계속 `docs/current-screens.md`와 실제 구현 코드다.
- `traceId`, `Unauthorized`, `ValidationError`, `Idempotency-Key`, `preview_token`, active 1개 규칙은 guidedoc에서 온 용어이지만 현재 저장소 전역 규칙으로 확정된 것은 아니다. 이번 반영에서는 직접 적용과 조건부 적용을 분리해 과잉 일반화를 피했다.
- guidedoc 원본은 reference-only로 남겼기 때문에, 이후 commit 시에도 원본 파일과 `:Zone.Identifier`가 섞이지 않도록 staging 범위를 다시 확인해야 한다.

## 다음 라운드 우선순위
1. guidedoc 원본은 계속 reference-only로 유지하고, commit 대상에서는 문서 3종과 `/work` note만 선택한다.
2. 이후 guidedoc 규칙을 실제 구현에 적용할 때는 `docs/current-screens.md`와 현재 API 계약을 먼저 기준선으로 다시 대조한다.
3. planning-v3는 reopen 조건이 실제로 생기기 전까지 다시 열지 않는다.
