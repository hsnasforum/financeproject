# 2026-03-12 skill usage work log alignment

## 변경 파일
- `AGENTS.md`
- `multi_agent.md`
- `.codex/agents/documenter.toml`
- `.codex/skills/planning-gate-selector/SKILL.md`
- `scripts/prompts/multi-agent/documenter.md`
- `.codex/skills/work-log-closeout/SKILL.md`
- `work/3/12/2026-03-12-build-prod-smoke-runtime-closeout.md`

## 변경 이유
- 세션 로그에서 `planning-gate-selector`, `work-log-closeout` skill 본문을 실제로 연 흔적이 확인됐지만, 최근 `/work` 기록만 보면 어떤 skill을 썼는지 드러나지 않았다.
- skill이 실제로 쓰였다면 `/work`에도 남아야 나중에 저장소 안 기록만 보고도 어떤 지침이 작동했는지 추적할 수 있다.

## 핵심 변경
- 루트 `AGENTS.md`에 사용한 skill이 있으면 `/work`에 이름과 용도를 남기라는 규칙을 추가했다.
- `multi_agent.md`, 로컬/CLI `documenter` 지침에도 같은 기록 규칙을 반영했다.
- `planning-gate-selector`에 선택한 검증 세트를 이후 `/work` closeout에 넘기라고 연결 규칙을 추가했다.
- `work-log-closeout` skill에 `사용 skill` 섹션을 optional 기본 구조로 추가하고, 실제 사용한 skill만 적도록 명시했다.
- 최근 closeout 기록인 `2026-03-12-build-prod-smoke-runtime-closeout.md`에 세션 로그 기준의 `planning-gate-selector`, `work-log-closeout` 참조 사실을 추가했다.

## 검증
- `python3 - <<'PY'\nimport tomllib\nwith open('.codex/agents/documenter.toml', 'rb') as f:\n    tomllib.load(f)\nprint('toml ok')\nPY`
- `git diff --check -- AGENTS.md multi_agent.md .codex/agents/documenter.toml scripts/prompts/multi-agent/documenter.md .codex/skills/planning-gate-selector/SKILL.md .codex/skills/work-log-closeout/SKILL.md work/3/12/2026-03-12-build-prod-smoke-runtime-closeout.md work/3/12/2026-03-12-skill-usage-work-log-alignment.md`

## 남은 리스크
- 이번 정리는 `/work`에 skill 사용 흔적을 남기는 규칙을 추가한 것이지, 모든 세션에서 자동으로 `사용 skill` 섹션이 빠짐없이 채워진다는 강제 장치는 아니다.
- 과거 `/work` 기록에는 같은 기준이 적용되지 않았으므로, 이전 라운드까지 일괄 소급 정리는 아직 하지 않았다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
