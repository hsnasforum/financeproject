# 2026-03-11 agent TOML follow-up alignment

## 변경 파일

- `.codex/agents/analyzer.toml`
- `.codex/agents/developer.toml`
- `.codex/agents/documenter.toml`
- `.codex/agents/planner.toml`
- `.codex/agents/researcher.toml`
- `.codex/agents/reviewer.toml`
- `.codex/agents/tester.toml`
- `work/3/11/2026-03-11-agent-toml-followup-alignment.md`

## 변경 이유

- `manager.toml` 보강 이후 나머지 agent TOML도 저장소의 반복 실행 규칙, 경로 SSOT, 문서 정합성 기준과 맞는지 점검할 필요가 있었다.
- 특히 `analyzer.toml`은 사용자 재무 상태 진단 중심으로 적혀 있어, 실제 멀티 에이전트 코딩 루프에서 필요한 영향 경로 분석 역할과 다소 어긋나 있었다.

## 핵심 변경

- `analyzer.toml`을 영향 경로, 외부 데이터 의존성, 계산/문구 정합성, 권장 수정 방향 중심의 분석 역할로 재정렬했다.
- `planner.toml`, `developer.toml`, `documenter.toml`에 후속 라운드의 `/work` 이어받기, `AGENTS.md`/`docs/current-screens.md`/`multi_agent.md` 기준 확인, 필요한 검증과 문서 갱신 판단을 보강했다.
- `researcher.toml`, `reviewer.toml`, `tester.toml`에는 제품 로직에 직접 쓰는 값의 기준일/출처 명시, 경로 SSOT 확인 같은 빠진 체크만 최소로 추가했다.

## 검증

- `python3 -c "import tomllib; [tomllib.load(open(p, 'rb')) for p in ['.codex/agents/analyzer.toml', '.codex/agents/developer.toml', '.codex/agents/documenter.toml', '.codex/agents/planner.toml', '.codex/agents/researcher.toml', '.codex/agents/reviewer.toml', '.codex/agents/tester.toml']]; print('agent toml ok')"`
- `git diff --check -- .codex/agents/analyzer.toml .codex/agents/developer.toml .codex/agents/documenter.toml .codex/agents/planner.toml .codex/agents/researcher.toml .codex/agents/reviewer.toml .codex/agents/tester.toml work/3/11/2026-03-11-agent-toml-followup-alignment.md`

## 남은 리스크

- 이번 수정은 각 agent TOML의 지시문 정합성을 맞춘 것이며, 실제 멀티 에이전트 러너를 전체 시나리오로 끝까지 재현한 것은 아니다.
- `approval_policy`, `sandbox_mode`, 모델 선택 같은 실행 설정값은 이번 범위에서 건드리지 않았다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
