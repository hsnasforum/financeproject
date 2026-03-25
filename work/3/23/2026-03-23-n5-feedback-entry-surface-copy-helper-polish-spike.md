# 2026-03-23 feedback entry-surface copy-helper polish spike

## 변경 파일
- `src/components/FeedbackFormClient.tsx`
- `work/3/23/2026-03-23-n5-feedback-entry-surface-copy-helper-polish-spike.md`

## 사용 skill
- `planning-gate-selector`: entry copy/helper 단일 컴포넌트 수정에 맞춰 `pnpm lint`, `pnpm build`, `git diff --check`만 실행했다.
- `route-ssot-check`: `/feedback`가 `docs/current-screens.md`의 `Public Stable` 실존 route이고 이번 라운드에서 href/route contract 변경이 없음을 먼저 확인했다.
- `work-log-closeout`: 실행한 검증과 남은 리스크를 저장소 표준 형식의 `/work` note로 남겼다.

## 변경 이유
- `/feedback` entry surface에서 primary entry CTA, support helper, 보조 이동의 위계는 유지한 채 문구만 더 쉽게 읽히게 정리할 필요가 있었다.
- 특히 header description, `무엇을 남기나요?` 안내, 저장 후 notice, `공유용 진단 번들` helper가 support entry 기대치를 더 또렷하게 보여줘야 했다.

## 핵심 변경
- `PageHeader` description을 새 의견과 개선 아이디어를 기록으로 남기고 이후 다시 확인하는 entry surface라는 톤으로 다듬었다.
- `무엇을 남기나요?` 안내를 즉시 답변 창이 아니라 support entry 기록 화면이라는 설명으로 정리했다.
- 저장 성공 notice를 “피드백 저장”보다 이후 목록/상세 follow-through가 더 쉽게 읽히는 문구로 바꿨다.
- `공유용 진단 번들` helper/notice를 직접 공유나 지원 대응이 필요할 때만 쓰는 support helper로 더 분명히 적었다.
- 버튼 수, href, form field 구조, diagnostics payload/policy, 저장 후 route 흐름은 바꾸지 않았다.

## 검증
- `pnpm lint` — PASS (`0 errors`, 변경과 무관한 기존 warning 30건 유지)
- `pnpm build` — PASS
- `git diff --check -- src/components/FeedbackFormClient.tsx analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/16_public_stable_ux_polish_backlog.md work/3/23/2026-03-23-n5-feedback-entry-surface-copy-helper-polish-spike.md` — PASS

## 남은 리스크
- `공유용 진단 번들`을 primary CTA처럼 끌어올리거나 diagnostics 정책/보안 경계를 다시 설계하면 이번 copy/helper 범위를 넘어 support flow 재설계로 커질 수 있다.
- `/feedback/list`, `/feedback/[id]` 역할이나 저장 후 route 흐름을 같이 바꾸기 시작하면 `N5` small-batch 범위를 넘는다.
- 미실행 검증: `pnpm test`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
