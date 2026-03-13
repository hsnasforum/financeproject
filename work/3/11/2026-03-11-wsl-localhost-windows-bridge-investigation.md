# 2026-03-11 WSL localhost Windows bridge investigation

## 수정 대상 파일
- `scripts/next_dev_safe.mjs`
- `scripts/windows_localhost_bridge.ps1`
- `README.md`

## 변경 이유
- 사용자 기준으로는 WSL 안 `localhost` 확인과 별개로, Windows 브라우저 `http://localhost:3100`이 계속 `ERR_CONNECTION_REFUSED`였습니다.
- 실제 확인 결과 Windows에서 `http://localhost:3100`, `http://127.0.0.1:3100`은 실패했고 `http://172.20.128.246:3100`만 성공했습니다.
- `.wslconfig`에는 `localhostForwarding=true`가 있었지만, Windows 쪽 auto forwarding이 현재 포트 3100에는 적용되지 않았습니다.

## 이번 변경
1. `next_dev_safe.mjs`는 WSL에서 `0.0.0.0` 바인드를 유지하면서, 기존 WSL `::1 -> 127.0.0.1` bridge를 계속 엽니다.
2. 같은 조건에서 Windows user-space TCP bridge를 `127.0.0.1`과 `::1`에 띄워, Windows `localhost`를 WSL IPv4(`172.20.128.246` 같은 주소)로 전달합니다.
3. bridge는 `pnpm dev` 종료 시 같이 정리되도록 cleanup을 추가했습니다.
4. README에는 WSL의 localhost 보정 동작을 실제 구현 기준으로 갱신했습니다.

## 재현 / 검증
- 수동 재현:
  - `pnpm dev --port 3100 --strict-port`
  - WSL: `curl -I http://localhost:3100`
  - WSL: `curl -I -g http://[::1]:3100`
  - Windows PowerShell: `Invoke-WebRequest http://localhost:3100 -UseBasicParsing`
  - Windows cmd: `curl.exe --max-time 5 -sS -o NUL -w "%{http_code}" http://localhost:3100/`
- 실제 확인 결과:
  - WSL `localhost`, `[::1]` -> `200`
  - Windows `localhost`, `127.0.0.1` -> `200`
  - Windows `Get-NetTCPConnection -LocalPort 3100` 에서 `127.0.0.1:3100`, `::1:3100` listener 확인
  - 종료 후 `Get-NetTCPConnection -LocalPort 3100` 비어 있음 확인
- 코드/플로우 검증:
  - `pnpm exec eslint scripts/next_dev_safe.mjs`
  - `pnpm e2e:pw tests/e2e/flow-history-to-report.spec.ts --workers=1`
  - `pnpm e2e:parallel:classify -- --runs=1 --mode=development --skip-build --dev-port-base=3206`

## 남은 리스크와 엣지케이스
- dev 병렬 로그에는 여전히 `/public/dart 500`, `/planning/reports 500`, `__webpack_modules__[moduleId] is not a function`, `Fast Refresh had to perform a full reload` 흔적이 남습니다.
- 이번 라운드 기준으로는 `flow-history-to-report`와 `classify --runs=1`이 PASS라서, Windows localhost 문제와 직접 연결된 실패는 닫혔습니다.
- Windows localhost bridge는 user-space process라서, `pnpm dev` 바깥의 임의 포트를 영구적으로 열어주지는 않습니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
