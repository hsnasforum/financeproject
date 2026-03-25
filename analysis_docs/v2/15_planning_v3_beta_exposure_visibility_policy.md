# 15. planning/v3 beta exposure visibility policy

작성 기준: `N1 canonical entity model`, `N2 owner-based API/import-export/rollback contract`, `N3 QA gate and golden dataset`, 2026-03-19(KST)
범위: `planning/v3` route를 다음 사이클용 `public beta entry`, `public beta deep-link only`, `internal/experimental only`로 고정

현재 handoff 메모 (2026-03-25):
- `N3 planning/v3 QA gate / golden dataset`은 none-for-now closeout handoff 이후 내부 micro docs-first cut 기준으로는 현재 닫힌 상태다.
- 이 문서는 다음 공식 축 후보이지만, 곧바로 `N4` 구현을 시작했다는 뜻은 아니다. 먼저 current-state read / parked baseline 점검 기준으로 이어받는다.
- trigger-specific reopen이 없는 한, 다음 라운드의 초점은 broad visibility 구현이 아니라 현재 overlay wording과 parked baseline을 다시 읽는 것이다.

---

## 1. 목적

이 문서는 현재 존재하는 `planning/v3` route inventory를 다시 구현하지 않고,
다음 사이클에서 어떤 경로를 공개 베타 진입점으로 쓰고 어떤 경로를 숨겨 둘지
문서로 먼저 고정하기 위한 정책 문서입니다.

이번 문서의 목적은 아래 5가지입니다.

1. `planning/v3` route를 `public beta entry`, `public beta deep-link only`, `internal/experimental only` 세 그룹으로 다시 묶는다.
2. `docs/current-screens.md`의 현재 inventory와 next-cycle exposure policy를 분리한다.
3. `N3` gate tier를 route group별 노출 전제조건으로 연결한다.
4. 사용자에게 보여 줄 톤과 안내 수준을 route group별로 고정한다.
5. `N5 public/stable polish` 이전에는 `planning/v3`를 public stable처럼 다루지 않는 규칙을 잠근다.

비범위:

- route 구현 변경
- nav, 홈, 헤더 노출 변경
- `docs/current-screens.md` 수정
- 새 route, 새 gate, 새 DTO 정의

---

## 2. 입력 문서와 해석 규칙

### 2.1 입력 문서

- route inventory 기준:
  - `docs/current-screens.md`
  - `src/app/planning/v3/**/page.tsx` 읽기 전용 확인
