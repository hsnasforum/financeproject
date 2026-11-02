# Planning v2 Desktop Local Deployment

## 선택 경로
- 선택: **Option C - node 기반 portable 패키징(Windows 우선)**
- 미선택: PWA offline

## 왜 PWA가 아닌가
- Planning/OPS 저장소는 파일시스템(`.data/...`) 기반이며 서버 코드에서 직접 읽고 씁니다.
- Vault 암호화/복호화는 server-only 경계에서 동작합니다.
- `/ops`, `/api/ops`, state-changing `/api/planning`은 local-only 가드 + same-origin/CSRF를 전제로 합니다.
- 따라서 현재 구조에서 브라우저 단독 오프라인(PWA-only)로 기능/보안을 유지하기 어렵습니다.

## 실행 모드 결정
- 현재 end-to-end 지원 배포 모드는 **`desktop-local` 하나뿐**입니다.
- `pnpm start`, `pnpm start:local`, 설치 아티팩트의 `run.*`는 모두 desktop launcher를 거쳐 **`next_prod_safe.mjs` 기반 production runtime**을 사용합니다.
- 기본 실행은 `.next/standalone/server.js`를 우선 사용하고, 없으면 `next start`로 fallback 합니다.
- 바인딩 호스트는 항상 `127.0.0.1`로 강제됩니다.
- 포트는 기본 `3100`이며, 안전한 세션 대상 URL을 고정하기 위해 점유 중이면 자동 변경하지 않고 시작을 중단합니다. 다른 포트가 필요하면 런처에 `--port`를 명시합니다.
- `web-single`, `web-multi`, reverse proxy, 원격 브라우저, shared filesystem, network database는 지원하지 않습니다.

## Local-only 보장
- 런처 기본 바인딩: `127.0.0.1`
- 기존 API 가드: `assertLocalHost`, `assertSameOrigin`, `onlyDev` 유지
- 런처가 process-lifetime desktop session과 loopback session broker를 유지하고, 매번 새로 발급한 one-shot bootstrap으로 `HttpOnly; SameSite=Strict` cookie를 전달합니다.
- broker는 `127.0.0.1`에서만 동작하고 owner-only runtime lock의 별도 issue capability를 요구합니다. 발급이나 검증이 실패하면 인증되지 않은 본문 URL을 열지 않습니다.
- raw 사용자 식별 헤더와 외부 proxy/forwarded header는 거부합니다. Next.js가 direct loopback 요청에 내부 합성하는 정확한 loopback 값만 정규화하며 신뢰 근거로 사용하지 않습니다.
- `next_prod_safe.mjs` 직접 실행은 유효한 launcher writer capability가 없으면 fail closed합니다.
- 원격 노출과 app-level 전체 데이터 암호화를 지원한다고 간주하지 않습니다. OS 계정·디스크 암호화·백업 정책은 별도로 운영합니다.

## 인증과 브라우저 진입

