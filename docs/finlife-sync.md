# FINLIFE Sync

FINLIFE 동기화에는 파일 snapshot과 Prisma 상품 DB라는 두 저장 경로가 있습니다. 두 경로의 성공 의미를 같다고 가정하면 안 됩니다.

## 현재 저장소 소유권

| 경로 | kind 범위 | 쓰기 대상 | 성공 의미와 한계 |
| --- | --- | --- | --- |
| `runFinlifeSnapshotSync` | `deposit`, `saving` | `.data/finlife_<kind>_snapshot.json` | runtime snapshot만 갱신합니다. Prisma `Product`는 갱신하지 않으므로 이 성공만으로 unified 상품 query가 최신이라고 판단하지 않습니다. |
| `pnpm finlife:sync` | `deposit`, `saving`, `pension`, `mortgage-loan`, `rent-house-loan`, `credit-loan` | sync-attempt marker, Prisma `Provider`/`Product`/`ProductOption`, 이후 file snapshot | kind별 DB 반영과 snapshot 교체가 모두 끝나야 해당 kind를 완료로 봅니다. 여러 kind 전체는 하나의 transaction이 아닙니다. |
| `pnpm finlife:sync:if-stale` | 위 6개 kind | stale이거나 failed marker가 남은 kind에 대해 `finlife:sync` 실행 | failed marker는 fresh snapshot보다 우선해 재시도합니다. running marker는 정상 동기화와 겹치지 않도록 skip합니다. |
| unified FINLIFE query | `deposit`, `saving` | Prisma `Product` read | 사용자 상품 결과의 저장소입니다. `onlyNew` 기준 시각은 현재 file snapshot을 사용하므로 ownership 정렬이 후속 과제로 남아 있습니다. |
| unified source status | `deposit`, `saving` | file snapshot과 sync-attempt marker read | count/freshness는 snapshot 기준이지만 incomplete marker가 있으면 `isFresh=false`와 안전한 재실행 안내를 노출합니다. Prisma row 전체의 일치까지 증명하지는 않습니다. |

## kind별 persistence 계약

- upstream 수집이 실패하면 DB와 snapshot을 갱신하지 않고 non-zero로 종료합니다.
- persistence 시작 전에 `.data/finlife_<kind>_sync_attempt.json`을 atomic write합니다. process 중단이나 부분실패 시 marker를 남기고 성공한 뒤에만 제거합니다.
- DB 반영이 실패하면 새 snapshot으로 교체하지 않고 `phase=db` 오류와 `DB_SYNC_FAILED` marker를 남깁니다. DB 작업은 아직 전체 transaction이 아니므로 일부 row가 먼저 반영됐을 수 있으며 재실행이 필요합니다.
- DB 반영 뒤 snapshot 교체가 실패하면 `phase=snapshot` 오류와 `SNAPSHOT_WRITE_FAILED` marker를 남깁니다. 기존 snapshot 데이터는 유지하지만 marker가 stale 재시도와 `isFresh=false`를 강제합니다.
- runtime unified refresh는 incomplete marker가 있는 동안 snapshot을 덮어쓰지 않습니다.
- DB 반영, atomic snapshot 교체, marker 제거가 모두 끝난 뒤에만 해당 kind의 완료 로그를 출력합니다.
- process 중단으로 `running` marker가 남으면 `if-stale`는 동시 실행을 피하려고 자동 재시도하지 않습니다. 실제 sync process가 끝난 것을 확인한 뒤 `pnpm finlife:sync`를 수동 실행하면 marker를 갱신하고 복구할 수 있습니다.
- 앞선 kind가 완료된 뒤 다음 kind가 실패할 수 있습니다. `all` 실행은 kind 전체에 대한 all-or-nothing transaction이 아닙니다.
- hard cap으로 수집이 잘리면 기존 `completionRate`와 `truncatedByHardCap` 근거를 유지합니다. completion이 기준보다 낮은 snapshot은 다음 `if-stale` 실행에서 다시 수집 대상이 됩니다.

snapshot의 `generatedAt`은 upstream 수집 완료 시각이며 DB commit 시각이 아닙니다. 현재 unified `onlyNew`는 이 시각을 유지하므로 public query semantics는 바뀌지 않습니다.

`runFinlifeSnapshotSync`, unified query, source status를 같은 DB-backed 완료 증거로 완전히 정렬하는 작업은 별도 단계입니다. 그 전까지 runtime snapshot refresh 성공을 unified DB refresh 성공으로 해석하지 않습니다.

## 수동 동기화

```bash
pnpm finlife:sync
```

## stale일 때만 동기화

```bash
pnpm finlife:sync:if-stale
```

## 스케줄러 예시

### Windows Task Scheduler

- Program/script: `pnpm`
- Add arguments: `finlife:sync:if-stale`
- Start in: `<repo-path>`

### cron

```cron
0 */6 * * * cd <repo-path> && pnpm finlife:sync:if-stale
```

## 점검 포인트

- source=`mock`이면 실 API 실패 후 mock 폴백입니다.
- completionRate<0.95 또는 truncatedByHardCap=true면 완주 수집이 아닙니다.
- groupsScanned가 1개면 topFinGrpNo 범위가 좁습니다.
- 업권별 유효 그룹이 다르면 `FINLIFE_<KIND>_TOPFIN_GRP_LIST`가 공통 `FINLIFE_TOPFIN_GRP_LIST`보다 우선합니다.
- 연금저축은 공통 예적금 그룹과 달라서 별도 설정이 없으면 기본값 `050000,060000`을 사용합니다.

## 업권 프로빙

```bash
pnpm finlife:probe
```

출력된 `Recommended FINLIFE_TOPFIN_GRP_LIST=...`와 `Recommended FINLIFE_PENSION_TOPFIN_GRP_LIST=...` 값을 `.env.local`에 반영한 뒤 동기화하세요.

프로브는 기본적으로 그룹별 요청을 20초까지 기다리고, timeout/네트워크 오류/429/5xx 응답은 1회 재시도합니다. 운영 환경에서 업스트림 지연이 반복되면 아래 값을 조정합니다.

```env
FINLIFE_PROBE_TIMEOUT_MS=30000
FINLIFE_PROBE_RETRIES=2
```

후보 그룹을 좁혀 재확인할 때는 `FINLIFE_PROBE_GROUP_CANDIDATES=020000,050000,060000`처럼 쉼표로 지정합니다.
