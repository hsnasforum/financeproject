# Deploy Guide

## 필수 환경 변수

- `NODE_ENV=production`
- `DATABASE_URL` (예: `file:./prisma/prod.db` 또는 운영 DB URL)
- `AUTH_SECRET` (또는 legacy `NEXTAUTH_SECRET`)
- Planning 저장소 소유권:
  - 다중 사용자 운영: `PLANNING_NAMESPACE_ENABLED=true`
  - 명시적 단일 사용자 운영: `PLANNING_SINGLE_USER_MODE=true`
  - 둘 다 없으면 `pnpm start`가 Planning 저장소 설정 오류로 중단됩니다.

## 기능별 선택 환경 변수

- DART: `OPENDART_API_KEY`, `OPENDART_BASE_URL`(권장, legacy `OPENDART_API_URL` 지원), `DART_CORPCODES_INDEX_PATH`
- 공공 API:
  - `KEXIM_API_KEY`
  - `MOLIT_SALES_API_KEY`, `MOLIT_SALES_API_URL`
  - `MOLIT_RENT_API_KEY`, `MOLIT_RENT_API_URL`
  - `MOIS_BENEFITS_API_KEY`, `MOIS_BENEFITS_API_URL`
  - `REB_SUBSCRIPTION_API_KEY`, `REB_SUBSCRIPTION_API_URL`
- FINLIFE: `FINLIFE_API_KEY`, `FINLIFE_BASE_URL` 및 관련 옵션
- 확장 후보: `NPS_PENSION_API_KEY`, `FSS_INSURANCE_API_KEY`, `FSC_RETIRE_PENSION_API_KEY`, `KDB_RETIRE_GUARANTEE_API_KEY`, `FSC_FINCOMPANY_API_KEY`, `BOK_ECOS_API_KEY`, `FRED_API_KEY`, `KOSIS_API_KEY`

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
- Planning 인증은 production에서 항상 필요합니다. 인증 사용자별 파일 저장을 쓸 때는 `PLANNING_NAMESPACE_ENABLED=true`를 사용하고, 개인용/desktop처럼 단일 사용자만 허용하는 topology는 `PLANNING_SINGLE_USER_MODE=true`를 명시합니다.
- 명시적 단일 사용자 모드도 공용 root가 아니라 `.data/planning/users/default/...` 레이아웃을 사용합니다.
- 여러 Node 프로세스나 여러 인스턴스가 같은 `PLANNING_DATA_DIR` 파일 루트를 공유한다면 process-local mutex만으로 저장 완료를 보장하지 않습니다. 이 topology에서는 파일 lock/CAS 또는 DB transaction 설계를 먼저 확정해야 합니다.

## Planning 데이터 inventory

배포 전 다음 항목을 확인하세요.

```bash
find .data/planning/v3/transactions -type f 2>/dev/null | wc -l
find .data/planning/users -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l
find .data/planning/profiles .data/planning/runs -type f 2>/dev/null | wc -l
```

소유자를 판별할 수 없는 legacy 거래 데이터는 자동으로 특정 사용자에게 배정하지 말고 quarantine 또는 read-only 복구 절차로 분리합니다.

## 운영 배치 권장

- 일일 갱신: `pnpm daily:refresh`
- 스케줄러 또는 GitHub Actions에서 실행하고 `docs/**`, `tmp/**` 산출물을 점검하세요.