- Desktop Local의 인증은 공식 launcher가 만든 로컬 세션입니다. 정상 실행에는 GitHub/Google provider, `AUTH_TRUST_HOST`, `AUTH_SECRET` 또는 `NEXTAUTH_SECRET` 설정이 필요하지 않습니다. Auth.js용 고정 secret을 추가하거나 production 인증을 끄지 않습니다.
- launcher의 one-shot 진입 URL을 브라우저가 소비해야 `HttpOnly; SameSite=Strict` 쿠키가 설정됩니다. `--no-open` 후 `/planning` 주소만 직접 입력하거나 쿠키가 없는 다른 브라우저를 열면 인증된 상태가 아닙니다. 앱 실행 아이콘/시작 명령을 다시 실행하면 기존 앱의 broker가 새 진입 URL을 발급합니다.
- WSL은 `WSL_INTEROP`, `WSL_DISTRO_NAME` 또는 kernel release의 `microsoft`로 감지하며, `cmd.exe /d /v:off /c start`로 실제 bootstrap URL을 Windows 기본 브라우저에 전달합니다. native Linux는 `xdg-open`, macOS는 `open`, Windows는 `cmd.exe`를 사용합니다. `BROWSER` 환경변수 우회 설정은 필요하지 않습니다.
- Windows opener는 인자 배열을 사용하고 브로커의 `http://127.0.0.1:<port>/bootstrap?nonce=<base64url>` 형식만 허용합니다. `cmd.exe`가 정상 종료할 때까지 기다리므로 기존 인스턴스를 다시 여는 짧은 launcher도 전달 도중 종료하지 않습니다. `browser launch requested`는 opener 요청 완료를 뜻하며, 실제 브라우저 진입·세션 확인을 뜻하지 않습니다. URL/nonce는 로그에 출력하지 않습니다.
- 세션 누락·만료 화면은 **앱 실행 경로로 다시 열어 주세요**를 안내합니다. 외부 OAuth 로그인 버튼을 제공하지 않습니다. 이전 `/api/auth/signin` 주소도 검증된 desktop runtime/loopback 요청에 한해 `/planning`의 로컬 세션 확인으로 돌립니다. 이 이동은 쿠키를 발급하거나 사용자 인증을 통과시키지 않습니다. 다른 `/api/auth/*` handler는 desktop에서 404입니다.
- `PLANNING_SINGLE_USER_MODE=true`만으로 인증하지 않습니다. runtime attestation·단일 writer·로컬 SQLite/root·정확한 loopback host·forwarded/raw identity 제한과 유효한 desktop 쿠키를 모두 확인한 뒤 `default` identity와 기존 `users/default` 저장 구조를 사용합니다.
- 일반 production 웹 경로는 기존 Auth.js/session 및 명시적으로 신뢰한 로컬 header 계약을 유지합니다. `PLANNING_AUTH_REQUIRED=false`, single-user flag 또는 desktop 쿠키만으로 익명 `default` 사용자를 허용하지 않습니다.
- 일반 production E2E의 사전 cookie 주입은 실제 브라우저 bootstrap 검증을 대신하지 않습니다. 격리된 정상 packaged 앱에서 `tests/e2e/planning-desktop-auth.spec.ts`를 실행할 때는 `E2E_EXTERNAL_BASE_URL`과 해당 앱의 `PLANNING_DESKTOP_AUTH_CONTROL_ROOT`를 지정합니다. 검사는 별도의 새 browser context와 broker 진입만 사용하고 E2E cookie/identity header를 주입하지 않습니다.

## Writer 단일 소유권

- Desktop runtime은 Planning data root의 부모인 canonical app control root에 cross-process lease를 획득합니다.
- 공식 mutating package script도 같은 registry와 lease를 사용하므로 앱이 실행 중이거나 다른 writer가 동작 중이면 중복 쓰기를 시작하지 않습니다.
- `news:refresh`, `indicators:refresh`, `daily:refresh`, migration/trim/ops/report/release 계열 쓰기 명령은 앱을 종료한 뒤 `pnpm <script>` 형태로 실행합니다.
- FINLIFE SQLite legacy DB는 `corepack pnpm finlife:identity:migrate`로 읽기 전용 검사하고, 적용은 `corepack pnpm finlife:identity:migrate:apply`를 사용합니다. managed 설치본의 DB·data root·app 이름은 설치본 env를 기준으로 production root에서 lease를 확보합니다.
- installer는 별도의 `desktop.install` maintenance writer로 복사 전부터 준비·원자 교체·rollback·정리가 끝날 때까지 같은 control root를 보호합니다.
- 직접 `node scripts/...`로 wrapper를 우회하는 실행은 지원 경로가 아닙니다.
- stale lease는 같은 host에서 기록된 parent/child PID가 모두 종료된 것이 확인될 때만 자동 회수합니다. foreign host, malformed lease, PID 상태 미확인은 수동 삭제하지 말고 원인부터 확인합니다.

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
  - `.next/standalone/node_modules/prisma/` (설치본 스키마 준비용 자체 포함 CLI)
  - `prisma.config.mjs` (환경 의존성 없는 설치본 전용 datasource config)
  - `scripts/planning_v2_desktop_verify.mjs` (설치·실행 전 OS/CPU/Node ABI 및 manifest 검증)

