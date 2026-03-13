# 2026-03-11 manager.toml loop alignment

## 변경 파일

- `.codex/agents/manager.toml`
- `work/3/11/2026-03-11-manager-toml-loop-alignment.md`

## 변경 이유

- `manager.toml`이 저장소의 manager-first 반복 루프를 따르도록 출력 계약을 더 명확히 고정할 필요가 있었다.
- 후속 라운드에서 이전 `/work` 기록과 최신 검증 결과를 먼저 읽고, 종료 시 다시 `/work`에 남기는 흐름을 프롬프트에 직접 반영해야 했다.
- 총괄 에이전트가 확인해야 할 기준 문서로 `docs/current-screens.md`와 `multi_agent.md`를 명시할 필요가 있었다.
- manager 산출물에 필요한 검증이 빠지지 않도록 출력 형식도 함께 고정할 필요가 있었다.

## 핵심 변경

- `manager.toml`의 핵심 역할에 이전 `/work` 기록 이어받기, 종료 시 `/work` 기록 확인, 라운드 종료 요약 책임을 추가했다.
- 최종 충돌 점검 대상에 `AGENTS.md`, `docs/current-screens.md`, `multi_agent.md`를 직접 명시했다.
- 작업 방식에 `3~5단계 분해`, `단계 / 목적 / 추천 에이전트 타입`, `즉시 막는 핵심 경로와 병렬 가능 작업 구분`, `필요한 검증 요약`을 추가했다.
- 출력 형식 섹션을 신설해 manager 산출물 모양을 고정했다.

## 검증

- `python3 -c "import tomllib; tomllib.load(open('.codex/agents/manager.toml','rb')); print('manager.toml ok')"`
- `git diff --check -- .codex/agents/manager.toml work/3/11/2026-03-11-manager-toml-loop-alignment.md`

## 남은 리스크

- 이번 수정은 `manager.toml`만 다뤘다. 다른 agent TOML들도 같은 수준으로 맞출 필요가 있을 수 있다.
- 멀티 에이전트 러너 전체를 실제로 한 번 끝까지 돌려 본 것은 아니고, 이번 라운드에서는 TOML 파싱과 diff 포맷만 확인했다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
