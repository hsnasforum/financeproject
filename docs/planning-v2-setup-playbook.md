# Planning v2 Setup Playbook

목적: 새 PC/새 환경에서 `클론 -> 설치 -> 실행 -> 완성 확인`을 막힘 없이 재현합니다.

quickstart(3분)과 차이:
- `planning-v2-quickstart.md`: 이미 환경이 준비된 상태에서 빠르게 실행
- 이 문서: 새 환경에서 처음 세팅부터 완성 확인까지 전체 흐름

## A) 설치

필요 버전(권장 최소):
- Node.js: `20+`
- pnpm: `9+`

버전 확인:

```bash
node -v
pnpm -v
```

의존성 설치:

```bash
pnpm i
```

## B) 환경변수

기본 파일 생성:

```bash
cp .env.local.example .env.local
```

환경변수 원칙:
- `BOK_ECOS_API_KEY`는 선택(없어도 기본 실행 가능)
- 처음에는 나머지 기본값 유지
- `PLANNING_INCLUDE_PRODUCTS_ENABLED=false` 기본 OFF
- `PLANNING_OPTIMIZER_ENABLED=false` 기본 OFF

선택(기존 스크립트 재사용):

```bash
pnpm env:setup
```

## C) 초기 데이터 (선택)

샘플 프로필/런을 빠르게 만들 때:

```bash
pnpm planning:v2:seed
```

## D) 실행

```bash
pnpm dev
```

브라우저 접속:
- 터미널에 출력된 `Open (same env)` 또는 `Open (LAN)` URL을 그대로 사용
- 기본 예: `http://localhost:3100`
- WSL에서는 `pnpm dev`가 `0.0.0.0` + Windows `127.0.0.1` localhost bridge 조합을 기본으로 쓰므로 `http://localhost:3100`를 우선 사용
- Windows 브라우저에서 localhost forwarding이 안 되면 같은 출력의 `Open (LAN)` URL로 접속

## E) 동기화 (선택)

방법 1: UI
- `/ops/assumptions` 접속 후 `Sync now`

방법 2: CLI

```bash
pnpm planning:assumptions:sync
```

## F) 완성 확인

1) 기술 게이트:

```bash
pnpm planning:v2:complete
```

release/RC E2E만 먼저 확인할 때:

```bash
pnpm e2e:rc
```

- dev Playwright는 기본적으로 `E2E_DISABLE_DEV_HMR=1`로 `/_next/webpack-hmr` websocket을 막아 HMR reload 노이즈를 테스트 경로에서 분리합니다.
- dev HMR flake를 다시 재현해야 하면 `pnpm e2e:rc:dev-hmr`로 실행합니다.

2) 서버 실행 상태에서 acceptance:

```bash
PLANNING_BASE_URL=http://localhost:PORT pnpm planning:v2:acceptance
```

3) 사용자 게이트(수동):
- `docs/planning-v2-5min-selftest.md` 체크 항목 1회 완료

## G) 문제 해결 (짧게)

### 1) snapshot missing/stale
- 증상: health에 snapshot missing/stale 경고
- 조치: `/ops/assumptions`에서 `Sync now` 실행 후 다시 Run

### 2) budget exceeded
- 증상: Monte Carlo가 예산 초과로 스킵/차단
- 조치: `paths` 또는 `horizonMonths`를 줄여 재실행

### 3) local-only 차단
- 증상: ops/debug/api 호출이 `LOCAL_ONLY`로 거절
- 조치: localhost 환경에서 실행/접속하고, 원격 도메인 경유를 피함
