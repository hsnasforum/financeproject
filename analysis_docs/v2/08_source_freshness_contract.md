# 08. Public source freshness contract 결정

작성 기준: 저장소 코드 정적 분석, 2026-03-16(KST)
범위: `P3-2 source freshness contract 표준화`

---

## 1. 목적

이 문서는 public 결과 카드에 붙일 최소 freshness 메타 contract를
코드 구현 전에 먼저 고정하기 위한 결정 문서입니다.

이번 라운드의 목표는 아래 4가지입니다.

1. public 결과 카드가 어떤 freshness 사실만 얇게 보여 줄지 정한다.
2. 각 필드의 canonical owner와 fallback 규칙을 정한다.
3. `/settings/data-sources` trust hub와 public 카드의 역할을 분리한다.
4. first rollout path 1개와 후속 순서를 작게 고정한다.

---

## 2. 현재 코드 기준 자산

## 2.1 기존 freshness 요약 자산

현재 freshness 사실을 계산하는 핵심 자산은 아래 두 층입니다.

- `src/lib/sources/types.ts`
  - `SourceStatusRow`
  - `lastSyncedAt`, `ttlMs`, `ageMs`, `isFresh`, `counts`, `lastError`
- `src/components/data/freshness.ts`
  - `FreshnessItemStatus = "ok" | "stale" | "error" | "empty"`
  - `summarizeFreshness(...)`
  - `FreshnessSummary.level = "ok" | "info" | "warn" | "error"`

해석:
- `SourceStatusRow`는 source freshness 사실 owner입니다.
- `FreshnessSummary.level`은 banner severity이므로 public 카드 메타에 그대로 쓰기에는 과합니다.
- card 메타에는 `FreshnessItemStatus` 수준의 얇은 상태가 더 적합합니다.

## 2.2 기존 UI surface

확인된 사실:
- `DataFreshnessBanner`는 `/api/sources/status`를 읽어 상단 배너를 렌더합니다.
- 최근 라운드에서 `/products/*`, `/recommend`, `/housing/subscription` 같은 사용자 화면에서는 운영성 배너를 제거하고 `/settings/data-sources`로 역할을 넘겼습니다.
- `/settings/data-sources`는 trust hub로 재구성되었고, 사용자 도움 연결 / 데이터별 최신 기준 / 공시 연결 상태 / 상세 운영 진단을 분리해 보여 줍니다.

결론:
- `P3-2`는 `DataFreshnessBanner` 재도입이 아닙니다.
- public 결과 카드에는 배너가 아니라 결과 맥락에 붙는 작은 freshness 메타만 붙이는 방향이 맞습니다.

## 2.3 surface별 현재 재사용 가능 값

### recommend

이미 가진 값:
- `item.sourceId`
- `item.kind`
- `result.meta.fallback`
- `result.meta.assumptions.*`

아직 없는 값:
- item 단위 `lastSyncedAt`
- card 전용 `freshnessStatus`

해석:
- `/recommend`는 `sourceId`, `kind` owner가 이미 카드 데이터 안에 있으므로 first rollout path로 가장 작습니다.
- `lastSyncedAt`와 `freshnessStatus`만 source status row와 매칭해서 읽으면 됩니다.

### products/deposit | products/saving

이미 가진 값:
- `kind`
- `payload.meta.snapshot.generatedAt`
- `payload.meta.note`
- `payload.meta.fallbackUsed`
- `payload.mode === "mock"`

아직 없는 값:
- row/card별 `sourceId`
- 현재 payload snapshot과 source status row를 연결하는 공통 card adapter

해석:
- page/header 수준 freshness 메타는 쉽지만, 결과 카드 표준화는 recommend보다 한 단계 더 큽니다.

### subscription

이미 가진 값:
- `json.data.assumptions.note`

아직 없는 값:
- public card owner `sourceId`
- `lastSyncedAt`
- fallback path 표준값

해석:
- `/housing/subscription`은 first rollout 대상보다 후순위가 맞습니다.

---

## 3. 최소 contract 결정

## 3.1 DTO shape

`[권장안]`

```ts
type PublicSourceFreshnessMetaDto = {
  sourceId: string;
  kind: string;
  lastSyncedAt: string | null;
  freshnessStatus: "ok" | "stale" | "error" | "empty";
  fallbackMode?: string | null;
  assumptionNotes?: string[];
};
```

원칙:
- 새 배너 severity를 만들지 않습니다.
- 운영 진단 raw payload를 통째로 복제하지 않습니다.
- public 카드에서 바로 읽을 최소 메타만 둡니다.

## 3.2 필드별 의미 / owner / fallback 규칙

