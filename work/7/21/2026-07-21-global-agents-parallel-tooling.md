# 2026-07-21 Codex 전역 병렬화 및 일괄 검증 지침

## 변경 파일

- `C:\Users\HS\.codex\AGENTS.md`
- `work/7/21/2026-07-21-global-agents-parallel-tooling.md`

## 사용 skill

- `codex-agent-rules-maintenance`: 전역 `AGENTS.md`의 기존 구조와 중복·충돌을 점검하고 최소 범위로 수정했습니다.
- `finance-skill-routing`: 이번 규칙 변경에 필요한 skill 조합을 선별했습니다.
- `planning-gate-selector`: 앱 코드에 영향이 없는 지침 변경으로 분류하고 정적 검증과 multi-agent guard를 선택했습니다.
- `openai-docs`: 공식 Codex 매뉴얼에서 `~/.codex/AGENTS.md`가 모든 저장소에 적용되는 개인 기본값임을 확인했습니다.
- `work-log-closeout`: 변경 파일, 실제 검증 결과, 남은 적용 조건을 표준 형식으로 기록했습니다.

## 변경 이유

- 독립적인 도구·파일 조회를 불필요하게 순차 실행하는 비용을 줄이고, 작은 수정마다 테스트와 diff 확인을 반복하는 비효율을 피하기 위해 전역 기본 동작을 명시했습니다.

## 핵심 변경

- 병렬 실행 가능한 독립 도구 호출은 병렬 처리를 우선하도록 했습니다.
- 선행 결과에 의존하지 않는 복수의 `rg`·`Get-Content` 파일 탐색은 한 번의 병렬 호출로 묶도록 했습니다.
- 수정과 동작 검증은 작은 함수별 반복보다 기능 또는 파일 단위로 모아 처리하도록 했습니다.
- `git diff`는 일반적으로 파일 전체 수정 후 한 번 확인하도록 했습니다.
- 복잡하거나 여러 함수·파일에 걸친 변경은 필요하면 수정 직후 중간 검증을 허용했습니다.

## 검증

- UTF-8 strict decode로 `C:\Users\HS\.codex\AGENTS.md` 전체 읽기: PASS
- `rg -n -S '서로 독립적이고 병렬 실행 가능한|복수의 `rg` 또는 `Get-Content`|기능 또는 파일 단위|매 코드 수정마다 `git diff`|해당 수정 직후 중간 검증' C:\Users\HS\.codex\AGENTS.md`: PASS
- 전역 `AGENTS.override.md` 존재 여부: 없음
- 전역·저장소 `AGENTS.md` 합산 크기: 25,146 bytes로 기본 32,768 bytes 한도 이내
- `pnpm multi-agent:guard`: FAIL — Windows 실행기가 UNC 작업 경로를 지원하지 않았고 WSL에는 `pnpm`이 설치되어 있지 않았습니다.
- `node .\scripts\multi_agent_handoff_guard.mjs`: PASS — `tracked=25`, `coverage=16`
- `git diff --check -- work/7/21/2026-07-21-global-agents-parallel-tooling.md`: PASS

## 남은 리스크

- Codex는 실행 시작 시 지침 체인을 읽으므로 변경된 전역 지침은 새 작업 또는 재시작 후 확실히 적용됩니다.
- 더 가까운 저장소·하위 디렉터리 `AGENTS.md`에 충돌하는 규칙이 있으면 해당 규칙이 우선합니다.
