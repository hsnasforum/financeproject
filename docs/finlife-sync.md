# FINLIFE Sync

FINLIFE 동기화에는 파일 snapshot과 Prisma 상품 DB라는 두 저장 경로가 있습니다. 두 경로의 성공 의미를 같다고 가정하면 안 됩니다.

## 현재 저장소 소유권

| 경로 | kind 범위 | 쓰기 대상 | 성공 의미와 한계 |
| --- | --- | --- | --- |
| `runFinlifeSnapshotSync` | `deposit`, `saving` | `.data/finlife_<kind>_snapshot.json` | runtime snapshot만 갱신합니다. Prisma `Product`는 갱신하지 않으므로 이 성공만으로 unified 상품 query가 최신이라고 판단하지 않습니다. |
| `pnpm finlife:sync` | `deposit`, `saving`, `pension`, `mortgage-loan`, `rent-house-loan`, `credit-loan` | sync-attempt marker, Prisma `Provider`/`Product`/`ProductOption`, DB 완료 증거, 이후 file snapshot | kind별 DB 반영과 snapshot 교체가 모두 끝나야 해당 kind를 완료로 봅니다. 여러 kind 전체는 하나의 transaction이 아닙니다. |
| `pnpm finlife:sync:if-stale` | 위 6개 kind | stale이거나 failed marker가 남은 kind에 대해 `finlife:sync` 실행 | failed marker는 fresh snapshot보다 우선해 재시도합니다. running marker는 정상 동기화와 겹치지 않도록 skip합니다. |
| unified FINLIFE query | `deposit`, `saving` | Prisma `Product` read, DB 완료 증거 read | 사용자 상품 결과의 저장소입니다. `onlyNew`는 완료된 DB sync 증거의 snapshot 수집 시각을 사용하고, 증거가 없는 기존 설치만 file snapshot으로 fallback합니다. |
| unified source status | `deposit`, `saving` | DB 완료 증거, file snapshot fallback, sync-attempt marker read | `complete` 증거의 freshness와 fetched item count를 사용하고 marker를 우선합니다. 증거가 없는 기존 설치는 file snapshot 기준으로 안전하게 fallback합니다. |

## kind별 persistence 계약

- upstream 수집이 실패하면 DB와 snapshot을 갱신하지 않고 non-zero로 종료합니다.
- persistence 시작 전에 `.data/finlife_<kind>_sync_attempt.json`을 atomic write합니다. process 중단이나 부분실패 시 marker를 남기고 성공한 뒤에만 제거합니다.
- DB 반영이 끝나면 기존 `ExternalSourceSnapshot`에 `sourceId=finlife`, 해당 kind, `evidenceType=finlife-prisma-product-sync`, `completionState=db-complete`인 중간 증거를 기록합니다. 이 단계는 기존 `lastSyncedAt`을 갱신하지 않으며 최초 row는 epoch 시각을 사용하므로 generic freshness reader가 전체 동기화 성공으로 오해하지 않습니다.
- DB 반영 또는 완료 증거 기록이 실패하면 새 snapshot으로 교체하지 않고 `phase=db` 오류와 `DB_SYNC_FAILED` marker를 남깁니다. DB 작업은 아직 전체 transaction이 아니므로 일부 row가 먼저 반영됐을 수 있으며 재실행이 필요합니다.
- DB 중간 증거 기록 뒤 snapshot 교체가 실패하면 `db-complete` 증거는 유지하고 `phase=snapshot` 오류와 `SNAPSHOT_WRITE_FAILED` marker를 남깁니다. 기존 snapshot 데이터는 유지하며 marker가 stale 재시도와 `isFresh=false`를 강제합니다.
- snapshot 교체 뒤 증거를 `completionState=complete`로 확정하고 그때만 `lastSyncedAt`을 갱신합니다. 이 최종 기록이 실패하면 `phase=completion`과 `COMPLETION_WRITE_FAILED` marker를 남겨 fresh 오표시를 막고 재실행 대상으로 유지합니다.
- runtime unified refresh는 incomplete marker가 있는 동안 snapshot을 덮어쓰지 않습니다.
- DB 반영, atomic snapshot 교체, marker 제거가 모두 끝난 뒤에만 해당 kind의 완료 로그를 출력합니다.
- process 중단으로 `running` marker가 남으면 `if-stale`는 동시 실행을 피하려고 자동 재시도하지 않습니다. 실제 sync process가 끝난 것을 확인한 뒤 `pnpm finlife:sync`를 수동 실행하면 marker를 갱신하고 복구할 수 있습니다.
- 앞선 kind가 완료된 뒤 다음 kind가 실패할 수 있습니다. `all` 실행은 kind 전체에 대한 all-or-nothing transaction이 아닙니다.
- hard cap으로 수집이 잘리면 기존 `completionRate`와 `truncatedByHardCap` 근거를 유지합니다. completion이 기준보다 낮은 snapshot은 다음 `if-stale` 실행에서 다시 수집 대상이 됩니다.

snapshot의 `generatedAt`은 upstream 수집 완료 시각이며 DB commit 시각이 아닙니다. unified `onlyNew`는 `completionState=complete` 증거에 보존된 `snapshotGeneratedAt`을 우선해 실제 Prisma `Product` 반영과 같은 실행을 기준으로 삼습니다. 완료 증거가 없거나 구형 증거에 해당 시각이 없으면 기존 file snapshot 시각으로 fallback합니다.

DB 완료 증거는 `dbCompletedAt`, `snapshotCompletedAt`, `lastRun.startedAt`/`finishedAt`, fetched/upserted 건수, live/replay provenance를 내부 `metaJson`에 보존합니다. replay file은 전체 경로가 아닌 basename만 기록합니다.

unified source status는 `completionState=complete`인 증거의 `lastSyncedAt`과 `lastRun.fetchedItems`를 사용합니다. `db-complete`, mock/fallback, 낮은 completion, hard-cap truncation, incomplete marker는 fresh로 표시하지 않습니다. `Product` sync는 현재 사라진 upstream 상품을 prune하지 않으므로 status count는 누적 DB inventory가 아니라 마지막 완료 sync가 수집한 item 수입니다. 증거가 아직 없거나 증거 테이블이 없는 기존 설치는 file snapshot 값으로 fallback하되 같은 provenance/completion 기준을 적용합니다. 그 밖의 DB 상태 확인 실패는 해당 FINLIFE row만 `isFresh=false`와 안전한 안내를 반환합니다. 상품 목록의 `기준 확인` 시각도 source status 완료 시각을 우선합니다. public 응답 shape와 cache 동작은 유지됩니다.

runtime snapshot refresh 성공은 여전히 unified DB refresh 성공이 아닙니다. 다만 완료 증거가 있는 설치에서는 이후 snapshot-only refresh가 status count와 `onlyNew` 기준을 전진시키지 않습니다.

## 동기화 진입점

- 운영 FINLIFE sync의 단일 진입점은 package script `pnpm finlife:sync`와 `pnpm finlife:sync:if-stale`입니다.
- 두 package script는 각각 `scripts/finlife_sync.mjs`, `scripts/finlife_sync_if_stale.mjs`를 실행합니다.
- `runFinlifeSnapshotSync`는 runtime snapshot refresh 내부 함수이며 CLI 완료 상태로 사용하지 않습니다.
- 별도 TypeScript sync script를 직접 실행하는 경로는 지원하지 않습니다. DB 반영 없는 snapshot-only 실행이 운영 sync 성공으로 오해되지 않도록 진입점을 추가하지 않습니다.

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
