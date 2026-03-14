# 2026-03-14 frontend product-explorer design-spec alignment closeout

## 변경 파일
- `src/components/ProductListPage.tsx`
- `src/components/products/ProductExplorerHeaderCard.tsx`
- `src/components/products/ProductOptionRowItem.tsx`
- `src/components/products/ProductResultsHeader.tsx`
- `src/components/products/ProviderChipCarousel.tsx`
- `src/components/products/SegmentedTabs.tsx`
- `src/components/ui/Button.tsx`
- `src/components/ui/FilterChips.tsx`
- `src/components/ui/SegmentedTabs.tsx`
- `docs/frontend-design-spec.md`
- `work/3/14/2026-03-14-frontend-product-explorer-design-spec-alignment-closeout.md`

## 사용 skill
- `work-log-closeout`: frontend closeout note 형식으로 실행 사실, snapshot 분리 판단, 미실행 검증을 빠뜨리지 않고 정리하기 위해 사용

## 변경 이유
- latest planning-v3 note `work/3/14/2026-03-14-planning-v3-complete-checkpoint.md`가 이미 `planning-v3 새 구현 batch 없음`과 `outside scope 우선`을 결론으로 남겼다.
- 현재 dirty는 `GEMINI.md`를 제외하면 planning-v3가 아니라 product explorer UI, shared primitive, design spec 문서, finlife snapshot으로 모여 있었다.
- 이번 라운드는 새 feature를 더 열지 않고, 현재 products/frontend 묶음이 `docs/frontend-design-spec.md`의 계층과 모바일 카드 원칙에 맞는지 검증하고 closeout하는 것이 목적이었다.

## 핵심 변경
- planning-v3는 reopen하지 않았다. 이번 라운드는 `pr37-planning-v3-txn-overrides` 브랜치 위에서 product explorer outside-scope batch만 감사했다.
- product explorer hierarchy 정렬: 상품 분류 탭, 제공자 칩, 상세 필터, 결과 요약/row 흐름으로 재배치했고 `ProductExplorerHeaderCard`, `ProductResultsHeader`, `ProductOptionRowItem`, `ProviderChipCarousel`, `ProductListPage`가 `docs/frontend-design-spec.md`의 방향과 맞는지 기준선으로 확인했다.
- 모바일 카드 전환: `ProductListPage`의 option group 상세는 모바일에서 table 대신 card/list로 보이도록 유지했고, desktop table은 `md` 이상에서만 남겼다.
- shared primitive 조정 범위는 product explorer closeout에 필요한 수준으로 제한했다. `Button`과 `FilterChips`는 기존 emerald 계열을 `primary` 토큰으로 정리한 수준이고, `FilterChips`는 현재 product explorer에서만 사용된다. `ui/SegmentedTabs`는 기본 동작을 유지한 채 다중 인스턴스 안전을 위한 `layoutId`만 추가했다.
- snapshot 2건(`.data/finlife_deposit_snapshot.json`, `.data/finlife_saving_snapshot.json`)은 이번 batch에 포함하지 않기로 판단했다. 두 파일은 `generatedAt`만이 아니라 실제 item payload도 바뀌었고, deposit 11건 / saving 5건 상품 payload 변경이 확인돼 UI design-spec alignment와는 독립적인 데이터 갱신으로 봤다.
- 따라서 이번 closeout 범위는 UI + shared primitive + design spec 문서까지로 잠그고, snapshot churn은 commit 전에 별도 판단 또는 분리 staging이 필요하다고 남긴다.

