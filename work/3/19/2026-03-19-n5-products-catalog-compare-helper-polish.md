# 2026-03-19 N5 products catalog compare helper polish

## 변경 파일

- `src/app/products/page.tsx`
- `src/app/products/catalog/page.tsx`
- `src/app/products/compare/page.tsx`
- `src/components/UnifiedProductDetailClient.tsx`
- `src/components/products/ProductDetailDrawer.tsx`
- `work/3/19/2026-03-19-n5-products-catalog-compare-helper-polish.md`

## 사용 skill

- `planning-gate-selector`: products stable/public surface의 copy/helper/page 수준 변경에 맞는 검증 세트와 `e2e:rc` 실행 여부를 판단하는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 미실행 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `/products`, `/products/catalog`, `/products/catalog/[id]`, `/products/compare`에서 화면 목적과 다음 행동이 한 번에 읽히지 않아 결과가 확정 추천처럼 받아들여질 여지가 있었다.
- 이번 배치는 `N5 products surface`의 copy/helper/trust cue/CTA polish만 다뤄야 했고, 상품 데이터 로직, score/sort, 필터 계약, compare 기능은 그대로 유지해야 했다.
- 사용자가 먼저 읽어야 하는 `무엇을 비교하는지`, `현재 결과를 어떤 기준으로 읽는지`, `다음에 무엇을 다시 확인해야 하는지`를 앞에 두도록 위계를 정리할 필요가 있었다.

## 핵심 변경

- `/products` 진입 화면에서 통합 카탈로그와 카테고리 진입을 `비교 시작` 흐름으로 다시 설명해, 무엇을 먼저 비교할지와 어디서 시작할지 더 짧게 읽히도록 다듬었다.
- `/products/catalog` 상단 helper, 검색 CTA, 결과 카운트, 대표 옵션 설명, 상세/비교 버튼 문구를 `현재 조건 기준 비교 후보` 톤으로 정리하고, 상세에서 다시 확인해야 할 항목을 앞세웠다.
- `/products/compare`에서는 비교 목적을 `확정 추천`이 아니라 `같은 기준으로 다시 읽는 단계`로 설명하고, 대표 금리/다음 확인 포인트/상세 재확인 CTA가 더 먼저 읽히게 조정했다.
- `/products/catalog/[id]` 상세에서는 기간 선택 라벨에서 raw source 성격의 값을 제거하고, 상품 식별자를 `공유·복구용 보조 정보` disclosure 아래로 내려 기본 화면의 핵심 정보처럼 보이지 않게 했다.
- 상세 드로어는 구조를 바꾸지 않고도 `상품 안내 -> 다음 확인 포인트 -> 기간별 옵션 -> 가정 기반 계산` 흐름이 더 분명히 읽히도록 helper 문구를 정리했다.

## 검증

- `git diff --check -- src/app/products/page.tsx src/app/products/catalog/page.tsx src/app/products/catalog/[id]/page.tsx src/app/products/compare/page.tsx src/components/products/ProductExplorerHeaderCard.tsx src/components/products/ProductResultsHeader.tsx src/components/products/ProductDetailDrawer.tsx src/components/products/ProductRowItem.tsx`
- `git diff --check -- src/components/UnifiedProductDetailClient.tsx`
- `pnpm lint`
  - 통과
  - 기존 unrelated warning 30건은 그대로 남아 있음
- `pnpm build`
  - 통과
- 미실행 검증
  - `pnpm e2e:rc` (selector/compare/list/detail interaction 구조를 의미 있게 바꾸지 않고 copy/helper/CTA 위계만 조정해 이번 라운드에서는 미실행)

## 남은 리스크

- 이번 라운드는 copy/helper/CTA/disclosure polish만 수행했기 때문에, 실제 사용자가 products surface를 `확정 추천`이 아닌 `비교/검토 단계`로 더 명확히 인식하는지는 별도 사용성 확인이 필요하다.
- 상세 페이지와 카탈로그의 설명 문구가 조금 길어져 작은 화면에서 밀도 높게 느껴질 수 있어 후속 시각 점검 여지가 있다.
- 워크트리에는 이번 범위 밖의 기존 modified/untracked 파일이 계속 남아 있으므로, 후속 commit 시 포함 범위를 다시 확인해야 한다.
