# Finance Project (v1.0.0)

개인 재무설계, 금융상품 추천, 공공데이터 연동, DART 공시 모니터링을 통합한 Next.js 기반 서비스입니다.

## Planning v2 완료 판정

Planning v2의 완료 선언은 아래 게이트가 PASS할 때만 인정합니다.

```bash
pnpm planning:v2:complete
```

성공 기준 문구:

`✅ P97 COMPLETE — 모든 게이트 통과(테스트/스모크/가드/회귀)`

Planning v2 문서:

- `docs/planning-v2-onepage.md`
- `docs/planning-v2-quickstart.md`
- `docs/planning-v2-user.md`
- `docs/planning-v2-ops.md`
- `docs/planning-v2-release-checklist.md`
- `docs/releases/planning-v2-final-report-{version}.md`

## 핵심 진입 경로

- 메인 진입: `/dashboard`
- 핵심 기능:
  - `/planner`
  - `/recommend`
  - `/public/dart`
  - `/settings/data-sources`
  - `/products/catalog` (통합 탐색 우선)

## 주요 기능

- 재무설계(Planner): 입력 기반 지표/액션 제안
- 추천(Recommend): 결과 저장/히스토리/리포트 연동
- DART: digest/alerts/daily brief 생성 및 노출
- 데이터 소스 상태/헬스 체크 대시보드
- 일일 갱신 파이프라인(`daily:refresh`) + 아티팩트 생성

## 기술 스택

- Next.js (App Router), React, TypeScript
- Tailwind CSS
- Prisma + SQLite
- Vitest + Playwright + ESLint

## 빠른 시작

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev
```

- 로컬: `http://localhost:3000`
- LAN 개발 서버: `pnpm dev:lan`

## 필수/주요 명령어

```bash
pnpm verify
pnpm build
pnpm e2e
```

추가:

- DART 워치: `pnpm dart:watch`
- 일일 갱신: `pnpm daily:refresh`
- RC 핵심 E2E 셋: `pnpm e2e:rc`

## CI/자동화

- CI 게이트: `.github/workflows/ci.yml`
  - `pnpm verify`
  - `pnpm build`
- E2E 스모크/플로우: `.github/workflows/e2e-smoke.yml`
- Daily refresh: `.github/workflows/daily-refresh.yml`
- Tag release: `.github/workflows/release.yml` (`v*` 태그 푸시 시 GitHub Release 생성)

## 운영 보안

- production에서 `/api/dev/*`는 공통 차단(404)
- production에서 dev/debug 화면도 비노출:
  - `/dashboard/artifacts`
  - `/dev/*`
  - `/debug/unified`
- API 키는 서버 환경변수로만 관리 (`NEXT_PUBLIC_*`로 노출 금지)

## 문서

- 화면 카탈로그: `docs/current-screens.md`
- 배포 가이드: `docs/deploy.md`
- 릴리즈 노트: `docs/release-notes.md`
- 릴리즈 체크리스트: `docs/release-checklist.md`
- 유지보수 루틴: `docs/maintenance.md`
- daily refresh 운영: `docs/daily-refresh.md`
