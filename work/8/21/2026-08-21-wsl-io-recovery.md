# 2026-08-21 WSL I/O 과점유 복구 및 재발 방지

## 변경 파일

- `AGENTS.md`
- `work/8/21/2026-08-21-wsl-io-recovery.md`

## 사용 skill

- `finance-skill-routing`: 이번 ops/docs 라운드에 필요한 최소 skill 조합 선정
- `planning-gate-selector`: agent 규칙 변경에 맞는 검증 게이트 선정
- `codex-agent-rules-maintenance`: 공통 Codex 실행 규칙의 위치와 중복 여부 점검
- `openai-docs`: 저장소 루트 `AGENTS.md`의 적용 범위와 새 실행에서의 로딩 시점 확인
- `work-log-closeout`: 실제 조치와 검증 결과를 표준 형식으로 기록

## 변경 이유

- 여러 Codex 작업이 `find ..`, 재귀 `du`, 파일 수 집계, `/proc` 순회를 동시에 실행하면서 종료되지 않은 `wsl.exe` 부모/자식 호출이 누적됐다.
- Linux 내부 I/O가 가라앉은 뒤에도 새 `wsl.exe` 호출이 프로세스 생성 전 단계에서 멈춰, 정체 호출과 장기 실행 relay를 분리해 복구할 필요가 있었다.
- 같은 실패 모드가 반복되지 않도록 상위 경로 탐색, 병렬 재귀 조회, timeout 후 재시도 범위를 저장소 공통 규칙으로 제한할 필요가 있었다.

## 핵심 변경

- 1분 이상 멈춘 읽기 전용 진단 명령의 정확한 `wsl.exe` 프로세스 트리만 정리했다.
- 마지막 연결 복구를 위해 3시간 이상 유휴 상태였던 `wowlog`의 `corepack pnpm start` relay를 종료했다. 앱 자체가 과점유 원인이었다고 단정하지 않는다.
- `AGENTS.md`에서 WSL/UNC의 `find ..` 및 상위 경로 재귀 탐색을 금지하고 저장소 내부 후보 경로 또는 `rg --files`를 사용하도록 했다.
- 넓은 WSL 파일 조회는 직렬 실행하며, timeout 뒤에는 새 조회를 겹치기 전에 정확한 프로세스 트리를 정리하고 작은 응답성 확인을 거치도록 했다.
- 복구 뒤 제한 탐색을 세 번 반복해도 호출이 누적되지 않았고 `vmmemWSL`의 측정 시점 I/O는 0 B/s였다.

## 검증

- `pnpm multi-agent:guard`: 비로그인 WSL 셸의 `PATH`에 `pnpm`이 없어 실행 불가(`pnpm: command not found`).
- `corepack pnpm multi-agent:guard`: PASS.
- `wsl.exe -d Ubuntu -- bash -lc 'printf "WSL_OK\\n"; cat /proc/pressure/io'`: PASS, 약 0.7초 내 반환, I/O pressure `avg10=0.00`.
- `wsl.exe -d Ubuntu --cd /home/xpdlqj/code/finance -- bash -lc 'git rev-parse --show-toplevel; rg --files -g "AGENTS.md" -g "AGENTS.override.md" | wc -l'`: 3회 PASS, 각 약 0.87~0.93초, 종료 후 잔류 `wsl.exe` 없음.
- `Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "Name='vmmemWSL'"`: 측정 시점 `IOReadBytesPersec=0`, `IOWriteBytesPersec=0`.
- `git diff --check -- AGENTS.md`: PASS.
- `git diff --no-index --check -- /dev/null work/8/21/2026-08-21-wsl-io-recovery.md`: whitespace 오류 없음. 새 파일 비교이므로 exit 1.

## 남은 리스크

- `wowlog` 로컬 서버는 중단된 상태이며 필요할 때 해당 저장소에서 다시 시작해야 한다.
- `vmmemWSL` working set은 약 8.9GB로 남아 있으나 측정 시점 I/O는 0 B/s였다. 이는 캐시를 포함하므로 이번 I/O 원인과 동일하다고 단정하지 않는다.
- `AGENTS.md` 변경은 새 Codex 실행에서 다시 로드된다. 이미 시작된 다른 작업은 이전 규칙을 계속 사용할 수 있다.

## 다음 라운드

- 잔여 worktree 통합 PR 병합을 확인한 뒤 임시 통합 worktree와 외부 복구 스냅샷을 제거하고, 원래 `finance` 폴더만 남았는지 최종 확인한다.