- owner / contract 기준:
  - `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`
  - `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- gate 기준:
  - `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`

### 2.2 해석 규칙

- `docs/current-screens.md`는 현재 실존 route inventory다.
- 이 문서는 다음 사이클에서 어떤 route를 적극 노출할지 정하는 policy overlay다.
- 따라서 같은 `planning/v3` route가 current-screens에서는 `Public Beta`로 남아 있어도, 이 문서에서는 `deep-link only` 또는 `internal/experimental only`로 더 좁게 분류할 수 있다.
- route 분류는 path 이름이 아니라 `N2`의 owner family, bridge/support/internal 구분, 실제 page 역할을 함께 본다.
- 일부 route 분류는 현재 page 역할과 연결 링크를 바탕으로 한 정책 추론이다.

---

## 3. 공통 정책

### 3.1 public stable 비승격

- `planning/v3` 전체는 이번 단계에서 public stable로 승격하지 않는다.
- `N4`는 public beta 안에서의 노출 범위만 잠그며, stable 승격은 `N5` 이후 별도 라운드에서 다룬다.

### 3.2 entry 금지 규칙

- low-level batch/import/repair/support/internal 성격 route는 public beta entry로 직접 노출하지 않는다.
- raw owner write route, bridge route, support/internal route는 먼저 `deep-link only` 또는 `internal/experimental only`로 둔다.
- `N2`에서 export/rollback owner가 아니라고 정리된 projection/support route를 stable 계산식이나 stable onboarding entry처럼 소개하지 않는다.

### 3.3 current-screens와의 역할 분리

- `docs/current-screens.md`
  - 현재 존재하는 route와 broad class를 기록한다.
- 이 문서
  - 다음 사이클에서 어떤 route를 공개 베타 진입, 상세 진입, 내부 전용으로 다룰지 정한다.
- 둘이 충돌하는 것처럼 보이면:
  - current-screens는 "무엇이 존재하는가"
  - 이 문서는 "무엇을 링크/안내/온보딩 대상으로 삼을 것인가"로 해석한다.

---

## 4. visibility group

## 4.1 public beta entry

### 포함 route

| route | 분류 이유 |
| --- | --- |
| `/planning/v3/profile/drafts` | `DraftProfileRecord` 목록을 보여 주는 user-facing list다. draft owner를 직접 저장/삭제하더라도 path 자체가 raw import/support route는 아니다. |
| `/planning/v3/transactions` | 실제 구현은 `/planning/v3/transactions/batches`로 보내는 top-level beta entry alias다. 사용자 문서에서 더 설명하기 쉬운 상위 경로다. |
| `/planning/v3/transactions/batches` | 거래 배치 목록과 업로드 시작점을 한 화면에 묶은 beta flow 중심 경로다. raw `/planning/v3/import/csv`보다 user-facing entry로 설명 가능하다. |
| `/planning/v3/balances` | `Account`, `OpeningBalance`, `TransactionRecord`를 읽어 만든 projection surface다. 결과 비교 중심으로 설명하기 쉬워 공개 베타 entry 후보로 제한적으로 허용한다. |

### 연결된 N3 gate 전제조건

- 기본 tier는 `public beta`다.
- required baseline은 `pnpm build`, `pnpm lint`, `pnpm test`다.
- route/href/current-screens 분류가 실제로 바뀌는 구현 라운드에서는 `pnpm planning:current-screens:guard`를 conditional required로 붙인다.
- planning static guard surface까지 함께 바뀌는 구현 라운드에서만 `pnpm planning:ssot:check`를 conditional required로 붙인다.
- `balances`처럼 projection 성격이 강한 entry는 `N3`의 projection/regression fixture를 함께 본다.
- entry route는 `N2`에서 export/rollback owner가 아니라고 정리된 support/internal helper를 첫 진입 경로로 삼지 않는다.

### 사용자 화면 톤 / 안내 수준

- 쉬운 한국어로 `베타 미리보기`, `로컬 저장 데이터 기준`, `참고 비교용` 정도만 짧게 안내한다.
- 결과를 확정 답안이나 안정화 완료 기능처럼 소개하지 않는다.
- 첫 진입 문구는 "무엇을 할 수 있는지" 위주로 쓰고, owner/rollback/internal 같은 운영 용어는 전면에 내세우지 않는다.

## 4.2 public beta deep-link only

### 포함 route

| route | 분류 이유 |
| --- | --- |
| `/planning/v3/accounts` | `Account` / `OpeningBalance` write surface다. `balances` 화면에서 필요한 보조 설정 경로로는 유효하지만, top-level entry로 올리기에는 owner restore 단위가 아직 강하다. |
| `/planning/v3/profile/draft` | batch query를 받아 draft 생성으로 이어지는 bridge/helper 경로다. standalone entry보다 guided flow 안에서 여는 것이 맞다. |
| `/planning/v3/profile/drafts/[id]` | profile draft 상세 review 경로다. 목록이나 생성 흐름 뒤에서 들어가는 detail 성격이므로 direct entry보다 deep-link가 맞다. |
| `/planning/v3/profile/drafts/[id]/preflight` | `N2`에서 support/internal route로 정리된 preflight helper다. 공개는 가능해도 독립 entry로 승격하지 않는다. |
| `/planning/v3/transactions/batches/[id]` | `TransactionsBatchListClient` 뒤에서 여는 user-facing 거래 배치 상세/보정 화면이다. current inventory의 raw `/planning/v3/batches/[id]` summary route와는 다른 축의 deep-link detail로 읽는다. |

### 연결된 N3 gate 전제조건

- 기본 tier는 `public beta`다.
- required baseline은 `pnpm build`, `pnpm lint`, `pnpm test`다.
- detail/bridge/support route를 entry로 승격하려면 `N3` 6절 4항의 별도 가드 검토를 먼저 통과해야 한다.
- draft detail / preflight는 `tests/e2e/v3-draft-apply.spec.ts`와 relevant `tests/planning-v3-*` targeted set이 우선 blocker다.
- transaction batch detail은 `tests/e2e/flow-v3-import-to-cashflow.spec.ts`와 relevant `planning-v3-*Store/API` fixture가 우선 blocker다.
- route 분류나 deep-link 노출 범위가 실제로 바뀌는 구현 라운드에서는 `pnpm planning:current-screens:guard`를 conditional required로 붙인다.

### 사용자 화면 톤 / 안내 수준

- `상세 검토`, `다음 단계 전에 확인`, `이전 단계 데이터가 있어야 열립니다` 수준의 안내로 제한한다.
- direct entry보다 review/detail/helper라는 맥락을 앞에 둔다.
- preflight, apply, batch correction 같은 내부 용어는 설명 없이 전면 노출하지 않고, 필요할 때만 짧게 푼다.

## 4.3 internal/experimental only

### 포함 route

| route | 분류 이유 |
| --- | --- |
| `/planning/v3/start` | 로컬 산출물 존재 여부를 읽는 첫 실행 체크리스트다. 공개 베타 사용자 onboarding보다 운영/실험 점검 성격이 강하다. |
| `/planning/v3/batches` | `BatchesCenterClient`가 붙는 `ImportBatch` raw center route다. current inventory상 실존 route이지만, next-cycle overlay에서는 user-facing `/planning/v3/transactions/batches` entry와 분리되는 low-level batch owner/ops review surface로 읽는다. |
| `/planning/v3/batches/[id]` | `BatchSummaryClient`가 붙는 raw batch summary/detail route다. current inventory와 deep-link 존재를 부정하지 않지만, next-cycle overlay에서는 `/planning/v3/transactions/batches/[id]` user-facing detail보다 아래 레벨 summary/owner verification surface로 본다. |
| `/planning/v3/categories/rules` | rule/override tuning surface다. `N2`에서도 override precedence와 legacy bridge가 남아 있어 공개 entry로 과하다. |
| `/planning/v3/drafts` | legacy/raw draft owner family 경로다. `profile/drafts`보다 user-facing 의미가 약하고 route contract가 섞여 있다. |
| `/planning/v3/drafts/[id]` | raw draft detail 경로다. public beta detail보다 internal verification 성격이 강하다. |
| `/planning/v3/drafts/profile` | draft profile helper route다. canonical beta list/detail보다 내부 변환 경로에 가깝다. |
| `/planning/v3/exposure` | `ExposureProfile` singleton write surface다. `N2`에서 beta/internal 우선으로 정리된 config owner다. |
| `/planning/v3/import/csv` | low-level import route다. `transactions/batches`에 비해 직접 노출할 이유가 약하다. |
| `/planning/v3/journal` | `N2`에서 support/internal owner-adjacent route로 남긴 경로다. |
| `/planning/v3/news` | news projection/refresh 생태계의 entry다. config write, refresh, notes, alerts support route와 경계가 아직 두껍다. |
| `/planning/v3/news/alerts` | alert event/support artifact 성격이 강하다. |
| `/planning/v3/news/explore` | digest/search/trend projection helper다. 이번 사이클의 planning beta entry 범위를 넓히지 않기 위해 내부 전용으로 둔다. |
| `/planning/v3/news/settings` | singleton config write route다. `N2`에서 beta/internal 우선으로 정리됐다. |
| `/planning/v3/news/trends` | projection route지만 news config/write family와 같은 묶음으로 다루며, planning core beta entry와 분리한다. |
| `/planning/v3/scenarios` | scenario library override/config 성격이 강하다. |

### 연결된 N3 gate 전제조건

- 기본 tier는 `ops/dev` 또는 support/internal 검토다.
- public beta entry gate를 기본 전제조건으로 사용하지 않는다.
- public 노출 후보로 다시 올리려면 먼저 `N2` owner/export/rollback 경계와 bridge/support 분리를 다시 확인해야 한다.
- current-screens broad class와 실제 gate tier가 엇갈리면 `N3` 6절 5항에 따라 route policy와 gate tier를 함께 맞춘다.
- stable release gate(`pnpm e2e:rc`, `pnpm release:verify`)는 기본 required가 아니다.

### 사용자 화면 톤 / 안내 수준

- 사용자 문서, 헤더, 홈 바로가기에서 기본 노출하지 않는다.
- 내부 실험이나 제한된 검토가 필요할 때만 `실험 중`, `구성 필요`, `로컬 데이터 전용`, `직접 링크 비권장` 수준으로 안내한다.
- 일반 사용자에게는 기능 소개보다 제한 조건과 비노출 원칙이 먼저다.

메모:

- 여기의 `internal/experimental only`는 current-screens의 route 비존재, production 404, 즉시 숨김 적용을 뜻하지 않는다.
- current inventory상 실존하는 `Public Beta` route라도, next-cycle에서는 `public beta entry`나 기본 onboarding/link target으로 승격하지 않는 non-promoted overlay로 읽는다.
- 특히 `/planning/v3/news*`와 `/planning/v3/journal`은 current page 존재와 broad beta inventory를 부정하지 않고, next-cycle 노출 정책에서만 non-entry/internal-trial 쪽으로 더 좁혀 읽는다.

---

## 5. route coverage 요약

- current-screens 기준 `planning/v3` route 25개를 모두 위 세 그룹으로 덮었다.
- `public beta entry`: 4개
- `public beta deep-link only`: 5개
- `internal/experimental only`: 16개

### overlay alignment audit memo

- already aligned subset
  - `/planning/v3/transactions`는 현재 구현도 `/planning/v3/transactions/batches` redirect alias이므로, top-level beta entry alias라는 현재 문구와 실제 route surface가 맞는다.
  - `/planning/v3/balances`, `/planning/v3/profile/drafts`, `/planning/v3/transactions/batches`는 current page 역할과 `N2`/`N3` 문서의 projection/list 중심 beta entry 후보 기준이 크게 충돌하지 않는다.
  - `/planning/v3/batches*`, `/planning/v3/import/csv`, `/planning/v3/exposure`는 raw owner/config/write/support 성격을 먼저 본다는 current `N2`/`N3` 기준과 맞물려 `internal/experimental only` overlay가 자연스럽다.
  - `/planning/v3/news*`, `/planning/v3/journal`은 current-screens의 broad `Public Beta` inventory와 실존 page를 유지하더라도, "next-cycle에서는 기본 entry/onboarding target으로 삼지 않는다"는 overlay 해석이 분명히 붙으면 current route SSOT와 함께 읽을 수 있다.
- wording drift / `[검증 필요]` subset
  - `/planning/v3/batches*` vs `/planning/v3/transactions/batches*` 축은 current wording을 더 풀어써 "실존 raw batch center/summary route"와 "next-cycle user-facing batch list/detail overlay"를 분리해 적었다.
  - 남는 `[검증 필요]`는 current overlay 문구 충돌이라기보다, future implementation round에서도 이 raw center vs user-facing batch distinction을 nav/exposure 변경에 그대로 보존하는지 여부다. [검증 필요]
- SSOT readiness memo
  - current overlay는 `docs/current-screens.md`의 current inventory SSOT와 `analysis_docs/v2/14_planning_v3_qa_gate_and_golden_dataset.md`의 `public beta / ops-dev` gate tier 위에서 now-safe next-cycle policy overlay SSOT로 둘 수 있다.
  - future reopen trigger는 docs-only wording sync가 아니라, 실제 nav/홈/헤더 노출 변경, public beta entry/deep-link/internal group 변경, 또는 `/planning/v3/batches*`와 `/planning/v3/transactions/batches*` 역할을 다시 섞는 구현 라운드다.
  - current inventory 재확인만 하는 라운드나 docs-only 표현 보정만으로는 이 overlay SSOT를 다시 열지 않는다.

정리:

- next-cycle의 public beta 노출은 `profile draft list`, `transaction batch list`, `balance projection` 축으로 제한한다.
- detail/bridge/helper route는 public beta로 열더라도 `deep-link only`에서 멈춘다.
- raw batch/import/news/exposure/journal/rule tuning 계열은 이번 단계에서 internal/experimental로 유지한다.

---

## 6. 다음 구현 라운드로 넘기는 규칙

1. `planning/v3`를 public stable처럼 헤더, 홈, 공식 안내문에 올리지 않는다.
2. `/planning/v3/batches*`, `/planning/v3/import/csv`, `/planning/v3/categories/rules`, `/planning/v3/news/*`, `/planning/v3/exposure`, `/planning/v3/journal`은 public beta entry로 직접 노출하지 않는다.
3. `transactions`와 `profile/drafts` 축을 public beta entry로 유지하더라도, detail/helper route는 목록 또는 이전 단계에서만 진입시키는 것을 기본으로 한다.
4. `docs/current-screens.md`는 현재 inventory로 유지하고, 이 문서는 next-cycle policy overlay로만 참조한다.
5. stable 승격 판단과 public/stable polish는 `N5` 범위로 넘긴다.

---

## 7. 이번 단계 결론

- `planning/v3`의 next-cycle beta exposure는 넓은 public beta가 아니라 제한된 entry + deep-link + internal 분리로 잠근다.
- `current-screens`는 현행 inventory를 유지하고, `N4`는 다음 사이클 노출 정책만 별도로 고정한다.
- `planning/v3`는 아직 public stable이 아니며, raw batch/import/support route를 public entry로 올리지 않는다.
- current overlay는 route SSOT 및 `N3` gate matrix와 대체로 정합하며, `news/*`·`journal`은 "실존 route이지만 next-cycle non-entry overlay"로 읽는 한 SSOT로 유지 가능하다.
- `batches*` vs `transactions/batches*`는 "실존 raw center/summary route"와 "user-facing batch list/detail overlay"를 분리해 읽는 현재 문구로 정합성을 높였고, 남는 `[검증 필요]`는 future implementation round에서 이 distinction을 실제 노출 변경에도 유지하는지 여부다.
- 따라서 이 문서는 current inventory 구현 SSOT가 아니라, next-cycle 노출 정책을 park해 두는 policy overlay SSOT로 유지한다.