| 필드 | required | 의미 | canonical owner | 현재 재사용 값 | fallback 규칙 | user-facing copy 수준 |
| --- | --- | --- | --- | --- | --- | --- |
| `sourceId` | Y | 현재 카드가 직접 기대는 primary source key | current surface payload owner | `item.sourceId`, 향후 surface adapter key | owner가 없으면 카드 메타를 만들지 않음 | source label 1개 또는 숨김 |
| `kind` | Y | source dataset kind | current surface payload owner | `item.kind`, product route kind | owner가 없으면 카드 메타를 만들지 않음 | label 노출보다는 내부 매칭 기준 |
| `lastSyncedAt` | Y(nullable) | 현재 결과 기준의 마지막 확인 시각 | payload snapshot timestamp 우선, 없으면 `SourceStatusRow.lastSyncedAt` | `payload.meta.snapshot.generatedAt`, `SourceStatusRow.lastSyncedAt` | 값이 없으면 `null` 유지, 임의 시각 생성 금지 | `기준 확인 2026-03-16 12:34` |
| `freshnessStatus` | Y | card-level freshness 상태 | `SourceStatusRow` → `FreshnessItemStatus` adapter | `isFresh`, `counts`, `lastError` + `summarizeItemStatus` 규칙 | row가 없으면 `empty` | `최신`, `기준 지남`, `최근 확인 실패`, `기준 정보 없음` |
| `fallbackMode` | N | payload가 explicit하게 알려 준 fallback 경로 | current surface payload meta | `result.meta.fallback.mode`, `payload.meta.fallbackUsed`, `payload.mode` | explicit 값이 없으면 생략 | `캐시 기준`, `재생 데이터 기준`, `예시 데이터 기준` |
| `assumptionNotes` | N | 현재 결과 해석에 꼭 필요한 note/policy | current surface payload meta | `assumptions.note`, `meta.note`, policy text | 기존 note가 없으면 생략 | 0~2줄 보조문장 |

### 3.3 `sourceId` namespace 결정

`[결정]`

- `sourceId`는 이번 단계에서 `string`으로 둡니다.
- 이유는 public surface마다 현재 owner key namespace가 아직 단일 enum으로 정규화되지 않았기 때문입니다.
- 다만 public 카드가 settings trust hub의 uppercase registry id를 그대로 노출해야 한다고 가정하지 않습니다.

실행 원칙:
- 현재 payload가 이미 가진 canonical key를 우선 사용합니다.
- settings registry id와 public payload key가 다른 surface는 surface adapter에서만 변환합니다.
- 이 namespace 정규화는 `P3-2` 완료 조건이 아니라 후속 표준화 후보입니다.

### 3.4 `freshnessStatus` 결정

`[결정]`

- public 카드에서는 `FreshnessSummary.level`이 아니라 `FreshnessItemStatus`를 재사용합니다.
- 이유는 `ok / info / warn / error`가 “화면 전체 배너 severity”에 가깝고, 카드 메타에는 `ok / stale / error / empty`가 더 직접적이기 때문입니다.

매핑 기준:
- `lastError.message`가 있으면 `error`
- `counts <= 0`이면 `empty`
- `isFresh === false`이면 `stale`
- 그 외는 `ok`

### 3.5 `fallbackMode` 결정

`[결정]`

- `fallbackMode`는 stale 상태만 보고 추론하지 않습니다.
- current payload meta가 explicit하게 경로를 알려 줄 때만 붙입니다.

허용 예:
- `CACHE`
- `REPLAY`
- `mock`

금지 예:
- `lastSyncedAt`가 오래됐다는 이유만으로 `CACHE`라고 표기
- `error`라는 이유만으로 fallback이 있었다고 가정

### 3.6 `assumptionNotes` 결정

`[결정]`

- `assumptionNotes`는 새 계산을 만들지 않고, 현재 surface가 이미 가진 note/policy 문구만 짧게 재사용합니다.
- public 카드에는 0~2줄 수준으로만 붙이고, 긴 원문/운영 메모는 settings trust hub나 상세 화면 owner로 둡니다.

허용 예:
- 추천 결과의 `depositProtectionPolicy`
- 상품 탐색의 `meta.note`
- 청약 공고의 `assumptions.note`

금지 예:
- freshness 계산을 다시 설명하는 새 문장 생성
- 운영자용 lastError 원문을 public 카드에 그대로 노출

---

## 4. public 카드와 settings trust hub 역할 분리

## 4.1 public 결과 카드

public 카드의 역할은 “짧은 읽기 포인트”에 제한합니다.

