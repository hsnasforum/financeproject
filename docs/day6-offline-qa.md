# Day 6 Offline QA 고정 가이드

오프라인에서 동일 조건으로 재현/검증할 때 사용하는 최소 절차입니다.

## 1) .env.local 예시

```env
DATABASE_URL="file:./prisma/dev.db"
FINLIFE_REPLAY=1
```

필수 포인트:
- `DATABASE_URL`은 로컬 SQLite 파일 경로와 정확히 일치해야 합니다.
- `FINLIFE_REPLAY=1`로 두면 FINLIFE는 스냅샷 기반(오프라인)으로 동작합니다.

## 2) 초기 시드/DB 준비

```bash
pnpm prisma db push
pnpm seed:debug
```

권장 진단:

```bash
pnpm offline:doctor
```

## 3) 수동 체크리스트

개발 서버 실행:

```bash
pnpm dev
```

체크 화면:
- `/planning`
  - `샘플 프로필 불러오기` → `계획 실행` → `실행 저장`이 정상 동작하는지 확인
- `/recommend`
  - `추천 실행` 시 결과 카드가 노출되는지 확인
  - `상세보기` 모달이 열리고 옵션/금리 정보가 보이는지 확인
- `/products/deposit`
  - 목록이 로드되고 `상세 보기` 모달이 정상 동작하는지 확인

## 4) 깨질 때 우선 확인

**깨질 때 1순위 원인 = `DATABASE_URL` 불일치**

예:
- `.env.local`은 `file:./prisma/dev.db`인데 실제 DB를 다른 파일로 쓰는 경우
- `db push`/`seed:debug`는 한 DB에 했는데 앱은 다른 DB를 보고 있는 경우

먼저 `pnpm offline:doctor` 결과에서 `DATABASE_URL`, `DB file`, `Product rows`를 확인하세요.
