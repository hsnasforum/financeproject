# 2026-03-09 CLI 멀티 에이전트 실행 구성

## 목적

- Finance Project에서 `codex` CLI를 역할별 병렬 세션으로 실행할 수 있도록 기본 프롬프트와 실행 스크립트를 추가했다.

## 추가한 파일

- `scripts/prompts/multi-agent/common.md`
- `scripts/prompts/multi-agent/lead.md`
- `scripts/prompts/multi-agent/implementer.md`
- `scripts/prompts/multi-agent/validator.md`
- `scripts/run_codex_multi_agent.sh`

## 실행 방법

- `bash scripts/run_codex_multi_agent.sh "작업 요약"`
- `tmux`가 있으면 3 pane 세션 생성
- `tmux`가 없으면 수동 실행용 `codex` 명령 출력

## 의도

- 현재 저장소의 복잡한 기능 축(planning, recommend, dart, data-sources, products)을 고려해 `총괄/구현/검증` 3역할부터 안정적으로 운용한다.
- 기존 `README.md`, `docs/current-screens.md`, 운영 보안 정책, planning 검증 게이트를 공통 프롬프트에 반영했다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