허용 범위:
- source 1개 기준
- 마지막 확인 시각 1줄
- freshness 상태 chip/helper 1개
- explicit fallbackMode 1개
- assumption note 0~2줄

금지 범위:
- 전체 source table
- TTL / age raw 숫자
- env key, API 경로
- dev ping / 수동 재확인 버튼
- full warning banner

## 4.2 settings trust hub

`/settings/data-sources`는 아래 owner를 계속 가집니다.

- source별 raw 최신 기준
- last error / count / TTL / age / 최근 연결 확인
- env/config 상태
- 개발 환경 상세 진단
- 운영 메모와 확장 후보

결론:
- public 카드 = 결과 해석용 짧은 메타
- settings trust hub = 상세 진단과 운영 기준

---

## 5. 권장 first rollout path

## 5.1 1순위: `/recommend` 결과 카드

`[권장안]`

이유:
- 이미 `item.sourceId`, `item.kind`를 가집니다.
- 결과 화면에 trust helper와 explanation 영역이 있어 작은 메타를 넣기 쉽습니다.
- `result.meta.fallback`, `result.meta.assumptions.*`를 이미 재사용할 수 있습니다.
- 운영 배너를 다시 열지 않고 card helper 수준으로 붙일 수 있습니다.

권장 owner 조합:
- `sourceId`: `item.sourceId`
- `kind`: `item.kind`
- `lastSyncedAt`: `(sourceId, kind)`에 매칭한 `SourceStatusRow.lastSyncedAt`
- `freshnessStatus`: 같은 row에서 계산한 `FreshnessItemStatus`
- `fallbackMode`: `result.meta.fallback.mode`
- `assumptionNotes`: `result.meta.assumptions.*` 중 현재 카드 해석에 직접 필요한 1~2개

## 5.2 2순위: `/products/deposit | /products/saving`

이유:
- page-level snapshot/generated 시각과 note는 이미 있습니다.
- 다만 card-level `sourceId` / adapter 정리가 먼저 필요하므로 recommend 다음 순서가 맞습니다.

권장 owner 조합:
- `sourceId`: `finlife`
- `kind`: route kind
- `lastSyncedAt`: `payload.meta.snapshot.generatedAt` 우선, 없으면 `SourceStatusRow.lastSyncedAt`
- `freshnessStatus`: `SourceStatusRow` 기준
- `fallbackMode`: `payload.mode`, `payload.meta.fallbackUsed`
- `assumptionNotes`: `payload.meta.note`

## 5.3 3순위: subscription / exchange / 공공 정보 카드

이유:
- source key namespace와 fallback owner가 아직 덜 정리돼 있습니다.
- first rollout 이후 표준 adapter를 보고 좁히는 편이 안전합니다.

---

## 6. 금지 규칙

1. `DataFreshnessBanner`를 public 결과 화면 상단에 다시 붙이지 않습니다.
2. 운영성 amber/red 배너를 card helper로 이름만 바꿔 재도입하지 않습니다.
3. stale 상태만 보고 fallbackMode를 추론하지 않습니다.
4. settings trust hub의 raw 진단 정보를 public 카드에 다시 복제하지 않습니다.
5. source key가 없는 surface에서 페이지 제목이나 route만 보고 `sourceId`를 임의 생성하지 않습니다.
6. 하나의 결과 카드에 여러 source를 억지로 다 넣지 않습니다. primary source 1개만 쓰고 나머지는 settings로 넘깁니다.

---

## 7. `P3-2` 구현 순서

### Step 1

`/recommend` 결과 카드에 `PublicSourceFreshnessMetaDto`를 read-only helper 수준으로 붙임

### Step 2

`/products/deposit | /products/saving` 결과 카드로 같은 contract를 확장

### Step 3

subscription / exchange / public info 카드에 source key adapter와 fallback owner가 정리된 뒤 같은 contract를 확대

---

## 8. 이번 라운드 결론

- `P3-2`는 운영 배너 재도입이 아니라 public 결과 카드용 최소 freshness 메타 contract를 고정하는 단계로 정의합니다.
- card-level freshness 상태는 `FreshnessItemStatus`를 재사용하고, settings trust hub는 상세 운영 owner로 남깁니다.
- `fallbackMode`와 `assumptionNotes`는 현재 payload가 이미 가진 값만 쓰고, 새 계산은 만들지 않습니다.
- first rollout path는 `/recommend` 결과 카드가 가장 작고 안전합니다.
- source key namespace 단일화는 아직 전 surface에서 끝나지 않았으므로 `P3-2`는 이번 라운드에서 `[진행중]`으로 두는 것이 맞습니다.
