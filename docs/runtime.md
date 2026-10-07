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

Launcher는 시작할 때 앱 루트의 `.env.local`, `env.local`, `.env`를 순서대로 읽되
이미 process에 설정된 환경변수를 덮어쓰지 않습니다. `DATABASE_URL`이 비어 있으면 `file:./prisma/dev.db`를 사용하고, 상대
`file:` URL은 launcher의 앱 루트 기준 canonical 경로로 검증한 뒤 Windows 호환 절대
URL로 child process에 전달합니다. DB 파일이나 필수 Prisma 테이블·컬럼이 없으면 bind 전에 실패합니다. 소스 checkout은 최초 1회
`pnpm prisma:generate`와 `pnpm prisma:db:push`로 준비하고, portable 설치본은 설치 단계에서 같은 안전 래퍼로 스키마를 준비합니다.
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
lease를 사용하므로 앱을 종료한 뒤 실행해야 합니다.

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