`desktop-manifest.json`에는 package version, Git SHA, lockfile SHA-256, 대상 OS·CPU·Node ABI, 빌드 시각, artifact checksum이 기록됩니다. `.dist/`는 생성물이며 Git source SSOT에 포함하지 않습니다.
Prisma CLI와 전이 의존성은 검증된 pnpm virtual store에서 링크 없이 실체화되므로,
`--skip-install` 설치본도 원본 워크스페이스의 `node_modules` 없이 스키마 준비와 smoke를 수행합니다.

## 설치
```bash
pnpm planning:v2:desktop:install -- --from=.dist/planning-v2-desktop --to=$HOME/planning-v2-desktop
```

주의:
- `--to`는 프로젝트 워크스페이스 바깥 경로를 권장합니다(예: `$HOME/...`, `/opt/...`).
- 설치 스크립트는 복사 전에 `desktop-manifest.json`의 package version, Git SHA, lockfile SHA-256, 대상 OS·CPU·Node ABI, artifact checksum을 현재 checkout과 비교합니다.
- manifest가 없거나 오래된 checkout/lockfile/아티팩트와 맞지 않으면 설치하지 않습니다. 이 경우 원본 리포지토리에서 아티팩트를 다시 빌드한 뒤 설치합니다.
- 배포 압축을 푼 사용자는 압축 해제 폴더의 `install.sh` 또는 `install.cmd`를 실행합니다. 이 self-contained 경로는 checkout을 요구하지 않고 manifest 전체 checksum을 검증한 뒤 별도 설치 폴더에 복사하며, 압축 해제 원본은 변경하지 않으므로 실패 후 다시 실행할 수 있습니다.
- 설치는 임시 sibling 디렉터리에서 의존성과 SQLite 스키마를 먼저 준비한 뒤 설치 경로를 원자 교체합니다. 준비 또는 교체가 실패하면 기존 설치를 복구합니다.
- 새 빈 DB에만 안전 Prisma `db push`를 사용합니다. 기존 DB는 stage에서 FINLIFE migration preflight·백업·transaction을 거쳐 준비하고, 필수 전체 schema와 식별키·index를 확인한 뒤 교체합니다. 준비된 DB는 다시 쓰거나 백업하지 않습니다.
- migration은 기존 `Product.id`, 즐겨찾기·외부 상품 연결·옵션·사용자 데이터를 유지합니다. 모호한 회사·상품 구분이나 지원하지 않는 schema는 차단하며 기존 설치본을 유지합니다.
- migration 백업과 receipt는 stage 밖의 `<control-root>/backups/finlife-identity/<id>/`에 남으므로 성공한 교체나 실패한 stage 정리 뒤에도 보존됩니다.
- 같은 경로에 업데이트할 때 `.env.local`, `.env`, `env.local`, `prisma/`의 DB·sidecar, `.data/`와 패키지가 소유하지 않는 사용자 파일은 새 설치로 복사해 유지합니다.
- 보존 상태 안의 symlink/junction과 source/target의 실제 경로 겹침은 복사 전에 거부합니다.
- managed installer의 `DATABASE_URL`은 설치 폴더 내부 SQLite 파일만 허용합니다. 설치 폴더 밖 절대 경로나 symlink/junction을 통한 이탈은 기존 DB를 변경하기 전에 거부합니다.
- 기존 설정 DB와 `-wal`·`-shm`·`-journal`이 stage에 동일하게 보존됐는지 초기화·migration 전에 비교합니다. `src/`, `scripts/` 등 교체되는 패키지 소유 경로의 DB가 복사에서 빠지면 신규 DB로 초기화하지 않고 설치를 중단합니다.
- 설치 중 앱이 실행 중이면 종료한 뒤 다시 시도해야 합니다. 실행 중 DB를 복사하거나 스키마를 갱신하는 경로는 지원하지 않습니다.
- control root가 설치 폴더 또는 압축 해제 원본 안에 있으면 lease·migration 백업도 폴더 교체와 함께 이동할 수 있어 복사 전에 중단합니다. 기본 OS app-data 위치는 설치 폴더 밖이며, 내부 root를 사용하는 기존 설치본은 별도 데이터 이동 작업이 먼저 필요합니다.

배포 압축 해제 디렉토리에서 직접 설치:
```bash
cd /path/to/extracted/planning-v2-desktop
./install.sh
```

