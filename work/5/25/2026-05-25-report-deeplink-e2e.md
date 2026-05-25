# 2026-05-25 리포트 딥링크 e2e 계약 보강

## 변경 파일
- `tests/e2e/flow-history-to-report.spec.ts`
- `work/5/25/2026-05-25-report-deeplink-e2e.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 잔여 리스크를 기준으로 planning 보고서 딥링크 검증 라운드로 범위를 좁히기 위해 사용
- `planning-gate-selector`: 테스트 전용 변경이지만 사용자 흐름과 route query 계약을 건드리므로 초점 e2e와 `e2e:rc`를 선택하기 위해 사용
- `route-ssot-check`: 새 public route 추가 없이 기존 `/planning/reports`, `/planning/reports/[id]`, `/recommend/history?open=...` 링크 계약만 확인하면 된다고 판단하기 위해 사용
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 남은 리스크를 `/work` 형식으로 남기기 위해 사용

## 변경 이유
- 이전 라운드의 남은 리스크였던 `baseRunId`, `recommendRunId` 딥링크 UI 계약이 직접 e2e로 고정되어 있지 않았습니다.
- 보고서 화면은 실행 기록, 추천 비교 기록, 저장된 상세 리포트 사이를 잇는 도착점이므로 query 기반 복원과 저장 후 상세 이동이 깨지면 사용자가 맥락을 잃을 수 있습니다.

## 핵심 변경
- `baseRunId`가 포함된 `/planning/reports` 진입 시 비교 모드가 자동으로 열리고 기준 실행 selector가 해당 실행을 선택하는지 확인했습니다.
- `recommendRunId`가 포함된 보고서 진입 시 `추천 비교 기록 보기` 링크와 복구용 식별자 안내가 유지되는지 확인했습니다.
- 같은 추천 참조로 저장된 리포트를 만든 뒤 상세 화면으로 이동해 `추천 비교 기록으로 돌아가기` 링크와 추천 실행 ID가 보존되는지 확인했습니다.
- 제품 코드는 변경하지 않고 기존 딥링크/저장 계약을 회귀 테스트로 잠갔습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm exec playwright test tests/e2e/flow-history-to-report.spec.ts --grep "planning reports preserve compare and recommendation deep links" --workers=1 --reporter=line` 통과: 1 test
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- git diff --check -- tests/e2e/flow-history-to-report.spec.ts` 통과
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance -- env PATH=/tmp/codex-pnpm-shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PLAYWRIGHT_REUSE_EXISTING_SERVER=0 NO_COLOR=1 /tmp/codex-pnpm-shim/pnpm e2e:rc` 통과: 24 tests

## 남은 리스크
- 이번 라운드는 e2e 테스트 추가만 포함해 `pnpm lint`, `pnpm test`, `pnpm build`를 새로 실행하지 않았습니다. 직전 라운드에서는 모두 통과했지만, 이번 파일 변경만 기준으로는 `e2e:rc`가 주 검증입니다.
- 현재 worktree에는 이번 라운드 밖의 대규모 기존 변경과 untracked 파일이 많습니다. PR 전 stage 범위와 포함 의도를 별도로 정리해야 합니다.
- `planning:v2:guard`의 informational warning인 `/fonts` inventory 누락과 `[v2-core-change]` 태그 부재는 이번 라운드 범위 밖입니다.
