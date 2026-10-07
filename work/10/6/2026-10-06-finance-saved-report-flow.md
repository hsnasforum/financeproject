# 2026-10-06 Finance 저장 리포트 읽기·원본 복귀 흐름

## 변경 파일

- 제품 4파일: `src/components/planning/reports/SavedReportBrief.tsx`(신규), `src/components/PlanningReportsDashboardClient.tsx`, `src/components/PlanningReportDetailClient.tsx`, `src/app/planning/reports/page.tsx`.
- 테스트 2파일: `tests/planning/reports/stableReportScenarios.test.tsx`, `tests/e2e/flow-history-to-report.spec.ts`.
- 사용 안내/목표: `README.md`, `FINANCE_ACTIVE_GOAL.md`, 이 종료 기록. 정확한 before/after SHA와 delta는 복구 폴더 `delivery-files.json`, `delivery.patch`에 보존.

## 사용 skill

- planning-gate-selector: 기존 보고서/오류/접근성 관련 검사와 실제 사용자 동선, 종료 build를 선택.
- work-log-closeout: 수정·실패·재시도와 최종 반영을 이 마일스톤 한 문서로 기록.

## 변경 이유

저장 결과를 다시 열어도 긴 설명·식별자·운영안 때문에 핵심 결과를 늦게 읽는 흐름을 개선한다. 새 계산 규칙을 만들지 않고 기존 해석과 저장된 시나리오·경고·목표·실행 계획을 보존한다.

## 핵심 변경

- 저장한 진단 이름, 한국 시간 기준 계산·저장 시각, 분석 기간, 기준일과 핵심 상태/먼저 검토할 행동을 앞에 배치. 기존 interpretation builder/adapter를 재사용하며 기존 위험 진단은 기본 화면에 유지.
- 전체 해석·월급 운영안·계산 근거를 접힌 상세 영역에 보존. 버튼으로 열면 summary에 focus 이동; 키보드로 닫을 수 있음. 읽기/새로고침은 계산·추가 저장·상품 후보 요청을 일으키지 않음.
- 실패/실행 중 결과에 정상 해석을 표시하지 않고, 부분 실패와 기준 데이터 누락은 기본 화면에 표시. 기존 저장 수치·시나리오 순서·목표 기한·HTML export·추천 참조는 보존.
- 보관 성공 후 고급 Markdown 관리 패널을 강제로 열지 않음. 유효한 상세 링크·확인 중·없음·focus/수동 재확인 구분은 유지.
- 보관 상세의 중복 제목·설명을 줄이고 식별자는 접어서 보존. 원본 결과 복귀에 같은 runId/profileId/recommendRunId를 유지.
- 인쇄 전 상세를 펼치고 인쇄 후 이전 상태로 복원. 검증은 브라우저 이벤트/print media DOM 범위이며 실제 프린터와 모든 브라우저 출력은 미검증.

## 검증

- `corepack pnpm exec vitest run tests/planning/reports/stableReportScenarios.test.tsx tests/error-state-boundaries.test.tsx tests/public-ui-accessibility-contract.test.tsx --maxWorkers=2`: 3 files / 22 tests PASS (2.77초).
- 변경 제품·테스트 6파일 eslint PASS (3.73초). 마지막 보관 복귀 URL/테스트 수정 후 해당 2파일 lint PASS (4.29초).
- 기존 `tests/e2e/flow-history-to-report.spec.ts`의 12시나리오를 1worker/retries0으로 실행: 최초 11 PASS/1 FAIL, 60.43초. 실패 원인은 새 검증 요청에 origin/referer가 누락되어 기존 same-origin guard가 403을 반환한 것. 테스트 요청에 올바른 header를 추가하고 실패한 흐름만 재실행 PASS (11.7초). 앱 guard·assertion은 약화하지 않음.
- 위 브라우저 검증은 실제 격리 API/store와 합성 fixture로 저장 시나리오/HTML 값, 기한 후 달성, run 비교·추천 deep link, 별도 보관, pending/없음/focus/수동 재확인, 상세 원본 복귀를 확인.
- 최종 추천 참조 복귀 URL 변경 후 관련 2시나리오 재실행 PASS (17.26초). 나머지 흐름의 소스/행동은 바뀌지 않아 기존 검증 결과를 재사용.
- 상세 열기/focus/Enter 닫기, beforeprint/afterprint 상태 복원과 print media 내용 확인, 재조회 전후 run ID 목록 동일 및 읽기 중 mutation/상품후보 요청 없음 확인.
- 1440×1000과 390×844의 메인/보관 상세 실제 캡처를 열어 확인. 모바일 page 가로 넘침 없음. 캡처의 프로필·금액은 합성 데이터이며 사용자 재무 상태가 아님.
- 최종 일반 production build의 결과/시간은 아래 적용 결과에 기록. E2E 환경변수와 분리해 `.next` 대상으로 실행하고 TypeScript 검사까지 포함. 전체 test/verify/complete/RC/원격 CI는 이번 범위에 실행하지 않음.

## 보존과 남은 리스크

- 시작 HEAD `6a51f8d3a24394ba239838a78c8c19aa590fc180`, staged 없음. 시작 소스 4,451항목의 사전 SHA/백업은 `/home/xpdlqj/finance-recovery/reports-20261006-214658/baseline`에 보존. 실제 .env와 사용자 DB/runtime은 복사·수정하지 않음.
- 모든 앱 실행과 데이터 작성은 격리 candidate/fixtures에서 수행. 계산 엔진·API·인증·저장 형식·배포/모델/권한 설정·lockfile은 변경하지 않음.
- 실제 설치본/배포본 업데이트, 사용자 DB/live API, 프린터 및 Finance 전체 출시 검증은 별도. Node 22.23.2와 engines 22.22.2 차이는 기존 환경 경고이며 업그레이드하지 않음.
- 기존 해석의 재무 판단을 변경하거나 사용자의 만족을 대신 확정하지 않음. 이번 결과는 저장 리포트 사용자 경험의 로컬 소스 완료 범위임.

## 다음 라운드

누적 로컬 변경의 게시 묶음과 실제 설치본 전체 동선 확인은 후속 후보. 이번 작업은 원본 소스 반영·보존 확인 뒤 종료하며 자동으로 게시하지 않음.

## 적용 결과

일반 production build PASS, 131.58초. 검증한 제품/테스트 SHA는 검사 전후 유지했습니다. 이번 delta 9파일을 로컬 원본에 적용해 사본과 byte 일치 및 scoped diff 검사를 확인했습니다. HEAD/index와 이번 범위 밖 기존 소스는 보존했습니다. 검증 서버는 종료했고 commit/push/deploy/기존 설치본 변경은 하지 않았습니다.
