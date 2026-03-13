# 2026-03-12 멀티 에이전트 런타임 가이드 정렬

## 변경 파일
- `.codex/config.toml`
- `.codex/agents/manager.toml`
- `.codex/agents/tester.toml`
- `.codex/skills/planning-gate-selector/SKILL.md`
- `multi_agent.md`
- `scripts/prompts/multi-agent/common.md`
- `scripts/prompts/multi-agent/lead.md`
- `scripts/prompts/multi-agent/validator.md`
- `work/3/12/2026-03-12-multi-agent-runtime-guidance-alignment.md`

## 사용 skill
- `work-log-closeout`: 이번 라운드의 변경 이유, 실제 검증, 남은 리스크를 `/work` 형식에 맞춰 정리하는 데 사용.

## 변경 이유
- 최근 `work/` 기록을 다시 보면, 최종 build/e2e 단일 소유권 규칙은 들어갔지만 `.next` 공유 산출물과 wrapper/helper 사용 preflight는 역할 지침에 거의 남아 있지 않았다.
- 또한 Codex native 멀티 에이전트와 CLI tmux 러너의 역할 이름이 달라, `config.toml`과 `multi_agent.md`만 봐서는 어떤 역할이 대응되는지 바로 알기 어려웠다.
- skill 사용 기록 규칙은 documenter 쪽에 주로 몰려 있어, 최종 취합 단계에서 `사용 skill`과 `미실행 검증`이 다시 빠질 여지도 있었다.

## 핵심 변경
- `.codex/config.toml`에는 이 파일이 Codex native 설정이고, CLI 러너 역할은 `scripts/prompts/multi-agent/*.md` 쪽이라는 설명 주석만 추가했다. [가정] 최근 이슈의 직접 원인은 스레드/깊이 값보다 운영 규칙 누락 쪽이라 동작 설정값은 건드리지 않았다.
- `multi_agent.md`에 native 역할과 CLI 역할의 대응 관계를 짧게 적는 `역할 체계 매핑` 섹션을 추가했다.
- `manager.toml`, `tester.toml`, `multi_agent.md`, `common.md`, `lead.md`, `validator.md`에 최종 build/e2e/prod smoke 전 `.next/lock`, `.next-e2e*`, `.next-host*`, standalone shadow를 먼저 확인하고 `pnpm cleanup:next-artifacts` 같은 저장소 helper를 우선 쓰도록 보강했다.
- `planning-gate-selector`에는 Next build/dev/prod wrapper 또는 cleanup helper 변경 시 `node --check`와 관련 entrypoint 직접 검증을 함께 고르게 하는 규칙을 추가했다.
- `manager.toml`, `multi_agent.md`, `common.md`, `lead.md`에는 최종 handoff에서 `사용 skill`, `실행한 검증`, `미실행 검증` 필드가 빠지지 않도록 보강했다.

## 검증
- `python3 - <<'PY'
import tomllib
for path in [
    '.codex/config.toml',
    '.codex/agents/manager.toml',
    '.codex/agents/tester.toml',
]:
    with open(path, 'rb') as f:
        tomllib.load(f)
print('toml ok')
PY`
  - PASS
- `git diff --check -- .codex/config.toml .codex/agents/manager.toml .codex/agents/tester.toml .codex/skills/planning-gate-selector/SKILL.md multi_agent.md scripts/prompts/multi-agent/common.md scripts/prompts/multi-agent/lead.md scripts/prompts/multi-agent/validator.md`
  - PASS
- `rg -n '역할 체계 매핑|cleanup:next-artifacts|사용 skill|미실행 검증|raw \`next build/start\`|node --check' .codex/config.toml .codex/agents/manager.toml .codex/agents/tester.toml .codex/skills/planning-gate-selector/SKILL.md multi_agent.md scripts/prompts/multi-agent/common.md scripts/prompts/multi-agent/lead.md scripts/prompts/multi-agent/validator.md -S`
  - PASS

## 남은 리스크
- 이번 라운드는 역할 대응 관계를 문서화한 것이지, native 에이전트 집합과 CLI 역할 집합을 실제 코드/설정 구조에서 하나로 통합한 것은 아니다.
- `/work` 선확인 규칙은 manager/common/documenter 쪽은 많이 정리됐지만, 모든 역할 프롬프트와 TOML에 같은 강도로 완전히 퍼뜨리지는 않았다.
- `tester.toml` 쪽의 상세 게이트 매트릭스와 `validator.md`, `multi_agent.md`의 요약 규칙은 아직 완전한 단일 SSOT는 아니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
