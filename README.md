# Finance Project

개인 재무설계와 금융상품 탐색/추천, 공공데이터 연동, DART 공시 모니터링을 통합한 Next.js 기반 프로젝트입니다.

## 핵심 기능

- 재무설계(Planner): 입력값 기반 지표/액션 제안
- 금융상품 탐색/추천: 통합 카탈로그 + 추천 실행/히스토리
- 공공 API 연동: FINLIFE, Gov24, OpenDART
- DART 모니터링:
  - 공시 분류/클러스터링
  - digest/alerts/daily brief 생성
  - 메인/리포트 노출
- 자동 갱신 파이프라인:
  - `daily:refresh` 로 로컬/CI에서 일일 갱신
  - GitHub Actions 스케줄 실행 지원

## 기술 스택

- Next.js(App Router) + React + TypeScript
- Tailwind CSS
- Prisma + SQLite (로컬 개발)
- Vitest + ESLint

## 빠른 시작

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev
```

- 기본 접속: `http://localhost:3000`
- LAN 접속 개발 서버: `pnpm dev:lan`

## 환경 변수

주요 환경 변수는 `.env.local.example` 참고:

- `OPENDART_API_KEY` (선택)
- `OPENDART_BASE_URL` (기본 `https://opendart.fss.or.kr`)
- 기타 외부 API 키(FINLIFE 등)

참고:
- `OPENDART_API_KEY`가 없어도 `pnpm dart:watch`는 실패하지 않고 skip digest를 생성합니다.

## 자주 쓰는 명령어

- 개발 서버: `pnpm dev`
- 타입체크: `pnpm typecheck`
- 테스트: `pnpm test`
- 전체 검증: `pnpm verify`

DART 관련:

- 공시 워치 실행: `pnpm dart:watch`
- strict-high 모드: `pnpm dart:watch:strict-high`
- 일일 갱신: `pnpm daily:refresh`
- 일일 갱신(strict): `pnpm daily:refresh:strict`

## 산출물 경로

DART watch/refresh 실행 시 주요 산출물:

- `tmp/dart/disclosure_digest.json`
- `tmp/dart/disclosure_alerts.json`
- `tmp/dart/daily_brief.json`
- `docs/dart-disclosure-digest.md`
- `docs/dart-disclosure-alerts.md`
- `docs/dart-daily-brief.md`

## 자동화

- CI: `.github/workflows/ci.yml` (기본 verify)
- Daily refresh: `.github/workflows/daily-refresh.yml`
  - cron: `5 0 * * *` (UTC 00:05 / KST 09:05)
  - 필요 Secret: `OPENDART_API_KEY`

## 문서

- OpenDART 설정: `docs/opendart-setup.md`
- Daily refresh 운영: `docs/daily-refresh.md`
- API/현재 우선순위: `docs/api-utilization-draft.md`
- 현재 화면 기준: `docs/current-screens.md`

## 보안/운영 주의

- API 키는 반드시 서버 환경변수(`.env.local`)에만 저장
- `NEXT_PUBLIC_*`로 민감키 노출 금지
- DB/로컬 캐시 파일은 커밋 금지 (`.gitignore` 기준)
