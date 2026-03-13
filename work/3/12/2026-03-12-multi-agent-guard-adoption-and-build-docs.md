# 2026-03-12 멀티 에이전트 guard 채택 및 build 환경 제약 문서화

## 변경 파일
- `scripts/multi_agent_handoff_guard.mjs`
- `README.md`
- `docs/release-checklist.md`
- `docs/maintenance.md`
- `docs/planning-v2-maintenance.md`
- `docs/runbook.md`
- `work/3/12/2026-03-12-multi-agent-guard-adoption-and-build-docs.md`

## 사용 skill
- `planning-gate-selector`
  - 이번 라운드가 앱 기능 변경이 아니라 멀티 에이전트 운영 가드 채택과 build 환경 제약 문서화 범위인지 다시 분류하고, `pnpm multi-agent:guard`와 정적 검증 중심으로 검증 세트를 고르는 데 사용했다.
- `work-log-closeout`
  - 실제 변경, 실제 검증, 남은 리스크, 다음 작업 우선순위를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 직전 라운드 이후 남은 운영 리스크는 두 가지였다.
  - `pnpm multi-agent:guard`가 추가됐지만 운영 체크리스트에 어디까지 포함할지 아직 문서 기준이 약했던 점
  - Codex foreground exec에서 `pnpm build`가 `143`으로 끊기는 현상이 앱 회귀인지 실행 환경 제약인지 계속 혼동될 수 있던 점
- 이번 라운드는 새 기능보다 위 두 리스크를 운영 문서와 guard 기준으로 고정하는 최소 수정에 집중했다.

## 핵심 변경
- `scripts/multi_agent_handoff_guard.mjs`에 `analyzer` coverage를 추가해, native 분석 역할도 `/work`, `사용 skill`, `실행한 확인`, `미실행 검증 후보` handoff 필드를 guard 범위에서 빠지지 않게 했다.
- `docs/release-checklist.md`, `docs/maintenance.md`, `docs/planning-v2-maintenance.md`에 멀티 에이전트 설정/프롬프트/skill 변경 시 `pnpm multi-agent:guard`를 조건부 운영 게이트로 명시했다.
- `README.md`에는 `pnpm build` 설명 옆에 Codex foreground exec `143`가 보이면 일반 셸 또는 detached 절차를 사용하라는 짧은 안내를 추가했다.
- `docs/runbook.md`에 `Codex foreground build 143` 섹션을 추가해, 증상, 원인 분류, detached 검증 명령, production smoke 후속 확인 순서를 고정했다.
- detached build를 실제로 다시 실행해, 현재 워크트리 기준에서도 foreground `143`와 분리된 `pnpm build` PASS 경로가 살아 있음을 재확인했다.

## 검증
- `node --check scripts/multi_agent_handoff_guard.mjs`
  - PASS
- `pnpm multi-agent:guard`
  - PASS
  - `tracked=22 coverage=16`
- `pnpm exec eslint scripts/multi_agent_handoff_guard.mjs`
  - PASS
- `git diff --check HEAD -- README.md docs/release-checklist.md docs/maintenance.md docs/planning-v2-maintenance.md docs/runbook.md scripts/multi_agent_handoff_guard.mjs .codex/agents/analyzer.toml`
  - PASS
- `setsid -f /bin/bash -lc 'cd /home/xpdlqj/code/finance && env NEXT_BUILD_HEARTBEAT_MS=5000 pnpm build >/tmp/finance-build-143-doc.log 2>&1; printf "%s\n" "$?" >/tmp/finance-build-143-doc.exit'`
  - PASS
  - `/tmp/finance-build-143-doc.exit = 0`
  - log 기준 `compile -> type-checking -> static-generation -> finalizing`까지 진행 후 정상 종료

## 미실행 검증
- foreground `pnpm build`
  - 미실행. 이번 라운드는 foreground `143` 현상을 다시 유도하는 대신, detached 경로가 현재도 PASS 하는지 확인해 환경 제약과 앱 회귀를 분리하는 데 집중했다.
- `pnpm e2e:rc`
  - 미실행. 사용자 경로나 셀렉터를 직접 수정하지 않았다.
- `pnpm verify`
  - 미실행. 저장소 전체 게이트를 다시 열 필요가 없는 운영 가드/문서 범위다.

## 남은 리스크
- 멀티 에이전트 운영 리스크 중 `guard 채택 위치 불명확`과 `analyzer coverage 누락`은 현재 범위에서 닫았다.
- build 쪽 남은 이슈는 앱 blocker가 아니라 Codex foreground exec 제약이다. 현재 워크트리 기준 detached `pnpm build`는 PASS 했으므로, foreground `143`는 런북 기준으로 환경 특이 이슈로 다루면 된다.
- 이미 떠 있는 세션이나 이미 생성된 보조 에이전트 응답은 새 프롬프트/guard 규칙을 자동 반영하지 않는다.

## 이번 라운드 완료 항목
1. `analyzer`를 포함한 `pnpm multi-agent:guard` coverage 확장
2. `pnpm multi-agent:guard`를 release/maintenance/planning maintenance 문서에 조건부 운영 게이트로 채택
3. Codex foreground `pnpm build` `143`를 detached PASS 경로와 분리해 런북/README에 문서화

## 다음 라운드 우선순위
1. `/work` 디렉터리 전체의 장기 관리 정책을 정할지 결정
2. `pnpm multi-agent:guard`를 더 넓은 CI/release gate로 승격할지 검토
3. Codex foreground exec의 build `143`를 helper 차원에서 더 명시적으로 감쌀지 결정
