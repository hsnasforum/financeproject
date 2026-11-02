# 2026-10-07 Finance WSL Windows 브라우저 전달 수정

## 변경 파일

- `scripts/planning_desktop_browser.mjs` (신규)
- `scripts/planning_v2_desktop_launch.mjs`
- `tests/planning/deployment/planningDesktopBrowser.test.ts` (신규)
- `docs/planning-v2-desktop-local.md`
- `FINANCE_ACTIVE_GOAL.md`
- 이 기록

## 사용 skill

- `finance-skill-routing`: 이번 launcher 범위에 맞는 skill 선택.
- `planning-gate-selector`: 빠른 계약 검사·실기·패키지 검증과 기존 검증 재사용 범위 결정.
- `computer-use:computer-use`, `playwright`: 브라우저 검증 지침 확인. 실제 Windows Chrome 조작은 CUA extension으로 수행했다.
- `work-log-closeout`: 이 마일스톤의 변경·검증·잔여 범위 기록.

## 변경 이유

WSL의 Node platform은 Linux이므로 기존 launcher가 `xdg-open`을 선택했다. Windows 기본 브라우저에 실제 bootstrap이 전달되지 않아 일반 `/planning` 방문은 세션 복구 안내에 머물렀다. 기존 인증 정책의 결함으로 다시 해석하지 않고 브라우저 전달 경계만 수정했다.

## 핵심 변경

- `next_dev_safe.mjs`와 같은 WSL 환경변수/kernel 신호를 사용하며, WSL과 Windows는 `cmd.exe /d /v:off /c start`를 선택한다. native Linux `xdg-open`, macOS `open`은 유지했다.
- 인자 배열과 `shell:false`를 사용한다. cmd가 명령으로 해석할 수 있으므로 loopback broker URL, 유효 포트, 43자 base64url nonce 외 입력을 거부한다. URL/nonce와 원본 spawn 오류는 출력하지 않는다.
- 실기 중 spawn 후 즉시 종료하는 secondary launcher에서 Windows Chrome이 열리지 않는 것을 확인했다. cmd `close(0)`까지 기다리도록 수정한 뒤 최초·재호출 모두 실제 bootstrap 요청을 확인했다. native Linux는 기존 detached spawn 동작을 유지했다.
- `browser opened`를 `browser launch requested`로 바꿨다. opener 성공과 브라우저의 실제 세션 소비를 구분한다.
- 기존 auth, one-shot broker/session, `default` identity, 일반 production 강제 인증, 제품 계산·목표 저장 코드는 변경하지 않았다.
- 기존 설치와 별도로 `/home/xpdlqj/finance-recovery/desktop-wsl-browser-20261007/installed`를 공식 installer로 만들었다. 3393 포트·독립 DB/data root를 사용하며 기존 3391 실행본을 종료하거나 덮어쓰지 않았다.

## 검증

