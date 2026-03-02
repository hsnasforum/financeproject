# Planning v2 Local Desktop Deployment (MVP)

## 선택 경로
- 선택: **Option C - node 기반 portable 패키징(Windows 우선)**
- 미선택: PWA offline

## 왜 PWA가 아닌가
- Planning/OPS 저장소는 파일시스템(`.data/...`) 기반이며 서버 코드에서 직접 읽고 씁니다.
- Vault 암호화/복호화는 server-only 경계에서 동작합니다.
- `/ops`, `/api/ops`, state-changing `/api/planning`은 local-only 가드 + same-origin/CSRF를 전제로 합니다.
- 따라서 현재 구조에서 브라우저 단독 오프라인(PWA-only)로 기능/보안을 유지하기 어렵습니다.

## 실행 모드 결정
- 데스크톱 런타임은 **`next_prod_safe.mjs` 기반 production runtime**을 사용합니다.
- 기본 실행은 `.next/standalone/server.js`를 우선 사용하고, 없으면 `next start`로 fallback 합니다.
- 바인딩 호스트는 항상 `127.0.0.1`로 강제됩니다.
- 포트는 기본 `3100`이며, 점유 중이면 자동 fallback(스캔 후 random) 됩니다.

## Local-only 보장
- 런처 기본 바인딩: `127.0.0.1`
- 기존 API 가드: `assertLocalHost`, `assertSameOrigin`, `onlyDev` 유지
- 원격 노출 기본값 없음

## 빌드 (아티팩트 생성)
```bash
pnpm planning:v2:desktop:build
```

옵션:
- 프로덕션 빌드 없이 아티팩트만 갱신하려면
```bash
pnpm planning:v2:desktop:build -- --no-next-build
```

생성물:
- `.dist/planning-v2-desktop/`
  - `desktop-manifest.json`
  - `install.sh` / `install.cmd`
  - `run.sh` / `run.cmd`
  - `uninstall.sh` / `uninstall.cmd`
  - `scripts/planning_v2_desktop_launch.mjs` (서버 시작 + 브라우저 자동 오픈)

## 설치
```bash
pnpm planning:v2:desktop:install -- --from=.dist/planning-v2-desktop --to=$HOME/planning-v2-desktop
```

주의:
- `--to`는 프로젝트 워크스페이스 바깥 경로를 권장합니다(예: `$HOME/...`, `/opt/...`).

설치 후 디렉토리에서 수동 설치도 가능:
```bash
cd $HOME/planning-v2-desktop
./install.sh
```

Windows 설치 시:
- Desktop + Start Menu에 `Planning v2` 바로가기를 생성합니다.

## 실행
```bash
cd $HOME/planning-v2-desktop
./run.sh
```

Windows:
```bat
cd %USERPROFILE%\planning-v2-desktop
run.cmd
```

동작:
- 로컬 서버 시작 (`127.0.0.1` 강제, 기본 포트 `3100`)
- 준비 완료 후 기본 브라우저에서 `/planning` 자동 오픈
- 이미 실행 중인 인스턴스가 있으면:
  - 기존 인스턴스 URL을 브라우저로 열고 새 프로세스는 즉시 종료
- 브라우저 자동 오픈을 끄려면:
  - `node scripts/planning_v2_desktop_launch.mjs --runtime prod --port 3100 --no-open`
- 종료:
  - `Ctrl+C` 또는 SIGTERM 시 서버를 graceful shutdown 한 뒤 종료합니다.

## 데이터 저장 위치(예측 가능 경로)
- 기본: OS 표준 앱 데이터 디렉토리
  - Windows: `%LOCALAPPDATA%\\PlanningV2\\`
  - macOS: `$HOME/Library/Application Support/PlanningV2/`
  - Linux: `${XDG_DATA_HOME:-$HOME/.local/share}/PlanningV2/`
- 필요 시 `PLANNING_DATA_DIR`로 데이터 루트를 명시적으로 고정할 수 있습니다.
- 핵심 파일:
  - profiles: `planning/profiles/` (및 partition `planning/vault/profiles/`)
  - runs: `planning/runs/`
  - assumptions: `planning/assumptions.latest.json`, `planning/assumptions/history/`
  - vault: `planning/security/vault.json`
  - ops metrics/audit: `ops/metrics/events.ndjson`, `ops/audit/events.ndjson`

## 업데이트
1. 앱에서 `/ops/about`를 열어 현재 `appVersion`, `dataDir`, `vault` 상태를 확인합니다.
2. 업데이트 전 `/ops/backup`에서 export 백업을 1회 생성합니다.
3. 원본 리포지토리에서 새 아티팩트를 생성합니다.
4. 동일 설치 커맨드를 재실행해 설치 경로를 교체합니다.
5. 앱 재시작 후 `/ops/doctor`에서 상태를 확인합니다.

비차단 리마인더:
- `/planning`과 `/ops/about`에 `업데이트 전 백업 권장` 배너가 표시됩니다.

## 백업/복구
- 백업(export):
  - `/ops/backup`에서 export 실행
  - 또는 데이터 루트(`%LOCALAPPDATA%\\PlanningV2` 등)를 주기적으로 보관
- 복구(restore):
  - `/ops/backup`에서 preview 후 restore(merge/replace)
- 권장:
  - 업데이트 전 1회 export
  - restore 후 `/ops/doctor` 확인

## 제거(언인스톨)
기본(바이너리만 제거, 데이터 유지):
```bash
pnpm planning:v2:desktop:uninstall -- --target=$HOME/planning-v2-desktop
```

Windows:
```bat
pnpm planning:v2:desktop:uninstall -- --target=%USERPROFILE%\planning-v2-desktop
```

정책:
- 언인스톨은 설치 폴더(바이너리)와 바로가기를 제거합니다.
- 사용자 데이터(`%LOCALAPPDATA%\\PlanningV2`)는 **기본 유지**됩니다.
- 데이터 완전 삭제는 자동 수행하지 않습니다.
- 데이터 wipe가 필요하면 앱에서 `/ops/security`의 reset(명시적 확인 입력)을 사용하세요.

수동 제거(선택):
```bash
rm -rf $HOME/planning-v2-desktop
```

## 스모크 테스트
요구 시나리오: `앱 시작 -> /ops/doctor -> vault unlock(필요 시) -> /planning run -> report/export`

```bash
pnpm planning:v2:prod:smoke -- --app-dir=$HOME/planning-v2-desktop --port=3210
```

Vault unlock + run/export까지 포함한 기존 시나리오는:
```bash
PLANNING_VAULT_PASSPHRASE='your-passphrase' pnpm planning:v2:desktop:smoke -- --app-dir=$HOME/planning-v2-desktop
```

선택:
- `/api/ops/doctor` API까지 검증하려면 `DEV_ACTION_TOKEN` 환경변수를 함께 설정합니다.
