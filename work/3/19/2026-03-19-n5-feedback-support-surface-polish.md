# 2026-03-19 N5 feedback support surface polish

## 변경 파일
- `src/components/FeedbackFormClient.tsx`
- `src/components/FeedbackListClient.tsx`
- `src/components/FeedbackDetailClient.tsx`

## 사용 skill
- `planning-gate-selector`: feedback 표면이 UI text/disclosure 조정인지 확인하고 `git diff --check`, `pnpm lint`, `pnpm build`까지만 실행하도록 검증 범위를 고정했다.
- `work-log-closeout`: 오늘 N5 `/work` 기록 형식에 맞춰 변경 파일, 검증, 잔여 리스크를 정리했다.

## 변경 이유
- `/feedback`, `/feedback/list`, `/feedback/[id]`가 사용자용 도움말과 후속 행동 안내보다 ops/debug 성격의 정보가 먼저 읽히는 상태였다.
- 제출 후 무엇을 기대할 수 있는지, 목록에서 무엇을 다시 보고 있는지, 상세에서 어떤 정보가 핵심이고 어떤 정보가 보조인지 더 쉽게 읽히게 정리할 필요가 있었다.

## 핵심 변경
- 작성 화면에서 `무엇을 남기나요` helper를 추가해 이 화면이 확정 답변이 아니라 기록과 후속 확인을 위한 저장 화면이라는 점을 먼저 설명했다.
- 목록 화면의 제목, empty/helper 문구, 상태 라벨, 상세 CTA를 사용자 시선으로 바꾸고 traceId 같은 디버그성 신호는 기본 카드 전면에서 내렸다.
- 상세 화면에서 핵심 메시지와 다음 확인 메모를 먼저 읽히게 정리하고, 기록 ID·추적 ID·접속 화면·브라우저 정보는 `공유·지원용 보조 정보` disclosure 아래로 내렸다.
- 개발용 복구 액션과 JSON/Issue export는 기본 화면의 핵심 흐름에서 한 단계 내린 disclosure로 재배치했다.
- 진행 상태/메모/체크리스트 영역의 라벨을 `진행 상태`, `다음 확인 일정`, `확인 메모`, `다음 확인 항목` 중심으로 바꿔 후속 행동 흐름으로 읽히게 맞췄다.

## 검증
- 실행한 검증
- `git diff --check -- src/app/feedback/page.tsx src/app/feedback/list/page.tsx src/app/feedback/[id]/page.tsx`
- `git diff --check -- src/components/FeedbackFormClient.tsx src/components/FeedbackListClient.tsx src/components/FeedbackDetailClient.tsx`
- `pnpm lint` (`0 errors`, 기존 warning 30건 유지)
- `pnpm build`
- 미실행 검증
- `pnpm e2e:rc` (`selector/flow` 구조를 의미 있게 바꾸지 않아 미실행)

## 남은 리스크
- 상세 화면은 여전히 운영 메타데이터와 개발용 액션을 함께 포함하므로, 실제 사용자 관점에서 disclosure 배치만으로 충분한지 사용성 확인이 더 필요하다.
- `P0~P3` 우선순위 같은 내부 표현은 기본 흐름에서 다소 남아 있어, 다음 라운드에서 더 강한 사용자화가 필요할 수 있다.
