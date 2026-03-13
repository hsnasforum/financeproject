# 2026-03-12 data-sources prod smoke support summary

## 변경 파일
- `scripts/planning_v2_prod_smoke.mjs`
- `src/lib/dataSources/impactHealth.ts`
- `src/components/DataSourceHealthTable.tsx`
- `src/lib/ops/supportBundle.ts`
- `tests/data-source-impact-health.test.ts`
- `tests/planning/ops/support-export-route.test.ts`
- `docs/data-sources-settings-ops.md`

## 변경 이유
- 직전 라운드 다음 우선순위 두 건을 닫아야 했다.
- production 전용 smoke에 `/settings/data-sources` read-only 렌더 확인이 없어, 실제 운영 빌드에서 `운영 최신 기준` 카드가 깨져도 놓칠 수 있었다.
- dev health table의 `사용자 도움 카드 기준 요약`은 화면 안에서만 쓰고 있어, 운영자 handoff/export 경로에서 같은 기준을 재사용할 수 없었다.

## 핵심 변경
- `impactHealth`에 `buildDataSourceImpactOperatorCardSummaries`를 추가해 read-only 기준과 health API 집계를 공통 요약 구조로 묶었다.
- `DataSourceHealthTable`은 위 공통 helper를 사용하도록 맞춰 UI와 export가 같은 카드 순서와 라벨을 보게 했다.
- `buildSupportBundle`은 `data_source_impact_summary.json`을 함께 내보내도록 확장해 `/settings/data-sources`의 카드 기준 요약을 support export에서 재사용하게 했다.
- `planning_v2_prod_smoke`는 `/settings/data-sources` HTML에 `데이터 소스 연동 상태`, `운영 최신 기준`이 있는지와 dev 전용 `Fallback/쿨다운 진단`이 없는지를 확인하도록 보강했다.
- 운영 체크리스트에 production smoke와 support bundle 재사용 기준을 추가했다.

## 검증
- `pnpm test tests/data-source-impact-health.test.ts tests/planning/ops/support-export-route.test.ts`
  - PASS
- `pnpm lint`
  - PASS
- `pnpm build`
  - FAIL
  - 1차: `.next-build/server/interception-route-rewrite-manifest.js` 누락으로 webpack build 실패
  - 조치: stale `.next/lock` 제거 후 재시도
  - 2차: 상세 stderr 없이 `ELIFECYCLE` 종료, `.next/BUILD_ID` 미생성
- `pnpm planning:v2:prod:smoke`
  - FAIL
  - `next start`가 `.next`에서 production build를 찾지 못해 시작 전 종료

## 남은 리스크
- 이번 라운드의 기능 범위인 `prod smoke read-only 체크 추가`와 `support export 재사용` 구현 자체는 완료했지만, 현재 워크트리 기준 `pnpm build`가 production 산출물을 끝까지 만들지 못해 새 smoke 체크가 실제 PASS까지 이어지지 못했다.
- `pnpm build` 실패는 이번 수정 파일 테스트/lint 범위를 벗어난 저장소 전체 build 문제일 가능성이 높다. `.next/lock` stale 문제는 제거했지만, direct `next build --webpack`도 SIGTERM(143)로 끝나 추가 원인 추적이 필요하다.
- Support Bundle에 추가된 `data_source_impact_summary.json`은 dev/ops handoff에는 적합하지만 audit 로그를 대체하지는 않는다. 이벤트 추적은 계속 `/ops/audit`, 카드 기준 공유는 Support Bundle export를 기준으로 구분해야 한다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
