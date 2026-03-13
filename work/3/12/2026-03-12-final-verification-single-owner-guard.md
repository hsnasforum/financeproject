# 2026-03-12 최종 검증 단일 소유권 가드

## 변경 파일
- `AGENTS.md`
- `.codex/agents/manager.toml`
- `.codex/agents/tester.toml`
- `scripts/prompts/multi-agent/common.md`
- `scripts/prompts/multi-agent/lead.md`
- `scripts/prompts/multi-agent/validator.md`
- `multi_agent.md`

## 변경 이유
- 최근 세션에서 메인 에이전트와 병렬 `tester`가 같은 `pnpm build`를 겹쳐 실행하면서 orphan build와 `.next` 공유 상태가 최종 검증을 오염시켰다.
- 이 저장소에서는 `pnpm build`, `pnpm e2e:rc`, production smoke처럼 공유 상태를 쓰는 검증을 한 주체만 소유하도록 고정할 필요가 있었다.

## 핵심 변경
- 루트 `AGENTS.md`에 최종 build/e2e/release 계열 검증은 메인 에이전트만 실행한다는 계약을 추가했다.
- 로컬 `manager` 지침에 tester는 검증 세트 분류, 로그 수집, 작은 단위 재현까지만 맡기고 최종 build/e2e는 메인이 단독 실행하도록 명시했다.
- 로컬 `tester` 지침에 메인과 병렬로 같은 `pnpm build` 또는 `pnpm e2e:rc`를 다시 실행하지 말라는 금지 규칙을 추가했다.
- CLI 멀티에이전트 공통/lead/validator 프롬프트에도 같은 단일 소유권 규칙을 반영했다.
- `multi_agent.md` 작업 지침서에 최종 build/e2e 직전 보조 검증 에이전트를 정리하고 메인이 결과를 확정한다는 운영 절차를 추가했다.

## 검증
- `python3 - <<'PY'\nimport tomllib\nfor path in [\n    '.codex/agents/manager.toml',\n    '.codex/agents/tester.toml',\n    '.codex/config.toml',\n]:\n    with open(path, 'rb') as f:\n        tomllib.load(f)\nprint('toml ok')\nPY`
- `git diff --check -- AGENTS.md .codex/agents/manager.toml .codex/agents/tester.toml scripts/prompts/multi-agent/common.md scripts/prompts/multi-agent/lead.md scripts/prompts/multi-agent/validator.md multi_agent.md work/3/12/2026-03-12-final-verification-single-owner-guard.md`

## 남은 리스크
- 이번 수정은 프롬프트/운영 규칙 고정이라서, 이미 떠 있는 세션이나 이미 생성된 보조 에이전트에는 즉시 반영되지 않을 수 있다.
- 사용자가 명시적으로 tester에게 build 재현만 단독으로 시키는 예외 상황은 여전히 가능하므로, 그때도 메인과 동시에 같은 게이트를 돌리지 않게 운영해야 한다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
