# 2026-03-12 planning-v3 news alert-rules follow-through e2e closeout

## 변경 파일
- `tests/e2e/news-settings-alert-rules.spec.ts`
- `package.json`
- `README.md`
- `docs/README.md`
- `work/3/12/2026-03-12-planning-v3-news-alert-rules-follow-through-e2e-closeout.md`

## 사용 skill
- `planning-gate-selector`: `news/settings` alert-rules follow-through를 RC 게이트에 넣을 때 필요한 최소 검증을 `eslint + narrow e2e + build + e2e:rc + guard`로 고르기 위해 사용
- `work-log-closeout`: 이번 라운드의 실제 검증 결과와 남은 운영 리스크를 저장소 규칙에 맞춰 정리하기 위해 사용

## 변경 이유
- 최신 closeout까지는 `news/settings#news-settings-alert-rules`의 unit/static 계약과 넓은 RC 묶음만 있었고, `알림함 확인 -> 중요 알림`, `Digest 확인 -> 오늘 재무 브리핑` follow-through를 좁게 고정하는 전용 브라우저 회귀가 없었습니다.
- 현재 작업트리에는 이 흐름을 다루는 Playwright spec과 RC 스크립트/문서 반영이 이미 올라와 있어, 이번 라운드는 그 변경이 실제 `build`와 `pnpm e2e:rc`까지 통과하는지 메인에서 닫는 검증 배치입니다.

## 핵심 변경
- `tests/e2e/news-settings-alert-rules.spec.ts`가 `/planning/v3/news/settings#news-settings-alert-rules`에서 follow-through CTA를 따라 `alerts`와 `digest` 화면까지 이어지는지를 고정합니다.
- `package.json`의 `e2e:rc`, `e2e:rc:dev-hmr`가 새 spec을 기본 RC 묶음에 포함합니다.
- `README.md`, `docs/README.md`가 RC 기본 묶음 설명에 `news/settings alert-rules 후속 확인`을 반영합니다.
- 이번 라운드의 main 작업은 추가 구현보다 실제 게이트 통과 여부 검증과 closeout 정리였습니다.

## 검증
- `pnpm exec eslint tests/e2e/news-settings-alert-rules.spec.ts`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/news-settings-alert-rules.spec.ts --workers=1`
- `pnpm build`
- `pnpm e2e:rc`
- `git diff --check -- package.json README.md docs/README.md`
- `pnpm multi-agent:guard`

## 남은 리스크
- `pnpm multi-agent:guard`의 `latestWorkNote`는 여전히 tracked note 기준이라 이번 새 closeout이 최신으로 바로 보이지 않을 수 있습니다.
- 이번 spec은 현재 repo 데이터와 실제 dev runtime 위에서 PASS했고 blocker는 아니지만, 장기적으로 더 결정적인 fixture 기반으로 바꾸려면 별도 안정화 배치로 분리하는 편이 안전합니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
