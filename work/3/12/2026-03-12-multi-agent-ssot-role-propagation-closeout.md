# 2026-03-12 멀티 에이전트 SSOT 및 역할 전파 정리

## 변경 파일
- `.codex/agents/analyzer.toml`
- `.codex/agents/developer.toml`
- `.codex/agents/planner.toml`
- `.codex/agents/reviewer.toml`
- `.codex/agents/researcher.toml`
- `.codex/agents/tester.toml`
- `multi_agent.md`
- `scripts/prompts/multi-agent/common.md`
- `scripts/prompts/multi-agent/implementer.md`
- `scripts/prompts/multi-agent/planner.md`
- `scripts/prompts/multi-agent/researcher.md`
- `scripts/prompts/multi-agent/reviewer.md`
- `scripts/prompts/multi-agent/validator.md`
- `work/3/12/2026-03-12-multi-agent-ssot-role-propagation-closeout.md`

## 사용 skill
- `work-log-closeout`
  - 이번 라운드의 변경 파일, 실제 검증, 남은 리스크를 `/work` 형식에 맞춰 정리하는 데 사용했다.

## 변경 이유
- 최근 `work/3/12/2026-03-12-multi-agent-runtime-guidance-alignment.md`의 남은 리스크 두 가지는 `모든 역할에 규칙이 같은 강도로 퍼지지 않은 점`과 `검증 게이트 기준이 여러 파일에 흩어진 점`이었다.
- 내부 검토 결과, 기능 추가보다 운영 규칙 정렬이 우선이었고, 이번 라운드의 최소 안전 수정은 `SSOT 명시`와 `누락 역할 보강`이었다.

## 핵심 변경
- `multi_agent.md`에 `검증 게이트 단일 기준` 섹션을 추가해 검증 매트릭스, 최종 검증 단일 소유권, shared Next runtime preflight를 한 곳 기준으로 모았다.
- `tester.toml`, `scripts/prompts/multi-agent/common.md`, `scripts/prompts/multi-agent/validator.md`가 위 SSOT를 우선 참조하도록 맞췄다.
- native agent 중 `analyzer`, `developer`, `planner`, `reviewer`, `researcher`에 `/work` 선확인, handoff 필드, shared Next runtime 관련 규칙을 필요한 수준으로 보강했다.
- CLI prompt 중 `implementer`, `planner`, `researcher`, `reviewer`에도 같은 수준의 운영 규칙을 퍼뜨려 native/CLI 드리프트를 줄였다.
- `common.md`, `implementer.md`, `planner.md`, `reviewer.md`, `developer.toml`에는 `사용 skill / 실행한 검증 / 미실행 검증` handoff를 빠뜨리지 않도록 출력 계약을 보강했다.

## 검증
- `python3 - <<'PY'
import tomllib
for path in [
    '.codex/agents/analyzer.toml',
    '.codex/agents/developer.toml',
    '.codex/agents/planner.toml',
    '.codex/agents/reviewer.toml',
    '.codex/agents/researcher.toml',
    '.codex/agents/tester.toml',
]:
    with open(path, 'rb') as f:
        tomllib.load(f)
print('toml ok')
PY`
  - PASS
- `git diff --check -- .codex/agents/analyzer.toml .codex/agents/developer.toml .codex/agents/planner.toml .codex/agents/reviewer.toml .codex/agents/researcher.toml .codex/agents/tester.toml multi_agent.md scripts/prompts/multi-agent/common.md scripts/prompts/multi-agent/implementer.md scripts/prompts/multi-agent/planner.md scripts/prompts/multi-agent/researcher.md scripts/prompts/multi-agent/reviewer.md scripts/prompts/multi-agent/validator.md`
  - PASS
- `rg -n '검증 게이트 단일 기준|사용 skill|미실행 검증|cleanup:next-artifacts|/work|단일 소유|shared Next' .codex/agents/*.toml multi_agent.md scripts/prompts/multi-agent/*.md -S`
  - PASS

## 남은 리스크
- 이번 라운드는 운영 규칙을 정렬한 것이지, native agent 집합과 CLI 역할 집합을 구조적으로 하나로 통합한 것은 아니다.
- 실제 멀티 에이전트 런타임에서 모든 역할 쌍이 새 규칙을 동일하게 따르는지는 별도 실행 라운드가 있어야 완전히 확인할 수 있다. 이번 라운드는 정적 일관성 검증까지 수행했다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
