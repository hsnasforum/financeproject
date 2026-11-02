# Deploy Guide

## 지원 범위

현재 지원하는 production 배포는 한 사용자·한 장치의 `desktop-local` 모드뿐입니다.

- bind: `127.0.0.1`
- identity: launcher가 만든 `desktop-local-session`
- process: application process 1개
- writer: canonical app control root cross-process lease 1개
- storage: local non-shared filesystem
- database: local SQLite `file:` URL

`web-single`, `web-multi`, reverse proxy, 원격 브라우저, network/shared filesystem,
PostgreSQL production runtime은 지원하지 않습니다. `PLANNING_NAMESPACE_ENABLED=true`,
trusted auth header 또는 forwarded header를 켜서 우회하지 마세요.

## 빌드와 실행

개발 실행은 다음 경로를 사용합니다.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Desktop Local production 실행은 다음 순서입니다.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:db:push
pnpm build
pnpm start
```

위 `prisma:db:push`는 새 빈 SQLite DB 초기화용입니다. 기존 DB는 준비 상태를 검사만 하며,
FINLIFE legacy 식별 구조가 남아 있으면 중단합니다. 앱을 종료한 상태에서
`corepack pnpm finlife:identity:migrate`로 읽기 전용 preflight를 수행하고, `required`이며
차단 사유가 없을 때 `corepack pnpm finlife:identity:migrate:apply`로 적용합니다.
적용은 app control root의 writer lease, durable SQLite 백업·receipt, transaction 경계를 사용합니다.
reset·data-loss·schema/config/URL override로 기존 DB를 갱신하는 경로는 허용하지 않습니다.

`pnpm start`와 `pnpm start:local`은 모두 desktop launcher로 수렴합니다. 런처는
loopback bind, local filesystem, SQLite, deployment policy, writer lease를 먼저
검증하고 one-shot bootstrap을 통해 browser에 `HttpOnly; SameSite=Strict` session
cookie를 설정합니다. `start:raw`와 `scripts/next_prod_safe.mjs` 직접 실행은 지원하지
않으며 launcher capability가 없으면 시작하지 않습니다.

`DATABASE_URL`은 앱 루트 기준 canonical 경로로 검증한 뒤 Prisma가 Windows에서도
해석할 수 있는 같은 볼륨의 Windows 호환 절대 `file:` URL로 standalone child에 전달됩니다. DB 파일이 없거나 `prisma/schema.prisma`의 필수 테이블이
누락되거나 FINLIFE 복합 식별키·유일성 index가 준비되지 않으면 launcher는 포트를 열기 전에 실패합니다. `bootstrap:local`은 외부 상품
동기화까지 포함하므로 API key 없이 스키마만 준비할 때는 위 Prisma 두 명령을 사용합니다.

설치 가능한 portable 아티팩트는 다음 명령으로 만듭니다.

```bash
pnpm planning:v2:desktop:build
```

설치·업데이트·제거 절차는 `docs/planning-v2-desktop-local.md`를 따릅니다.

## 환경 변수

Desktop launcher가 아래 runtime policy 값과 session token을 process 환경에 직접
설정합니다. 사용자가 attestation, identity, lease capability, session token을
직접 만들거나 `.env*`에 저장하지 않습니다.

- `PLANNING_DEPLOYMENT_MODE=desktop-local`
- `PLANNING_SINGLE_USER_MODE=true`
- `PLANNING_NAMESPACE_ENABLED=false`
- `PLANNING_TRUST_AUTH_HEADERS=false`
- `PLANNING_FORWARDED_HEADERS_TRUSTED=false`
- `PLANNING_DATA_DIR`은 선택이며, 지정하면 local filesystem의 전용 디렉토리여야 합니다.
- `DATABASE_URL`은 비어 있거나 `file:` SQLite URL만 허용합니다.
- Managed desktop에서는 `DATABASE_URL`, `PLANNING_DATA_DIR`, `PLANNING_APP_NAME`을 설치본 `.env.local`에 기록합니다. launcher·update·uninstall은 이 설치본 설정을 단일 기준으로 사용하고 호출 shell의 같은 이름 변수는 무시합니다.
- Managed installer의 SQLite DB는 설치 폴더 내부에 있어야 하며 symlink/junction을 통한 외부 경로도 거부합니다.
- 설치·업데이트의 app control root는 설치 폴더와 배포 원본 밖에 있어야 합니다. 내부 control root는 폴더 교체 시 lease·migration 백업도 이동하므로 복사 전에 거부하며, 기존 데이터를 안전하게 옮기는 별도 작업이 먼저 필요합니다.

기능별 API key는 선택입니다. 누락 시 해당 데이터 소스 상태와 영향 안내를 표시하고
핵심 Planning 흐름은 유지합니다.

- DART: `OPENDART_API_KEY`, `OPENDART_BASE_URL`, `DART_CORPCODES_INDEX_PATH`
- 공공 API: `KEXIM_API_KEY`, `MOLIT_SALES_API_KEY`, `MOLIT_RENT_API_KEY`,
  `MOIS_BENEFITS_API_KEY`, `REB_SUBSCRIPTION_API_KEY`
- FINLIFE: `FINLIFE_API_KEY`, `FINLIFE_BASE_URL`
- 지표 확장: `BOK_ECOS_API_KEY`, `FRED_API_KEY`, `KOSIS_API_KEY`

전체 템플릿은 `.env.example`, 개발용 예시는 `.env.local.example`를 참고하세요.

## Writer와 운영 명령

Desktop runtime과 공식 mutating package script는 같은 app control root lease를
사용합니다. 앱 실행 중에는 refresh, migration, trim, ops/report/release writer가
중복 실행되지 않고 실패합니다.

1. 앱을 정상 종료합니다.
2. `pnpm <script>` 형태의 package script를 실행합니다.
3. 명령 완료 후 앱을 다시 시작합니다.

`news:refresh`, `indicators:refresh`, `daily:refresh`, migration/trim, Planning ops와
report/release 계열이 이 경계에 포함됩니다. 직접 `node scripts/...`로 wrapper를
우회하는 실행은 지원하지 않습니다. `v3:restore` apply와 `start:raw`는 명시적으로
차단되어 있습니다.

Stale writer lease는 같은 host에서 기록된 parent/child PID가 모두 종료된 것이
확인될 때만 자동 회수합니다. foreign host, malformed state, 또는 PID 상태를 알 수
없는 경우에는 fail closed하므로 lease 파일을 임의 삭제하지 말고 관련 프로세스와
data root를 먼저 확인합니다.

## 운영 보안

- production에서 `/api/dev/*`와 dev/debug 화면은 404로 숨깁니다.
- raw identity header와 외부 proxy/forwarded header는 거부합니다.
- Next.js가 direct loopback 요청에 내부 합성하는 정확한 loopback forwarded 값만
  정규화하며, 이를 proxy 또는 identity 신뢰 근거로 사용하지 않습니다.
- session token 원문은 로그나 파일에 저장하지 않습니다. 브라우저 cookie를 지우면
  실행 중인 상태에서 launcher를 다시 실행해 owner-only broker로 새 one-shot session을
  발급합니다. `--no-open`은 bootstrap URL을 stdout에 출력하지 않습니다.
- 전체 data root의 application-level at-rest encryption을 지원한다고 간주하지
  않습니다. OS 계정 보호, disk encryption, backup 보관 정책을 별도로 적용합니다.

## 검증

```bash
pnpm lint
pnpm test
pnpm build
pnpm planning:v2:prod:smoke
pnpm planning:v2:desktop:smoke
pnpm e2e:rc
```

`planning:v2:prod:smoke`는 production-hidden 경계와 read-only 화면을 확인하고,
`planning:v2:desktop:smoke`는 실제 bootstrap session, profile/run, report/export
흐름을 확인합니다.
