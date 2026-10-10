# Runtime (Desktop Local Production)

## Run

```bash
pnpm build
pnpm start
```

`pnpm start`와 `pnpm start:local`은 같은 desktop launcher를 사용합니다. 개발은
`pnpm dev`를 사용합니다. Production runtime은 `127.0.0.1`에만 bind하며
`0.0.0.0`, reverse proxy, 원격 브라우저를 지원하지 않습니다.

기본 포트는 `3100`입니다. Launcher session의 대상 URL을 고정하기 위해 포트가
점유되어 있으면 자동 fallback하지 않고 실패합니다. 다른 포트는 다음처럼
명시합니다.

```bash
node scripts/planning_v2_desktop_launch.mjs --runtime prod --port 3101
```

준비되면 launcher는 one-shot bootstrap을 통해 `planning.desktop-session`
`HttpOnly; SameSite=Strict` cookie를 설정하고 `/planning`을 엽니다. `--no-open`을
사용하면 bootstrap URL을 출력하지 않고 서버만 시작합니다. 브라우저를 열거나 cookie를
복구하려면 실행 중인 상태에서 launcher를 `--no-open` 없이 한 번 더 실행합니다.

이미 같은 data root의 instance가 실행 중이면 새 server를 만들지 않고 기존 URL을
엽니다. 현재 browser에 session cookie가 없어도 기존 instance의 owner-only broker가
새 one-shot bootstrap을 발급하므로 기존 server를 종료할 필요가 없습니다.

Standalone build를 사용할 때 launcher는 다음 runtime asset과 Prisma/SQLite native
dependency link를 확인한 뒤 서버를 시작합니다.

- `.next/static`
- `public`
- `prisma`

Launcher는 시작할 때 앱 루트의 `.env.local`, `env.local`, `.env`를 순서대로 읽습니다.
`DATABASE_URL`, `PLANNING_DATA_DIR`, `PLANNING_APP_NAME`은 앱의 env 파일을 기준으로 적용하며, 그 밖의 변수는 이미 process에 설정된 값을 우선합니다. `DATABASE_URL`이 비어 있으면 `file:./prisma/dev.db`를 사용하고, 상대
`file:` URL은 launcher의 앱 루트 기준 canonical 경로로 검증한 뒤 Windows 호환 절대
URL로 child process에 전달합니다. DB 파일·필수 Prisma 테이블·컬럼과 FINLIFE 복합 식별키 및 index가 준비되지 않았으면 bind 전에 실패합니다.
새 빈 DB는 `corepack pnpm prisma:generate`와 `corepack pnpm prisma:db:push`로 초기화합니다.
`prisma:db:push`는 기존 DB를 변경하지 않으며, 이미 준비된 DB는 검사 후 종료합니다. reset·data-loss·schema/config/URL override 옵션은 거부합니다.
기존 FINLIFE legacy DB는 앱을 종료한 뒤 다음 경로로 검사하고, 차단 사유가 없는 경우 명시적으로 적용합니다.

```bash
corepack pnpm finlife:identity:migrate
corepack pnpm finlife:identity:migrate:apply
```

검사는 읽기 전용입니다. 적용 명령은 같은 app control root의 writer lease를 확보하고,
`backups/finlife-identity/<id>/before.sqlite`와 receipt를 남긴 뒤 transaction으로 변경합니다.
기존 `Product.id`, 즐겨찾기·외부 상품 연결·옵션·사용자 데이터는 유지하며, 회사·상품 구분이 모호하거나 알 수 없는 schema는 적용하지 않습니다.
소스 checkout의 명시적 env는 유지하고, managed 설치본에서는 설치본 env와 production root를 launcher와 동일하게 사용합니다.
Portable 설치 단계는 같은 migration을 stage DB에 적용하고, 새 빈 DB에만 안전 Prisma 래퍼를 사용합니다.
Portable desktop 아티팩트는 `.next/standalone/node_modules/prisma`에 CLI와 전이
의존성을 실체화해 포함하므로 `--skip-install` 설치본의 스키마 준비도 원본
워크스페이스나 전역 Prisma 설치에 의존하지 않습니다.
설치본 `install.*`와 `run.*`은 manifest의 대상 OS·CPU·Node ABI를 실제 현재
runtime과 비교하므로 다른 플랫폼용 native module을 잘못 실행하지 않습니다.

## Data Directory와 Writer Lease

Planning storage root 우선순위는 다음과 같습니다. Managed desktop runtime에서는
호출 shell이 아니라 설치본 `.env.local`의 값을 기준으로 적용합니다.

1. `PLANNING_DATA_DIR`
2. dev: `<repo>/.data/planning`
3. production:
   - Windows: `%LOCALAPPDATA%/<AppName>/vault`
   - macOS/Linux: `${XDG_DATA_HOME:-$HOME/.local/share}/<AppName>/vault`

`<AppName>` 기본값은 `PlanningV2`이며 managed desktop에서는 설치본 `.env.local`의
`PLANNING_APP_NAME`으로 바꿀 수 있습니다.
UNC/network/shared filesystem과 local 여부를 판정할 수 없는 filesystem은 fail
closed합니다.

Production runtime은 data root 부모의 `runtime/writer-lease.json`을 소유합니다.
실제 Next server까지 모든 runtime child PID를 등록하며, session/lease capability
원문은 파일이나 로그에 저장하지 않습니다. 공식 mutating `pnpm` script는 같은
lease를 사용하므로 앱을 종료한 뒤 실행해야 합니다. 설치·업데이트도 `desktop.install`
maintenance lease를 복사 전부터 교체·rollback·정리가 끝날 때까지 유지합니다.
설치 폴더 안의 control root는 교체 중 lease와 migration 백업을 보존할 수 없어 복사 전에 거부합니다.

## Planning Observability

`/planning/runs`는 initial data load가 `5000` ms를 넘으면 server-side slow-load
telemetry를 남깁니다. `PLANNING_PAGE_LOAD_SLOW_MS`로 threshold를 조정할 수 있으며
route, 안전한 boolean/count, step duration/status만 기록하고 profile/run ID나 저장
payload를 포함하지 않습니다.

## Graceful Stop

- `pnpm start` 터미널에서 `Ctrl+C`로 종료합니다.
- Launcher와 writer bootstrap이 `SIGINT/SIGTERM`을 실제 Next child까지 전달하고
  child exit를 기다립니다.
- 정상 종료 후 `desktop-instance.lock.json`과 `writer-lease.json`을 제거합니다.
- 비정상 종료 뒤 stale lease는 같은 host의 기록된 parent/child PID가 모두 종료된
  경우에만 자동 회수합니다.
