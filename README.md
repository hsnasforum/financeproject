# Finance Planner MVP

Next.js(App Router) + TypeScript + Tailwind + Prisma(SQLite) 기반 개인용 재무설계/금융상품 추천 MVP입니다.

## Local Run

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

브라우저: `http://localhost:3000`

## Environment & Security

- API 키(FINLIFE/공공 API)는 **서버 환경변수(.env.local)** 에만 저장합니다.
- 키/토큰은 클라이언트 번들에 노출하면 안 됩니다. (`NEXT_PUBLIC_*` 로 키를 넣지 않음)
- SQLite DB 파일(`*.db`, `*.sqlite*`)은 커밋하지 않습니다. (`prisma/schema.prisma`와 migration 소스만 커밋)

## Current Build Priority

- 현재 단계 우선순위와 DoD 검증 루틴은 `docs/api-utilization-draft.md`의 `Phase Now (현재 단계)`를 기준으로 진행합니다.
- 현재 제공 화면/내비 경로는 `docs/current-screens.md`를 기준으로 확인합니다.
- FINLIFE 스키마는 샘플 호출 결과(JSON) 확인 후 타입/정규화를 확정합니다(추측 구현 금지).

## Git Remote Setup

현재 브랜치 확인:

```bash
git branch --show-current
```

원격 연결(최초):

```bash
git remote add origin <REMOTE_URL>
```

`origin`이 이미 있으면 URL 갱신:

```bash
git remote set-url origin <REMOTE_URL>
```

푸시:

```bash
git push -u origin main
```

현재 브랜치가 `main`이 아니면:

```bash
git push -u origin "$(git branch --show-current)"
```

## Push Rejected 해결

원격에 기존 커밋이 있어 push가 거부되면:

```bash
git pull --rebase origin main
git push -u origin main
```

rebase 충돌 시:

1. 충돌 파일 수정
2. `git add <file>`
3. `git rebase --continue`
4. 완료 후 `git push -u origin main`
