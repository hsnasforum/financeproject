# 2026-03-24 feedback detail read-through copy-helper polish spike

## 변경 파일
- `src/components/FeedbackDetailClient.tsx`
- `work/3/24/2026-03-24-n5-feedback-detail-read-through-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: detail copy/helper single-surface spike에 맞춰 `pnpm lint`, `pnpm build`, `git diff --check`만 실행했다.
- `route-ssot-check`: `/feedback/[id]`가 `docs/current-screens.md`의 `Public Stable` 실존 route이고 이번 라운드에 route contract 변경이 없음을 확인했다.
- `work-log-closeout`: 이번 구현 범위와 검증 결과, 남은 리스크를 `/work` 종료 기록으로 남겼다.

## 변경 이유
- `/feedback/[id]` detail 화면에서 read-through 안내와 support/export helper가 함께 노출돼, first-read layer와 support helper layer 경계를 문구로 더 또렷하게 만들 필요가 있었다.
- detail flow, export semantics, dev recovery policy까지 건드리지 않고 copy/helper/trust cue만 좁게 다루는 smallest spike가 필요했다.

## 핵심 변경
- `PageHeader` description을 detail read-through 목적에 맞게 다시 읽기와 다음 확인 메모 중심 문구로 정리했다.
- `이 화면에서 먼저 보는 정보` helper를 저장본 재확인과 다음 확인 메모 중심으로 다듬고, support/export helper는 직접 공유·지원 대응이 필요할 때만 보게 되는 보조층으로 분리해 적었다.
- `공유·지원용 보조 정보`에 직접 공유·지원 문의 상황에서만 확인하는 정보라는 helper 문구를 추가했다.
- `공유·지원용 내보내기` helper를 화면 내용 이관 또는 직접 공유·지원 대응 때만 쓰는 보조 export로 정리했다.

## 검증
- `pnpm lint` — PASS, 기존 warning 30건 유지
- `pnpm build` — PASS
- `git diff --check -- src/components/FeedbackDetailClient.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/24/2026-03-24-n5-feedback-detail-read-through-copy-helper-polish-spike.md` — PASS

## 남은 리스크
- support/export helper의 위계가 여전히 현재 레이아웃과 details 접힘 구조에도 일부 의존한다.
- 상태/우선순위/체크리스트 편집 흐름, export semantics, dev recovery action 정책까지 함께 바꾸기 시작하면 `N5` small-batch 범위를 넘어 detail flow 재설계로 커질 수 있다.
- 미실행 검증: `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
