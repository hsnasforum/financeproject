# Deploy Guide

## 필수 환경 변수

- `NODE_ENV=production`
- `DATABASE_URL` (예: `file:./prisma/prod.db` 또는 운영 DB URL)

## 기능별 선택 환경 변수

- DART: `OPENDART_API_KEY`, `OPENDART_BASE_URL`, `DART_CORPCODES_INDEX_PATH`
- 공공 API:
  - `KEXIM_API_KEY`
  - `MOLIT_SALES_API_KEY`, `MOLIT_SALES_API_URL`
  - `MOLIT_RENT_API_KEY`, `MOLIT_RENT_API_URL`
  - `MOIS_BENEFITS_API_KEY`, `MOIS_BENEFITS_API_URL`
  - `REB_SUBSCRIPTION_API_KEY`, `REB_SUBSCRIPTION_API_URL`
- FINLIFE: `FINLIFE_API_KEY`, `FINLIFE_BASE_URL` 및 관련 옵션

기본 템플릿은 `.env.example`, `.env.local.example`를 참고하세요.

## Self-host 실행 순서

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm exec prisma db push
pnpm seed:debug   # 선택(초기 샘플 데이터가 필요할 때)
pnpm build
pnpm start
```

권장 게이트:

```bash
pnpm verify
pnpm build
```

## 운영 보안 동작

- `production`에서는 `/api/dev/*` 라우트가 공통 차단됩니다(404).
- `production`에서는 dev/debug 화면(` /dashboard/artifacts`, `/dev/*`, `/debug/unified`)도 404 처리됩니다.
- 따라서 dev artifacts 조회, dev action 실행(`dart:watch` 원클릭 등)은 운영에서 사용할 수 없습니다.

## 운영 배치 권장

- 일일 갱신: `pnpm daily:refresh`
- 스케줄러 또는 GitHub Actions에서 실행하고 `docs/**`, `tmp/**` 산출물을 점검하세요.
