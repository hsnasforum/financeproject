# 2026-03-12 Windows localhost bridge 단순화 배치 분해

## 변경 파일
- 코드/문서 수정 없음
- `work/3/12/2026-03-12-windows-localhost-bridge-simplification-plan.md`

## 사용 skill
- `planning-gate-selector`: `next_dev_safe`/PowerShell bridge/dev launcher 문서 배치에서 가장 작은 검증 세트를 고르는 기준으로 사용했다.
- `work-log-closeout`: 이번 라운드의 계획, 영향 파일, 미실행 검증 제안을 `/work` 형식으로 정리하는 기준으로 사용했다.

## 변경 이유
- 사용자는 Windows 브라우저의 `http://localhost:3100` 접속 경로를 단순화하는 배치를 검토 중이며, 제안은 `0.0.0.0 + Windows 127.0.0.1 bridge`만 유지하고 WSL `::1` 보정과 Windows `::1` listen 시도를 제거하는 것이다.
- 최신 closeout인 `work/3/12/2026-03-12-release-gate-e2e-isolation-closeout.md`의 다음 우선순위에도 `next_dev_safe`의 Windows localhost bridge `BIND_FAIL ::1:*` 로그 정리가 남아 있었다.
- 같은 날짜 폴더의 `work/3/12/2026-03-12-windows-bridge-startup-log-cleanup.md`를 추가로 확인한 결과, bridge status protocol과 startup smoke는 이미 정리된 상태라 이번 배치는 그 위에서 경로 단순화만 별도 batch로 자르는 편이 맞다.

## 핵심 변경
- 영향 핵심 파일은 `scripts/next_dev_safe.mjs`, `scripts/windows_localhost_bridge.ps1`, `tests/next-dev-safe-bridge-status.test.ts`, `README.md`, `docs/windows.md`, `docs/planning-v2-setup-playbook.md`로 정리했다.
- 사용자 경로는 `Windows browser localhost -> PowerShell localhost bridge -> WSL 0.0.0.0 dev runtime` 하나로 단순화되고, WSL 내부 `[::1]` alias 경로는 의도적으로 제외될 가능성이 높다.
- 배치 분해는 `범위 잠금 -> 메인 스크립트 단순화 -> 문서/테스트 계약 정리 -> 좁은 smoke 검증 -> closeout` 순서가 가장 안전하다고 판단했다.
- 가장 작은 기본 검증 세트는 `node --check scripts/next_dev_safe.mjs`, `pnpm exec vitest run tests/next-dev-safe-bridge-status.test.ts`, `powershell.exe ... windows_localhost_bridge.ps1 ... -ListenAddressesCsv 127.0.0.1 -ExitAfterStartup`, `timeout 15s node scripts/next_dev_safe.mjs --webpack --host 0.0.0.0 --port <port> --strict-port`로 제안했다.
- `pnpm build`나 `pnpm e2e:rc`는 기본 포함 대상이 아니며, launcher 변경이 shared runtime hygiene나 Playwright webServer 계약까지 건드릴 때만 넓히는 편이 맞다고 기록했다.

## 검증
- `sed -n '1,240p' work/3/12/2026-03-12-release-gate-e2e-isolation-closeout.md`
  - PASS
- `sed -n '1,260p' scripts/next_dev_safe.mjs`
  - PASS
- `rg -n "localhost bridge|127\.0\.0\.1|::1|windows_localhost_bridge|BIND_FAIL|WSL|IPv6|0\.0\.0\.0" -S scripts docs README.md tests`
  - PASS
- `sed -n '1,240p' .codex/skills/planning-gate-selector/SKILL.md`
  - PASS
- `sed -n '340,440p' scripts/next_dev_safe.mjs`
  - PASS
- `sed -n '1,220p' tests/next-dev-safe-bridge-status.test.ts`
  - PASS
- `sed -n '1,240p' scripts/windows_localhost_bridge.ps1`
  - PASS
- `node -e "const p=require('./package.json'); for (const k of ['dev','lint','test','build']) console.log(k+': '+(p.scripts[k]||'[missing]'));"`
  - PASS
- `sed -n '56,84p' README.md`
  - PASS
- `sed -n '13,40p' docs/windows.md`
  - PASS
- `sed -n '12,28p' docs/planning-v2-desktop-local.md`
  - PASS
- `sed -n '60,74p' docs/planning-v2-setup-playbook.md`
  - PASS
- `sed -n '1,240p' work/3/12/2026-03-12-windows-bridge-startup-log-cleanup.md`
  - PASS
- `git status --short scripts/next_dev_safe.mjs scripts/windows_localhost_bridge.ps1 tests/next-dev-safe-bridge-status.test.ts README.md docs/windows.md docs/planning-v2-setup-playbook.md work/3/12/2026-03-12-windows-bridge-startup-log-cleanup.md work/3/12/2026-03-12-release-gate-e2e-isolation-closeout.md`
  - PASS

## 미실행 검증
- `node --check scripts/next_dev_safe.mjs`
  - 미실행. 이번 라운드는 분해/영향 분석만 수행했다.
- `pnpm exec vitest run tests/next-dev-safe-bridge-status.test.ts`
  - 미실행. 동일.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w /home/xpdlqj/code/finance/scripts/windows_localhost_bridge.ps1)" -ListenPort 0 -TargetHost 127.0.0.1 -TargetPort 65535 -ListenAddressesCsv 127.0.0.1 -ExitAfterStartup`
  - 미실행. 동일.
- `timeout 15s node scripts/next_dev_safe.mjs --webpack --host 0.0.0.0 --port 31991 --strict-port`
  - 미실행. 동일.
- Windows 브라우저 `http://localhost:3100` 수동 smoke
  - 미실행. 메인 에이전트 single-owner 수동 확인이 필요하다.

## 남은 리스크
- WSL 내부 `http://[::1]:3100` 경로는 의도적으로 제거 대상이지만, 일부 WSL 환경에서 `localhost`가 `::1`를 우선 해석하면 same-env 접속성도 같이 흔들릴 수 있다.
- `README.md`, `docs/windows.md`, `docs/planning-v2-setup-playbook.md`는 현재 `::1`/dual-stack을 직접 약속하고 있어, 코드만 바꾸면 문서 드리프트가 바로 생긴다.
- `::1` 제거를 app-wide local-only/security allowlist 축으로 확장하면 범위가 과도하게 커진다. 이 배치는 launcher/bridge/log contract까지만 잠그는 편이 안전하다.
- 이미 떠 있는 `pnpm dev` 프로세스는 기존 bridge/log 경로를 계속 쓸 수 있으므로, 변경 체감과 로그 확인에는 dev 서버 재시작이 필요하다.

## 이번 라운드 완료 항목
1. Windows localhost bridge 단순화 배치의 핵심 영향 파일과 사용자 경로 정리
2. 기존 release closeout과 bridge startup cleanup closeout를 함께 읽어 중복 범위 제거
3. 메인 단독 작업과 병렬 가능한 조사/검증 작업 분리
4. 가장 작은 검증 세트 초안 고정

## 다음 라운드 우선순위
1. 메인 에이전트가 `scripts/next_dev_safe.mjs`와 `scripts/windows_localhost_bridge.ps1`의 실제 단순화 경로를 로컬에서 확정
2. 병렬로 문서/테스트 계약에서 `[::1]` 약속 잔존 여부를 좁게 정리
3. 메인 에이전트가 좁은 startup smoke와 Windows 브라우저 `localhost:3100` 수동 smoke로 최종 확인
