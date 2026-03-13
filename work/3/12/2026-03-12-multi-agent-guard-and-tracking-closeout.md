# 2026-03-12 멀티 에이전트 guard 및 관리 대상 정리

## 변경 파일
- `scripts/multi_agent_handoff_guard.mjs`
- `package.json`
- `README.md`
- `multi_agent.md`
- `.codex/agents/reviewer.toml`
- `scripts/prompts/multi-agent/planner.md`
- `scripts/prompts/multi-agent/reviewer.md`
- git 관리 대상으로 포함:
  - `.codex/config.toml`
  - `.codex/rules/default.rules`
  - `.codex/skills/*/SKILL.md`
  - `.codex/agents/*.toml`
  - `scripts/prompts/multi-agent/*.md`
  - `work/3/12/2026-03-12-multi-agent-handoff-coverage-closeout.md`

## 사용 skill
- `planning-gate-selector`
  - 멀티 에이전트 지침/스크립트/문서 변경에 대해 앱 build/e2e 대신 guard 중심 검증 세트를 고르는 데 사용했다.
- `work-log-closeout`
  - 이번 라운드의 실제 변경, 실행한 검증, 남은 리스크, 다음 작업 우선순위를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 직전 라운드의 남은 리스크는 두 갈래였다.
  - `.codex/agents/*`, `scripts/prompts/multi-agent/*`가 git 기준 untracked라 관리 대상이 아니었던 점
  - `reviewer`, `planner`, `researcher`를 포함한 handoff 필드 강제 수준이 역할별로 다시 어긋날 수 있었던 점
- 이번 라운드는 기능 추가보다 위 두 리스크를 구조적으로 닫는 것이 우선이라고 판단했고, 최소 수정 축을 아래 두 가지로 잡았다.
  1. 멀티 에이전트 설정/프롬프트/skill 파일을 실제 git 관리 대상으로 올린다.
  2. handoff 필드와 `/work` 선확인을 자동 점검하는 guard를 추가한다.

## 핵심 변경
- `scripts/multi_agent_handoff_guard.mjs`를 추가해 `.codex/config.toml`, `.codex/rules/default.rules`, `.codex/skills/*/SKILL.md`, `.codex/agents/*.toml`, `scripts/prompts/multi-agent/*.md`가 git 관리 대상인지 먼저 확인하게 했다.
- 같은 guard가 manager/developer/documenter/planner/researcher/reviewer/tester와 CLI prompt 공통/lead/implementer/documenter/planner/researcher/reviewer/validator에서 `/work`, `사용 skill`, `실행한 검증` 또는 `실행한 확인`, `미실행 검증` 또는 `미실행 내부 검증` 필드가 남아 있는지도 함께 검사하게 했다.
- `package.json`에 `pnpm multi-agent:guard` 명령을 추가하고, `README.md`, `multi_agent.md`에 이 guard의 목적과 사용 지점을 연결했다.
- `scripts/prompts/multi-agent/planner.md`, `scripts/prompts/multi-agent/reviewer.md`, `.codex/agents/reviewer.toml`에 `사용 skill / 실행한 검증 / 미실행 검증` handoff를 출력 형식 수준에서 보강했다.
- 멀티 에이전트 설정 세트와 직전 closeout 기록을 git 관리 대상으로 올려, 직전 라운드의 untracked 리스크를 현재 워크트리 기준으로 닫았다.

## 검증
- `node --check scripts/multi_agent_handoff_guard.mjs`
  - PASS
- `pnpm multi-agent:guard`
  - PASS
  - `tracked=22 coverage=15`
- `git diff --check --cached -- .codex/config.toml .codex/rules/default.rules .codex/skills/*/SKILL.md .codex/agents/*.toml scripts/prompts/multi-agent/*.md scripts/multi_agent_handoff_guard.mjs package.json README.md multi_agent.md work/3/12/2026-03-12-multi-agent-handoff-coverage-closeout.md`
  - PASS
- `pnpm exec eslint scripts/multi_agent_handoff_guard.mjs`
  - PASS

## 미실행 검증
- `pnpm build`
  - 미실행. 이번 라운드는 앱 코드/라우트/runtime 스크립트 변경이 아니라 멀티 에이전트 지침과 관리 대상 정리 범위다.
- `pnpm e2e:rc`
  - 미실행. 사용자 경로, 셀렉터, UI 동작 변경이 없다.
- `pnpm verify`
  - 미실행. 저장소 전체 게이트를 다시 열 필요가 없는 운영 규칙/guard 정리 범위다.

## 남은 리스크
- 현재 워크트리 기준으로 직전 라운드의 `untracked 멀티 에이전트 설정` 리스크와 `reviewer/planner/researcher handoff 누락` 리스크는 닫았다.
- 남은 앱 축 리스크는 멀티 에이전트 영역 밖이다. 최근 `/work/3/12/2026-03-12-build-prod-smoke-runtime-closeout.md` 기준 build/prod smoke blocker는 닫혔고, 현재 남은 것은 Codex foreground exec 환경에서 장시간 `pnpm build`가 `143`으로 잘릴 수 있다는 실행 환경 제약이다.
- 이 환경 제약은 앱 회귀와는 구분해서 다뤄야 하며, 다음 라운드에서는 foreground build 재현성과 사용자 셸 기준 재현 결과를 분리해 보는 것이 맞다.

## 이번 라운드 완료 항목
1. 멀티 에이전트 설정/skill/prompt 세트를 git 관리 대상으로 포함
2. handoff 필드와 `/work` 선확인 드리프트를 자동 점검하는 `pnpm multi-agent:guard` 추가
3. `reviewer`/CLI `planner`/CLI `reviewer` 출력 형식 보강

## 다음 라운드 우선순위
1. Codex foreground exec 환경에서만 남는 `pnpm build` 143 종료를 사용자 셸/setsid 재현과 분리해 문서화
2. `pnpm multi-agent:guard`를 release/운영 체크리스트 어디까지 포함할지 결정
3. 멀티 에이전트 가드 범위를 analyzer나 추가 role 문서까지 넓힐 필요가 있는지 검토
