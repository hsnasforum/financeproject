# 2026-03-12 ops log rotation 및 work policy closeout

## 변경 파일
- `src/lib/ops/metricsLog.ts`
- `src/lib/ops/securityAuditLog.ts`
- `tests/planning/ops/metricsLog.test.ts`
- `tests/planning/ops/securityAuditLog.test.ts`
- `scripts/multi_agent_handoff_guard.mjs`
- `work/README.md`

## 사용 skill
- `planning-gate-selector`: ops 로그 저장소 helper와 multi-agent guard 변경을 `테스트 + build + guard` 조합으로 검증하는 기준을 고르는 데 사용했다.
- `work-log-closeout`: 이번 라운드의 실제 변경, 실제 검증, 남은 리스크, 다음 우선순위를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 최신 closeout 기준으로 이번 턴에 실제로 닫을 수 있는 남은 항목은 두 가지였다.
- `global-scan-build-trace-warning.md`가 남긴 후속인 `metricsLog`, `securityAuditLog`의 rotated 로그 파일 직접 열거 패턴 재점검.
- `multi-agent-followup-and-priority-refresh.md`가 남긴 `/work` 관리 정책 리스크 중, 문서에는 `tracked closeout`이라고 적혀 있지만 guard는 아직 최신 filesystem note를 기준으로 보고 `work/README.md`도 tracked 대상으로 강제하지 않던 불일치.

## 핵심 변경
- `metricsLog`, `securityAuditLog`가 `events.ndjson.1`, `events.ndjson.2` 같은 rotated 파일을 가상 경로로 전부 열거하지 않고, 실제 디렉터리에 존재하는 suffix만 읽도록 바꿨다.
- 두 저장소 모두 sparse rotation(`.1` 없음, `.2`만 존재) 상황에서 정상적으로 최신 로그를 읽는 회귀 테스트를 추가했다.
- `multi-agent_handoff_guard`는 이제 최신 `/work` note를 filesystem 전체가 아니라 `git ls-files` 기준 tracked closeout만 대상으로 계산한다.
- 같은 guard에 `work/README.md`를 tracked 필수 파일로 추가해 `/work` 정책 문서가 README/지침과 실제 검사 기준에서 빠지지 않게 맞췄다.
- `work/local/` scratch는 계속 제외하고, tracked closeout과 local 메모를 구분하는 현재 `/work` 정책을 그대로 유지했다.

## 검증
- `pnpm exec eslint src/lib/ops/metricsLog.ts src/lib/ops/securityAuditLog.ts tests/planning/ops/metricsLog.test.ts tests/planning/ops/securityAuditLog.test.ts scripts/multi_agent_handoff_guard.mjs`
  - PASS
- `pnpm test tests/planning/ops/metricsLog.test.ts tests/planning/ops/securityAuditLog.test.ts tests/planning/ops/audit-route.test.ts`
  - PASS
- `pnpm build`
  - PASS
- `pnpm multi-agent:guard`
  - PASS

## 미실행 검증
- `pnpm release:verify`
  - 미실행. 이번 라운드는 planning release gate 자체가 아니라 ops 로그 read helper와 `/work` guard 정렬 범위였다.
- `pnpm e2e:rc`
  - 미실행. 사용자 브라우저 흐름이나 셀렉터를 직접 수정하지 않았다.

## 남은 리스크
- 이번 라운드 범위에서 닫아야 했던 `ops log rotation helper` 후속과 `/work tracked policy` 불일치는 현재 기준으로 닫았다.
- 저장소 전체 워크트리는 여전히 매우 dirty 하므로, 다음 라운드도 작은 batch 단위로 나누는 편이 안전하다.
- `actionLog`, `scheduler event log`는 현재 코드상 build trace 경고를 일으키는 같은 읽기 패턴이 확인되지 않아 이번 수정 대상에서 제외했다.

## 이번 라운드 완료 항목
1. `metricsLog`, `securityAuditLog` sparse rotation read 경로 보완
2. 관련 회귀 테스트 추가
3. `/work` 정책 문서와 multi-agent guard의 tracked 기준 정렬

## 다음 라운드 우선순위
1. ops 로그 helper 공통화가 실제로 가치가 있는지, 아니면 현 상태처럼 저장소별 최소 유지가 나은지 결정
2. 필요 시 `actionLog`까지 조회 API가 생길 가능성을 대비해 read helper 패턴을 별도 유틸로 뺄지 검토
3. planning/report, DART/data-sources, ops/docs처럼 크게 열린 워크트리를 더 작은 배치로 쪼개 후속 정리
