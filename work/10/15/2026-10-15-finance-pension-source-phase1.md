# 2026-10-15 Finance 연금저축 원천 교체 1단계 (통합연금포털 수집)

기준: [로컬 production 운영 복구](../14/2026-10-14-finance-local-production-operation.md). branch `checkpoint/finance-review-20261011`, HEAD `99deceff`.

## 결과

- FINLIFE 연금저축 API(`annuitySavingProductsSearch`)는 2026-10-15에도 보험 그룹이 대출 형식 4행, 금융투자 그룹이 297건이라면서 빈 페이지를 반환했습니다(다른 FINLIFE 키로도 동일, 예금은 정상). FINLIFE 화면의 연금저축 메뉴는 금감원 통합연금포털로 연결됩니다.
- 사용자 결정(권장안): 금감원 통합연금포털 OpenAPI로 원천을 바꾸고, 스냅샷을 배치 수집해 저장소에 커밋하며 daily refresh로 갱신합니다. FINLIFE 연금 수집은 정리하고 Prisma의 기존 연금 행은 보존합니다. 신선도는 수집 기록 7일입니다.
- 1단계 범위: provider·수집 명령·신선도 규칙·daily refresh 연결·FINLIFE 연금 수집 정리. 연금 화면은 아직 FINLIFE live 경로이며 2단계에서 교체합니다.
- `freshness:release`를 막던 `finlife_pension_snapshot.json`(113.9일)을 제거해 출시 신선도 검사가 통과합니다.

## 변경 파일

- 신규: `src/lib/publicApis/providers/fssPension.mjs`, `scripts/fss_pension_sync.mjs`, `docs/fss-pension-openapi.md`, `tests/fss-pension-provider.test.ts`, `tests/fss-pension-sync.test.ts`, `tests/fixtures/fss_pension/*.json`(실제 응답 발췌 7개), `.data/fss_pension_products_snapshot.json`, `.data/fss_pension_guaranteed_snapshot.json`
- 삭제: `.data/finlife_pension_snapshot.json`
- 수정: `package.json`(`pension:sync`, `pension:sync:if-stale`), `scripts/data_freshness_report.mjs`, `scripts/daily_refresh.mjs`, `scripts/daily_refresh_contract.mjs`, `.github/workflows/daily-refresh.yml`, `scripts/finlife_sync.mjs`, `scripts/finlife_persistence.mjs`, `scripts/finlife_cli_common.mjs`, `scripts/finlife_probe_groups.mjs`, `scripts/smoke/finlife-sample.mjs`, `docs/schema-baselines.json`, `.env.example`, `.env.local.example`, `docs/finlife-sync.md`, `docs/finlife-identity.md`, `docs/daily-refresh.md`, `docs/package-scripts.md`, `tests/finlife-sync-groups.test.ts`, `tests/finlife-sync-partial.test.ts`, `tests/daily-refresh-ci-contract.test.ts`, `tests/daily-refresh-ops-contract.test.ts`
- 저장소 밖: 추적하지 않던 `.data/finlife_pension_sync_attempt.json` 실패 marker 삭제, 계약 확인용 원문 `work/local/fss-pension-20261015/`(gitignore)

## 사용 skill

- 별도 skill 없이 AGENTS.md의 외부 데이터·provider 정규화·검증 규칙을 따랐습니다. 공식 문서는 앱 내장 브라우저로 확인했습니다.

## 변경 이유와 핵심 변경

- 공식 개발 가이드와 실제 응답이 달라 2026-10-15 실제 응답(7회 조회)으로 계약을 정했습니다. 최저보증이율은 기간별 문장, 상품별 수익률은 3·5·7·10년이며 채널별 수수료는 일부만 옵니다.
- 자산운용 36,052행 중 32,863행은 회사·상품명·적립금만 있어 상품 목록에서 제외하고 권역별 건수로 기록합니다. 완전 중복 행만 합치고 건수를 남깁니다. 공시 이상치(수수료율 -0.106%, 3년 수익률 744%)는 그대로 둡니다.
- 분기 선택: KST 최근 완료 분기 3개 중 4개 권역이 모두 `000`인 최신 분기. `001`만 미공시로 보고 이전 분기로 넘어가며 다른 오류는 즉시 실패합니다. 키가 없으면 `CONFIG_MISSING`으로 실패하고, 두 스냅샷은 모두 검증된 뒤 함께 교체합니다.
- daily refresh에 필수 단계 `pension:sync:if-stale`과 필수 env `FSS_PENSION_API_KEY`를 추가하고, 승인 경로·필수 스냅샷(8→9개)·진단 산출물에서 FINLIFE 연금을 새 연금 스냅샷 2개로 바꿨습니다.
- 스키마 기준선은 canonical generator를 임시 폴더에서 실행해 FINLIFE 연금 제거와 새 연금 2개 추가만 반영했습니다(다른 항목 불변 확인).

## 검증

- 첫 실제 수집(2026-10-15 03:55 KST): 2026년 3분기 `001` 확인 뒤 2026년 2분기 4,373개(은행 36, 자산운용 3,189, 생명 658, 손해 490), 원리금보장 2026년 9월 44개. 스냅샷에 키 없음, 직후 `--if-stale`은 skip.
- 깨끗한 HEAD 사본 + 이번 변경(사용자 `work/10/10` 수정 제외), bwrap·네트워크 차단:
  - `data:doctor`: 스키마 11파일 breaking 0, 신선도 9/9 fresh. `freshness:release` strict 통과.
  - 키 없는 `pension:sync`: `CONFIG_MISSING` exit 1, 파일 불변.
  - 전체 vitest: 931파일 중 926 통과, 25건 실패는 모두 이전에 격리 밖 통과를 확인한 sandbox 전용 목록(owner restore/archive, news, reports-route). 새 연금 테스트 13건 통과.
  - 전체 lint 오류 0(기존 경고 12), 전체 `tsc` 통과(수집 테스트의 fetch 타입을 고친 뒤).

## 남은 리스크

- GitHub 저장소 Secret `FSS_PENSION_API_KEY`가 없으면 daily refresh preflight가 실패합니다. 사용자가 직접 추가해야 합니다.
- 연금 화면(`/products/pension`)은 아직 FINLIFE live를 호출해 모든 권역이 `SCHEMA_MISMATCH`입니다(2단계).
- 환율 receipt는 1일 기준이라 다음 공시 영업일 이후 다시 stale이 됩니다.
- 통합연금포털 응답 형식이 안내와 다르므로 원천 변경 시 계약 테스트와 수집이 실패로 알립니다. 3분기 공시 시점은 미확인입니다.

## 다음 라운드

- 2단계: 새 연금 화면(원리금보장 탭 기본, 수수료 낮은 순, 출처 표시, 상태 구분)과 API, 비교·즐겨찾기 연금 제외 안내, FINLIFE 연금 runtime 경로 정리.
- GitHub Secret 추가 후 daily refresh 실제 실행 확인.
