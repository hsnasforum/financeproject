# 2026-03-12 Windows bridge startup 로그 정리

## 변경 파일
- `scripts/next_dev_safe.mjs`
- `scripts/windows_localhost_bridge.ps1`
- `tests/next-dev-safe-bridge-status.test.ts`
- `work/3/12/2026-03-12-windows-bridge-startup-log-cleanup.md`

## 사용 skill
- `planning-gate-selector`
  - Next dev launcher / helper script 수정에 맞춰 `node --check`, 좁은 Vitest, ESLint, PowerShell startup smoke 조합으로 검증을 고르는 데 사용했다.
- `work-log-closeout`
  - 실제 변경 파일, 실제 실행 검증, 남은 리스크를 현재 `/work` 형식에 맞춰 정리하는 데 사용했다.

## 변경 이유
- `pnpm dev` 시작 시 Windows localhost bridge가 일부 주소만 bind에 성공해도 PowerShell의 raw `READY ...`, `BIND_FAIL ...`, stack trace가 그대로 노출돼 시작 로그가 지저분했다.
- 현재 `scripts/next_dev_safe.mjs`는 이미 `STATUS READY/FAIL` 형식의 startup 상태를 읽는 구조가 있었고, `scripts/windows_localhost_bridge.ps1`가 그 프로토콜을 완전히 맞추지 못한 상태였다.

## 핵심 변경
- `scripts/windows_localhost_bridge.ps1`는 per-address `READY`/`Write-Error` 대신 `STATUS READY/FAIL started=... warnings=...` 한 줄만 출력하도록 정리했다.
- 같은 PowerShell 스크립트에 `-ExitAfterStartup` 스위치를 추가해 listener를 잠깐 띄운 뒤 status만 내고 종료하는 좁은 smoke 검증 경로를 만들었다.
- IPv6 listener 표기를 `[::1]:<port>` 형태로 포맷해 `next_dev_safe` 경고 문구가 읽기 쉬운 형식으로 유지되게 했다.
- `scripts/next_dev_safe.mjs`는 bridge status 파서/실패 요약 함수를 export하고 direct-run 가드를 넣어 테스트에서 import 가능하게 했다.
- `tests/next-dev-safe-bridge-status.test.ts`를 추가해 `STATUS READY/FAIL` 파싱과 실패 요약 문구를 고정했다.

## 검증
- `pnpm exec vitest run tests/next-dev-safe-bridge-status.test.ts`
  - PASS
- `pnpm exec eslint scripts/next_dev_safe.mjs tests/next-dev-safe-bridge-status.test.ts`
  - PASS
- `node --check scripts/next_dev_safe.mjs`
  - PASS
- `timeout 15s node scripts/next_dev_safe.mjs --webpack --host 0.0.0.0 --port 31991 --strict-port`
  - startup smoke 확인
  - `READY ...`, `BIND_FAIL ...`, PowerShell stack trace 없이 `next_dev_safe` 요약 로그와 Next ready 로그만 출력된 뒤 `timeout`으로 종료했다.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w /home/xpdlqj/code/finance/scripts/windows_localhost_bridge.ps1)" -ListenPort 0 -TargetHost 127.0.0.1 -TargetPort 65535 -ListenAddressesCsv 127.0.0.1 -ExitAfterStartup`
  - PASS
  - 출력: `STATUS READY started=127.0.0.1:0 warnings=-`
- `git diff --check -- scripts/next_dev_safe.mjs scripts/windows_localhost_bridge.ps1 tests/next-dev-safe-bridge-status.test.ts`
  - PASS

## 남은 리스크
- 이미 떠 있는 `pnpm dev` 프로세스는 이전 startup 로그 경로를 계속 쓰므로, 이번 정리를 체감하려면 dev 서버 재시작이 필요하다.
- 현재 워크트리는 이번 라운드 외의 staged/unstaged 변경이 많이 섞여 있고 `scripts/windows_localhost_bridge.ps1`는 아직 untracked 상태라서 후속 커밋 시 포함 여부를 명시적으로 확인해야 한다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