Windows에서는 압축 해제 디렉토리에서 `install.cmd`를 실행합니다. 기본 설치 위치는
`%USERPROFILE%\planning-v2-desktop`이며 `PLANNING_DESKTOP_INSTALL_DIR`로 별도 위치를
지정할 수 있습니다. `install.sh`와 `install.cmd`는 검증된 압축 해제 원본에만 남고
설치 대상에는 복사하지 않으므로, 업데이트도 새 배포 압축을 별도 폴더에 풀어 실행합니다.

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
- launcher는 앱 루트의 `.env.local`, `env.local`, `.env`를 읽습니다. managed desktop의 `DATABASE_URL`, `PLANNING_DATA_DIR`, `PLANNING_APP_NAME`은 설치본 env 파일을 단일 기준으로 사용하며 호출 shell의 같은 이름 변수는 무시합니다. 그 밖의 환경변수는 기존 process 값을 우선합니다.
- 로컬 서버 시작 (`127.0.0.1` 강제, 기본 포트 `3100`)
- 준비 완료 후 기본 브라우저가 one-shot bootstrap을 거쳐 `/planning`을 엽니다.
- 이미 실행 중인 인스턴스가 있으면:
  - 기존 인스턴스의 loopback broker에서 새 one-shot bootstrap을 받아 브라우저로 열고 새 프로세스는 종료합니다. 새 브라우저 프로필이거나 session cookie를 지운 경우에도 실행 중인 앱을 재시작하지 않고 인증을 복구합니다.
  - 기존 인스턴스가 아직 시작 중이면 owner PID와 broker 정보가 준비될 때까지 제한 시간 동안 기다립니다. lock 또는 broker 검증에 실패하면 본문 URL로 우회하지 않습니다.
- 브라우저 자동 오픈을 끄려면:
  - `node scripts/planning_v2_desktop_launch.mjs --runtime prod --port 3100 --no-open`
  - bootstrap URL은 인증 정보이므로 stdout에 출력하지 않습니다. 브라우저를 열려면 실행 중인 상태에서 launcher를 `--no-open` 없이 한 번 더 실행합니다.
  - 자동화 smoke만 test-only session token과 control root 내부 owner-only 파일을 함께 지정해 bootstrap을 전달하며, 일반 실행에서는 이 경로를 사용하지 않습니다.
- 종료:
  - `Ctrl+C` 또는 SIGTERM 시 서버를 graceful shutdown 한 뒤 종료합니다.

## 데이터 저장 위치(예측 가능 경로)
- 기본: OS 표준 앱 데이터 디렉토리
  - Windows: `%LOCALAPPDATA%\\PlanningV2\\vault\\`
  - macOS/Linux: `${XDG_DATA_HOME:-$HOME/.local/share}/PlanningV2/vault/`
- 필요 시 설치 폴더의 `.env.local`에 `PLANNING_DATA_DIR`을 기록해 데이터 루트를 명시적으로 고정할 수 있습니다.
- UNC/network mount와 filesystem type을 안전하게 local로 판정할 수 없는 경로는 시작하지 않습니다.
- 핵심 파일:
  - SQLite relational DB 기본값: 설치 폴더의 `prisma/dev.db` (`.env.local`의 `DATABASE_URL`로 설치 폴더 내부 경로만 변경 가능)
  - profiles: `profiles/` 및 사용자 partition `users/default/...`
  - runs: `runs/` 및 사용자 partition `users/default/...`
  - assumptions: `assumptions.latest.json`, `assumptions/history/`
  - vault metadata: `security/vault.json`
  - ops metrics/audit: `ops/metrics/events.ndjson`, `ops/audit/events.ndjson`
- writer/session control 파일은 데이터 루트의 부모 `runtime/`에 저장됩니다. session token 원문은 저장하지 않고 writer lease capability는 SHA-256 hash만 기록합니다.
- `runtime/desktop-instance.lock.json`에는 기존 인스턴스 재접속용 broker URL과 별도 issue capability가 들어가므로 owner-only 권한(`0600`)으로 원자 교체합니다. Windows 설치 환경의 실제 ACL은 패키지 현장 점검 대상입니다.