- 환경: PowerShell → WSL Ubuntu, Linux Git, Node 22.23.2, Corepack pnpm 9.15.9. 기존 engines 22.22.2 경고는 그대로다. branch `main`, HEAD `6a51f8d3a24394ba239838a78c8c19aa590fc180`와 시작 시 dirty 변경을 보존했다.
- **코드상 조건 존재:** WSL 세 신호, native Linux/Windows/macOS 선택, URL/셸 경계, spawn 오류/Windows 종료 결과 처리. 독립 Sol 검토에서 추가 구체적 결함을 찾지 못했다.
- **테스트 PASS:** `corepack pnpm exec vitest run tests/planning/deployment/planningDesktopBrowser.test.ts tests/planning/deployment/planningDesktopSessionServer.test.ts tests/planning/deployment/planningDesktopEnvironment.test.ts --maxWorkers=2` → 3 files / 36 tests. opener 22, broker 9, env 5. 최초 34개 결과를 확대해 최종 36개를 다시 실행했다.
- `node --check scripts/planning_desktop_browser.mjs`, `node --check scripts/planning_v2_desktop_launch.mjs`, scoped `corepack pnpm exec eslint <변경 MJS/TS 3파일>` PASS.
- **빌드 재사용:** 기존 desktop-auth candidate와 Next build 입력 1,656개 해시 일치. 이번 수정은 번들 외 launcher scripts이므로 기존 최종 `.next`를 재사용하고 공식 package를 다시 생성했다. 이전 auth 177개·user scope 94개·security 40개와 목표 보존 결과는 관련 소스 무변경 범위에서 재사용했으며 이번 새 실행 수로 합산하지 않는다.
- `corepack pnpm planning:v2:desktop:build -- --no-next-build --artifact-dir=/home/xpdlqj/finance-recovery/desktop-wsl-browser-20261007/artifact-final` PASS. 격리 candidate에서 원본 Git을 읽기 전용으로 참조했다.
- `node scripts/planning_v2_desktop_verify.mjs --mode=pristine-install`, `node scripts/planning_v2_desktop_install.mjs --self-contained-source --from=<artifact-final> --to=<새 installed> --skip-install --skip-shortcuts`, runtime manifest 검증 PASS (40,935 files). 새 설치 DB만 공식 installer에서 준비했다.
- **standalone runtime 기동:** PowerShell에서 `wsl -d Ubuntu -- bash /home/xpdlqj/finance-recovery/desktop-wsl-browser-20261007/start-review.sh` 실행. production, `.next/standalone/server.js`, loopback 3393 Ready 확인. OAuth·Auth.js secret·E2E cookie/header 설정을 추가하지 않았다.
- **Windows 브라우저 실제 진입 성공:** Windows 기본 HTTP 연결은 Chrome. 사전 쿠키가 없는 `/planning`은 세션 복구 안내였고, 실제 launcher가 연 Chrome 탭은 bootstrap 303 → `/dashboard` 200 → 메뉴 클릭 `/planning`으로 진입했다. 재호출 launcher도 새 bootstrap을 소비하고 새 Chrome 탭을 열었다.
- **실제 쿠키 확인:** 설치 파일 밖의 임시 read-only Node HTTP observer로 요청을 변경하지 않고 `planning.desktop-session` 존재 여부만 기록했다. 최초 bootstrap 요청에는 쿠키 없음, 이후 Windows Chrome `/planning` 및 `/api/planning/v2/profiles` 요청에는 쿠키 있음·200. nonce/쿠키 값은 기록하지 않았다. 원시 observer의 response `getHeader` 필드는 `writeHead` 직접 헤더를 관찰하지 못하므로 쿠키 속성 실기 증거로 사용하지 않는다. 이번 실기 쿠키 근거는 실제 수신 요청의 존재 여부이며 HttpOnly/Strict 계약은 기존 테스트/소스 근거다.
- 진단 observer를 뺀 위의 일반 명령으로 다시 실행해 Chrome 대시보드와 재무 진단을 재확인했다. 최종 주소는 `http://127.0.0.1:3393/planning`이다.
- `corepack pnpm planning:v2:desktop:smoke -- --app-dir=<새 installed> --port=3394` PASS. 별도 임시 DB/root에서 bootstrap 재발급, 보호 API, profile/run/report/export와 production-hidden 경계를 확인했다.
- 실기 runtime와 smoke 로그에서 `UntrustedHost=0`, `MissingSecret=0`. 근거·사진은 새 검토본 `evidence/`의 `windows-browser-verification.json`, `windows-chrome-planning.png`, `runtime-windows-final.log`, `desktop-smoke.log`에 있다.
- 시작 4,483개 source 파일 비교와 보호 파일 8개(DB/env/기존 설치 manifest) hash, HEAD/index, scoped diff/scope를 최종 확인했다. 이번 6파일 외 예상 밖 변경이 없었다. commit/push/deploy는 하지 않았다.

## 남은 리스크

- Windows **네이티브 Node 패키지 전체 실행**과 native Linux 실제 기본 브라우저 구동은 이번 실기 범위 밖이다. opener 분기 회귀는 unit test로 확인했다. 실제 검증은 Windows PowerShell → WSL standalone → Windows Chrome이다.
- 일반 production 인증/목표 저장 제품 코드의 기존 검증을 재사용했다. 전체 Next build·전체 테스트·live 외부 API·정식 release는 이번에 다시 실행하지 않았다.
- 초기 계측 실행 종료 때 descendant 종료 확인 경고가 한 번 있었으나 이후 해당 PID와 3393 listener가 모두 없음을 확인한 뒤 재설치했다. 최종 실기 종료와 smoke 종료에서는 같은 경고가 없었다. 기존 사용자 프로세스에는 종료 신호를 보내지 않았다.

## 다음 라운드

- 사용자는 새 `start-review.sh`를 PowerShell에서 실행하고 자동으로 열린 대시보드 → 재무진단 순서로 확인한다. 주소만 직접 입력하는 것은 bootstrap 세션 발급을 대신하지 않는다. 이번 요청의 필수 검증은 완료했으며 정식 배포/기존 설치 교체는 별도 범위다.
