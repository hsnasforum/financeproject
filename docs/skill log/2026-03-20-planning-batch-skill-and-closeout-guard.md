# 2026-03-20 planning-v3 batch skill and closeout guard updates

## 변경 파일

- `.codex/skills/planning-v3-batch-contract-narrowing/SKILL.md`
- `.codex/skills/planning-gate-selector/SKILL.md`
- `.codex/skills/work-log-closeout/SKILL.md`
- `work/3/20/2026-03-20-planning-batch-skill-and-closeout-guard.md`

## 사용 skill

- `skill-creator`: 새 skill의 trigger/guardrail/workflow 범위를 최근 `/work` 패턴에 맞춰 압축하는 데 사용
- `planning-gate-selector`: skill 파일 변경 범위에 맞춰 `git diff --check`와 `pnpm multi-agent:guard`를 최소 검증 세트로 고르는 데 사용
- `work-log-closeout`: 이번 skill 변경 라운드의 실제 수정 파일, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- 최근 `N2 planning/v3 batch-family` 라운드에서 stored-first ownership, explicit legacy fallback, public `createdAt` boundary, synthetic stored-only batch 처리 규칙이 반복적으로 다시 설명되고 있었다.
- `planning-gate-selector`는 잘 쓰이고 있었지만, 저장소 반복 패턴을 더 직접적으로 안내하는 묶음이 부족했다.
- `work-log-closeout`도 전반적으로 잘 맞았지만, 일부 note에서 제목과 섹션 순서가 드리프트한 사례가 있어 표준 형식을 더 명확히 잠글 필요가 있었다.

## 핵심 변경

- `planning-v3-batch-contract-narrowing` skill을 새로 추가해 `N2` batch-family contract narrowing 라운드의 공통 invariants, surface patterns, common failure modes를 한곳에 묶었다.
- `planning-gate-selector`에 planning v3 batch detail/summary, categorized/cashflow, balances/draft profile, batch list/center, docs-only, skill/config 변경에 대한 저장소 반복 검증 세트를 추가했다.
- `work-log-closeout`에 제목 `# YYYY-MM-DD`, 표준 섹션명, 섹션 순서 유지 규칙을 더 분명히 적어 최근 `/work` 형식 드리프트를 줄이도록 보강했다.

## 검증

- 실행한 검증
- `git diff --check -- .codex/skills/planning-v3-batch-contract-narrowing/SKILL.md .codex/skills/planning-gate-selector/SKILL.md .codex/skills/work-log-closeout/SKILL.md`
- `pnpm multi-agent:guard`
- 관찰 메모
- 첫 `pnpm multi-agent:guard` 실행은 직전 최신 note `work/3/20/2026-03-20-n2-synthetic-stored-only-batch-ordering-normalization.md`에 `## 다음 라운드` 헤더가 없어 실패했다.
- 이번 closeout note를 표준 형식과 `## 다음 라운드 우선순위`까지 포함해 추가한 뒤 다시 실행해 latest note 기준 guard를 충족하도록 정리한다.
- 미실행 검증
- `pnpm lint`
- `pnpm build`

## 남은 리스크

- `finance-skill-routing`은 이번 라운드 범위에 넣지 않았으므로, 새 `planning-v3-batch-contract-narrowing` skill은 당분간 direct trigger나 수동 선택에 더 의존한다.
- `work-log-closeout` 규칙은 강화됐지만, 기존 historical `/work` note 드리프트를 자동으로 보정하지는 않는다.

## 다음 라운드 우선순위

- `finance-skill-routing`에 `planning-v3-batch-contract-narrowing`을 언제 조건부로 붙일지 최소 규칙을 추가해 새 skill이 최근 `N2` 배치 흐름에서 자연스럽게 선택되도록 맞춘다.
