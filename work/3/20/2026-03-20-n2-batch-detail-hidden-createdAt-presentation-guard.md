# N2 batch detail hidden createdAt presentation guard

## 변경 대상 파일
- `src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx`
- `work/3/20/2026-03-20-n2-batch-detail-hidden-createdAt-presentation-guard.md`

## 변경 이유
- batch detail route는 hidden public `createdAt`을 string contract 유지를 위해 `""`로 내릴 수 있다.
- detail client는 그 값을 그대로 날짜 formatter에 넣어 빈 값처럼 보일 수 있었고, summary surface의 `-` 표시와도 어긋났다.
- 이번 라운드는 route contract나 createdAt predicate는 건드리지 않고, detail consumer presentation guard만 최소 수정으로 맞춘다.

## 수행 내용
- `TransactionBatchDetailClient`의 batch metadata 영역에서 `detail.batch.createdAt === ""`이면 `-`를 표시하도록 guard를 추가했다.
- 값이 있을 때의 기존 날짜 formatting helper 사용 방식은 유지했다.
- summary surface의 hidden createdAt 표시 톤과 맞췄다.

## 어떤 의미를 유지했는지
- API payload shape는 그대로 유지했다.
- hidden createdAt decision boundary는 route/service helper 기준을 그대로 따른다.
- 이번 수정은 presentation-only guard이며 stored-first/legacy fallback 정책은 바꾸지 않았다.

## 실행한 검증
- `pnpm lint`
- `pnpm build`
- `git diff --check -- src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx src/app/planning/v3/transactions/batches/[id]/page.tsx src/app/planning/v3/batches/[id]/_components/BatchSummaryClient.tsx work/3/20/2026-03-20-n2-batch-detail-hidden-createdAt-presentation-guard.md`

## 미실행 검증
- `pnpm e2e:rc`

## 남은 리스크
- hidden createdAt은 여전히 route contract에서 `""`로 전달되므로, 다른 consumer가 이 필드를 직접 렌더링하면 별도 guard가 필요하다.
- detail과 summary는 같은 hiding decision boundary를 공유하지만, 표현 방식은 detail `"-"` / summary omitted-or-`"-"`로 완전히 동일한 payload semantics는 아니다.

## 사용 skill
- `planning-gate-selector`: TSX route consumer 변경에 필요한 최소 검증 세트 확인
- `work-log-closeout`: `/work` closeout 기록 형식 정리
