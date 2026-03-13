# 2026-03-12 /work 월-일 폴더 규칙 정렬

## 변경 파일
- `AGENTS.md`
- `README.md`
- `multi_agent.md`
- `work/README.md`
- `.codex/skills/work-log-closeout/SKILL.md`
- `.codex/agents/analyzer.toml`
- `.codex/agents/developer.toml`
- `.codex/agents/documenter.toml`
- `.codex/agents/manager.toml`
- `.codex/agents/planner.toml`
- `.codex/agents/researcher.toml`
- `.codex/agents/reviewer.toml`
- `.codex/agents/tester.toml`
- `scripts/prompts/multi-agent/common.md`
- `scripts/prompts/multi-agent/documenter.md`
- `scripts/prompts/multi-agent/implementer.md`
- `scripts/prompts/multi-agent/lead.md`
- `scripts/prompts/multi-agent/planner.md`
- `scripts/prompts/multi-agent/researcher.md`
- `scripts/prompts/multi-agent/reviewer.md`
- `scripts/prompts/multi-agent/validator.md`
- `work/3/12/2026-03-12-work-log-folder-routing.md`

## 사용 skill
- `planning-gate-selector`: 프롬프트/에이전트/스킬 변경에 필요한 최소 검증을 `pnpm multi-agent:guard`로 좁히는 데 사용.
- `work-log-closeout`: 새 `/work` 경로 규칙에 맞는 종료 기록 형식을 정리하는 데 사용.

## 변경 이유
- `/work` 종료 기록이 flat 경로로 쌓여 월/일 기준 탐색과 이어받기 기준이 문서마다 달랐습니다.
- 작업 시작 시 오늘 문서를 우선 보고, 오늘 문서가 없으면 가장 가까운 이전 날짜 문서를 참고하는 규칙을 공통 SSOT와 역할 프롬프트에 같이 반영할 필요가 있었습니다.

## 핵심 변경
- `/work` 저장 경로를 `work/<현재월>/<현재일>/YYYY-MM-DD-<slug>.md`로 통일하고, 폴더가 없으면 먼저 생성하도록 AGENTS, 멀티 에이전트 지침, 문서화 역할 프롬프트에 반영했습니다.
- 작업 시작 시 `work/<현재월>/<현재일>/`의 최신 문서와 최신 검증 결과를 먼저 확인하고, 오늘 문서가 없으면 가장 가까운 이전 날짜의 최신 `/work` 문서를 확인하도록 공통 규칙을 추가했습니다.
- `work/README.md`에 새 예시 경로 `work/3/12/...`와 레거시 flat 메모 유지 방침을 기록했습니다.
- `work-log-closeout` skill을 새 경로에 맞춰 갱신해 폴더 생성과 filename suggestion 기준을 명시했습니다.
- 이번 라운드 closeout 자체를 새 경로 `work/3/12/` 아래에 저장해 규칙을 즉시 적용했습니다.

## 검증
- `rg -n '후속 라운드면 이전|/work/YYYY-MM-DD' AGENTS.md multi_agent.md work/README.md .codex/skills .codex/agents scripts/prompts/multi-agent`
- `pnpm multi-agent:guard`
- `git diff --check -- AGENTS.md README.md multi_agent.md work/README.md .codex/skills/work-log-closeout/SKILL.md .codex/agents/analyzer.toml .codex/agents/developer.toml .codex/agents/documenter.toml .codex/agents/manager.toml .codex/agents/planner.toml .codex/agents/researcher.toml .codex/agents/reviewer.toml .codex/agents/tester.toml scripts/prompts/multi-agent/common.md scripts/prompts/multi-agent/documenter.md scripts/prompts/multi-agent/implementer.md scripts/prompts/multi-agent/lead.md scripts/prompts/multi-agent/planner.md scripts/prompts/multi-agent/researcher.md scripts/prompts/multi-agent/reviewer.md scripts/prompts/multi-agent/validator.md work/3/12/2026-03-12-work-log-folder-routing.md`

## 남은 리스크
- 기존 flat 경로 `work/YYYY-MM-DD-*.md` 메모를 참조하는 과거 closeout과 문서 링크는 이력으로 남아 있어 한동안 새 규칙과 혼재합니다.
- 현재 규칙은 지침/프롬프트 기준 정렬입니다. 실제 자동 탐색/생성 helper가 필요하면 별도 스크립트나 guard로 강제하는 추가 작업이 필요합니다.

## 다음 작업자 인계사항
- 새 라운드는 먼저 `work/3/12/`의 최신 md를 확인하고, 오늘 기록이 없으면 가장 가까운 이전 날짜 폴더의 최신 `/work` 문서를 확인하면 됩니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
