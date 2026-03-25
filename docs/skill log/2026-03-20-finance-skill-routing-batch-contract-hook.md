# 2026-03-20 finance-skill-routing batch contract hook

## 변경 파일
- `.codex/skills/finance-skill-routing/SKILL.md`
- `work/3/20/2026-03-20-finance-skill-routing-batch-contract-hook.md`

## 사용 skill
- `skill-creator`: 새 batch contract skill을 existing routing 규칙에 연결했다.
- `planning-gate-selector`: skill 문서 변경에 맞는 최소 검증으로 `git diff --check`와 `pnpm multi-agent:guard`를 선택했다.
- `work-log-closeout`: 표준 `/work` closeout 형식으로 이번 라운드를 기록했다.

## 변경 이유
- `planning-v3-batch-contract-narrowing`을 새로 만들었지만, 현재 routing 문서에는 이 skill을 선택해야 하는 조건이 없었다.
- 최근 planning v3 `N2` 배치가 같은 batch-family narrowing 패턴을 반복하고 있어서, routing 쪽에서도 이 흐름을 명시적으로 잡아줄 필요가 있었다.

## 핵심 변경
- `finance-skill-routing`의 conditional skill 목록에 `planning-v3-batch-contract-narrowing`을 추가했다.
- 트리거 범위를 batch detail/summary, categorized/cashflow, balances/monthly, draft/profile, batch list/center, synthetic stored-only batch, override helper narrowing으로 명시했다.
- 최신 `/work`가 repeated planning v3 batch-family narrowing 흐름이면 route-local 규칙을 새로 만들기 전에 이 skill을 우선 붙이라는 workflow 문구를 추가했다.

## 검증
- 실행한 검증
  - `git diff --check -- .codex/skills/finance-skill-routing/SKILL.md work/3/20/2026-03-20-finance-skill-routing-batch-contract-hook.md`
  - `pnpm multi-agent:guard`
- 미실행 검증
  - `pnpm lint`
  - `pnpm build`

## 남은 리스크
- routing 문서는 여전히 high-level 가이드라서, 실제 라운드에서는 메인 에이전트가 범위를 좁게 유지해야 한다.
- 과거 `/work` note들이 새 skill 기준으로 재분류되지는 않았으므로, 효과는 다음 batch-family 구현 라운드부터 확인해야 한다.

## 다음 라운드 우선순위
- 다음 실제 planning v3 `N2` batch-family 구현 라운드에서 `planning-v3-batch-contract-narrowing`이 자연스럽게 선택되는지 확인한다.