## 검증
- 실행: `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
- 실행: `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-complete-checkpoint.md`
- 실행: `git branch --show-current`
- 실행: `git status --short`
- 실행: `git diff --stat -- src/components/ProductListPage.tsx src/components/products/ProductExplorerHeaderCard.tsx src/components/products/ProductOptionRowItem.tsx src/components/products/ProductResultsHeader.tsx src/components/products/ProviderChipCarousel.tsx src/components/products/SegmentedTabs.tsx src/components/ui/Button.tsx src/components/ui/FilterChips.tsx src/components/ui/SegmentedTabs.tsx docs/frontend-design-spec.md .data/finlife_deposit_snapshot.json .data/finlife_saving_snapshot.json`
- 실행: `git diff -- src/components/ProductListPage.tsx src/components/products/ProductExplorerHeaderCard.tsx src/components/products/ProductOptionRowItem.tsx src/components/products/ProductResultsHeader.tsx src/components/products/ProviderChipCarousel.tsx src/components/products/SegmentedTabs.tsx src/components/ui/Button.tsx src/components/ui/FilterChips.tsx src/components/ui/SegmentedTabs.tsx`
- 실행: `pnpm exec vitest run tests/deposit-integrated-query.test.ts tests/finlife-filters.test.ts tests/finlife-header-totals.test.ts tests/finlife-option-group.test.ts tests/finlife-option-group-openstate.test.ts tests/finlife-snapshot-policy.test.ts tests/finlife-ui-sort.test.ts tests/products-unified-route.test.ts`
- 실행: `pnpm exec eslint src/components/ProductListPage.tsx src/components/products/ProductExplorerHeaderCard.tsx src/components/products/ProductOptionRowItem.tsx src/components/products/ProductResultsHeader.tsx src/components/products/ProviderChipCarousel.tsx src/components/products/SegmentedTabs.tsx src/components/ui/Button.tsx src/components/ui/FilterChips.tsx src/components/ui/SegmentedTabs.tsx`
- 실행: `bash -lc "git show HEAD:.data/finlife_deposit_snapshot.json > /tmp/deposit-head.json && node -e 'const fs=require(\"fs\"); const head=JSON.parse(fs.readFileSync(\"/tmp/deposit-head.json\",\"utf8\")); const work=JSON.parse(fs.readFileSync(\".data/finlife_deposit_snapshot.json\",\"utf8\")); const get=(arr)=>new Map(arr.map((item)=>[item.fin_prdt_cd, JSON.stringify(item)])); const hm=get(head.items), wm=get(work.items); const changed=[]; for (const code of new Set([...hm.keys(),...wm.keys()])) { if (hm.get(code)!==wm.get(code)) changed.push(code); } console.log(JSON.stringify({file:\"deposit\",headCount:head.items.length,workCount:work.items.length,changedCount:changed.length,sample:changed.slice(0,5)},null,2));'"`
- 실행: `bash -lc "git show HEAD:.data/finlife_saving_snapshot.json > /tmp/saving-head.json && node -e 'const fs=require(\"fs\"); const head=JSON.parse(fs.readFileSync(\"/tmp/saving-head.json\",\"utf8\")); const work=JSON.parse(fs.readFileSync(\".data/finlife_saving_snapshot.json\",\"utf8\")); const get=(arr)=>new Map(arr.map((item)=>[item.fin_prdt_cd, JSON.stringify(item)])); const hm=get(head.items), wm=get(work.items); const changed=[]; for (const code of new Set([...hm.keys(),...wm.keys()])) { if (hm.get(code)!==wm.get(code)) changed.push(code); } console.log(JSON.stringify({file:\"saving\",headCount:head.items.length,workCount:work.items.length,changedCount:changed.length,sample:changed.slice(0,5)},null,2));'"`
- 실행: `pnpm build`
- 미실행: `pnpm exec vitest run tests/finlife-fixtures.test.ts tests/finlife-meta.test.ts`
- 미실행 이유: snapshot 2건을 이번 UI closeout 범위에서 분리하기로 판단해 추가 snapshot fixture/meta 검증은 생략했다.
- 미실행: `pnpm e2e:rc`
- 미실행 이유: 이번 라운드는 product explorer batch closeout의 정적/단위 검증과 build까지를 목표로 했고, route selector 흐름을 바꾸는 작업은 없었다.

## 남은 리스크
- 현재 worktree에는 snapshot 2건과 `GEMINI.md`, 기존 planning-v3 checkpoint note가 계속 dirty라서, commit 전에 staging 범위를 명확히 나누지 않으면 UI closeout commit에 unrelated 변경이 섞일 수 있다.
- `Button`의 `primary` 토큰 정리와 `ProductResultsHeader`의 문구 조정은 build/lint와 targeted vitest로는 확인됐지만, 실제 모바일/데스크톱 시각 검토는 별도 smoke가 없었다.
- snapshot 파일은 실제 payload가 바뀐 상태라서, 이후 별도 batch로 유지할지 폐기할지 판단 없이 함께 commit하면 design-spec alignment closeout의 근거가 흐려질 수 있다.

## 다음 라운드 우선순위
1. frontend product-explorer closeout commit 시 snapshot 2건을 분리 staging할지 먼저 결정한다.
2. 이번 closeout 범위는 UI + shared primitive + `docs/frontend-design-spec.md`까지로 잠근다.
3. planning-v3는 reopen 조건이 실제로 생기기 전까지 다시 열지 않는다.
