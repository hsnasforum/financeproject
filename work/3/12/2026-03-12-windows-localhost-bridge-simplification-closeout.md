# 2026-03-12 windows localhost bridge simplification closeout

## 변경 파일
- `scripts/next_dev_safe.mjs`
- `scripts/windows_localhost_bridge.ps1`
- `tests/next-dev-safe-bridge-status.test.ts`
- `README.md`
- `docs/windows.md`
- `docs/planning-v2-setup-playbook.md`

## 사용 skill
- `planning-gate-selector`: Next dev launcher/bridge 변경에 맞는 최소 검증 세트를 고르는 데 사용.
- `work-log-closeout`: 이번 라운드 변경/검증/남은 리스크를 `/work` 형식에 맞게 정리하는 데 사용.

## 변경 이유
- 내부 분해 결과, 이번 배치는 app-wide local-only 정책 변경이 아니라 WSL에서 `pnpm dev`를 띄웠을 때 Windows 브라우저 `http://localhost:3100` 경로를 더 단순하게 만드는 launcher batch로 잠그는 편이 맞았다.
- 기존 `next_dev_safe`는 WSL `::1` alias와 Windows `127.0.0.1, ::1` bridge 시도를 함께 들고 있어 startup 로그와 운영 문서가 필요 이상으로 복잡했다.
- 사용자 제안대로 기본 경로를 `0.0.0.0` bind + Windows `127.0.0.1` localhost bridge만 남기는 쪽으로 정리했다.

## 핵심 변경
- `scripts/next_dev_safe.mjs`에서 WSL `::1` alias server 생성과 해당 startup 로그를 제거했다.
- 같은 스크립트에서 Windows localhost bridge 호출 시 listen 주소를 `127.0.0.1` 단일 값으로 고정했다.
- `scripts/windows_localhost_bridge.ps1`의 기본/fallback listen 주소도 `127.0.0.1`만 쓰도록 맞췄다.
- `tests/next-dev-safe-bridge-status.test.ts`의 `STATUS READY/FAIL` 기대값을 `127.0.0.1:<port>` 단일 listener 기준으로 갱신했다.
- `README.md`, `docs/windows.md`, `docs/planning-v2-setup-playbook.md`에서 WSL `::1`/`[::1]` 우선 경로 설명을 제거하고 Windows 브라우저 `localhost` 기본 경로만 남겼다.

## 검증
- `pnpm exec eslint scripts/next_dev_safe.mjs tests/next-dev-safe-bridge-status.test.ts`
- `node --check scripts/next_dev_safe.mjs`
- `pnpm exec vitest run tests/next-dev-safe-bridge-status.test.ts`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w /home/xpdlqj/code/finance/scripts/windows_localhost_bridge.ps1)" -ListenPort 0 -TargetHost 127.0.0.1 -TargetPort 65535 -ListenAddressesCsv 127.0.0.1 -ExitAfterStartup`
- `git diff --check -- scripts/next_dev_safe.mjs scripts/windows_localhost_bridge.ps1 tests/next-dev-safe-bridge-status.test.ts README.md docs/windows.md docs/planning-v2-setup-playbook.md`
- `PLAYWRIGHT_DIST_DIR=.next-host-31991 PLAYWRIGHT_TSCONFIG_PATH=tsconfig.playwright.json timeout 15s node scripts/next_dev_safe.mjs --webpack --host 0.0.0.0 --port 31991 --strict-port`
  - startup 로그에서 `Open (same env): http://localhost:31991`와 Windows localhost bridge 로그만 확인했고 `[::1]`/`WSL localhost bridge` 문구는 나오지 않았다.
- `PLAYWRIGHT_DIST_DIR=.next-host-31993 PLAYWRIGHT_TSCONFIG_PATH=tsconfig.playwright.json timeout 25s node scripts/next_dev_safe.mjs --webpack --host 0.0.0.0 --port 31993 --strict-port`
  - isolated distDir로 `✓ Ready`까지 확인했다.
- `timeout 10s cmd.exe /c curl.exe -I http://localhost:31993/`
  - Windows 쪽 `localhost` HEAD 요청이 `HTTP/1.1 200 OK`로 응답했고, WSL 서버 로그에도 `HEAD / 200`이 남았다.

## 남은 리스크
- blocker 없음.
- `[미실행 검증]` 실제 Windows GUI 브라우저 수동 확인은 하지 않았다. 대신 Windows `curl.exe`로 `http://localhost:31993/` HEAD 200을 확인했다.
- explicit `--host ::` 같은 수동 IPv6 bind 경로는 이번 batch 범위가 아니어서 그대로 남아 있다. 기본 WSL `pnpm dev` 경로는 더 이상 `::1` bridge나 Windows `::1` listen을 사용하지 않는다.
- 이미 떠 있는 기존 `pnpm dev` 프로세스는 재시작 전까지 이전 startup 로그/bridge 경로를 계속 사용한다.

## 다음 라운드 우선순위
- active dev runtime이 켜진 상태에서 `pnpm build` trace copy warning이 언제 재현되는지 별도 batch로 정리
- `next_dev_safe`의 explicit IPv6 bind(`--host ::`)를 계속 지원할지, 아예 문서/로그에서도 더 강하게 숨길지 결정
- 필요하면 `e2e:rc` 같은 장기 dev gate도 isolated distDir launcher로 통일할 실익 검토