## 업데이트
1. 앱에서 `/ops/about`를 열어 현재 `appVersion`, `dataDir`, `vault` 상태를 확인합니다.
2. 업데이트 전 `/settings/backup`에서 현재 사용자 전체 백업을 1회 생성합니다.
3. 원본 리포지토리에서 새 아티팩트를 생성합니다.
4. 앱을 완전히 종료하고 동일 설치 커맨드를 재실행합니다. 설치기는 기존 DB·설정·로컬 상태를 보존한 stage를 준비한 뒤 원자 교체합니다.
5. 앱 재시작 후 `/ops/doctor`에서 상태를 확인합니다.

비차단 리마인더:
- `/planning`과 `/ops/about`에 `업데이트 전 백업 권장` 배너가 표시됩니다.

## 백업/복구
- 백업(export):
  - `/settings/backup`에서 암호를 지정하고 전체 백업 실행
  - 실제 파일 저장을 확인한 뒤 `파일 저장을 확인했습니다`를 눌러 변경분 백업 기준 시점을 확정
  - 또는 데이터 루트(`%LOCALAPPDATA%\\PlanningV2` 등)를 주기적으로 보관
- 복구(restore):
  - `/settings/backup`에서 같은 파일과 암호로 미리보기 후 복원(기존 기록 유지/교체)
- 권장:
  - 업데이트 전 1회 export
  - 복원 결과의 경고·오류를 확인하고 앱 재시작 후 주요 기록을 다시 확인

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
- 앱을 완전히 종료해야 제거를 시작합니다. 설치본이 가리키는 실제 control root의 live instance lock이 있으면 바로가기나 파일을 변경하기 전에 중단합니다.
- 제거기는 `desktop-manifest.json`, package version, lockfile hash, 필수 제거 모듈을 먼저 확인합니다. 설치 identity가 없거나 `--target` 값이 비었거나 옵션 이름이 잘못되면 바로가기와 파일을 변경하지 않고 실패합니다.
- 언인스톨은 Windows Known Folder API로 실제 Desktop·Start Menu 바로가기를 확인한 뒤 설치 폴더의 패키지 소유 바이너리를 제거합니다. 바로가기 삭제가 권한이나 잠금 문제로 실패하면 바이너리를 남긴 채 실패합니다.
- 설치 폴더 안의 `.env.local`, SQLite DB·sidecar, `.data/`와 기타 사용자 소유 파일은 남길 수 있으므로, 제거 결과에 표시된 보존 항목을 백업 후 직접 정리합니다.
- 사용자 데이터(`%LOCALAPPDATA%\\PlanningV2\\vault` 등)는 **기본 유지**됩니다.
- 데이터 완전 삭제는 자동 수행하지 않습니다.
- 데이터 wipe가 필요하면 앱에서 `/ops/security`의 reset(명시적 확인 입력)을 사용하세요.

설치 폴더를 통째로 수동 삭제하면 보존 대상 DB·설정도 함께 사라질 수 있으므로 지원 제거 명령을 사용합니다.

## 스모크 테스트
요구 시나리오: `앱 시작 -> desktop session -> /planning profile/run -> report/export`

```bash
pnpm planning:v2:prod:smoke -- --app-dir=$HOME/planning-v2-desktop --port=3210
```

- 이 스모크는 production에서 실제 공개되는 `/public/dart`, 정적 asset, remote probe 차단과 함께 `/settings/data-sources`의 read-only `운영 최신 기준` 렌더도 확인합니다.
- `planning:v2:desktop:smoke`는 최초 bootstrap과 실행 중인 인스턴스의 재발급 bootstrap을 서로 다른 cookie jar로 소비하고, 보호 API 인증 복구·broker 변조 시 fail-closed·프로필 생성·run·report/export까지 검증합니다.

Vault unlock + run/export까지 포함한 기존 시나리오는:
```bash
PLANNING_VAULT_PASSPHRASE='your-passphrase' pnpm planning:v2:desktop:smoke -- --app-dir=$HOME/planning-v2-desktop
```

`/api/ops/doctor` API는 production에서 404로 숨겨지는 경계를 항상 검증합니다.
