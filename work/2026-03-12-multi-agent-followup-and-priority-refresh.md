# 2026-03-12 멀티 에이전트 후속 정리 및 우선순위 재고정

## 변경 파일
- `scripts/prompts/multi-agent/planner.md`
- `scripts/prompts/multi-agent/reviewer.md`
- `work/2026-03-12-multi-agent-followup-and-priority-refresh.md`

## 사용 skill
- `planning-gate-selector`
  - 이번 라운드가 앱 기능 수정이 아니라 멀티 에이전트 handoff 정리와 운영 리스크 재우선순위화 범위인지 다시 분류하고, 정적 검증만으로 충분한지 판단하는 데 사용했다.
- `work-log-closeout`
  - 실제 변경, 실제 검증, 남은 리스크, 다음 우선순위를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 직전 closeout의 남은 항목 세 가지 중 이번 턴에 실제로 닫을 수 있는 것은 `reviewer/planner/researcher handoff 필드 재점검`과 `build/runtime/data-sources 우선순위 재고정`이었다.
- 현재 `git status` 기준으로 `.codex/agents/*`, `scripts/prompts/multi-agent/*`는 더 이상 `??`가 아니라 `A`/`AM` 상태라, 직전 라운드의 `git 기준 untracked` 리스크는 현재 상태 기준으로 닫혔다.
- reviewer/planner/researcher 중 실제 누락은 CLI `planner`, `reviewer` 출력 계약 쪽에 가까웠고, `researcher`는 이미 `사용 skill / 실행한 확인 / 미실행 내부 검증` 구분이 들어가 있었다.

## 핵심 변경
- `scripts/prompts/multi-agent/planner.md`에 `사용 skill` handoff 항목을 명시하고, 출력 형식도 `사용 skill / 실행한 검증 / 미실행 검증` 순서로 정리했다.
- `scripts/prompts/multi-agent/reviewer.md`에 `사용 skill`과 `실행한 확인 / 미실행 검증` 구분 규칙을 추가해 reviewer도 handoff 필드를 더 명확히 남기게 했다.
- `.codex/agents/*`, `scripts/prompts/multi-agent/*`의 현재 git 상태를 다시 확인해, 관리 대상 편입 여부가 더 이상 `미정`이 아니라 현재 워크트리 기준 `추가됨` 상태임을 확인했다.
- 최근 `/work` 기준으로 build/runtime/data-sources 축은 `즉시 blocker`와 `환경 특이 follow-up`을 다시 구분해 다음 우선순위를 재고정했다.

## 검증
- `python3 - <<'PY' ... tomllib.load(...) ... PY`
  - PASS (`.codex/agents/planner.toml`, `.codex/agents/reviewer.toml`, `.codex/agents/researcher.toml` 파싱 확인)
- `rg -n "사용 skill|실행한 검증|실행한 확인|미실행 검증|미실행 내부 검증" .codex/agents/{planner,reviewer,researcher}.toml scripts/prompts/multi-agent/{planner,reviewer,researcher}.md -S`
  - PASS
- `git diff --check --cached -- .codex/agents scripts/prompts/multi-agent`
  - PASS
- `git status --short -- .codex/agents scripts/prompts/multi-agent`
  - PASS
  - `??` 없이 `A`/`AM`만 확인돼, 직전 closeout의 untracked 리스크는 현재 상태 기준으로 닫힘

## 미실행 검증
- `pnpm build`
  - 미실행. 이번 라운드는 앱 코드, 사용자 경로, runtime 스크립트를 직접 수정하지 않은 프롬프트/handoff 정리 범위였다.
- `pnpm e2e:rc`
  - 미실행. 사용자 흐름과 셀렉터 변경이 없다.
- `pnpm verify`
  - 미실행. 저장소 전체 게이트를 다시 열 필요가 없는 운영 프롬프트 정리 범위다.

## 남은 리스크
- 이미 떠 있는 세션이나 이미 생성된 보조 에이전트 응답은 이번 프롬프트 정리를 자동 반영하지 않는다.
- `work/` 하위에는 여전히 오래된 로컬 메모가 다수 `??` 상태로 남아 있다. 이번 라운드의 직접 범위는 아니지만, `/work` 디렉터리 자체의 관리 정책은 별도 정리가 필요하다.
- build/runtime/data-sources 축은 기능 blocker로 다시 열리지는 않았지만, foreground Codex exec 환경의 `pnpm build` `143` 종료는 환경 특이 follow-up으로 남는다.

## 이번 라운드 완료 항목
1. CLI `planner`의 `사용 skill / 실행한 검증 / 미실행 검증` handoff 누락 보강
2. CLI `reviewer`의 `사용 skill / 실행한 확인 / 미실행 검증` 출력 계약 보강
3. `.codex/agents/*`, `scripts/prompts/multi-agent/*`의 현재 git 상태 재확인으로 untracked 리스크 해소
4. build/runtime/data-sources 후속 우선순위 재고정

## 다음 라운드 우선순위
1. `work/` 디렉터리의 로컬 메모 관리 정책을 정리할지 결정
2. foreground Codex exec 환경에서만 남는 `pnpm build` `143` 종료를 detached PASS 경로와 분리해 문서화하거나 helper로 더 명시적으로 감쌀지 결정
3. data-sources 축은 blocker가 아니라 follow-up으로 유지하되, 필요 시 support bundle/audit 분리 규칙만 좁게 재검토
