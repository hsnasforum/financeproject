# 2026-07-02 core service provider wiring 분리

## 변경 파일
- `src/lib/planning/core/v2/service.ts`
- `src/lib/planning/server/v2/service.ts`
- `src/lib/planning/v2/service.ts`
- `tests/planning-v2/service.test.ts`
- `work/7/2/2026-07-02-structural-issue-batch-plan.md`
- `work/7/2/2026-07-02-core-service-provider-wiring.md`

## 사용 skill
- `github:github`: 기존 Issue/PR 상태 확인과 신규 Issue 등록 방식 판단
- `dart-data-source-hardening`: Finlife/public data source 후보의 중복 등록 여부와 후속 범위 판단
- `planning-gate-selector`: planning v2 core 변경에 필요한 검증 세트 선정
- `work-log-closeout`: 이번 라운드 변경, 검증, 잔여 리스크 기록
- `manager` subagent: 첨부 후보 12개를 5단계 실행 범위로 분해

## 변경 이유
- 첨부 통합 Markdown의 구조 후보를 GitHub Issue로 등록하되, 기존 #114~#125와 중복되는 항목은 재사용하고 누락된 항목만 신규 등록해야 했다.
- 최상위 Critical 후보인 planning core/server provider wiring은 현재 checkout에서도 재현되어, public route 동작을 유지한 채 core의 외부 provider default 생성을 server 조립 계층으로 옮겼다.

## 핵심 변경
- 신규 Issue #128~#132를 등록했다. 기존 #114, #115, #116, #117, #119, #124는 첨부 후보와 매핑해 중복 생성을 피했다.
- `core/v2/service.ts`는 provider contract를 명시적으로 받도록 바꾸고 file/Finlife/debt/tax provider factory import와 default 생성을 제거했다.
- `server/v2/service.ts`가 기존 default provider wiring을 담당하도록 wrapper를 추가했다.
- 기존 공개 import 경로 `src/lib/planning/v2/service.ts`는 server wrapper를 re-export하도록 바꿔 route/runtime 동작을 유지했다.
- `tests/planning-v2/service.test.ts`에 core/server wiring 경계 회귀 테스트를 추가했다.

## 검증
- `rg -e createFileAssumptionsProvider -e createFinlifeProductCandidatesProvider -e createDebtStrategyProvider -e createPlaceholderTaxPensionProvider src/lib/planning/core/v2 src/lib/planning/server/v2 src/lib/planning/v2 tests/planning-v2/service.test.ts`: PASS로 판정. core 경로에는 provider factory가 없고 server wrapper와 테스트에만 존재한다.
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm test tests/planning-v2/service.test.ts`: PASS, 1 file / 3 tests
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm typecheck`: PASS
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm planning:v2:complete`: PASS. freeze guard가 core 변경으로 `planning:v2:regress` 필요성을 표시했다.
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm planning:v2:regress`: PASS, 9 regression cases + planning v2 full e2e 8 passed
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm lint`: PASS
- `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm build`: PASS

## 남은 리스크
- 이번 구현은 #128만 직접 처리했다. #129 file-store topology, #130 CSRF/write guard, #131 schema parity, #132 script 분류는 신규 등록 후 후속으로 남겼다.
- #115 legacy planner compute 수렴과 planning run endpoint canonical contract는 기존 Issue에 매핑했지만, telemetry/access log 확인 전 삭제나 차단까지 결정하지 않았다.
- public API URL과 응답 shape, DB query semantics, cache/revalidate 동작은 변경하지 않았다. 변경은 내부 provider wiring과 export 경계에 한정된다.
- `planning:v2:complete`가 `[v2-core-change]` tag 필요성을 다시 표시했다. 기존 PR #127 제목에는 tag가 있으나, 이번 로컬 변경을 별도 커밋/PR로 올릴 경우 제목이나 커밋 메시지에 같은 표시가 필요하다.

## 다음 라운드 우선순위
- #129 file-store topology guard는 실제 운영 topology 확인 전까지 DB 전환으로 확대하지 말고 runtime guard와 문서 기준부터 좁게 점검한다.
- #130 CSRF/write guard는 v2 mutation route부터 공통 helper 적용 가능성을 조사하고, v3 전면 통합은 별도 라운드로 둔다.
- #115 legacy planner compute와 planning run endpoint canonical contract는 telemetry/access log 확인 없이는 삭제하지 않고 deprecation/inventory 기준부터 보강한다.
