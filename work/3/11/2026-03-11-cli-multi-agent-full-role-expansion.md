# 2026-03-11 CLI 멀티 에이전트 full role 확장

## 변경 파일

- `scripts/run_codex_multi_agent.sh`
- `scripts/prompts/multi-agent/common.md`
- `scripts/prompts/multi-agent/lead.md`
- `scripts/prompts/multi-agent/implementer.md`
- `scripts/prompts/multi-agent/validator.md`
- `scripts/prompts/multi-agent/planner.md`
- `scripts/prompts/multi-agent/researcher.md`
- `scripts/prompts/multi-agent/reviewer.md`
- `scripts/prompts/multi-agent/documenter.md`
- `work/3/11/2026-03-11-cli-multi-agent-full-role-expansion.md`

## 변경 이유

- 실제 멀티 에이전트 러너는 `.codex/agents/*.toml`이 아니라 `scripts/prompts/multi-agent/*.md`를 사용하고 있었다.
- 기존 러너는 `lead / implementer / validator` 3역할만 실행해 planner, researcher, reviewer, documenter 역할 분리를 실제 런에 반영하지 못했다.
- 기존 3역할 흐름을 완전히 깨지 않으면서도 7역할 분업을 실제로 쓸 수 있게 확장할 필요가 있었다.

## 핵심 변경

- 러너에 `--role-set full|core`를 추가하고, 기본값을 `full`로 두었다.
- `full`에서는 `lead / planner / researcher / implementer / reviewer / validator / documenter` 7개 프롬프트를 생성하고, tmux가 있으면 `core`와 `support` 2개 window로 나눠 실행한다.
- `core`는 기존 3역할(`lead / implementer / validator`)을 유지하고, `support`에 `planner / researcher / reviewer / documenter`를 추가했다.
- 실행 디렉터리는 초 단위 이름만 쓰지 않고 `mktemp`를 붙여 같은 초에 여러 번 실행해도 충돌하지 않게 했다.
- 공통 프롬프트와 역할별 프롬프트를 manager-first 반복 루프, 경로 SSOT, 역할 소유권, `/work` 인계 기준에 맞게 보강했다.
- 이후 `common.md`, `lead.md`, `validator.md`, `documenter.md`를 중심으로 TOML 쪽에서 쓰던 출력 계약, 검증 선택 규칙, 문서 정합성 규칙을 추가로 끌어와 실제 실행 프롬프트를 더 촘촘하게 만들었다.
- 기존 3역할만 필요하면 `--role-set core`로 이전 수준의 흐름을 유지할 수 있게 했다.

## 검증

- `bash -n scripts/run_codex_multi_agent.sh`
- `bash scripts/run_codex_multi_agent.sh --help`
- `TMP_BIN=$(mktemp -d); for cmd in bash cat mkdir date dirname mktemp; do ln -s "$(command -v "$cmd")" "$TMP_BIN/$cmd"; done; printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$TMP_BIN/codex"; chmod +x "$TMP_BIN/codex"; PATH="$TMP_BIN" "$TMP_BIN/bash" scripts/run_codex_multi_agent.sh --role-set full "smoke task"`
- `TMP_BIN=$(mktemp -d); for cmd in bash cat mkdir date dirname mktemp; do ln -s "$(command -v "$cmd")" "$TMP_BIN/$cmd"; done; printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$TMP_BIN/codex"; chmod +x "$TMP_BIN/codex"; PATH="$TMP_BIN" "$TMP_BIN/bash" scripts/run_codex_multi_agent.sh --role-set core "smoke task"`
- `bash scripts/run_codex_multi_agent.sh --session "finance-multi-smoke-<time>" --role-set full "tmux smoke verification"`
- `tmux list-windows -t "finance-multi-smoke-<time>"`
- `tmux list-panes -a -t "finance-multi-smoke-<time>"`
- `git diff --check -- scripts/run_codex_multi_agent.sh scripts/prompts/multi-agent/common.md scripts/prompts/multi-agent/lead.md scripts/prompts/multi-agent/implementer.md scripts/prompts/multi-agent/validator.md scripts/prompts/multi-agent/planner.md scripts/prompts/multi-agent/researcher.md scripts/prompts/multi-agent/reviewer.md scripts/prompts/multi-agent/documenter.md work/3/11/2026-03-11-cli-multi-agent-full-role-expansion.md`

## 남은 리스크

- `full` 모드는 역할 수가 늘어난 만큼 사용자가 tmux 두 개 window를 오가며 컨텍스트를 관리해야 한다.
- support 역할은 기본적으로 read-first로 설계했지만, 여전히 병렬 세션 운영 특성상 사용자가 역할 경계를 같이 관리하는 편이 안전하다.
- 기존 `/work` 문서 중 3역할 기준 설명은 역사 기록으로 남아 있으며, 최신 구조는 이 문서와 스크립트 `--help`를 기준으로 보는 편이 정확하다.
- tmux 실세션 스모크에서는 `core` 3 pane, `support` 4 pane 구조와 실제 codex 시작 명령까지 확인했고, 확인 후 임시 smoke 세션은 정리했다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
