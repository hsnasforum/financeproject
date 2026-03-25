# 2026-03-23 N4 visibility overlay residual wording drift audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md`
- `work/3/23/2026-03-23-n4-visibility-overlay-residual-wording-drift-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only audit round로 분류해 지정된 `git diff --check -- ...`만 실행 검증으로 선택하고, `pnpm test`, `pnpm build`, `pnpm lint`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`는 미실행으로 남겼다.
- `route-ssot-check`: `docs/current-screens.md`의 current `Public Beta` inventory와 `analysis_docs/v2/15...` overlay를 함께 읽을 때 남는 wording drift가 실제 route 비존재 문제인지, next-cycle entry/non-entry 해석 문제인지 구분하는 데 사용했다.
- `work-log-closeout`: 이번 residual wording drift audit의 문서 보정 범위, 실제 실행 검증, 남은 리스크를 저장소 표준 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 직전 alignment audit으로 큰 충돌은 없다고 정리됐지만, `news/*`, `journal`, `batches*` vs `transactions/batches*`는 current inventory와 next-cycle overlay를 함께 읽을 때 여전히 오해 여지가 남아 있었다.
- 이번 라운드는 route 구현이나 노출 정책 적용이 아니라, 어떤 그룹은 current overlay SSOT로 그대로 둬도 되고 어떤 그룹만 한 줄 더 풀어써야 안전한지 docs-first로 좁히는 것이 목적이었다.

## 핵심 변경
- `analysis_docs/v2/15...`의 `internal/experimental only` 절에, 이 분류가 current route 비존재나 즉시 숨김이 아니라 next-cycle non-promoted overlay라는 메모를 추가했다.
- 같은 문서의 alignment memo에서 `/planning/v3/news*`와 `/planning/v3/journal`은 current 실존 route를 부정하지 않는 non-entry/internal-trial overlay로 읽는 한 이미 안전한 subset으로 재분류했다.
- residual drift는 `/planning/v3/batches*`와 `/planning/v3/transactions/batches*`의 역할 구분으로 더 좁혀 남겼고, `analysis_docs/v2/11...` N4 메모도 같은 기준으로 맞췄다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/15_planning_v3_beta_exposure_visibility_policy.md work/3/23/2026-03-23-n4-visibility-overlay-residual-wording-drift-audit.md`
  - PASS
- 미실행 검증:
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm e2e:rc`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- current conclusion은 `news/*`와 `journal`이 완전히 implementation-safe하다는 뜻이 아니라, overlay 문구만으로는 current route 존재와 next-cycle non-entry 정책을 함께 읽을 수 있게 됐다는 뜻이다.
- 실제 residual drift는 여전히 `/planning/v3/batches*` vs `/planning/v3/transactions/batches*`에 남아 있고, future implementation round에서 raw batch center와 user-facing batch list/detail을 섞으면 다시 오해가 생길 수 있다. [검증 필요]
- 이번 audit만으로 nav/홈/헤더 노출 변경, production exposure 정책 적용, beta 승격 안전성이 생기지는 않는다.
