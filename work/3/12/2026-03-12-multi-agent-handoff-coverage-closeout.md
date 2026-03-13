# 2026-03-12 멀티 에이전트 handoff coverage closeout

## 변경 파일
- `.codex/agents/tester.toml`
- `.codex/agents/documenter.toml`
- `scripts/prompts/multi-agent/validator.md`
- `scripts/prompts/multi-agent/documenter.md`

## 사용 skill
- `planning-gate-selector`
  - 멀티 에이전트 지침 변경이 런타임/검증 규칙 축인지 확인하고, 앱 게이트 대신 TOML 파싱과 정적 일관성 검증만으로 충분한 범위를 고르는 데 사용했다.
- `work-log-closeout`
  - 이번 라운드의 실제 변경, 실행한 검증, 미실행 검증 이유, 다음 우선순위를 `/work` 형식에 맞춰 정리하는 데 사용했다.

## 변경 이유
- 최근 `/work` 기록을 다시 보면 멀티 에이전트 규칙의 큰 방향은 정리됐지만, `tester`와 CLI `validator`에는 후속 라운드의 `/work` 선확인 규칙과 `사용 skill` handoff 규칙이 여전히 느슨했다.
- `documenter` 계열도 `/work`와 최종 handoff에 `사용 skill / 실행한 검증 / 미실행 검증`을 반드시 남기는 출력 계약이 약해, 같은 누락 리스크가 반복될 여지가 있었다.
- 이번 라운드는 dirty tree에서 앱 기능을 건드리지 않고도 즉시 닫을 수 있는 잔여 리스크를 우선 닫는 최소 수정에 집중했다.

## 핵심 변경
- `.codex/agents/tester.toml`에 후속 라운드의 `/work` 선확인 규칙과 `사용 skill` handoff 항목을 추가했다.
- `scripts/prompts/multi-agent/validator.md`에 같은 `/work` 선확인 규칙과 `사용 skill` 기록 규칙을 반영하고, 출력 형식을 `실행한 검증 / 미실행 검증` 중심으로 맞췄다.
- `.codex/agents/documenter.toml`과 `scripts/prompts/multi-agent/documenter.md`에 `/work`와 최종 handoff에서 `사용 skill / 실행한 검증 / 미실행 검증`을 빠뜨리지 않는 규칙을 추가했다.
- 문서화 출력 순서에도 위 세 필드를 명시해, closeout 누락을 프롬프트 단계에서 먼저 줄이도록 보강했다.

## 검증
- `python3 - <<'PY' ... tomllib.load(...) ... PY`
  - PASS (`.codex/agents/tester.toml`, `.codex/agents/documenter.toml` 파싱 확인)
- `git diff --check -- .codex/agents/tester.toml .codex/agents/documenter.toml scripts/prompts/multi-agent/validator.md scripts/prompts/multi-agent/documenter.md`
  - PASS
- `rg -n "(/work|사용 skill|실행한 검증|미실행 검증)" .codex/agents/tester.toml .codex/agents/documenter.toml scripts/prompts/multi-agent/validator.md scripts/prompts/multi-agent/documenter.md -S`
  - PASS

## 미실행 검증
- `pnpm build`
  - 미실행. 앱 코드, 라우트, 런타임 스크립트를 건드리지 않은 프롬프트/TOML 정리 라운드라 이번 범위의 최소 검증에서 제외했다.
- `pnpm e2e:rc`
  - 미실행. 사용자 경로, 셀렉터, UI 동작 변경이 없다.
- `pnpm verify`
  - 미실행. 저장소 전체 게이트를 다시 열 필요가 없는 지침 정렬 범위다.

## 남은 리스크
- 이번 라운드는 멀티 에이전트 handoff 누락 리스크를 줄인 것이지, 이미 떠 있는 세션이나 이미 생성된 보조 에이전트 응답까지 자동으로 교정하지는 않는다.
- 현재 워크트리에서 위 네 파일은 git 기준 untracked 상태라, 후속 정리 시 이번 라운드 변경분을 실제 관리 대상에 포함할지 확인이 필요하다.
- build/runtime/data-sources 축의 기존 남은 리스크는 이번 라운드에서 다시 열지 않았으므로, 별도 우선순위로 관리해야 한다.

## 이번 라운드 완료 항목
1. `tester`와 CLI `validator`의 `/work` 선확인 규칙 누락 보강
2. `tester`/`validator`의 `사용 skill / 실행한 검증 / 미실행 검증` handoff 항목 정렬
3. `documenter` 계열의 closeout 출력 계약 보강

## 다음 라운드 우선순위
1. untracked 상태의 `.codex/agents/*`, `scripts/prompts/multi-agent/*` 파일을 실제 관리 대상에 포함할지 정리
2. 필요 시 `reviewer`, `planner`, `researcher` 출력 형식에도 `사용 skill / 실행한 검증 / 미실행 검증` 강제 수준이 충분한지 마지막 교차 점검
3. 앱 기능 축으로 돌아갈 경우, 별도 라운드에서 build/runtime/data-sources 잔여 리스크를 다시 우선순위화
